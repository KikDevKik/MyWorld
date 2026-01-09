import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings
} from "@langchain/google-genai";
import { TaskType, GoogleGenerativeAI } from "@google/generative-ai";
import { Chunk } from "./similarity";
import { Readable } from 'stream';
import matter from 'gray-matter';

// --- SINGLETON APP (Evita reiniciar Firebase mil veces) ---
let firebaseApp: admin.app.App | undefined;

function initializeFirebase() {
  if (!firebaseApp) {
    logger.info("¡Arrancando el 'Cerebro Robot' (admin) por primera vez!");
    firebaseApp = admin.initializeApp();
  }
}

// --- INTERFACES ---
interface DriveFile {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType: string;
  children?: DriveFile[];
  category?: 'canon' | 'reference';
  parentId?: string; // 👈 Added for Strict Schema
}

interface WriterProfile {
  style: string;
  inspirations: string;
  rules: string;
}

interface ProjectPath {
  id: string;
  name: string;
}

interface ProjectConfig {
  canonPaths: ProjectPath[];
  resourcePaths: ProjectPath[];
  chronologyPath: ProjectPath | null;
  activeBookContext: string;
  folderId?: string;
  lastIndexed?: string;
}

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- FILE FILTERING CONSTANTS ---
const IGNORED_FOLDER_PREFIXES = ['.', '_sys', 'tmp', '__'];
const IGNORED_FOLDER_NAMES = ['node_modules', '__MACOSX', '.obsidian', '.trash', '.stfolder', '.git'];
const ALLOWED_EXTENSIONS = ['.md', '.txt'];
const GOOGLE_DOC_MIMETYPE = 'application/vnd.google-apps.document';
const GOOGLE_FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';

// --- HERRAMIENTAS INTERNAS (HELPERS) ---

async function _getProjectConfigInternal(userId: string): Promise<ProjectConfig> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

  const defaultConfig: ProjectConfig = {
    canonPaths: [],
    resourcePaths: [],
    chronologyPath: null,
    activeBookContext: "Just Megu",
    lastIndexed: undefined
  };

  if (!doc.exists) {
    return defaultConfig;
  }
  return { ...defaultConfig, ...doc.data() };
}

// --- NUEVO HELPER: Convertir Tubería a Texto ---
async function streamToString(stream: Readable, debugLabel: string = "UNKNOWN"): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => {
      const fullBuffer = Buffer.concat(chunks);
      logger.debug(`📉 [STREAM DEBUG] Buffer size for ${debugLabel}: ${fullBuffer.length} bytes`);

      let text = "";
      try {
        text = fullBuffer.toString('utf8');
        // Sanitize NULL bytes for Firestore safety
        // eslint-disable-next-line no-control-regex
        text = text.replace(/\0/g, '');
      } catch (err) {
        logger.error(`💥 [STREAM ERROR] Failed to convert buffer to string for ${debugLabel}:`, err);
        text = ""; // Fallback to empty
      }

      if (text) {
        logger.debug(`📉 [STREAM DEBUG] Preview (${debugLabel}): ${text.substring(0, 100).replace(/\n/g, ' ')}...`);
      } else {
        logger.warn(`📉 [STREAM DEBUG] Preview (${debugLabel}): [EMPTY OR NULL CONTENT]`);
      }

      resolve(text);
    });
  });
}

async function _getDriveFileContentInternal(drive: any, fileId: string): Promise<string> {
  try {
    logger.info(`📖 [LECTOR V5] Analizando archivo: ${fileId}`);

    // 1. PASO DE RECONOCIMIENTO
    const meta = await drive.files.get({
      fileId: fileId,
      fields: "mimeType, name",
      supportsAllDrives: true
    }, {
      headers: { 'Cache-Control': 'no-cache' }
    });

    const mimeType = meta.data.mimeType;
    const fileName = meta.data.name || fileId;
    logger.info(`   - Tipo Identificado: ${mimeType}`);

    let res;

    // 🛑 DEFENSA 1: SI ES UNA CARPETA, ABORTAR MISIÓN
    if (mimeType === "application/vnd.google-apps.folder") {
      logger.warn("   -> ¡Es una carpeta! Deteniendo descarga.");
      return "📂 [INFO] Has seleccionado una carpeta. Abre el árbol para ver sus archivos.";
    }

    // 2. SELECCIÓN DE ARMA
    if (mimeType === "application/vnd.google-apps.document") {
      // A) ES UN GOOGLE DOC
      logger.info("   -> Estrategia: EXPORT (Google Doc a Texto)");
      res = await drive.files.export({
        fileId: fileId,
        mimeType: "text/plain",
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });

    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      // B) ES UNA HOJA DE CÁLCULO
      logger.info("   -> Estrategia: EXPORT (Sheet a CSV)");
      res = await drive.files.export({
        fileId: fileId,
        mimeType: "text/csv",
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });

    } else {
      // C) ES UN ARCHIVO NORMAL (.md, .txt)
      logger.info("   -> Estrategia: DOWNLOAD (Binario)");
      res = await drive.files.get({
        fileId: fileId,
        alt: "media",
        supportsAllDrives: true
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' }
      });
    }

    // 📉 [HEADER DEBUG]
    if (res.headers && res.headers['content-length']) {
      logger.debug(`📉 [HEADER DEBUG] Content-Length for ${fileName}: ${res.headers['content-length']}`);
    } else {
      logger.debug(`📉 [HEADER DEBUG] No Content-Length header received for ${fileName}`);
    }

    // 3. PROCESAR
    return await streamToString(res.data, fileName);

  } catch (error: any) {
    logger.error(`💥 [ERROR LECTURA] Falló al procesar ${fileId}:`, error);
    throw new HttpsError(
      "internal",
      `Error al leer (${fileId}): ${error.message}`
    );
  }
}
/**
 * Escáner de Carpetas (AHORA CON INTERRUPTOR DE PROFUNDIDAD)
 * @param drive Cliente de Google Drive
 * @param folderId ID de la carpeta a leer
 * @param config Configuración del proyecto (para detectar categorías)
 * @param recursive TRUE = Escaneo profundo (para IA), FALSE = Solo nivel actual (para UI)
 * @param currentCategory Contexto actual ('canon' o 'reference')
 */
