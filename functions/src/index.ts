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

interface ProjectConfig {
  canonPaths: string[];
  resourcePaths: string[];
  chronologyPath: string;
  activeBookContext: string;
  folderId?: string; // 👈 Folder Persistence
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
    canonPaths: ["MI HISTORIA", "TDB Design Character"],
    resourcePaths: ["_RESOURCES"],
    chronologyPath: "MI HISTORIA/Estructura Principal/Flujo de Tiempo",
    activeBookContext: "Just Megu"
  };

  if (!doc.exists) {
    return defaultConfig;
  }
  return { ...defaultConfig, ...doc.data() };
}

// --- NUEVO HELPER: Convertir Tubería a Texto ---
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
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

    // 3. PROCESAR
    return await streamToString(res.data);

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

    const processedFiles = await Promise.all(
      validFiles.map(async (file: any): Promise<DriveFile> => {

        // 🟢 DETECCIÓN DE CATEGORÍA
        // Si ya estamos en 'reference', todo lo de adentro es 'reference'.
        // Si no, miramos la configuración dinámica.
        let fileCategory: 'canon' | 'reference' = currentCategory;

        // 1. Check Resource Paths
        if (config.resourcePaths.some(path => file.name === path) || file.name.startsWith('_RESOURCES')) {
           fileCategory = 'reference';
        }

        // 2. Check Canon Paths (Explicit override)
        if (config.canonPaths.some(path => file.name === path)) {
           fileCategory = 'canon';
        }

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          let children: DriveFile[] = [];
          if (recursive) {
            children = await fetchFolderContents(drive, file.id, config, true, fileCategory); // 👈 Propagamos categoría y config
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
          return {
            id: file.id,
            name: file.name,
            type: 'file',
            mimeType: file.mimeType,
            category: fileCategory, // 👈 Guardamos categoría
          };
        }
      })
    );
    return processedFiles;

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

    const { folderId, accessToken } = request.data; // <--- 🟢 RECIBIR TOKEN

    // 1. Limpieza de ID (Anti-Error 404)
    let cleanFolderId = folderId;
    if (cleanFolderId && cleanFolderId.includes("drive.google.com")) {
      const match = cleanFolderId.match(/folders\/([a-zA-Z0-9-_]+)/);
      if (match && match[1]) {
        logger.info(`🧹 URL detectada. ID extraído: ${match[1]}`);
        cleanFolderId = match[1];
      }
    }

    logger.info(`🚀 Iniciando escaneo para ID: ${cleanFolderId}`);

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    if (!cleanFolderId) {
      throw new HttpsError("invalid-argument", "Falta el ID de la carpeta.");
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

      // 📡 PING PROBE: Check access before listing
      try {
        await drive.files.get({
          fileId: cleanFolderId,
          fields: 'name'
        });
        logger.info(`✅ ACCESS CONFIRMED for folder: ${cleanFolderId}`);
      } catch (pingError: any) {
        logger.error(`⛔ ACCESS DENIED to folder ${cleanFolderId}:`, pingError);
        throw new HttpsError(
          'permission-denied',
          `ACCESS DENIED. The user cannot access folder [${cleanFolderId}]. Ensure you have permission.`
        );
      }

      // 🟢 CAMBIO CRÍTICO: recursive param
      // Permitimos que el cliente decida si quiere recursividad (ej: LaboratoryPanel) o no (ej: Sidebar)
      const recursive = request.data.recursive || false;
      const fileTree = await fetchFolderContents(drive, cleanFolderId, config, recursive);

      return fileTree;
    } catch (error: any) {
      logger.error("Error en getDriveFiles:", error);
      if (error.code === 404) {
        throw new HttpsError("not-found", "Carpeta no encontrada. Verifica permisos del Robot.");
      }
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
        canonPaths: ["MI HISTORIA", "TDB Design Character"],
        resourcePaths: ["_RESOURCES"],
        chronologyPath: "MI HISTORIA/Estructura Principal/Flujo de Tiempo",
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

    if (!config.canonPaths || !config.resourcePaths) {
      throw new HttpsError("invalid-argument", "Faltan campos obligatorios en la configuración.");
    }

    logger.info(`💾 Guardando configuración del proyecto para usuario: ${userId}`);

    try {
      await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
        ...config,
        updatedAt: new Date().toISOString()
      });

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
      const snapshot = await db.collection("TDB_Index").doc(userId).collection("files").limit(1).get();

      const isIndexed = !snapshot.empty;
      let lastIndexedAt = null;

      if (isIndexed) {
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
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    // Limpieza de ID también aquí por si acaso
    let cleanFolderId = request.data.folderId;
    const accessToken = request.data.accessToken;

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

      // B. Conectar Drive (🟢 USUARIO)
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });

      const drive = google.drive({ version: "v3", auth });

      // 🟢 RECUPERAR CONFIGURACIÓN DEL USUARIO
      const config = await _getProjectConfigInternal(userId);

      // 🟢 CAMBIO CRÍTICO: recursive = true
      // Para indexar necesitamos bajar hasta el infierno.
      const fileTree = await fetchFolderContents(drive, cleanFolderId, config, true);

      const fileList = flattenFileTree(fileTree);

      // D. Configurar Splitter
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

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

            // Parse Frontmatter
            const parsed = matter(content);
            const cleanContent = parsed.content;
            const metadata = parsed.data;
            const timelineDate = metadata.date ? new Date(metadata.date).toISOString() : null;

            const chunks = await splitter.splitText(cleanContent);

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

      return {
        success: true,
        filesIndexed: fileList.length,
        totalChunks: totalChunks, // Chunks Created
        chunksCreated: totalChunks, // Explicit alias
        chunksDeleted: totalChunksDeleted, // 👈 New stat
        message: "¡Indexado completado con éxito!"
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
    timeoutSeconds: 120,
    secrets: [googleApiKey],
    memory: "512MiB",
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction, history, categoryFilter } = request.data; // 👈 Added categoryFilter

    if (!query) throw new HttpsError("invalid-argument", "Falta la pregunta.");

    // 🧠 RETRIEVE USER PROFILE (Neural Synchronization)
    const userId = request.auth.uid;
    const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
    const profile: WriterProfile = profileDoc.exists
      ? profileDoc.data() as WriterProfile
      : { style: '', inspirations: '', rules: '' };

    // 🏗️ RECUPERAR CONFIGURACIÓN DEL PROYECTO (PARA EL LIBRO ACTIVO)
    const projectConfig = await _getProjectConfigInternal(userId);
    const activeBook = projectConfig.activeBookContext || "Historia General";

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
      // 1. Preparar Búsqueda Contextual
      // Si hay historial, lo usamos para mejorar la búsqueda (ej: "¿Quién es él?" -> "¿Quién es Manuel?")
      let searchQuery = query;
      let historyText = "No hay historial previo.";

      if (history && Array.isArray(history) && history.length > 0) {
        // a) Para el Prompt de la IA (Texto completo)
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

      if (categoryFilter === 'reference') {
        logger.info("🔍 Filtrando por REFERENCIA");
        chunkQuery = chunkQuery.where("category", "==", "reference");
      } else if (categoryFilter === 'canon') {
        logger.info("🔍 Filtrando por CANON");
        // Nota: En Vector Search las desigualdades (!=) tienen limitaciones.
        // Asumimos que lo que no es reference es canon.
        // Si hay mas categorias, esto podria necesitar ajuste.
        chunkQuery = chunkQuery.where("category", "==", "canon");
      }

      // 4. Ejecutar Búsqueda Vectorial
      const vectorQuery = chunkQuery.findNearest({
        queryVector: queryVector,
        limit: 5,
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      const vectorSnapshot = await vectorQuery.get();

      const relevantChunks: Chunk[] = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        embedding: [], // No necesitamos el embedding de vuelta
        fileName: doc.data().fileName || "Desconocido",
        category: doc.data().category || 'canon',
      }));

      // 5. Construir Contexto RAG
      const contextText = relevantChunks.map(c => c.text).join("\n\n---\n\n");

      // 6. Llamar a Gemini (Modelo 2.0 Flash - Estable)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-2.0-flash", // <--- MUNICIÓN ESTABLE
        temperature: 0.7,
      });

      // 🟢 INYECCIÓN DE PROTOCOLO DE CONTINUIDAD
      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE CONTINUIDAD (DARK BROTHERHOOD) ===
