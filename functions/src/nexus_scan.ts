import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING, TEMP_PRECISION } from "./ai_config";
import { _getDriveFileContentInternal } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface NexusScanRequest {
    fileId: string;
    accessToken: string;
    contextType: 'NARRATIVE' | 'WORLD_DEF';
}

interface AnalysisCandidate {
    name: string;
    type: string; // STRICT: CHARACTER, LOCATION, OBJECT, EVENT, CONCEPT, FACTION
    description: string;
    ambiguityType: 'CONFLICT' | 'NEW' | 'ITEM_LORE' | 'DUPLICATE';
    suggestedAction: 'MERGE' | 'CREATE' | 'CONVERT_TYPE' | 'IGNORE';
    confidence: number;
    reasoning: string;
    foundInFiles: Array<{
        fileName: string;
        contextSnippet: string;
    }>;
    mergeWithId?: string; // If 'MERGE'
    category?: string; // ENTITY, ITEM, CONCEPT, EVENT
}

export const analyzeNexusFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 300,
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { fileId, accessToken, contextType } = request.data as NexusScanRequest;

        if (!fileId || !accessToken) {
            throw new HttpsError("invalid-argument", "Faltan datos (fileId, accessToken).");
        }

        logger.info(`🔍 NEXUS SCAN: Analyzing file ${fileId} (${contextType || 'NARRATIVE'})`);

        try {
            // 1. FETCH CONTENT
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // Get Metadata first for filename
            const meta = await drive.files.get({ fileId, fields: 'name' });
            const fileName = meta.data.name || 'Unknown File';

            const content = await _getDriveFileContentInternal(drive, fileId);

            if (!content || content.length < 50) {
                logger.warn("⚠️ File content too short or empty.");
                return { candidates: [] };
            }

            // 2. AI ANALYSIS
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_HIGH_REASONING,
                generationConfig: {
                    temperature: TEMP_PRECISION, // Cold analysis
                    responseMimeType: "application/json"
                } as any
            });

            const prompt = `
            ACT AS: The Royal Librarian & Taxonomist (High Reasoning Mode).
            TASK: Analyze the provided TEXT and extract SIGNIFICANT ENTITIES (Candidates) for the World Database.

            CURRENT FILE CONTEXT: "${fileName}"
            CONTEXT CATEGORY: ${contextType || 'NARRATIVE'}

            === THE 6 UNBREAKABLE LAWS OF THE TRIBUNAL ===
            SYSTEM INSTRUCTION: "Al analizar el texto, aplica estrictamente las siguientes leyes de exclusión. Tu objetivo es limpiar el grafo, no llenarlo."

            1. LEY DE MATERIALIDAD (Items vs. Lugares):
               - Si detectas un objeto ("Brazaletes", "Espada"), pregúntate: ¿Es un lugar geográfico?
               - Si NO lo es, clasifícalo como type: 'OBJECT' (Category: ITEM).
               - ambiguityType: 'ITEM_LORE'.
               - suggestedAction: 'CONVERT_TYPE'.
               - REASONING: "Object detected. Convert to Item/Lore. NUNCA le asignes coordenadas."

            2. LEY DE IDENTIDAD (Alias):
               - Si un nombre ("Madre") es un alias de un personaje ya mencionado ("Elsa"):
               - NO crees un nodo nuevo.
               - ambiguityType: 'DUPLICATE'.
               - suggestedAction: 'MERGE'.
               - REASONING: "Alias detected. Merge into target."

            3. LEY DEL ALCANCE (Eventos Locales):
               - Si un evento ("Incidente GardenFlowers") afecta solo a la psicología de 1 personaje:
               - NO es un nodo EVENT. Es un LORE_FRAGMENT o atributo.
               - suggestedAction: 'IGNORE' o 'CONVERT_TYPE'.
               - REASONING: "Personal event scope. Suggest Lore Fragment."
               - Solo crea nodos EVENT para sucesos globales/políticos.

            4. LEY DE LA NATURALEZA (Habilidades):
               - Las habilidades personales ("Anime Fusione", "Pesadilla") NO son conceptos universales.
               - Clasifícalas como type: 'CONCEPT' (Category: CONCEPT).
               - suggestedAction: 'CONVERT_TYPE'.
               - REASONING: "Personal Ability detected. Suggest Convert to Lore."

            5. LEY DE NECROMANCIA (Padres Muertos):
               - Si un personaje ("Kenny", "Carla") se menciona solo como 'fallecido' en el pasado:
               - IGNÓRALO. No crees nodos para fantasmas de trasfondo.
               - suggestedAction: 'IGNORE'.

            6. LEY DEL ENJAMBRE (NPCs Genéricos):
               - No crees nodos para grupos sin nombre ("Otros niños", "Soldados").
               - Agrúpalos bajo la Facción o Lugar correspondiente.
               - suggestedAction: 'IGNORE'.

            === EVIDENCE REQUIREMENT ===
            For every candidate, you MUST extract a 'contextSnippet':
            - A verbatim quote (max 30 words) from the text proving the entity's existence and nature.

            OUTPUT JSON FORMAT (Array):
            [
              {
                "name": "Exact Name",
                "type": "CHARACTER",
                "category": "ENTITY", // ENTITY, ITEM, CONCEPT, EVENT
                "ambiguityType": "NEW", // NEW, CONFLICT, ITEM_LORE, DUPLICATE
                "suggestedAction": "CREATE", // CREATE, MERGE, CONVERT_TYPE, IGNORE
                "confidence": 95,
                "reasoning": "Brief explanation applying the laws.",
                "mergeWithId": "TargetNameIfMerge", // Optional
                "foundInFiles": [
                   {
                     "fileName": "${fileName}",
                     "contextSnippet": "Quote from text..."
                   }
                ]
              }
            ]

            TEXT TO ANALYZE (Truncated to 25k chars):
            ${content.substring(0, 25000)}
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();

            const candidates = parseSecureJSON(responseText, "NexusScan");

            if (candidates.error || !Array.isArray(candidates)) {
                logger.warn(`⚠️ Nexus Scan failed for ${fileName}: Invalid JSON.`);
                return { candidates: [] };
            }

            // 🟢 POST-PROCESS: Sanitize and Validate
            const validCandidates = candidates.map((c: any) => ({
                ...c,
                // Enforce File Name injection if AI missed it (it happens)
                foundInFiles: c.foundInFiles?.map((f: any) => ({
                    fileName: fileName, // Force correct filename
                    contextSnippet: f.contextSnippet || "No snippet provided."
                })) || [{ fileName, contextSnippet: "Snippet missing." }]
            }));

            return { candidates: validCandidates };

        } catch (error: any) {
            logger.error(`💥 Nexus Scan Error for ${fileId}:`, error);
            throw new HttpsError("internal", error.message);
        }
    }
);
