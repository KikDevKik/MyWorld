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

            === THE 4 LAWS OF THE TRIBUNAL ===

            1. LAW OF TYPES (STRICT TAXONOMY):
               - FORBIDDEN: Do NOT use 'canon' as a type.
               - ALLOWED: 'CHARACTER', 'LOCATION', 'OBJECT', 'EVENT', 'CONCEPT', 'FACTION'.
               - LAW OF COORDINATES: DO NOT generate 'fx' or 'fy'. Entities are born bodiless.

            2. LAW OF MATERIALITY (THE BRACELET RULE):
               - IF an entity is an inanimate object (e.g., "Promise Bracelet", "Sword of Truth") found in a NARRATIVE context:
                 - CLASSIFY AS: 'OBJECT' (Category: ITEM).
                 - AMBIGUITY: 'ITEM_LORE'.
                 - SUGGESTED ACTION: 'CONVERT_TYPE' (to ITEM).
               - REASONING: "Object detected. Suggested assignment to Inventory/Lore, not a Map Node."

            3. LAW OF SCOPE (THE GARDEN FLOWERS RULE):
               - IF an event affects only 1-2 characters or is a personal memory (e.g., "The Trauma of 2140"):
                 - CLASSIFY AS: 'EVENT' (Category: EVENT).
                 - AMBIGUITY: 'ITEM_LORE'.
                 - SUGGESTED ACTION: 'IGNORE' or 'CONVERT_TYPE' (to LORE_FRAGMENT).
                 - REASONING: "Personal event scope. Suggest Lore Fragment attribute."
               - IF an event is Global/Historical (e.g., "The Great War"):
                 - SUGGESTED ACTION: 'CREATE'.

            4. LAW OF IDENTITY (THE MOTHER/ELSA RULE):
               - IF you detect an Alias or Title (e.g., "Madre") referring to a known entity (e.g., "Elsa"):
                 - CLASSIFY AS: 'CHARACTER'.
                 - AMBIGUITY: 'DUPLICATE' or 'CONFLICT'.
                 - SUGGESTED ACTION: 'MERGE'.
                 - REASONING: "Alias detected. Merge 'Madre' into 'Elsa'."

            5. LAW OF CONCEPTS (THE ANIME FUSIONE RULE):
               - IF context is WORLD_DEF and entity is a Skill/Ability:
                 - CLASSIFY AS: 'CONCEPT'.
                 - SUGGESTED ACTION: 'CREATE'.

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
