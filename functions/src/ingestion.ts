import * as crypto from 'crypto';
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import matter from 'gray-matter';
import { ResourceDistillationService } from "./services/ResourceDistillationService";

export interface IngestionFile {
    id: string; // Drive ID (The Primary Key)
    name: string;
    path: string;
    saga?: string;
    parentId?: string;
    category?: 'canon' | 'reference';
    mimeType?: string;
}

export interface IngestionResult {
    status: 'processed' | 'skipped' | 'error';
    hash: string;
    chunksCreated: number;
    chunksDeleted: number;
}

// ============================================================================
// PIPELINE FASE 1: AST Parser (Zero Tokens)
// Extrae Frontmatter y Enlaces explícitos.
// ============================================================================
function parseAST(content: string) {
    let parsed;
    try {
        parsed = matter(content);
    } catch (e) {
        parsed = { data: {}, content: content };
    }
    const frontmatter = parsed.data;
    const body = parsed.content;
    
    const explicitLinks: string[] = [];
    const wikiLinkRegex = /\[\[(.*?)\]\]/g;
    const mdLinkRegex = /\[(.*?)\]\((.*?)\)/g;
    
    let match;
    while ((match = wikiLinkRegex.exec(body)) !== null) {
        explicitLinks.push(match[1]);
    }
    while ((match = mdLinkRegex.exec(body)) !== null) {
        explicitLinks.push(match[1]); // capturing the text part, or maybe the link part. match[1] is text.
    }

    return { frontmatter, body, explicitLinks };
}

// ============================================================================
// PIPELINE FASE 2: Motor de Diferencias (Semantic Delta)
// Compara con hashes de párrafos anteriores.
// ============================================================================
function computeSemanticDelta(newBody: string, previousHashes: Set<string>) {
    // Corte por párrafos semánticos (doble salto de línea)
    const paragraphs = newBody.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const newChunks = paragraphs.map((text, index) => {
        const hash = crypto.createHash('sha256').update(text).digest('hex');
        return { index, text, hash };
    });

    const deltaChunks = newChunks.filter(c => !previousHashes.has(c.hash));
    return { allChunks: newChunks, deltaChunks };
}

// ============================================================================
// PIPELINE FASE 3: Lexer (Alta Velocidad)
// Búsqueda determinista sin IA usando Aho-Corasick (O(n)).
// ============================================================================
const AhoCorasick = require('ahocorasick');

function lexerScan(text: string, entities: any[]) {
    const occurrences: Record<string, number> = {};
    const keywordMap: Record<string, string> = {};
    const keywords: string[] = [];

    for (const entity of entities) {
        const namesToMatch = [entity.name];
        if (Array.isArray(entity.attributes?.aliases)) {
            namesToMatch.push(...entity.attributes.aliases);
        }
        
        for (const name of namesToMatch) {
            if (!name) continue;
            const lowerName = name.toLowerCase();
            keywords.push(lowerName);
            keywordMap[lowerName] = entity.id; // Map name to entity ID
        }
    }

    if (keywords.length === 0) return occurrences;

    const ac = new AhoCorasick(keywords);
    const results = ac.search(text.toLowerCase());
    
    // results format: [ [endIndex, [matched_kw_1, ...]], ... ]
    for (const res of results) {
        const matches = res[1];
        for (const kw of matches) {
            const id = keywordMap[kw];
            if (id) {
                occurrences[id] = (occurrences[id] || 0) + 1;
            }
        }
    }
    
    return occurrences;
}

