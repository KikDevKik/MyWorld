import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { Firestore } from "firebase-admin/firestore";
import { MODEL_LOW_COST, SAFETY_SETTINGS_PERMISSIVE } from "../ai_config";
import { parseSecureJSON } from "../utils/json";
import { SoulEntity, DetectedEntity, EntityCategory } from "../types/forge";
import pLimit = require("p-limit"); // Use CommonJS require for v3 compatibility in TS if needed, or allow synthetic default import.
// Actually, p-limit v3 exports a default function. 'import pLimit from "p-limit"' usually works if esModuleInterop is on.
// Given tsconfig usually has esModuleInterop, I will stick to standard import.
// However, since I just downgraded to v3, let's verify if I need "import pLimit = require('p-limit')".
// p-limit v3 is CommonJS exporting a function directly: module.exports = ...
// So `import pLimit from 'p-limit'` works if `esModuleInterop` is true.
// I'll stick to `import pLimit from 'p-limit'` but if build fails I'll switch.

// Helper for retries
async function withRetry<T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await operation();
    } catch (err: any) {
        // Retry on 429 (Too Many Requests) or 503 (Service Unavailable)
        if (retries > 0 && (err.status === 429 || err.status === 503 || err.message?.includes('429'))) {
            logger.warn(`Retrying AI operation... attempts left: ${retries}`);
            await new Promise(res => setTimeout(res, delay));
            return withRetry(operation, retries - 1, delay * 2);
        }
        throw err;
    }
}

export async function enrichEntity(
    entity: DetectedEntity,
    uid: string,
    genAI: GoogleGenerativeAI,
    db: Firestore,
    sagaId?: string
): Promise<SoulEntity> {
    const entityHash = entity.name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    let sourceSnippet = (entity.foundIn && entity.foundIn.length > 0) ? entity.foundIn[0] : "Entidad detectada.";
    let role = entity.role;
    let avatar = entity.avatar;

    // A. ENRICH GHOSTS (Vector Search)
    if (entity.tier === 'GHOST') {
        try {
            const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

            // Wrap in Retry
            const embeddingResult = await withRetry(() => embeddingModel.embedContent({
                content: { role: 'user', parts: [{ text: `Contexto y rol de ${entity.name}` }] },
                taskType: TaskType.RETRIEVAL_QUERY
            }));

            const queryVector = embeddingResult.embedding.values;
            const chunksColl = db.collectionGroup("chunks");

            // Vector Search (Firestore logic doesn't need retry usually, but we could wrap it if needed.
            // Firestore SDK has built-in retries for some errors, but not all. Let's keep it simple.)
            const vectorQuery = chunksColl.where("userId", "==", uid).findNearest({
                queryVector: queryVector,
                limit: 1,
                distanceMeasure: 'COSINE',
                vectorField: 'embedding'
            });

            const vectorSnap = await vectorQuery.get();
            if (!vectorSnap.empty) {
                const chunkData = vectorSnap.docs[0].data();
                const text = chunkData.text || "";
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
            const limboModel = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE
            });
            const limboPrompt = `
                Analyze this character note.
                1. DETECT LANGUAGE of the content (e.g. Spanish, English).
                2. Extract:
                   - A brief preview (max 100 chars) in the SAME LANGUAGE.
                   - Detected Traits (max 3 adjectives) in the SAME LANGUAGE.

                Content: "${entity.rawContent.substring(0, 500)}"

                JSON Output: { "preview": "...", "traits": ["A", "B"] }
            `;

            // Wrap in Retry
            const res = await withRetry(() => limboModel.generateContent(limboPrompt));
            const data = parseSecureJSON(res.response.text(), "LimboEnrichment");

            if (data.preview) sourceSnippet = data.preview;
            if (data.traits && Array.isArray(data.traits)) {
                 role = `Rasgos: ${data.traits.join(', ')}`;
            }
        } catch (e) {
            logger.warn(`Failed to enrich Limbo ${entity.name}:`, e);
        }
    }

    return {
        id: entityHash,
        name: entity.name,
        tier: entity.tier,
        category: entity.category || 'PERSON',
        sourceSnippet: sourceSnippet,
        occurrences: (entity.foundIn?.length || 1) * (entity.tier === 'ANCHOR' ? 10 : 1), // Anchors weigh more
        driveId: entity.sourceFileId,
        role: role,
        avatar: avatar
    };
}

export async function enrichEntitiesParallel(
    entities: DetectedEntity[],
    uid: string,
    genAI: GoogleGenerativeAI,
    db: Firestore,
    sagaId?: string,
    concurrency = 5
): Promise<SoulEntity[]> {
    const limit = pLimit(concurrency);
    const promises = entities.map(entity => limit(() => enrichEntity(entity, uid, genAI, db, sagaId)));
    return Promise.all(promises);
}