async function fetchFolderContents(
  drive: any,
  folderId: string,
  config: ProjectConfig,
  recursive: boolean = false,
  currentCategory: 'canon' | 'reference' = 'canon'
): Promise<DriveFile[]> {
  logger.info(`📂 Escaneando carpeta: ${folderId} | Modo Recursivo: ${recursive} | Cat: ${currentCategory}`);

  const query = `'${folderId}' in parents and trashed = false`;

  try {
    const res = await drive.files.list({
      q: query,
      fields: "files(id, name, mimeType)",
      pageSize: 1000, // Subimos el límite por página
    });

    const files = res.data.files;
    if (!files || files.length === 0) return [];

    // 🔍 FILTRO SELECTIVO: Solo contenido relevante
    const validFiles = files.filter((file: any) => {
      const legacyConfig = config as any;
      if (legacyConfig.contextRules && legacyConfig.contextRules[file.id] === 'IGNORE') {
         return false;
      }

      const isFolder = file.mimeType === GOOGLE_FOLDER_MIMETYPE;

      // FOLDER FILTERING
      if (isFolder) {
        if (IGNORED_FOLDER_PREFIXES.some(prefix => file.name.startsWith(prefix))) {
          logger.info(`[SKIPPED] Folder (prefix): ${file.name}`);
          return false;
        }
        if (IGNORED_FOLDER_NAMES.includes(file.name)) {
          logger.info(`[SKIPPED] Folder (system): ${file.name}`);
          return false;
        }
        return true;
      }

      // FILE FILTERING
      if (file.mimeType === GOOGLE_DOC_MIMETYPE) {
        return true;
      }

      const hasAllowedExtension = ALLOWED_EXTENSIONS.some(ext =>
        file.name.toLowerCase().endsWith(ext)
      );

      if (!hasAllowedExtension) {
        logger.info(`[SKIPPED] File (extension): ${file.name} (${file.mimeType})`);
        return false;
      }

      return true;
    });

    // 🟢 PRE-FILTER MAPPING
    const processedFilesPromises = validFiles.map(async (file: any): Promise<DriveFile | null> => {
        // 🟢 DETECCIÓN DE CATEGORÍA (CONTEXT MAPPING)
        let fileCategory: 'canon' | 'reference' = currentCategory;

        const isExplicitCanon = config.canonPaths && config.canonPaths.some(p => p.id === file.id);
        const isExplicitResource = config.resourcePaths && config.resourcePaths.some(p => p.id === file.id);

        if (isExplicitCanon) fileCategory = 'canon';
        if (isExplicitResource) fileCategory = 'reference';

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          let children: DriveFile[] = [];
          if (recursive) {
            children = await fetchFolderContents(drive, file.id, config, true, fileCategory);
          }

          return {
            id: file.id,
            name: file.name,
            type: 'folder',
            mimeType: file.mimeType,
            children: children,
            category: fileCategory,
            parentId: folderId // 👈 Added parentId
          };
        } else {
          return {
            id: file.id,
            name: file.name,
            type: 'file',
            mimeType: file.mimeType,
            category: fileCategory,
            parentId: folderId // 👈 Added parentId
          };
        }
    });

    const resolvedFiles = await Promise.all(processedFilesPromises);
    return resolvedFiles.filter((f): f is DriveFile => f != null);

  } catch (error) {
    logger.error(`Error escaneando ${folderId}:`, error);
    return [];
  }
}

/**
 * Aplana el árbol para el indexador
 */
function flattenFileTree(nodes: DriveFile[]): DriveFile[] {
  const flatList: DriveFile[] = [];
  for (const node of nodes) {
    if (node.type === 'file') {
      flatList.push(node);
    }
    if (node.children) {
      flatList.push(...flattenFileTree(node.children));
    }
  }
  return flatList;
}

// --- CLOUD FUNCTIONS (ENDPOINTS) ---

/**
 * 1. GET DRIVE FILES (El Radar)
 * Escanea y devuelve la estructura del Drive.
 */
