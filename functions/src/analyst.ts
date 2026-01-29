import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Readable } from 'stream';
import { MODEL_HIGH_REASONING, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";

// --- CONFIG ---
const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- HELPERS ---

/**
 * Helper to convert a Drive stream to a string.
 * Reuses logic similar to ingestion but simplified for text analysis.
 */
async function streamToString(stream: Readable): Promise<string> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('error', (err) => reject(err));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

/**
 * Fetch text content from a list of Drive File IDs.
 * Skips non-text files or failures gracefully.
 */
async function fetchAggregatedContent(drive: any, fileIds: string[]): Promise<{ text: string, netLength: number }> {
    let combinedText = "";
    let netLength = 0;

    // Limit files to prevent timeout
    const safeFileIds = fileIds.slice(0, 5);
    const ALLOWED_MIME_TYPES = [
        'text/plain',
        'text/markdown',
        'text/x-markdown',
        'application/json',
        'text/html'
    ];

    for (const fileId of safeFileIds) {
        try {
            // Check mimeType first
            const meta = await drive.files.get({ fileId, fields: 'name, mimeType' });
            const mimeType = meta.data.mimeType || '';
            const fileName = meta.data.name || 'Unknown';

            logger.info(`Analizando archivo: ${fileId} Mime: ${mimeType}`);

            let res;
            let fileText = "";

            // 1. CASE A: Google Docs (Export)
            if (mimeType.includes('google-apps.document')) {
                 res = await drive.files.export({ fileId, mimeType: 'text/plain' }, { responseType: 'stream' });
                 fileText = await streamToString(res.data);
            }
            // 2. CASE B: Whitelisted Text (Get Media)
            else if (ALLOWED_MIME_TYPES.includes(mimeType)) {
                 res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });
                 fileText = await streamToString(res.data);
            }
            else {
                logger.warn(`Skipping unsupported file type: ${mimeType} (${fileId})`);
                continue;
            }

            const cleanText = fileText.trim();
            logger.info(`Texto extraído (longitud): ${cleanText.length}`);

            if (cleanText.length > 0) {
                netLength += cleanText.length;
                combinedText += `\n\n--- FILE: ${fileName} ---\n${cleanText.substring(0, 50000)}`; // Cap per file
            }

        } catch (e: any) {
            logger.error(`Failed to fetch file ${fileId}:`, e.message);
        }
    }

    return { text: combinedText, netLength };
}


/**
 * ANALYZE STYLE DNA
 * Extracts tone, style, and implicit rules from selected files.
 */
export const analyzeStyleDNA = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 300,
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
        }

        const { fileIds, accessToken } = request.data;
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            throw new HttpsError("invalid-argument", "Falta fileIds.");
        }
        if (!accessToken) {
            throw new HttpsError("unauthenticated", "Falta accessToken.");
        }

        logger.info(`🧬 [STYLE DNA] Analyzing ${fileIds.length} files for User ${request.auth.uid}`);
        logger.info("Auth initialized with token length:", accessToken?.length);

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. Fetch Text
            const { text: aggregatedText, netLength } = await fetchAggregatedContent(drive, fileIds);

            if (netLength < 50) {
                 return { styleIdentity: "No se pudo extraer suficiente texto de los archivos seleccionados (Mínimo 50 caracteres)." };
            }

            // 2. AI Analysis
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_HIGH_REASONING,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: {
                    temperature: 0.7, // Creative but grounded
                }
            });

            const prompt = `
                Actúa como un analista literario experto.
                Analiza el siguiente texto y genera una 'Definición de Identidad Narrativa' compacta.

                Describe el Tono (ej: atmósfera, emoción) y el Estilo Técnico (ej: sintaxis, ritmo, vocabulario) en un solo párrafo denso y directivo.
                Este párrafo estará diseñado para instruir a otra IA sobre cómo imitar a este autor exactamente.

                No uses listas ni JSON. Solo un bloque de texto descriptivo y potente.
                Si el texto está en Español, responde en Español.

                TEXTO A ANALIZAR:
                ${aggregatedText.substring(0, 100000)}
            `;

            const result = await model.generateContent(prompt);
            const styleIdentity = result.response.text();

            logger.info("🧬 [STYLE DNA] Analysis complete.");
            return { styleIdentity };

        } catch (error: any) {
            logger.error("Error in analyzeStyleDNA:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
