import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { defineSecret } from "firebase-functions/params";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings
} from "@langchain/google-genai";
import { TaskType, GoogleGenerativeAI } from "@google/generative-ai";
import { Chunk } from "./similarity";
import { Readable } from 'stream';
import matter from 'gray-matter'; // 👈 Fixed import

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
  category?: 'canon' | 'reference'; // 👈 Nueva propiedad
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
  canonPaths: ProjectPath[]; // 👈 Changed from string[] to ProjectPath[]
  resourcePaths: ProjectPath[]; // 👈 Changed from string[] to ProjectPath[]
  chronologyPath: ProjectPath | null; // 👈 Changed from string to ProjectPath | null
  activeBookContext: string;
  folderId?: string; // 👈 Folder Persistence
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
      logger.info(`📉 [STREAM DEBUG] Buffer size for ${debugLabel}: ${fullBuffer.length} bytes`);
      const text = fullBuffer.toString('utf8');
      logger.info(`📉 [STREAM DEBUG] Preview (${debugLabel}): ${text.substring(0, 100).replace(/\n/g, ' ')}...`);
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
      headers: { 'Cache-Control': 'no-cache' } // 👈 Force fresh metadata
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
        headers: { 'Cache-Control': 'no-cache' } // 👈 Force fresh export
      });

    } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      // B) ES UNA HOJA DE CÁLCULO
      logger.info("   -> Estrategia: EXPORT (Sheet a CSV)");
      res = await drive.files.export({
        fileId: fileId,
        mimeType: "text/csv",
      }, {
        responseType: 'stream',
        headers: { 'Cache-Control': 'no-cache' } // 👈 Force fresh export
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
        headers: { 'Cache-Control': 'no-cache' } // 👈 Force fresh content
      });
    }

    // 📉 [HEADER DEBUG]
    if (res.headers && res.headers['content-length']) {
      logger.info(`📉 [HEADER DEBUG] Content-Length for ${fileName}: ${res.headers['content-length']}`);
    } else {
      logger.info(`📉 [HEADER DEBUG] No Content-Length header received for ${fileName}`);
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
      // We don't have explicit IGNORE rules in the new config structure yet,
      // but if we did, we would check them here.
      // For now, relies on standard filters.
      // (Legacy support: if config has contextRules and it's IGNORE)
      const legacyConfig = config as any;
      if (legacyConfig.contextRules && legacyConfig.contextRules[file.id] === 'IGNORE') {
         return false;
      }

      const isFolder = file.mimeType === GOOGLE_FOLDER_MIMETYPE;

      // FOLDER FILTERING
      if (isFolder) {
        // Skip if starts with any ignored prefix
        if (IGNORED_FOLDER_PREFIXES.some(prefix => file.name.startsWith(prefix))) {
          logger.info(`[SKIPPED] Folder (prefix): ${file.name}`);
          return false;
        }
        // Skip if matches known system folders
        if (IGNORED_FOLDER_NAMES.includes(file.name)) {
          logger.info(`[SKIPPED] Folder (system): ${file.name}`);
          return false;
        }
        return true; // Folder is valid
      }

      // FILE FILTERING
      // Allow Google Docs
      if (file.mimeType === GOOGLE_DOC_MIMETYPE) {
        return true;
      }

      // Allow only .md and .txt files
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
    // Map valid files to promises
    const processedFilesPromises = validFiles.map(async (file: any): Promise<DriveFile | null> => {
        // 🟢 DETECCIÓN DE CATEGORÍA (CONTEXT MAPPING)
        // 1. Inherit from parent by default
        let fileCategory: 'canon' | 'reference' = currentCategory;

        // 2. Check for Specific Override Rule based on New Config Structure
        // Check if this file/folder ID is in the explicit lists
        const isExplicitCanon = config.canonPaths && config.canonPaths.some(p => p.id === file.id);
        const isExplicitResource = config.resourcePaths && config.resourcePaths.some(p => p.id === file.id);

        if (isExplicitCanon) fileCategory = 'canon';
        if (isExplicitResource) fileCategory = 'reference';

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          let children: DriveFile[] = [];
          if (recursive) {
            children = await fetchFolderContents(drive, file.id, config, true, fileCategory); // 👈 Propagamos categoría actualizada
          }

          return {
            id: file.id,
            name: file.name,
            type: 'folder',
            mimeType: file.mimeType,
            children: children,
            category: fileCategory, // 👈 Guardamos categoría
          };
        } else {
          // Explicit return for files
          return {
            id: file.id,
            name: file.name,
            type: 'file',
            mimeType: file.mimeType,
            category: fileCategory, // 👈 Guardamos categoría
          };
        }
    });

    const resolvedFiles = await Promise.all(processedFilesPromises);
    // Filter out nulls (ignored files) - Enhanced check
    return resolvedFiles.filter((f): f is DriveFile => f != null);

  } catch (error) {
    logger.error(`Error escaneando ${folderId}:`, error);
    return []; // En caso de error en una subcarpeta, no rompemos todo el árbol
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

    const { folderId, folderIds, accessToken } = request.data; // <--- 🟢 RECIBIR TOKEN y folderIds

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
      // 🟢 RECUPERAR CONFIGURACIÓN DEL USUARIO
      const config = await _getProjectConfigInternal(request.auth.uid);

      // 🟢 USAR TOKEN DEL USUARIO
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });

      // 🟢 CAMBIO CRÍTICO: recursive param
      const recursive = request.data.recursive || false;

      let fileTree: DriveFile[] = [];

      // 🟢 MULTI-ROOT SUPPORT (New Logic)
      if (folderIds && Array.isArray(folderIds) && folderIds.length > 0) {
         logger.info(`🚀 Iniciando escaneo MULTI-ROOT para ${folderIds.length} carpetas.`);

         for (const fid of folderIds) {
             let cleanId = fid;
             // Basic cleaning just in case
             if (cleanId.includes("drive.google.com")) {
                 const match = cleanId.match(/folders\/([a-zA-Z0-9-_]+)/);
                 if (match && match[1]) cleanId = match[1];
             }

             // Determine initial category for this root
             let category: 'canon' | 'reference' = 'canon';
             if (config.resourcePaths && config.resourcePaths.some(p => p.id === cleanId)) {
                 category = 'reference';
             }

             // Fetch contents for this root
             try {
                // Ping check optional here to save time, fetchFolderContents handles errors gracefully
                const tree = await fetchFolderContents(drive, cleanId, config, recursive, category);
                fileTree = [...fileTree, ...tree];
             } catch (err) {
                 logger.error(`⚠️ Error escaneando root ${cleanId}:`, err);
                 // Continue with others
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

         // 📡 PING PROBE
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

      // VALORES POR DEFECTO
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

      // Fusionar con defaults para evitar undefined en campos nuevos
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
      // 🟢 Force validation of structure before saving?
      // Not strictly necessary if frontend sends correct types, but good practice.
      // We just save it.

      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        ...config,
        updatedAt: new Date().toISOString()
      }, { merge: true }); // 👈 Merge to avoid overwriting lastIndexed if passed

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
      // 🟢 USAR TOKEN DEL USUARIO
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
      // 1. Check if ANY file exists (Boolean status)
      const snapshot = await db.collection("TDB_Index").doc(userId).collection("files").limit(1).get();
      const isIndexed = !snapshot.empty;

      // 2. Get Global Timestamp from Project Config (Source of Truth)
      let lastIndexedAt = null;

      // Try to get from config first
      const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
      if (configDoc.exists) {
        lastIndexedAt = configDoc.data()?.lastIndexed || null;
      }

      // Fallback: If config has no date but files exist, use the old method (unlikely but safe)
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
    timeoutSeconds: 3600, // 👈 Increased to 1 hour
    memory: "1GiB",       // 👈 Increased memory
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log('🚀 SYSTEM UPDATE: Force Read Fallback - Deploy Timestamp:', new Date().toISOString());
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { folderId, folderIds, accessToken, forceFullReindex } = request.data;

    // 🟢 Project ID Strategy
    // If folderId (legacy) is present, use it as default projectId.
    // If only folderIds, rely on explicit projectId passed by client.
    let cleanFolderId = folderId;
    if (cleanFolderId && cleanFolderId.includes("drive.google.com")) {
      const match = cleanFolderId.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) cleanFolderId = match[1];
    }

    // Default projectId to cleanFolderId if available, otherwise it MUST be passed or we might have issues identifying the project scope.
    // Ideally, for multi-root, the client passes projectId (from config.folderId).
    const projectId = request.data.projectId || cleanFolderId;

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    try {
      // A. Configurar Embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_DOCUMENT,
      });

      // B. Conectar Drive (🟢 USUARIO)
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });

      // 🟢 NUCLEAR OPTION: TABULA RASA
      if (forceFullReindex) {
        logger.warn(`☢️ NUCLEAR OPTION DETECTED: Wiping memory for user ${userId}`);
        const userIndexRef = db.collection("TDB_Index").doc(userId);
        // Delete the entire document and its subcollections (files)
        await db.recursiveDelete(userIndexRef);
        logger.info("   ☢️ Memory wiped clean. Starting fresh.");
      }

      // 🐤 CANARY TEST (DATABASE VERIFY)
      logger.info("🐤 [CANARY] Injecting SYSTEM_TEST chunk...");
      try {
        const canaryText = "CANARY TEST: Mohamed Davila es el Rey de los Zoorians.";
        const canaryVector = await embeddings.embedQuery(canaryText);

        await db.collection("TDB_Index").doc(userId)
          .collection("files").doc("SYSTEM_TEST")
          .collection("chunks").doc("chunk_0")
          .set({
            text: canaryText,
            order: 0,
            fileName: "SYSTEM_TEST",
            category: "canon",
            userId: userId,
            projectId: "SYSTEM_TEST_PROJECT",
            embedding: FieldValue.vector(canaryVector),
          });

        logger.info("🐤 [CANARY] SYSTEM_TEST chunk injected successfully.");
      } catch (canaryErr) {
        logger.error("🐤 [CANARY] Failed to inject chunk:", canaryErr);
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
         // Para indexar necesitamos bajar hasta el infierno (recursive=true)
         fileTree = await fetchFolderContents(drive, cleanFolderId, config, true);
      } else {
         throw new HttpsError("invalid-argument", "No se proporcionaron carpetas para indexar.");
      }

      // 🟢 C. SAVE FILE TREE STRUCTURE (SNAPSHOT)
      // Save the hierarchical tree to Firestore for the UI (Sidebar)
      // This allows the "Manual de Campo" to work without live Drive access.
      try {
        // Ensure the object is clean for Firestore
        const treePayload = JSON.parse(JSON.stringify(fileTree));
        await db.collection("TDB_Index").doc(userId).collection("structure").doc("tree").set({
          tree: treePayload,
          updatedAt: new Date().toISOString()
        });
        logger.info("🌳 Árbol de archivos guardado en TDB_Index/structure/tree");
      } catch (treeError) {
        logger.error("⚠️ Error guardando estructura del árbol:", treeError);
        // Non-critical, continue indexing
      }

      const fileList = flattenFileTree(fileTree);

      // D. Configurar Splitter
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      // 🟢 GHOST FILE PRUNING (Limpieza de Archivos Fantasma)
      logger.info("👻 Iniciando protocolo de detección de fantasmas...");
      const filesCollectionRef = db.collection("TDB_Index").doc(userId).collection("files");

      // 1. Get all DB File IDs
      const dbFilesSnapshot = await filesCollectionRef.select().get(); // Only get IDs
      const dbFileIds = new Set(dbFilesSnapshot.docs.map(doc => doc.id));

      // 2. Get all Drive File IDs
      const driveFileIds = new Set(fileList.map(f => f.id));

      // 3. Find Ghosts (In DB but not in Drive)
      const ghostFileIds = [...dbFileIds].filter(id => !driveFileIds.has(id));
      let ghostFilesPruned = 0;

      if (ghostFileIds.length > 0) {
        logger.info(`👻 Detectados ${ghostFileIds.length} archivos fantasma. Eliminando...`);

        // Execute recursive delete for each ghost
        // Note: sequential to avoid overwhelming resources, or small batches.
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
      let totalChunksDeleted = 0; // 👈 Track deletions

      // E. Procesar cada archivo
      await Promise.all(
        fileList.map(async (file) => {
          try {
            // 🛑 Safety Check
            if (!file.id) {
              logger.warn(`⚠️ Saltando archivo sin ID: ${file.name}`);
              return;
            }

            // 🟢 1. CLEANUP FIRST (Batched Delete Strategy)
            // Strict "Delete-Then-Write" protocol to prevent Ghost Data
            const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(file.id);
            const chunksRef = fileRef.collection("chunks");

            logger.info(`🧹 Iniciando purga de chunks para: ${file.name} (${file.id})`);

            let deletedCount = 0;
            const snapshot = await chunksRef.get(); // Read all first (usually < 2000 docs)

            if (!snapshot.empty) {
              let batch = db.batch();
              let operationCount = 0;

              for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                deletedCount++;

                // Commit batch every 400 operations to be safe
                if (operationCount >= 400) {
                  await batch.commit();
                  batch = db.batch();
                  operationCount = 0;
                }
              }

              // Commit remaining
              if (operationCount > 0) {
                await batch.commit();
              }
            }

            totalChunksDeleted += deletedCount;
            logger.info(`   ✅ Purga completada. Chunks eliminados: ${deletedCount}`);

            // 🟢 2. FETCH & SPLIT (Only after delete is confirmed)
            const content = await _getDriveFileContentInternal(drive, file.id);
            const rawLength = content ? content.length : 0;

            logger.info(`📝 [DEBUG] Raw Content Length for ${file.name}: ${rawLength}`);

            // 🛑 TRULY EMPTY FILE CHECK
            if (!content || content.trim().length === 0) {
              logger.warn(`⚠️ [SKIP] File is genuinely empty (0 bytes or whitespace): ${file.name}`);
              return; // Skip processing this file entirely
            }

            // Parse Frontmatter
            let textToSplit = content;
            let metadata: any = {};
            let timelineDate = null;

            // 🟢 SAFETY NET 1: GRAY-MATTER
            try {
              const parsed = matter(content);
              if (parsed.content && parsed.content.trim().length > 0) {
                textToSplit = parsed.content;
                metadata = parsed.data;
                timelineDate = metadata.date ? new Date(metadata.date).toISOString() : null;
              } else {
                // Empty content from matter, but raw exists -> Use Raw
                logger.warn(`⚠️ Gray-matter failed/empty for ${file.name}. Using RAW content.`);
                textToSplit = content;
              }
            } catch (matterError) {
              logger.warn(`⚠️ Gray-matter crashed for ${file.name}. Using RAW content. Error: ${matterError}`);
              textToSplit = content;
              // Metadata remains empty
            }

            const cleanLength = textToSplit ? textToSplit.length : 0;
            logger.info(`📝 [DEBUG] Clean Content Length (after matter): ${cleanLength}`);

            // 🟢 SAFETY NET 2: TEXT SPLITTER & SLEDGEHAMMER
            let chunks: string[] = [];
            try {
              chunks = await splitter.splitText(textToSplit);
            } catch (splitError) {
              logger.error(`💥 Splitter crashed for ${file.name}:`, splitError);
              chunks = []; // Force empty to trigger sledgehammer
            }

            // 🛡️ FALLBACK 2: SLEDGEHAMMER (The "Unbreakable" Logic)
            // IF chunks array is empty [] BUT rawLength > 0 (we downloaded bytes):
            // ACTION: Force create a single chunk manually.
            if (chunks.length === 0 && rawLength > 0) {
              logger.warn(`⚠️ Splitter returned 0 chunks (or failed). Used Sledgehammer fallback for ${file.name}.`);
              // Force create single chunk (Safety Cap: 8000 chars)
              chunks = [textToSplit.substring(0, 8000)];
            }

            logger.info(`🧩 [DEBUG] Chunks Generated: ${chunks.length}`);

            // Update File Metadata
            await fileRef.set({
              name: file.name,
              lastIndexed: new Date().toISOString(),
              chunkCount: chunks.length,
              category: file.category || 'canon',
              timelineDate: timelineDate,
            });

            // 🟢 3. VECTORIZE & SAVE (Write new data)
            // Use sequential writes or small batches if needed, but Promise.all is fine for insertion
            // as long as previous delete is confirmed.
            const chunkPromises = chunks.map(async (chunkText, i) => {
              const vector = await embeddings.embedQuery(chunkText);

              return chunksRef.doc(`chunk_${i}`).set({
                text: chunkText,
                order: i,
                fileName: file.name,
                category: file.category || 'canon',
                userId: userId,
                projectId: projectId, // 👈 Strict Isolation Tag
                embedding: FieldValue.vector(vector),
              });
            });

            await Promise.all(chunkPromises);

            totalChunks += chunks.length;
            logger.info(`   ✨ Re-indexado: ${file.name} (${chunks.length} nuevos chunks)`);

          } catch (err: any) {
            logger.error(`Error indexando ${file.name}:`, err);
          }
        })
      );

      // 🟢 4. UPDATE PROJECT CONFIG (Global Timestamp)
      const now = new Date().toISOString();
      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        lastIndexed: now,
        updatedAt: now
      }, { merge: true });

      logger.info(`✅ Indexación completada. Timestamp global actualizado: ${now}`);

      return {
        success: true,
        filesIndexed: fileList.length,
        totalChunks: totalChunks, // Chunks Created
        chunksCreated: totalChunks, // Explicit alias
        chunksDeleted: totalChunksDeleted, // 👈 New stat
        ghostFilesPruned: ghostFilesPruned, // 👈 New stat
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
    timeoutSeconds: 540, // 👈 Increased to 9 minutes
    secrets: [googleApiKey],
    memory: "2GiB",      // 👈 Increased memory for heavy lifting
  },
  async (request) => {
    console.log('🚀 SYSTEM UPDATE: Index Sync Fix - Deploy Timestamp:', new Date().toISOString());
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction, history, categoryFilter, activeFileContent, activeFileName, isFallbackContext } = request.data; // 👈 Removed projectId

    if (!query) throw new HttpsError("invalid-argument", "Falta la pregunta.");

    // 🧠 RETRIEVE USER PROFILE (Neural Synchronization)
    const userId = request.auth.uid;
    const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
    const profile: WriterProfile = profileDoc.exists
      ? profileDoc.data() as WriterProfile
      : { style: '', inspirations: '', rules: '' };

    // 🏗️ RECUPERAR CONFIGURACIÓN DEL PROYECTO
    await _getProjectConfigInternal(userId); // (Wait for config logic just in case needed later, but removed activeBook)

    // Build profile context
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
      // Verify database access before doing anything complex.
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
        logger.warn(`[DEEP TRACE] Connectivity Check SKIPPED/FAILED: ${traceError.message} (This is non-critical, proceeding to Vector Search)`);
      }

      // 1. Preparar Búsqueda Contextual
      // Si hay historial, lo usamos para mejorar la búsqueda (ej: "¿Quién es él?" -> "¿Quién es Manuel?")
      let searchQuery = query;
      let historyText = "No hay historial previo.";

      if (history && Array.isArray(history) && history.length > 0) {
        // a) Para el Prompt de la IA (Texto completo)
        // DEFAULT: Use ALL history if small, but we will slice if too big below.
        historyText = history.map((h: any) =>
          `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");

        // b) Para el Vectorizador (Solo preguntas recientes del usuario)
        const userHistory = history
          .filter((h: any) => h.role === 'user' || h.role === 'USER')
          .slice(-3)
          .map((h: any) => h.message)
          .join(" ");

        searchQuery = `Contexto: ${userHistory} \n Pregunta: ${query}`;
        logger.info("🔍 Búsqueda Vectorial Enriquecida:", searchQuery);
      }

      // 🛑 OPTIMIZACIÓN DE TOKENS: LIMITAR HISTORIAL (Slice last 20)
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

      // Construir Query Base (Filter by User & Category)
      let chunkQuery = coll.where("userId", "==", userId);

      // 🟢 GOD MODE ACTIVATED: NO FILTERS (Project/Category Removed)
      // We want Global Knowledge. All vectors for this user are fair game.

      // 4. Ejecutar Búsqueda Vectorial
      // 🟢 STRATEGY: Fetch WIDE (50/100) and filter for Diversity
      const fetchLimit = isFallbackContext ? 100 : 50;

      console.log('🔍 Vector Search Request for User:', userId);

      const vectorQuery = chunkQuery.findNearest({
        queryVector: queryVector,
        limit: fetchLimit, // 🟢 Wide Net for Diversity
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      const vectorSnapshot = await vectorQuery.get();

      // Log the actual query result count
      console.log('🔢 Vectors Found (Raw):', vectorSnapshot.docs.length);
      if (vectorSnapshot.docs.length > 0) {
          // Note: Firestore Vector Search doesn't easily expose 'score' in the snapshot data directly
          // without using specific client SDK features, but the order IS by relevance.
          // We will log the first match's filename to confirm relevance.
          const firstMatch = vectorSnapshot.docs[0].data();
          console.log('📜 First Match:', firstMatch.fileName);
      } else {
          console.log('⚠️ NO VECTORS FOUND. Check Index or UserID match.');
      }

      let candidates: Chunk[] = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        embedding: [],
        fileName: doc.data().fileName || "Desconocido",
        fileId: doc.ref.parent.parent?.id || "unknown_id", // 🟢 ID Retrieval
        category: doc.data().category || 'canon',
      }));

      // 🟢 SOURCE DIVERSITY LIMITING (Per-File Cap + Backfill)
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

          const fid = chunk.fileId || chunk.fileName; // Fallback if ID fails
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

      // 🟢 DEBUG LOG: Verify Retrieval Sources
      logger.info('📚 RAG Context Sources:', relevantChunks.map(c => c.fileName));

      // 5. Construir Contexto RAG
      const contextText = relevantChunks.map(c => c.text).join("\n\n---\n\n");

      // 6. Llamar a Gemini (Nivel GOD TIER - Razonamiento Puro)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview", // <--- MÁXIMA POTENCIA (1M Contexto + Deep Reasoning)
        temperature: 0.7,
      });

      // 🟢 INYECCIÓN DE PROTOCOLO DE CONTINUIDAD
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

      // 🟢 INYECCIÓN DE INSTRUCCIÓN DE REFERENCIA (COMBINADA)
      let finalSystemInstruction = systemInstruction || "";

      // Prependamos el protocolo
      finalSystemInstruction = CONTINUITY_PROTOCOL + "\n\n" + finalSystemInstruction;

      if (categoryFilter === 'reference') {
        finalSystemInstruction += "\n\nIMPORTANTE: Responde basándote EXCLUSIVAMENTE en el material de referencia proporcionado. Actúa como un tutor o experto en la materia.";
      }

      // 🟢 INYECCIÓN DE CONTEXTO ACTIVO (PRIORIDAD ALTA)
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

      // 🟢 INYECCIÓN DE MEMORIA A LARGO PLAZO
      const longTermMemorySection = `
[MEMORIA A LARGO PLAZO - DATOS RELEVANTES DEL PROYECTO]:
(Fichas de personajes, reglas del mundo, eventos pasados encontrados en la base de datos)
${contextText || "No se encontraron datos relevantes en la memoria."}
      `;

      // 🟢 INSTRUCCIÓN DE CO-AUTOR
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

      // 7. Responder con Fuentes
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
      // 🟢 USAR TOKEN DEL USUARIO
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

    const { name, type } = request.data; // 👈 ADDED type
    if (!name) {
      throw new HttpsError("invalid-argument", "Falta el nombre de la sesión.");
    }

    const userId = request.auth.uid;
    const sessionId = db.collection("users").doc(userId).collection("forge_sessions").doc().id;
    const now = new Date().toISOString();

    const sessionType = type || 'forge'; // Default to forge for backward compatibility

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
    const { type } = request.data; // 👈 Filter by type

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
      // Nota: Usamos recursiveDelete para eliminar el documento padre y todas sus subcolecciones (mensajes).
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
      // 1. Guardar mensaje
      const msgRef = db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages").doc();

      await msgRef.set({
        role,
        text,
        timestamp: now
      });

      // 2. Actualizar 'updatedAt' de la sesión (para que suba en la lista)
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
    timeoutSeconds: 120, // Gemini + Drive puede tardar
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { sessionId, accessToken } = request.data;
    let { folderId } = request.data; // Usamos let para poder modificarlo

    // 🧼 LIMPIEZA DE ID (Sanitización Táctica)
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
      // 1. RECUPERAR HISTORIAL
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

      // 2. SINTETIZAR CON GEMINI (El Escriba - GOD TIER para el contenido)
      const synthesisModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview",
        temperature: 0.4, // Más preciso para documentos
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

      // 3. GENERAR NOMBRE DE ARCHIVO (Speedster para tareas simples)
      // Intentamos que la IA nos dé un nombre genial.
      let fileName = "";
      try {
        // Instancia separada para velocidad
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
        // Limpieza extra
        rawName = rawName.replace(/[^a-zA-Z0-9_\-]/g, "");
        if (rawName.length > 0) {
           fileName = `${rawName}.md`;
        }
      } catch (e) {
        logger.warn("Error generando nombre con IA, usando fallback.", e);
      }

      // FALLBACK: Si falla la IA, usamos el método antiguo
      if (!fileName) {
        const sessionDoc = await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).get();
        const sessionName = sessionDoc.exists ? sessionDoc.data()?.name : "Sesion_Forja";
        const safeName = sessionName.replace(/[^a-zA-Z0-9]/g, "_");
        fileName = `${safeName}_${new Date().getTime()}.md`;
      }

      // 4. GUARDAR EN DRIVE (La Materialización)
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });



      // Si queremos guardar como MD puro:
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
    timeoutSeconds: 540, // <--- 🟢 AUMENTADO A 9 MINUTOS
    memory: "2GiB",      // 👈 Increased memory
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para convocar al Tribunal.");
    }

    const { text, fileId, context, accessToken } = request.data; // <--- 🟢 NUEVOS ARGUMENTOS

    // 1. OBTENER EL TEXTO A JUZGAR (TEXTO DIRECTO O ARCHIVO)
    let textToAnalyze = text;

    if (!textToAnalyze) {
      if (fileId && accessToken) {
        try {
          logger.info(`⚖️ Tribunal leyendo archivo: ${fileId}`);
          // 🟢 USAR TOKEN DEL USUARIO PARA LEER DRIVE
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
      // 2. RECUPERAR PERFIL DE ESCRITOR
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

      // 3. CONFIGURAR GEMINI (MODO JUEZ - GOD TIER)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-3-pro-preview",
        temperature: 0.4, // Más analítico para el juicio crítico
        generationConfig: {
          responseMimeType: "application/json",
        }
      } as any);

      // 4. CONSTRUIR EL PROMPT DEL SISTEMA (LAS 3 MÁSCARAS)
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

      // 5. INVOCAR AL TRIBUNAL
      const response = await chatModel.invoke([
        ["system", systemPrompt],
        ["human", textToAnalyze]
      ]);

      const content = response.content.toString();

      // Parsear JSON (Gemini devuelve JSON string en markdown block a veces, pero con response_mime_type debería ser limpio)
      // Aun así, limpiamos por si acaso.
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
    timeoutSeconds: 120, // 2 minutos debería sobrar para Flash
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
      // A. Configurar Gemini (Speedster)
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash", // 👈 Velocidad y eficiencia para extracción
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      // B. Prompt del Cronista
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
        "${content}" // Limit Removed per architecture change
      `;

      // C. Generar
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const events = JSON.parse(responseText);

      // D. Persistencia (Human-in-the-loop: status 'suggested')
      const batch = db.batch();
      const timelineRef = db.collection("TDB_Timeline").doc(userId).collection("events");

      let count = 0;
      for (const event of events) {
        const docRef = timelineRef.doc(); // Auto-ID
        batch.set(docRef, {
          ...event,
          sourceFileId: fileId,
          status: 'suggested', // 👈 Veto Humano
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
    timeoutSeconds: 540, // 9 minutos para libros grandes
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

      // 1. Fetch content for all files
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      const contents: string[] = [];
      for (const fileId of fileIds) {
        const raw = await _getDriveFileContentInternal(drive, fileId);

        // Clean content (remove YAML frontmatter)
        const parsed = matter(raw);
        const cleanContent = parsed.content.trim();

        contents.push(cleanContent);
      }

      // 2. Generate PDF with pdfmake
      const PdfPrinter = require("pdfmake");

      // Define fonts (using built-in fonts)
      const fonts = {
        Roboto: {
          normal: "Helvetica",
          bold: "Helvetica-Bold",
          italics: "Helvetica-Oblique",
          bolditalics: "Helvetica-BoldOblique"
        }
      };

      const printer = new PdfPrinter(fonts);

      // Build document definition
      const docDefinition: any = {
        content: [
          // Cover Page
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

          // Content pages
          ...contents.map((content, index) => {
            return [
              {
                text: content,
                style: "body",
                margin: [0, 0, 0, 20]
              },
              // Page break after each file except the last
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
        pageMargins: [72, 72, 72, 72] // 1 inch margins
      };

      // Generate PDF
      const pdfDoc = printer.createPdfKitDocument(docDefinition);

      // Collect PDF chunks
      const chunks: Buffer[] = [];
      pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

      await new Promise<void>((resolve, reject) => {
        pdfDoc.on("end", () => resolve());
        pdfDoc.on("error", reject);
        pdfDoc.end();
      });

      // Convert to base64
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
          canonCount++; // Asumimos canon por defecto
        }

        fileDetails.push({
          id: doc.id,
          name: data.name,
          category: data.category || 'canon', // Explicit fallback
          chunkCount: data.chunkCount || 0,
          lastIndexed: data.lastIndexed
        });
      });

      // Sort by category then name for readability
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