// ============================================================================
// PIPELINE FASE 4: AI Event Emitter (Batched)
// Prompt optimizado y particionado en lotes semánticos.
// ============================================================================
async function extractAIEvents(deltaText: string, model: any): Promise<any[]> {
    if (!deltaText || deltaText.trim().length === 0) return [];
    
    // División en Lotes (Batches) semánticos en lugar de truncado destructivo
    const MAX_CHUNK_LENGTH = 15000;
    const paragraphs = deltaText.split(/\n\s*\n/);
    const batches: string[] = [];
    let currentBatch = "";
    
    for (const p of paragraphs) {
        if ((currentBatch.length + p.length) > MAX_CHUNK_LENGTH && currentBatch.length > 0) {
            batches.push(currentBatch);
            currentBatch = "";
        }
        currentBatch += p + "\n\n";
    }
    if (currentBatch.trim().length > 0) {
        batches.push(currentBatch);
    }

    let allEvents: any[] = [];
    
    for (const batchText of batches) {
        const prompt = `
            ACT AS: Worldbuilding Graph Extractor.
            TASK: Analiza el siguiente fragmento de texto (un Delta nuevo de un manuscrito).
            Extrae ÚNICAMENTE Eventos narrativos o Relaciones entre entidades explícitas.
            
            REGLAS:
            1. Devuelve estrictamente un Array JSON en este formato:
               [
                 { "type": "EVENT" | "RELATION", "description": "Resumen corto", "entitiesInvolved": ["Nombre 1", "Nombre 2"], "conflict": false }
               ]
            2. No devuelvas markdown, solo el JSON.
            3. Si no hay eventos o relaciones claras, devuelve [].
            4. No inventes clases ni arquetipos enteros.

            TEXTO:
            """${batchText}"""
        `;

        try {
            if (model && model.generateContent) {
                 const result = await model.generateContent({
                     contents: [{ role: 'user', parts: [{ text: prompt }] }],
                 });
                 const rawText = result.response.text();
                 const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                 const events = JSON.parse(cleanJson);
                 
                 if (Array.isArray(events)) {
                     allEvents = allEvents.concat(events);
                 }
            }
        } catch (e) {
            logger.error("AI Event Extraction Failed for batch", e);
        }
    }
    
    return allEvents;
}

/**
 * CORE INGESTION LOGIC (ECS Hybrid Engine)
 */
