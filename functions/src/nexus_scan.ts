import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING, TEMP_PRECISION } from "./ai_config";
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

        logger.info(`🔍 NEXUS BATCH SCAN: Analyzing ${targetIds.length} files. Context: ${contextType || 'NARRATIVE'}`);

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

            // 2. VIP CONTEXT
            const vipContext = await getVipContext(request.auth.uid, projectId);

            // 3. AI ANALYSIS
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_HIGH_REASONING,
                generationConfig: {
                    temperature: TEMP_PRECISION,
                    responseMimeType: "application/json"
                } as any
            });

            const prompt = `
            ACT AS: The Royal Librarian & Taxonomist (Hive Mind Mode).
            TASK: Analyze the provided BATCH OF TEXTS and extract SIGNIFICANT ENTITIES (Candidates) AND THEIR RELATIONSHIPS for the World Database.

            CONTEXT TYPE: ${contextType || 'NARRATIVE'}

            ${vipContext}

            === THE 8 UNBREAKABLE LAWS OF THE TRIBUNAL ===
            SYSTEM INSTRUCTION: "Al analizar el texto, aplica estrictamente las siguientes leyes. Tu objetivo es limpiar el grafo y CONECTARLO."

            *** LANGUAGE MIRRORING PROTOCOL ***
            Detect the dominant language. GENERATE ALL OUTPUT IN THAT LANGUAGE.

            1. LEY DE MATERIALIDAD: Distingue Objetos de Lugares.
            2. LEY DE IDENTIDAD (Alias): Si "Madre" es "Elsa", FUSIÓNALOS (MERGE).
            3. LEY DEL ALCANCE: Ignora eventos personales menores.
            4. LEY DE LA NATURALEZA: Habilidades son CONCEPTOS.
            5. LEY DE NECROMANCIA: Ignora muertos irrelevantes.
            6. LEY DEL ENJAMBRE: Ignora grupos sin nombre.
            7. LEY DE BIOLOGÍA: CREATURE (Animal) vs RACE (Especie) vs FACTION (Política).
            8. LEY DE DETALLE: Subtype obligatorio de 1 palabra.

            === NEW: RELATIONSHIP EXTRACTION ===
            You must extract explicit relationships between entities.
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
                "mergeWithId": "TargetNameIfMerge",
                "foundInFiles": [
                   {
                     "fileName": "Extracted from FILE START header",
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

            TEXT BATCH TO ANALYZE (Truncated to 80k chars):
            ${combinedContent.substring(0, 80000)}
            `;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            const candidates = parseSecureJSON(responseText, "NexusBatchScan");

            if (candidates.error || !Array.isArray(candidates)) {
                logger.warn(`⚠️ Nexus Batch Scan failed: Invalid JSON.`);
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

            return { candidates: validCandidates };

        } catch (error: any) {
            logger.error(`💥 Nexus Batch Scan Error:`, error);
            throw new HttpsError("internal", error.message);
        }
    }
);

// Legacy export alias if needed, or we can update index.ts to use analyzeNexusBatch
export const analyzeNexusFile = analyzeNexusBatch;
