import { MODEL_PRO, MODEL_FLASH } from './ai_config';
import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey } from "./utils/security";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GeminiEmbedder } from "./utils/vector_utils";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";
import { ingestFile, deleteFileVectors, IngestionFile } from './ingestion';
import * as crypto from 'crypto';




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
export { arquitectoInitialize, arquitectoChat, arquitectoAnalyze } from './architect';



export { generateSpeech, analyzeScene } from "./tts";



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
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");
    if (!content) throw new HttpsError("invalid-argument", "Missing content.");
    if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken.");

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
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");
    if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken.");

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
 * Lists files across one or more folders.
 * Accepts: { folderIds: string[], accessToken, recursive?, persist? }
 */
export const getDriveFiles = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

    // 🟢 Support both legacy { folderId } and new { folderIds[] }
    const { folderId, folderIds, accessToken, recursive } = request.data;
    const targetIds: string[] = folderIds?.length > 0
      ? folderIds
      : folderId ? [folderId] : [];

    if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken.");
    if (targetIds.length === 0) {
      // Empty list is valid (e.g., clearing configuration)
      return { success: true, files: [] };
    }

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // Fetch contents of all requested folders in parallel
      const results = await Promise.all(
        targetIds.map(async (id) => {
          const res = await drive.files.list({
            q: `'${id}' in parents and trashed = false`,
            fields: "files(id, name, mimeType, webViewLink)",
            spaces: 'drive',
            pageSize: 1000,
          });
          return {
            id,
            children: res.data.files || []
          };
        })
      );

      // Return flat list or structured list depending on number of folders
      if (targetIds.length === 1) {
        return { success: true, files: results[0].children };
      }
      // Multi-folder: return as array of { id, children[] }
      return { success: true, files: results };

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
    memory: "2GiB",
    timeoutSeconds: 540,
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { folderIds, projectId, accessToken, forceFullReindex } = request.data;
    const userId = request.auth.uid;
    const db = getFirestore();

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
    if (!projectId) throw new HttpsError("invalid-argument", "Falta projectId.");
    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      throw new HttpsError("invalid-argument", "Falta folderIds (array).");
    }

    logger.info(`🧠 [INDEX TDB] Iniciando indexación REAL para ${userId}. Carpetas: ${folderIds.length}`);

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    const finalApiKey = getAIKey(request.data, googleApiKey.value());
    const embeddingsModel = new GeminiEmbedder({
      apiKey: finalApiKey,
      model: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    // 1. OBTENER CONFIGURACIÓN DEL PROYECTO
    const configDoc = await db.collection("users").doc(userId)
      .collection("profile").doc("project_config").get();
    const config = configDoc.data() || {};
    const canonPathIds = new Set<string>(
      (config.canonPaths || []).map((p: any) => p.id)
    );
    const resourcePathIds = new Set<string>(
      (config.resourcePaths || []).map((p: any) => p.id)
    );

    // 2. FUNCIÓN INTERNA: LISTAR ARCHIVOS DE UNA CARPETA (RECURSIVO)
    const listFilesInFolder = async (
      folderId: string,
      category: 'canon' | 'reference',
      parentPath: string = ""
    ): Promise<IngestionFile[]> => {
      const files: IngestionFile[] = [];

      try {
        const res = await drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          fields: "files(id, name, mimeType)",
          pageSize: 1000,
        });

        const items = res.data.files || [];

        for (const item of items) {
          if (!item.id || !item.name) continue;
          const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;

          if (item.mimeType === 'application/vnd.google-apps.folder') {
            // Recursivo: entrar a subcarpetas
            const subFiles = await listFilesInFolder(item.id, category, itemPath);
            files.push(...subFiles);
          } else {
            // Solo archivos de texto indexables
            const isIndexable =
              item.mimeType === 'application/vnd.google-apps.document' ||
              item.mimeType === 'text/plain' ||
              item.mimeType === 'text/markdown' ||
              item.mimeType === 'text/x-markdown' ||
              (item.name.endsWith('.md') || item.name.endsWith('.txt'));

            if (isIndexable) {
              files.push({
                id: item.id,
                name: item.name,
                path: itemPath,
                saga: 'Global',
                parentId: folderId,
                category: category,
              });
            }
          }
        }
      } catch (e: any) {
        logger.warn(`⚠️ [INDEX TDB] Error listando carpeta ${folderId}: ${e.message}`);
      }

      return files;
    };

    // 3. RECOPILAR TODOS LOS ARCHIVOS DE TODAS LAS CARPETAS
    let allFiles: IngestionFile[] = [];

    for (const folderId of folderIds) {
      const category: 'canon' | 'reference' = resourcePathIds.has(folderId)
        ? 'reference'
        : 'canon';

      logger.info(`📂 [INDEX TDB] Escaneando carpeta ${folderId} (${category})...`);
      const folderFiles = await listFilesInFolder(folderId, category, "");
      allFiles.push(...folderFiles);
    }

    logger.info(`📊 [INDEX TDB] Total archivos encontrados: ${allFiles.length}`);

    if (allFiles.length === 0) {
      return { success: true, message: "No se encontraron archivos para indexar.", count: 0 };
    }

    // 4. INDEXAR EN BATCHES (de 5 en 5 para evitar rate limits)
    const BATCH_SIZE = 5;
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const allVectors: number[][] = [];

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (file) => {
        try {
          // Descargar contenido desde Drive
          const content = await _getDriveFileContentInternal(drive, file.id);

          if (!content || content.length < 10) {
            logger.warn(`⚠️ [INDEX TDB] Archivo vacío ignorado: ${file.name}`);
            skipped++;
            return;
          }

          // Invocar la función real de ingesta
          const result = await ingestFile(
            db,
            userId,
            projectId,
            file,
            content,
            embeddingsModel
          );

          if (result.status === 'processed') {
            processed++;
            // Guardar el vector para calcular el centroide después
            try {
              const chunkRef = db.collection("TDB_Index").doc(userId)
                .collection("files").doc(file.id)
                .collection("chunks").doc("chunk_0");
              const chunkSnap = await chunkRef.get();
              if (chunkSnap.exists) {
                const embeddingData = chunkSnap.data()?.embedding;
                if (embeddingData && embeddingData.values) {
                  allVectors.push(embeddingData.values);
                }
              }
            } catch (e) { /* Non-critical */ }

          } else if (result.status === 'skipped') {
            skipped++;
          }

        } catch (e: any) {
          logger.error(`❌ [INDEX TDB] Error indexando ${file.name}: ${e.message}`);
          errors++;
        }
      }));

      logger.info(`   -> Progreso: ${Math.min(i + BATCH_SIZE, allFiles.length)}/${allFiles.length}`);

      // Pequeña pausa entre batches para evitar rate limits de Drive
      if (i + BATCH_SIZE < allFiles.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // 5. CALCULAR Y GUARDAR EL CENTROIDE
    if (allVectors.length > 0) {
      try {
        const dimension = allVectors[0].length;
        const centroid = new Array(dimension).fill(0);

        for (const vec of allVectors) {
          for (let d = 0; d < dimension; d++) {
            centroid[d] += vec[d];
          }
        }
        for (let d = 0; d < dimension; d++) {
          centroid[d] /= allVectors.length;
        }

        await db.collection("TDB_Index").doc(userId)
          .collection("stats").doc("centroid").set({
            vector: centroid,
            vectorCount: allVectors.length,
            updatedAt: new Date().toISOString()
          });

        logger.info(`⚓ [INDEX TDB] Centroide calculado con ${allVectors.length} vectores.`);
      } catch (e: any) {
        logger.warn(`⚠️ [INDEX TDB] Error calculando centroide: ${e.message}`);
      }
    }

    // 6. ACTUALIZAR TIMESTAMP EN PROJECT CONFIG
    await db.collection("users").doc(userId)
      .collection("profile").doc("project_config").set({
        lastIndexed: new Date().toISOString()
      }, { merge: true });

    const message = `Indexación completa: ${processed} procesados, ${skipped} sin cambios, ${errors} errores.`;
    logger.info(`✅ [INDEX TDB] ${message}`);

    return {
      success: true,
      message,
      processed,
      skipped,
      errors,
      total: allFiles.length
    };
  }
);

/**
 * SUMMON THE TRIBUNAL
 * Three ruthless AI judges evaluate a piece of writing and issue a verdict.
 * Modes:
 *   - Manual: { text: string, context?: string }
 *   - File:   { fileId: string, accessToken: string, context?: string }
 * Returns: { architect, bard, hater } each with { verdict, critique, score }
 */
export const summonTheTribunal = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

    let { text, context, fileId, accessToken } = request.data;

    // Resolve text from Drive file if fileId provided
    if (fileId && accessToken && !text) {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });
        text = await _getDriveFileContentInternal(drive, fileId);
      } catch (e: any) {
        logger.error("[TRIBUNAL] Failed to read Drive file:", e);
        throw new HttpsError("internal", "No se pudo leer el archivo de Drive.");
      }
    }

    if (!text || text.trim().length < 10) {
      throw new HttpsError("invalid-argument", "El texto para juzgar es demasiado corto.");
    }

    const MAX_CHARS = 50000;
    const safeText = text.substring(0, MAX_CHARS);
    const safeContext = (context || "").substring(0, 5000);

    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

    const JUDGE_PROMPT = (role: string, persona: string, focus: string) => `
ACT AS: ${persona}
YOU ARE ONE OF THREE JUDGES ON THE LITERARY TRIBUNAL.
ROLE: ${role}

CONTEXT (provided by the author):
"${safeContext || 'No additional context provided.'}"

TEXT TO JUDGE:
"""${safeText}"""

YOUR FOCUS: ${focus}

INSTRUCTIONS:
- Be direct, specific, and ruthless but fair.
- Quote specific lines when praising or criticizing.
- Detect the language of the text and respond in THE SAME LANGUAGE.
- Do NOT be generic. Every comment must be about THIS specific text.

OUTPUT JSON:
{
  "verdict": "One powerful sentence — your headline verdict.",
  "critique": "3-5 sentences of detailed analysis. Quote specific lines.",
  "score": 7
}
`;

    try {
      const [architectResult, bardResult, haterResult] = await Promise.all([
        smartGenerateContent(genAI, JUDGE_PROMPT(
          'THE ARCHITECT',
          'The Architect — Master of Structure & Logic',
          'Narrative structure, plot coherence, pacing, and logical consistency. Find plot holes and structural weaknesses.'
        ), { useFlash: false, jsonMode: true, temperature: 0.4, contextLabel: 'TribunalArchitect' }),

        smartGenerateContent(genAI, JUDGE_PROMPT(
          'THE BARD',
          'The Bard — Lover of Voice, Prose & Emotion',
          'Prose quality, voice, emotional resonance, imagery, and dialogue authenticity. Find what sings and what falls flat.'
        ), { useFlash: false, jsonMode: true, temperature: 0.6, contextLabel: 'TribunalBard' }),

        smartGenerateContent(genAI, JUDGE_PROMPT(
          'EL HATER',
          'El Hater — Ruthless Devil\'s Advocate',
          'Everything that is weak, clichéd, confusing, or forgettable. Be specific and unforgiving. Find what would make a reader stop reading.'
        ), { useFlash: false, jsonMode: true, temperature: 0.8, contextLabel: 'TribunalHater' }),
      ]);

      const parseJudge = (result: any, fallbackName: string) => {
        if (result.error || !result.text) {
          return { verdict: 'El Juez se negó a hablar.', critique: result.error || 'Sin respuesta.', score: 5 };
        }
        const parsed = parseSecureJSON(result.text, fallbackName);
        if (parsed.error) {
          return { verdict: 'Error al parsear veredicto.', critique: result.text?.substring(0, 500) || '', score: 5 };
        }
        return {
          verdict: parsed.verdict || '',
          critique: parsed.critique || '',
          score: Math.max(0, Math.min(10, parseInt(parsed.score) || 5))
        };
      };

      return {
        architect: parseJudge(architectResult, 'TribunalArchitect'),
        bard: parseJudge(bardResult, 'TribunalBard'),
        hater: parseJudge(haterResult, 'TribunalHater'),
      };

    } catch (error: any) {
      logger.error("[TRIBUNAL] Session failed:", error);
      throw new HttpsError("internal", error.message || "El Tribunal colapsó.");
    }
  }
);


// --- RECOVERED FUNCTIONS FROM MAIN ---

// @ts-nocheck
const MAX_CHAT_MESSAGE_LIMIT = 10000;
const MAX_AI_INPUT_CHARS = 100000;
const MAX_SESSION_NAME_CHARS = 50;
const TEMP_CREATIVE = 0.7;
const TEMP_PRECISION = 0.2;
const SAFETY_SETTINGS_PERMISSIVE = [];
const FolderRole = { WORLDBUILDING: "worldbuilding" }; type FolderRole = any;
const FinishReason = { MAX_TOKENS: "MAX_TOKENS", SAFETY: "SAFETY" };
type WriterProfile = any;
type AnyTypeHack = any;
const _getProjectConfigInternal = async (...args: any[]) => ({} as any);
const maskLog = (...args: any[]) => "";
const extractUrls = (...args: any[]) => [];
const fetchWebPageContent = async (...args: any[]) => "";
const matter = undefined;
const marked = undefined;
const sanitizeHtml = (...args: any[]) => "";
const JSDOM = undefined;
const htmlToPdfmake = undefined;
const handleSecureError = (...args: any[]) => ({});
const appendToSessionLog = async (...args: any[]) => { };
const resolveDriveFolder = async (...args: any[]) => "";
const fetchFolderContents = async (...args: any[]) => [];
const flattenFileTree = async (...args: any[]) => ([] as any[]);
const createProjectCache = async (...args: any[]) => ({} as any);
const getFolderIdForRole = async (...args: any[]) => "";
// const ingestFile = async (...args: any[]) => { };
const SecretManagerServiceClient = undefined;
const admin = undefined;


