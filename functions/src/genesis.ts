import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FolderRole, ProjectConfig } from "./types/project";
import { getFolderIdForRole } from "./folder_manager";
import { generateAnchorContent, AnchorTemplateData } from "./templates/forge";
import { updateFirestoreTree } from "./utils/tree_utils";
import { parseSecureJSON } from "./utils/json";
import { MODEL_HIGH_REASONING, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// Local helper to avoid circular dependency
async function getProjectConfigLocal(userId: string): Promise<ProjectConfig> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

  const defaultConfig: ProjectConfig = {
    canonPaths: [],
    primaryCanonPathId: null,
    resourcePaths: [],
    activeBookContext: ""
  };

  if (!doc.exists) {
    return defaultConfig;
  }
  return { ...defaultConfig, ...doc.data() };
}

/**
 * THE GENESIS PROTOCOL (The Spark)
 * Transforms a chat conversation into a structured batch of files (World Materialization).
 */
export const genesisManifest = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
    timeoutSeconds: 300,
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { chatHistory, accessToken, folderId } = request.data;
    const userId = request.auth.uid;

    if (!chatHistory || !Array.isArray(chatHistory)) {
        throw new HttpsError("invalid-argument", "Chat history is required.");
    }
    if (!accessToken) throw new HttpsError("unauthenticated", "Access Token required.");

    try {
        logger.info(`⚡ GENESIS PROTOCOL: Initiated for User ${userId}`);

        // 1. ANALYZE CHAT & EXTRACT SCHEMA
        const genAI = new GoogleGenerativeAI(googleApiKey.value());
        const model = genAI.getGenerativeModel({
            model: MODEL_HIGH_REASONING, // Use high reasoning for structure extraction
            safetySettings: SAFETY_SETTINGS_PERMISSIVE,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: TEMP_PRECISION // Strict format
            } as any
        });

        // Construct Chat Transcript
        const transcript = chatHistory.map((m: any) => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

        const extractionPrompt = `
            TASK: Analyze the creative conversation and EXTRACT the entities to be created.
            GOAL: Materialize the user's ideas into a list of specific files.

            ENTITIES TO EXTRACT:
            - CHARACTER: Protagonists, Antagonists, Side characters.
            - LOCATION: Cities, Rooms, Planets, Regions.
            - FACTION: Guilds, Armies, Groups.
            - CHAPTER: Scenes, Chapters, Events (Manuscrito).
            - CONCEPT: Magic systems, Technologies, Laws.

            INSTRUCTIONS:
            1. Identify 3-5 KEY entities defined in the chat.
            2. Extract their 'name', 'type', 'role' (short one-liner), and 'traits' (detailed description based on chat).
            3. For 'type', use STRICT values: 'CHARACTER', 'LOCATION', 'FACTION', 'CHAPTER', 'CONCEPT'.

            OUTPUT JSON SCHEMA:
            [
              {
                "type": "CHARACTER",
                "name": "Name of Entity",
                "role": "The Reluctant Hero",
                "traits": "Detailed description, personality, appearance...",
                "suggested_filename": "Name"
              }
            ]

            TRANSCRIPT:
            ${transcript}
        `;

        const result = await model.generateContent(extractionPrompt);
        const jsonText = result.response.text();
        const entities = parseSecureJSON(jsonText, "GenesisExtraction");

        if (!Array.isArray(entities)) {
            throw new Error("Failed to extract valid entity array from Genesis chat.");
        }

        logger.info(`⚡ GENESIS: Extracted ${entities.length} entities to materialize.`);

        // 2. LOAD CONFIG FOR ROUTING
        const config = await getProjectConfigLocal(userId);

        // 3. EXECUTE BATCH CREATION
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const createdFiles: any[] = [];

        for (const entity of entities) {
            try {
                // A. RESOLVE FOLDER
                let targetRole = FolderRole.DRAFTS; // Default
                switch (entity.type) {
                    case 'CHARACTER': targetRole = FolderRole.ENTITY_PEOPLE; break;
                    case 'LOCATION': targetRole = FolderRole.WORLD_CORE; break; // Map Locations to Universo/World Core
                    case 'FACTION': targetRole = FolderRole.ENTITY_FACTIONS; break;
                    case 'CHAPTER': targetRole = FolderRole.SAGA_MAIN; break;
                    case 'CONCEPT': targetRole = FolderRole.WORLD_CORE; break;
                }

                let targetFolderId = getFolderIdForRole(config, targetRole);

                // Fallback to project root if role folder not found
                if (!targetFolderId) targetFolderId = folderId || config.folderId;

                if (!targetFolderId) {
                    logger.warn(`Skipping ${entity.name}: No target folder found.`);
                    continue;
                }

                // B. GENERATE CONTENT
                const templateData: AnchorTemplateData = {
                    name: entity.name,
                    type: entity.type.toLowerCase(),
                    role: entity.role,
                    description: entity.traits,
                    rawBodyContent: entity.type === 'CHAPTER'
                        ? `# ${entity.name}\n\n${entity.traits}` // Simple body for chapters
                        : undefined // Use default template for others
                };

                // For simple template gen, if type is CHAPTER, we might want generateDraftContent
                let content = "";
                if (entity.type === 'CHAPTER') {
                     content = `# ${entity.name}\n\n> ${entity.role}\n\n${entity.traits}`;
                } else {
                     content = generateAnchorContent(templateData);
                }

                // C. SAVE TO DRIVE
                const fileName = `${entity.suggested_filename || entity.name}.md`;

                const fileRes = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        parents: [targetFolderId],
                        mimeType: 'text/markdown'
                    },
                    media: {
                        mimeType: 'text/markdown',
                        body: content
                    },
                    fields: 'id, name, webViewLink'
                });

                const newFileId = fileRes.data.id;

                if (newFileId) {
                    createdFiles.push({
                        id: newFileId,
                        name: fileName,
                        link: fileRes.data.webViewLink
                    });

                    // D. SYNC FIRESTORE TREE
                    await updateFirestoreTree(userId, 'add', newFileId, {
                        parentId: targetFolderId,
                        newNode: {
                            id: newFileId,
                            name: fileName,
                            mimeType: 'text/markdown',
                            type: 'file',
                            children: []
                        }
                    });
                }

            } catch (err) {
                logger.error(`Failed to materialize ${entity.name}:`, err);
            }
        }

        logger.info(`⚡ GENESIS COMPLETE. Created ${createdFiles.length} files.`);

        return {
            success: true,
            files: createdFiles
        };

    } catch (error: any) {
        logger.error("Error in Genesis Protocol:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);
