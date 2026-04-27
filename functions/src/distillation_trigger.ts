import './admin';
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";
import { FUNCTIONS_REGION } from "./config";
import { MODEL_FLASH_2_5 } from "./ai_config";
import * as logger from "firebase-functions/logger";
import { _getDriveFileContentInternal } from "./utils/drive";
import { getAIKey } from "./utils/security";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

/**
 * TRIGGER: DISTILL RESOURCE ON GRAPH ENTRY
 * Listens to WorldEntities. If a document is 'pending' and is a 'RESOURCE', 
 * it fetches the content from Drive and distills it.
 */
export const distillResourceOnIndex = onDocumentWritten(
    {
        document: "users/{userId}/WorldEntities/{entityId}",
        region: FUNCTIONS_REGION,
        secrets: [googleApiKey],
        timeoutSeconds: 300,
        memory: "1GiB",
    },
    async (event) => {
        const afterData = event.data?.after?.data();
        
        // condition: exists, category RESOURCE, status pending, not yet distilled
        if (!afterData || afterData.category !== 'RESOURCE' || afterData.status !== 'pending' || afterData.distilledAt) {
            return;
        }
        
        const { userId, entityId } = event.params;
        const db = getFirestore();
        const driveFileId = afterData.driveFileId || entityId;
        const accessToken = (afterData as any).accessToken;

        if (!accessToken) {
            logger.warn(`⚠️ [DISTILL] No accessToken found for ${afterData.name} (${entityId}). Cannot fetch content.`);
            return;
        }

        logger.info(`🧪 [DISTILL TRIGGER] Processing WorldEntity resource: ${afterData.name}`);

        try {
            // Setup Drive
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. Fetch Content
            const content = await _getDriveFileContentInternal(drive, driveFileId);
            if (!content || content.length < 10) {
                logger.warn(`[DISTILL] Empty content for ${afterData.name}`);
                return;
            }

            // 2. Call Gemini (Using saved BYOK)
            const byok = (afterData as any).byok;
            const genAI = new GoogleGenerativeAI(getAIKey({ _authOverride: byok }, googleApiKey.value()));
            const model = genAI.getGenerativeModel({ model: MODEL_FLASH_2_5 });

            const prompt = `
                ACT AS: Archivista de Conocimiento y Analista.
                TASK: Analiza este recurso de inspiración titulado "${afterData.name}".
                Extrae su esencia narrativa o conceptual para un sistema de Worldbuilding.

                REGLAS:
                1. Devuelve estrictamente un objeto JSON:
                   {
                     "name": "Nombre corto (máx 5 palabras)",
                     "summary": "Resumen de 1-2 párrafos",
                     "tags": ["Tag1", "Tag2"],
                     "smartTags": ["LORE", "VISUAL", "CIENCIA", "INSPIRACIÓN", "AUDIO", "OTROS"]
                   }
                2. Solo JSON bruto.

                TEXTO:
                """
                ${content.substring(0, 15000)}
                """
            `;

            const result = await model.generateContent(prompt);
            const raw = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            const distillation = JSON.parse(raw);

            // 3. Update Document: Status ACTIVE, add distillation, REMOVE accessToken & byok
            await event.data?.after?.ref.update({
                name: distillation.name || afterData.name,
                status: 'active',
                modules: {
                    forge: {
                        summary: distillation.summary || "Sin resumen.",
                        tags: distillation.tags || [],
                        smartTags: distillation.smartTags || ['INSPIRACIÓN']
                    }
                },
                distilledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                accessToken: FieldValue.delete(), // 🛡️ Security: Wipe tokens
                byok: FieldValue.delete()
            });

            logger.info(`✅ [DISTILL TRIGGER] Resource distilled and activated: ${distillation.name}`);

        } catch (error: any) {
            logger.error(`💥 [DISTILL TRIGGER] Failed for ${entityId}:`, error);
            // Optionally mark as failed in DB
            await event.data?.after?.ref.update({
                status: 'failed',
                error: error.message,
                accessToken: FieldValue.delete(),
                byok: FieldValue.delete()
            }).catch(() => {});
        }
    }
);
