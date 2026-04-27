import '../admin'; // Ensure firebase-admin is initialized
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { Firestore } from "firebase-admin/firestore";
import { parseSecureJSON } from "../utils/json";
import { SoulEntity, DetectedEntity } from "../types/forge";
import pLimit from "p-limit";
import { smartGenerateContent } from "../utils/smart_generate";

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
        }
    }

    // B. ENRICH LIMBOS (Light AI)
    if (entity.tier === 'LIMBO' && entity.rawContent) {
        try {
            const limboPrompt = `
                Analyze this character note.
                1. DETECT LANGUAGE of the content (e.g. Spanish, English).
                2. Extract:
                   - A brief preview (max 100 chars) in the SAME LANGUAGE.
                   - Detected Traits (max 3 adjectives) in the SAME LANGUAGE.

                Content: "${entity.rawContent.substring(0, 500)}"

                JSON Output: { "preview": "...", "traits": ["A", "B"] }
            `;

            const result = await smartGenerateContent(genAI, limboPrompt, {
                useFlash: true,
                contextLabel: "LimboEnrichment",
                jsonMode: true
            });

            if (result.text) {
                const data = parseSecureJSON(result.text, "LimboEnrichment");
                if (data.preview) sourceSnippet = data.preview;
                if (data.traits && Array.isArray(data.traits)) {
                     role = `Rasgos: ${data.traits.join(', ')}`;
                }
            }
        } catch (e) {
            logger.warn(`Failed to enrich Limbo ${entity.name}:`, e);
        }
    }

    // C. ENRIQUECIMIENTO PSICOLÓGICO SPRINT 6.0
    if ((entity.category === 'PERSON' || entity.category === 'CREATURE') && (entity.rawContent || sourceSnippet)) {
        try {
            const psychologyExtractionPrompt = `
ACT AS: Literary Character Analyst (Truby/McKee methodology)
ENTITY: "${entity.name}" (${entity.category})
CONTENT: "${entity.rawContent?.substring(0, 2000) || sourceSnippet}"

Extrae las variables psicológicas de este personaje del texto disponible.
Si el texto no menciona algo, deja el campo vacío. NO inventes datos.

Responde SOLO con JSON:
{
  "summary": "Resumen de 2 oraciones del rol y función narrativa",
  "psychology": {
    "goal": "Objetivo consciente que persigue (si se menciona)",
    "fear": "Miedo central que lo limita (si se menciona o se infiere claramente)",
    "flaw": "Defecto moral o psicológico (si se menciona)",
    "lie": "La mentira que cree sobre el mundo o sobre sí mismo (si se infiere)",
    "wound": "Herida del pasado que lo define (si se menciona)",
    "need": "Lo que realmente necesita pero no busca conscientemente (si se infiere)"
  }
}

IMPORTANTE: Si el texto es fragmentario o no suficiente para inferir estos campos,
devuelve solo el summary y deja psychology con campos vacíos.
Mejor datos escasos y precisos que datos inventados.
`;

            const result = await smartGenerateContent(genAI, psychologyExtractionPrompt, {
                useFlash: true,
                contextLabel: "PsychologyEnrichment",
                jsonMode: true
            });

            if (result.text) {
                const enrichedData = parseSecureJSON(result.text, "PsychologyEnrichment");
                
                if (enrichedData.summary) {
                    sourceSnippet = enrichedData.summary;
                }

                if (enrichedData.psychology && Object.values(enrichedData.psychology).some(v => !!v)) {
                    const { EntityRepository } = await import('../repository/EntityRepository');
                    await EntityRepository.updatePsychology(uid, entityHash, enrichedData.psychology);
                    logger.info(`🧠 [FORJA] Psicología extraída para: ${entity.name}`);
                }
            }
        } catch (e) {
            logger.warn(`Failed to extract psychology for ${entity.name}:`, e);
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
