import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING, MODEL_LOW_COST, TEMP_PRECISION } from "./ai_config";
import { _getDriveFileContentInternal } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface NexusScanRequest {
    fileId?: string; // Legacy
    fileIds?: string[]; // 🟢 NEW: Batch Support
    projectId: string; // 🟢 NEW: Mandatory for Context
    folderId?: string; // Optional (for logging)
    accessToken: string;
    contextType: 'NARRATIVE' | 'WORLD_DEF';
    ignoredTerms?: string[];
}

interface AnalysisCandidate {
    name: string;
    type: string;
    description: string;
    subtype?: string;
    ambiguityType: 'CONFLICT' | 'NEW' | 'ITEM_LORE' | 'DUPLICATE';
    suggestedAction: 'MERGE' | 'CREATE' | 'CONVERT_TYPE' | 'IGNORE';
    confidence: number;
    reasoning: string;
    foundInFiles: Array<{
        fileName: string;
        contextSnippet: string;
    }>;
    mergeWithId?: string;
    category?: string;
    relations?: Array<{ // 🟢 NEW: Relations
        target: string;
        type: string;
        context: string;
    }>;
}

// 🟢 HELPER: VIP CONTEXT INJECTION
async function getVipContext(userId: string, projectId: string): Promise<string> {
    try {
        const db = getFirestore();
        const entitiesRef = db.collection("users").doc(userId).collection("projects").doc(projectId).collection("entities");

        // Query High Value Nodes
        // Firestore OR queries are limited, so we do parallel queries or just fetch one type if indices missing.
        // Let's fetch FACTION and LOCATION for now, and maybe Main Characters.

        const factionsQuery = entitiesRef.where("type", "==", "faction").limit(10).get();
        const locationsQuery = entitiesRef.where("type", "==", "location").limit(10).get();
        const mainCharsQuery = entitiesRef.where("subtype", "==", "MAIN_CHARACTER").limit(10).get();

        const [factionsSnap, locationsSnap, mainCharsSnap] = await Promise.all([factionsQuery, locationsQuery, mainCharsQuery]);

        let context = "### CONOCIMIENTO PREVIO DEL MUNDO (VIP Context)\n";
        const seen = new Set<string>();

        const processSnap = (snap: FirebaseFirestore.QuerySnapshot) => {
            snap.forEach(doc => {
                const data = doc.data();
                if (!seen.has(data.name)) {
                    context += `- ${data.name} (${data.type}): ${data.description?.substring(0, 50)}...\n`;
                    seen.add(data.name);
                }
            });
        };

        processSnap(factionsSnap);
        processSnap(locationsSnap);
        processSnap(mainCharsSnap);

        if (seen.size === 0) return "";
        return context;
    } catch (e) {
        logger.warn("⚠️ Failed to fetch VIP Context:", e);
        return "";
    }
}