OBJETIVO: Actuar como Arquitecto Narrativo y Gestor de Continuidad.

1. PUNTO DE ANCLAJE TEMPORAL (EL AHORA)
   - LIBRO ACTIVO: "${activeBook}"
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
===================================================
`;

      // 🟢 INYECCIÓN DE INSTRUCCIÓN DE REFERENCIA (COMBINADA)
      let finalSystemInstruction = systemInstruction || "";

      // Prependamos el protocolo
      finalSystemInstruction = CONTINUITY_PROTOCOL + "\n\n" + finalSystemInstruction;

      if (categoryFilter === 'reference') {
        finalSystemInstruction += "\n\nIMPORTANTE: Responde basándote EXCLUSIVAMENTE en el material de referencia proporcionado. Actúa como un tutor o experto en la materia.";
      }

      const promptFinal = `
        ${profileContext}
        ${finalSystemInstruction}

        --- HISTORIAL DE CONVERSACIÓN (MEMORIA) ---
        ${historyText}
        -------------------------------------------

        --- INFORMACIÓN RECUPERADA DEL LORE (RAG) ---
        "${contextText}"
        ---------------------------------------------

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
 * 5. GENERATE IMAGE (El Artista)
 * Genera imágenes usando Imagen 3 vía Vertex AI REST API.
 */
