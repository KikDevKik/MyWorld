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
import { updateFirestoreTree, updateFirestoreTreeBatch } from "./utils/tree_utils"; // 🟢 PERSISTENCE UTILS
import { deleteFileVectors } from "./ingestion";
import { getAIKey } from "./utils/security";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// 🛡️ SENTINEL SECURITY CONSTANTS
const MAX_BATCH_SIZE = 50; // Prevent DoS loop via unbounded batch operations
const MAX_FILENAME_LENGTH = 255; // Prevent filesystem abuse via massive filenames

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
    enforceAppCheck: false,
    secrets: [googleApiKey],
    memory: "4GiB",
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
      const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
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
    enforceAppCheck: false,
    memory: "1GiB",
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
        { name: "OBJETOS", legacyName: "98_OBJETOS", role: FolderRole.ENTITY_OBJECTS },
        { name: "MANUSCRITO", legacyName: "03_MANUSCRITO", role: FolderRole.SAGA_MAIN },
        { name: "EXTRAS", legacyName: "04_EXTRAS", role: FolderRole.SAGA_EXTRAS },
        { name: "RECURSOS", legacyName: "99_RECURSOS", role: FolderRole.RESOURCES }
    ];

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        // 0. Resolve Root Folder (Validation & Creation)
        let targetRootId = rootFolderId;
        const configUpdates: any = {};
        let rootFolderName = newProjectName || "Unknown Project";

        // 🟢 VALIDATION: Check if provided ID actually exists (was not deleted outside)
        if (targetRootId) {
            try {
                const meta = await drive.files.get({ fileId: targetRootId, fields: "id, name, trashed" });
                if (meta.data.trashed) {
                    logger.warn(`⚠️ Target Root ${targetRootId} is in TRASH. Treating as missing.`);
                    targetRootId = null; // Force recreation
                } else {
                    rootFolderName = meta.data.name || rootFolderName;
                }
            } catch (e: any) {
                logger.warn(`⚠️ Target Root ${targetRootId} not found (404). Treating as missing.`);
                targetRootId = null; // Force recreation
            }
        }

        if (!targetRootId) {
            if (newProjectName) {
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
                rootFolderName = newProjectName;
            } else {
                // We needed a root but found none and have no name to create one
                throw new HttpsError("failed-precondition", "La carpeta del proyecto no existe y no se proporcionó un nombre para crear una nueva.");
            }
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
             const check = await drive.files.list({ q, fields: "files(id, name)" });
             if (!check.data.files?.length) {
                 const subRes = await drive.files.create({
                     requestBody: {
                         name: "Libro_01",
                         mimeType: "application/vnd.google-apps.folder",
                         parents: [sagaId]
                     },
                     fields: "id"
                 });
                 // Track for Index
                 const match = createdFolders.find(f => f.id === sagaId);
                 if (match) {
                     if (!match.children) match.children = [];
                     match.children.push({
                         id: subRes.data.id,
                         name: "Libro_01",
                         type: "folder",
                         mimeType: "application/vnd.google-apps.folder"
                     });
                 }
             }
        }

        // 🟢 2.5. AUTO-INDEX (TITANIUM V2)
        try {
            const filesCollection = db.collection("TDB_Index").doc(userId).collection("files");
            const batch = db.batch();
            const now = new Date().toISOString();

            const addToBatch = (node: any, parentId: string | null) => {
                const ref = filesCollection.doc(node.id);
                batch.set(ref, {
                    id: node.id,
                    name: node.name,
                    type: node.type || 'folder',
                    mimeType: node.mimeType || 'application/vnd.google-apps.folder',
                    parentId: parentId,
                    driveId: node.id,
                    updatedAt: now,
                    lastIndexed: now,
                    category: 'canon', // Default for struct
                    isGhost: false
                }, { merge: true });

                if (node.children) {
                    node.children.forEach((child: any) => addToBatch(child, node.id));
                }
            };

            // createdFolders has { id, name, children... }
            for (const folder of createdFolders) {
                // Top level folders have parent = targetRootId
                addToBatch(folder, targetRootId);
            }

            await batch.commit();
            logger.info("🌳 Auto-indexed fresh Titanium structure (V2 Collection).");

        } catch (idxErr) {
            logger.warn("⚠️ Failed to auto-index structure:", idxErr);
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
        enforceAppCheck: false,
        memory: "1GiB",
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

            // 🛡️ SENTINEL CHECK: Input Length
            if (safeName.length > MAX_FILENAME_LENGTH) {
                throw new HttpsError("invalid-argument", `El nombre excede el límite de ${MAX_FILENAME_LENGTH} caracteres.`);
            }

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

/**
 * 2.4. MOVER A PAPELERA (The Shredder)
 * Mueve múltiples archivos/carpetas a la papelera de Drive.
 */
export const trashDriveItems = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "1GiB", // 🟢 INCREASE MEMORY
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { accessToken, fileIds } = request.data;
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
        if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
            throw new HttpsError("invalid-argument", "Falta lista de IDs (fileIds).");
        }

        // 🛡️ SENTINEL CHECK: Batch Size (DoS Prevention)
        if (fileIds.length > MAX_BATCH_SIZE) {
            throw new HttpsError("invalid-argument", `El lote excede el límite de ${MAX_BATCH_SIZE} elementos.`);
        }

        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            logger.info(`🗑️ Trashing ${fileIds.length} items for user ${userId}`);

            let successCount = 0;
            const errors: any[] = [];
            const deletedIds: string[] = [];

            // Execute Sequentially to be safe, or Promise.all for speed.
            // Promise.all is fine for reasonable batch sizes.
            await Promise.all(fileIds.map(async (fileId: string) => {
                try {
                    await drive.files.update({
                        fileId: fileId,
                        requestBody: {
                            trashed: true
                        }
                    });

                    deletedIds.push(fileId);
                    successCount++;
                } catch (e: any) {
                    logger.error(`   ❌ Failed to trash item ${fileId}:`, e.message);
                    errors.push({ id: fileId, error: e.message });
                }
            }));

            // 🟢 PERSISTENCE: Batch Update Firestore Tree (Sync Memory)
            if (deletedIds.length > 0) {
                await updateFirestoreTreeBatch(userId, 'delete', deletedIds);

                // 🟢 CLEANUP VECTORS (RAG)
                // Process cleanups in parallel without blocking response too much
                // (Though strictly we should await to ensure consistency)
                await Promise.all(deletedIds.map(fid => deleteFileVectors(db, userId, fid)));
            }

            if (successCount === 0 && errors.length > 0) {
                throw new HttpsError("aborted", "No se pudo eliminar ningún elemento.", errors);
            }

            logger.info(`✅ Trash complete. Success: ${successCount}, Failures: ${errors.length}`);
            return { success: true, count: successCount, errors };

        } catch (error: any) {
            logger.error("Error trashing items:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

/**
 * 2.5. OBTENER METADATA EN LOTE (The Label Reader)
 * Obtiene nombres y metadatos básicos para una lista de IDs.
 * Útil para la UI de configuración.
 */
export const getBatchDriveMetadata = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { accessToken, fileIds } = request.data;
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
        if (!fileIds || !Array.isArray(fileIds)) {
            throw new HttpsError("invalid-argument", "Falta lista de IDs (fileIds).");
        }

        // Limit batch size
        if (fileIds.length > 50) {
             throw new HttpsError("invalid-argument", "Too many IDs.");
        }

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            const results: Record<string, { name: string, mimeType: string }> = {};

            // Promise.all for parallel fetch
            await Promise.all(fileIds.map(async (id) => {
                if (!id) return;
                try {
                    const res = await drive.files.get({
                        fileId: id,
                        fields: "id, name, mimeType",
                        supportsAllDrives: true
                    });
                    if (res.data.id && res.data.name) {
                        results[res.data.id] = {
                            name: res.data.name,
                            mimeType: res.data.mimeType || 'unknown'
                        };
                    }
                } catch (e: any) {
                    logger.warn(`Failed to fetch metadata for ${id}:`, e.message);
                    // Return placeholder
                     results[id] = {
                            name: "Inaccesible / Borrado",
                            mimeType: "error"
                        };
                }
            }));

            return { metadata: results };

        } catch (error: any) {
            logger.error("Error in getBatchDriveMetadata:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

/**
 * 2.6. GET FILE SYSTEM NODES (Lazy Loader)
 * Queries the 'files' collection by parentId.
 */
export const getFileSystemNodes = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "256MiB", // Lightweight
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { folderId, rootId } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            // Determine Target Parent
            // If folderId is provided, use it.
            // If not, we might be at root.
            // The frontend should pass the Project Root ID as folderId for top level.
            // If folderId is missing, we can try to look up project config.

            let targetParentId = folderId;

            if (!targetParentId && rootId) {
                targetParentId = rootId;
            }

            if (!targetParentId) {
                 const configRef = db.collection("users").doc(userId).collection("profile").doc("project_config");
                 const configSnap = await configRef.get();
                 if (configSnap.exists) {
                     targetParentId = configSnap.data()?.folderId;
                 }
            }

            if (!targetParentId) {
                // If still no parent, return empty
                return { files: [] };
            }

            // Query Files Collection
            const q = db.collection("TDB_Index").doc(userId).collection("files")
                        .where("parentId", "==", targetParentId)
                        .orderBy("name", "asc"); // Can sort by type in memory if needed, or composite index

            const snapshot = await q.get();

            const files = snapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    name: d.name,
                    mimeType: d.mimeType || (d.type === 'folder' ? 'application/vnd.google-apps.folder' : 'text/markdown'),
                    children: [], // Lazy load
                    driveId: d.driveId || doc.id,
                    parentId: d.parentId
                };
            });

            // Sort folders first manually to avoid composite index requirement for now
            files.sort((a, b) => {
                const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
                const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
                if (aIsFolder && !bIsFolder) return -1;
                if (!aIsFolder && bIsFolder) return 1;
                return 0; // Already sorted by name via query
            });

            return { files };

        } catch (error: any) {
            logger.error("Error fetching file system nodes:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