export const getDriveFiles = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 300,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();

    const { folderId, folderIds, accessToken } = request.data;

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    if (!folderId && (!folderIds || folderIds.length === 0)) {
      throw new HttpsError("invalid-argument", "Falta el ID de la carpeta (folderId o folderIds).");
    }

    if (!accessToken) {
      throw new HttpsError("unauthenticated", "Falta el Token de Acceso de Google.");
    }

    try {
      const config = await _getProjectConfigInternal(request.auth.uid);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });
      const recursive = request.data.recursive || false;

      let fileTree: DriveFile[] = [];

      // 🟢 MULTI-ROOT SUPPORT
      if (folderIds && Array.isArray(folderIds) && folderIds.length > 0) {
         logger.info(`🚀 Iniciando escaneo MULTI-ROOT para ${folderIds.length} carpetas.`);

         for (const fid of folderIds) {
             let cleanId = fid;
             if (cleanId.includes("drive.google.com")) {
                 const match = cleanId.match(/folders\/([a-zA-Z0-9-_]+)/);
                 if (match && match[1]) cleanId = match[1];
             }

             let category: 'canon' | 'reference' = 'canon';
             if (config.resourcePaths && config.resourcePaths.some(p => p.id === cleanId)) {
                 category = 'reference';
             }

             try {
                const tree = await fetchFolderContents(drive, cleanId, config, recursive, category);
                fileTree = [...fileTree, ...tree];
             } catch (err) {
                 logger.error(`⚠️ Error escaneando root ${cleanId}:`, err);
             }
         }

      } else {
         // 🟢 LEGACY SINGLE ROOT LOGIC
         let cleanFolderId = folderId;
         if (cleanFolderId && cleanFolderId.includes("drive.google.com")) {
           const match = cleanFolderId.match(/folders\/([a-zA-Z0-9-_]+)/);
           if (match && match[1]) {
             logger.info(`🧹 URL detectada. ID extraído: ${match[1]}`);
             cleanFolderId = match[1];
           }
         }

         logger.info(`🚀 Iniciando escaneo SINGLE-ROOT para ID: ${cleanFolderId}`);

         try {
           await drive.files.get({ fileId: cleanFolderId, fields: 'name' });
         } catch (pingError: any) {
           logger.error(`⛔ ACCESS DENIED to folder ${cleanFolderId}:`, pingError);
           throw new HttpsError('permission-denied', `ACCESS DENIED to [${cleanFolderId}].`);
         }

         fileTree = await fetchFolderContents(drive, cleanFolderId, config, recursive);
      }

      return fileTree;
    } catch (error: any) {
      logger.error("Error en getDriveFiles:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 16. GET PROJECT CONFIG (El Plano del Arquitecto)
 * Recupera la configuración del proyecto (rutas canon/recursos).
 */
export const getProjectConfig = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para ver la configuración.");
    }

    const userId = request.auth.uid;

    try {
      const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

      const defaultConfig: ProjectConfig = {
        canonPaths: [],
        resourcePaths: [],
        chronologyPath: null,
        activeBookContext: "Just Megu"
      };

      if (!doc.exists) {
        logger.info(`📭 No hay config para ${userId}, devolviendo defaults.`);
        return defaultConfig;
      }

      logger.info(`🏗️ Configuración del proyecto recuperada para ${userId}`);
      return { ...defaultConfig, ...doc.data() };

    } catch (error: any) {
      logger.error(`💥 Error al recuperar config para ${userId}:`, error);
      throw new HttpsError("internal", `Error al recuperar config: ${error.message}`);
    }
  }
);

/**
 * 17. SAVE PROJECT CONFIG (La Firma del Arquitecto)
 * Guarda la configuración del proyecto.
 */
export const saveProjectConfig = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para guardar la configuración.");
    }

    const config = request.data as ProjectConfig;
    const userId = request.auth.uid;

    logger.info(`💾 Guardando configuración del proyecto para usuario: ${userId}`);

    try {
      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        ...config,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      logger.info(`✅ Configuración guardada correctamente para ${userId}`);

      return { success: true };

    } catch (error: any) {
      logger.error(`💥 Error al guardar config para ${userId}:`, error);
      throw new HttpsError("internal", `Error al guardar config: ${error.message}`);
    }
  }
);

/**
 * 2. GET FILE CONTENT (El Lector)
 * Lee un archivo específico para el editor.
 */
export const getDriveFileContent = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileId, accessToken } = request.data;
    if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });
      const content = await _getDriveFileContentInternal(drive, fileId);
      return { content };
    } catch (error: any) {
      logger.error("Error leyendo archivo:", error);
      throw new HttpsError("internal", "No se pudo leer el archivo.");
    }
  }
);

/**
 * 18. CHECK INDEX STATUS (La Consciencia)
 * Verifica si el usuario ya tiene una base de conocimiento indexada.
 */
