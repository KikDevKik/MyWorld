import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey } from "./utils/security";
import { TitaniumFactory } from "./services/factory";
import { TitaniumEntity } from "./types/ontology";
import { updateFirestoreTree } from "./utils/tree_utils";
import { GeminiEmbedder } from "./utils/vector_utils";
import { TaskType } from "@google/generative-ai";
import { ingestFile } from "./ingestion";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import * as crypto from 'crypto';

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

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { title, content, folderId, accessToken } = request.data;

    if (!title || !content || !folderId) {
      throw new HttpsError("invalid-argument", "Faltan argumentos (title, content, folderId).");
    }

    if (typeof content === 'string' && content.length > MAX_FILE_SAVE_BYTES) {
        throw new HttpsError("resource-exhausted", `Content exceeds limit of ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
    }

    if (!accessToken) {
      throw new HttpsError("unauthenticated", "Falta accessToken.");
    }

    const userId = request.auth.uid;
    const db = getFirestore();

    logger.info(`🔨 TOOL EXECUTION: Creating file '${title}' in ${folderId}`);

    try {
      // 🚀 TITANIUM GENESIS: BIRTH ENTITY
      const genesisResult = await TitaniumGenesis.birth({
          userId: userId,
          name: title,
          context: content,
          targetFolderId: folderId,
          accessToken: accessToken,
          projectId: folderId, // Assuming folderId is root or part of project
          aiKey: getAIKey(request.data, googleApiKey.value()),
          role: "Tool Generated",
          // Let AI infer traits from context/title
      });

      logger.info(`   ✅ Materialización exitosa: ${genesisResult.fileId}`);

      return {
        success: true,
        fileId: genesisResult.fileId,
        webViewLink: genesisResult.webViewLink,
        message: `Archivo '${title}' forjado con éxito.`
      };

    } catch (error: any) {
        // Fallback for custom logic if Genesis fails? No, Genesis handles it.
        logger.error("Forge Tool Execution Failed:", error);
        throw new HttpsError('internal', error.message);
    }
  }
);
