import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { TEMP_PRECISION } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { getAIKey, getTier, escapePromptVariable } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface ClassifyResourceRequest {
    fileId: string;
    fileName: string;
    snippet?: string;
    mimeType?: string;
}

export const classifyResource = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKey],
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { fileId, fileName, snippet, mimeType } = request.data as ClassifyResourceRequest;
        if (!fileId || !fileName) throw new HttpsError("invalid-argument", "Falta fileId o fileName.");

        const uid = request.auth.uid;
        const db = getFirestore();

        try {
            // 1. Prepare AI
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const tier = getTier(request.data);

            // 2. Construct Prompt
            const prompt = `
            TASK: Classify this resource file into ONE category.

            FILENAME: "${escapePromptVariable(fileName)}"
            TYPE: "${escapePromptVariable(mimeType || 'Unknown')}"
            CONTENT SNIPPET: "${escapePromptVariable(snippet ? snippet.substring(0, 2000) : 'No content preview')}"

            CATEGORIES:
            - 'LORE': World info, history, maps, geography, politics, religion.
            - 'CIENCIA': Physics, biology, technology, hard magic systems, rules.
            - 'INSPIRACIÓN': Moodboards, vibes, loose ideas, psychology, drafts.
            - 'VISUAL': Images, diagrams, aesthetic references (if file is image).
            - 'AUDIO': Music, sound effects, voice notes.
            - 'OTROS': Admin, metadata, or unclassifiable.

            INSTRUCTIONS:
            1. Analyze Filename and Snippet deeply.
            2. Distinguish between 'LORE' (Factual World) and 'INSPIRACIÓN' (Meta/Drafts).
            3. Return JSON with the best fitting tag and short reasoning.

            OUTPUT JSON:
            { "tag": "LORE", "reason": "Describes the political system of X." }
            `;

            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier, taskType: 'high_volume',
                contextLabel: "ResourceClassification",
                temperature: TEMP_PRECISION,
                jsonMode: true
            });

            if (result.error || !result.text) {
                logger.error("Error classifying resource:", result.error);
                throw new HttpsError("internal", `Error en clasificación AI: ${result.error}`);
            }

            const data = parseSecureJSON(result.text, "ResourceClassification");
            const tag = data.tag || 'OTROS';

            // 3. Update Firestore
            await db.collection("TDB_Index").doc(uid).collection("files").doc(fileId).set({
                smartTags: [tag], // Array for future expansion
                lastClassified: new Date().toISOString()
            }, { merge: true });

            logger.info(`🏷️ Classified ${fileName} as ${tag}`);

            return { success: true, tag: tag };

        } catch (error: any) {
            logger.error("Error classifying resource:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
