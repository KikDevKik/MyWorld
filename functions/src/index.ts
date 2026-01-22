import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings
} from "@langchain/google-genai";
import {
  TaskType,
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  FinishReason
} from "@google/generative-ai";
import { Chunk, addVectors, divideVector } from "./similarity";
import { Readable } from 'stream';
import matter from 'gray-matter';
import { ingestFile } from "./ingestion";
import { MODEL_HIGH_REASONING, MODEL_LOW_COST, TEMP_CREATIVE, TEMP_PRECISION, TEMP_CHAOS } from "./ai_config";
import { marked } from 'marked';
import JSON5 from 'json5';
import { generateDeterministicId } from "./utils/idGenerator";
import { sanitizeHtml } from "./utils/sanitizer";
import { GraphNode, EntityType } from "./types/graph";

const htmlToPdfmake = require('html-to-pdfmake');
const { JSDOM } = require('jsdom');

// --- SINGLETON APP (Arrancando el Cerebro Robot) ---
admin.initializeApp();

// --- INTERFACES ---
interface DriveFile {
  id: string;
  name: string;
  path: string; // 👈 Absolute/Relative path for ID generation
  saga?: string; // 👈 Saga/Context tag
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

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- FILE FILTERING CONSTANTS ---
const IGNORED_FOLDER_PREFIXES = ['.', '_sys', 'tmp', '__'];
const IGNORED_FOLDER_NAMES = ['node_modules', '__MACOSX', '.obsidian', '.trash', '.stfolder', '.git'];
const ALLOWED_EXTENSIONS = ['.md', '.txt'];
const GOOGLE_DOC_MIMETYPE = 'application/vnd.google-apps.document';
const GOOGLE_FOLDER_MIMETYPE = 'application/vnd.google-apps.folder';

// 🛡️ SENTINEL CONSTANTS
const MAX_AI_INPUT_CHARS = 100000; // 100k chars (~25k tokens) limit for AI analysis
const MAX_FILE_SAVE_BYTES = 5 * 1024 * 1024; // 5MB limit for text file saves
const MAX_PROFILE_FIELD_LIMIT = 5000; // 5k chars limit for profile fields (prevent DoS)
const MAX_CHAT_MESSAGE_LIMIT = 30000; // 30k chars limit for chat messages/queries

// --- HERRAMIENTAS INTERNAS (HELPERS) ---

// 🛡️ SENTINEL: Log Sanitizer (PII Protection)
function maskLog(text: string, maxLength: number = 50): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + `... [TRUNCATED ${text.length - maxLength} chars]`;
}

// 🟢 NEW: JSON SANITIZER (ANTI-CRASH) - REVISION 2.0 (IRON JSON)
function parseSecureJSON(jsonString: string, contextLabel: string = "Unknown"): any {
  try {
    // 1. Basic Clean: Trim whitespace
    let clean = jsonString.trim();

    // 2. Aggressive Markdown Strip (Start)
    // Sometimes Gemini adds text before the block. We look for the FIRST ```json or ```
    const codeBlockStart = clean.indexOf("```");
    if (codeBlockStart !== -1) {
       // Check if it's ```json
       const jsonTag = clean.indexOf("```json", codeBlockStart);
       const startOffset = (jsonTag !== -1 && jsonTag === codeBlockStart) ? 7 : 3;

       // Cut everything before the code block
       clean = clean.substring(codeBlockStart + startOffset);
    }

    // 3. Aggressive Markdown Strip (End)
    const codeBlockEnd = clean.lastIndexOf("```");
    if (codeBlockEnd !== -1) {
       clean = clean.substring(0, codeBlockEnd);
    }

    clean = clean.trim();

    // 4. Extract JSON Block (Find first '{' or '[' and last '}' or ']')
    // We determine if it's an object or array candidate
    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');
    let startIndex = -1;
    let endIndex = -1;

    // Determine start
    if (firstBrace !== -1 && firstBracket !== -1) {
       startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
       startIndex = firstBrace;
    } else if (firstBracket !== -1) {
       startIndex = firstBracket;
    }

    if (startIndex !== -1) {
        // Look for end based on start type (naive but better than nothing)
        const lastBrace = clean.lastIndexOf('}');
        const lastBracket = clean.lastIndexOf(']');
        endIndex = Math.max(lastBrace, lastBracket);

        if (endIndex !== -1 && endIndex > startIndex) {
             clean = clean.substring(startIndex, endIndex + 1);
        }
    }

    // 5. Control Characters (ASCII 0-31 excl \t \n \r)
    clean = clean.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

    // 6. IRON PARSING STRATEGY
    try {
      // Plan A: Speed (Standard JSON)
      return JSON.parse(clean);
    } catch (standardError) {
      try {
        // Plan B: Robustness (JSON5 - handles trailing commas, comments, unquoted keys)
        // Note: JSON5 is heavier but much more forgiving for LLM output
        return JSON5.parse(clean);
      } catch (json5Error: any) {
        // Plan C: Hail Mary (Escaping Newlines)
        try {
           const rescued = clean.replace(/\n/g, '\\n');
           return JSON5.parse(rescued);
        } catch (finalError) {
           throw json5Error; // Throw the JSON5 error as it's usually more descriptive
        }
      }
    }

  } catch (error: any) {
    logger.error(`💥 [JSON PARSE ERROR] in ${contextLabel}:`, error);
    logger.debug(`💥 [JSON FAIL DUMP] Content: ${jsonString.substring(0, 200)}...`);

    // Return a controlled error object instead of throwing 500
    return {
      error: "JSON_PARSE_FAILED",
      details: error.message,
      partial_content: jsonString.substring(0, 500)
    };
  }
}

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
// 🛡️ SENTINEL UPDATE: Added maxSizeBytes to prevent DoS/OOM
const MAX_STREAM_SIZE_BYTES = 10 * 1024 * 1024; // 10MB Default

