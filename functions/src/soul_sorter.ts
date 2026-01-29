import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import matter from 'gray-matter';
import { EntityTier, ForgePayload, SoulEntity } from "./types/forge";

// --- MULTI-ANCHOR HELPERS ---
const CONTAINER_KEYWORDS = ['lista', 'personajes', 'elenco', 'cast', 'notas', 'saga', 'entidades', 'roster', 'dramatis'];
const GENERIC_NAMES = ['nota', 'idea', 'fecha', 'todo', 'importante', 'ojo', 'personajes', 'saga', 'lista', 'introducción', 'capítulo', 'resumen', 'nombre', 'name', 'character', 'rol', 'role', 'descripción', 'description', 'titulo', 'title', 'anotaciones'];

function isContainerFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return CONTAINER_KEYWORDS.some(k => lower.includes(k));
}

function isGenericName(name: string): boolean {
    const lower = name.toLowerCase();
    // Exact match or very generic phrase
    return GENERIC_NAMES.some(g => lower === g) || name.length < 3 || name.length > 50;
}

function splitContentIntoBlocks(content: string): string[] {
    // Split by newline followed by bullet (- or *), or header (##)
    // Using Lookahead to keep the delimiter at the start of the next block
    return content.split(/\n(?=[\-\*]\s|##\s)/);
}

function extractNameFromBlock(text: string): string | null {
    const lines = text.split('\n').slice(0, 5);
    for (const line of lines) {
        const clean = line.trim();
        // H2 Header: "## Name"
        if (clean.startsWith('## ') && !clean.startsWith('###')) {
            return clean.replace(/^##\s*/, '').trim();
        }
        // Bullet with Bold: "- **Name**:" or "- **Name**"
        // Match "- **Name**" or "* **Name**"
        const boldMatch = clean.match(/^[\-\*]\s*\*\*(.+?)\*\*/);
        if (boldMatch && boldMatch[1]) {
             // Check if it ends with colon inside or outside
             let name = boldMatch[1].replace(/:$/, '').trim();
             return name;
        }

        // Simple Key-Value: "- Name: Desc"
        // Must start with Capital Letter
        const kvMatch = clean.match(/^[\-\*]\s*([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\s\.]+?):/);
        if (kvMatch && kvMatch[1]) {
            return kvMatch[1].trim();
        }
    }
    return null;
}

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_BATCH_CHARS = 100000; // 100k chars per AI call

interface SorterRequest {
    projectId: string;
    sagaId?: string; // Optional Scope (Used for Output Tagging)
}

interface DetectedEntity {
    name: string;
    tier: EntityTier;
    confidence: number;
    reasoning?: string;
    sourceFileId?: string;
    sourceFileName?: string;
    saga?: string;
    foundIn?: string[]; // Snippets or File Names
    rawContent?: string; // For Limbos: First few lines or raw content for AI
    role?: string;
    avatar?: string;
}

/**
 * THE SOUL SORTER
 * Triages entities into Ghosts, Limbos, and Anchors using Firestore Chunks + Heuristics + Gemini.
 */
export const classifyEntities = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 3600, // 60 minutes
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { projectId, sagaId } = request.data as SorterRequest;
        if (!projectId) throw new HttpsError("invalid-argument", "Falta projectId.");

        const uid = request.auth.uid;
        const db = getFirestore();

        logger.info(`👻 SOUL SORTER: Starting OMNISCIENT triage for User ${uid} (Target Vault: ${sagaId || 'Global'})`);

        try {
            // --- 0. INCREMENTAL SCAN CHECK ---
            // Fetch Project Config to get 'lastForgeScan'
            const configRef = db.collection("users").doc(uid).collection("profile").doc("project_config");
            const configSnap = await configRef.get();
            const configData = configSnap.exists ? configSnap.data() : {};
            const lastScanTime = configData?.lastForgeScan ? new Date(configData.lastForgeScan).getTime() : 0;

            // --- 1. FETCH CONTENT (SPECTRAL SWEEP) ---
            const filesRef = db.collection("TDB_Index").doc(uid).collection("files");
            // 🟢 OMNISCIENT INPUT: Scan ALL canon files, ignore folder boundaries.
            const q = filesRef.where("category", "==", "canon");

            const filesSnap = await q.get();
            if (filesSnap.empty) {
                return {
                    entities: [],
                    stats: { totalGhosts: 0, totalLimbos: 0, totalAnchors: 0 }
                } as ForgePayload;
            }

            // Fetch Chunk 0s
            const fileContents: { id: string, name: string, content: string, saga: string }[] = [];
            let skippedCount = 0;

            // Optimization: Parallel Fetch
            const fetchPromises = filesSnap.docs.map(async (doc) => {
                const fData = doc.data();

                // 🕵️ DEBUG: Trace Source Data
                if (fData.name) {
                     console.log(`[DEBUG_SCAN] File Found: ${fData.name} | DriveID: ${fData.driveId} | DocID: ${doc.id}`);
                }

                // 🟢 RESOURCE EXCLUSION (Safety Net)
                // If saga/path indicates Resources, skip it even if flagged as canon
                const sagaName = (fData.saga || "").toUpperCase();
                if (sagaName.includes("RECURSOS") || sagaName.includes("RESOURCES") || sagaName.includes("REFERENCE")) {
                    return null;
                }

                // 🟢 INCREMENTAL FILTER: Skip if file hasn't changed since last scan
                // Use 'lastIndexed' or 'updatedAt' from TDB_Index
                const fileTimeStr = fData.lastIndexed || fData.updatedAt;
                const fileTime = fileTimeStr ? new Date(fileTimeStr).getTime() : 0;

                // 🕵️ DEBUG: BYPASS INCREMENTAL SCAN (FORCE ALL)
                // if (lastScanTime > 0 && fileTime <= lastScanTime) {
                //    skippedCount++;
                //    return null; // Skip this file
                // }

                const chunkRef = doc.ref.collection("chunks").doc("chunk_0");
                const chunkSnap = await chunkRef.get();

                if (chunkSnap.exists) {
                    const text = chunkSnap.data()?.text || "";
                    if (text) {
                        return {
                            id: fData.driveId || doc.id,
                            name: fData.name,
                            content: text,
                            saga: fData.saga || 'Global'
                        };
                    }
                }
                return null;
            });

            const results = await Promise.all(fetchPromises);
            results.forEach(r => { if (r) fileContents.push(r); });

            logger.info(`   -> Scanned ${fileContents.length} new/modified files. (Skipped ${skippedCount} unchanged).`);

            if (fileContents.length === 0) {
                 logger.info("   -> No new content to analyze. Updating timestamp and exiting.");
                 // Update timestamp anyway to show we checked
                 await configRef.set({ lastForgeScan: new Date().toISOString() }, { merge: true });

                 return {
                    entities: [], // Frontend will keep showing existing snapshot
                    stats: { totalGhosts: 0, totalLimbos: 0, totalAnchors: 0 }
                 } as ForgePayload;
            }

            // --- 2. DENSITY ANALYSIS (HEURISTIC) ---
            const entitiesMap = new Map<string, DetectedEntity>();
            const narrativeBuffer: string[] = [];

            for (const file of fileContents) {
                let classified = false;

                // 🕵️ DEBUG ANCHOR
                console.log(`[DEBUG_ANCHOR_CHECK] Checking file: ${file.name} (Len: ${file.content.length})`);

                // --- 0. MULTI-SCAN CHECK (CONTAINER FILES) ---
                if (isContainerFile(file.name)) {
                     console.log(`[SOUL_SORTER] Multi-Scan triggered for: ${file.name}`);
                     const blocks = splitContentIntoBlocks(file.content);

                     for (const block of blocks) {
                         const rawName = extractNameFromBlock(block);
                         if (rawName) {
                             // Sanitize
                             const name = rawName.replace(/[:\*\-\_]+$/, '').trim();

                             if (!isGenericName(name)) {
                                 // 🟢 CLEANUP: Cut content before "Le gusta:", "Odia:", or next big section
                                 // to avoid bleeding into other descriptions if splitting was imperfect
                                 let cleanContent = block;
                                 const cutOffs = ['Le gusta:', 'Odia:', 'Gustos:', 'Disgustos:', '\n\n\n'];
                                 for (const cut of cutOffs) {
                                     if (cleanContent.includes(cut)) {
                                         cleanContent = cleanContent.split(cut)[0];
                                     }
                                 }

                                 // Add as LIMBO (Lists are Limbos, not full Anchors)
                                 entitiesMap.set(name.toLowerCase(), {
                                    name: name,
                                    tier: 'LIMBO',
                                    confidence: 85,
                                    reasoning: "Detección Multi-Scan (Lista)",
                                    sourceFileId: file.id,
                                    sourceFileName: file.name,
                                    saga: file.saga,
                                    foundIn: [file.name],
                                    rawContent: cleanContent.substring(0, 500) // Context for enrichment
                                });
                                // We don't mark 'classified = true' because we still want to scan
                                // the rest of the file for Ghosts or check if the file ITSELF is an Anchor (unlikely but possible)
                             }
                         }
                     }
                }

                // A. FRONTMATTER CHECK (Strong Anchor)
                try {
                    // Simple check for "---" at start
                    if (file.content.trim().startsWith('---')) {
                        console.log(`[DEBUG_ANCHOR_CHECK] Frontmatter detected in ${file.name}`);
                        const parsed = matter(file.content);
                        if (parsed.data.name || parsed.data.Nombre) {
                            const name = (parsed.data.name || parsed.data.Nombre).trim();
                            entitiesMap.set(name.toLowerCase(), {
                                name: name,
                                tier: 'ANCHOR',
                                confidence: 100,
                                reasoning: "Metadatos Detectados (Frontmatter)",
                                sourceFileId: file.id,
                                sourceFileName: file.name,
                                saga: file.saga,
                                foundIn: [file.name],
                                role: parsed.data.role || parsed.data.Role || parsed.data.cargo,
                                avatar: parsed.data.avatar || parsed.data.Avatar
                            });
                            classified = true;
                            console.log(`[DEBUG_ANCHOR_CHECK] Classified as ANCHOR via Frontmatter: ${file.name}`);
                        }
                    }
                } catch (e) { /* Ignore matter errors */ }

                // B. HEADER CHECK (Markdown Anchor)
                if (!classified) {
                    // Look for "# Name" or "Nombre: Name"
                    const lines = file.content.split('\n').slice(0, 10); // First 10 lines
                    for (const line of lines) {
                        const clean = line.trim();
                        // H1 Header that looks like a name (not "Intro", "Chapter 1")
                        if (clean.startsWith('# ') && !clean.includes('Capítulo') && !clean.includes('Chapter')) {
                            const name = clean.replace(/^#+\s*/, '').trim(); // Remove one or more #
                            console.log(`[DEBUG_ANCHOR_CHECK] Header Candidate: ${name} in ${file.name}`);
                            if (name.length > 2 && name.length < 50) {
                                entitiesMap.set(name.toLowerCase(), {
                                    name: name,
                                    tier: 'ANCHOR',
                                    confidence: 90,
                                    reasoning: "Encabezado Detectado",
                                    sourceFileId: file.id,
                                    sourceFileName: file.name,
                                    saga: file.saga,
                                    foundIn: [file.name]
                                });
                                classified = true;
                                console.log(`[DEBUG_ANCHOR_CHECK] Classified as ANCHOR via H1: ${file.name}`);
                                break;
                            }
                        }
                        // Key-Value "Name: X" (Enhanced Regex for **Bold**, Lists -, and "Nombre Completo")
                        // Matches: "Nombre:", "**Nombre**:", "- Nombre:", "- **Nombre Completo**:"
                        // 🟢 FIX: Explicitly allow bullet + bold pattern "- **Nombre...**:"

                        // Group 5 usually holds the value (Name) if it exists, BUT for "Nombre Completo: Megu",
                        // sometimes we want the key detection itself to trigger.
                        // Actually, the original logic extracted the VALUE (Megu) from the regex.
                        // Let's stick to the pattern: Key -> Value.

                        // If the line is "- **Nombre Completo:** Megu", we want to extract "Megu".
                        const keyMatch = clean.match(/^[\-\*\s]*(\*\*|)(Nombre|Name|Personaje|Character|Nombre Completo|Full Name)(\*\*|)[\*\s]*:\s*(.+)/i);

                        if (keyMatch && keyMatch[4]) {
                            let name = keyMatch[4].trim();
                            // Sanitize: Remove trailing and LEADING punctuation or markdown artifacts (like leftover **)
                            name = name.replace(/^[:\*\-\_]+/, '').replace(/[:\*\-\_]+$/, '').trim();

                            console.log(`[DEBUG_ANCHOR_CHECK] Key-Value Candidate: ${name} in ${file.name}`);
                            if (name.length > 2 && name.length < 50) {
                                entitiesMap.set(name.toLowerCase(), {
                                    name: name,
                                    tier: 'ANCHOR',
                                    confidence: 90,
                                    reasoning: "Definición Clave-Valor Detectada",
                                    sourceFileId: file.id,
                                    sourceFileName: file.name,
                                    saga: file.saga,
                                    foundIn: [file.name]
                                });
                                classified = true;
                                console.log(`[DEBUG_ANCHOR_CHECK] Classified as ANCHOR via Key-Value: ${file.name}`);
                                break;
                            }
                        }
                    }
                }

                // C. LIMBO CHECK (Filename + Content Heuristic)
                if (!classified) {
                    const lowerName = file.name.toLowerCase();
                    if (lowerName.includes('idea') || lowerName.includes('nota') || lowerName.includes('apunte') || lowerName.includes('draft')) {
                         // HEURISTIC: Try to find "Name:" pattern in this Limbo file
                         // Only check start of lines to avoid false positives in prose
                         const lines = file.content.split('\n').slice(0, 30);
                         let matchedName = null;

                         for (const line of lines) {
                             // Match "Name:" or "- Name:"
                             const match = line.match(/^[\-\s]*([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\s]+):/);
                             if (match && match[1]) {
                                 const name = match[1].trim();
                                 // Filter out common false positives like "Nota:", "Idea:", "Fecha:"
                                 const forbidden = ['nota', 'idea', 'fecha', 'todo', 'importante', 'ojo'];
                                 if (name.length > 2 && name.length < 30 && !forbidden.includes(name.toLowerCase())) {
                                     matchedName = name;
                                     break; // Take the first strong match
                                 }
                             }
                         }

                         // If no inner name found, use filename stem if it looks like a person name
                         // (This is weak, but better than missing it. Let's stick to inner name for high precision)
                         if (matchedName) {
                            entitiesMap.set(matchedName.toLowerCase(), {
                                name: matchedName,
                                tier: 'LIMBO',
                                confidence: 80,
                                reasoning: "Definición en Notas (Limbo)",
                                sourceFileId: file.id,
                                sourceFileName: file.name,
                                saga: file.saga,
                                foundIn: [file.name],
                                rawContent: file.content.substring(0, 500) // Keep snippet for AI enrichment
                            });
                         }
                    }
                }

                // D. NARRATIVE ACCUMULATION
                // We send EVERYTHING to AI to find Ghosts (names mentioned in narrative)
                // even if it's an Anchor file (it might mention OTHER characters).
                narrativeBuffer.push(`--- FILE: ${file.name} (Saga: ${file.saga}) ---\n${file.content}\n--- END ---\n`);
            }

            // --- 3. AI EXTRACTION (GHOST SWEEP) ---
            const fullText = narrativeBuffer.join('\n');
            const batches: string[] = [];

            // Chunking for AI Limit
            let currentBatch = "";
            fullText.split('\n').forEach(line => {
                if ((currentBatch.length + line.length) > MAX_BATCH_CHARS) {
                    batches.push(currentBatch);
                    currentBatch = "";
                }
                currentBatch += line + "\n";
            });
            if (currentBatch) batches.push(currentBatch);

            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: TEMP_PRECISION
                } as any
            });

            const extractionPrompt = `
            ACT AS: The Soul Sorter.
            TASK: Extract all CHARACTER NAMES from the narrative text.

            RULES:
            1. Extract Proper Names of People/Beings (e.g. "Thomas", "Megu").
            2. IGNORE Locations (Cities, Planets).
            3. IGNORE Objects (Swords, Ships).
            4. IGNORE Generic titles ("The King", "The Soldier") unless capitalized as a proper alias.

            OUTPUT JSON (Array):
            [
              { "name": "Name", "context": "Brief context snippet (max 10 words)" }
            ]
            `;

            for (const batchText of batches) {
                try {
                    const result = await model.generateContent([extractionPrompt, batchText]);
                    const extracted = parseSecureJSON(result.response.text(), "SoulSorterExtraction");

                    if (Array.isArray(extracted)) {
                        for (const item of extracted) {
                            if (!item.name) continue;
                            const key = item.name.toLowerCase().trim();
                            const existing = entitiesMap.get(key);

                            if (existing) {
                                // Already exists (Anchor or previous Ghost). Merge context.
                                if (!existing.foundIn) existing.foundIn = [];
                                // Avoid spamming foundIn
                                if (existing.foundIn.length < 5) existing.foundIn.push(item.context || "Mentioned");
                            } else {
                                // New GHOST
                                entitiesMap.set(key, {
                                    name: item.name,
                                    tier: 'GHOST',
                                    confidence: 50,
                                    reasoning: "Mención en Narrativa",
                                    saga: sagaId || 'Global', // Default to current scope
                                    foundIn: [item.context || "Mentioned"]
                                });
                            }
                        }
                    }
                } catch (err) {
                    logger.error("Soul Sorter Batch Error:", err);
                }
            }

            // --- 4. ENRICHMENT PHASE (The Transformer) ---
            // Prepare the Embeddings Model (Native SDK)
            const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

            // Iterate and Enrich
            // We convert Map to Array for processing
            const entityList = Array.from(entitiesMap.values());
            const enrichedEntities: SoulEntity[] = [];

            for (const entity of entityList) {
                const entityHash = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

                let sourceSnippet = (entity.foundIn && entity.foundIn.length > 0) ? entity.foundIn[0] : "Entidad detectada.";
                let role = entity.role;
                let avatar = entity.avatar;

                // A. ENRICH GHOSTS (Vector Search)
                if (entity.tier === 'GHOST') {
                    try {
                        const embeddingResult = await embeddingModel.embedContent({
                            content: { role: 'user', parts: [{ text: `Contexto y rol de ${entity.name}` }] },
                            taskType: TaskType.RETRIEVAL_QUERY
                        });
                        const queryVector = embeddingResult.embedding.values;

                        const chunksColl = db.collectionGroup("chunks");

                        // Vector Search
                        const vectorQuery = chunksColl.where("userId", "==", uid).findNearest({
                            queryVector: queryVector,
                            limit: 1,
                            distanceMeasure: 'COSINE',
                            vectorField: 'embedding'
                        });

                        const vectorSnap = await vectorQuery.get();
                        if (!vectorSnap.empty) {
                            const chunkData = vectorSnap.docs[0].data();
                            // Use snippet from chunk
                            const text = chunkData.text || "";
                            // Find name in text to crop around it
                            const idx = text.toLowerCase().indexOf(entity.name.toLowerCase());
                            if (idx !== -1) {
                                const start = Math.max(0, idx - 50);
                                const end = Math.min(text.length, idx + 150);
                                sourceSnippet = "..." + text.substring(start, end).replace(/\n/g, ' ') + "...";
                            } else {
                                sourceSnippet = text.substring(0, 150) + "...";
                            }
                        }
                    } catch (e) {
                        logger.warn(`Failed to enrich Ghost ${entity.name}:`, e);
                        // Keep default foundIn snippet
                    }
                }

                // B. ENRICH LIMBOS (Light AI)
                if (entity.tier === 'LIMBO' && entity.rawContent) {
                    try {
                        const limboModel = genAI.getGenerativeModel({ model: MODEL_LOW_COST });
                        const limboPrompt = `
                            Analyze this character note.
                            Extract:
                            1. A brief preview (max 100 chars).
                            2. Detected Traits (max 3 adjectives).

                            Content: "${entity.rawContent.substring(0, 500)}"

                            JSON Output: { "preview": "...", "traits": ["A", "B"] }
                        `;

                        const res = await limboModel.generateContent(limboPrompt);
                        const data = parseSecureJSON(res.response.text(), "LimboEnrichment");

                        if (data.preview) sourceSnippet = data.preview;
                        if (data.traits && Array.isArray(data.traits)) {
                             role = `Rasgos: ${data.traits.join(', ')}`;
                        }
                    } catch (e) {
                        logger.warn(`Failed to enrich Limbo ${entity.name}:`, e);
                    }
                }

                enrichedEntities.push({
                    id: entityHash,
                    name: entity.name,
                    tier: entity.tier,
                    sourceSnippet: sourceSnippet,
                    occurrences: (entity.foundIn?.length || 1) * (entity.tier === 'ANCHOR' ? 10 : 1), // Anchors weigh more
                    driveId: entity.sourceFileId,
                    role: role,
                    avatar: avatar
                });
            }

            // --- 5. PERSISTENCE (WRITE TO FIRESTORE CACHE) ---
            const detectionRef = db.collection("users").doc(uid).collection("forge_detected_entities");

            // 🟢 INCREMENTAL UPDATE STRATEGY: NO DELETES
            // We blindly upsert/merge found entities. Old entities remain (as requested).

            const BATCH_SIZE = 400;
            const setOperations: Promise<any>[] = [];

            let currentSetBatch = db.batch();
            let setCount = 0;

            enrichedEntities.forEach(e => {
                const ref = detectionRef.doc(e.id);

                // 🕵️ RASTREADOR KIKIMIGI
                console.log(`[DEBUG] Procesando: ${e.name}`);
                console.log(`[DEBUG] Raw driveId: ${e.driveId}`); // ¿Aquí dice undefined?
                console.log(`[DEBUG] Entity Dump:`, JSON.stringify(e));

                // 🟢 SANITIZE PAYLOAD (Fix for 'undefined' error)
                const safePayload: any = {
                    ...e,
                    role: e.role || null,
                    avatar: e.avatar || null,
                    driveId: e.driveId || null, // 🟢 Fix: Ensure driveId is never undefined
                    sourceSnippet: e.sourceSnippet || "No preview available",
                    mergeSuggestion: e.mergeSuggestion || null,
                    tags: e.tags || [],
                    saga: sagaId || 'Global',
                    lastDetected: new Date().toISOString(),
                    occurrences: FieldValue.increment(e.occurrences)
                };

                currentSetBatch.set(ref, safePayload, { merge: true });

                setCount++;
                if (setCount >= BATCH_SIZE) {
                    setOperations.push(currentSetBatch.commit());
                    currentSetBatch = db.batch();
                    setCount = 0;
                }
            });
            if (setCount > 0) setOperations.push(currentSetBatch.commit());

            await Promise.all(setOperations);

            // --- 6. UPDATE CONFIG TIMESTAMP ---
            await configRef.set({ lastForgeScan: new Date().toISOString() }, { merge: true });

            // --- 7. RETURN PAYLOAD ---
            // Sort by occurrences desc
            enrichedEntities.sort((a, b) => b.occurrences - a.occurrences);

            const payload: ForgePayload = {
                entities: enrichedEntities,
                stats: {
                    totalGhosts: enrichedEntities.filter(e => e.tier === 'GHOST').length,
                    totalLimbos: enrichedEntities.filter(e => e.tier === 'LIMBO').length,
                    totalAnchors: enrichedEntities.filter(e => e.tier === 'ANCHOR').length,
                }
            };

            return payload;

        } catch (error: any) {
            logger.error("Soul Sorter Failed:", error);
            // Robust Error Handling: Return Empty instead of 500
            return {
                entities: [],
                stats: { totalGhosts: 0, totalLimbos: 0, totalAnchors: 0 }
            } as ForgePayload;
        }
    }
);