export const checkIndexStatus = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const userId = request.auth.uid;

    try {
      const snapshot = await db.collection("TDB_Index").doc(userId).collection("files").limit(1).get();
      const isIndexed = !snapshot.empty;

      let lastIndexedAt = null;

      const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
      if (configDoc.exists) {
        lastIndexedAt = configDoc.data()?.lastIndexed || null;
      }

      if (!lastIndexedAt && isIndexed) {
         lastIndexedAt = snapshot.docs[0].data().lastIndexed || null;
      }

      return { isIndexed, lastIndexedAt };
    } catch (error: any) {
      logger.error("Error checking index status:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 3. INDEX TDB (El Cerebro / Vectorizador)
 * Lee todo, lo trocea y guarda vectores en Firestore.
 */
export const indexTDB = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 3600,
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - Powered by Gemini 3 - ' + new Date().toISOString());
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { folderId, folderIds, accessToken, forceFullReindex } = request.data;

    let cleanFolderId = folderId;
    if (cleanFolderId && cleanFolderId.includes("drive.google.com")) {
      const match = cleanFolderId.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) cleanFolderId = match[1];
    }

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    try {
      // A. Configurar Embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_DOCUMENT,
      });

      // B. Conectar Drive
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });

      // 🟢 NUCLEAR OPTION: TABULA RASA
      if (forceFullReindex) {
        logger.warn(`☢️ NUCLEAR OPTION DETECTED: Wiping memory for user ${userId}`);
        const userIndexRef = db.collection("TDB_Index").doc(userId);
        await db.recursiveDelete(userIndexRef);
        logger.info("   ☢️ Memory wiped clean. Starting fresh.");
      }

      // 🟢 RECUPERAR CONFIGURACIÓN DEL USUARIO
      const config = await _getProjectConfigInternal(userId);

      let fileTree: DriveFile[] = [];

      // 🟢 MULTI-ROOT SCANNING
      if (folderIds && Array.isArray(folderIds) && folderIds.length > 0) {
         logger.info(`🚀 Indexando MULTI-ROOT (${folderIds.length} carpetas)...`);
         for (const fid of folderIds) {
             let cleanId = fid;
             if (cleanId.includes("drive.google.com")) {
                 const match = cleanId.match(/folders\/([a-zA-Z0-9-_]+)/);
                 if (match && match[1]) cleanId = match[1];
             }

             let category: 'canon' | 'reference' = 'canon';
             if (config.resourcePaths && config.resourcePaths.some(p => p.id === cleanId)) {
                 category = 'reference';
             }

             try {
                const tree = await fetchFolderContents(drive, cleanId, config, true, category);
                fileTree = [...fileTree, ...tree];
             } catch (err) {
                logger.error(`⚠️ Error indexando root ${cleanId}:`, err);
             }
         }
      } else if (cleanFolderId) {
         logger.info(`🚀 Indexando SINGLE-ROOT: ${cleanFolderId}`);
         fileTree = await fetchFolderContents(drive, cleanFolderId, config, true);
      } else {
         throw new HttpsError("invalid-argument", "No se proporcionaron carpetas para indexar.");
      }

      // 🟢 C. SAVE FILE TREE STRUCTURE (SNAPSHOT)
      try {
        const treePayload = JSON.parse(JSON.stringify(fileTree));
        await db.collection("TDB_Index").doc(userId).collection("structure").doc("tree").set({
          tree: treePayload,
          updatedAt: new Date().toISOString()
        });
        logger.info("🌳 Árbol de archivos guardado en TDB_Index/structure/tree");
      } catch (treeError) {
        logger.error("⚠️ Error guardando estructura del árbol:", treeError);
      }

      const fileList = flattenFileTree(fileTree);

      // 🟢 GHOST FILE PRUNING
      logger.info("👻 Iniciando protocolo de detección de fantasmas...");
      const filesCollectionRef = db.collection("TDB_Index").doc(userId).collection("files");

      const dbFilesSnapshot = await filesCollectionRef.select().get();
      const dbFileIds = new Set(dbFilesSnapshot.docs.map(doc => doc.id));
      const driveFileIds = new Set(fileList.map(f => f.id));
      const ghostFileIds = [...dbFileIds].filter(id => !driveFileIds.has(id));
      let ghostFilesPruned = 0;

      if (ghostFileIds.length > 0) {
        logger.info(`👻 Detectados ${ghostFileIds.length} archivos fantasma. Eliminando...`);
        for (const ghostId of ghostFileIds) {
           const ghostRef = filesCollectionRef.doc(ghostId);
           await db.recursiveDelete(ghostRef);
           ghostFilesPruned++;
           logger.info(`   💀 Fantasma exorcizado: ${ghostId}`);
        }
      } else {
        logger.info("👻 No se detectaron archivos fantasma. La memoria está limpia.");
      }

      let totalChunks = 0;
      let totalChunksDeleted = 0;

      // E. Procesar cada archivo
      await Promise.all(
        fileList.map(async (file) => {
          try {
            if (!file.id) {
              logger.warn(`⚠️ Saltando archivo sin ID: ${file.name}`);
              return;
            }

            // 🟢 1. CLEANUP FIRST (Batched Delete Strategy)
            const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(file.id);
            const chunksRef = fileRef.collection("chunks");

            logger.info(`🧹 Iniciando purga de chunks para: ${file.name} (${file.id})`);

            let deletedCount = 0;
            const snapshot = await chunksRef.get();

            if (!snapshot.empty) {
              let batch = db.batch();
              let operationCount = 0;

              for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                deletedCount++;

                if (operationCount >= 400) {
                  await batch.commit();
                  batch = db.batch();
                  operationCount = 0;
                }
              }

              if (operationCount > 0) {
                await batch.commit();
              }
            }

            totalChunksDeleted += deletedCount;

            // 🟢 2. FETCH
            const content = await _getDriveFileContentInternal(drive, file.id);

            // 🛑 TRULY EMPTY FILE CHECK
            if (!content || content.trim().length === 0) {
              logger.warn(`⚠️ [SKIP] File is genuinely empty (0 bytes or whitespace): ${file.name}`);
              return;
            }

            // --- STANDARD PROTOCOL (One File = One Chunk) ---
            const chunkText = content.substring(0, 8000);
            const now = new Date().toISOString();

            // Update File Metadata
            await fileRef.set({
              name: file.name,
              lastIndexed: now,
              chunkCount: 1,
              category: file.category || 'canon',
              timelineDate: null,
            });

            // 🟢 3. VECTORIZE & SAVE (Strict Schema)
            const vector = await embeddings.embedQuery(chunkText);

            await chunksRef.doc("chunk_0").set({
              userId: userId,
              fileName: file.name,
              text: chunkText,
              docId: file.id,
              folderId: file.parentId || 'unknown',
              timestamp: now,
              type: 'file',
              category: file.category || 'canon',
              embedding: FieldValue.vector(vector)
            });

            totalChunks += 1;
            logger.info(`   ✨ Re-indexado: ${file.name} (1 chunk)`);

          } catch (err: any) {
            logger.error(`Error indexando ${file.name}:`, err);
          }
        })
      );

      // 🟢 4. UPDATE PROJECT CONFIG
      const now = new Date().toISOString();
      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        lastIndexed: now,
        updatedAt: now
      }, { merge: true });

      logger.info(`✅ Indexación completada. Timestamp global actualizado: ${now}`);

      return {
        success: true,
        filesIndexed: fileList.length,
        totalChunks: totalChunks,
        chunksCreated: totalChunks,
        chunksDeleted: totalChunksDeleted,
        ghostFilesPruned: ghostFilesPruned,
        message: `¡Indexado completado! (Fantasmas eliminados: ${ghostFilesPruned})`,
        lastIndexed: now
      };

    } catch (error: any) {
      logger.error("Error crítico en Indexador:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 4. CHAT WITH GEM (El Oráculo RAG)
 * Responde preguntas usando la base de datos vectorial.
 */
export const chatWithGem = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 540,
    secrets: [googleApiKey],
    memory: "2GiB",
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - Powered by Gemini 3 - ' + new Date().toISOString());
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction, history, categoryFilter, activeFileContent, activeFileName, isFallbackContext } = request.data;

    if (!query) throw new HttpsError("invalid-argument", "Falta la pregunta.");

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

      // 1. Preparar Búsqueda Contextual
      let searchQuery = query;
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

        searchQuery = `Contexto: ${userHistory} \n Pregunta: ${query}`;
        logger.info("🔍 Búsqueda Vectorial Enriquecida:", searchQuery);
      }

      if (history && Array.isArray(history) && history.length > 20) {
        const sliced = history.slice(-20);
        historyText = sliced.map((h: any) =>
           `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");
        logger.info(`✂️ Historial recortado a los últimos 20 mensajes para ahorrar tokens.`);
      }

      // 2. Vectorizar Pregunta
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_QUERY,
      });
      const queryVector = await embeddings.embedQuery(searchQuery);

      // 3. Recuperar Chunks (Vector Search Nativo)
      const coll = db.collectionGroup("chunks");
      let chunkQuery = coll.where("userId", "==", userId);

      const fetchLimit = isFallbackContext ? 100 : 50;

      console.log('🔍 Vector Search Request for User:', userId);

      const vectorQuery = chunkQuery.findNearest({
        queryVector: queryVector,
        limit: fetchLimit,
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      const vectorSnapshot = await vectorQuery.get();

      console.log('🔢 Vectors Found (Raw):', vectorSnapshot.docs.length);
      if (vectorSnapshot.docs.length > 0) {
          const firstMatch = vectorSnapshot.docs[0].data();
          console.log('📜 First Match:', firstMatch.fileName);
      } else {
          console.log('⚠️ NO VECTORS FOUND. Check Index or UserID match.');
      }

      let candidates: Chunk[] = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        embedding: [],
        fileName: doc.data().fileName || "Desconocido",
        fileId: doc.ref.parent.parent?.id || "unknown_id",
        category: doc.data().category || 'canon',
      }));

      // 🟢 SOURCE DIVERSITY LIMITING
      const returnLimit = isFallbackContext ? 20 : 15;
      const MAX_CHUNKS_PER_FILE = 5;

      const finalContext: Chunk[] = [];
      const rejectedCandidates: Chunk[] = [];
      const fileCounts: { [key: string]: number } = {};

      // A) FILTER EXCLUSION (Active File)
      if (activeFileName) {
         logger.info(`🔍 Filtering out chunks from active file: ${activeFileName}`);
         candidates = candidates.filter(c => c.fileName !== activeFileName);
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

      // C) BACKFILL PASS (Fill Gaps)
      if (finalContext.length < returnLimit) {
          logger.info(`⚠️ Diversity Shortfall (${finalContext.length}/${returnLimit}). Backfilling...`);
          for (const chunk of rejectedCandidates) {
              if (finalContext.length >= returnLimit) break;
              finalContext.push(chunk);
          }
      }

      const relevantChunks = finalContext;
      logger.info('📚 RAG Context Sources:', relevantChunks.map(c => c.fileName));

      // 5. Construir Contexto RAG
      const contextText = relevantChunks.map(c => c.text).join("\n\n---\n\n");

      // 6. Llamar a Gemini (Nivel GOD TIER)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview",
        temperature: 0.7,
      });

      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE CONTINUIDAD (DARK BROTHERHOOD) ===
OBJETIVO: Actuar como Arquitecto Narrativo y Gestor de Continuidad.

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
      finalSystemInstruction = CONTINUITY_PROTOCOL + "\n\n" + finalSystemInstruction;

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
      `;

      const promptFinal = `
        ${profileContext}
        ${finalSystemInstruction}

        ${coAuthorInstruction}

        ${activeContextSection}

        ${longTermMemorySection}

        --- HISTORIAL DE CONVERSACIÓN ---
        ${historyText}
        -------------------------------------------

        PREGUNTA DEL USUARIO: "${query}"
      `;

      const response = await chatModel.invoke(promptFinal);

      return {
        response: response.content,
        sources: relevantChunks.map(chunk => ({
          text: chunk.text.substring(0, 200) + "...",
          fileName: chunk.fileName
        }))
      };

    } catch (error: any) {
      logger.error("Error en Chat RAG:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * PHASE 4.1: WORLD ENGINE (TITAN LINK)
 * Motor de simulación y lógica narrativa potenciado por Gemini 3.
 */
export const worldEngine = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 1800, // 30 Minutes
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 4.1 - TITAN LINK - ' + new Date().toISOString());

    // 1. DATA RECEPTION
    const { prompt, agentId, chaosLevel, context } = request.data;
    const { canon_dump, timeline_dump } = context || {};

    // 2. DEBUG LOGGING
    logger.info("🔌 [TITAN LINK] Payload Received:", {
      agentId,
      chaosLevel,
      canonLength: canon_dump ? canon_dump.length : 0,
      timelineLength: timeline_dump ? timeline_dump.length : 0
    });

    try {
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        generationConfig: {
          temperature: 1.0,
          responseMimeType: "application/json",
          // @ts-ignore - SDK types might lag behind experimental features
          thinking_config: { include_thoughts: true, thinking_level: "high" }
        } as any
      });

      const systemPrompt = `
        You are using the Gemini 3 Reasoning Engine.
        Your Persona: ${agentId} (Chaos Level: ${chaosLevel}).

        === WORLD CONTEXT (THE LAW) ===
        ${canon_dump || "No canon rules provided."}

        === TIMELINE (THE LORE) ===
        ${timeline_dump || "No timeline events provided."}

        INSTRUCTIONS:
        1. Ingest the provided World Context (Canon/Timeline).
        2. THINK: Spend significant time tracing the causal chains (Butterfly Effect).
        3. Constraint: Do not rush. If the user asks about 'War', analyze the economic impact of 'Psycho-Energy' on weapon manufacturing first.
        4. Output: A JSON Node Card.

        USER PROMPT: "${prompt}"

        OUTPUT FORMAT (JSON):
        {
          "type": "concept" | "plot" | "character",
          "title": "Short Title",
          "content": "Deeply reasoned analysis...",
          "thoughts": "Optional summary of your reasoning process"
        }
      `;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: systemPrompt }] }]
      });

      const responseText = result.response.text();

      // Clean JSON with Aggressive Regex to strip "Thinking Traces"
      try {
        const firstBrace = responseText.indexOf('{');
        const lastBrace = responseText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
           throw new Error("No valid JSON object found (Braces missing or inverted)");
        }

        const cleanJson = responseText.substring(firstBrace, lastBrace + 1);
        return JSON.parse(cleanJson);

      } catch (parseError: any) {
         logger.error("💥 MALFORMED AI RESPONSE:", responseText);
         throw new HttpsError('internal', 'AI Output Malformed: ' + responseText.slice(0, 100) + '...');
      }

    } catch (error: any) {
      logger.error("💥 TITAN LINK FAILED:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);




/**
 * 6. SAVE DRIVE FILE (El Escriba)
 * Guarda cambios en archivos de texto en Google Drive.
 */
export const saveDriveFile = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para guardar.");
    }

    const { fileId, content, accessToken } = request.data;

    if (!fileId) throw new HttpsError("invalid-argument", "Falta el ID del archivo.");
    if (content === undefined || content === null) throw new HttpsError("invalid-argument", "Falta el contenido.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    logger.info(`💾 Guardando archivo: ${fileId}`);

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });

      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: "text/plain",
          body: content,
        },
      });

      logger.info(`   ✅ Archivo guardado correctamente: ${fileId}`);

      return {
        success: true,
        timestamp: new Date().toISOString(),
      };

    } catch (error: any) {
      logger.error(`💥 Error al guardar archivo ${fileId}:`, error);
      throw new HttpsError("internal", `Error al guardar: ${error.message}`);
    }
  }
);