export async function ingestFile(
    db: FirebaseFirestore.Firestore,
    userId: string,
    projectId: string, // Project Anchor
    file: IngestionFile,
    content: string,
    aiModel: any // En un futuro este sería el modelo generativo, no solo embeddings
): Promise<IngestionResult> {
    try {
        // 🟢 ID STRATEGY: DRIVE ID IS KING
        if (!file.id) {
            logger.error(`💥 [INGEST ERROR] File missing Drive ID: ${file.name}`);
            return { status: 'error', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        const docId = file.id; 
        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(docId);

        if (isFolder) {
            await fileRef.set({
                name: file.name, path: file.path, saga: file.saga || 'Global',
                parentId: file.parentId || null, category: file.category || 'canon',
                lastIndexed: new Date().toISOString(), updatedAt: new Date().toISOString(),
                driveId: file.id, mimeType: file.mimeType, type: 'folder'
            }, { merge: true });

            return { status: 'processed', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        if (!content || content.trim().length === 0) {
            return { status: 'skipped', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        const fileDoc = await fileRef.get();
        const storedHash = fileDoc.exists ? fileDoc.data()?.contentHash : null;

        if (storedHash === currentHash && fileDoc.exists) {
            logger.info(`⏩ [INGEST ECS] Hash Match for ${file.name}. Updating metadata only.`);
            await fileRef.set({ updatedAt: new Date().toISOString() }, { merge: true });
            return { status: 'skipped', hash: currentHash, chunksCreated: 0, chunksDeleted: 0 };
        }

        logger.info(`⚡ [INGEST ECS] Executing 4-Phase Pipeline for ${file.name}...`);

        // FASE 1: AST (Extracción Cero-Tokens)
        const ast = parseAST(content);

        // FASE 2: Semantic Delta
        const chunksRef = fileRef.collection("chunks");
        const existingChunksSnap = await chunksRef.get();
        const previousHashes = new Set<string>();
        existingChunksSnap.docs.forEach(d => previousHashes.add(d.data().hash));
        
        const deltaResult = computeSemanticDelta(ast.body, previousHashes);
        
        if (deltaResult.deltaChunks.length === 0 && fileDoc.exists) {
             logger.info(`⏩ [INGEST ECS] No semantic text changes. Updating AST meta only.`);
             await fileRef.set({ contentHash: currentHash, updatedAt: new Date().toISOString() }, { merge: true });
             return { status: 'skipped', hash: currentHash, chunksCreated: 0, chunksDeleted: 0 };
        }

        // FASE 3: Lexer (Alta velocidad, Ocurrencias)
        // Usamos la colección objetivo WorldEntities según la nueva arquitectura
        const entitiesSnap = await db.collection("users").doc(userId).collection("WorldEntities").get();
        const entities = entitiesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const combinedDeltaText = deltaResult.deltaChunks.map(c => c.text).join("\n\n");
        
        const occurrences = lexerScan(combinedDeltaText, entities);

        // FASE 4: AI Event Emitter
        // Solo enviamos el Delta a la IA para ahorrar tokens
        const events = await extractAIEvents(combinedDeltaText, aiModel);

        // ============================================================================
        // PIPELINE FASE 5: Upsert No Destructivo
        // ============================================================================
        const batch = db.batch();

        // 1. Recrear chunks en TDB_Index para futura comparación Delta
        existingChunksSnap.docs.forEach(doc => batch.delete(doc.ref));
        
        deltaResult.allChunks.forEach((chunk, i) => {
             const chunkRef = chunksRef.doc(`chunk_${i}`);
             batch.set(chunkRef, {
                 userId: userId, projectId: projectId, fileName: file.name, 
                 text: chunk.text, hash: chunk.hash, timestamp: new Date().toISOString()
             });
        });

        // 2. Actualizar metadatos del archivo
        batch.set(fileRef, {
             name: file.name, path: file.path, saga: file.saga || 'Global',
             driveId: file.id, parentId: file.parentId || null,
             lastIndexed: new Date().toISOString(), updatedAt: new Date().toISOString(),
             contentHash: currentHash, mimeType: file.mimeType || 'text/markdown',
             type: 'file', explicitLinks: ast.explicitLinks
        }, { merge: true });

        // 3. Fusión en WorldEntities (Aumento de Occurrences en el componente guardian)
        for (const [entityId, count] of Object.entries(occurrences)) {
            const entityRef = db.collection("users").doc(userId).collection("WorldEntities").doc(entityId);
            batch.set(entityRef, {
                guardian: { occurrences: FieldValue.increment(count) },
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        // 4. Inyección de Eventos de IA en las relaciones del Nexus
        for (const evt of events) {
            if (evt.entitiesInvolved && evt.entitiesInvolved.length >= 2) {
                const sourceName = evt.entitiesInvolved[0];
                const targetName = evt.entitiesInvolved[1];
                
                // Generar IDs deterministas basados en el nombre (slugification simple para coincidir con Soul Sorter)
                const sourceId = sourceName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
                const targetId = targetName.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');

                if (sourceId && targetId && sourceId !== targetId) {
                    const entityRef = db.collection("users").doc(userId).collection("WorldEntities").doc(sourceId);
                    
                    batch.set(entityRef, {
                        modules: {
                            nexus: {
                                relations: FieldValue.arrayUnion({
                                    targetId: targetId,
                                    targetName: targetName,
                                    relationType: evt.type === 'RELATION' ? 'CONNECTED' : 'EVENT_LINK',
                                    context: evt.description || "Relación extraída por IA durante ingesta",
                                    sourceFileId: file.id,
                                    discoveredAt: new Date().toISOString()
                                })
                            }
                        },
                        updatedAt: new Date().toISOString()
                    }, { merge: true });
                }
            }
        }

        await batch.commit();
        logger.info(`   ✨ [INGEST ECS] Indexed: ${file.name}. Emitted ${events.length} AI events.`);

        return {
            status: 'processed',
            hash: currentHash,
            chunksCreated: deltaResult.allChunks.length,
            chunksDeleted: existingChunksSnap.size
        };

    } catch (error: any) {
        logger.error(`💥 [INGEST ECS ERROR] Failed to ingest ${file.name}:`, error);
        return { status: 'error', hash: '', chunksCreated: 0, chunksDeleted: 0 };
    }
}

/**
 * DELETE VECTORS (The Eraser)
 * Removes all trace of a file from the index.
 */
export async function deleteFileVectors(
    db: FirebaseFirestore.Firestore,
    userId: string,
    fileId: string
): Promise<number> {
    try {
        const chunksQuery = db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("driveId", "==", fileId);

        const snapshot = await chunksQuery.get();
        let deletedCount = 0;

        if (!snapshot.empty) {
            let batch = db.batch();
            let count = 0;
            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                count++;
                deletedCount++;
                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();
        }

        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(fileId);
        await fileRef.delete();

        logger.info(`🗑️ [DELETE VECTORS] Cleared ${deletedCount} chunks and metadata for file ${fileId}`);
        return deletedCount;
    } catch (error) {
        logger.error(`💥 [DELETE VECTORS ERROR] Failed to delete vectors for ${fileId}:`, error);
        return 0;
    }
}