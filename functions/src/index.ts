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
  primaryCanonPathId?: string | null;
  resourcePaths: ProjectPath[];
  chronologyPath: ProjectPath | null;
  activeBookContext: string;
  folderId?: string;
  lastIndexed?: string;
  characterVaultId?: string | null;
}

interface SessionInteraction {
  prompt: string;
  response: any;
  clarifications?: string;
}

interface CharacterSnippet {
  sourceBookId: string;
  sourceBookTitle: string;
  text: string;
}

interface Character {
  id: string; // Slug
  name: string;
  tier: 'MAIN' | 'SUPPORTING' | 'BACKGROUND';
  sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
  sourceContext: string; // 'GLOBAL' or FolderID
  masterFileId?: string;
  appearances: string[]; // Book IDs
  snippets: CharacterSnippet[];
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
    primaryCanonPathId: null,
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
    // 🟢 BLINDAJE DEL LECTOR: NO CRASHEAR. DEVOLVER AVISO.
    return `[ERROR: No se pudo cargar el archivo. Verifica permisos o existencia. Detalle: ${error.message}]`;
  }
}

/**
 * 🔒 SYSTEM LOGS HELPER: ENSURE FOLDER EXISTS
 */
async function ensureSystemLogsFolder(drive: any, rootFolderId: string): Promise<string> {
  const query = `'${rootFolderId}' in parents and name = '_SYSTEM_LOGS' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  try {
    const res = await drive.files.list({
      q: query,
      fields: "files(id)",
      pageSize: 1
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    // Create if not exists
    const createRes = await drive.files.create({
      requestBody: {
        name: '_SYSTEM_LOGS',
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId]
      },
      fields: 'id'
    });
    return createRes.data.id;
  } catch (e) {
    logger.error("Error ensuring _SYSTEM_LOGS folder:", e);
    throw e;
  }
}

/**
 * 📝 SYSTEM LOGS HELPER: APPEND INTERACTION
 */
async function appendToSessionLog(
  drive: any,
  sessionId: string,
  rootFolderId: string,
  interaction: SessionInteraction
): Promise<void> {
  try {
    const logsFolderId = await ensureSystemLogsFolder(drive, rootFolderId);

    // 1. Search for existing session file by appProperties.sessionId
    const query = `'${logsFolderId}' in parents and appProperties has { key='sessionId' and value='${sessionId}' } and trashed = false`;
    const res = await drive.files.list({
      q: query,
      fields: "files(id, name)",
      pageSize: 1
    });

    let fileId: string | null = null;
    let currentContent = "";

    // 2. Prepare Markdown Block
    const timestamp = new Date().toISOString();
    const promptSnippet = interaction.prompt.length > 50 ? interaction.prompt.substring(0, 50) + "..." : interaction.prompt;

    let responseSummary = "";
    if (interaction.response.type === 'inquiry') {
       responseSummary = `**CLARIFICATION REQUIRED**\nQuestions: ${(interaction.response.questions || []).join(', ')}`;
    } else {
       responseSummary = `**NODE GENERATED**: ${interaction.response.title}\n${interaction.response.content ? interaction.response.content.substring(0, 200) + '...' : ''}`;
    }

    const newBlock = `
### 🔄 Interaction [${timestamp}]
**Commander:** ${interaction.prompt}
${interaction.clarifications ? `**Clarifications:** ${interaction.clarifications}\n` : ''}
**Architect's Logic:**
${responseSummary}

---
`;

    if (res.data.files && res.data.files.length > 0 && res.data.files[0].id) {
      // File Exists
      fileId = res.data.files[0].id;
      logger.info(`📝 Appending to existing session log: ${res.data.files[0].name} (${fileId})`);

      // Read existing content to append (Drive API doesn't support 'append' operation directly on files, we must update)
      // Note: For very large logs, this is inefficient. But for text logs < 10MB it's fine.
      try {
        if (fileId) {
            currentContent = await _getDriveFileContentInternal(drive, fileId);
        }
      } catch (readErr) {
        logger.warn("Could not read existing log, starting fresh for append.");
      }

    } else {
      // Create New File
      const safeDate = new Date().toISOString().split('T')[0];
      const safePrompt = promptSnippet.replace(/[^a-zA-Z0-9]/g, '-');
      const fileName = `Session_${safeDate}_${safePrompt}.md`;

      logger.info(`📝 Creating new session log: ${fileName}`);

      // Initial Content
      currentContent = `# 📜 THE CHRONICLER LOG\nSession ID: ${sessionId}\nDate: ${timestamp}\n\n`;

      const createRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [logsFolderId],
          mimeType: 'text/markdown',
          appProperties: {
            sessionId: sessionId
          }
        },
        fields: 'id'
      });
      fileId = createRes.data.id;
    }

    // 3. Write Updated Content
    const updatedContent = currentContent + newBlock;
    await drive.files.update({
      fileId: fileId!,
      media: {
        mimeType: 'text/markdown',
        body: updatedContent
      }
    });
    logger.info("✅ Session Log Updated.");

  } catch (e) {
    logger.error("💥 Failed to append to session log:", e);
    // Non-blocking error - we don't want to crash the AI response if logging fails
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
          if (recursive && file.id) {
            children = await fetchFolderContents(drive, file.id as string, config, true, fileCategory);
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
    timeoutSeconds: 540, // Increased for Deep Extraction
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
 * CRYSTALLIZE NODE (La Materialización)
 * Convierte un nodo efímero en un archivo persistente en Drive.
 */
export const crystallizeNode = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { accessToken, folderId, fileName, content, frontmatter } = request.data;
    const userId = request.auth.uid;

    if (!folderId || !fileName || !content || !accessToken) {
      throw new HttpsError("invalid-argument", "Faltan datos obligatorios.");
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
        parents: [folderId],
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
      logger.error("Error en crystallizeNode:", error);
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
        primaryCanonPathId: null,
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

      let activeCharacterPrompt = "";
      if (activeFileName && activeFileContent) {
          activeCharacterPrompt = `
[CONTEXTO VISUAL ACTIVO]:
Nombre: ${activeFileName}
(Este es el personaje o archivo que el usuario tiene abierto en pantalla. Prioriza su información sobre cualquier búsqueda externa si hay conflicto).
`;
      }

      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE CONTINUIDAD (DARK BROTHERHOOD) ===
OBJETIVO: Actuar como Arquitecto Narrativo y Gestor de Continuidad.

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
    console.log("🚀 WORLD ENGINE v2.0 (Sanitizer Active) - Loaded");
    console.log('🚀 WORLD ENGINE: Phase 4.1 - TITAN LINK - ' + new Date().toISOString());

    // 1. DATA RECEPTION
    const { prompt, agentId, chaosLevel, context, interrogationDepth, clarifications, sessionId, sessionHistory, accessToken, folderId } = request.data;
    const { canon_dump, timeline_dump } = context || {};

    const currentDepth = interrogationDepth || 0;

    // 2. DEBUG LOGGING
    logger.info("🔌 [TITAN LINK] Payload Received:", {
      agentId,
      chaosLevel,
      canonLength: canon_dump ? canon_dump.length : 0,
      timelineLength: timeline_dump ? timeline_dump.length : 0,
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
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        generationConfig: {
          temperature: 1.0,
          // @ts-ignore - SDK types might lag behind experimental features
          thinking_config: { include_thoughts: true, thinking_level: "high" }
        } as any
      });

      // 🟢 PHASE 4.3: SESSION AWARENESS
      let sessionContext = "";
      if (sessionHistory && Array.isArray(sessionHistory) && sessionHistory.length > 0) {
         sessionContext = `
=== CURRENT SESSION HISTORY (THE CHRONICLER) ===
(This is what has happened so far in this session. Maintain consistency with these decisions.)
${sessionHistory.map((item: any, i: number) => `
[TURN ${i+1}]
User: ${item.prompt}
AI Result: ${item.result?.title || 'Unknown'} - ${item.result?.content || ''}
`).join('\n')}
================================================
`;
      }

      const systemPrompt = `
        You are using the Gemini 3 Reasoning Engine.
        Your Persona: ${agentId} (Chaos Level: ${chaosLevel}).

        === WORLD CONTEXT (THE LAW) ===
        ${canon_dump || "No canon rules provided."}

        === TIMELINE (THE LORE) ===
        ${timeline_dump || "No timeline events provided."}

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
           - **IF A CONTRADICTION IS FOUND:**
             - DO NOT STOP GENERATION.
             - **CONTENT OVERRIDE:** The 'content' of the node MUST start with a clinical, holographic warning: '[SIMULATED DIVERGENCE: This entry contradicts Prime Canon Timeline]'.
             - The rest of the content must be written as a "Theoretical Simulation" or "What-If Scenario" based on false premises, adopting a cold, detached tone.
             - **MUST** append a 'coherency_report' object to the JSON.
             - The 'warning' must be a high-severity alert (e.g., "FATAL CANON ERROR" or "TEMPORAL PARADOX").
             - The 'file_source' must be the exact filename of the contradicted [CORE WORLD RULES / PRIORITY LORE] file.
             - The 'explanation' must be a technical explanation of why the event is impossible (e.g., "Target entity ceased operations in Year 485. Inauguration in 486 is invalid.").

        5. THINK: Spend significant time tracing the causal chains (Butterfly Effect).
        6. Constraint: Do not rush. If the user asks about 'War', analyze the economic impact of 'Psycho-Energy' on weapon manufacturing first.
        7. THE CHRONICLER RULE: Always refer to the CURRENT SESSION HISTORY (if available) to maintain consistency. If the user previously decided X in this session, do not contradict it.

        USER PROMPT: "${prompt}"

        OUTPUT FORMATS (JSON ONLY):

        TYPE A (STANDARD NODE - WHEN RESOLVED):
        {
          "type": "concept" | "plot" | "character",
          "title": "Short Title",
          "content": "Deeply reasoned analysis...",
          "thoughts": "Optional summary of your reasoning process",
          "metadata": {
            "node_type": "concept" | "conflict" | "lore",
            "suggested_filename": "snake_case_name.md",
            "suggested_folder_category": "Factions" | "Characters" | "Locations" | "Magic",
            "related_node_ids": ["id1", "id2"]
          },
          "coherency_report": {
             "warning": "VIOLACIÓN DE CANON",
             "file_source": "filename.md",
             "explanation": "Explanation of the contradiction."
          }
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

      // 🟢 STRICT SANITIZER V2.0
      console.log("🔍 RAW AI OUTPUT:", responseText.slice(0, 50) + "...");

      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');

      if (firstBrace === -1 || lastBrace === -1) {
        throw new HttpsError('internal', 'AI Output Malformed: No JSON braces found.');
      }

      const cleanJson = responseText.substring(firstBrace, lastBrace + 1);
      console.log("Pk SANITIZED OUTPUT:", cleanJson.slice(0, 50) + "...");

      const parsedResult = JSON.parse(cleanJson);

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

    const { sessionId, role, text, characterId } = request.data;
    if (!sessionId || !role || !text) {
      throw new HttpsError("invalid-argument", "Faltan datos del mensaje.");
    }

    const userId = request.auth.uid;
    const now = new Date().toISOString();

    try {
      // 1. SAVE MESSAGE (Always succeeds as new doc)
      const msgRef = db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages").doc();

      await msgRef.set({
        role,
        text,
        timestamp: now
      });

      // 2. UPSERT SESSION (The "Upsert Protocol")
      const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
      const sessionDoc = await sessionRef.get();

      if (!sessionDoc.exists) {
         // A) NEW SESSION (Auto-Creation)
         let targetCharId = characterId;

         // Fallback Logic: Try to extract ID from Session Slug (e.g. char_ficha_megu -> megu)
         if (!targetCharId && sessionId.startsWith('char_ficha_')) {
             targetCharId = sessionId.replace('char_ficha_', '');
         }

         await sessionRef.set({
             userId,
             characterId: targetCharId || 'unknown',
             name: targetCharId || sessionId, // Fallback name
             type: 'forge',
             createdAt: FieldValue.serverTimestamp(), // 🟢 MANDATORY
             updatedAt: FieldValue.serverTimestamp(),
             lastUpdated: FieldValue.serverTimestamp() // 🟢 MANDATORY
         });

         logger.info(`🔨 [AUTO-CREATE] Session created via addForgeMessage: ${sessionId}`);

      } else {
         // B) EXISTING SESSION (Update Timestamps)
         await sessionRef.set({
             updatedAt: FieldValue.serverTimestamp(),
             lastUpdated: FieldValue.serverTimestamp()
         }, { merge: true });
      }

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

// --- CHARACTER MANIFEST LOGIC (THE SOUL COLLECTOR) ---

/**
 * PHASE 6.0: MANIFEST GENERATOR
 * Escanea Drive y genera un manifiesto de personajes en Firestore.
 */
export const syncCharacterManifest = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 540,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { masterVaultId, bookFolderId, accessToken } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    // 🟢 1. INTELLIGENT FALLBACK (Config Retrieval)
    const config = await _getProjectConfigInternal(userId);

    let targetVaultId = masterVaultId;
    if (!targetVaultId) {
        logger.info("🕵️ Param 'masterVaultId' missing. Checking Project Config...");
        if (config.characterVaultId) {
            targetVaultId = config.characterVaultId;
            logger.info(`   -> Found in Config (Character Vault): ${targetVaultId}`);
        } else if (config.canonPaths && config.canonPaths.length > 0) {
            targetVaultId = config.canonPaths[0].id;
            logger.info(`   -> Found in Config (Primary Canon Path): ${targetVaultId}`);
        } else {
             throw new HttpsError("invalid-argument", "No masterVaultId provided and no configuration found.");
        }
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    logger.info(`👻 SOUL COLLECTOR (DEEP EXTRACTION): Iniciando escaneo para ${userId} en ${targetVaultId}`);

    try {
        const manifest = new Map<string, Partial<Character>>();
        const masterFilenames = new Map<string, string>(); // Name (clean) -> FileId
        const fileIdToSlug = new Map<string, string>(); // FileId -> Slug

        // --- HELPER: Slugify ---
        const slugify = (text: string): string => {
            return text
                .toLowerCase()
                .trim()
                .replace(/[\s\W-]+/g, '_')
                .replace(/^_|_$/g, '');
        };

        // --- STEP A: MASTER SCAN (Recursive & Deep) ---
        // 1. Fetch File Tree (Using existing recursive helper)
        const tree = await fetchFolderContents(drive, targetVaultId, config, true);
        const flatFiles = flattenFileTree(tree);

        // 2. Filter Candidates (Docs, MD, TXT)
        const candidates = flatFiles.filter(f =>
            f.mimeType === 'application/vnd.google-apps.document' ||
            f.name.endsWith('.md') ||
            f.name.endsWith('.txt')
        );

        logger.info(`   -> Candidates for Extraction: ${candidates.length}`);

        // 3. Batch Process (Deep Soul Extraction)
        // Process files in small concurrent batches to avoid timeouts/limits
        const BATCH_SIZE = 5;
        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE);
            logger.info(`   -> Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(candidates.length / BATCH_SIZE)}`);

            await Promise.all(batch.map(async (file) => {
                try {
                    const cleanName = file.name.replace(/\.md$/, '').replace(/\.txt$/, '');
                    const slug = slugify(cleanName);

                    // TRACK FILENAME FOR ROBUST MATCHING
                    masterFilenames.set(cleanName.toLowerCase(), file.id);
                    fileIdToSlug.set(file.id, slug);

                    // Fetch Content (The Soul)
                    // Note: _getDriveFileContentInternal handles Google Doc conversion to text/plain automatically
                    let snippetText = "";
                    try {
                        const content = await _getDriveFileContentInternal(drive, file.id);
                        snippetText = content.substring(0, 2000); // Limit snippet size to save DB space
                    } catch (e) {
                        logger.warn(`Failed to read content for ${file.name}, skipping body.`);
                    }

                    // Upsert to Manifest
                    if (!manifest.has(slug)) {
                        manifest.set(slug, {
                            id: slug,
                            name: cleanName,
                            tier: 'MAIN',
                            sourceType: 'MASTER',
                            sourceContext: 'GLOBAL',
                            masterFileId: file.id,
                            appearances: [],
                            snippets: []
                        });
                    }

                    const char = manifest.get(slug)!;

                    // Add snippet if content exists
                    if (snippetText) {
                         // Check if we already have a master vault snippet to avoid duplication on re-runs
                         // (Though logic creates fresh manifest each time, so simple push is fine)
                         char.snippets?.push({
                            sourceBookId: 'MASTER_VAULT',
                            sourceBookTitle: 'Master Vault File',
                            text: snippetText
                         });
                    }

                } catch (err) {
                    logger.warn(`   ⚠️ Failed to extract soul from ${file.name}:`, err);
                }
            }));
        }

        logger.info(`   -> ${manifest.size} Maestros procesados.`);

        // --- STEP B: LOCAL SCAN (Low Tier) ---
        if (bookFolderId) {
            logger.info(`   -> Escaneando Libro Local: ${bookFolderId}`);

            // 1. Find Personajes.md
            const localQuery = `'${bookFolderId}' in parents and name = 'Personajes.md' and trashed = false`;
            const localFiles = await drive.files.list({
                q: localQuery,
                fields: 'files(id, name)',
                pageSize: 1
            });

            if (localFiles.data.files && localFiles.data.files.length > 0) {
                const pFile = localFiles.data.files[0];
                logger.info(`   -> Leído Personajes.md (${pFile.id})`);

                // 2. Read Content
                const content = await _getDriveFileContentInternal(drive, pFile.id!);

                // 3. Parse Logic (Regex)
                const lines = content.split('\n');

                // Patterns
                const wikiLinkRegex = /\[\[(.*?)\]\]/;
                const listRegex = /^[-*]\s+(.*)/;
                const colonRegex = /^([^:]+):\s*(.*)/;

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;
                    if (trimmed.startsWith('#')) continue; // Skip headers

                    let name = "";
                    let description = "";
                    let isWiki = false;
                    let explicitType: 'MAIN' | 'SUPPORTING' | 'BACKGROUND' | undefined = undefined;

                    // WikiLink
                    const wikiMatch = trimmed.match(wikiLinkRegex);
                    if (wikiMatch) {
                        const raw = wikiMatch[1];
                        name = raw.includes('|') ? raw.split('|')[0].trim() : raw.trim();
                        isWiki = true;

                        const afterLink = trimmed.replace(wikiMatch[0], '').trim();
                        if (afterLink.startsWith('-') || afterLink.startsWith(':')) {
                            description = afterLink.replace(/^[-:]\s*/, '');
                        }
                    } else {
                        // Colon "Name: Desc"
                        const colonMatch = trimmed.match(colonRegex);
                        if (colonMatch) {
                            name = colonMatch[1].trim().replace(/^[-*]\s+/, '');
                            description = colonMatch[2].trim();
                            explicitType = 'BACKGROUND'; // Plain text def implies Tier 3
                        } else {
                            // List Item "- Name"
                            const listMatch = trimmed.match(listRegex);
                            if (listMatch) {
                                name = listMatch[1].trim();
                            }
                        }
                    }

                    if (name && name.length < 50) {
                        const slug = slugify(name);

                        // 🟢 HYBRID MATCHING LOGIC
                        let existing = manifest.get(slug);

                        // If not found by slug, try FILENAME MATCH from Master Vault (Obsidian Logic)
                        // This handles cases where file is "Gandalf.md" but link is [[Gandalf]],
                        // matching ignoring case even if slugify matches generally.
                        if (!existing && masterFilenames.has(name.toLowerCase())) {
                            const masterId = masterFilenames.get(name.toLowerCase());
                            if (masterId) {
                                const masterSlug = fileIdToSlug.get(masterId);
                                if (masterSlug) {
                                    existing = manifest.get(masterSlug);
                                }
                            }
                        }

                        if (existing) {
                            // It's a MASTER or already found LOCAL
                            // Add appearance
                            if (!existing.appearances!.includes(bookFolderId)) {
                                existing.appearances!.push(bookFolderId);
                            }
                            // Add snippet if new
                            if (description) {
                                existing.snippets!.push({
                                    sourceBookId: bookFolderId,
                                    sourceBookTitle: "Libro Local",
                                    text: description
                                });
                            }
                            manifest.set(slug, existing);
                        } else {
                            // NEW LOCAL CHARACTER
                            // If explicitType is set (Colon match), use it. Else infer.
                            // WikiLink usually implies importance (MAIN/SUPPORTING), but if local only, maybe SUPPORTING.
                            // Plain Text list item -> BACKGROUND.

                            let tier: 'MAIN' | 'SUPPORTING' | 'BACKGROUND' = 'SUPPORTING';
                            if (explicitType) tier = explicitType;
                            else if (!isWiki) tier = 'BACKGROUND'; // Just a list item "- Juan"

                            const newChar: Partial<Character> = {
                                id: slug,
                                name: name,
                                tier: tier,
                                sourceType: 'LOCAL',
                                sourceContext: bookFolderId,
                                appearances: [bookFolderId],
                                snippets: description ? [{
                                    sourceBookId: bookFolderId,
                                    sourceBookTitle: "Libro Local",
                                    text: description
                                }] : []
                            };
                            manifest.set(slug, newChar);
                        }
                    }
                }
            } else {
                logger.warn("   -> Personajes.md no encontrado en el libro.");
            }
        }

        // --- STEP C: BATCH WRITE TO FIRESTORE ---
        logger.info(`   -> Persistiendo ${manifest.size} personajes...`);
        const batch = db.batch();
        const charsRef = db.collection("users").doc(userId).collection("characters");

        let batchCount = 0;
        const now = new Date().toISOString();

        for (const [slug, char] of manifest) {
            const docRef = charsRef.doc(slug);
            batch.set(docRef, { ...char, lastUpdated: now }, { merge: true });
            batchCount++;

            if (batchCount >= 400) {
                await batch.commit();
                batchCount = 0;
            }
        }

        if (batchCount > 0) {
            await batch.commit();
        }

        logger.info("✅ Soul Collector ha terminado.");
        return { success: true, count: manifest.size };

    } catch (error: any) {
        logger.error("Error en syncCharacterManifest:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * PHASE 6.2: MATERIALIZATION (AI TOOLS)
 * Crea un archivo físico a petición de la IA.
 */
export const forgeToolExecution = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    secrets: [googleApiKey],
  },
  async (request) => {
    initializeFirebase();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { title, content, folderId, accessToken } = request.data;

    if (!title || !content || !folderId) {
      throw new HttpsError("invalid-argument", "Faltan argumentos (title, content, folderId).");
    }
    if (!accessToken) {
      throw new HttpsError("unauthenticated", "Falta accessToken.");
    }

    logger.info(`🔨 TOOL EXECUTION: Creating file '${title}' in ${folderId}`);

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // Sanitize Title
      const safeTitle = title.replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').trim() || "Untitled_Lore";
      const fileName = `${safeTitle}.md`;

      const media = {
        mimeType: 'text/markdown',
        body: content
      };

      const file = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: media,
        fields: 'id, name, webViewLink',
      });

      logger.info(`   ✅ Materialización exitosa: ${file.data.id}`);

      return {
        success: true,
        fileId: file.data.id,
        webViewLink: file.data.webViewLink,
        message: `Archivo '${fileName}' forjado con éxito.`
      };

    } catch (error: any) {
      logger.error("Error en forgeToolExecution:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 19. FORGE ANALYZER (El Inspector)
 * Analiza un texto narrativo para extraer elenco, detectar entidades y generar un informe de estado.
 */
export const forgeAnalyzer = onCall(
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

    const { fileId, accessToken, existingCharacterNames } = request.data;

    if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // 1. LEER ARCHIVO FUENTE
      const content = await _getDriveFileContentInternal(drive, fileId);
      if (!content) throw new HttpsError("not-found", "El archivo está vacío o no se pudo leer.");

      // 2. PREPARAR PROMPT DE ANÁLISIS
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-3-pro-preview",
        generationConfig: {
          temperature: 0.2, // Analítico
          // @ts-ignore
          thinking_config: { include_thoughts: true, thinking_level: "high" }
        } as any
      });

      const existingList = existingCharacterNames && Array.isArray(existingCharacterNames)
        ? existingCharacterNames.join(", ")
        : "Ninguno (Proyecto Nuevo)";

      const systemPrompt = `
        ACT AS: Senior Literary Editor & Continuity Manager.
        MISSION: Analyze the provided MANUSCRIPT TEXT (Draft/Chapter) and extract the CAST OF CHARACTERS.

        CONTEXT - EXISTING CHARACTERS IN DATABASE:
        [ ${existingList} ]

        CRITICAL DIRECTIVE - LANGUAGE DETECTION:
        1. DETECT the language of the provided "MANUSCRIPT TEXT" below.
        2. You MUST respond in the SAME LANGUAGE as the document for all narrative fields.
           - If the document is in Spanish -> "report_summary" and "role" MUST be in Spanish.
           - If the document is in English -> "report_summary" and "role" MUST be in English.
        3. EXCEPTION: TECHNICAL ENUMS MUST REMAIN IN ENGLISH.
           - "status" MUST be "EXISTING" or "DETECTED".
           - "suggested_action" MUST be "None", "Create Sheet", or "Update Sheet".
           - DO NOT translate these technical keys or values.

        TASK:
        1. READ the text deepy.
        2. IDENTIFY all unique characters mentioned.
        3. CLASSIFY them by Relevance (MAIN, SECONDARY, BACKGROUND).
        4. CROSS-REFERENCE with the "EXISTING CHARACTERS" list.
           - If a character is in the text but NOT in the list -> Mark as "DETECTED" (Ghost).
           - If a character is in the list -> Mark as "EXISTING".
        5. ANALYZE DATA GAPS:
           - For "DETECTED" characters, summarize what is known about them from the text (Role, Traits).
           - For "EXISTING" characters, flag if the text contradicts known traits (optional).
        6. GENERATE A STATUS REPORT:
           - A brief, professional summary addressed to the "Commander" (User).
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

      // 4. SANITIZAR JSON
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
         throw new Error("No JSON found in response");
      }
      const cleanJson = responseText.substring(firstBrace, lastBrace + 1);

      return JSON.parse(cleanJson);

    } catch (error: any) {
      logger.error("Error en forgeAnalyzer:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);