/**
 * 7. SAVE USER PROFILE (La Identidad)
 * Guarda el perfil de escritor del usuario para personalizar las interacciones con la IA.
 */
export const saveUserProfile = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para guardar tu perfil.");
    }

    const { style, inspirations, rules } = request.data;
    const userId = request.auth.uid;

    logger.info(`💾 Guardando perfil de escritor para usuario: ${userId}`);

    try {
      await db.collection("users").doc(userId).collection("profile").doc("writer_config").set({
        style: style || '',
        inspirations: inspirations || '',
        rules: rules || '',
        updatedAt: new Date().toISOString()
      });

      logger.info(`✅ Perfil guardado correctamente para ${userId}`);

      return { success: true };

    } catch (error: any) {
      logger.error(`💥 Error al guardar perfil para ${userId}:`, error);
      throw new HttpsError("internal", `Error al guardar perfil: ${error.message}`);
    }
  }
);

/**
 * 8. GET USER PROFILE (El Espejo)
 * Recupera el perfil de escritor del usuario.
 */
export const getUserProfile = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para ver tu perfil.");
    }

    const userId = request.auth.uid;

    try {
      const doc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();

      if (!doc.exists) {
        logger.info(`📭 No hay perfil guardado para ${userId}, devolviendo perfil vacío.`);
        return { style: '', inspirations: '', rules: '' };
      }

      logger.info(`📖 Perfil recuperado para ${userId}`);
      return doc.data();

    } catch (error: any) {
      logger.error(`💥 Error al recuperar perfil para ${userId}:`, error);
      throw new HttpsError("internal", `Error al recuperar perfil: ${error.message}`);
    }
  }
);

