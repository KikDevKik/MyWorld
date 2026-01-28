import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import matter from 'gray-matter';

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_BATCH_CHARS = 100000; // 100k chars per AI call

interface SorterRequest {
    projectId: string;
    sagaId?: string; // Optional Scope
}

interface DetectedEntity {
    name: string;
    tier: 'ANCHOR' | 'LIMBO' | 'GHOST';
    confidence: number;
    reasoning?: string;
    sourceFileId?: string;
    sourceFileName?: string;
    saga?: string;
    foundIn?: string[]; // Snippets or File Names
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
        timeoutSeconds: 540, // 9 minutes
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { projectId, sagaId } = request.data as SorterRequest;
        if (!projectId) throw new HttpsError("invalid-argument", "Falta projectId.");

        const uid = request.auth.uid;
        const db = getFirestore();

        logger.info(`👻 SOUL SORTER: Starting triage for User ${uid} (Project: ${projectId}, Saga: ${sagaId || 'All'})`);

        try {
            // --- 1. FETCH CONTENT (SPECTRAL SWEEP) ---
            const filesRef = db.collection("TDB_Index").doc(uid).collection("files");
            let q = filesRef.where("category", "==", "canon");

            if (sagaId) {
                q = q.where("saga", "==", sagaId);
            }

            const filesSnap = await q.get();
            if (filesSnap.empty) {
                return { success: true, count: 0, message: "No canon files found." };
            }

            // Fetch Chunk 0s
            const fileContents: { id: string, name: string, content: string, saga: string }[] = [];

            // Optimization: Parallel Fetch
            const fetchPromises = filesSnap.docs.map(async (doc) => {
                const fData = doc.data();
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

            logger.info(`   -> Scanned ${fileContents.length} files.`);

            // --- 2. DENSITY ANALYSIS (HEURISTIC) ---
            const entitiesMap = new Map<string, DetectedEntity>();
            const narrativeBuffer: string[] = [];

            for (const file of fileContents) {
                let classified = false;

                // A. FRONTMATTER CHECK (Strong Anchor)
                try {
                    // Simple check for "---" at start
                    if (file.content.trim().startsWith('---')) {
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
                                foundIn: [file.name]
                            });
                            classified = true;
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
                            const name = clean.replace('#', '').trim();
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
                                break;
                            }
                        }
                        // Key-Value "Name: X"
                        if (clean.match(/^(Nombre|Name|Personaje|Character):\s*(.+)/i)) {
                            const match = clean.match(/^(Nombre|Name|Personaje|Character):\s*(.+)/i);
                            if (match && match[2]) {
                                const name = match[2].trim();
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
                         for (const line of lines) {
                             // Match "Name:" or "- Name:"
                             const match = line.match(/^[\-\s]*([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\s]+):/);
                             if (match && match[1]) {
                                 const name = match[1].trim();
                                 // Filter out common false positives like "Nota:", "Idea:", "Fecha:"
                                 const forbidden = ['nota', 'idea', 'fecha', 'todo', 'importante', 'ojo'];
                                 if (name.length > 2 && name.length < 30 && !forbidden.includes(name.toLowerCase())) {
                                     entitiesMap.set(name.toLowerCase(), {
                                        name: name,
                                        tier: 'LIMBO',
                                        confidence: 80,
                                        reasoning: "Definición en Notas (Limbo)",
                                        sourceFileId: file.id,
                                        sourceFileName: file.name,
                                        saga: file.saga,
                                        foundIn: [file.name]
                                     });
                                 }
                             }
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

            // --- 4. PERSISTENCE (WRITE TO FIRESTORE) ---
            const detectionRef = db.collection("users").doc(uid).collection("forge_detected_entities");

            // Step A: Delete Old
            let deleteQ = detectionRef as FirebaseFirestore.Query;
            if (sagaId) deleteQ = deleteQ.where("saga", "==", sagaId);

            const oldDocs = await deleteQ.get();

            // 🟢 ROBUST BATCH LOGIC
             const chunks = Array.from(entitiesMap.values());
             const BATCH_SIZE = 400;
             // First, execute the deletes we queued?
             // Actually, mixing deletes and sets in chunks is tricky if we reuse the batch variable name.
             // Let's do Deletes First, then Sets.

             // 1. DELETE
             if (!oldDocs.empty) {
                 const deleteBatches = [];
                 let currentDelBatch = db.batch();
                 let delCount = 0;

                 oldDocs.forEach(d => {
                     currentDelBatch.delete(d.ref);
                     delCount++;
                     if (delCount >= 400) {
                         deleteBatches.push(currentDelBatch.commit());
                         currentDelBatch = db.batch();
                         delCount = 0;
                     }
                 });
                 if (delCount > 0) deleteBatches.push(currentDelBatch.commit());
                 await Promise.all(deleteBatches);
             }

             // 2. SET
             const setBatches = [];
             let currentSetBatch = db.batch();
             let setCount = 0;

             chunks.forEach(entity => {
                const docId = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const docRef = detectionRef.doc(docId);
                currentSetBatch.set(docRef, {
                    ...entity,
                    lastDetected: new Date().toISOString()
                });
                setCount++;
                if (setCount >= 400) {
                    setBatches.push(currentSetBatch.commit());
                    currentSetBatch = db.batch();
                    setCount = 0;
                }
             });
             if (setCount > 0) setBatches.push(currentSetBatch.commit());
             await Promise.all(setBatches);

            return { success: true, count: entitiesMap.size };

        } catch (error: any) {
            logger.error("Soul Sorter Failed:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