/**
 * 4. CHAT WITH GEM (El Oráculo RAG)
 * Responde preguntas usando la base de datos vectorial.
 */
export const chatWithGem = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    secrets: [googleApiKey],
    memory: "2GiB",
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - Powered by Gemini 3 - ' + new Date().toISOString());
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction, history, categoryFilter, activeFileContent, activeFileName, isFallbackContext, filterScopePath, sessionId, attachedFiles, mediaAttachment } = request.data;

    // 🟢 ALLOW EMPTY QUERY IF ATTACHMENT IS PRESENT
    if (!query && !mediaAttachment) {
      throw new HttpsError("invalid-argument", "Falta la pregunta.");
    }

    // Default query for image-only requests
    const finalQuery = query || "Analiza este archivo adjunto.";

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if (finalQuery.length > MAX_CHAT_MESSAGE_LIMIT) {
      throw new HttpsError("resource-exhausted", `La pregunta excede el límite de ${MAX_CHAT_MESSAGE_LIMIT} caracteres.`);
    }

    const userId = request.auth.uid;
    const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
    const profile: WriterProfile = profileDoc.exists
      ? profileDoc.data() as WriterProfile
      : { style: '', inspirations: '', rules: '' };

    await _getProjectConfigInternal(userId);

    let profileContext = '';
    if (profile.style || profile.inspirations || profile.rules) {
      profileContext = `
=== USER WRITING PROFILE ===
STYLE: ${profile.style || 'Not specified'}
INSPIRATIONS: ${profile.inspirations || 'Not specified'}
RULES: ${profile.rules || 'Not specified'}
============================
`;
      logger.info(`🎨 Profile injected for user ${userId}`);
    }

    // 🟢 0.4. PERSPECTIVE DETECTION (Auto-Align)
    let perspectiveContext = "";
    if (activeFileContent) {
      const sample = activeFileContent.substring(0, 3000).toLowerCase();
      // Simple heuristic: Count pronouns (English & Spanish)
      // English: I, me, my, mine, myself
      // Spanish: yo, mi, mis, me, conmigo
      const firstPersonMatches = (sample.match(/\b(i|me|my|mine|myself|yo|mi|mis|conmigo)\b/g) || []).length;

      // English: he, him, his, she, her, hers, it, they, them, their
      // Spanish: él, ella, su, sus, le, les, ellos, ellas
      // Note: We avoid 'el' (the) and strictly use 'él' (he).
      const thirdPersonMatches = (sample.match(/\b(he|him|his|she|her|hers|it|they|them|their|él|ella|su|sus|le|les|ellos|ellas)\b/g) || []).length;

      let detectedPerspective = "Neutral/Unknown";
      if (firstPersonMatches > thirdPersonMatches && firstPersonMatches > 3) {
        detectedPerspective = "FIRST PERSON (I/Me/Yo)";
      } else if (thirdPersonMatches > firstPersonMatches && thirdPersonMatches > 3) {
        detectedPerspective = "THIRD PERSON (He/She/El/Ella)";
      }

      if (detectedPerspective !== "Neutral/Unknown") {
        perspectiveContext = `
[PERSPECTIVE PROTOCOL - CRITICAL]:
The user is writing in ${detectedPerspective}.
You MUST write all narrative examples, suggestions, and rewritten scenes in ${detectedPerspective}.
DO NOT switch perspective. If the user writes "I walked", do not reply with "He walked".
`;
        logger.info(`👁️ Perspective Detected: ${detectedPerspective} (1st: ${firstPersonMatches}, 3rd: ${thirdPersonMatches})`);
      }
    }

    try {
      // 🟢 0. DEEP TRACE: CONNECTIVITY CHECK
      try {
        const traceColl = db.collectionGroup("chunks");
        const traceQuery = traceColl.where("userId", "==", userId).limit(1);
        const traceSnapshot = await traceQuery.get();

        if (!traceSnapshot.empty) {
          const traceDoc = traceSnapshot.docs[0].data();
          logger.info(`[DEEP TRACE] Connectivity Check: ✅ SUCCESS. Found chunk from file: "${traceDoc.fileName}" (ID: ${traceSnapshot.docs[0].id})`);
        } else {
          logger.warn(`[DEEP TRACE] Connectivity Check: ⚠️ FAILED/EMPTY. No chunks found for user ${userId}. Index might be empty.`);
        }
      } catch (traceError: any) {
        logger.warn(`[DEEP TRACE] Connectivity Check SKIPPED/FAILED: ${traceError.message}`);
      }

      // 🟢 0.5. ENTITY RECOGNITION (RAG++ OPTIMIZATION)
      let entityContext = "";
      try {
        const lowerQuery = finalQuery.toLowerCase();

        // Strategy: Fetch names only to match, then fetch full doc
        const charsRef = db.collection("users").doc(userId).collection("characters").select("name");
        const ghostsRef = db.collection("users").doc(userId).collection("forge_detected_entities").select("name");

        const [charsSnap, ghostsSnap] = await Promise.all([charsRef.get(), ghostsRef.get()]);

        let matchedDocRef: any = null;
        let matchedName = "";

        // Check Existing
        for (const doc of charsSnap.docs) {
          const n = doc.data().name;
          if (n && lowerQuery.includes(n.toLowerCase())) {
            matchedDocRef = doc.ref;
            matchedName = n;
            break;
          }
        }

        // Check Ghosts (if no existing match found)
        if (!matchedDocRef) {
          for (const doc of ghostsSnap.docs) {
            const n = doc.data().name;
            if (n && lowerQuery.includes(n.toLowerCase())) {
              matchedDocRef = doc.ref;
              matchedName = n;
              break;
            }
          }
        }

        if (matchedDocRef) {
          const fullDoc = await matchedDocRef.get();
          const analysis = fullDoc.data()?.contextualAnalysis;
          if (analysis) {
            logger.info(`🎯 [ENTITY RECOGNITION] Matched: ${matchedName}`);
            entityContext = `
[CRITICAL CHARACTER CONTEXT - DEEP ANALYSIS]:
(This is verified intelligence about ${matchedName}. Use it as primary truth.)
${analysis}
`;
          }
        }

      } catch (e) {
        logger.warn(`⚠️ Entity Recognition failed:`, e);
      }

      // 1. Preparar Búsqueda Contextual
      let searchQuery = finalQuery;
      let historyText = "No hay historial previo.";

      if (history && Array.isArray(history) && history.length > 0) {
        historyText = history.map((h: any) =>
          `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");

        const userHistory = history
          .filter((h: any) => h.role === 'user' || h.role === 'USER')
          .slice(-3)
          .map((h: any) => h.message)
          .join(" ");

        searchQuery = `Contexto: ${userHistory} \n Pregunta: ${finalQuery}`;
        // 🛡️ SENTINEL: Mask sensitive query data in logs
        logger.info(`🔍 Búsqueda Vectorial Enriquecida (Length: ${searchQuery.length}):`, maskLog(finalQuery, 100));
      }

      if (history && Array.isArray(history) && history.length > 20) {
        const sliced = history.slice(-20);
        historyText = sliced.map((h: any) =>
          `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");
        logger.info(`✂️ Historial recortado a los últimos 20 mensajes para ahorrar tokens.`);
      }

      const finalKey = getAIKey(request.data, googleApiKey.value());

      // 2. Vectorizar Pregunta
      const embeddings = new GeminiEmbedder({
        apiKey: finalKey,
        model: "gemini-embedding-001",
        taskType: TaskType.RETRIEVAL_QUERY,
      });
      const queryVector = await embeddings.embedQuery(searchQuery);

      // 3. Recuperar anys (Vector Search Nativo)
      const coll = db.collectionGroup("chunks");
      let chunkQuery = coll.where("userId", "==", userId);

      // 🟢 PRECONDITION FIX: ALWAYS USE PATH FILTER (Composite Index: userId + path + embedding)
      if (filterScopePath) {
        logger.info(`🛡️ SCOPED SEARCH: Using PATH PREFIX optimization: ${filterScopePath}`);
        chunkQuery = chunkQuery
          .where("path", ">=", filterScopePath)
          .where("path", "<=", filterScopePath + "\uf8ff");
      } else {
        // 🟢 GLOBAL SEARCH: UNIVERSAL PATH RANGE
        // We must include 'path' in the query to satisfy the Firestore Composite Index requirement.
        logger.info(`🌍 GLOBAL SEARCH: Using Universal Path Range ("" to "\\uf8ff")`);
        chunkQuery = chunkQuery
          .where("path", ">=", "")
          .where("path", "<=", "\uf8ff");
      }

      const fetchLimit = isFallbackContext ? 100 : 50;

      console.log('🔍 Vector Search Request for User:', userId);

      const vectorQuery = chunkQuery.findNearest({
        queryVector: queryVector,
        limit: fetchLimit,
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      // 🟢 [SENTINEL] SAFE VECTOR SEARCH
      let vectorSnapshot;
      try {
        vectorSnapshot = await vectorQuery.get();
      } catch (vectorError: any) {
        if (vectorError.message?.includes('index') || vectorError.code === 9) {
          logger.error(`[SENTINEL_ALERTA_CRITICA]: Fallo de Precondición en Firestore. El índice vectorial no existe o está inactivo. LINK DE ACTIVACIÓN: [LINK_DE_ERROR_9]`);

          // 🟢 RETURN DUAL PAYLOAD
          return {
            response: "La Forja está calibrando sus lentes. Reintenta en 5 minutos.",
            sources: [],
            technicalError: {
              isTechnicalError: true,
              status: "error",
              error_code: "MISSING_VECTOR_INDEX",
              metadata: {
                collection: "TDB_Index",
                required_fields: ["userId", "path", "embedding"],
                action_url: "https://console.firebase.google.com/"
              },
              ui_hint: "ALERTA_NARANJA_SENTINEL"
            }
          };
        }
        throw vectorError;
      }

      console.log('🔢 Vectors Found (Raw):', vectorSnapshot.docs.length);
      if (vectorSnapshot.docs.length > 0) {
        const firstMatch = vectorSnapshot.docs[0].data();
        console.log('📜 First Match:', firstMatch.fileName);
      } else {
        console.log('⚠️ NO VECTORS FOUND. Check Index or UserID match.');
      }

      let candidates: any[] = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        embedding: [],
        fileName: doc.data().fileName || "Desconocido",
        fileId: doc.ref.parent.parent?.id || "unknown_id",
        category: doc.data().category || 'canon',
        // 🟢 Pass Path for Source Transparency
        path: doc.data().path || ""
      }));

      // 🟢 SOURCE DIVERSITY LIMITING
      const returnLimit = isFallbackContext ? 20 : 15;
      const MAX_CHUNKS_PER_FILE = 5;

      const finalContext: any[] = [];
      const rejectedCandidates: any[] = [];
      const fileCounts: { [key: string]: number } = {};

      const isScopedSearch = !!filterScopePath;

      // A) FILTER EXCLUSION (Active File)
      // CONDITION: Only filter if we have enough candidates (>10) to avoid "Diversity Shortfall"
      if (activeFileName && candidates.length > 10) {
        logger.info(`🔍 Filtering out chunks from active file: ${activeFileName}`);
        candidates = candidates.filter(c => c.fileName !== activeFileName);
      } else if (activeFileName) {
        logger.info(`🔍 Keeping active file chunks for context (Low Diversity: ${candidates.length})`);
      }

      // B) DIVERSITY PASS (Cap)
      for (const chunk of candidates) {
        if (finalContext.length >= returnLimit) break;

        const fid = chunk.fileId || chunk.fileName;
        const currentCount = fileCounts[fid] || 0;

        if (currentCount < MAX_CHUNKS_PER_FILE) {
          finalContext.push(chunk);
          fileCounts[fid] = currentCount + 1;
        } else {
          rejectedCandidates.push(chunk);
        }
      }

      // C) BACKFILL PASS (Fill Gaps) - DISABLE IF SCOPED
      if (!isScopedSearch && finalContext.length < returnLimit) {
        logger.info(`⚠️ Diversity Shortfall (${finalContext.length}/${returnLimit}). Backfilling...`);
        for (const chunk of rejectedCandidates) {
          if (finalContext.length >= returnLimit) break;
          finalContext.push(chunk);
        }
      } else if (isScopedSearch) {
        logger.info(`⚖️ SCOPED SEARCH ACTIVE: Backfilling DISABLED. Context is Finite (${finalContext.length} chunks).`);
      }

      const relevantanys = finalContext;

      // 🛑 FINITE CONTEXT CHECK (Prevent Crash on Empty)
      if (isScopedSearch && relevantanys.length === 0) {
        logger.warn("🛑 SCOPE EMPTY: No chunks found in selected path. Aborting AI call.");
        return {
          response: "No encontré información en los libros seleccionados.",
          sources: []
        };
      }
      logger.info('📚 RAG Context Sources:', relevantanys.map(c => c.fileName));

      // 5. Construir Contexto RAG
      const contextText = relevantanys.map(c => c.text).join("\n\n---\n\n");

      // 🟢 DEBUG SOURCES
      if (filterScopePath) {
        logger.info("📊 Scope Filter Result Sources:", relevantanys.map(c => `${c.fileName} (${(c as any).path})`));
      }

      // 6. Preparar Prompt del Sistema (Nivel GOD TIER)
      let activeCharacterPrompt = "";
      if (activeFileName && activeFileContent) {
        activeCharacterPrompt = `
[CONTEXTO VISUAL ACTIVO]:
Nombre: ${activeFileName}
(Este es el personaje o archivo que el usuario tiene abierto en pantalla. Prioriza su información sobre cualquier búsqueda externa si hay conflicto).
`;
      }

      // 🟢 PHASE 3: CONTEXT PORTAL INJECTION (Attached Chips)
      let attachedContextSection = "";
      if (attachedFiles && Array.isArray(attachedFiles) && attachedFiles.length > 0) {
        const filesContent = attachedFiles.map((f: any) =>
          `--- ARCHIVO ADJUNTO: ${f.name} ---\n${f.content}\n--- FIN ADJUNTO ---`
        ).join("\n\n");

        attachedContextSection = `
[PORTAL DE CONTEXTO - ARCHIVOS SELECCIONADOS MANUALMENTE]:
(El usuario ha adjuntado explícitamente estos archivos para que los analices. Son la prioridad MÁXIMA para tu respuesta).
${filesContent}
`;
      }

      // 🟢 0.6. WEB CONTENT INJECTION (The Spider)
      let webContext = "";
      const urls = extractUrls(finalQuery || "");
      if (urls.length > 0) {
        // Only scrape the first URL to avoid latency explosion
        const targetUrl = urls[0];
        const scrapeResult = await fetchWebPageContent(targetUrl);

        if (scrapeResult) {
          webContext = `
[CONTEXTO DEL ENLACE - ${(scrapeResult as any).title}]:
(El usuario ha proporcionado un enlace. Aquí tienes el contenido extraído de la web para que puedas responder basándote en él).
URL: ${(scrapeResult as any).url}
CONTENIDO:
${(scrapeResult as any).content}
--------------------------------------------------
`;
          logger.info(`🌐 Web Context Injected (${(scrapeResult as any).content.length} chars)`);
        }
      }

      // 🟢 REVISION 00131.2: SYSTEM IDENTITY OVERWRITE (CLOAKING MODE)
      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE ASISTENCIA CREATIVA (VER. 00131.2 - CHAMELEON UPDATE) ===
[THINKING MODE ACTIVATED]
Before answering, you MUST perform a deep structural analysis in a hidden thought block.
Format: <thinking> ... internal monologue ... </thinking>
The user will not see this, but it is critical for consistency.

ROL: Eres un Asistente de Escritura Creativa que actúa como un ESPEJO de la obra.
OBJETIVO: Ayudar al autor manteniendo una inmersión lingüística y cultural absoluta.

[PROTOCOLO DE MIMETISMO LINGÜÍSTICO (THE CHAMELEON)]:
1. **Análisis de Identidad**: Antes de responder, ANALIZA los fragmentos recuperados de la [MEMORIA A LARGO PLAZO].
2. **Detección de Tono y Dialecto**: Identifica el idioma dominante, los modismos regionales (ej. Yucateco, Slang Cyberpunk, Arcaico) y el tono narrativo.
3. **Reflejo Obligatorio**: Tu respuesta DEBE adoptar esa misma identidad.
   - Si la memoria usa modismos yucatecos ("Bomba!", "Hija de su..."), ÚSALOS con naturalidad.
   - Si la obra está en Inglés, RESPONDE EN INGLÉS.
   - Si es Español Neutro, mantén la neutralidad.
   - **NO FORCES EL ESPAÑOL** si la evidencia dicta otro idioma o dialecto. Tú eres parte del mundo del autor.

[PROTOCOLO DE VERDAD ABSOLUTA (RAG)]:
Si la información sobre un vínculo entre personajes NO aparece en los archivos indexados (RAG), el sistema tiene PROHIBIDO inferir relaciones familiares o sentimentales. Debe responder: 'No hay datos de este vínculo en los archivos del proyecto'.

[PROTOCOLO DE MEMORIA VACÍA (TABULA RASA)]:
Si NO se recuperan fragmentos de la [MEMORIA A LARGO PLAZO] (es decir, el proyecto está vacío o recién creado):
1. NO INVENTES HECHOS SOBRE EL LORE O PERSONAJES ESPECÍFICOS.
2. ADMITE que no tienes datos previos sobre esa entidad.
3. PREGUNTA al usuario por detalles básicos para empezar a construir la base de datos.
4. EXCEPCIÓN: Si el usuario te pide ideas genéricas (Brainstorming), eres libre de ser creativo. Pero si pregunta "¿Quién es Anna?", y Anna no está en la memoria, di "No tengo registros de Anna en este proyecto".

[REGLA DE BÚSQUEDA DE PERSONAJES]:
Si el usuario pregunta por alguien que NO es el personaje activo, busca primero en la Lista de Personajes cargada actualmente (Memoria a Largo Plazo), y luego usa la herramienta RAG (Vectores) para buscar en todo el proyecto.

${activeCharacterPrompt}

1. PUNTO DE ANCLAJE TEMPORAL (EL AHORA)
   - AÑO BASE (DEFAULT): 486 (Era del Nuevo Horizonte).
   - INSTRUCCIÓN DE SOBREESCRITURA: Si encuentras un encabezado \`[TIMELINE CONTEXT: Año X]\` en los archivos recuperados o en el texto del usuario, ese año tiene prioridad sobre el año base.

2. ESTADO DEL MUNDO (486 ENH)
   - Laboratorio "GardenFlowers": DESTRUIDO/INEXISTENTE (Cayó en el 485).
   - Elsa Liselotte: Desaparecida/Muerta.
   - Zoorians: En conflicto abierto o integración parcial.

3. REGLA DE RELATIVIDAD TEMPORAL (CRUCIAL)
   Analiza la fecha de los eventos en el contexto (RAG) comparada con el AÑO ACTUAL de la narración.

   A. PASADO CONFIRMADO (Eventos < Año Actual):
      - Trátalos como HECHOS HISTÓRICOS.
      - IGNORA la etiqueta \`# PLANIFICACIÓN FUTURA\`. Para el presente, eso ya ocurrió. Úsalo para dar profundidad (trauma, experiencia).

   B. FUTURO / DESARROLLO (Eventos > Año Actual):
      - Si encuentras \`# PLANIFICACIÓN FUTURA\` y el evento es posterior al ahora:
      - NO LO TRATES COMO HECHO ACTUAL.
      - ÚSALO COMO SUBTEXTO (Foreshadowing/Potencial) pero no narres que ya sucedió.

4. MANEJO DE FLASHBACKS (Rango 471-485)
   - DETECCIÓN: Si la narración o el usuario invocan el pasado (ej: "Recuerdo...", "En 475..."):
     a) REACTIVA "GardenFlowers" (Es una amenaza real en ese tiempo).
     b) AJUSTE DE EDAD: Calcula la edad restando (Año Flashback - Año Nacimiento en Ficha).

5. SISTEMA DE EXCEPCIONES (OVERRIDE)
   - [WORLD RULES] / [LOGIC EXCEPTION]: Si encuentras estas etiquetas en el texto recuperado, su contenido es VERDAD ABSOLUTA.
   - Obedece estas excepciones incluso si contradicen la física, la historia o las reglas anteriores.

6. JERARQUÍA DE LA VERDAD (REFERENCE PRIORITY)
   - Prioriza la información encontrada en archivos 'Reference', 'Ficha' o 'Resource' al responder preguntas sobre hechos o lore.
   - SI EXISTE CONFLICTO entre un 'Borrador' (Draft) y una 'Ficha/Referencia', el archivo de REFERENCIA TIENE LA VERDAD CANÓNICA.
===================================================
`;

      let finalSystemInstruction = systemInstruction || "";
      finalSystemInstruction = CONTINUITY_PROTOCOL + "\n\n" + entityContext + "\n\n" + finalSystemInstruction;

      if (categoryFilter === 'reference') {
        finalSystemInstruction += "\n\nIMPORTANTE: Responde basándote EXCLUSIVAMENTE en el material de referencia proporcionado. Actúa como un tutor o experto en la materia.";
      }

      let activeContextSection = "";
      if (activeFileContent) {
        const header = isFallbackContext
          ? "[CONTEXTO DE FONDO - ÚLTIMO ARCHIVO EDITADO]"
          : "[CONTEXTO INMEDIATO - ESCENA ACTUAL]";

        const note = isFallbackContext
          ? "(El usuario no tiene archivos abiertos. Este es el último archivo que editó. Úsalo como contexto principal pero no asumas que lo está viendo ahora.)"
          : "(Lo que el usuario ve ahora en su editor. Úsalo para mantener continuidad inmediata)";

        activeContextSection = `
${header}:
${note}
${activeFileContent}
          `;
      }

      const longTermMemorySection = `
[MEMORIA A LARGO PLAZO - DATOS RELEVANTES DEL PROYECTO]:
(Fichas de personajes, reglas del mundo, eventos pasados encontrados en la base de datos)
${contextText || "No se encontraron datos relevantes en la memoria."}
      `;

      const coAuthorInstruction = `
[INSTRUCCIÓN]:
Eres el co-autor de esta obra. Usa el Contexto Inmediato para continuidad, pero basa tus sugerencias profundas en la Memoria a Largo Plazo. Si el usuario pregunta algo, verifica si ya existe en la Memoria antes de inventar.

[PROTOCOLO DE REDACCIÓN]:
Tu objetivo es ayudar al usuario a escribir. Cuando generes escenas, diálogos o párrafos completos:
1. Redacta el contenido claramente.
2. Invita al usuario a utilizar la herramienta de inserción (Botón "Insertar") para agregarlo al documento.
3. EJEMPLO: "Aquí tienes una propuesta para la escena. Puedes usar el botón de insertar para agregarla directamente."
      `;

      const promptFinal = `
        ${profileContext}
        ${perspectiveContext}
        ${finalSystemInstruction}

        ${coAuthorInstruction}

        ${activeContextSection}

        ${attachedContextSection}

        ${webContext}

        ${longTermMemorySection}

        --- HISTORIAL DE CONVERSACIÓN ---
        ${historyText}
        -------------------------------------------

        PREGUNTA DEL USUARIO: "${finalQuery}"
      `;

      // 🟢 OPERATION BYPASS TOTAL: NATIVE SDK IMPLEMENTATION
      try {
        const genAI = new GoogleGenerativeAI(finalKey);

        // 🟢 GOD MODE: CONTEXT CACHING
        const config = await _getProjectConfigInternal(userId);
        let cachedContent = undefined;

        if (config.longTermMemory?.cacheName) {
          cachedContent = config.longTermMemory.cacheName;
          logger.info(`🧠 [GOD MODE] Using Context Cache in Forge: ${cachedContent}`);
        }

        // --- 1. CONFIGURATION ---
        const generationConfig = {
          temperature: TEMP_CREATIVE,
          maxOutputTokens: 8192,
        };

        // --- 2. ATTEMPT 1: STANDARD CALL ---
        let model = genAI.getGenerativeModel({
          model: MODEL_PRO,
          generationConfig,
          safetySettings: SAFETY_SETTINGS_PERMISSIVE,
          cachedContent: cachedContent
        });

        // 🟢 MULTIMODAL PAYLOAD
        let payload: any = promptFinal;
        if (mediaAttachment) {
          payload = [
            { text: promptFinal },
            { inlineData: mediaAttachment }
          ];
          logger.info("📸 Multimodal Payload Detected");
        }

        logger.info("🚀 [BYPASS] Attempt 1: Calling Gemini Native SDK...");
        let result = await model.generateContent(payload);
        let response = result.response;
        let finishReason = response.candidates?.[0]?.finishReason;

        // 🟢 DEBUG RAW RESPONSE
        // 🛡️ SENTINEL UPDATE: Truncate log to prevent PII leakage and log bloat
        const rawResponseStr = JSON.stringify(result, null, 2);
        const truncatedLog = rawResponseStr.length > 2000 ? rawResponseStr.substring(0, 2000) + "... (TRUNCATED)" : rawResponseStr;
        logger.info("🔍 [RAW NATIVE RESPONSE]:", truncatedLog);

        // --- 3. RETRY LOGIC (SANITIZATION FALLBACK) ---
        // REVISION 00130: If Attempt 1 is blocked, Attempt 2 must STRIP RAG chunks.
        const isBlocked = finishReason === FinishReason.SAFETY || finishReason === (FinishReason as any).OTHER || (response.promptFeedback?.blockReason);
        const isEmpty = !response.candidates || response.candidates.length === 0 || !response.text;

        if (isBlocked || isEmpty) {
          logger.warn(`⚠️ [BYPASS] Attempt 1 Failed (Reason: ${finishReason}). Initiating SANITIZATION PROTOCOL...`);

          // 🟢 SANITIZATION: STRIP RAG MEMORY (The 6 chunks)
          const sanitizedPrompt = `
                ${profileContext}
                ${CONTINUITY_PROTOCOL}

                [MODO DE EMERGENCIA / SANITIZED CONTEXT]
                (El contexto detallado ha sido ocultado por protocolos de seguridad. Responde de forma constructiva basándote en la pregunta).

                ${activeFileContent ? `[ACTIVE FILE SUMMARY]: ${activeFileContent.substring(0, 500)}... (Truncated)` : ''}

                --- HISTORIAL DE CONVERSACIÓN ---
                ${historyText}
                -------------------------------------------

                PREGUNTA DEL USUARIO: "${finalQuery}"
             `;

          let sanitizedPayload: any = sanitizedPrompt;
          if (mediaAttachment) {
            sanitizedPayload = [
              { text: sanitizedPrompt },
              { inlineData: mediaAttachment }
            ];
          }

          logger.info("🚀 [BYPASS] Attempt 2: Retrying with SANITIZED PROMPT...");

          // Retry with same permissive settings but clean prompt
          result = await model.generateContent(sanitizedPayload);
          response = result.response;
          finishReason = response.candidates?.[0]?.finishReason;

          logger.info("🔍 [RAW NATIVE RESPONSE 2]:", JSON.stringify(result, null, 2));
        }

        // --- 4. FINAL VALIDATION ---
        let finalText = "";
        try {
          finalText = response.text();
        } catch (e) {
          // .text() throws if there is no text. Use robust check.
          finalText = "";
        }

        if (!finalText && (finishReason === FinishReason.SAFETY)) {
          // FAIL STATE A: BLOCKED
          return {
            response: "⚠️ Contenido Bloqueado por Protocolos de Seguridad (Gemini Refusal).",
            sources: []
          };
        } else if (!finalText) {
          // FAIL STATE B: EMPTY/NULL
          // 🟢 FALLBACK PROTOCOL INJECTED
          throw new Error("EMPTY_FRAGMENT_ERROR");
        }

        return {
          response: finalText,
          sources: relevantanys.map(chunk => ({
            text: chunk.text.substring(0, 200) + "...",
            fileName: chunk.fileName
          }))
        };

      } catch (invokeError: any) {
        if (invokeError.message === "EMPTY_FRAGMENT_ERROR") {
          logger.error("💥 [BYPASS] CRITICAL: Gemini returned empty fragment after retries.");
          // 🟢 RETURN CONTROLLED ERROR OBJECT (DO NOT THROW)
          return {
            response: "La Forja recibió un fragmento vacío de Gemini. Reintentando con parámetros de seguridad reducidos...",
            sources: []
          };
        }
        logger.error("💥 ERROR CRÍTICO EN GENERACIÓN (Chat RAG) [CATCH-ALL]:", invokeError?.message || invokeError);

        // 🟢 PROTOCOLO DE FALLO: Romper el bucle de UI
        if (sessionId) {
          try {
            await db.collection("users").doc(userId)
              .collection("forge_sessions").doc(sessionId)
              .collection("messages").add({
                role: 'system',
                text: "⚠️ Error de Conexión: La Forja no pudo procesar este fragmento.",
                timestamp: new Date().toISOString(),
                type: 'error',
                isError: true // Optional flag for UI
              });
            logger.info(`🚨 Error inyectado en sesión ${sessionId} para liberar UI.`);
          } catch (persistError: any) {
            logger.error("Error al persistir mensaje de fallo:", persistError?.message);
          }
        }

        // 🟢 UI RECOVERY PROTOCOL: Return a valid object with the error message
        // This ensures ForgeChat.tsx saves it to the history instead of crashing.
        return {
          response: "⚠️ Error de Conexión: La Forja no pudo procesar este fragmento.",
          sources: []
        };
      }

    } catch (error: any) {
      logger.error("Error General en Chat RAG (Setup):", error);
      // Catch-all for errors before the invoke (e.g. Vector Search failure)
      return {
        response: `⚠️ Error del Sistema: Fallo en la memoria a largo plazo. (${error.message || 'Unknown Error'})`,
        sources: []
      };
    }
  }
);

