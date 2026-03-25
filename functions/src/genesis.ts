import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { getAIKey, escapeDriveQuery } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { generateDraftContent } from "./templates/forge";
import { FolderRole, ProjectConfig } from "./types/project";
import { updateFirestoreTree } from "./utils/tree_utils";
import { ingestFile } from "./ingestion";
import { TitaniumFactory } from "./services/factory";
import { TitaniumEntity, EntityTrait } from "./types/ontology";
import { TitaniumGenesis } from "./services/genesis";
import * as crypto from 'crypto';

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// 🛡️ SENTINEL SECURITY CONSTANTS
const MAX_HISTORY_ITEMS = 100;
const MAX_HISTORY_CHARS = 100000;

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
    enforceAppCheck: false,
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

    // 🛡️ SENTINEL CHECK: Input Validation (DoS Prevention)
    if (chatHistory.length > MAX_HISTORY_ITEMS) {
        throw new HttpsError("invalid-argument", `History too long. Max ${MAX_HISTORY_ITEMS} messages.`);
    }

    let totalChars = 0;
    for (const h of chatHistory) {
        if (!h.role || !h.message || typeof h.role !== 'string' || typeof h.message !== 'string') {
             throw new HttpsError("invalid-argument", "Invalid history format. Expected {role: string, message: string}.");
        }
        totalChars += h.message.length;
    }

    if (totalChars > MAX_HISTORY_CHARS) {
        throw new HttpsError("invalid-argument", `Total history size exceeds limit (${MAX_HISTORY_CHARS} chars).`);
    }

    const userId = request.auth.uid;
    const db = getFirestore();
    const config = await getProjectConfigLocal(userId);

    // 1. SETUP FOLDERS (Resolver & Validator)
    const peopleFolderId = getFolderIdForRole(config, FolderRole.ENTITY_PEOPLE);
    const worldFolderId = getFolderIdForRole(config, FolderRole.WORLD_CORE);
    const manuscriptFolderId = getFolderIdForRole(config, FolderRole.SAGA_MAIN);
    const bestiaryFolderId = getFolderIdForRole(config, FolderRole.ENTITY_BESTIARY);

    // 🟢 RESOLVE ITEMS FOLDER (New Requirement)
    let itemsFolderId = getFolderIdForRole(config, FolderRole.ENTITY_OBJECTS);

    if (!peopleFolderId || !worldFolderId || !manuscriptFolderId || !bestiaryFolderId) {
        throw new HttpsError("failed-precondition", "Project structure incomplete. Please run 'Create Standard' first.");
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    // 🟢 DYNAMIC STRUCTURE REPAIR: Ensure OBJETOS exists if missing
    if (!itemsFolderId) {
        logger.info("🛠️ Genesis: OBJETOS folder missing in config. Attempting resolution...");
        try {
            const rootId = config.folderId;
            if (rootId) {
                // Check if exists in Drive
                // 🛡️ SECURITY: Escape rootId
                const q = `'${escapeDriveQuery(rootId)}' in parents and name = 'OBJETOS' and trashed = false`;
                const res = await drive.files.list({ q, fields: "files(id)" });

                if (res.data.files && res.data.files.length > 0) {
                    itemsFolderId = res.data.files[0].id!;
                    logger.info("   -> Found existing OBJETOS folder.");
                } else {
                    // Create it
                    const createRes = await drive.files.create({
                        requestBody: {
                            name: "OBJETOS",
                            mimeType: "application/vnd.google-apps.folder",
                            parents: [rootId]
                        },
                        fields: "id"
                    });
                    itemsFolderId = createRes.data.id!;
                    logger.info("   -> Created new OBJETOS folder.");
                }

                // Update Config Mapping (Async, non-blocking)
                if (itemsFolderId) {
                     const mapUpdate: any = {};
                     mapUpdate[`folderMapping.${FolderRole.ENTITY_OBJECTS}`] = itemsFolderId;
                     db.collection("users").doc(userId).collection("profile").doc("project_config").update(mapUpdate).catch(e => logger.warn("Config update failed", e));
                }
            }
        } catch (e) {
            logger.warn("⚠️ Genesis: Failed to resolve OBJETOS folder. Items may be misplaced.", e);
        }
    }

    try {
        // 2. AI EXTRACTION (The Architect)
        const historyText = chatHistory.map((h: any) => `${h.role}: ${h.message}`).join("\n");

        const finalApiKey = getAIKey(request.data, googleApiKey.value());
        const genAI = new GoogleGenerativeAI(finalApiKey);
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

            EXTRACT THE NARRATIVE VOICE (POV):
            - Determine if the user chose First Person (FPS), Third Person (TPS), or Cinematic.
            - Valid values: 'FPS', 'TPS', 'CINEMATIC'. Default: 'TPS'.

            EXTRACT ENTITIES (The Taxonomy):
            - Entities must be classified by 'category' (PERSON, CREATURE, LOCATION, OBJECT) instead of legacy types.
            1. PERSON: Characters with agency/dialogue. (Max 3). REQUIRED METADATA: 'role', 'age'.
            2. CREATURE: Monsters, creatures, or non-sentient threats.
            3. LOCATION: Key settings/places. (Max 2).
            4. OBJECT: Important objects, artifacts.
            5. CHAPTER: The inciting incident or first chapter idea. (Max 1).

            LANGUAGE INSTRUCTION:
            Detect the language of the CHAT HISTORY.
            All output values (traits, summaries, content) MUST BE in the SAME LANGUAGE as the CHAT HISTORY.

            OUTPUT SCHEMA (JSON):
            {
              "narrative_style": "FPS" | "TPS" | "CINEMATIC",
              "entities": [
                {
                  "category": "PERSON",
                  "name": "Name",
                  "role": "Protagonist / Antagonist / NPC",
                  "age": "30 / Unknown",
                  "traits": "Brief description..."
                },
                {
                  "category": "CREATURE",
                  "name": "Monster Name",
                  "traits": "Scary details..."
                },
                {
                  "category": "CHAPTER",
                  "title": "Chapter Title",
                  "summary": "Brief summary",
                  "content": "Starting paragraph..."
                }
              ]
            }

            CHAT HISTORY:
            ${historyText}
        `;

        const result = await model.generateContent(prompt);
        const jsonText = result.response.text();
        const parsedResult = parseSecureJSON(jsonText, "GenesisExtraction");

        if (!parsedResult || !parsedResult.entities) {
            throw new HttpsError("internal", "Failed to parse Genesis extraction.");
        }

        const { narrative_style, entities } = parsedResult;

        // 🟢 SAVE NARRATIVE STYLE (Normalized to styleIdentity)
        if (narrative_style) {
            // We use set with merge to ensure we don't fail if doc missing, and we prioritize 'styleIdentity'
            // as the canonical field for RAG/Context.
            await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                styleIdentity: narrative_style,
                updatedAt: new Date().toISOString()
            }, { merge: true });
        }

        // 3. EXECUTION (The Materialization)
        const createdFiles: any[] = [];

        // Helper to find subfolder in Manuscript (e.g., "Libro_01")
        let targetManuscriptFolder = manuscriptFolderId;
        try {
            // 🛡️ SECURITY: Escape manuscriptFolderId
            const q = `'${escapeDriveQuery(manuscriptFolderId)}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
            const res = await drive.files.list({ q, pageSize: 1, orderBy: 'name' });
            if (res.data.files && res.data.files.length > 0) {
                targetManuscriptFolder = res.data.files[0].id!;
                logger.info(`📚 Genesis: Found subfolder for manuscript: ${res.data.files[0].name}`);
            }
        } catch (e) {
            logger.warn("⚠️ Genesis: Failed to check subfolders, using root Manuscript folder.");
        }

        for (const item of entities) {
            const projectId = (config as any).folderId || "unknown_genesis";
            let folderId = "";
            let traits: EntityTrait[] = [];
            let role = "Entity";
            let context = "";

            if (item.category === 'PERSON') {
                folderId = peopleFolderId;
                traits = ['sentient'];
                role = item.role || "NPC";
                context = `## 📝 Descripción\n${item.traits}\n\n## 🏛️ Historia\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'LOCATION') {
                folderId = worldFolderId;
                traits = ['locatable'];
                role = "Setting";
                context = `## 📝 Descripción\n${item.traits}\n\n## 🌍 Geografía\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'CREATURE') {
                folderId = bestiaryFolderId;
                traits = ['tangible', 'sentient'];
                role = "Monster";
                context = `## 📝 Descripción\n${item.traits}\n\n## 🐾 Comportamiento\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'OBJECT') {
                folderId = itemsFolderId || worldFolderId;
                traits = ['tangible'];
                role = "Item";
                context = `## 📝 Descripción\n${item.traits}\n\n## 💎 Propiedades\nGenerado por el Protocolo Génesis.`;
            } else if (item.category === 'CHAPTER') {
                folderId = targetManuscriptFolder;
                const fileName = `${item.title.replace(/[^a-zA-Z0-9\-_ ]/g, '')}.md`;
                const content = generateDraftContent({
                    title: item.title,
                    type: 'draft',
                    summary: item.summary,
                    content: item.content
                });

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
                    if (fileRes.data.id) {
                         createdFiles.push({
                            id: fileRes.data.id,
                            name: fileName,
                            category: item.category,
                            link: fileRes.data.webViewLink
                        });
                        // Auto-index logic for chapters...
                    }
                } catch(e) { logger.error("Chapter creation failed", e); }
                continue;
            } else {
                continue;
            }

            // 🚀 TITANIUM GENESIS: BIRTH ENTITY
            try {
                const genesisResult = await TitaniumGenesis.birth({
                    userId: userId,
                    name: item.name,
                    context: context,
                    targetFolderId: folderId,
                    accessToken: accessToken,
                    projectId: projectId,
                    role: role,
                    aiKey: getAIKey(request.data, googleApiKey.value()),
                    inferredTraits: traits,
                    attributes: {
                        age: item.age,
                        category: item.category // Support for explicit ECS Category
                    }
                });

                createdFiles.push({
                    id: genesisResult.fileId,
                    name: `${item.name}.md`,
                    category: item.category,
                    link: genesisResult.webViewLink
                });

            } catch (err: any) {
                logger.error(`❌ Genesis: Failed to create ${item.name}:`, err);
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
