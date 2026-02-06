import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import matter from 'gray-matter';
import { EntityTier, EntityCategory, ForgePayload, SoulEntity, DetectedEntity } from "./types/forge";
import { enrichEntitiesParallel } from "./services/enrichment";

// --- MULTI-ANCHOR HELPERS ---
const CONTAINER_KEYWORDS = ['lista', 'personajes', 'elenco', 'cast', 'notas', 'saga', 'entidades', 'roster', 'dramatis'];
const GENERIC_NAMES = ['nota', 'idea', 'fecha', 'todo', 'importante', 'ojo', 'personajes', 'saga', 'lista', 'introducción', 'capítulo', 'resumen', 'nombre', 'name', 'character', 'rol', 'role', 'descripción', 'description', 'titulo', 'title', 'anotaciones', 'lugar', 'lugares', 'objeto', 'objetos'];

// 🟢 EXPANDED KEYS FOR CLASSIFICATION
const CHARACTER_KEYS = ['rol', 'role', 'edad', 'age', 'raza', 'race', 'clase', 'class', 'genero', 'gender', 'alias', 'apodo', 'level', 'nivel', 'species', 'especie', 'ocupación', 'occupation', 'faction', 'facción', 'group', 'grupo', 'appears in', 'aparece en', 'birthday', 'cumpleaños'];
const CREATURE_KEYS = ['habitat', 'dieta', 'diet', 'comportamiento', 'behavior', 'loot', 'drop', 'tameable', 'domable', 'species', 'especie', 'type', 'tipo', 'danger', 'peligro'];
const LOCATION_KEYS = ['población', 'population', 'clima', 'climate', 'ubicación', 'location', 'región', 'region', 'habitantes', 'inhabitants', 'capital', 'gobierno', 'government', 'terrain', 'terreno'];
const OBJECT_KEYS = ['peso', 'weight', 'valor', 'value', 'daño', 'damage', 'rareza', 'rarity', 'material', 'efecto', 'effect', 'tipo', 'type'];

export function isContainerFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return CONTAINER_KEYWORDS.some(k => lower.includes(k));
}

export function isGenericName(name: string): boolean {
    const lower = name.toLowerCase();
    // Exact match or very generic phrase
    return GENERIC_NAMES.some(g => lower === g) || name.length < 3 || name.length > 50;
}

// 🟢 IMPROVED: Detect Category by Keys
export function detectCategoryByMetadata(content: string): EntityCategory | null {
    const lines = content.split('\n').slice(0, 30);

    // Helper to check regex against lines
    const checkKeys = (keys: string[]) => {
        return keys.some(key => {
            const regex = new RegExp(`^[\\s\\-\\*]*(\\*\\*)?${key}(\\*\\*)?:`, 'i');
            return lines.some(line => regex.test(line));
        });
    };

    if (checkKeys(CHARACTER_KEYS)) return 'PERSON';
    if (checkKeys(CREATURE_KEYS)) return 'CREATURE';
    if (checkKeys(LOCATION_KEYS)) return 'LOCATION';
    if (checkKeys(OBJECT_KEYS)) return 'OBJECT';

    return null;
}