export const analyzeNexusBatch = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 540,
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { fileId, fileIds, projectId, accessToken, contextType, ignoredTerms, folderId } = request.data as NexusScanRequest;

        // Normalize Input
        const targetIds = fileIds && fileIds.length > 0 ? fileIds : (fileId ? [fileId] : []);

        if (targetIds.length === 0) {
             throw new HttpsError("invalid-argument", "Faltan archivos para analizar (fileIds).");
        }
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
        if (!projectId) throw new HttpsError("invalid-argument", "Falta projectId.");

        logger.info(`🔍 NEXUS BICAMERAL ENGINE: Analyzing ${targetIds.length} files. Context: ${contextType || 'NARRATIVE'}`);

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. BATCH FETCH CONTENT
            let combinedContent = "";
            let fileMap: Record<string, string> = {}; // Name map

            // Use Promise.all for parallel fetch
            const fetchPromises = targetIds.map(async (fid) => {
                try {
                    const meta = await drive.files.get({ fileId: fid, fields: 'name' });
                    const name = meta.data.name || 'Unknown';
                    const content = await _getDriveFileContentInternal(drive, fid);
                    return { name, content };
                } catch (e) {
                    logger.warn(`Failed to read file ${fid}`, e);
                    return null;
                }
            });

            const results = await Promise.all(fetchPromises);

            results.forEach(res => {
                if (res && res.content && res.content.length > 50) {
                    combinedContent += `\n\n--- FILE START: ${res.name} ---\n${res.content}\n--- FILE END ---\n`;
                    fileMap[res.name] = "Included";
                }
            });

            if (combinedContent.length < 50) {
                return { candidates: [] };
            }

            const genAI = new GoogleGenerativeAI(googleApiKey.value());

            // 🟢 STAGE 1: THE HARVESTER (MODEL LOW COST)
            logger.info("🤖 STAGE 1: HARVESTER (Flash) Initiated...");

            const harvesterModel = genAI.getGenerativeModel({
                model: MODEL_LOW_COST, // Flash
                generationConfig: {
                    temperature: 0.2, // Low temp for extraction
                    responseMimeType: "application/json"
                } as any
            });

            const harvesterPrompt = `
            ACT AS: The Harvester (Hive Mind Mode).
            TASK: Extract ALL entities (Characters, Locations, Factions, Items, Concepts) and potential relationships from the text.

            INSTRUCTIONS:
            1. DO NOT REASON DEEPLY. DO NOT FILTER. Just extract raw data.
            2. Identify the Name, Type, and a short Snippet of context.
            3. Ignore common words, focus on proper nouns and capitalized terms.

            CONTEXT TYPE: ${contextType || 'NARRATIVE'}

            OUTPUT JSON FORMAT (Array):
            [
              { "name": "Exact Name", "type": "Possible Type", "contextSnippet": "Quote from text..." }
            ]

            TEXT BATCH (Expanded Window):
            ${combinedContent.substring(0, 300000)}
            `;
            // Increased to 300k chars for Flash

            const harvesterResult = await harvesterModel.generateContent(harvesterPrompt);
            const harvesterText = harvesterResult.response.text();
            const rawEntities = parseSecureJSON(harvesterText, "NexusHarvester");

            if (!Array.isArray(rawEntities) || rawEntities.length === 0) {
                logger.warn("⚠️ Harvester found no entities.");
                return { candidates: [] };
            }

            logger.info(`🤖 STAGE 1 COMPLETE. Extracted ${rawEntities.length} raw entities.`);

            // 2. VIP CONTEXT (Fetch while Stage 1 runs? No, depend on it for flow clarity, but ideally parallel)
            const vipContext = await getVipContext(request.auth.uid, projectId);

            // 🟢 STAGE 2: THE JUDGE (MODEL HIGH REASONING)
            logger.info("⚖️ STAGE 2: JUDGE (Pro) Initiated...");

            const judgeModel = genAI.getGenerativeModel({
                model: MODEL_HIGH_REASONING, // Pro
                generationConfig: {
                    temperature: TEMP_PRECISION,
                    responseMimeType: "application/json"
                } as any
            });

            const judgePrompt = `
            ACT AS: The Royal Librarian & Taxonomist (Hive Mind Mode).
            TASK: Analyze the provided RAW LIST of entities and the VIP Context to produce the Final Tribunal Candidates.

            INPUT 1: VIP CONTEXT (Existing Database Knowledge):
            ${vipContext}

            INPUT 2: RAW ENTITY LIST (From Harvester):
            ${JSON.stringify(rawEntities.slice(0, 500))}

            === THE 8 UNBREAKABLE LAWS OF THE TRIBUNAL ===
            SYSTEM INSTRUCTION: "Al analizar la lista bruta, aplica estrictamente las siguientes leyes. Tu objetivo es limpiar, deduplicar y conectar."

            *** LANGUAGE MIRRORING PROTOCOL ***
            Detect the dominant language of the input. GENERATE ALL OUTPUT IN THAT LANGUAGE.

            1. LEY DE MATERIALIDAD: Distingue Objetos de Lugares.
            2. LEY DE IDENTIDAD (Alias): Si "Madre" es "Elsa", FUSIÓNALOS (MERGE).
            3. LEY DEL ALCANCE: Ignora eventos personales menores.
            4. LEY DE LA NATURALEZA: Habilidades son CONCEPTOS.
            5. LEY DE NECROMANCIA: Ignora muertos irrelevantes.
            6. LEY DEL ENJAMBRE: Ignora grupos sin nombre.
            7. LEY DE BIOLOGÍA: CREATURE (Animal) vs RACE (Especie) vs FACTION (Política).
            8. LEY DE DETALLE: Subtype obligatorio de 1 palabra.

            === RELATIONSHIP EXTRACTION ===
            You must extract explicit relationships between entities based on the context snippets.
            Types: 'ENEMY', 'ALLY', 'FAMILY', 'MENTOR', 'NEUTRAL', 'OWNED_BY', 'LOCATED_IN'.

            OUTPUT JSON FORMAT (Array):
            [
              {
                "name": "Exact Name",
                "type": "CHARACTER",
                "subtype": "Optional Subtype",
                "category": "ENTITY",
                "ambiguityType": "NEW", // NEW, CONFLICT, ITEM_LORE, DUPLICATE
                "suggestedAction": "CREATE", // CREATE, MERGE, CONVERT_TYPE, IGNORE
                "confidence": 95,
                "reasoning": "Brief explanation.",
                "mergeWithId": "TargetNameIfMerge", // IMPORTANT: Return the NAME of the target if merging.
                "foundInFiles": [
                   {
                     "fileName": "Source",
                     "contextSnippet": "Quote..."
                   }
                ],
                "relations": [
                    {
                        "target": "Target Name",
                        "type": "ENEMY",
                        "context": "Why they are enemies"
                    }
                ]
              }
            ]
            `;

            const judgeResult = await judgeModel.generateContent(judgePrompt);
            const judgeText = judgeResult.response.text();
            const candidates = parseSecureJSON(judgeText, "NexusJudge");

            if (candidates.error || !Array.isArray(candidates)) {
                logger.warn(`⚠️ Nexus Judge failed: Invalid JSON.`);
                return { candidates: [] };
            }

            // 🟢 POST-PROCESS: Sanitize
            let validCandidates = candidates.map((c: any) => ({
                ...c,
                // Ensure foundInFiles is structured
                foundInFiles: c.foundInFiles || [{ fileName: "Batch", contextSnippet: "Snippet missing." }]
            }));

            // 🟢 BLACKLIST FILTER
            if (ignoredTerms && Array.isArray(ignoredTerms) && ignoredTerms.length > 0) {
                const ignoredSet = new Set(ignoredTerms.map(t => t.toLowerCase()));
                validCandidates = validCandidates.filter((c: any) => {
                    return !ignoredSet.has(c.name.trim().toLowerCase());
                });
            }

            logger.info(`✅ BICAMERAL ENGINE COMPLETE. Returned ${validCandidates.length} candidates.`);
            return { candidates: validCandidates };

        } catch (error: any) {
            logger.error(`💥 Nexus Bicameral Engine Error:`, error);
            throw new HttpsError("internal", error.message);
        }
    }
);

// Legacy export alias if needed, or we can update index.ts to use analyzeNexusBatch
export const analyzeNexusFile = analyzeNexusBatch;
