import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FolderRole, ProjectConfig } from "./types/project";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { updateFirestoreTree } from "./utils/tree_utils"; // 🟢 PERSISTENCE UTILS

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// Internal helper to get config (avoiding circular dependency with index.ts)
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
 * 2.1. DESCUBRIMIENTO DE ROLES (The Scout)
 * Escanea la carpeta raíz y sugiere un mapeo semántico.
 */
export const discoverFolderRoles = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { accessToken, rootFolderId } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;
    const config = await getProjectConfigLocal(userId);
    const targetRootId = rootFolderId || config.folderId;

    if (!targetRootId) {
        throw new HttpsError("failed-precondition", "No hay carpeta raíz configurada.");
    }

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // 1. Scan Top-Level Folders
      const q = `'${targetRootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const res = await drive.files.list({
        q,
        fields: "files(id, name)",
        pageSize: 50 // Enough for top level
      });

      const folders = res.data.files || [];
      if (folders.length === 0) {
          return { suggestion: {}, message: "Carpeta vacía." };
      }

      const folderNames = folders.map(f => f.name);

      // 2. AI Mapping (Gemini Flash)
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
        TASK: Map User Folders to System Roles.

        SYSTEM ROLES (Definitions):
        - ROLE_WORLD_CORE: Universal rules, magic systems, cosmology, bible.
        - ROLE_LORE_HISTORY: Timelines, past events, myths.
        - ROLE_ENTITY_PEOPLE: Characters, NPCs, Dialogues (The Forge).
        - ROLE_ENTITY_BESTIARY: Monsters, creatures, flora.
        - ROLE_ENTITY_FACTIONS: Guilds, religions, armies.
        - ROLE_SAGA_MAIN: Main books, chapters, manuscripts.
        - ROLE_SAGA_EXTRAS: Spin-offs, one-shots, side stories.
        - ROLE_DRAFTS: Ideas, brain dumps, limbo, notes.
        - ROLE_RESOURCES: References, PDFs, images, library.

        USER FOLDERS FOUND:
        ${JSON.stringify(folderNames)}

        INSTRUCTIONS:
        1. Analyze each User Folder name.
        2. Assign the BEST MATCH System Role.
        3. If no fit, ignore it.
        4. Return a JSON mapping: { "ROLE_NAME": "User_Folder_Name" }

        OUTPUT JSON:
      `;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const mappingNames = parseSecureJSON(text, "FolderDiscovery");

      // Convert Name Mapping to ID Mapping
      const finalMapping: Record<string, string> = {};

      if (mappingNames && typeof mappingNames === 'object') {
          for (const [role, folderName] of Object.entries(mappingNames)) {
              const match = folders.find(f => f.name === folderName);
              if (match && match.id) {
                  finalMapping[role] = match.id;
              }
          }
      }

      logger.info(`🔍 Discovery complete for ${userId}. Mapped ${Object.keys(finalMapping).length} roles.`);

      return {
          suggestion: finalMapping,
          folderList: folders,
          message: "Análisis completado."
      };

    } catch (error: any) {
      logger.error("Error in discoverFolderRoles:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

// Helper to resolve role -> folderId from config
export const getFolderIdForRole = (config: ProjectConfig, role: FolderRole): string | null => {
    return config.folderMapping?.[role] || null;
}

/**
 * 2.2. ESTRUCTURA TITANIUM (The Builder)
 * Crea la estructura de carpetas estándar.
 */
export const createTitaniumStructure = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { accessToken, rootFolderId, newProjectName } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // We need either a rootFolderId OR a newProjectName to create one
    if (!rootFolderId && !newProjectName) {
        throw new HttpsError("invalid-argument", "Se requiere rootFolderId o newProjectName.");
    }

    const userId = request.auth.uid;
    const db = getFirestore();

    const STRUCTURE = [
        { name: "UNIVERSO", legacyName: "00_UNIVERSO", role: FolderRole.WORLD_CORE },
        { name: "PERSONAJES", legacyName: "01_PERSONAJES", role: FolderRole.ENTITY_PEOPLE },
        { name: "BESTIARIO", legacyName: "02_BESTIARIO", role: FolderRole.ENTITY_BESTIARY },
        { name: "MANUSCRITO", legacyName: "03_MANUSCRITO", role: FolderRole.SAGA_MAIN },
        { name: "EXTRAS", legacyName: "04_EXTRAS", role: FolderRole.SAGA_EXTRAS },
        { name: "RECURSOS", legacyName: "99_RECURSOS", role: FolderRole.RESOURCES }
    ];

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        // 0. Resolve Root Folder
        let targetRootId = rootFolderId;
        const configUpdates: any = {};

        if (!targetRootId && newProjectName) {
            // Create New Root Folder
            logger.info(`Creating new root project folder: ${newProjectName}`);
            const rootRes = await drive.files.create({
                requestBody: {
                    name: newProjectName,
                    mimeType: "application/vnd.google-apps.folder",
                    // No parent = Root
                },
                fields: "id"
            });
            targetRootId = rootRes.data.id;
            configUpdates.folderId = targetRootId;
            configUpdates.projectName = newProjectName;
            configUpdates.activeBookContext = newProjectName; // Set context name too
        }

        if (!targetRootId) throw new Error("Failed to resolve Root Folder ID");

        const newMapping: Partial<Record<FolderRole, string>> = {};
        const createdFolders: any[] = [];
        const canonPaths: { id: string, name: string }[] = [];
        const resourcePaths: { id: string, name: string }[] = [];

        // 1. Create Folders Sequentially (Legacy Aware)
        for (const item of STRUCTURE) {
            let folderId = null;
            let folderName = item.name;

            // A. Check New Name First
            const qNew = `'${targetRootId}' in parents and name = '${item.name}' and trashed = false`;
            const checkNew = await drive.files.list({ q: qNew, fields: "files(id, name)" });

            if (checkNew.data.files && checkNew.data.files.length > 0) {
                folderId = checkNew.data.files[0].id;
                folderName = checkNew.data.files[0].name!;
                logger.info(`   -> Folder exists (New Standard): ${folderName}`);
            } else if (item.legacyName) {
                // B. Check Legacy Name
                const qLegacy = `'${targetRootId}' in parents and name = '${item.legacyName}' and trashed = false`;
                const checkLegacy = await drive.files.list({ q: qLegacy, fields: "files(id, name)" });

                if (checkLegacy.data.files && checkLegacy.data.files.length > 0) {
                    folderId = checkLegacy.data.files[0].id;
                    folderName = checkLegacy.data.files[0].name!;
                    logger.info(`   -> Folder exists (Legacy): ${folderName}`);
                }
            }

            // C. Create if neither exists
            if (!folderId) {
                const res = await drive.files.create({
                    requestBody: {
                        name: item.name,
                        mimeType: "application/vnd.google-apps.folder",
                        parents: [targetRootId]
                    },
                    fields: "id"
                });
                folderId = res.data.id;
                logger.info(`   -> Created: ${item.name}`);
            }

            if (folderId && item.role) {
                newMapping[item.role] = folderId;
                createdFolders.push({ name: folderName, id: folderId, role: item.role });

                // D. Sort into Canon/Resources
                const pathObj = { id: folderId, name: folderName };
                if (item.role === FolderRole.RESOURCES) {
                    resourcePaths.push(pathObj);
                } else {
                    canonPaths.push(pathObj);
                }
            }
        }

        // 2. Sub-folders for Manuscript (Libro 1, Libro 2)
        if (newMapping[FolderRole.SAGA_MAIN]) {
             const sagaId = newMapping[FolderRole.SAGA_MAIN];
             // Optional: Create Libro 1
             const q = `'${sagaId}' in parents and name = 'Libro_01' and trashed = false`;
             const check = await drive.files.list({ q });
             if (!check.data.files?.length) {
                 await drive.files.create({
                     requestBody: {
                         name: "Libro_01",
                         mimeType: "application/vnd.google-apps.folder",
                         parents: [sagaId]
                     }
                 });
             }
        }

        // 3. Save to Config
        const configRef = db.collection("users").doc(userId).collection("profile").doc("project_config");

        // Merge with existing mapping if any
        const currentConfig = await getProjectConfigLocal(userId);
        const mergedMapping = { ...(currentConfig.folderMapping || {}), ...newMapping };

        // Merge Paths (Append if not present)
        const currentCanon = currentConfig.canonPaths || [];
        const currentResources = currentConfig.resourcePaths || [];

        const mergedCanon = [...currentCanon];
        for (const p of canonPaths) {
            if (!mergedCanon.some(cp => cp.id === p.id)) {
                mergedCanon.push(p);
            }
        }

        const mergedResources = [...currentResources];
        for (const p of resourcePaths) {
            if (!mergedResources.some(rp => rp.id === p.id)) {
                mergedResources.push(p);
            }
        }

        const updatePayload: any = {
            ...configUpdates, // Include folderId/projectName if new
            folderMapping: mergedMapping,
            canonPaths: mergedCanon,
            resourcePaths: mergedResources,
            updatedAt: new Date().toISOString()
        };

        // Sync Legacy Field
        if (newMapping[FolderRole.ENTITY_PEOPLE]) {
            updatePayload.characterVaultId = newMapping[FolderRole.ENTITY_PEOPLE];
        }

        await configRef.set(updatePayload, { merge: true });

        return {
            success: true,
            mapping: mergedMapping,
            created: createdFolders,
            canonPaths: mergedCanon,
            resourcePaths: mergedResources
        };

    } catch (error: any) {
        logger.error("Error creating Titanium structure:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 2.3. RENOMBRAR CARPETA/ARCHIVO (The Label Maker)
 */
export const renameDriveFolder = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { accessToken, fileId, newName } = request.data;
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
        if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
        if (!newName) throw new HttpsError("invalid-argument", "Falta newName.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // Ensure name is valid (minimal sanitization)
            const safeName = newName.trim();
            if (safeName.length === 0) throw new HttpsError("invalid-argument", "Nombre vacío.");

            logger.info(`🏷️ Renaming file/folder ${fileId} to "${safeName}"`);

            await drive.files.update({
                fileId: fileId,
                requestBody: {
                    name: safeName
                }
            });

            // 🟢 PERSISTENCE: Update Firestore Tree (Sync Memory)
            await updateFirestoreTree(request.auth.uid, 'rename', fileId, { name: safeName });

            return { success: true, message: "Nombre actualizado." };

        } catch (error: any) {
            logger.error("Error renaming file/folder:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