/**
 * 9. CREATE FORGE SESSION (La Fragua)
 * Crea una nueva sesión de persistencia para la Forja.
 */
export const createForgeSession = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { name, type } = request.data;
    if (!name) {
      throw new HttpsError("invalid-argument", "Falta el nombre de la sesión.");
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
      logger.error("Error creando sesión de forja:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 10. GET FORGE SESSIONS (El Inventario)
 * Lista todas las sesiones de forja del usuario.
 */
export const getForgeSessions = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const userId = request.auth.uid;
    const { type } = request.data;

    try {
      let query = db.collection("users").doc(userId).collection("forge_sessions")
        .orderBy("updatedAt", "desc");

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
      logger.error("Error obteniendo sesiones de forja:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 11. DELETE FORGE SESSION (El Reciclaje)
 * Elimina una sesión de forja.
 */
export const deleteForgeSession = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
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
      const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
      await db.recursiveDelete(sessionRef);

      logger.info(`🗑️ Sesión de Forja eliminada recursivamente: ${sessionId}`);
      return { success: true };

    } catch (error: any) {
      logger.error("Error eliminando sesión de forja:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 12. ADD FORGE MESSAGE (El Mensajero)
 * Guarda un mensaje en el historial de la sesión.
 */
export const addForgeMessage = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { sessionId, role, text } = request.data;
    if (!sessionId || !role || !text) {
      throw new HttpsError("invalid-argument", "Faltan datos del mensaje.");
    }

    const userId = request.auth.uid;
    const now = new Date().toISOString();

    try {
      const msgRef = db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages").doc();

      await msgRef.set({
        role,
        text,
        timestamp: now
      });

      await db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .update({ updatedAt: now });

      return { success: true, id: msgRef.id };

    } catch (error: any) {
      logger.error("Error guardando mensaje de forja:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 13. GET FORGE HISTORY (La Memoria)
 * Recupera el historial de chat de una sesión.
 */
export const getForgeHistory = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
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
      logger.error("Error recuperando historial de forja:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 14. FORGE TO DRIVE (La Materialización)
 * Compila el chat en un archivo Markdown y lo guarda en Drive.
 */
export const forgeToDrive = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { sessionId, accessToken } = request.data;
    let { folderId } = request.data;

    if (folderId && folderId.includes("drive.google.com")) {
      const match = folderId.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        folderId = match[1];
      }
    }

    if (!folderId) throw new HttpsError("invalid-argument", "Falta el ID de la carpeta.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    try {
      const snapshot = await db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages")
        .orderBy("timestamp", "asc")
        .get();

      if (snapshot.empty) {
        throw new HttpsError("failed-precondition", "La sesión está vacía.");
      }

      const historyText = snapshot.docs.map(doc => {
        const d = doc.data();
        return `${d.role === 'user' ? 'USUARIO' : 'IA'}: ${d.text}`;
      }).join("\n\n");

      const synthesisModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview",
        temperature: 0.4,
      });

      const synthesisPrompt = `
        ACT AS: Expert Archivist and Lore Keeper.
        GOAL: Create a comprehensive, structured Character Sheet or Worldbuilding Document in MARKDOWN based on the conversation.
        
        LANGUAGE PROTOCOL:
        1. Analyze the "CONVERSATION HISTORY" below.
        2. Detect the primary language used by the user.
        3. GENERATE THE OUTPUT DOCUMENT IN THAT SAME LANGUAGE.
        (e.g., If chat is in Spanish -> Output in Spanish. If Japanese -> Output in Japanese).
        
        INSTRUCTIONS:
        - Use headers (#, ##), bullet points, and bold text.
        - Sections to include (if data exists): Name/Title, Concept, Appearance, Personality, Powers/Abilities, History, Conflicts.
        - Do not include chat meta-talk (like "Here is the file"). Just the content.
        - Output ONLY the Markdown content.
        
        CONVERSATION HISTORY:
        ${historyText}
      `;

      const aiResponse = await synthesisModel.invoke(synthesisPrompt);
      const markdownContent = aiResponse.content.toString();

      let fileName = "";
      try {
        const titleModel = new ChatGoogleGenerativeAI({
          apiKey: googleApiKey.value(),
          model: "gemini-2.5-flash",
          temperature: 0.7,
        });

        const titlePrompt = `
          ACT AS: Expert Editor.
          GOAL: Generate a short, descriptive filename for the following document.

          INSTRUCTIONS:
          - Read the document content below.
          - Create a filename that summarizes the essence (max 6 words).
          - Use underscores (_) instead of spaces.
          - Use ONLY alphanumeric characters (A-Z, 0-9) and underscores. NO special characters, NO accents.
          - If the content is in another language, translate the essence to English OR use non-accented characters.
          - NO extension, NO extra text. Just the name.

          DOCUMENT CONTENT (Snippet):
          ${markdownContent.substring(0, 2000)}
        `;

        const titleResponse = await titleModel.invoke(titlePrompt);
        let rawName = titleResponse.content.toString().trim();
        rawName = rawName.replace(/[^a-zA-Z0-9_\-]/g, "");
        if (rawName.length > 0) {
           fileName = `${rawName}.md`;
        }
      } catch (e) {
        logger.warn("Error generando nombre con IA, usando fallback.", e);
      }

      if (!fileName) {
        const sessionDoc = await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).get();
        const sessionName = sessionDoc.exists ? sessionDoc.data()?.name : "Sesion_Forja";
        const safeName = sessionName.replace(/[^a-zA-Z0-9]/g, "_");
        fileName = `${safeName}_${new Date().getTime()}.md`;
      }

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      const media = {
        mimeType: 'text/markdown',
        body: markdownContent
      };

      const file = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: media,
        fields: 'id, name',
      });

      logger.info(`📜 Archivo forjado en Drive: ${file.data.name} (${file.data.id})`);

      return { success: true, fileName: file.data.name, fileId: file.data.id };

    } catch (error: any) {
      logger.error("Error en Forge to Drive:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 15. SUMMON THE TRIBUNAL (El Juicio)
 * Invoca a 3 jueces IA (Arquitecto, Bardo, Hater) para criticar un texto.
 */
export const summonTheTribunal = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 540,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para convocar al Tribunal.");
    }

    const { text, fileId, context, accessToken } = request.data;

    let textToAnalyze = text;

    if (!textToAnalyze) {
      if (fileId && accessToken) {
        try {
          logger.info(`⚖️ Tribunal leyendo archivo: ${fileId}`);
          const auth = new google.auth.OAuth2();
          auth.setCredentials({ access_token: accessToken });
          const drive = google.drive({ version: "v3", auth });

          textToAnalyze = await _getDriveFileContentInternal(drive, fileId);
        } catch (error: any) {
          logger.error("Error leyendo archivo para el Tribunal:", error);
          throw new HttpsError("internal", "No se pudo leer el archivo para el juicio.");
        }
      } else {
        throw new HttpsError("invalid-argument", "Falta el texto o el ID del archivo (con token).");
      }
    }

    if (!textToAnalyze) {
      throw new HttpsError("invalid-argument", "El contenido a analizar está vacío.");
    }

    const userId = request.auth.uid;

    try {
      const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
      const profile: WriterProfile = profileDoc.exists
        ? profileDoc.data() as WriterProfile
        : { style: '', inspirations: '', rules: '' };

      const profileContext = `
        USER WRITING PROFILE:
        - Style/Voice: ${profile.style || 'Not specified'}
        - Inspirations: ${profile.inspirations || 'Not specified'}
        - Personal Rules: ${profile.rules || 'Not specified'}
      `;

      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview",
        temperature: 0.4,
        generationConfig: {
          responseMimeType: "application/json",
        }
      } as any);

      const systemPrompt = `
        ACT AS: The Literary Tribunal, a panel of 3 distinct AI judges who critique writing.

        THE JUDGES:
        1. THE ARCHITECT (Logic & Structure):
           - Focus: Plot holes, pacing, causality, clarity, world-building consistency.
           - Tone: Cold, analytical, precise, constructive but firm.
           - Quote: "Structure is the skeleton that holds the flesh of narrative."

        2. THE BARD (Aesthetics & Emotion):
           - Focus: Prose quality, sensory details, emotional resonance, metaphor, flow.
           - Tone: Poetic, passionate, dramatic, sometimes overly flowery.
           - Quote: "Words must sing before they can speak."

        3. THE HATER (Market & Cynicism):
           - Focus: Clichés, boredom, marketability, hooks, "cringe" factor.
           - Tone: Sarcastic, brutal, impatient, speaks in internet slang/short sentences.
           - Quote: "I stopped reading at the second paragraph. Boring."

        TASK:
        Analyze the provided TEXT based on the USER WRITING PROFILE and the CONTEXT.
        Each judge must provide:
        - verdict: A short, punchy summary of their opinion (1 sentence).
        - critique: A detailed paragraph explaining their view (max 80 words).
        - score: A rating from 1 to 10.

        ANÁLISIS DE IDIOMA: Detecta automáticamente el idioma del texto proporcionado (Español, Inglés, Japonés, etc.). Tu respuesta JSON (los campos verdict y critique) DEBE estar escrita estrictamente en ese mismo idioma.

        INPUT CONTEXT:
        "${context || 'No specific context provided.'}"

        USER PROFILE:
        ${profileContext}

        OUTPUT FORMAT (JSON STRICT):
        {
          "architect": { "verdict": "...", "critique": "...", "score": 0 },
          "bard": { "verdict": "...", "critique": "...", "score": 0 },
          "hater": { "verdict": "...", "critique": "...", "score": 0 }
        }
      `;

      const response = await chatModel.invoke([
        ["system", systemPrompt],
        ["human", textToAnalyze]
      ]);

      const content = response.content.toString();

      const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const tribunalVerdict = JSON.parse(cleanJson);

      logger.info(`⚖️ Tribunal convocado por ${userId}. Veredicto emitido.`);

      return tribunalVerdict;

    } catch (error: any) {
      logger.error("Error en summonTheTribunal:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 4. CRONISTA (Intelligent Timeline)
 * Analiza texto y extrae eventos temporales con fechas absolutas (enteros).
 */
export const extractTimelineEvents = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileId, content, currentYear, eraName } = request.data;
    const userId = request.auth.uid;

    if (!content || !currentYear) {
      throw new HttpsError("invalid-argument", "Faltan datos (content o currentYear).");
    }

    try {
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
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
      const events = JSON.parse(responseText);

      const batch = db.batch();
      const timelineRef = db.collection("TDB_Timeline").doc(userId).collection("events");

      let count = 0;
      for (const event of events) {
        const docRef = timelineRef.doc();
        batch.set(docRef, {
          ...event,
          sourceFileId: fileId,
          status: 'suggested',
          createdAt: new Date().toISOString()
        });
        count++;
      }

      await batch.commit();

      return { success: true, count, events };

    } catch (error: any) {
      logger.error("Error en extractTimelineEvents:", error);
      throw new HttpsError("internal", "Error analizando cronología: " + error.message);
    }
  }
);