function splitContentIntoBlocks(content: string): string[] {
    return content.split(/\n(?=[\-\*]\s|##\s)/);
}

function extractNameFromBlock(text: string): string | null {
    const lines = text.split('\n').slice(0, 5);
    for (const line of lines) {
        const clean = line.trim();
        if (clean.startsWith('## ') && !clean.startsWith('###')) {
            return clean.replace(/^##\s*/, '').trim();
        }
        const boldMatch = clean.match(/^[\-\*]\s*\*\*(.+?)\*\*/);
        if (boldMatch && boldMatch[1]) {
             let name = boldMatch[1].replace(/:$/, '').trim();
             return name;
        }
        const kvMatch = clean.match(/^[\-\*]\s*([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\s\.]+?):/);
        if (kvMatch && kvMatch[1]) {
            return kvMatch[1].trim();
        }
    }
    return null;
}

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_BATCH_CHARS = 75000;

// 🟢 RETRY HELPER
async function generateWithRetry(model: GenerativeModel, prompt: any[], retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            return await model.generateContent(prompt);
        } catch (e: any) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
    throw new Error("Retry failed");
}

export interface FileContent {
    id: string;
    name: string;
    content: string;
    saga: string;
}

interface SorterRequest {
    projectId: string;
    sagaId?: string;
}

// 🟢 EXPORTED LOGIC FOR TESTING
export async function identifyEntities(
    files: FileContent[],
    aiModel: GenerativeModel,
    sagaId?: string
): Promise<Map<string, DetectedEntity>> {

    const entitiesMap = new Map<string, DetectedEntity>();
    const narrativeBuffer: string[] = [];
    const knownNames = new Set<string>();

    for (const file of files) {
        let classified = false;

        // --- 0. MULTI-SCAN CHECK (CONTAINER FILES) ---
        if (isContainerFile(file.name)) {
             const blocks = splitContentIntoBlocks(file.content);
             for (const block of blocks) {
                 const rawName = extractNameFromBlock(block);
                 if (rawName) {
                     const name = rawName.replace(/[:\*\-\_]+$/, '').trim();
                     if (!isGenericName(name)) {
                         let cleanContent = block;
                         const cutOffs = ['Le gusta:', 'Odia:', 'Gustos:', 'Disgustos:', '\n\n\n'];
                         for (const cut of cutOffs) {
                             if (cleanContent.includes(cut)) cleanContent = cleanContent.split(cut)[0];
                         }

                         entitiesMap.set(name.toLowerCase(), {
                            name: name,
                            tier: 'LIMBO',
                            confidence: 85,
                            reasoning: "Detección Multi-Scan (Lista)",
                            sourceFileId: file.id,
                            sourceFileName: file.name,
                            saga: file.saga,
                            foundIn: [file.name],
                            rawContent: cleanContent.substring(0, 500)
                        });
                        knownNames.add(name);
                     }
                 }
             }
        }

        // A. FRONTMATTER CHECK (Strong Anchor)
        try {
            if (file.content.trim().startsWith('---')) {
                const parsed = matter(file.content);
                // Check name
                const name = (parsed.data.name || parsed.data.Nombre || "").trim();

                // Check category from frontmatter 'type' or 'category'
                let category: EntityCategory = 'PERSON'; // Default
                const typeRaw = (parsed.data.type || parsed.data.category || "").toLowerCase();

                if (typeRaw.includes('creature') || typeRaw.includes('bestiary') || typeRaw.includes('beast')) category = 'CREATURE';
                else if (typeRaw.includes('flora') || typeRaw.includes('plant')) category = 'FLORA';
                else if (typeRaw.includes('location') || typeRaw.includes('place') || typeRaw.includes('lugar')) category = 'LOCATION';
                else if (typeRaw.includes('object') || typeRaw.includes('item')) category = 'OBJECT';

                if (name) {
                    entitiesMap.set(name.toLowerCase(), {
                        name: name,
                        tier: 'ANCHOR',
                        category: category,
                        confidence: 100,
                        reasoning: "Metadatos Detectados (Frontmatter)",
                        sourceFileId: file.id,
                        sourceFileName: file.name,
                        saga: file.saga,
                        foundIn: [file.name],
                        role: parsed.data.role || parsed.data.Role || parsed.data.cargo,
                        avatar: parsed.data.avatar || parsed.data.Avatar
                    });
                    knownNames.add(name);
                    classified = true;
                }
            }
        } catch (e) { /* Ignore */ }

        // B. HEADER CHECK (Markdown Anchor)
        if (!classified) {
            const lines = file.content.split('\n').slice(0, 10);
            for (const line of lines) {
                const clean = line.trim();
                // H1 Header
                if (clean.startsWith('# ') && !clean.includes('Capítulo') && !clean.includes('Chapter')) {
                    const name = clean.replace(/^#+\s*/, '').trim();
                    const detectedCat = detectCategoryByMetadata(file.content);

                    // 🟢 STRICT: Must have Metadata keys to be an Anchor
                    if (name.length > 2 && name.length < 50 && detectedCat) {
                        entitiesMap.set(name.toLowerCase(), {
                            name: name,
                            tier: 'ANCHOR',
                            category: detectedCat, // 🟢 Use detected category
                            confidence: 90,
                            reasoning: `Encabezado + Metadatos (${detectedCat})`,
                            sourceFileId: file.id,
                            sourceFileName: file.name,
                            saga: file.saga,
                            foundIn: [file.name]
                        });
                        knownNames.add(name);
                        classified = true;
                        break;
                    }
                }

                // Key-Value "Name: X"
                const keyMatch = clean.match(/^[\-\*\s]*(\*\*|)(Nombre|Name|Personaje|Character|Nombre Completo|Full Name)(\*\*|)[\*\s]*:\s*(.+)/i);
                if (keyMatch && keyMatch[4]) {
                    let name = keyMatch[4].trim();
                    name = name.replace(/^[:\*\-\_]+/, '').replace(/[:\*\-\_]+$/, '').trim();

                    if (name.length > 2 && name.length < 50) {
                        entitiesMap.set(name.toLowerCase(), {
                            name: name,
                            tier: 'ANCHOR',
                            category: 'PERSON', // Key "Nombre/Name" usually implies Person
                            confidence: 90,
                            reasoning: "Definición Clave-Valor Detectada",
                            sourceFileId: file.id,
                            sourceFileName: file.name,
                            saga: file.saga,
                            foundIn: [file.name]
                        });
                        knownNames.add(name);
                        classified = true;
                        break;
                    }
                }
            }
        }

        // C. LIMBO CHECK
        if (!classified) {
            const lowerName = file.name.toLowerCase();
            if (lowerName.includes('idea') || lowerName.includes('nota') || lowerName.includes('apunte') || lowerName.includes('draft')) {
                 const lines = file.content.split('\n').slice(0, 30);
                 let matchedName = null;
                 for (const line of lines) {
                     const match = line.match(/^[\-\s]*([A-ZÁÉÍÓÚÑ][a-zA-Z0-9\s]+):/);
                     if (match && match[1]) {
                         const name = match[1].trim();
                         const forbidden = ['nota', 'idea', 'fecha', 'todo', 'importante', 'ojo'];
                         if (name.length > 2 && name.length < 30 && !forbidden.includes(name.toLowerCase())) {
                             matchedName = name;
                             break;
                         }
                     }
                 }
                 if (matchedName) {
                    entitiesMap.set(matchedName.toLowerCase(), {
                        name: matchedName,
                        tier: 'LIMBO',
                        category: 'PERSON', // Limbos default to Person usually
                        confidence: 80,
                        reasoning: "Definición en Notas (Limbo)",
                        sourceFileId: file.id,
                        sourceFileName: file.name,
                        saga: file.saga,
                        foundIn: [file.name],
                        rawContent: file.content.substring(0, 500)
                    });
                    knownNames.add(matchedName);
                 }
            }
        }

        // D. NARRATIVE ACCUMULATION
        let cleanContent = file.content;
        try {
            const parsed = matter(file.content);
            cleanContent = parsed.content;
        } catch (e) { /* Fallback */ }
        narrativeBuffer.push(`--- FILE: ${file.name} (Saga: ${file.saga}) ---\n${cleanContent}\n--- END ---\n`);
    }

    // --- 3. AI EXTRACTION (GHOST SWEEP) ---
    const fullText = narrativeBuffer.join('\n');
    const batches: string[] = [];
    const knownEntitiesList = Array.from(knownNames).join(", ");

    let currentBatch = "";
    fullText.split('\n').forEach(line => {
        if ((currentBatch.length + line.length) > MAX_BATCH_CHARS) {
            batches.push(currentBatch);
            currentBatch = "";
        }
        currentBatch += line + "\n";
    });
    if (currentBatch) batches.push(currentBatch);

    const extractionPrompt = `
    ACT AS: The Soul Sorter.
    TASK: Extract all ENTITY NAMES (Characters, Creatures, Flora, Locations, Important Objects) from the narrative text.

    KNOWN ENTITIES: [${knownEntitiesList}]

    RULES:
    1. Extract Proper Names of People/Beings (e.g. "Thomas", "Megu") -> Category: 'PERSON'.
    2. Extract Names of MYTHICAL CREATURES or SPECIAL FAUNA (e.g. "Baku-fante", "Shadow Wolf") -> Category: 'CREATURE'.
    3. Extract Names of SPECIAL FLORA (e.g. "Moon Flower") -> Category: 'FLORA'.
    4. Extract Names of IMPORTANT LOCATIONS (Cities, Kingdoms, Planets) -> Category: 'LOCATION'.
    5. Extract Names of LEGENDARY/MAGIC OBJECTS (Swords, Artifacts) -> Category: 'OBJECT'.

    6. DEDUPLICATION: Use known names if possible.
    7. STRICT CLASSIFICATION: Do not label a Place as a Person.

    OUTPUT JSON (Array):
    [
      {
        "name": "Name",
        "category": "PERSON" | "CREATURE" | "FLORA" | "LOCATION" | "OBJECT",
        "context": "Brief context snippet (max 10 words)"
      }
    ]
    `;

    for (const batchText of batches) {
        try {
            const result = await generateWithRetry(aiModel, [extractionPrompt, batchText]);
            const extracted = parseSecureJSON(result.response.text(), "SoulSorterExtraction");

            if (Array.isArray(extracted)) {
                for (const item of extracted) {
                    if (!item.name) continue;
                    const key = item.name.toLowerCase().trim();
                    const existing = entitiesMap.get(key);

                    if (existing) {
                        if (!existing.foundIn) existing.foundIn = [];
                        if (existing.foundIn.length < 5) existing.foundIn.push(item.context || "Mentioned");

                        // 🟢 CATEGORY CORRECTION: If AI sees it's a Location, and we had it undefined, update.
                        // But trust Anchor data (Tier: ANCHOR) over Ghost guess.
                        if (!existing.category && item.category) {
                            existing.category = item.category as EntityCategory;
                        }
                    } else {
                        entitiesMap.set(key, {
                            name: item.name,
                            tier: 'GHOST',
                            category: (item.category as EntityCategory) || 'PERSON',
                            confidence: 50,
                            reasoning: "Mención en Narrativa",
                            saga: sagaId || 'Global',
                            foundIn: [item.context || "Mentioned"]
                        });
                    }
                }
            }
        } catch (err) {
            logger.error("Soul Sorter Batch Error:", err);
        }
    }

    return entitiesMap;
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
        memory: "4GiB",
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
            const configRef = db.collection("users").doc(uid).collection("profile").doc("project_config");
            const configSnap = await configRef.get();
            const configData = configSnap.exists ? configSnap.data() : {};
            const lastScanTime = configData?.lastForgeScan ? new Date(configData.lastForgeScan).getTime() : 0;

            // --- 1. FETCH CONTENT ---
            const filesRef = db.collection("TDB_Index").doc(uid).collection("files");
            const q = filesRef.where("category", "==", "canon");
            const filesSnap = await q.get();

            const fileContents: FileContent[] = [];
            let skippedCount = 0;

            const fetchPromises = filesSnap.docs.map(async (doc) => {
                const fData = doc.data();
                const sagaName = (fData.saga || "").toUpperCase();
                if (sagaName.includes("RECURSOS") || sagaName.includes("RESOURCES") || sagaName.includes("REFERENCE")) {
                    return null;
                }

                // Incremental Logic could go here

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

            logger.info(`   -> Scanned ${fileContents.length} new/modified files.`);

            if (fileContents.length === 0) {
                 await configRef.set({ lastForgeScan: new Date().toISOString() }, { merge: true });
                 return {
                    entities: [],
                    stats: { totalGhosts: 0, totalLimbos: 0, totalAnchors: 0 }
                 } as ForgePayload;
            }

            // --- 2. IDENTIFY ENTITIES (Logic) ---
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: TEMP_PRECISION
                } as any
            });

            const entitiesMap = await identifyEntities(fileContents, model, sagaId);

            // --- 3. ENRICHMENT PHASE ---
            const entityList = Array.from(entitiesMap.values());
            const enrichedEntities = await enrichEntitiesParallel(
                entityList,
                uid,
                genAI,
                db,
                sagaId,
                5
            );

            // --- 4. PERSISTENCE ---
            const detectionRef = db.collection("users").doc(uid).collection("forge_detected_entities");
            const charactersRef = db.collection("users").doc(uid).collection("characters"); // 🟢 REFERENCE FOR HEALING

            const BATCH_SIZE = 200; // Reduced to prevent exceeding 500 ops limit (2 ops per entity)
            const setOperations: Promise<any>[] = [];
            let currentSetBatch = db.batch();
            let setCount = 0;

            enrichedEntities.forEach(e => {
                // A. SAVE TO DETECTED ENTITIES (Radar)
                const ref = detectionRef.doc(e.id);

                const safePayload: any = {
                    ...e,
                    role: e.role || null,
                    avatar: e.avatar || null,
                    driveId: e.driveId || null,
                    category: e.category || 'PERSON',
                    sourceSnippet: e.sourceSnippet || "No preview available",
                    mergeSuggestion: e.mergeSuggestion || null,
                    tags: e.tags || [],
                    saga: sagaId || 'Global',
                    lastDetected: new Date().toISOString(),
                    occurrences: FieldValue.increment(e.occurrences)
                };

                currentSetBatch.set(ref, safePayload, { merge: true });

                // 🟢 B. AUTO-HEALING (Sync Anchors to Roster)
                // If the entity is a confirmed ANCHOR (found in file), ensure it is registered/healed in 'characters'.
                // This prevents "Broken Link" errors by proactively setting the masterFileId.
                if (e.tier === 'ANCHOR' && e.driveId) {
                    const charRef = charactersRef.doc(e.id);
                    currentSetBatch.set(charRef, {
                        masterFileId: e.driveId,
                        lastRelinked: new Date().toISOString(), // Mark as recently validated
                        sourceContext: sagaId || 'Global',
                        status: 'EXISTING',
                        sourceType: 'MASTER',
                        name: e.name, // Ensure name is sync
                        category: e.category || 'PERSON',
                        tier: 'ANCHOR', // Explicitly set tier
                        isAIEnriched: true
                    }, { merge: true });
                }

                setCount++;
                if (setCount >= BATCH_SIZE) {
                    setOperations.push(currentSetBatch.commit());
                    currentSetBatch = db.batch();
                    setCount = 0;
                }
            });
            if (setCount > 0) setOperations.push(currentSetBatch.commit());
            await Promise.all(setOperations);

            // --- 5. FINALIZE ---
            await configRef.set({ lastForgeScan: new Date().toISOString() }, { merge: true });
            enrichedEntities.sort((a, b) => b.occurrences - a.occurrences);

            return {
                entities: enrichedEntities,
                stats: {
                    totalGhosts: enrichedEntities.filter(e => e.tier === 'GHOST').length,
                    totalLimbos: enrichedEntities.filter(e => e.tier === 'LIMBO').length,
                    totalAnchors: enrichedEntities.filter(e => e.tier === 'ANCHOR').length,
                }
            } as ForgePayload;

        } catch (error: any) {
            logger.error("Soul Sorter Failed:", error);
            return {
                entities: [],
                stats: { totalGhosts: 0, totalLimbos: 0, totalAnchors: 0 }
            } as ForgePayload;
        }
    }
);