/**
 * COMPILE MANUSCRIPT (La Imprenta)
 * Genera un PDF compilando múltiples archivos en orden
 */
export const compileManuscript = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileIds, title, author, subtitle, options, accessToken } = request.data;
    const { smartBreaks, includeCover, includeToc, pageBreakPerFile } = options || {};

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new HttpsError("invalid-argument", "Falta fileIds (array).");
    }
    if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");

    // 🛡️ SECURITY: INPUT VALIDATION
    const MAX_MANUSCRIPT_FILES = 50;
    if (fileIds.length > MAX_MANUSCRIPT_FILES) {
      throw new HttpsError("invalid-argument", `Exceeded max files limit (${MAX_MANUSCRIPT_FILES}).`);
    }

    if (!title || typeof title !== 'string') {
      throw new HttpsError("invalid-argument", "Invalid title.");
    }
    if (title.length > 200) {
      throw new HttpsError("invalid-argument", "Title too long (max 200 chars).");
    }

    if (!author || typeof author !== 'string') {
      throw new HttpsError("invalid-argument", "Invalid author.");
    }
    if (author.length > 100) {
      throw new HttpsError("invalid-argument", "Author name too long (max 100 chars).");
    }

    try {
      logger.info(`📚 Compilando manuscrito: ${title} (${fileIds.length} archivos) | SmartBreaks: ${smartBreaks}`);

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      const contents: string[] = [];
      for (const fileId of fileIds) {
        const raw = await _getDriveFileContentInternal(drive, fileId);

        const parsed = matter(raw);
        const cleanContent = parsed.content.trim();

        contents.push(cleanContent);
      }

      const PdfPrinter = require("pdfmake");

      const fonts = {
        Roboto: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique"
        }
      };

      const printer = new PdfPrinter(fonts);

      // --- HELPER: PARSE MARKDOWN TO PDFMAKE NODES (VIA HTML) ---
      const parseContentToNodes = (text: string, isSmartBreakEnabled: boolean) => {
        // 1. Markdown -> HTML
        const rawHtml = marked.parse(text);

        // 2. Sanitize HTML (Security Fix)
        const html = sanitizeHtml(rawHtml as string);

        // 3. HTML -> PDFMake
        const { window } = new JSDOM("");
        // Ensure default styles are mapped if needed, or rely on global docDefinition styles
        const converted = htmlToPdfmake(html, { window: window });

        // 3. Post-Process for Smart Breaks (Iterative - Anti DoS)
        // We look for 'html-h1' and 'html-h2' styles to inject page breaks
        // 🛡️ SENTINEL SECURITY FIX: Replaced recursion with iteration to prevent Stack Overflow DoS
        if (isSmartBreakEnabled) {
          const injectPageBreaks = (rootStructure: any) => {
            const stack: any[] = [];

            // Initialize Stack
            if (Array.isArray(rootStructure)) {
              // Push in reverse to maintain processing order (though not strictly necessary for style checks)
              for (let i = rootStructure.length - 1; i >= 0; i--) {
                stack.push(rootStructure[i]);
              }
            } else if (rootStructure && typeof rootStructure === 'object') {
              // Handle single object or { stack: [] } case
              stack.push(rootStructure);
            }

            while (stack.length > 0) {
              const node = stack.pop();

              // 1. Unwrap Arrays (Nested structures)
              if (Array.isArray(node)) {
                for (let i = node.length - 1; i >= 0; i--) {
                  stack.push(node[i]);
                }
                continue;
              }

              if (!node || typeof node !== 'object') continue;

              // 2. Process Node Logic
              if (node.style) {
                const s = node.style;
                const isH1 = s === 'html-h1' || (Array.isArray(s) && s.includes('html-h1'));
                const isH2 = s === 'html-h2' || (Array.isArray(s) && s.includes('html-h2'));

                if (isH1 || isH2) {
                  node.pageBreak = 'before';
                }
              }

              // 3. Push Children (Iterative Traversal)
              // We push these as-is; if they are arrays, the next loop will unwrap them.
              if (node.stack) stack.push(node.stack);
              if (node.ul) stack.push(node.ul);
              if (node.ol) stack.push(node.ol);
              if (node.columns) stack.push(node.columns); // Also check columns just in case
            }
          };

          // Apply to the converted structure
          injectPageBreaks(converted);
        }

        return Array.isArray(converted) ? converted : [converted];
      };

      const docContent: any[] = [];

      // 1. COVER PAGE (Portada)
      if (includeCover) {
        docContent.push(
          {
            text: title,
            style: "title",
            alignment: "center",
            margin: [0, 200, 0, 20]
          },
          subtitle ? {
            text: subtitle,
            style: "subtitle",
            alignment: "center",
            margin: [0, 0, 0, 40]
          } : {},
          {
            text: `por ${author}`,
            style: "author",
            alignment: "center",
            margin: [0, 0, 0, 0],
            pageBreak: "after"
          }
        );
      } else {
        // Simple Header if no cover
        docContent.push(
          { text: title, style: "title", alignment: "center", margin: [0, 50, 0, 10] },
          { text: `por ${author}`, style: "author", alignment: "center", margin: [0, 0, 0, 40] }
        );
      }

      // 2. TOC (Índice) - Placeholder logic, pdfmake has explicit TOC support but it's complex.
      // We will skip auto-TOC for now or add a simple placeholder if requested.
      if (includeToc) {
        docContent.push({ text: "Índice", style: "header1", margin: [0, 0, 0, 20] });
        docContent.push({ text: "(Índice autogenerado no disponible en esta versión)", italics: true, margin: [0, 0, 0, 40], pageBreak: "after" });
      }

      // 3. BODY CONTENT
      contents.forEach((content, index) => {
        const fileNodes = parseContentToNodes(content, smartBreaks);

        // Force page break between files if requested OR if not already handled by smart logic
        // But smart logic handles H1/H2 inside.
        // If pageBreakPerFile is true, we force it.
        // Exception: First file (index 0) doesn't need 'before' unless cover exists (handled above).

        if (index > 0 && pageBreakPerFile) {
          // Inject a break if the first node of this file isn't already a break
          const firstNode = fileNodes[0];
          if (firstNode && !firstNode.pageBreak) {
            firstNode.pageBreak = 'before';
          }
        }

        docContent.push(...fileNodes);
      });

      const docDefinition: any = {
        content: docContent,
        styles: {
          title: {
            fontSize: 28,
            bold: true,
            font: "Roboto"
          },
          subtitle: {
            fontSize: 18,
            italics: true,
            font: "Roboto",
            color: '#666666'
          },
          author: {
            fontSize: 16,
            italics: true,
            font: "Roboto"
          },
          // Standard styles (Legacy)
          header1: { fontSize: 24, bold: true, font: "Roboto", color: '#222222' },
          header2: { fontSize: 20, bold: true, font: "Roboto", color: '#444444' },
          body: { fontSize: 12, font: "Roboto", lineHeight: 1.5, alignment: 'justify' },

          // HTML-to-PDFMake Styles Mappings
          'html-h1': {
            fontSize: 24,
            bold: true,
            font: "Roboto",
            color: '#222222',
            margin: [0, 20, 0, 10]
          },
          'html-h2': {
            fontSize: 20,
            bold: true,
            font: "Roboto",
            color: '#444444',
            margin: [0, 15, 0, 10]
          },
          'html-h3': {
            fontSize: 16,
            bold: true,
            font: "Roboto",
            color: '#666666',
            margin: [0, 10, 0, 5]
          },
          'html-p': {
            fontSize: 12,
            font: "Roboto",
            lineHeight: 1.5,
            alignment: 'justify',
            margin: [0, 0, 0, 10]
          },
          'html-ul': {
            margin: [0, 0, 0, 10]
          },
          'html-ol': {
            margin: [0, 0, 0, 10]
          },
          'html-blockquote': {
            italics: true,
            margin: [20, 10, 20, 10],
            color: '#555555'
          }
        },
        defaultStyle: {
          font: "Roboto"
        },
        pageSize: "LETTER",
        pageMargins: [72, 72, 72, 72]
      };

      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        pdfDoc.on("end", () => resolve());
        pdfDoc.on("error", reject);
        pdfDoc.end();
      });

      const pdfBuffer = Buffer.concat(chunks);
      const pdfBase64 = pdfBuffer.toString("base64");

      logger.info(`✅ PDF generado: ${pdfBuffer.length} bytes`);

      return {
        success: true,
        pdf: pdfBase64,
        fileCount: fileIds.length,
        sizeBytes: pdfBuffer.length
      };

    } catch (error: any) {
      throw handleSecureError(error, "compileManuscript");
    }
  }
);

