import './admin';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";
import { FUNCTIONS_REGION, ALLOWED_ORIGINS } from "./config";
import * as logger from "firebase-functions/logger";
import { _getDriveFileContentInternal } from "./utils/drive";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";
import { getAIKey, escapePromptVariable } from "./utils/security";

// IMPORTANTE: Manejo de BYOK (Bring Your Own Key) para Gemini
const googleApiKeySecret = defineSecret("GOOGLE_API_KEY");

export const distillResource = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKeySecret],
        timeoutSeconds: 120,
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { entityId, accessToken } = request.data;
        if (!accessToken) throw new HttpsError("invalid-argument", "AccessToken requerido.");
        if (!entityId) throw new HttpsError("invalid-argument", "EntityId requerido.");

        const userId = request.auth.uid;
        const db = getFirestore();

        const entityRef = db
            .collection("users").doc(userId)
            .collection("WorldEntities").doc(entityId);

        const existing = await entityRef.get();
        if (!existing.exists) {
            throw new HttpsError("not-found", "Recurso no encontrado en WorldEntities.");
        }

        const data = existing.data()!;
        const driveFileId = data.driveFileId;
        if (!driveFileId) {
            throw new HttpsError("failed-precondition", "La entidad no tiene un DriveID válido.");
        }

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        let content = "";
        try {
            content = await _getDriveFileContentInternal(drive, driveFileId);
        } catch (e: any) {
            logger.error(`[DISTILL] Error leyendo drive para ${driveFileId}:`, e);
            await entityRef.set({ status: 'failed', errorMessage: e.message || 'Error descargando archivo' }, { merge: true });
            throw new HttpsError("internal", "No se pudo leer el archivo físico de Drive.");
        }

        if (!content || content.length < 50) {
            await entityRef.set({ status: 'ignored', note: 'Contenido demasiado corto o inaccesible' }, { merge: true });
            return { success: true, message: "Archivo ignorado por falta de contenido sustancial." };
        }

        // 🟢 [KAISEN] Lector Superficial (Trunking)
        // Recortamos a 3000 caracteres para evitar saturación de tokens sensibles 
        // y evadir heurísticas de censura por acumulación.
        const MAX_DISTILL_LENGTH = 3000;
        const safeContent = content.length > MAX_DISTILL_LENGTH 
            ? content.substring(0, MAX_DISTILL_LENGTH) + "\n\n[TEXTO RECORTADO PARA ANÁLISIS ESTRUCTURAL]"
            : content;

        // Selección de IA Key (BYOK -> Config -> Secret)
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKeySecret.value()));

        const prompt = `
            You are a Fact Extractor. Analyze the provided text block and extract the summary and thematic tags. Output strictly valid JSON.
            
            STRUCTURE:
            {
              "name": "Nombre corto (máx 5 palabras)",
              "summary": "Resumen de 1-2 párrafos de qué trata y cómo inspira",
              "tags": ["Tag1", "Tag2"],
              "smartTags": ["LORE"]
            }

            RULES:
            1. Output ONLY raw JSON.
            2. smartTags must be from: LORE, VISUAL, CIENCIA, INSPIRACIÓN, AUDIO, OTROS.

            <manuscript_data>
            ${escapePromptVariable(safeContent)}
            </manuscript_data>
        `;

        try {
            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: true,
                contextLabel: "ResourceDistiller",
                systemInstruction: "ACT AS: Objective Data Extractor. PURPOSE: Structural metadata analysis of fictional datasets.",
                jsonMode: true
            });

            // HANDLE SAFETY BLOCKS GRACEFULLY
            if (result.error === 'CONTENT_BLOCKED' || (result.reason && result.reason.includes('SAFETY'))) {
                logger.warn(`🛡️ [DISTILL] Safety block triggered for ${data.name}. Marking as blocked_by_safety.`);
                await entityRef.set({ 
                    status: 'blocked_by_safety', 
                    errorMessage: 'Contenido bloqueado por filtros de seguridad de Google Gemini.' 
                }, { merge: true });
                return { success: true, status: 'blocked_by_safety' };
            }

            if (result.error || !result.text) {
                logger.error(`❌ [DISTILL] Falló el motor para: ${data.name}`, result.error);
                await entityRef.set({ status: 'failed', errorMessage: `IA Error: ${result.error}` }, { merge: true });
                throw new HttpsError("internal", "El motor generativo falló al procesar el texto.");
            }

            const distillation = parseSecureJSON(result.text, "ResourceDistillation");

            await entityRef.set({
                name: distillation.name || data.name,
                status: 'active',
                modules: {
                    forge: {
                        summary: distillation.summary || "",
                        tags: distillation.tags || [],
                        smartTags: distillation.smartTags || ['INSPIRACIÓN']
                    }
                },
                distilledAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }, { merge: true });

            logger.info(`✅ [DISTILL] Completado para: ${data.name}`);
            return { success: true, name: distillation.name };

        } catch (err: any) {
            // Check for safety errors in raw message too
            const errMsg = err.message || "";
            if (errMsg.includes("SAFETY") || errMsg.includes("PROHIBITED_CONTENT")) {
                await entityRef.set({ status: 'blocked_by_safety' }, { merge: true });
                return { success: true, status: 'blocked_by_safety' };
            }

            logger.error(`❌ [DISTILL] Error fatal procesando: ${data.name}`, err);
            await entityRef.set({ status: 'failed', errorMessage: 'Fallo crítico en destilación' }, { merge: true });
            throw new HttpsError("internal", "Error interno durante la destilación.");
        }
    }
);
