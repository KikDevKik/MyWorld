import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey } from "./utils/security";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";

// --- RE-EXPORTS (Modular Architecture) ---

export { exchangeAuthCode, refreshDriveToken, revokeDriveAccess } from './auth';
export { auditContent, purgeEcho, scanProjectDrift, rescueEcho } from './guardian';
export { scribeCreateFile, integrateNarrative, scribePatchFile, transformToGuide, syncSmart } from './scribe';
export { 
  discoverFolderRoles, 
  createTitaniumStructure, 
  renameDriveFolder, 
  trashDriveItems, 
  getBatchDriveMetadata, 
  getFileSystemNodes 
} from './folder_manager';
export { nukeProject, purgeForgeDatabase } from './nuke';
export { 
  scanVaultHealth, 
  purgeArtifacts, 
  purgeEmptySessions, 
  purgeForgeEntities, 
  relinkAnchor 
} from './janitor';
export { classifyResource } from './laboratory';
export { acquireLock, releaseLock, checkIndexStatus } from './librarian';
export { crystallizeGraph, crystallizeForgeEntity } from './crystallization';
export { generateAuditPDF, generateCertificate } from './audit';
export { analyzeStyleDNA } from './analyst';
export { generateSpeech } from './tts';

// --- CORE HANDLERS (Bridge) ---

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_FILE_SAVE_BYTES = 5 * 1024 * 1024;

/**
 * PHASE 6.2: MATERIALIZATION (AI TOOLS)
 * Crea un archivo físico a petición de la IA.
 */
export const forgeToolExecution = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleApiKey],
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { title, content, folderId, accessToken } = request.data;
    if (!title || !content || !folderId) {
      throw new HttpsError("invalid-argument", "Faltan argumentos (title, content, folderId).");
    }

    if (typeof content === 'string' && content.length > MAX_FILE_SAVE_BYTES) {
        throw new HttpsError("resource-exhausted", `Content exceeds limit of ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
    }

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    logger.info(`🔨 TOOL EXECUTION: Creating file '${title}' in ${folderId}`);

    try {
      const genesisResult = await TitaniumGenesis.birth({
          userId: userId,
          name: title,
          context: content,
          targetFolderId: folderId,
          accessToken: accessToken,
          projectId: folderId, 
          aiKey: getAIKey(request.data, googleApiKey.value()),
          role: "Tool Generated",
      });

      logger.info(`   ✅ Materialización exitosa: ${genesisResult.fileId}`);

      return {
        success: true,
        fileId: genesisResult.fileId,
        webViewLink: genesisResult.webViewLink,
        message: `Archivo '${title}' forjado con éxito.`
      };

    } catch (error: any) {
        logger.error("Forge Tool Execution Failed:", error);
        throw new HttpsError('internal', error.message);
    }
  }
);

/**
 * SAVE DRIVE FILE (Auto-Save Bridge)
 * Directly updates a file in Google Drive.
 */
export const saveDriveFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { fileId, content, accessToken } = request.data;
        if (!fileId || !content || !accessToken) throw new HttpsError("invalid-argument", "Missing params.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'text/markdown',
                    body: content
                }
            });

            logger.info(`💾 [SAVE] File updated: ${fileId}`);
            return { success: true };
        } catch (error: any) {
            logger.error("Save Drive File Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * GET DRIVE FILE CONTENT
 * Simple bridge to fetch content for the frontend.
 */
export const getDriveFileContent = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { fileId, accessToken } = request.data;
        if (!fileId || !accessToken) throw new HttpsError("invalid-argument", "Missing params.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            const { _getDriveFileContentInternal } = await import('./utils/drive');
            const content = await _getDriveFileContentInternal(drive, fileId);

            const meta = await drive.files.get({ fileId: fileId, fields: "name" });

            return { success: true, content: content, name: meta.data.name };
        } catch (error: any) {
            logger.error("Get Drive File Content Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * GET DRIVE FILES
 * Lists files in a specific folder.
 */
export const getDriveFiles = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { folderId, accessToken } = request.data;
        if (!folderId || !accessToken) throw new HttpsError("invalid-argument", "Missing params.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            const res = await drive.files.list({
                q: `'${folderId}' in parents and trashed = false`,
                fields: "files(id, name, mimeType, webViewLink)",
                spaces: 'drive',
            });

            return { success: true, files: res.data.files };
        } catch (error: any) {
            logger.error("Get Drive Files Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * SAVE PROJECT CONFIG
 * Persists project-specific settings to Firestore.
 */
export const saveProjectConfig = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                ...request.data,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            return { success: true };
        } catch (error: any) {
            logger.error("Save Project Config Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * FORGE MESSAGE MANAGEMENT
 */
export const addForgeMessage = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId, role, text } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
            await sessionRef.collection("messages").add({
                role,
                text,
                timestamp: FieldValue.serverTimestamp()
            });

            // Update session heartbeat
            await sessionRef.set({ lastActivity: FieldValue.serverTimestamp() }, { merge: true });

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

export const clearSessionMessages = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const messagesRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).collection("messages");
            const snapshot = await messagesRef.get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

export const deleteForgeSession = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).delete();
            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * UPDATE FORGE CHARACTER
 */
export const updateForgeCharacter = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { characterId, data } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(characterId).set({
                ...data,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * INDEX TDB (Stub for Indexing)
 * In a real scenario, this would trigger the full ingestion of a folder.
 */
export const indexTDB = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "1GiB",
        timeoutSeconds: 300,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        logger.info("🧠 [INDEX TDB] Indexing requested. (Logic should be implemented in a dedicated service)");
        
        // Return dummy success to unblock UI
        return { success: true, message: "Indexing protocol initiated (Simulation)." };
    }
);