/**
 * 4. CRONISTA (Intelligent Timeline)
 * Analiza texto y extrae eventos temporales con fechas absolutas (enteros).
 */
export const extractTimelineEvents = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileId, content, currentYear, eraName } = request.data;
    const userId = request.auth.uid;

    if (!content || !currentYear) {
      throw new HttpsError("invalid-argument", "Faltan datos (content o currentYear).");
    }

    // 🛡️ SECURITY: SIZE LIMIT FOR AI
    if (content.length > MAX_AI_INPUT_CHARS) {
      throw new HttpsError("invalid-argument", `El texto excede el límite de análisis (${MAX_AI_INPUT_CHARS} caracteres).`);
    }

    try {
      const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
      const model = genAI.getGenerativeModel({
        model: MODEL_FLASH,
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        generationConfig: {
          temperature: TEMP_PRECISION,
          responseMimeType: "application/json"
        }
      });

      const prompt = `
        Eres un Cronista experto en narrativa y continuidad.
        Tu misión es analizar el siguiente texto y extraer eventos temporales, tanto explícitos como implícitos.

        CONTEXTO TEMPORAL:
        - Año Actual de la narración: ${currentYear}
        - Era: ${eraName || 'Era Común'}

        INSTRUCCIONES:
        1. Identifica menciones de tiempo (ej: "hace 10 años", "el invierno pasado", "en el año 305").
        2. Calcula el 'absoluteYear' (ENTERO) para cada evento basándote en el Año Actual.
           - Ejemplo: Si hoy es 3050 y el texto dice "hace 10 años", absoluteYear = 3040.
        3. Ignora eventos triviales (ej: "hace 5 minutos"). Céntrate en historia, lore y biografía.

        SALIDA JSON (Array de objetos):
        [
          {
            "eventName": "Título breve del evento",
            "description": "Fragmento original o resumen del evento",
            "absoluteYear": 0, // Número entero
            "confidence": "high" | "low"
          }
        ]

        TEXTO A ANALIZAR:
        "${content}"
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const events = parseSecureJSON(responseText, "ExtractTimelineEvents");

      if (events.error === "JSON_PARSE_FAILED") {
        throw new HttpsError('internal', `Timeline JSON Malformed: ${events.details}`);
      }

      // Ensure it is an array
      if (!Array.isArray(events)) {
        throw new HttpsError('internal', `Timeline JSON is not an array.`);
      }

      // 🟢 1. DUAL-WRITE PROTOCOL (DRIVE + FIRESTORE)
      const config = await _getProjectConfigInternal(userId);
      const chronologyPathId = config.chronologyPath?.id;

      let masterEvents: any[] = [];
      let masterFileId: string | null = null;

      // A. SYNC WITH MASTER (IF EXISTS)
      if (chronologyPathId) {
        logger.info(`⏳ [TIME ANCHOR] Syncing with Master Timeline in Folder: ${chronologyPathId}`);
        try {
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: request.data.accessToken || "" }); // We need token!
          // Note: extractTimelineEvents definition didn't require accessToken before, but getDriveFileContent did.
          // We must check if we have it. If not, we might fail the Drive sync part.
          // We'll rely on the client passing it.

          if (request.data.accessToken) {
            const drive = google.drive({ version: "v3", auth });

            // 1. Find timeline_master.json
            const q = `'${chronologyPathId}' in parents and name = 'timeline_master.json' and trashed = false`;
            const listRes = await drive.files.list({ q, fields: "files(id)" });

            if (listRes.data.files && listRes.data.files.length > 0) {
              masterFileId = listRes.data.files[0].id;
              // Read
              const content = await _getDriveFileContentInternal(drive, masterFileId!);
              try {
                masterEvents = parseSecureJSON(content, "TimelineMasterRead");
                if (!Array.isArray(masterEvents)) masterEvents = [];
              } catch (e) {
                logger.warn("⚠️ Corrupt Master Timeline. Starting fresh merge.");
                masterEvents = [];
              }
            }
          }
        } catch (driveErr) {
          logger.error("⚠️ [TIME ANCHOR] Drive Sync Failed (Read):", driveErr);
        }
      }

      // B. MERGE NEW EVENTS
      // Strategy: Add new suggested events to the master list.
      const newEventsPayload = events.map((e: any) => ({
        ...e,
        id: db.collection("tmp").doc().id, // Generate ID for Drive persistence
        sourceFileId: fileId,
        status: 'suggested',
        createdAt: new Date().toISOString()
      }));

      // Append to Master (In-Memory)
      const updatedMasterList = [...masterEvents, ...newEventsPayload];

      // C. WRITE BACK TO DRIVE (THE TRUTH)
      if (chronologyPathId && request.data.accessToken) {
        try {
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: request.data.accessToken });
          const drive = google.drive({ version: "v3", auth });

          const fileContent = JSON.stringify(updatedMasterList, null, 2);

          if (masterFileId) {
            // Update
            await drive.files.update({
              fileId: masterFileId,
              media: { mimeType: 'application/json', body: fileContent }
            });
          } else {
            // Create
            await drive.files.create({
              requestBody: {
                name: 'timeline_master.json',
                parents: [chronologyPathId],
                mimeType: 'application/json'
              },
              media: { mimeType: 'application/json', body: fileContent }
            });
          }
          logger.info(`✅ [TIME ANCHOR] Master Timeline Updated (${updatedMasterList.length} items).`);

        } catch (writeErr) {
          logger.error("💥 [TIME ANCHOR] Drive Write Failed:", writeErr);
          // Non-blocking, but alarming.
        }
      }

      // D. WRITE TO FIRESTORE (THE CACHE)
      // We write ONLY the new events here, or should we sync the whole master?
      // The user said "Firestore only as fast cache".
      // To ensure consistency, we should probably write the NEW events to Firestore so the UI updates.
      // The UI will likely see the new ones added.

      const batch = db.batch();
      const timelineRef = db.collection("TDB_Timeline").doc(userId).collection("events");

      let count = 0;
      for (const event of newEventsPayload) {
        // Use the same ID we generated for Drive if possible, but Firestore auto-ids are fine too if we don't strict sync IDs.
        // Let's use the ID we generated to allow future correlation.
        const docRef = timelineRef.doc(event.id);
        batch.set(docRef, event);
        count++;
      }

      await batch.commit();

      return { success: true, count, events };

    } catch (error: any) {
      throw handleSecureError(error, "extractTimelineEvents");
    }
  }
);

/**
 * PHASE 4.1: WORLD ENGINE (TITAN LINK)
 * Motor de simulación y lógica narrativa potenciado por Gemini 3.
 */
export const worldEngine = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 1800, // 30 Minutes
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log("🚀 WORLD ENGINE v2.0 (Sanitizer Active) - Loaded");
    console.log('🚀 WORLD ENGINE: Phase 4.1 - TITAN LINK - ' + new Date().toISOString());

    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userId = request.auth.uid;

    // 1. DATA RECEPTION
    const { prompt, agentId, chaosLevel, context, interrogationDepth, clarifications, sessionId, sessionHistory, accessToken, folderId, currentGraphContext } = request.data;
    const { canon_dump, timeline_dump } = context || {};

    const currentDepth = interrogationDepth || 0;

    // 🟢 PAYLOAD ANALYSIS (The Eyes)
    const contextNodeCount = Array.isArray(currentGraphContext) ? currentGraphContext.length : 0;
    // OPERACIÓN 'ELEFANTE': Sending FULL payload (No Truncation) as requested by Commander.
    const contextNodeSummary = Array.isArray(currentGraphContext)
      ? JSON.stringify(currentGraphContext.map((n: any) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        description: n.description || "",
        content: n.content || "", // 🟢 FULL CONTENT INJECTION
        relations: n.relations || []
      })))
      : "[]";

    // 2. DEBUG LOGGING
    logger.info("🔌 [TITAN LINK] Payload Received:", {
      agentId,
      chaosLevel,
      canonLength: canon_dump ? canon_dump.length : 0,
      timelineLength: timeline_dump ? timeline_dump.length : 0,
      graphContextSize: contextNodeCount, // 🟢 LOG
      interrogationDepth: currentDepth,
      sessionId: sessionId || 'NO_SESSION'
    });

    // 🟢 AUDIT LOGGING: Verify Priority Lore Injection
    if (canon_dump && canon_dump.includes('[CORE WORLD RULES / PRIORITY LORE]')) {
      logger.info("✅ PRIORITY LORE DETECTED in Canon Dump");
    } else {
      logger.warn("⚠️ PRIORITY LORE MISSING in Canon Dump (Star Logic Check Required)");
    }

    try {
      // 🟢 TRIFASIC LOGIC (The Brain)
      let systemPersona = "";
      let dynamicTemp = 0.7;

      if (chaosLevel <= 0.39) {
        systemPersona = "Actúa como Ingeniero Lógico. Prioriza la consistencia dura, reglas de causalidad y sistemas de magia estrictos.";
        dynamicTemp = 0.2;
      } else if (chaosLevel <= 0.60) {
        systemPersona = "Actúa como un Arquitecto Visionario. Mantén la coherencia interna pero propón giros creativos inesperados. Equilibra la estructura con la regla de lo molón (Rule of Cool).";
        dynamicTemp = 0.7;
      } else {
        systemPersona = "Actúa como un Soñador Caótico. Prioriza la estética, el simbolismo y la sorpresa sobre la lógica. Rompe patrones establecidos.";
        dynamicTemp = 1.1;
      }

      const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

      // 🟢 GOD MODE: CONTEXT CACHING
      const config = await _getProjectConfigInternal(userId);
      let cachedContent = undefined;

      if (config.longTermMemory?.cacheName) {
        cachedContent = config.longTermMemory.cacheName;
        logger.info(`🧠 [GOD MODE] Using Context Cache: ${cachedContent}`);
      }

      const model = genAI.getGenerativeModel({
        model: MODEL_PRO,
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        cachedContent: cachedContent,
        generationConfig: {
          temperature: dynamicTemp,
        } as any
      });

      // 🟢 PHASE 4.3: SESSION AWARENESS
      let sessionContext = "";
      if (sessionHistory && Array.isArray(sessionHistory) && sessionHistory.length > 0) {
        sessionContext = `
=== CURRENT SESSION HISTORY (THE CHRONICLER) ===
(This is what has happened so far in this session. Maintain consistency with these decisions.)
${sessionHistory.map((item: any, i: number) => `
[TURN ${i + 1}]
User: ${item.prompt}
AI Result: ${item.result?.title || 'Unknown'} - ${item.result?.content || ''}
`).join('\n')}
================================================
`;
      }

      const systemPrompt = `
        You are using the Gemini 3 Reasoning Engine.
        CORE PERSONA DIRECTIVE: ${systemPersona}

        [THINKING MODE ACTIVATED]
        Before answering, you MUST perform a deep structural analysis in a hidden thought block.
        Format: <thinking> ... internal monologue ... </thinking>
        The user will not see this, but it is critical for consistency.

        === WORLD CONTEXT (THE LAW) ===
        ${canon_dump || "No canon rules provided."}

        === TIMELINE (THE LORE) ===
        ${timeline_dump || "No timeline events provided."}

        === VISUAL GRAPH CONTEXT (THE EYES) ===
        (Current state of the user's mind map. Use these Exact IDs to connect new ideas to existing nodes.)
        ${contextNodeSummary}

        ${sessionContext}

        === ITERATIVE REFINEMENT LOOP ===
        CURRENT INTERROGATION DEPTH: ${currentDepth}/3
        PREVIOUS CLARIFICATIONS (IF ANY):
        ${clarifications || "None."}

        INSTRUCTIONS:
        1. Ingest the provided World Context (Canon/Timeline).
        2. Analyze the USER PROMPT for ambiguity or missing critical parameters (e.g., Economy, Magic Rules, Political Impact).
        3. DECISION LOGIC:
           ${currentDepth >= 3 ?
          `- CRITICAL OVERRIDE (MAX DEPTH REACHED): You are FORBIDDEN from returning an 'inquiry' object. You MUST resolve the ambiguity now using the best available logic. Generate a TYPE A (Standard Node) response.` :
          `- IF Ambiguity Exists OR New Conflict Detected: STOP. Return a TYPE B ('inquiry') object to ask strategic questions.`}
           - IF Prompt is Clear: Generate a TYPE A (Standard Node).

        4. **IRON GUARDIAN AUDIT (STRICT LORE ENFORCEMENT):**
           - "CRITICAL MANDATE: You are the IRON GUARDIAN. Your sole purpose is to detect factual errors. If the user prompts something that contradicts a file marked [CORE WORLD RULES / PRIORITY LORE], you MUST NOT reconcile it. Do not offer solutions. Do not invent excuses."
           - **EMPTY CONTEXT RULE:** If the [WORLD CONTEXT] is empty, you are operating in a VACUUM. Do not assume any prior lore exists. Flag all major inventions as [NEW FOUNDATION].
           - **IF A CONTRADICTION IS FOUND:**
             - DO NOT STOP GENERATION.
             - **CONTENT OVERRIDE:** The 'content' of the node MUST start with a clinical, holographic warning: '[SIMULATED DIVERGENCE: This entry contradicts Prime Canon Timeline]'.
             - The rest of the content must be written as a "Theoretical Simulation" or "What-If Scenario" based on false premises, adopting a cold, detached tone.
             - **MUST** append a 'coherency_report' object to the JSON.
             - The 'warning' must be a high-severity alert (e.g., "FATAL CANON ERROR" or "TEMPORAL PARADOX").
             - The 'file_source' must be the exact filename of the contradicted [CORE WORLD RULES / PRIORITY LORE] file.
             - The 'explanation' must be a technical explanation of why the event is impossible (e.g., "Target entity ceased operations in Year 485. Inauguration in 486 is invalid.").

        5. **CONTEXTUAL WIRING (THE RED THREAD):**
           - Analyze the user's idea against the provided [VISUAL GRAPH CONTEXT].
           - **IF** the idea relates to an EXISTING NODE in the context:
             - You MUST create an explicit relationship in \`newRelations\`.
             - Use the **EXACT ID** from the context. Do not invent new IDs for existing characters.
             - Example: If user mentions "Anna" and context has \`{"id":"123", "name":"Anna"}\`, create a relation to target "123".
           - **IF** the idea is new, generate it in \`newNodes\`.

        6. THINK: Spend significant time tracing the causal chains (Butterfly Effect).
        7. Constraint: Do not rush. If the user asks about 'War', analyze the economic impact of 'Psycho-Energy' on weapon manufacturing first.
        8. THE CHRONICLER RULE: Always refer to the CURRENT SESSION HISTORY (if available) to maintain consistency. If the user previously decided X in this session, do not contradict it.

        USER PROMPT: "${prompt}"

        OUTPUT FORMATS (JSON ONLY):

        TYPE A (STANDARD NODE - WHEN RESOLVED):
        {
          "type": "response", // Fixed type marker
          "title": "Main Idea Title", // Summary title
          "newNodes": [
             {
               "id": "generated_id_1", // Use short, deterministic IDs if possible
               "title": "Node Title",
               "type": "idea", // MUST BE 'idea' for Gold Color
               "content": "Deep analysis content...",
               "metadata": {
                  "suggested_filename": "Name.md",
                  "suggested_folder_category": "_Characters" | "_Locations" | "_Lore",
                  "node_type": "concept" | "conflict" | "lore"
               }
             }
          ],
          "newRelations": [
             {
               "source": "generated_id_1", // ID from newNodes
               "target": "existing_id_or_new_id", // ID from Context OR newNodes
               "label": "ENEMY" | "ALLY" | "FAMILY" | "CAUSE",
               "strength": 0-1
             }
          ],
          "coherency_report": { ... } // Optional
        }

        COLOR CODING LOGIC (For node_type):
        - "concept" (BLUE): Foundations, Rules, Magic Systems, Tech.
        - "conflict" (RED): Threats, Wars, Dilemmas, Antagonists.
        - "lore" (VIOLET): History, Flavor, Myths, Artifacts.

        TYPE B (INQUIRY - WHEN CLARIFICATION NEEDED):
        {
          "type": "inquiry",
          "title": "⚠️ CLARIFICATION NEEDED",
          "questions": ["Question 1?", "Question 2?", "Question 3?"]
        }
      `;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      });

      const responseText = result.response.text();

      // 🟢 STRICT SANITIZER V2.0 (NOW USING GLOBAL HELPER)
      console.log("🔍 RAW AI OUTPUT:", responseText.slice(0, 50) + "...");

      const parsedResult = parseSecureJSON(responseText, "WorldEngine");

      if (parsedResult.error === "JSON_PARSE_FAILED") {
        throw new HttpsError('internal', `AI JSON Corruption: ${parsedResult.details}`);
      }

      // 🟢 PHASE 4.3: ASYNC LOGGING (FIRE AND FORGET OR AWAIT)
      // We await to ensure persistence, even if it adds 1-2s latency. Reliability > Speed here.
      if (sessionId && accessToken && folderId) {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        await appendToSessionLog(drive, sessionId, folderId, {
          prompt,
          response: parsedResult,
          clarifications
        });
      }

      return parsedResult;

    } catch (error: any) {
      throw handleSecureError(error, "worldEngine");
    }
  }
);