async function streamToString(stream: Readable, debugLabel: string = "UNKNOWN", maxSizeBytes: number = MAX_STREAM_SIZE_BYTES): Promise<string> {
  const chunks: Buffer[] = [];
  let currentSize = 0;

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      currentSize += chunk.length;

      // 🛡️ SECURITY CHECK: Prevent OOM/DoS
      if (currentSize > maxSizeBytes) {
        logger.error(`🛑 [SECURITY] Stream Limit Exceeded for ${debugLabel}. Size: ${currentSize} > ${maxSizeBytes}. Aborting.`);
        stream.destroy(); // Abort the stream to save bandwidth/memory
        reject(new Error(`Security Limit Exceeded: File ${debugLabel} exceeds max size of ${maxSizeBytes} bytes.`));
        return;
      }

      chunks.push(Buffer.from(chunk));
    });

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
        // 🛡️ SENTINEL: Use maskLog for consistency
        logger.debug(`📉 [STREAM DEBUG] Preview (${debugLabel}): ${maskLog(text.replace(/\n/g, ' '), 100)}`);
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
  currentCategory: 'canon' | 'reference' = 'canon',
  parentPath: string = '' // 👈 New: Accumulate path
): Promise<DriveFile[]> {
  logger.info(`📂 Escaneando carpeta: ${folderId} | Modo Recursivo: ${recursive} | Cat: ${currentCategory} | Path: ${parentPath}`);

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
        // 🟢 PATH CONSTRUCTION
        const currentPath = parentPath ? `${parentPath}/${file.name}` : file.name;

        // 🟢 DETECCIÓN DE CATEGORÍA (CONTEXT MAPPING)
        let fileCategory: 'canon' | 'reference' = currentCategory;

        const isExplicitCanon = config.canonPaths && config.canonPaths.some(p => p.id === file.id);
        const isExplicitResource = config.resourcePaths && config.resourcePaths.some(p => p.id === file.id);

        if (isExplicitCanon) fileCategory = 'canon';
        if (isExplicitResource) fileCategory = 'reference';

        // 🟢 FORCE CANON FOR 'LIBROS' (Truth Border Logic)
        // Ensures that any file within a 'Libros' structure is treated as Canon for the filter.
        if (currentPath.includes('/Libros/') || currentPath.includes('/Books/') || file.name === 'Libros') {
             fileCategory = 'canon';
        }

        // 🟢 SAGA DETECTION (Context Tagging)
        // If we have a parent path, the "Saga" is the top-level folder of that branch relative to the root scan
        // OR the immediate parent? The user said: "si está en Libros/JUST MEGU, el tag es JUST MEGU".
        // That implies immediate parent.
        // Let's extract immediate parent name from parentPath.
        let sagaTag = 'Global';
        if (parentPath) {
            const segments = parentPath.split('/');
            sagaTag = segments[segments.length - 1]; // Last segment is immediate parent
        }

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          let children: DriveFile[] = [];
          if (recursive && file.id) {
            // Pass currentPath as parentPath for children
            children = await fetchFolderContents(drive, file.id as string, config, true, fileCategory, currentPath);
          }

          return {
            id: file.id,
            name: file.name,
            path: currentPath,
            saga: sagaTag,
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
            path: currentPath,
            saga: sagaTag,
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
 * 0. CHECK SENTINEL INTEGRITY (El Pulso)
 * Verifica que el sistema tiene acceso a los secretos vitales sin exponerlos.
 */
export const checkSentinelIntegrity = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
    // 1. VERIFICAR AUTH (Opcional, pero recomendado para evitar spam)
    // El frontend llama a esto al inicio, así que puede que el usuario aún no esté logueado si es público.
    // Pero MyWorld es privado. Asumimos que el usuario debe estar autenticado o al menos App Check debe pasar.
    // enforceAppCheck: true arriba se encarga de la integridad de la app.

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

// --- WORLD MANIFEST LOGIC (NEXUS NODE CREATION) ---

/**
 * PHASE 6.0: MANIFEST GENERATOR (EVOLVED)
 * Escanea Drive y genera un grafo de entidades (GraphNodes) en Firestore.
 * Reemplaza y expande la lógica de syncCharacterManifest.
 */
export const syncWorldManifest = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
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

    // DIRECTIVA 2.2: masterVaultId ES el projectId para segregación de datos
    const projectId = masterVaultId;

    if (!projectId) {
         logger.info("ℹ️ Sin Bóveda Maestra configurada (masterVaultId). Sincronización omitida.");
         return { success: true, count: 0, message: "No master vault configured." };
    }

    const userId = request.auth.uid;
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });

    logger.info(`🌍 NEXUS NODE CREATION: Scanning for User ${userId} in Project ${projectId}`);

    try {
        // --- STEP A: RECURSIVE SCAN ---
        let candidates: DriveFile[] = [];
        const config = await _getProjectConfigInternal(userId);

        if (specificFileId) {
             logger.info(`🎯 Surgical Strike: Syncing single file ${specificFileId}`);
             try {
                 const meta = await drive.files.get({ fileId: specificFileId, fields: 'name, parents, mimeType' });
                 candidates = [{
                     id: specificFileId,
                     name: meta.data.name,
                     path: meta.data.name, // Simplified path for single file
                     saga: 'Global',
                     type: 'file',
                     mimeType: meta.data.mimeType,
                     parentId: meta.data.parents?.[0]
                 }];
             } catch (e: any) {
                 logger.error(`Error fetching specific file ${specificFileId}:`, e);
                 throw new HttpsError("not-found", "Could not find specific file.");
             }
        } else {
             logger.info(`📡 Full Scan: Scanning ${projectId}`);
             const tree = await fetchFolderContents(drive, projectId, config, true);
             const flatFiles = flattenFileTree(tree);
             candidates = flatFiles.filter(f =>
                f.mimeType === 'application/vnd.google-apps.document' ||
                f.name.endsWith('.md') ||
                f.name.endsWith('.txt')
            );
            logger.info(`   -> Files Found: ${candidates.length}`);
        }

        // --- STEP B: BATCH PROCESS (AI EXTRACTION + SEQUENTIAL UPSERT) ---
        // Refactored to avoid Race Conditions in DB Write
        const BATCH_SIZE = 3;
        let processedCount = 0;
        let nodesUpserted = 0;

        // Model setup (Flash for high throughput)
        const genAI = new GoogleGenerativeAI(googleApiKey.value());
        const model = genAI.getGenerativeModel({
             model: MODEL_LOW_COST, // gemini-2.0-flash
             generationConfig: {
                 responseMimeType: "application/json",
                 temperature: TEMP_PRECISION,
             } as any
        });

        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE);
            const batchResults: Array<{ file: DriveFile, entities: any[] }> = [];

            // PHASE 1: PARALLEL EXTRACTION (AI)
            await Promise.all(batch.map(async (file) => {
                try {
                    // 1. Fetch Content
                    const content = await _getDriveFileContentInternal(drive, file.id);
                    if (!content || content.length < 50) return;

                    // 2. AI Extraction
                    const prompt = `
                      ACT AS: Expert Taxonomist & Knowledge Graph Architect.
                      TASK: Analyze the provided text and extract semantic entities (Nodes) AND their relationships.

                      STRICT TAXONOMY (Do not invent types):
                      - 'character': Person, being, or sentient AI.
                      - 'location': Place, region, city, room, planet.
                      - 'object': Item, artifact, weapon, vehicle, tool.
                      - 'event': Specific historical or plot event (e.g. "The Great War").
                      - 'faction': Group, organization, family, guild, army.
                      - 'concept': Magic system, law, philosophy, species, technology.

                      RELATIONSHIP TAXONOMY (Strict):
                      - 'ENEMY': Hate, conflict, rival, victim/killer.
                      - 'ALLY': Friend, partner, support, ally.
                      - 'MENTOR': Teacher, master, guide, boss.
                      - 'FAMILY': Relative, spouse, sibling, parent/child.
                      - 'NEUTRAL': Co-worker, neighbor, acquaintance, location link.
                      - 'OWNED_BY': Ownership, possession, inventory (e.g., "The Sword belongs to Aragorn").

                      INSTRUCTIONS:
                      1. Extract entities as before.
                      2. Extract relationships found EXPLICITLY in the text.
                      3. INFER 'targetType' for relationships (Best Guess).
                      4. 'context' must be a short snippet (max 15 words) proving the link.

                      OUTPUT FORMAT (JSON Array):
                      [
                        {
                          "name": "Exact Name",
                          "type": "character",
                          "description": "Brief definition based ONLY on this text (max 30 words).",
                          "aliases": ["Alias1", "Nickname"],
                          "relationships": [
                             {
                               "target": "Target Name",
                               "type": "ENEMY",
                               "targetType": "character",
                               "context": "Stabbed him in the back."
                             }
                          ]
                        }
                      ]

                      TEXT CONTENT:
                      ${content.substring(0, 30000)}
                    `;

                    const result = await model.generateContent(prompt);
                    const responseText = result.response.text();
                    const parsedEntities = parseSecureJSON(responseText, "NexusNodeParser");

                    if (parsedEntities.error || !Array.isArray(parsedEntities)) {
                        logger.warn(`   ⚠️ Extraction failed for ${file.name}: Malformed JSON.`);
                        return;
                    }

                    // Store result for sequential processing
                    batchResults.push({ file, entities: parsedEntities });
                    processedCount++;

                } catch (fileError) {
                    logger.error(`   ❌ Failed to process ${file.name}:`, fileError);
                }
            }));

            // PHASE 2: SEQUENTIAL UPSERT (DB)
            // Critical to avoid "Last Write Wins" race conditions if same entity appears in multiple files in batch
            const entitiesRef = db.collection("users").doc(userId).collection("projects").doc(projectId).collection("entities");

            for (const res of batchResults) {
                const { file, entities } = res;
                // Note: We use a batch write per file or small groups, but we must await the READ before WRITE for each entity
                // Since firestore batch doesn't support "update based on read" atomically without transaction,
                // and transactions limit 500 ops... iterating sequentially with individual transactions or simple atomic merges is safest.
                // Given "Upsert" logic requires reading `foundInFiles`, we must read first.

                // Optimization: Group by Entity ID within this file result?
                // Actually, just process sequentially. Speed < Integrity here.

                for (const entity of entities) {
                    if (!entity.name || !entity.type) continue;

                    const rawName = entity.name.trim();
                    const rawType = entity.type.toLowerCase().trim();
                    const validTypes = ['character', 'location', 'object', 'event', 'faction', 'concept'];
                    const finalType = validTypes.includes(rawType) ? rawType : 'concept';

                    const nodeId = generateDeterministicId(projectId, rawName, finalType);
                    const nodeRef = entitiesRef.doc(nodeId);

                    try {
                        await db.runTransaction(async (transaction) => {
                            const docSnap = await transaction.get(nodeRef);
                            const existingData = docSnap.exists ? docSnap.data() as GraphNode : undefined;

                            const fileEntry = {
                                fileId: file.id,
                                fileName: file.name,
                                lastSeen: new Date().toISOString()
                            };

                            // MERGE LOGIC (Inside Transaction = Safe)
                            let newFoundInFiles = [fileEntry];
                            if (existingData?.foundInFiles) {
                                const others = existingData.foundInFiles.filter(f => f.fileId !== file.id);
                                newFoundInFiles = [...others, fileEntry];
                            }

                            let finalDescription = entity.description;
                            if (existingData?.locked) {
                                finalDescription = existingData.description;
                            }

                            const newAliases = Array.isArray(entity.aliases) ? entity.aliases : [];
                            const existingAliases = existingData?.aliases || [];
                            const mergedAliases = Array.from(new Set([...existingAliases, ...newAliases]));

                            const payload: any = {
                                id: nodeId,
                                name: rawName,
                                type: finalType,
                                projectId: projectId,
                                description: finalDescription,
                                aliases: mergedAliases,
                                foundInFiles: newFoundInFiles,
                                lastUpdated: new Date().toISOString()
                            };

                            // MERGE RELATIONS (Robust)
                            if (entity.relationships && Array.isArray(entity.relationships)) {
                                const newRelations = entity.relationships.map((rel: any) => ({
                                    targetId: generateDeterministicId(projectId, rel.target || "Unknown", rel.targetType || "concept"),
                                    targetName: rel.target || "Unknown Entity",
                                    targetType: rel.targetType || 'concept',
                                    relation: rel.type || 'NEUTRAL',
                                    context: rel.context || "No context provided.",
                                    sourceFileId: file.id
                                }));

                                let finalRelations = newRelations;
                                if (existingData?.relations) {
                                    // Remove old relations from this file to prevent duplicates, keep others
                                    const others = existingData.relations.filter((r: any) => r.sourceFileId !== file.id);
                                    finalRelations = [...others, ...newRelations];
                                }
                                payload.relations = finalRelations;
                            }

                            if (existingData?.locked) payload.locked = true;
                            if (!existingData?.meta) payload.meta = { tier: 'secondary' };

                            transaction.set(nodeRef, payload, { merge: true });
                        });
                        nodesUpserted++;
                    } catch (txError) {
                        logger.error(`   💥 Transaction failed for node ${rawName}:`, txError);
                    }
                }
            }
        }

        logger.info(`✅ World Manifest Synced: ${processedCount} files scanned, ${nodesUpserted} node operations committed.`);
        return { success: true, filesProcessed: processedCount, nodesUpserted: nodesUpserted };

    } catch (error: any) {
        logger.error("Error en syncWorldManifest:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * HELPER: Double Way Lineage Check (Paranoid Security)
 */
async function checkLineage(drive: any, folderId: string, requiredRootId: string, cache: Map<string, boolean>): Promise<boolean> {
  if (folderId === requiredRootId) return true;
  if (!requiredRootId) return true; // Safety: If no root defined, we can't enforce scope.
  if (cache.has(folderId)) return cache.get(folderId)!;

  try {
    const res = await drive.files.get({
      fileId: folderId,
      fields: "parents, id",
      supportsAllDrives: true
    });

    const parents = res.data.parents;
    if (!parents || parents.length === 0) {
      // Reached top of Drive (or Shared Drive Root) without hitting requiredRootId
      cache.set(folderId, false);
      return false;
    }

    // Recursive Check
    const isGood = await checkLineage(drive, parents[0], requiredRootId, cache);
    cache.set(folderId, isGood);
    return isGood;
  } catch (e: any) {
    logger.warn(`🛡️ [SENTINEL] Lineage Check Error for ${folderId}:`, e.message);
    cache.set(folderId, false); // Fail closed
    return false;
  }
}

/**
 * 1. GET DRIVE FILES (El Radar)
 * Escanea y devuelve la estructura del Drive.
 */
export const getDriveFiles = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540, // Increased for Deep Extraction
    secrets: [googleApiKey],
  },
  async (request) => {

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
                // Get Root Name for correct Path Construction
                const rootMeta = await drive.files.get({ fileId: cleanId, fields: 'name' });
                const rootName = rootMeta.data.name || 'Root';

                // Initial Path is the Root Name
                const tree = await fetchFolderContents(drive, cleanId, config, recursive, category, rootName);
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
           const rootMeta = await drive.files.get({ fileId: cleanFolderId, fields: 'name' });
           const rootName = rootMeta.data.name || 'Root';

           fileTree = await fetchFolderContents(drive, cleanFolderId, config, recursive, 'canon', rootName);
         } catch (pingError: any) {
           logger.error(`⛔ ACCESS DENIED to folder ${cleanFolderId}:`, pingError);
           throw new HttpsError('permission-denied', `ACCESS DENIED to [${cleanFolderId}].`);
         }
      }

      return fileTree;
    } catch (error: any) {
      logger.error("Error en getDriveFiles:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 22. GUARDIAN AUDIT (El Centinela)
 * Analiza fragmentos de contenido para validar hechos contra la base de datos.
 */
export { auditContent, scanProjectDrift, rescueEcho } from "./guardian";

/**
 * 24. BAPTISM PROTOCOL (La Migración)
 * Resuelve datos huérfanos y asegura integridad Nivel 1.
 */
export { executeBaptismProtocol } from "./migration";

/**
 * 25. JANITOR PROTOCOL (Operación Limpieza)
 * Mantiene la integridad del baúl eliminando fantasmas y artefactos vacíos.
 */
export { scanVaultHealth, purgeArtifacts, purgeEmptySessions } from "./janitor";

/**
 * 26. ANALYST PROTOCOL (El Crítico Literario)
 * Analiza archivos para extraer ADN de estilo y tono.
 */
export { analyzeStyleDNA } from "./analyst";

/**
 * 20. ENRICH CHARACTER CONTEXT (La Bola de Cristal)
 * Realiza una búsqueda vectorial profunda para analizar un personaje en el contexto de la saga.
 */
export const enrichCharacterContext = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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

      // 1. SETUP VECTORS
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
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
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_HIGH_REASONING, // ⚡ Reverted to Stable Model (Gemini 3 not public yet)
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
      logger.error("Error en enrichCharacterContext:", error);
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    secrets: [googleApiKey],
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 3600,
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - Powered by Gemini 3 - ' + new Date().toISOString());
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
        // Explicitly delete subcollections if recursiveDelete fails? No, recursiveDelete is powerful.
        // We will trust it but log extensively.
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
                // Get Root Name for correct Path Construction
                const rootMeta = await drive.files.get({ fileId: cleanId, fields: 'name' });
                const rootName = rootMeta.data.name || 'Root';

                const tree = await fetchFolderContents(drive, cleanId, config, true, category, rootName);
                fileTree = [...fileTree, ...tree];
             } catch (err) {
                logger.error(`⚠️ Error indexando root ${cleanId}:`, err);
             }
         }
      } else if (cleanFolderId) {
         logger.info(`🚀 Indexando SINGLE-ROOT: ${cleanFolderId}`);
         const rootMeta = await drive.files.get({ fileId: cleanFolderId, fields: 'name' });
         const rootName = rootMeta.data.name || 'Root';
         fileTree = await fetchFolderContents(drive, cleanFolderId, config, true, 'canon', rootName);
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
      // Sentinel Cache: folderId -> isValid (boolean)
      // To avoid spamming Drive API for every file in the same folder
      const sentinelCache = new Map<string, boolean>();

      // Pre-calculate valid roots set for fast lookup
      const validRootIds = new Set<string>();
      if (config.folderId) validRootIds.add(config.folderId);
      config.canonPaths?.forEach(p => validRootIds.add(p.id));
      config.resourcePaths?.forEach(p => validRootIds.add(p.id));

      await Promise.all(
        fileList.map(async (file) => {
          try {
            if (!file.id) {
              logger.warn(`⚠️ Saltando archivo sin ID: ${file.name}`);
              return;
            }

            // 🟢 SENTINEL PROTOCOL: DOUBLE WAY VALIDATION
            // "Paranoid Security": Verify file is STILL in scope before processing.
            const rootId = config.folderId || cleanFolderId;

            if (file.id && rootId) {
                try {
                    // 1. Get Current Parent (Live Truth)
                    const currentMeta = await drive.files.get({ fileId: file.id, fields: 'parents' });
                    const currentParents = currentMeta.data.parents;

                    if (currentParents && currentParents.length > 0) {
                         const currentParentId = currentParents[0];

                         // 2. Trace Lineage
                         const isValid = await checkLineage(drive, currentParentId, rootId, sentinelCache);

                         if (!isValid) {
                             logger.warn(`🛡️ [SENTINEL] OUT_OF_SCOPE: ${file.name} is NOT in Root ${rootId}`);
                             throw new HttpsError('aborted', 'OUT_OF_SCOPE');
                         }

                         // Update parentId to current truth
                         file.parentId = currentParentId;
                    }
                } catch (sentinelErr: any) {
                    if (sentinelErr.code === 'aborted' || sentinelErr.message === 'OUT_OF_SCOPE') throw sentinelErr;
                    // If validation fails due to network/permissions, we fail closed.
                    logger.warn(`🛡️ [SENTINEL] Verification failed for ${file.name}. Fail Closed.`);
                    throw new HttpsError('aborted', 'OUT_OF_SCOPE');
                }
            }

            // 🟢 1. FETCH CONTENT
            const content = await _getDriveFileContentInternal(drive, file.id);

            // 🟢 2. INGEST (HASH, CLEAN, VECTORIZE, SAVE)
            const result = await ingestFile(
                db,
                userId,
                config.folderId || cleanFolderId || "unknown_project", // 👈 This needs to be the TRUE root of this file
                {
                    id: file.id, // Drive ID (Legacy ref)
                    name: file.name,
                    path: file.path, // 👈 New: Path Key
                    saga: file.saga, // 👈 New: Saga Context
                    parentId: file.parentId,
                    category: file.category
                },
                content,
                embeddings
            );

            if (result.status === 'processed') {
                totalChunks += result.chunksCreated;
                totalChunksDeleted += result.chunksDeleted;
            }

          } catch (err: any) {
            if (err.message === 'OUT_OF_SCOPE' || err.code === 'aborted') throw err;
            logger.error(`Error indexando ${file.name}:`, err);
          }
        })
      );

      // 🟢 3.5. CALCULATE PROJECT CENTROID (THE ANCHOR)
      try {
        const rootId = config.folderId || cleanFolderId;
        if (rootId) {
            logger.info("⚓ Calculating Project Centroid for Root:", rootId);

            // Query all chunks for this project
            const allChunksSnapshot = await db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .where("projectId", "==", rootId)
                .select("embedding") // Only fetch vectors
                .get();

            if (!allChunksSnapshot.empty) {
                let sumVector: number[] = [];
                let count = 0;

                allChunksSnapshot.forEach(doc => {
                    const emb = doc.data().embedding;
                    if (emb && Array.isArray(emb) && emb.length > 0) {
                        if (sumVector.length === 0) {
                            sumVector = [...emb];
                        } else {
                            // Helper defined in similarity.ts
                            sumVector = addVectors(sumVector, emb);
                        }
                        count++;
                    }
                });

                if (count > 0 && sumVector.length > 0) {
                    const meanVector = divideVector(sumVector, count);

                    // Save Centroid
                    await db.collection("TDB_Index").doc(userId).collection("stats").doc("centroid").set({
                         vector: meanVector,
                         projectId: rootId,
                         updatedAt: new Date().toISOString(),
                         sampleSize: count
                    });
                    logger.info(`⚓ Project Centroid Saved. Samples: ${count}.`);
                }
            }
        }
      } catch (centroidError) {
          logger.error("⚠️ Failed to calculate Project Centroid:", centroidError);
          // Non-blocking error
      }

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
    secrets: [googleApiKey],
    memory: "2GiB",
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - Powered by Gemini 3 - ' + new Date().toISOString());
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction, history, categoryFilter, activeFileContent, activeFileName, isFallbackContext, filterScopePath, sessionId } = request.data;

    if (!query) throw new HttpsError("invalid-argument", "Falta la pregunta.");

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if (query.length > MAX_CHAT_MESSAGE_LIMIT) {
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
          const lowerQuery = query.toLowerCase();

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
        // 🛡️ SENTINEL: Mask sensitive query data in logs
        logger.info(`🔍 Búsqueda Vectorial Enriquecida (Length: ${searchQuery.length}):`, maskLog(query, 100));
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

      let candidates: Chunk[] = vectorSnapshot.docs.map(doc => ({
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

      const finalContext: Chunk[] = [];
      const rejectedCandidates: Chunk[] = [];
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

      const relevantChunks = finalContext;

      // 🛑 FINITE CONTEXT CHECK (Prevent Crash on Empty)
      if (isScopedSearch && relevantChunks.length === 0) {
          logger.warn("🛑 SCOPE EMPTY: No chunks found in selected path. Aborting AI call.");
          return {
             response: "No encontré información en los libros seleccionados.",
             sources: []
          };
      }
      logger.info('📚 RAG Context Sources:', relevantChunks.map(c => c.fileName));

      // 5. Construir Contexto RAG
      const contextText = relevantChunks.map(c => c.text).join("\n\n---\n\n");

      // 🟢 DEBUG SOURCES
      if (filterScopePath) {
         logger.info("📊 Scope Filter Result Sources:", relevantChunks.map(c => `${c.fileName} (${(c as any).path})`));
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

      // 🟢 REVISION 00131.2: SYSTEM IDENTITY OVERWRITE (CLOAKING MODE)
      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE ASISTENCIA CREATIVA (VER. 00131.2 - CHAMELEON UPDATE) ===
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

      // 🟢 OPERATION BYPASS TOTAL: NATIVE SDK IMPLEMENTATION
      try {
        const genAI = new GoogleGenerativeAI(googleApiKey.value());

        // --- 1. CONFIGURATION ---
        const generationConfig = {
             temperature: TEMP_CREATIVE,
             maxOutputTokens: 8192,
        };

        // 🟢 REVISION 00130: HARDCODED ENTERPRISE SAFETY SETTINGS
        const standardSafetySettings = [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];

        // --- 2. ATTEMPT 1: STANDARD CALL ---
        let model = genAI.getGenerativeModel({
            model: MODEL_HIGH_REASONING,
            generationConfig,
            safetySettings: standardSafetySettings
        });

        logger.info("🚀 [BYPASS] Attempt 1: Calling Gemini Native SDK...");
        let result = await model.generateContent(promptFinal);
        let response = result.response;
        let finishReason = response.candidates?.[0]?.finishReason;

        // 🟢 DEBUG RAW RESPONSE
        // 🛡️ SENTINEL UPDATE: Truncate log to prevent PII leakage and log bloat
        const rawResponseStr = JSON.stringify(result, null, 2);
        const truncatedLog = rawResponseStr.length > 2000 ? rawResponseStr.substring(0, 2000) + "... (TRUNCATED)" : rawResponseStr;
        logger.info("🔍 [RAW NATIVE RESPONSE]:", truncatedLog);

        // --- 3. RETRY LOGIC (SANITIZATION FALLBACK) ---
        // REVISION 00130: If Attempt 1 is blocked, Attempt 2 must STRIP RAG chunks.
        const isBlocked = finishReason === FinishReason.SAFETY || finishReason === FinishReason.OTHER || (response.promptFeedback?.blockReason);
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

                PREGUNTA DEL USUARIO: "${query}"
             `;

             logger.info("🚀 [BYPASS] Attempt 2: Retrying with SANITIZED PROMPT...");

             // Retry with same permissive settings but clean prompt
             result = await model.generateContent(sanitizedPrompt);
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
          sources: relevantChunks.map(chunk => ({
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
          response: "⚠️ Error del Sistema: Fallo en la memoria a largo plazo.",
          sources: []
      };
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 1800, // 30 Minutes
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    console.log("🚀 WORLD ENGINE v2.0 (Sanitizer Active) - Loaded");
    console.log('🚀 WORLD ENGINE: Phase 4.1 - TITAN LINK - ' + new Date().toISOString());

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

      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_HIGH_REASONING,
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
[TURN ${i+1}]
User: ${item.prompt}
AI Result: ${item.result?.title || 'Unknown'} - ${item.result?.content || ''}
`).join('\n')}
================================================
`;
      }

      const systemPrompt = `
        You are using the Gemini 3 Reasoning Engine.
        CORE PERSONA DIRECTIVE: ${systemPersona}

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    secrets: [googleApiKey],
  },
  async (request) => {

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para guardar.");
    }

    const { fileId, content, accessToken } = request.data;

    if (!fileId) throw new HttpsError("invalid-argument", "Falta el ID del archivo.");
    if (content === undefined || content === null) throw new HttpsError("invalid-argument", "Falta el contenido.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // 🛡️ SECURITY: INPUT VALIDATION
    if (typeof content !== 'string') {
       throw new HttpsError("invalid-argument", "El contenido debe ser texto (string).");
    }
    if (content.length > MAX_FILE_SAVE_BYTES) {
       throw new HttpsError("resource-exhausted", `El archivo excede el límite de ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
    }

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión para guardar tu perfil.");
    }

    const { style, inspirations, rules } = request.data;
    const userId = request.auth.uid;

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if ((style && style.length > MAX_PROFILE_FIELD_LIMIT) ||
        (inspirations && inspirations.length > MAX_PROFILE_FIELD_LIMIT) ||
        (rules && rules.length > MAX_PROFILE_FIELD_LIMIT)) {
        throw new HttpsError("resource-exhausted", `Uno de los campos del perfil excede el límite de ${MAX_PROFILE_FIELD_LIMIT} caracteres.`);
    }

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { sessionId, role, text, characterId, sources } = request.data;
    if (!sessionId || !role || !text) {
      throw new HttpsError("invalid-argument", "Faltan datos del mensaje.");
    }

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if (text.length > MAX_CHAT_MESSAGE_LIMIT) {
        throw new HttpsError("resource-exhausted", `El mensaje excede el límite de ${MAX_CHAT_MESSAGE_LIMIT} caracteres.`);
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
        timestamp: now,
        sources: sources || [] // 🟢 Save Sources
      });

      // 2. UPSERT SESSION (The "Upsert Protocol" + Metadata)
      const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
      const sessionDoc = await sessionRef.get();

      // Snippet logic: First 100 chars
      const snippet = text.length > 100 ? text.substring(0, 97) + '...' : text;

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
             createdAt: FieldValue.serverTimestamp(),
             updatedAt: FieldValue.serverTimestamp(),
             lastUpdated: FieldValue.serverTimestamp(),
             lastMessageSnippet: snippet,
             messageCount: 1
         });

         logger.info(`🔨 [AUTO-CREATE] Session created via addForgeMessage: ${sessionId}`);

      } else {
         // B) EXISTING SESSION (Update Timestamps & Metadata)
         await sessionRef.set({
             updatedAt: FieldValue.serverTimestamp(),
             lastUpdated: FieldValue.serverTimestamp(),
             lastMessageSnippet: snippet,
             messageCount: FieldValue.increment(1)
         }, { merge: true });

         // 🟢 3. AUTO-TITLING INTELLIGENCE (Inline Logic)
         // Directiva: "Al recibir un mensaje: if (session.messageCount === 4 && session.title === 'Nueva Sesión') { await generateTitle(...) }"
         const currentData = sessionDoc.data();
         const currentCount = (currentData?.messageCount || 0) + 1; // +1 because we just incremented
         const currentName = currentData?.name || '';
         const isDefaultName = currentName.startsWith('Director ') || currentName === 'Nueva Sesión' || currentName.includes('Untitled');

         // Trigger at message 4 if name is generic
         if (currentCount === 4 && isDefaultName) {
             logger.info(`🧠 [AUTO-TITLE] Triggering intelligence for Session ${sessionId}`);

             try {
                // Fetch recent messages to understand context
                const histSnapshot = await db.collection("users").doc(userId)
                    .collection("forge_sessions").doc(sessionId)
                    .collection("messages")
                    .orderBy("timestamp", "asc")
                    .limit(6)
                    .get();

                const conversation = histSnapshot.docs.map(d => `${d.data().role}: ${d.data().text}`).join('\n');

                const titleModel = new ChatGoogleGenerativeAI({
                    apiKey: googleApiKey.value(),
                    model: MODEL_LOW_COST, // Flash is fast and cheap
                    temperature: 0.4,
                });

                const titlePrompt = `
                    TASK: Generate a concise title (3-5 words) for this session.
                    LANGUAGE: Detect the language of the conversation and use it.
                    STYLE: Professional, descriptive, cinematic.
                    NO QUOTES.

                    CONVERSATION:
                    ${conversation}
                `;

                const aiTitleRes = await (titleModel as any).invoke(titlePrompt);
                let newTitle = aiTitleRes.content.toString().trim();
                newTitle = newTitle.replace(/["']/g, ''); // Remove quotes

                if (newTitle) {
                    await sessionRef.set({ name: newTitle }, { merge: true });
                    logger.info(`🧠 [AUTO-TITLE] Updated Session ${sessionId} to "${newTitle}"`);
                }

             } catch (titleError) {
                 logger.warn("⚠️ [AUTO-TITLE] Failed to generate title:", titleError);
                 // Non-blocking
             }
         }
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
  },
  async (request) => {
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
        model: MODEL_LOW_COST,
        temperature: TEMP_PRECISION,
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

      const aiResponse = await (synthesisModel as any).invoke(synthesisPrompt);
      const markdownContent = aiResponse.content.toString();

      let fileName = "";
      try {
        const titleModel = new ChatGoogleGenerativeAI({
          apiKey: googleApiKey.value(),
          model: MODEL_LOW_COST,
          temperature: TEMP_PRECISION,
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

        const titleResponse = await (titleModel as any).invoke(titlePrompt);
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
    memory: "2GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
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

    // 🛡️ SECURITY: SIZE LIMIT FOR AI
    if (textToAnalyze.length > MAX_AI_INPUT_CHARS) {
       throw new HttpsError("invalid-argument", `El texto excede el límite de análisis (${MAX_AI_INPUT_CHARS} caracteres).`);
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
        model: MODEL_HIGH_REASONING,
        temperature: TEMP_CREATIVE,
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

      const response = await (chatModel as any).invoke([
        ["system", systemPrompt],
        ["human", textToAnalyze]
      ]);

      const content = response.content.toString();

      const tribunalVerdict = parseSecureJSON(content, "SummonTheTribunal");

      if (tribunalVerdict.error === "JSON_PARSE_FAILED") {
          throw new HttpsError('internal', `Tribunal JSON Malformed: ${tribunalVerdict.details}`);
      }

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
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
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_LOW_COST,
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
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

        // 3. Post-Process for Smart Breaks (Recursive)
        // We look for 'html-h1' and 'html-h2' styles to inject page breaks
        if (isSmartBreakEnabled) {
          const injectPageBreaks = (nodes: any[]) => {
            if (!nodes || !Array.isArray(nodes)) return;

            nodes.forEach(node => {
              if (node.style) {
                 const s = node.style;
                 // Check if style is h1/h2 (html-to-pdfmake uses 'html-h1', 'html-h2')
                 const isH1 = s === 'html-h1' || (Array.isArray(s) && s.includes('html-h1'));
                 const isH2 = s === 'html-h2' || (Array.isArray(s) && s.includes('html-h2'));

                 if (isH1 || isH2) {
                   node.pageBreak = 'before';
                 }
              }

              // Recursion for stacks/columns/nested arrays
              if (node.stack) injectPageBreaks(node.stack);
              if (node.ul) injectPageBreaks(node.ul);
              if (node.ol) injectPageBreaks(node.ol);
              // Sometimes html-to-pdfmake returns nested arrays directly?
              if (Array.isArray(node)) injectPageBreaks(node);
            });
          };

          if (Array.isArray(converted)) {
             injectPageBreaks(converted);
          } else if (converted.stack) {
             injectPageBreaks(converted.stack);
          }
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
    secrets: [googleApiKey],
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
    const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
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
             const flatFiles = flattenFileTree(tree);

             candidates = flatFiles.filter(f =>
                f.mimeType === 'application/vnd.google-apps.document' ||
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
                    let content = await _getDriveFileContentInternal(drive, file.id);

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
                            id: file.id,
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
                        if (currentData?.isAIEnriched && currentData?.contentHash === ingestResult.hash) {
                             logger.info(`🛡️ [TRUTH SHIELD] Preserving AI Role for ${slug} (Hash Match)`);
                             if (currentData.role) finalRole = currentData.role;
                             isAIEnriched = true;
                        } else if (currentData?.contentHash !== ingestResult.hash) {
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
                            tier: fm.tier || 'MAIN',
                            age: fm.age || null,
                            avatar: fm.avatar || null,
                            sourceType: 'MASTER',
                            sourceContext: 'GLOBAL',
                            masterFileId: file.id,
                            contentHash: ingestResult.hash, // 🟢 SAVE HASH FOR FUTURE CHECKS
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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    secrets: [googleApiKey],
  },
  async (request) => {

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
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 540,
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
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_LOW_COST,
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
             b) **EXTRACT A RICH CONTEXT WINDOW**: Extract approximately 800-1000 characters of text surrounding their key appearance. This MUST include the paragraph immediately preceding the mention, the paragraph of the mention, and the paragraph immediately following it. Return this in the 'description' field.
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
      logger.error("Error en forgeAnalyzer:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 21. CLEAR SESSION MESSAGES (La Purga)
 * Elimina todos los mensajes de una sesión específica.
 */
export const clearSessionMessages = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
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
      const messagesRef = db.collection("users").doc(userId)
        .collection("forge_sessions").doc(sessionId)
        .collection("messages");

      // Use recursiveDelete to wipe the subcollection
      // Note: recursiveDelete is available on the CollectionReference or via firebase-tools,
      // but in admin SDK strictly it's usually on a Doc or via specific tools.
      // However, Firestore Admin SDK has recursiveDelete?
      // Actually, standard Admin SDK uses db.recursiveDelete(ref).
      await db.recursiveDelete(messagesRef);

      logger.info(`🗑️ Sesión PURGADA: ${sessionId}`);
      return { success: true };

    } catch (error: any) {
      logger.error("Error purgando sesión:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 23. UPDATE FORGE CHARACTER (El Sincronizador)
 * Actualiza los rasgos de personalidad y evolución en Firestore y reescribe la ficha en Drive.
 */
export const updateForgeCharacter = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    timeoutSeconds: 120,
    secrets: [googleApiKey],
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { characterId, newTraits, rationale, accessToken } = request.data;
    const userId = request.auth.uid;

    if (!characterId) throw new HttpsError("invalid-argument", "Falta characterId.");
    if (!newTraits) throw new HttpsError("invalid-argument", "Faltan nuevos rasgos.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if ((newTraits.personality && newTraits.personality.length > MAX_CHAT_MESSAGE_LIMIT) ||
        (newTraits.evolution && newTraits.evolution.length > MAX_CHAT_MESSAGE_LIMIT) ||
        (rationale && rationale.length > MAX_PROFILE_FIELD_LIMIT)) {
        throw new HttpsError("resource-exhausted", `Los datos del personaje exceden los límites de seguridad.`);
    }

    try {
        const charRef = db.collection("users").doc(userId).collection("characters").doc(characterId);
        const charDoc = await charRef.get();

        if (!charDoc.exists) {
            throw new HttpsError("not-found", "Personaje no encontrado.");
        }

        const charData = charDoc.data();
        const driveFileId = charData?.masterFileId;

        logger.info(`🔄 SYNC-BACK INITIATED for ${characterId} (File: ${driveFileId})`);

        // 1. ATTEMPT DRIVE UPDATE (PRIMARY TRUTH) - FAIL SAFE
        // We update Drive FIRST. If this fails, we DO NOT update Firestore.
        // This ensures the "Physical Bible" is always the bottleneck of truth.

        if (driveFileId) {
            try {
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: accessToken });
                const drive = google.drive({ version: "v3", auth });

                // A. Fetch current content
                const currentContent = await _getDriveFileContentInternal(drive, driveFileId);

                // B. Use AI to surgicaly update
                const genAI = new GoogleGenerativeAI(googleApiKey.value());
                const model = genAI.getGenerativeModel({
                  model: MODEL_HIGH_REASONING,
                  generationConfig: {
                    temperature: TEMP_CREATIVE,
                  }
                });

                const editPrompt = `
                    ACT AS: Expert Editor.
                    TASK: Update the Character Sheet Markdown based on NEW DATA, while preserving all other information.

                    NEW DATA (Override these sections):
                    Personality: "${newTraits.personality || 'No Change'}"
                    Evolution/Arc: "${newTraits.evolution || 'No Change'}"

                    CURRENT FILE CONTENT:
                    ${currentContent}

                    INSTRUCTIONS:
                    1. Locate the "Personality" and "Evolution" (or similar) sections in the Markdown.
                    2. REWRITE those sections to reflect the NEW DATA.
                    3. KEEP all other sections (Name, Appearance, Backstory, etc.) EXACTLY AS THEY ARE.
                    4. If the sections don't exist, create them under appropriate headers.
                    5. Output ONLY the complete, updated Markdown file.
                `;

                const result = await model.generateContent(editPrompt);
                const newFileContent = result.response.text();

                // C. Save back to Drive (Atomic-ish Point)
                await drive.files.update({
                    fileId: driveFileId,
                    media: {
                        mimeType: "text/markdown",
                        body: newFileContent
                    }
                });

                logger.info(`   ✅ Drive File Updated: ${driveFileId}`);

            } catch (driveError: any) {
                logger.error(`💥 DRIVE SYNC FAILED for ${characterId}. Aborting Firestore update.`, driveError);
                throw new HttpsError('data-loss', `Fallo al escribir en Google Drive: ${driveError.message}`);
            }
        } else {
            logger.warn(`   ⚠️ No Master File ID found for ${characterId}. Skipping Drive sync (Data Integrity Risk).`);
        }

        // 2. UPDATE FIRESTORE (METADATA) - ONLY IF DRIVE SUCCEEDED
        const updatePayload: any = {
            lastUpdated: new Date().toISOString(),
            lastSyncRationale: rationale || "Manual Sync via CanonRadar"
        };

        if (newTraits.personality) updatePayload.personality = newTraits.personality;
        if (newTraits.evolution) updatePayload.evolution = newTraits.evolution;

        await charRef.set(updatePayload, { merge: true });
        logger.info(`   ✅ Firestore Metadata Updated for ${characterId}`);

        return { success: true };

    } catch (error: any) {
        logger.error("Error in updateForgeCharacter:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 27. RESTORE TIMELINE FROM MASTER (La Sincronización)
 * Restaura la línea de tiempo desde el archivo maestro en Drive hacia Firestore.
 */
export const restoreTimelineFromMaster = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
    secrets: [googleApiKey],
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { accessToken } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    try {
      // 1. GET CONFIG & PATH
      const config = await _getProjectConfigInternal(userId);
      const chronologyPathId = config.chronologyPath?.id;

      if (!chronologyPathId) {
          logger.warn("⚠️ [TIME ANCHOR] No chronologyPath configured. Skipping restore.");
          return { success: false, message: "No chronology folder configured." };
      }

      // 2. READ MASTER FILE
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      const q = `'${chronologyPathId}' in parents and name = 'timeline_master.json' and trashed = false`;
      const listRes = await drive.files.list({ q, fields: "files(id)" });

      if (!listRes.data.files || listRes.data.files.length === 0) {
          logger.info("ℹ️ [TIME ANCHOR] No master file found. Nothing to restore.");
          return { success: true, count: 0, message: "No master file found." };
      }

      const masterFileId = listRes.data.files[0].id;
      const content = await _getDriveFileContentInternal(drive, masterFileId!);

      let masterEvents = [];
      try {
          masterEvents = parseSecureJSON(content, "TimelineMasterRestore");
      } catch (e) {
          throw new HttpsError('data-loss', "Master Timeline file is corrupt.");
      }

      if (!Array.isArray(masterEvents) || masterEvents.length === 0) {
          return { success: true, count: 0, message: "Master file is empty." };
      }

      // 3. WIPE FIRESTORE (Clean Slate Protocol)
      // We accept that Firestore is just a cache. Wiping ensures we don't have dupes.
      const timelineRef = db.collection("TDB_Timeline").doc(userId).collection("events");
      // Note: recursiveDelete in admin SDK is strictly for docs/collections.
      // We will use a batch delete if size is small, or recursiveDelete.
      await db.recursiveDelete(timelineRef);

      // 4. POPULATE FIRESTORE
      const batch = db.batch();
      let count = 0;

      // Batch limit is 500. If more, we need chunks.
      // For now, let's assume < 500 for beta.
      for (const event of masterEvents) {
          if (count >= 450) break; // Safety cap

          const docId = event.id || timelineRef.doc().id;
          const docRef = timelineRef.doc(docId);

          // Ensure we have required fields
          batch.set(docRef, {
              ...event,
              restoredAt: new Date().toISOString()
          });
          count++;
      }

      await batch.commit();
      logger.info(`✅ [TIME ANCHOR] Restored ${count} events from Master.`);

      return { success: true, count };

    } catch (error: any) {
      logger.error("Error in restoreTimelineFromMaster:", error);
      throw new HttpsError("internal", error.message);
    }
  }
);