/**
 * 5. GENERATE IMAGE (La Forja Visual)
 * Crea imágenes usando Imagen 3 y contexto de la historia.
 */
export const generateImage = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 60, // Imagen tarda un poco
    secrets: [googleApiKey], // Necesita la API Key
  },
  async (request) => {
    initializeFirebase();
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { prompt, aspectRatio } = request.data;

    if (!prompt) throw new HttpsError("invalid-argument", "Falta el prompt.");

    // 🧠 RETRIEVE USER PROFILE (Neural Synchronization)
    const userId = request.auth.uid;
    const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
    const profile: WriterProfile = profileDoc.exists
      ? profileDoc.data() as WriterProfile
      : { style: '', inspirations: '', rules: '' };

    const styleContext = profile.style || profile.inspirations
      ? `User's preferred style: ${profile.style}. Inspirations: ${profile.inspirations}.`
      : '';

    try {
      logger.info(`🎨 [FORJA] Iniciando generación para: "${prompt}"`);

      // 1. OBTENER TOKEN DE ACCESO (CRÍTICO PARA VERTEX AI)
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      const projectId = await auth.getProjectId();

      // 2. RECUPERAR CONTEXTO VISUAL (RAG)
      // Buscamos en la historia cómo se ven los personajes mencionados
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: googleApiKey.value(),
        model: "embedding-001",
        taskType: TaskType.RETRIEVAL_QUERY,
      });
      const queryVector = await embeddings.embedQuery(prompt);

      // Búsqueda vectorial rápida (Nativa)
      const vectorQuery = db.collectionGroup("chunks")
        .where("userId", "==", userId)
        .findNearest({
          queryVector: queryVector,
          limit: 3, // Solo top 3
          distanceMeasure: 'COSINE',
          vectorField: 'embedding'
        });

      const vectorSnapshot = await vectorQuery.get();

      const contextText = vectorSnapshot.docs.map(doc => doc.data().text).join("\n\n");

      logger.info("   - Contexto recuperado:", contextText.substring(0, 50) + "...");

      // 3. MEJORAR EL PROMPT CON GEMINI (Prompt Engineering)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-2.0-flash",
        temperature: 0.7,
      });

      const enhancementPrompt = `
        ACT AS: Expert AI Art Director for a fantasy novel.
        GOAL: Convert a user request into a highly detailed visual prompt for 'Imagen 3'.
        
        USER REQUEST: "${prompt}"
        ${styleContext ? `WRITER'S STYLE: ${styleContext}` : ''}
        STORY CONTEXT (Use this to describe characters/places accurately):
        ${contextText}
        
        INSTRUCTIONS:
        - Describe the subject, lighting, style (semi-realistic anime), and composition.
        - Match the user's preferred visual style and inspirations.
        - If a known character is mentioned (like Anna), use the context to describe her appearance EXACTLY (hair, eyes, clothes).
        - Keep it under 80 words. English only.
        - OUTPUT ONLY THE PROMPT TEXT. NO "Here is the prompt:".
      `;

      const enhancementRes = await chatModel.invoke(enhancementPrompt);
      const finalPrompt = enhancementRes.content.toString().trim();

      logger.info(`   - Prompt Mejorado: "${finalPrompt}"`);

      // 4. LLAMAR A IMAGEN 3 (VERTEX AI API)
      const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          instances: [{ prompt: finalPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio || "1:1",
            // safetySettings: ... (Opcional)
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Vertex AI Error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      // La API devuelve: { predictions: [ { bytesBase64Encoded: "..." } ] }
      const base64Image = result.predictions?.[0]?.bytesBase64Encoded;

      if (!base64Image) {
        throw new Error("No se recibió imagen de Vertex AI.");
      }

      logger.info("   ✅ Imagen generada con éxito.");

      return { image: base64Image };

    } catch (error: any) {
      logger.error("💥 Error en generateImage:", error);
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
      return { sessionId, name };

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

      // 2. SINTETIZAR CON GEMINI (El Escriba)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-2.0-flash",
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

      const aiResponse = await chatModel.invoke(synthesisPrompt);
      const markdownContent = aiResponse.content.toString();

      // 3. GENERAR NOMBRE DE ARCHIVO
      // Intentamos que la IA nos dé un nombre genial.
      let fileName = "";
      try {
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

        const titleResponse = await chatModel.invoke(titlePrompt);
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

      // 3. CONFIGURAR GEMINI (MODO JUEZ)
      const chatModel = new ChatGoogleGenerativeAI({
        apiKey: googleApiKey.value(),
        model: "gemini-2.0-flash",
        temperature: 0.8, // Creatividad controlada para las personalidades
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
      // A. Configurar Gemini
      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp", // 👈 User requested specific model
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
        "${content.substring(0, 30000)}" // Limitamos a ~30k caracteres por seguridad
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