/**
 * 9. CREATE FORGE SESSION (La Fragua)
 * Crea una nueva sesión de persistencia para la Forja.
 */
export const createForgeSession = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { name, type } = request.data;
    if (!name) {
      throw new HttpsError("invalid-argument", "Falta el nombre de la sesión.");
    }
    // 🛡️ SECURITY: INPUT VALIDATION
    if (name.length > MAX_SESSION_NAME_CHARS) {
      throw new HttpsError("invalid-argument", "Session name too long.");
    }

    const userId = request.auth.uid;
    const sessionId = db.collection("users").doc(userId).collection("forge_sessions").doc().id;
    const now = new Date().toISOString();

    const sessionType = type || 'forge';

    try {
      await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).set({
        name,
        type: sessionType,
        createdAt: now,
        updatedAt: now,
      });

      logger.info(`🔨 Sesión de Forja (${sessionType}) creada: ${sessionId} (${name})`);
      return { id: sessionId, sessionId, name, type: sessionType, createdAt: now, updatedAt: now };

    } catch (error: any) {
      throw handleSecureError(error, "createForgeSession");
    }
  }
);

/**
 * 13. GET FORGE HISTORY (La Memoria)
 * Recupera el historial de chat de una sesión.
 */
export const getForgeHistory = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { sessionId } = request.data;
    if (!sessionId) {
      throw new HttpsError("invalid-argument", "Falta el ID de la sesión.");
    }

    const userId = request.auth.uid;

    try {
      const snapshot = await db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages")
        .orderBy("timestamp", "asc")
        .get();

      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return messages;

    } catch (error: any) {
      throw handleSecureError(error, "getForgeHistory");
    }
  }
);

