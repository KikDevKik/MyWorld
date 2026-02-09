import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { getAIKey } from "./utils/security";

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
            // 1. Check if already tagged (Idempotency) - Optional, but frontend usually handles this.
            // We'll proceed to classify/re-classify.

            // 2. Prepare AI
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: TEMP_PRECISION // We want consistent classification
                } as any
            });

            // 3. Construct Prompt
            const prompt = `
            TASK: Classify this resource file into ONE category.

            FILENAME: "${fileName}"
            TYPE: "${mimeType || 'Unknown'}"
            CONTENT SNIPPET: "${snippet ? snippet.substring(0, 2000) : 'No content preview'}"

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

            const result = await model.generateContent(prompt);
            const data = parseSecureJSON(result.response.text(), "ResourceClassification");
            const tag = data.tag || 'OTROS';

            // 4. Update Firestore
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
