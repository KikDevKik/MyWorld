import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { _getDriveFileContentInternal } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";
import { getAIKey } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";

const MAX_BATCH_SIZE = 50;
const MAX_TOTAL_CONTENT_CHARS = 500000; // 500k chars limit
const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface NexusScanRequest {
    fileId?: string;
    fileIds?: string[];
    projectId: string;
    folderId?: string;
    accessToken: string;
    contextType: 'NARRATIVE' | 'WORLD_DEF';
    ignoredTerms?: string[];
}

// 🟢 NEW: FORGE SPECIFIC SCANNER
// Optimized for Character Sheets, strictly filters other types, and focuses on "completeness".
export const analyzeForgeBatch = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 540, // 9 mins
        memory: "2GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { fileIds, projectId, accessToken, ignoredTerms } = request.data as NexusScanRequest;

        if (!fileIds || fileIds.length === 0) {
            throw new HttpsError("invalid-argument", "Faltan archivos (fileIds).");
        }
        if (fileIds.length > MAX_BATCH_SIZE) {
            throw new HttpsError("resource-exhausted", `Batch limit exceeded. Max ${MAX_BATCH_SIZE} files.`);
        }
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

        logger.info(`🔥 SOUL FORGE SCANNER: Analyzing ${fileIds.length} files for Characters.`);

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. FETCH CONTENT
            let combinedContent = "";
            const fetchPromises = fileIds.map(async (fid) => {
                try {
                    const meta = await drive.files.get({ fileId: fid, fields: 'name' });
                    const name = meta.data.name || 'Unknown';
                    const content = await _getDriveFileContentInternal(drive, fid);
                    return { name, content };
                } catch (e) { return null; }
            });

            const results = await Promise.all(fetchPromises);

            results.forEach(res => {
                 if (combinedContent.length >= MAX_TOTAL_CONTENT_CHARS) return;
                 if (res && res.content && res.content.length > 50) {
                     const chunk = `\n\n--- FILE: ${res.name} ---\n${res.content}\n--- END FILE ---\n`;
                     if (combinedContent.length + chunk.length <= MAX_TOTAL_CONTENT_CHARS) {
                         combinedContent += chunk;
                     }
                 }
            });

            if (combinedContent.length < 50) return { candidates: [] };

            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

            // 2. FORGE PROMPT (Character Centric)
            const forgePrompt = `
            ACT AS: The Soul Forge Archivist.
            TASK: Extract CHARACTER PROFILES from the provided resource text.

            STRICT FILTERING RULES:
            1. ONLY extract entities that are CHARACTERS (people, sentient beings, AIs, named monsters).
            2. IGNORE Locations, Objects, Techniques, Plot Events, Concepts.
            3. IGNORE minor mentions without personality or role.

            ANALYSIS GOALS:
            - Identify Name and Alias.
            - Determine Role (Protagonist, Antagonist, Support, etc.).
            - Assess "Completeness": Does this character have a description? Motivation?
            - DEDUPLICATE: If the same character appears multiple times (e.g. "Saya" in File A and File B), merge them into ONE entry in your output list.

            OUTPUT JSON FORMAT (Array):
            [
              {
                "name": "Standardized Name",
                "type": "CHARACTER",
                "subtype": "Role or Archetype",
                "confidence": 90,
                "description": "Comprehensive summary from all text.",
                "completeness_notes": "What is missing? (e.g., 'No physical description found')",
                "foundInFiles": [ { "fileName": "File A", "contextSnippet": "..." } ]
              }
            ]

            TEXT CONTENT:
            ${combinedContent}
            `;

            // 🟢 SMART FALLBACK: Try Flash First, Then Pro (The Judge)
            const result = await smartGenerateContent(genAI, forgePrompt, {
                useFlash: true, // Try Flash for speed
                jsonMode: true,
                temperature: 0.2,
                contextLabel: "ForgeScanner"
            });

            if (result.error || !result.text) {
                logger.warn(`🔥 Forge Scan Generation Failed: ${result.error}`);
                return { candidates: [] }; // Fail gracefully
            }

            const candidates = parseSecureJSON(result.text, "ForgeScanner");

            // 3. CLEANUP & BLACKLIST
             // 🟢 BLACKLIST FILTER (Combined Client & Server)
             let serverIgnoredTerms: string[] = [];
             try {
                 const db = getFirestore();
                 const settingsRef = db.collection("users").doc(request.auth.uid).collection("projects").doc(projectId).collection("settings").doc("general");
                 const settingsDoc = await settingsRef.get();
                 if (settingsDoc.exists) {
                     const data = settingsDoc.data();
                     if (data && Array.isArray(data.ignoredTerms)) serverIgnoredTerms = data.ignoredTerms;
                 }
             } catch (e) { /* warn */ }

             const combinedIgnoredTerms = [...(ignoredTerms || []), ...serverIgnoredTerms];
             let validCandidates = Array.isArray(candidates) ? candidates : [];

             if (combinedIgnoredTerms.length > 0) {
                 const ignoredSet = new Set(combinedIgnoredTerms.map(t => t.toLowerCase()));
                 validCandidates = validCandidates.filter((c: any) => !ignoredSet.has(c.name.trim().toLowerCase()));
             }

            return { candidates: validCandidates };

        } catch (error: any) {
            logger.error("Forge Scan Error:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