/**
 * COMPILE MANUSCRIPT (La Imprenta)
 * Genera un PDF compilando múltiples archivos en orden
 */
export const compileManuscript = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 540,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { fileIds, title, author, accessToken } = request.data;

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new HttpsError("invalid-argument", "Falta fileIds (array).");
    }
    if (!title) throw new HttpsError("invalid-argument", "Falta title.");
    if (!author) throw new HttpsError("invalid-argument", "Falta author.");
    if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");

    try {
      logger.info(`📚 Compilando manuscrito: ${title} (${fileIds.length} archivos)`);

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

      const docDefinition: any = {
        content: [
          {
            text: title,
            style: "title",
            alignment: "center",
            margin: [0, 100, 0, 20]
          },
          {
            text: `por ${author}`,
            style: "author",
            alignment: "center",
            margin: [0, 0, 0, 0]
          },
          { text: "", pageBreak: "after" },

          ...contents.map((content, index) => {
            return [
              {
                text: content,
                style: "body",
                margin: [0, 0, 0, 20]
              },
              ...(index < contents.length - 1 ? [{ text: "", pageBreak: "after" }] : [])
            ];
          }).flat()
        ],
        styles: {
          title: {
            fontSize: 28,
            bold: true,
            font: "Roboto"
          },
          author: {
            fontSize: 16,
            italics: true,
            font: "Roboto"
          },
          body: {
            fontSize: 12,
            font: "Roboto",
            lineHeight: 1.5
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
      logger.error("Error compilando manuscrito:", error);
      throw new HttpsError("internal", "Error generando PDF: " + error.message);
    }
  }
);

/**
 * DEBUG: GET INDEX STATS (La Lupa del Arquitecto)
 * Devuelve un resumen del estado actual del índice (qué archivos hay y de qué categoría).
 */
export const debugGetIndexStats = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const userId = request.auth.uid;

    try {
      const filesSnapshot = await db.collection("TDB_Index").doc(userId).collection("files").get();

      let totalFiles = 0;
      let canonCount = 0;
      let referenceCount = 0;
      const fileDetails: any[] = [];

      filesSnapshot.forEach(doc => {
        const data = doc.data();
        totalFiles++;

        if (data.category === 'reference') {
          referenceCount++;
        } else {
          canonCount++;
        }

        fileDetails.push({
          id: doc.id,
          name: data.name,
          category: data.category || 'canon',
          chunkCount: data.chunkCount || 0,
          lastIndexed: data.lastIndexed
        });
      });

      fileDetails.sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      });

      logger.info(`🔍 Debug Stats: ${totalFiles} files (Canon: ${canonCount}, Ref: ${referenceCount})`);

      return {
        totalFiles,
        canonCount,
        referenceCount,
        files: fileDetails
      };

    } catch (error: any) {
      logger.error("Error obteniendo stats del index:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);
