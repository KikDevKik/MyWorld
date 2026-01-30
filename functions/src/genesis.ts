import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { generateAnchorContent, generateDraftContent } from "./templates/forge";
import { FolderRole, ProjectConfig } from "./types/project";
import { updateFirestoreTree } from "./utils/tree_utils";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// Helper to get config
async function getProjectConfigLocal(userId: string): Promise<ProjectConfig> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

  const defaultConfig: ProjectConfig = {
    canonPaths: [],
    resourcePaths: [],
    activeBookContext: ""
  };

  if (!doc.exists) return defaultConfig;
  return { ...defaultConfig, ...doc.data() };
}

// Helper to resolve role -> folderId
const getFolderIdForRole = (config: ProjectConfig, role: FolderRole): string | null => {
    return config.folderMapping?.[role] || null;
}

/**
 * GENESIS PROTOCOL (The Big Bang)
 * Takes a Socratic chat history, extracts entities, and batch-creates them in Drive.
 */
export const genesisManifest = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
    timeoutSeconds: 540, // 9 minutes for batch operations
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { chatHistory, accessToken } = request.data;
    if (!chatHistory || !Array.isArray(chatHistory)) {
        throw new HttpsError("invalid-argument", "History is required.");
    }
    if (!accessToken) throw new HttpsError("unauthenticated", "Access Token required.");

    const userId = request.auth.uid;
    const config = await getProjectConfigLocal(userId);

    // 1. SETUP FOLDERS
    const peopleFolderId = getFolderIdForRole(config, FolderRole.ENTITY_PEOPLE);
    const worldFolderId = getFolderIdForRole(config, FolderRole.WORLD_CORE); // Locations go here
    const manuscriptFolderId = getFolderIdForRole(config, FolderRole.SAGA_MAIN);

    if (!peopleFolderId || !worldFolderId || !manuscriptFolderId) {
        throw new HttpsError("failed-precondition", "Project structure incomplete. Please run 'Create Standard' first.");
    }

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        // 2. AI EXTRACTION (The Architect)
        const historyText = chatHistory.map((h: any) => `${h.role}: ${h.message}`).join("\n");

        const genAI = new GoogleGenerativeAI(googleApiKey.value());
        const model = genAI.getGenerativeModel({
            model: MODEL_LOW_COST,
            safetySettings: SAFETY_SETTINGS_PERMISSIVE,
            generationConfig: {
                temperature: TEMP_PRECISION,
                responseMimeType: "application/json"
            } as any
        });

        const prompt = `
            TASK: Analyze the Socratic Chat and extract the structural elements of the story.

            EXTRACT:
            1. CHARACTERS: Protagonist, Antagonist, etc. (Max 3)
            2. LOCATIONS: Key settings mentioned. (Max 2)
            3. CHAPTERS: The inciting incident or first chapter idea. (Max 1)

            OUTPUT SCHEMA (JSON):
            [
              {
                "type": "CHARACTER",
                "name": "Name",
                "role": "Protagonist / Antagonist",
                "traits": "Brief description of personality/appearance"
              },
              {
                "type": "LOCATION",
                "name": "Location Name",
                "role": "Setting / Key Location",
                "traits": "Atmosphere and details"
              },
              {
                "type": "CHAPTER",
                "title": "Chapter Title",
                "summary": "Brief summary of what happens",
                "content": "A starting paragraph for the story..."
              }
            ]

            CHAT HISTORY:
            ${historyText}
        `;

        const result = await model.generateContent(prompt);
        const jsonText = result.response.text();
        const entities = parseSecureJSON(jsonText, "GenesisExtraction");

        if (!Array.isArray(entities)) {
            throw new HttpsError("internal", "Failed to parse Genesis extraction.");
        }

        // 3. EXECUTION (The Materialization)
        const createdFiles: any[] = [];

        // Helper to find subfolder in Manuscript (e.g., "Libro_01")
        let targetManuscriptFolder = manuscriptFolderId;
        try {
            const q = `'${manuscriptFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const res = await drive.files.list({ q, pageSize: 1, orderBy: 'name' });
            if (res.data.files && res.data.files.length > 0) {
                targetManuscriptFolder = res.data.files[0].id!;
                logger.info(`📚 Genesis: Found subfolder for manuscript: ${res.data.files[0].name}`);
            }
        } catch (e) {
            logger.warn("⚠️ Genesis: Failed to check subfolders, using root Manuscript folder.");
        }

        for (const item of entities) {
            let content = "";
            let folderId = "";
            let fileName = "";
            let fileType = 'file';

            if (item.type === 'CHARACTER') {
                folderId = peopleFolderId;
                fileName = `${item.name}.md`;
                content = generateAnchorContent({
                    name: item.name,
                    type: 'character',
                    role: item.role,
                    description: item.traits,
                    status: 'active',
                    tier: 'ANCHOR'
                } as any);
            } else if (item.type === 'LOCATION') {
                folderId = worldFolderId;
                fileName = `${item.name}.md`;
                content = generateAnchorContent({
                    name: item.name,
                    type: 'location',
                    role: item.role,
                    description: item.traits,
                    status: 'active',
                    tier: 'ANCHOR'
                } as any);
            } else if (item.type === 'CHAPTER') {
                folderId = targetManuscriptFolder;
                fileName = `${item.title.replace(/[^a-zA-Z0-9\-_ ]/g, '')}.md`;
                content = generateDraftContent({
                    title: item.title,
                    type: 'draft', // or 'scene'
                    summary: item.summary,
                    content: item.content
                });
            } else {
                continue;
            }

            // CREATE FILE
            try {
                const fileRes = await drive.files.create({
                    requestBody: {
                        name: fileName,
                        parents: [folderId],
                        mimeType: 'text/markdown'
                    },
                    media: {
                        mimeType: 'text/markdown',
                        body: content
                    },
                    fields: 'id, name, webViewLink'
                });

                const fileId = fileRes.data.id;

                if (fileId) {
                    createdFiles.push({
                        id: fileId,
                        name: fileName,
                        type: item.type,
                        link: fileRes.data.webViewLink
                    });

                    // 🟢 PERSISTENCE: Sync Tree
                    await updateFirestoreTree(userId, 'add', fileId, {
                        parentId: folderId,
                        newNode: {
                            id: fileId,
                            name: fileName,
                            mimeType: 'text/markdown',
                            type: 'file',
                            children: []
                        }
                    });
                }
            } catch (err: any) {
                logger.error(`❌ Genesis: Failed to create ${fileName}:`, err);
            }
        }

        return {
            success: true,
            files: createdFiles,
            message: `Génesis completado. ${createdFiles.length} archivos materializados.`
        };

    } catch (error: any) {
        logger.error("🔥 Genesis Protocol Failed:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);