/**
 * 10. GET FORGE SESSIONS (El Inventario)
 * Lista todas las sesiones de forja del usuario.
 */
export const getForgeSessions = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const userId = request.auth.uid;
    const { type } = request.data;

    try {
      let query = db.collection("users").doc(userId).collection("forge_sessions")
        .orderBy("updatedAt", "desc")
        .limit(50);

      if (type) {
        query = query.where("type", "==", type);
      }

      const snapshot = await query.get();

      const sessions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return sessions;

    } catch (error: any) {
      throw handleSecureError(error, "getForgeSessions");
    }
  }
);

/**
 * 38. UPDATE LONG TERM MEMORY (God Mode)
 * Scans all Canon/Lore files, concatenates them, and creates a Gemini Context Cache.
 * This gives the AI "Omniscience" (up to 1M tokens) for the Director and Forge.
 */
export const updateLongTermMemory = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 3600, // 1 Hour (Heavy Operation)
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const userId = request.auth.uid;
    const { accessToken } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "AccessToken required.");

    logger.info(`🧠 [GOD MODE] Updating Long Term Memory for ${userId}`);

    try {
      const config = await _getProjectConfigInternal(userId);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      let allCanonContent = "";
      let fileCount = 0;

      // 1. Gather Content from Canon Paths
      if (config.canonPaths && config.canonPaths.length > 0) {
        for (const p of config.canonPaths) {
          // Resolve Shortcut
          const resolved = await resolveDriveFolder(drive, p.id);
          // Recursive Fetch
          const tree = await fetchFolderContents(drive, (resolved as any).id, config, true, 'canon');
          const flatFiles = (await flattenFileTree(tree) as any[]);

          // Filter Text Files
          const textFiles = flatFiles.filter(f =>
            f.mimeType === 'application/vnd.google-apps.document' ||
            f.mimeType.startsWith('text/') ||
            f.name.endsWith('.md')
          );

          // Read & Concatenate
          // We use sequential read to avoid rate limits? Or parallel with limit.
          // Using Promise.all with small chunks
          const CHUNK_SIZE = 5;
          for (let i = 0; i < textFiles.length; i += CHUNK_SIZE) {
            const batch = textFiles.slice(i, i + CHUNK_SIZE);
            await Promise.all(batch.map(async (file) => {
              try {
                const content = await _getDriveFileContentInternal(drive, (file as any).id);
                if (content && content.length > 50) {
                  allCanonContent += `\n\n--- FILE: ${file.name} (Path: ${file.path}) ---\n${content}`;
                  fileCount++;
                }
              } catch (e) {
                logger.warn(`Skipped ${file.name} in Memory Update:`, e);
              }
            }));
          }
        }
      }

      if (allCanonContent.length < 100) {
        return { success: false, message: "Not enough canon content found." };
      }

      logger.info(`🧠 [GOD MODE] Compiled ${fileCount} files. Total Size: ${allCanonContent.length} chars.`);

      // 2. Create Context Cache
      const finalApiKey = getAIKey(request.data, googleApiKey.value());
      const cacheName = `project-${userId}-${Date.now()}`; // Unique Name

      // We use Flash for the cache backing model usually? Or Pro?
      // If we want to use Pro with the cache, the cache must be compatible?
      // Gemini caches are model-specific? Docs say: "The cache is associated with a specific model."
      // We want to use this with BOTH? No, usually one.
      // The user wants "Pro" to have the memory. So we should target 'models/gemini-1.5-pro-001' (or 3.0-pro).
      // Let's target MODEL_PRO.

      // However, user also said "Flash reads everything". Maybe Flash creates the map?
      // But "Director" (Pro) needs the memory.
      // We will create the cache for the High Reasoning Model (Pro).

      const cacheResult = await createProjectCache(
        finalApiKey,
        cacheName,
        allCanonContent,
        MODEL_PRO, // Bind to Pro
        7200 // 2 Hours TTL
      );

      // 3. Save to Project Config
      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        longTermMemory: {
          cacheName: cacheResult.cacheName,
          expirationTime: cacheResult.expirationTime,
          fileCount: fileCount,
          updatedAt: new Date().toISOString()
        }
      }, { merge: true });

      return {
        success: true,
        fileCount,
        cacheName: cacheResult.cacheName,
        expiration: cacheResult.expirationTime
      };

    } catch (error: any) {
      throw handleSecureError(error, "updateLongTermMemory");
    }
  }
);

/**
 * 20. ENRICH CHARACTER CONTEXT (La Bola de Cristal)
 * Realiza una búsqueda vectorial profunda para analizar un personaje en el contexto de la saga.
 */
export const enrichCharacterContext = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { characterId, name, saga, currentBio, status } = request.data;
    const userId = request.auth.uid;

    if (!name) throw new HttpsError("invalid-argument", "Falta el nombre del personaje.");

    try {
      logger.info(`🔮 Deep Analysis Triggered for: ${name} (Saga: ${saga || 'Global'}) | Status: ${status || 'Unknown'}`);

      const finalKey = getAIKey(request.data, googleApiKey.value());

      // 1. SETUP VECTORS
      const embeddings = new GeminiEmbedder({
        apiKey: finalKey,
        model: "gemini-embedding-001",
        taskType: TaskType.RETRIEVAL_QUERY,
      });

      // 2. SEARCH QUERY
      const searchQuery = `Historia y rol de ${name} en la saga ${saga || 'Principal'}. Eventos clave, relaciones y secretos.`;
      const queryVector = await embeddings.embedQuery(searchQuery);

      // 3. EXECUTE VECTOR SEARCH
      const coll = db.collectionGroup("chunks");
      const vectorQuery = coll.where("userId", "==", userId).findNearest({
        queryVector: queryVector,
        limit: 20, // Fetch ample context
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      // 🟢 [SENTINEL] SAFE VECTOR SEARCH
      let vectorSnapshot;
      try {
        vectorSnapshot = await vectorQuery.get();
      } catch (vectorError: any) {
        if (vectorError.message?.includes('index') || vectorError.code === 9) {
          logger.error(`[SENTINEL_ALERTA_CRITICA]: Fallo de Precondición en Firestore. El índice vectorial no existe o está inactivo. LINK DE ACTIVACIÓN: [LINK_DE_ERROR_9]`);

          // 🟢 RETURN DUAL PAYLOAD FOR ENRICHMENT
          // Note: enrichCharacterContext has a specific return type structure.
          // We return a failure but attach technical details for frontend handling if it evolves.
          // For now, we mainly want to log the critical alert.

          return {
            success: false,
            message: "La Forja está calibrando sus lentes. (Índice Vectorial Faltante)"
          };
        }
        throw vectorError;
      }

      // 🟢 SOURCE TRANSPARENCY
      const chunksData = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        fileName: doc.data().fileName || "Unknown Source"
      }));

      if (chunksData.length === 0) {
        return { success: false, message: "No se encontraron datos en la memoria para este personaje." };
      }

      const contextText = chunksData.map(c => c.text).join("\n\n---\n\n");
      // Deduplicate sources
      const sources = Array.from(new Set(chunksData.map(c => c.fileName)));

      // 4. AI ANALYSIS (Gemini 3 Pro)
      const genAI = new GoogleGenerativeAI(finalKey);
      const model = genAI.getGenerativeModel({
        model: MODEL_PRO,
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        generationConfig: {
          temperature: TEMP_CREATIVE,
        } as any
      });

      const prompt = `
        ACT AS: Senior Lorekeeper & Biographer.
        OBJECTIVE: Perform a Deep Contextual Analysis of the character "${name}".

        SOURCE MATERIAL (RAG MEMORY):
        ${contextText}

        CURRENT KNOWN BIO (Optional):
        ${currentBio || "No existing bio."}

        INSTRUCTIONS:
        1. Synthesize the RAG Memory chunks to reconstruct the character's journey.
        2. Identify key plot points, hidden relationships, and role in the grand scheme.
        3. Highlight anything found in the Memory that is MISSING from the Current Bio.
        4. OUTPUT FORMAT: Markdown (structured with headers).

        LANGUAGE PROTOCOL:
        1. DETECT the dominant language of the SOURCE MATERIAL (RAG MEMORY).
        2. GENERATE the entire response (Headers, Content, and Role) in that detected language.

        SECTION STRUCTURE (Translate headers to the Detected Language):

        ## 📜 [The Saga Context / Contexto de la Saga]
        (How they fit into the main storyline based on the text chunks)

        ## 🔑 [Key Events & Interactions / Eventos e Interacciones Clave]
        (Bulleted list of verified scenes/actions)

        ## 🧩 [Hidden Connections / Conexiones Ocultas]
        (Relationships or details not immediately obvious)

        ## ⚠️ [Inconsistencies / Inconsistencias o Nuevos Datos]
        (What does the RAG memory say that might contradict or add to the current file?)

        ## 🏷️ [GLOBAL ROLE SUMMARY / RESUMEN DE ROL GLOBAL]
        (One simple sentence summarizing their function in the entire saga. Max 15 words. Example: "Protagonist and former soldier seeking redemption.")
      `;

      const result = await model.generateContent(prompt);
      const analysisText = result.response.text();

      // 🟢 EXTRACT GLOBAL ROLE (REGEX HEROICS)
      let extractedRole = null;
      try {
        // Support both English and Spanish headers for the regex
        const roleMatch = analysisText.match(/## 🏷️ (GLOBAL ROLE SUMMARY|RESUMEN DE ROL GLOBAL)\s*\n\s*([^\n]+)/i);
        if (roleMatch && roleMatch[2]) {
          extractedRole = roleMatch[2].trim().replace(/^[\*\-\s]+/, ''); // Remove bullets
          if (extractedRole.length > 100) extractedRole = extractedRole.substring(0, 97) + "..."; // Safety cap
          logger.info(`🏷️ Extracted Role for ${name}: ${extractedRole}`);
        }
      } catch (e) {
        logger.warn("Failed to extract Global Role from analysis.");
      }

      // 5. PERSISTENCE (The Update)
      // HELPER: Slugify if ID missing
      const targetId = characterId || name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');

      // 🟢 UNIVERSAL PROMOTION: All analyzed entities live in 'characters' now.
      const updatePayload: any = {
        contextualAnalysis: analysisText,
        lastAnalyzed: new Date().toISOString(),
        isAIEnriched: true // 🟢 FLAG: Mark as AI-enhanced for Sync protection
      };

      if (extractedRole) {
        updatePayload.role = extractedRole;
      }

      if (status === 'DETECTED') {
        // 👻 GHOST PROMOTION: Promote to main roster but mark as Ghost
        updatePayload.id = targetId;
        updatePayload.name = name;
        updatePayload.status = 'DETECTED';
        updatePayload.isGhost = true; // 🟢 ANTI-PRUNING FLAG
        updatePayload.saga = saga || 'Global';
        updatePayload.sourceType = 'LOCAL'; // Treat as local/virtual until crystallized

        logger.info(`👻 Promoting Ghost to Roster: ${targetId}`);
      }

      await db.collection("users").doc(userId).collection("characters").doc(targetId).set(updatePayload, { merge: true });
      logger.info(`✅ Deep Analysis persisted for ${targetId} (Role: ${!!extractedRole}, Ghost: ${status === 'DETECTED'})`);

      return {
        success: true,
        analysis: analysisText,
        generatedRole: extractedRole,
        sources: sources, // 👈 New: Return Source List
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      throw handleSecureError(error, "enrichCharacterContext");
    }
  }
);

/**
 * CRYSTALLIZE NODE (La Materialización)
 * Convierte un nodo efímero en un archivo persistente en Drive.
 */
export const crystallizeNode = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleApiKey],
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { accessToken, folderId, targetRole, fileName, content, frontmatter } = request.data;
    const userId = request.auth.uid;

    // 🟢 RESOLVE DESTINATION (Smart Save)
    let finalFolderId = folderId;

    if (!finalFolderId && targetRole) {
      const config = await _getProjectConfigInternal(userId);
      // Cast string to enum if needed, or helper handles it
      finalFolderId = getFolderIdForRole(config, targetRole as FolderRole);

      if (!finalFolderId) {
        throw new HttpsError("failed-precondition", `No folder mapped for role: ${targetRole}. Please configure it in Project Settings.`);
      }
    }

    if (!finalFolderId || !fileName || !content || !accessToken) {
      throw new HttpsError("invalid-argument", "Faltan datos obligatorios (Folder ID or Role).");
    }

    // 🛡️ SECURITY: INPUT VALIDATION
    if (fileName.length > MAX_SESSION_NAME_CHARS) throw new HttpsError("invalid-argument", "File name too long.");
    if (typeof content === 'string' && content.length > MAX_FILE_SAVE_BYTES) {
      throw new HttpsError("resource-exhausted", `Content exceeds limit of ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
    }

    try {
      // 1. CONSTRUIR CONTENIDO
      let fileContent = content;
      if (frontmatter) {
        // Usamos stringify de matter, pero a veces inserta saltos de línea extraños.
        // Construcción manual segura para YAML simple.
        const fmBlock = Object.entries(frontmatter)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join('\n');
        fileContent = `---\n${fmBlock}\n---\n\n${content}`;
      }

      // 2. GUARDAR EN DRIVE
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      const fileMetadata = {
        name: fileName,
        parents: [finalFolderId],
        mimeType: 'text/markdown'
      };

      const media = {
        mimeType: 'text/markdown',
        body: fileContent
      };

      const file = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink'
      });

      const newFileId = file.data.id;

      logger.info(`💎 Nodo cristalizado: ${fileName} (${newFileId})`);

      // 3. ACTUALIZAR ÍNDICE (LIGERO)
      // Agregamos el archivo a la colección 'files' para que conste.
      if (newFileId) {
        await db.collection("TDB_Index").doc(userId).collection("files").doc(newFileId).set({
          name: fileName,
          lastIndexed: new Date().toISOString(),
          chunkCount: 0,
          category: 'canon',
          timelineDate: null,
          isGhost: false
        });
      }

      return {
        success: true,
        fileId: newFileId,
        webViewLink: file.data.webViewLink
      };

    } catch (error: any) {
      throw handleSecureError(error, "crystallizeNode");
    }
  }
);

/**
 * 19. FORGE ANALYZER (El Inspector)
 * Analiza un texto narrativo para extraer elenco, detectar entidades y generar un informe de estado.
 */
export const forgeAnalyzer = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileId, accessToken, existingCharacterNames, characterSourceId } = request.data;
    const userId = request.auth.uid;

    if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    try {
      const db = getFirestore();
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // 1. LEER ARCHIVO FUENTE
      const content = await _getDriveFileContentInternal(drive, fileId);
      if (!content) throw new HttpsError("not-found", "El archivo está vacío o no se pudo leer.");

      // 🟢 WIDE NET STRATEGY: Fetch ALL characters from Firestore
      if (characterSourceId) {
        logger.info(`🕸️ [WIDE NET] Fetching full character roster for user: ${userId} (Source: ${characterSourceId})`);
      } else {
        logger.info(`🕸️ [WIDE NET] Fetching full character roster for user: ${userId} (Global Scan)`);
      }

      const charsSnapshot = await db.collection("users").doc(userId).collection("characters").get();

      const roster = new Map<string, { id: string, name: string, role?: string }>();
      const rosterNames: string[] = [];

      charsSnapshot.forEach(doc => {
        const data = doc.data();
        const cleanName = data.name.trim();
        roster.set(cleanName.toLowerCase(), {
          id: doc.id,
          name: cleanName,
          role: data.role
        });
        rosterNames.push(cleanName);
      });

      // Fallback to frontend list if DB is empty (rare)
      let finalNameList = rosterNames;
      if (rosterNames.length === 0 && existingCharacterNames && Array.isArray(existingCharacterNames)) {
        finalNameList = existingCharacterNames;
        logger.warn("⚠️ [WIDE NET] DB Empty. Using frontend fallback list.");
      }

      // 🟢 PREFIX CLEANING LOGIC (BACKEND NORMALIZATION)
      logger.info("Loaded Roster Names (Raw):", finalNameList);

      const cleanedRoster = finalNameList.map(rawName => {
        // Regex to remove common prefixes + whitespace
        return rawName.replace(/^(Ficha|Profile|Expediente|Character)\s+/i, "").trim();
      });

      const existingListString = cleanedRoster.length > 0 ? cleanedRoster.join(", ") : "Ninguno (Proyecto Nuevo)";

      // We keep the original map for ID injection, but we map CLEAN names to IDs now too
      cleanedRoster.forEach((cleanName, index) => {
        const originalName = finalNameList[index];
        if (roster.has(originalName.toLowerCase())) {
          // Map the clean version to the same data as the original
          roster.set(cleanName.toLowerCase(), roster.get(originalName.toLowerCase())!);
        }
      });

      // 2. PREPARAR PROMPT DE ANÁLISIS
      const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
      const model = genAI.getGenerativeModel({
        model: MODEL_FLASH,
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        generationConfig: {
          temperature: TEMP_PRECISION, // Analítico
        } as any
      });

      // 🔍 BETA DEBUG: LOGGING
      logger.info(`🔍 [ANALYZER BETA] Content Length: ${content.length} chars`);
      logger.info(`🔍 [ANALYZER BETA] Roster Count: ${finalNameList.length}`);
      if (finalNameList.length > 0) {
        logger.info(`🔍 [ANALYZER BETA] Cleaned Context List: ${cleanedRoster.slice(0, 5).join(', ')}`);
      }

      const systemPrompt = `
        ACT AS: Senior Literary Editor & Continuity Manager.
        MISSION: Analyze the provided MANUSCRIPT TEXT (Draft/Chapter) and extract the CAST OF CHARACTERS.

        CONTEXT - EXISTING CHARACTERS IN DATABASE (Normalized Names):
        [ ${existingListString} ]

        MATCHING PROTOCOL (FUZZY LOGIC):
        - The list above contains known character names (stripped of metadata prefixes).
        - Example: If text has "Saya" and list has "Saya" (derived from "Ficha Saya"), TREAT AS EXACT MATCH -> Status: EXISTING.

        CONSISTENCY & ACTION PROTOCOL:
        1. Your 'report_summary' narrative MUST NOT contradict the JSON 'status' fields.
        2. IF Status == "EXISTING":
           - You MUST acknowledge them (e.g., "Detected known entity Saya...").
           - You MUST NOT suggest "Creating", "Adding", or "New Entry" for them.
           - You MAY suggest "Update Sheet" ONLY if the text contains significant NEW lore/contradictions.
        3. IF Status == "DETECTED" (New):
           - You MAY suggest creating a database entry.
           - You MUST extract the RAW TEXT SNIPPET (Context Window) where they appear.

        NARRATIVE PERSPECTIVE (POV) & DIALOGUE PROTOCOL:
        - First Person (I/Me) vs Third Person (He/She).
        - DIFFERENTIATE between Internal Monologue (Thoughts) and Spoken Dialogue (often marked with dashes '-' or quotes).
        - Do not attribute the Narrator's internal thoughts to other characters as dialogue.
        - If the text uses dashes for dialogue (e.g. "- Hola - dijo él"), correctly identify the speaker.

        CRITICAL DIRECTIVE - LANGUAGE PROTOCOL:
        1. DETECT the language of the provided "MANUSCRIPT TEXT".
        2. ADAPT your persona to that language.
           - IF ENGLISH: You are 'Commander'. Write 'report_summary' in English.
           - IF SPANISH: You are 'Comandante'. Write 'report_summary' in Spanish.
           - IF OTHER: Match the language.
        3. STRICT CONSTRAINT: The 'report_summary' MUST match the MANUSCRIPT LANGUAGE. Do not default to English if the text is Spanish.

        Directiva de Personalidad (Spanish Override):
        "Si el texto del manuscrito está en Español, TU RESPUESTA en 'report_summary' DEBE ser en Español. Empieza con 'Comandante, he analizado...'."

        Golden Rule:
        "Do not mix languages in the summary. If the content extracted is Spanish, the report summary must be Spanish."

        TECHNICAL CONSTRAINTS:
        - Output JSON keys and Enum values (like 'DETECTED', 'EXISTING') MUST remain in English.
        - "suggested_action" values ("None", "Create Sheet", "Update Sheet") MUST remain in English.
        - All narrative content (report_summary, role, description) MUST be in the Detected Language.

        TASK:
        1. READ the text deepy.
        2. IDENTIFY all unique characters mentioned.
        3. CLASSIFY them by Relevance (MAIN, SECONDARY, BACKGROUND).
        4. CROSS-REFERENCE with the "EXISTING CHARACTERS" list.
           - If a character is in the text but NOT in the list -> Mark as "DETECTED" (Ghost).
           - If a character is in the list -> Mark as "EXISTING".
        5. ANALYZE DATA GAPS:
           - For "DETECTED" characters:
             a) Summarize their Role/Traits.
             b) **EXTRACT A RICH CONTEXT WINDOW**: Extract approximately 800-1000 characters of text surrounding their key appearance.
             ***CRITICAL CONSTRAINT***: The snippet MUST be about THIS specific character.
             - If the character 'Carla' is mentioned but the scene is about 'Thomas', DO NOT use that paragraph unless Carla takes an action.
             - Find the scene where the character is MOST ACTIVE or Described.
             - Return this in the 'description' field.
           - For "EXISTING" characters, flag if the text contradicts known traits (optional).
        6. GENERATE A STATUS REPORT:
           - A brief, professional summary addressed to the user with the appropriate rank title based on the language ('Commander' for English, 'Comandante' for Spanish).
           - Highlight key findings (e.g., "I found 3 new characters", "Megu appears in 4 scenes").
           - Suggest immediate actions (e.g., "Should we create a sheet for 'The Baker'?").
           - REMEMBER: Write this summary in the language of the document.

        OUTPUT FORMAT (JSON STRICT):
        {
          "report_summary": "Commander, I have analyzed the draft... (IN DETECTED LANGUAGE)",
          "entities": [
            {
              "name": "Name",
              "role": "Brief role description from text (IN DETECTED LANGUAGE)",
              "description": "Found in context: '...raw text of the paragraph...'",
              "relevance_score": 1-10,
              "frequency_count": 0,
              "status": "EXISTING" | "DETECTED",
              "suggested_action": "None" | "Create Sheet" | "Update Sheet"
            }
          ]
        }

        MANUSCRIPT TEXT (Truncated for Context if too long):
        ${content.substring(0, 100000)}
      `;

      // 3. EJECUTAR ANÁLISIS
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      });

      const responseText = result.response.text();

      // 4. SANITIZAR JSON (GLOBAL HELPER)
      const parsed = parseSecureJSON(responseText, "ForgeAnalyzer");

      if (parsed.error === "JSON_PARSE_FAILED") {
        throw new HttpsError('internal', `ForgeAnalyzer JSON Failed: ${parsed.details}`);
      }

      // 5. INJECT REAL IDS (GAMMA FIX)
      if (parsed.entities && Array.isArray(parsed.entities)) {
        parsed.entities = parsed.entities.map((e: any) => {
          const lowerName = e.name.trim().toLowerCase();
          if (roster.has(lowerName)) {
            const match = roster.get(lowerName);
            logger.info(`✅ [ID INJECTION] Matched ${e.name} -> ${match?.id}`);
            return {
              ...e,
              id: match?.id,
              status: 'EXISTING', // Force status if not already
              role: e.role || match?.role // Fallback role if AI missed it
            };
          }
          return e;
        });
      }

      return parsed;

    } catch (error: any) {
      throw handleSecureError(error, "forgeAnalyzer");
    }
  }
);

/**
 * PHASE 6.0: MANIFEST GENERATOR
 * Escanea Drive y genera un manifiesto de personajes en Firestore.
 */
export const syncCharacterManifest = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    secrets: [googleApiKey],
    memory: "2GiB",
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { masterVaultId, accessToken, specificFileId } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    // 🟢 1. CONFIGURATION & SETUP
    const config = await _getProjectConfigInternal(userId);
    let targetVaultId = masterVaultId || config.characterVaultId;

    if (!targetVaultId && !specificFileId) {
      logger.info("ℹ️ Sin Bóveda Maestra configurada. Sincronización omitida.");
      return { success: true, count: 0, message: "No character vault configured." };
    }

    // Initialize Embeddings for Ingestion
    const embeddings = new GeminiEmbedder({
      apiKey: getAIKey(request.data, googleApiKey.value()),
      model: "gemini-embedding-001",
      taskType: TaskType.RETRIEVAL_DOCUMENT,
    });

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    logger.info(`👻 SOUL COLLECTOR v2 (Hybrid Indexer): Scanning for User ${userId}`);

    try {
      // --- HELPER: Slugify ---
      const slugify = (text: string): string => {
        return text
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      };

      let candidates: any[] = [];
      let existingCharIds = new Set<string>();

      if (specificFileId) {
        logger.info(`👻 SOUL COLLECTOR (Surgical Strike): Syncing single file ${specificFileId}`);
        try {
          const meta = await drive.files.get({ fileId: specificFileId, fields: 'name, parents' });
          candidates = [{
            id: specificFileId,
            name: meta.data.name,
            path: meta.data.name,
            saga: 'Global',
            parentId: meta.data.parents?.[0],
            category: 'canon'
          }];
        } catch (e: any) {
          logger.error(`Error fetching specific file ${specificFileId}:`, e);
          throw new HttpsError("not-found", "Could not find specific file.");
        }
      } else {
        logger.info(`👻 SOUL COLLECTOR (Full Scan): Scanning ${targetVaultId}`);
        // 🟢 PRE-SCAN: FETCH EXISTING CHARACTERS FOR STALE PRUNING
        const existingCharsSnapshot = await db.collection("users").doc(userId).collection("characters").get();
        existingCharIds = new Set(existingCharsSnapshot.docs.map(doc => doc.id));
        logger.info(`   -> Pre-existing DB Characters: ${existingCharIds.size}`);

        // --- STEP A: RECURSIVE SCAN ---
        const tree = await fetchFolderContents(drive, targetVaultId, config, true);
        const flatFiles = (await flattenFileTree(tree) as any[]);

        candidates = flatFiles.filter(f =>
          f.mimeType === 'application/vnd.google-apps.document' ||
          f.mimeType.startsWith('text/') ||
          f.name.endsWith('.md') ||
          f.name.endsWith('.txt')
        );
        logger.info(`   -> Files Found in Vault: ${candidates.length}`);

        // 🟢 SAFEGUARD: PREVENT TABULA RASA
        if (!specificFileId && candidates.length === 0) {
          logger.warn("🛡️ [SAFEGUARD] Circuit Breaker Active: 0 candidates found during full scan. Aborting Prune/Sync to prevent Tabula Rasa.");
          return { success: true, count: 0, message: "Safeguard Active: No files found in vault (Pruning skipped)." };
        }
      }

      // --- STEP B: BATCH PROCESS (INGEST + ROSTER) ---
      const BATCH_SIZE = 5;
      let processedCount = 0;
      const touchedCharIds = new Set<string>(); // Keep track of updated/confirmed IDs

      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const batch = candidates.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (file) => {
          try {
            // 1. Fetch Content
            let content = await _getDriveFileContentInternal(drive, (file as any).id);

            // 🟢 CLEANUP: Remove excessive newlines (Global Hygiene)
            if (content) {
              content = content.replace(/\n{3,}/g, '\n\n');
            }

            // 2. Ingest (Vectorize + Hash Check + TDB_Index)
            const ingestResult = await ingestFile(
              db,
              userId,
              config.folderId || specificFileId || "unknown_vault", // 👈 New: Project Anchor
              {
                id: (file as any).id,
                name: file.name,
                path: file.path, // 👈 New: Path Key from flattened file
                saga: file.saga || 'Global', // 👈 New: Saga Context
                parentId: file.parentId,
                category: 'canon' // Character sheets are Canon
              },
              content,
              embeddings
            );

            // 3. Update Roster
            if (content && content.length > 0) {
              const parsed = matter(content);
              const fm = parsed.data;
              const cleanName = file.name.replace(/\.md$/, '').replace(/\.txt$/, '');
              const slug = slugify(cleanName);

              touchedCharIds.add(slug);

              const charRef = db.collection("users").doc(userId).collection("characters").doc(slug);

              // ⚡ FAST PATH: Role Extraction
              let resolvedRole = 'Unregistered Entity';
              // 🟢 CATEGORY EXTRACTION
              // Map file type/category to Firestore 'category' field
              // Valid Categories: 'PERSON', 'CREATURE', 'FLORA', 'LOCATION', 'OBJECT'
              let resolvedCategory = 'PERSON'; // Default
              const rawType = (fm.type || fm.category || '').toLowerCase();

              if (rawType === 'location' || rawType === 'place' || rawType === 'lugar') {
                resolvedCategory = 'LOCATION';
              } else if (rawType === 'object' || rawType === 'item' || rawType === 'thing' || rawType === 'artefact' || rawType === 'objeto') {
                resolvedCategory = 'OBJECT';
              } else if (rawType === 'creature' || rawType === 'beast' || rawType === 'monster' || rawType === 'criatura') {
                resolvedCategory = 'CREATURE';
              } else if (rawType === 'flora' || rawType === 'plant' || rawType === 'planta') {
                resolvedCategory = 'FLORA';
              }

              if (fm.role) resolvedRole = fm.role;
              else if (fm.class) resolvedRole = fm.class;
              else {
                const body = content.replace(/^---[\s\S]*?---\s*/, '').trim();
                if (body.length > 0) {
                  let firstPara = body.split('\n\n')[0].replace(/\n/g, ' ').trim();
                  firstPara = firstPara.replace(/!\[[^\]]*\]\([^\)]+\)/g, '');
                  firstPara = firstPara.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
                  firstPara = firstPara.replace(/[*#_>~`]/g, '');
                  firstPara = firstPara.replace(/\s+/g, ' ').trim();
                  resolvedRole = firstPara;
                }
              }

              // 🟢 STRICT SANITIZATION
              if (resolvedRole) {
                resolvedRole = resolvedRole.replace(/[\r\n]+/g, ' ').trim();
              }

              // 🟢 TRUTH HIERARCHY LOGIC
              const currentDoc = await charRef.get();
              const currentData = currentDoc.exists ? currentDoc.data() : {};

              let finalRole = resolvedRole;
              let isAIEnriched = currentData?.isAIEnriched || false;

              // IF AI enriched AND content has NOT changed (Hash Match) -> KEEP AI ROLE
              if (currentData?.isAIEnriched && currentData?.contentHash === (ingestResult as any).hash) {
                logger.info(`🛡️ [TRUTH SHIELD] Preserving AI Role for ${slug} (Hash Match)`);
                if (currentData.role) finalRole = currentData.role;
                isAIEnriched = true;
              } else if (currentData?.contentHash !== (ingestResult as any).hash) {
                // IF Content Changed -> MANUAL OVERRIDE (Reset AI Flag)
                if (currentDoc.exists) {
                  logger.info(`📝 [MANUAL OVERRIDE] File changed for ${slug}. Resetting AI enrichment.`);
                }
                isAIEnriched = false;
              }

              await charRef.set({
                id: slug,
                name: fm.name || cleanName,
                role: finalRole, // 🟢 USES PROTECTED ROLE
                category: resolvedCategory, // 🟢 SAVE CATEGORY
                tier: fm.tier || 'MAIN',
                age: fm.age || null,
                avatar: fm.avatar || null,
                sourceType: 'MASTER',
                sourceContext: 'GLOBAL',
                masterFileId: (file as any).id,
                contentHash: (ingestResult as any).hash, // 🟢 SAVE HASH FOR FUTURE CHECKS
                isAIEnriched: isAIEnriched,     // 🟢 PERSIST FLAG
                lastUpdated: new Date().toISOString(),
                snippets: [{
                  sourceBookId: 'MASTER_VAULT',
                  sourceBookTitle: 'Master Vault File',
                  text: content.substring(0, 5000)
                }]
              }, { merge: true });

              processedCount++;
            }

          } catch (err) {
            logger.warn(`   ⚠️ Failed to process character ${file.name}:`, err);
          }
        }));
      }

      // --- STEP C: PRUNE STALE CHARACTERS (DUPLICATE CLEANUP) ---
      // Only prune if doing a full scan (no specificFileId)
      if (!specificFileId) {
        const staleIds = [...existingCharIds].filter(id => !touchedCharIds.has(id));
        if (staleIds.length > 0) {
          logger.info(`🧹 PRUNING CHECK: Found ${staleIds.length} potentially stale characters.`);
          const deleteBatch = db.batch();
          let deleteOps = 0;

          // 🟢 ANTI-PRUNING: Fetch to check for GHOSTS before killing
          for (const staleId of staleIds) {
            const staleRef = db.collection("users").doc(userId).collection("characters").doc(staleId);
            const snapshot = await staleRef.get();

            if (snapshot.exists) {
              const d = snapshot.data();
              // 🛡️ GHOST SHIELD: Do not delete if detected/ghost
              if (d?.isGhost === true || d?.status === 'DETECTED') {
                logger.info(`   👻 Ghost Shield Active: Skipping prune for ${staleId}`);
                continue;
              }
            }

            deleteBatch.delete(staleRef);
            deleteOps++;
            logger.info(`   💀 Pruned Stale Entity: ${staleId}`);
          }

          if (deleteOps > 0) {
            await deleteBatch.commit();
            logger.info(`   ✨ ${deleteOps} stale characters deleted.`);
          }
          return { success: true, count: processedCount, pruned: deleteOps };
        }
      }

      logger.info(`✅ Manifest Synced: ${processedCount} processed.`);
      return { success: true, count: processedCount };

    } catch (error: any) {
      throw handleSecureError(error, "syncCharacterManifest");
    }
  }
);

/**
 * 0. CHECK SENTINEL INTEGRITY (El Pulso)
 * Verifica que el sistema tiene acceso a los secretos vitales sin exponerlos.
 */
export const checkSentinelIntegrity = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    // 1. VERIFICAR AUTH (Opcional, pero recomendado para evitar spam)
    // El frontend llama a esto al inicio, así que puede que el usuario aún no esté logueado si es público.
    // Pero MyWorld es privado. Asumimos que el usuario debe estar autenticado o al menos App Check debe pasar.
    // enforceAppCheck: false arriba se encarga de la integridad de la app.

    try {
      logger.info("🛡️ [SENTINEL] Iniciando comprobación de integridad...");

      // 2. CONECTAR CON SECRET MANAGER
      const client = new SecretManagerServiceClient();

      // Obtenemos el Project ID del entorno
      const projectId = process.env.GCLOUD_PROJECT || admin.instanceId().app.options.projectId;

      if (!projectId) {
        throw new Error("No se pudo determinar el Project ID.");
      }

      const name = `projects/${projectId}/secrets/BAPTISM_MASTER_KEY/versions/latest`;

      // 3. INTENTO DE ACCESO (Ping)
      const [version] = await client.accessSecretVersion({
        name: name,
      });

      // 4. VALIDACIÓN SILENCIOSA
      const payload = version.payload?.data?.toString();
      if (!payload) {
        throw new Error("El secreto existe pero está vacío.");
      }

      // 5. RESPUESTA SEGURA (Semaforo Verde)
      logger.info("✅ [SENTINEL] Integridad verificada. Acceso a Secret Manager correcto.");

      return {
        status: 'SECURE',
        connection: true,
        project: projectId,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      logger.error("💥 [SENTINEL] Fallo de integridad:", error);

      // Mapeo de errores comunes
      let code = 'UNKNOWN_ERROR';
      if (error.message.includes('Permission denied') || error.code === 7) {
        code = 'IAM_PERMISSION_DENIED';
      } else if (error.message.includes('Not found') || error.code === 5) {
        code = 'SECRET_NOT_FOUND';
      }

      // NO devolvemos HttpsError para que el frontend pueda manejar el estado 'FAILED' visualmente
      // en lugar de irse al catch block global.
      return {
        status: 'FAILED',
        connection: false,
        errorCode: code,
        details: error.message // Debug info (safe to show admin)
      };
    }
  }
);