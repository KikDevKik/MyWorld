import { routedModel } from "./utils/routed_model";
import { MODEL_PRO, MODEL_FLASH, MODEL_FLASH_2_5_LITE, modelForRequest } from './ai_config';
import './admin'; // Ensure firebase-admin is initialized
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey, getTier } from "./utils/security";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { updateFirestoreTree } from "./utils/tree_utils";
import { GeminiEmbedder } from "./utils/vector_utils";
import { GoogleGenerativeAI, TaskType, SchemaType } from "./utils/genai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { textHash } from "./utils/text_hash";
import { smartGenerateContent } from "./utils/smart_generate";
import { claudeEnabledForCurrentUser, myworldClaudeAvailable, pickClaudeModel, callClaude, CLAUDE_FICTION_SYSTEM, MYWORLD_VOICE, REWRITE_RULE, monthlyCapUsd } from "./utils/claude_router";
import { fileChangeDates, dateTag, CANON_DATES_RULE } from "./utils/canon_dates";
import { sharedContext, noteAuthorMessage } from "./utils/shared_context";
import { MIRA_SYSTEM } from "./prompts/mira";
import { CRAFT_RULE, splitCraft, saveCraft, craftContext } from "./craft";
import { planContext } from "./plan_context";
import { getMemoryContext } from "./utils/memory_store";
import { parseSecureJSON } from "./utils/json";
import { ingestFile, deleteFileVectors, IngestionFile } from './ingestion';
import * as crypto from 'crypto';




// --- QUOTA ERROR DETECTION ---
function isQuotaError(e: any): boolean {
    return (
        e?.status === 429 ||
        e?.message?.includes('429') ||
        e?.message?.includes('RESOURCE_EXHAUSTED') ||
        e?.message?.toLowerCase().includes('quota') ||
        e?.message?.includes('Too Many Requests')
    );
}
const QUOTA_USER_MESSAGE = "⚠️ Cuota de API Agotada: Tu plan gratuito de Google AI Studio alcanzó el límite diario. Las cuotas se restablecen automáticamente cada 24 horas. Mientras tanto, configura tu propia API Key en Preferencias → Configuración de IA para continuar sin interrupciones.";

// --- RE-EXPORTS (Modular Architecture) ---
export { genesisManifest } from './genesis';

export { exchangeAuthCode, loginWithGoogleCode, refreshDriveToken, revokeDriveAccess } from './auth';
export { auditContent, purgeEcho, scanProjectDrift, rescueEcho, auditGlobal } from './guardian';
export { deleteMyData } from './delete_my_data';
export { scribeCreateFile, integrateNarrative, scribePatchFile } from './scribe';
export { syncSmart } from './sync_smart'; // Oct 2026: sincronización real Drive/Obsidian ↔ índice
import { getTranslation } from './backend_i18n';
export {
  discoverFolderRoles,
  createTitaniumStructure,
  renameDriveFolder,
  trashDriveItems,
  getBatchDriveMetadata,
  getFileSystemNodes,
  createDriveFolder,
  moveDriveFile
} from './folder_manager';
export { nukeProject, purgeForgeDatabase } from './nuke';
export {
  scanVaultHealth,
  purgeArtifacts,
  purgeEmptySessions,
  purgeForgeEntities,
  relinkAnchor
} from './janitor';
export { checkIndexStatus } from './librarian';
export { generateAuditPDF, generateCertificate } from './audit';
export { analyzeStyleDNA } from './analyst';
export { arquitectoInitialize, arquitectoChat, arquitectoAnalyze, arquitectoRecalculateCards, arquitectoGenerateRoadmap, arquitectoResolvePendingItem, arquitectoGenerateRoadmapFinal, arquitectoApplyPatch, arquitectoRejectPatch, arquitectoCerrarSesion } from './architect';
// export { distillResourceOnIndex } from './distillation_trigger'; // 🟢 NEW: Trigger para Recursos (Desactivado: backfill hace todo)
export { backfillResourcesFromDrive } from './backfill'; // 🟢 NEW: Sistema de Backfill (Golden Fix)
export { distillResource } from './distill'; // 🟢 NEW: Destilación Poco a Poco (Bajo demanda)

export { generateSpeech, analyzeScene } from "./tts";
export { classifyEntities } from './soul_sorter';
export { analyzeNexusFile } from './nexus_scan';
export { forgeChatStream } from './forge_chat';
export { updateMemory, undoMemory, getMemory, editMemory } from './memory'; // Oct 2026: Memoria de MyWorld
export { chapterReport } from './chapter_report'; // Oct 2026: Reporte de capítulo
export { worldNames } from './world_names'; // Nov 2026: Revisión del canon (nombres y documentos repetidos)
export { miraTaller } from './mira_taller'; // Nov 2026: la biblioteca (aprender y practicar con Mira)
export { chatWithGem } from './mira_chat'; // Nov 2026: la conversación de Mira
export { whatIf } from './whatif'; // Oct 2026: «Qué pasaría si» (ideas no canon)
export { personajes } from './personajes'; // Oct 2026: Personajes (antes: la Forja)
export { mapaMundo } from './mapa'; // Oct 2026: Mapa del mundo (antes: Nexus)
// export { distillResourceOnIndex } from './distillation_trigger'; // Desactivado: backfill hace todo



// --- CORE HANDLERS (Bridge) ---

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY"); // Oct 2026: Claude pagado por MyWorld
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
    secrets: [googleApiKey, anthropicApiKey],
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { title, content, folderId, accessToken, plain } = request.data;
    if (!title || !content || !folderId) {
      throw new HttpsError("invalid-argument", "Faltan argumentos (title, content, folderId).");
    }

    if (typeof content === 'string' && content.length > MAX_FILE_SAVE_BYTES) {
      throw new HttpsError("resource-exhausted", `Content exceeds limit of ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
    }

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    const userId = request.auth.uid;

    logger.info(`🔨 TOOL EXECUTION: Creating file '${title}' in ${folderId}`);

    // Nov 2026: un capítulo o documento nuevo hecho por el autor («Nuevo» en tus documentos) es solo texto.
    // Antes pasaba por la ficha de entidad: le ponía metadatos en inglés («Role: Tool Generated», «Traits: …»)
    // y una entrada en el índice sin carpeta (aparecía repetido). Ahora se crea tal cual; se indexa al guardarlo.
    if (plain) {
      try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });
        const fileName = /\.md$/i.test(String(title)) ? String(title) : `${title}.md`;
        const file = await drive.files.create({
          requestBody: { name: fileName, parents: [folderId], mimeType: "text/markdown" },
          media: { mimeType: "text/markdown", body: String(content) },
          fields: "id, name, webViewLink",
        });
        const newId = file.data.id;
        if (!newId) throw new Error("Drive no devolvió el archivo.");
        await updateFirestoreTree(userId, "add", newId, {
          parentId: folderId,
          newNode: { id: newId, name: fileName, mimeType: "text/markdown", driveId: newId, type: "file" },
        });
        return { success: true, fileId: newId, webViewLink: file.data.webViewLink, message: `Archivo '${title}' creado.` };
      } catch (error: any) {
        logger.error("Plain file creation failed:", error);
        throw new HttpsError("internal", error?.message || "No se pudo crear el archivo.");
      }
    }

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

/** Nov 2026: crea o corrige la entrada del índice de un archivo (carpeta real, categoría) y borra entradas fantasma.
 *  Devuelve true si cambió algo (para re-indexar ya). */
async function repairIndexEntry(db: FirebaseFirestore.Firestore, drive: any, uid: string, fileId: string, current: any | null): Promise<boolean> {
  const files = db.collection("TDB_Index").doc(uid).collection("files");
  let changed = false;
  try {
    const ghosts = await files.where("driveId", "==", fileId).limit(5).get();
    for (const g of ghosts.docs) if (g.id !== fileId) { await g.ref.delete(); changed = true; }
  } catch { /* sin índice por driveId: no pasa nada */ }
  const pathHasFolder = current && String(current.path || "").includes("/");
  if (current && (pathHasFolder || current.parentId)) return changed;
  try {
    const meta = await drive.files.get({ fileId, fields: "id,name,parents,mimeType" });
    const name = String(meta.data.name || current?.name || "");
    const parentId = meta.data.parents?.[0];
    if (!name || !parentId) return changed;
    const parent = await files.doc(parentId).get();
    if (!parent.exists && !current) return changed; // fuera de las carpetas del proyecto: no se indexa
    const p: any = parent.exists ? parent.data() : {};
    const path = parent.exists ? `${p.path || p.name}/${name}` : (current?.path || name);
    await files.doc(fileId).set({
      name, path, parentId, driveId: fileId, category: p.category || current?.category || "canon",
      saga: p.saga || current?.saga || "Global", mimeType: meta.data.mimeType || "text/markdown",
      ...(current ? {} : { lastIndexed: new Date(0).toISOString() }),
    }, { merge: true });
    return true;
  } catch (e: any) {
    logger.warn(`[SAVE] No se pudo reparar la entrada del índice de ${fileId}: ${e?.message}`);
    return changed;
  }
}

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
    secrets: [googleApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
    const { fileId, content, accessToken, baseHash, force } = request.data;
    if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId.");
    if (!content) throw new HttpsError("invalid-argument", "Missing content.");
    if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken.");

    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const drive = google.drive({ version: "v3", auth });

      // Oct 2026: no pisar cambios hechos fuera de MyWorld (Obsidian, otra pestaña).
      // Si el archivo en Drive ya no es la versión que el editor abrió, no se guarda
      // y se devuelve la versión de Drive para que el autor elija.
      if (baseHash && !force) {
        try {
          const remote = await _getDriveFileContentInternal(drive, fileId);
          const remoteHash = textHash(remote);
          if (remoteHash !== baseHash && remoteHash !== textHash(content)) {
            logger.warn(`⚠️ [SAVE] Conflicto en ${fileId}: Drive cambió desde que se abrió. No se guarda.`);
            return { success: false, conflict: true, remoteContent: remote };
          }
        } catch (checkErr: any) {
          logger.warn(`[SAVE] No se pudo comprobar la versión de Drive; guardo igual: ${checkErr?.message}`);
        }
      }

      await drive.files.update({
        fileId: fileId,
        media: {
          mimeType: 'text/markdown',
          body: content
        }
      });

      logger.info(`💾 [SAVE] File updated: ${fileId}`);

      // Oct 2026: re-indexar el archivo guardado para que el Director/Arquitecto lean la versión
      // actual (antes solo se actualizaba al pulsar "Indexar"). Como mucho cada 10 min por archivo
      // para no gastar la cuota de embeddings con el autoguardado; "Memoria del autor" siempre.
      try {
        const db = getFirestore();
        const fileRef = db.collection("TDB_Index").doc(request.auth.uid).collection("files").doc(fileId);
        let fSnap = await fileRef.get();
        // Nov 2026: un capítulo creado desde «Nuevo» no tenía entrada en el índice y el Arquitecto no lo leía nunca.
        // Las fichas antiguas dejaban además una entrada fantasma (con otra clave) y la ruta sin carpeta («raíz»).
        // Al guardar se arregla: se crea o corrige la entrada con su carpeta real y se borran los fantasmas.
        const repaired = await repairIndexEntry(db, drive, request.auth.uid, fileId, fSnap.exists ? fSnap.data() : null);
        if (repaired) { fSnap = await fileRef.get(); }
        if (fSnap.exists) {
          const f: any = fSnap.data();
          const isAuthorMemory = /^memoria del autor\.md$/i.test(f.name || '');
          const last = f.lastIndexed ? new Date(f.lastIndexed).getTime() : 0;
          // Nov 2026: cada 3 min (antes 10): el Arquitecto no veía lo escrito hace un rato en un capítulo nuevo.
          if (isAuthorMemory || repaired || Date.now() - last > 3 * 60 * 1000) {
            const embedder = new GeminiEmbedder({
              apiKey: getAIKey(request.data, googleApiKey.value()),
              model: "gemini-embedding-001",
              taskType: TaskType.RETRIEVAL_DOCUMENT,
            });
            const cfg = await db.collection("users").doc(request.auth.uid).collection("profile").doc("project_config").get();
            const res = await ingestFile(db, request.auth.uid, cfg.data()?.folderId || "unknown_project", {
              id: fileId, name: f.name, path: f.path || f.name, saga: f.saga, parentId: f.parentId,
              category: f.category, mimeType: f.mimeType || 'text/markdown',
            }, content, embedder);
            await fileRef.set({ lastIndexed: new Date().toISOString() }, { merge: true });
            logger.info(`🔄 [SAVE] Re-indexado ${f.name}: ${res.status}`);
          }
        }
      } catch (reindexErr: any) {
        logger.warn(`[SAVE] Guardado OK, pero no se pudo re-indexar: ${reindexErr?.message}`);
      }

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

// (Nov 2026: se retiró importDriveFiles: ninguna pantalla lo usaba)
const ALLOWED_MIMETYPES = new Set([
    // Google Docs nativos
    'application/vnd.google-apps.document',
    // Markdown y texto
    'text/markdown',
    'text/plain',
    'text/x-markdown',
    // Word
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // PDF
    'application/pdf',
    // Imágenes de referencia
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
]);

const BLOCKED_EXTENSIONS = new Set([
    '.ds_store',
    '.ini',
    '.json',
    '.yaml',
    '.yml',
    '.xml',
    '.log',
    '.lock',
    '.gitignore',
    '.obsidian',
    '.scrivx',
    '.bak',
    '.tmp',
    '.exe',
    '.sh',
    '.bat',
    '.zip',
    '.tar',
    '.gz',
]);

function isAllowedFile(fileName: string, mimeType: string): boolean {
    // Bloquear por extensión primero (más rápido)
    const ext = '.' + fileName.split('.').pop()?.toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return false;

    // Bloquear archivos ocultos (empiezan con punto)
    if (fileName.startsWith('.')) return false;

    // Permitir por mimeType
    if (ALLOWED_MIMETYPES.has(mimeType)) return true;

    // Para tipos no reconocidos: bloquear por seguridad
    // (mejor perder un archivo raro que copiar basura)
    logger.info(`[Import] Archivo ignorado: ${fileName} (${mimeType})`);
    return false;
}

/**
 * Copia recursivamente una carpeta origen a una carpeta destino,
 * recreando la estructura jerárquica completa.
 */
async function copyFolderRecursive(
    readDrive: any,
    writeDrive: any,
    sourceFolderId: string,
    targetFolderId: string,
    stats: { copied: number; skipped: number; errors: string[] }
): Promise<void> {
    
    // Listar contenido de la carpeta origen
    let pageToken: string | undefined;
    do {
        const res = await readDrive.files.list({
            q: `'${sourceFolderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType)',
            pageSize: 100,
            pageToken,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        for (const file of res.data.files || []) {
            
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                // Es una subcarpeta — crearla en destino y recursar
                try {
                    const newFolder = await writeDrive.files.create({
                        requestBody: {
                            name: file.name!,
                            mimeType: 'application/vnd.google-apps.folder',
                            parents: [targetFolderId],
                        },
                        fields: 'id',
                        supportsAllDrives: true
                    });
                    
                    // Recursar dentro de la subcarpeta recién creada
                    if (newFolder.data.id) {
                        await copyFolderRecursive(
                            readDrive,
                            writeDrive,
                            file.id!,
                            newFolder.data.id,
                            stats
                        );
                    }
                } catch (err: any) {
                    logger.error(`[Import] Error creando subcarpeta ${file.name}:`, err.message);
                    stats.errors.push(file.name!);
                }
                
            } else {
                // Es un archivo — aplicar filtro y copiar
                if (!isAllowedFile(file.name!, file.mimeType!)) {
                    stats.skipped++;
                    continue;
                }
                
                try {
                    await writeDrive.files.copy({
                        fileId: file.id!,
                        requestBody: {
                            name: file.name!,
                            parents: [targetFolderId],
                        },
                        supportsAllDrives: true
                    });
                    stats.copied++;
                } catch (err: any) {
                    logger.error(`[Import] Error copiando ${file.name}:`, err.message);
                    stats.errors.push(file.name!);
                }
            }
        }

        pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
}

/**
 * Obtiene o crea la subcarpeta de rol dentro de la raíz del proyecto.
 * Canon → /CANON, Recurso → /RECURSOS, Raíz → directamente en la raíz
 */
async function getOrCreateRoleFolder(
    writeDrive: any,
    projectRootId: string,
    role: 'canon' | 'resource' | 'root',
    lang: string = 'es'
): Promise<string> {
    if (role === 'root') return projectRootId;

    const folderName = role === 'canon' ? getTranslation(lang, 'folders', 'canon') : getTranslation(lang, 'folders', 'resources');

    // Buscar si ya existe la subcarpeta de rol
    const existing = await writeDrive.files.list({
        q: `name='${folderName}' and '${projectRootId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
    });

    if (existing.data.files?.length) {
        return existing.data.files[0].id!;
    }

    // No existe — crear la subcarpeta de rol
    const created = await writeDrive.files.create({
        requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [projectRootId],
        },
        fields: 'id',
        supportsAllDrives: true,
    });

    return created.data.id!;
}

// (Nov 2026: se retiró importDriveFolder: ninguna pantalla lo usaba)
/**
 * IMPORT PICKED FILES (Nov 2026)
 * Copia al proyecto los archivos que el autor eligió en el selector de Google. Con drive.file,
 * MyWorld puede leer exactamente esos archivos (y nada más del Drive), así que basta el token de
 * sesión: ya no hace falta el permiso restringido drive.readonly.
 */
export const importPickedFiles = onCall(
  { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, timeoutSeconds: 300, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
    const { files, role, groupName, projectRootId, sessionToken } = request.data || {};
    if (!sessionToken) throw new HttpsError("invalid-argument", "Falta el permiso de Drive. Vuelve a entrar.");
    if (!projectRootId) throw new HttpsError("invalid-argument", "Falta la carpeta del proyecto.");
    const list: { id: string; name: string; mimeType?: string }[] = Array.isArray(files) ? files.slice(0, 200) : [];
    if (!list.length) throw new HttpsError("invalid-argument", "No elegiste archivos.");

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: sessionToken });
    const drive = google.drive({ version: "v3", auth });

    const target = await getOrCreateRoleFolder(drive, projectRootId, (role === "canon" || role === "resource") ? role : "root", request.data._lang || "es");
    const name = String(groupName || "").trim().slice(0, 120) || `Traído de mi Drive ${new Date().toISOString().slice(0, 10)}`;
    const folder = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [target] },
      fields: "id", supportsAllDrives: true,
    });
    const folderId = folder.data.id!;

    const stats = { copied: 0, skipped: 0, errors: [] as string[] };
    for (const f of list) {
      if (!f?.id || !isAllowedFile(String(f.name || ""), String(f.mimeType || ""))) { stats.skipped++; continue; }
      try {
        await drive.files.copy({ fileId: f.id, requestBody: { name: f.name, parents: [folderId] }, supportsAllDrives: true });
        stats.copied++;
      } catch (err: any) {
        logger.warn(`[ImportFiles] No pude copiar ${f.name}: ${err?.message}`);
        stats.errors.push(String(f.name || f.id));
      }
    }
    return { success: true, copied: stats.copied, skipped: stats.skipped, errors: stats.errors, createdFolder: { id: folderId, name } };
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

        // 🛡️ SANITIZACIÓN CRÍTICA: Nunca persistir claves en Firestore
        const sanitizedData = { ...request.data };
        delete sanitizedData._authOverride;
        delete sanitizedData.customGeminiKey;
        delete sanitizedData.apiKey;
        delete sanitizedData.accessToken; // El token de Drive tampoco

        try {
            await db.collection("users").doc(userId)
                .collection("profile").doc("project_config")
                .set({
                    ...sanitizedData,
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
 * MUSE MESSAGE MANAGEMENT & META-RAG
 */
export const addMuseMessage = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleApiKey, anthropicApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
    const { sessionId, role, text } = request.data;
    const userId = request.auth.uid;
    const db = getFirestore();

    try {
      const sessionRef = db.collection("users").doc(userId).collection("muse_sessions").doc(sessionId);
      await sessionRef.collection("messages").add({
        role,
        text,
        timestamp: FieldValue.serverTimestamp()
      });

      // Update session heartbeat and preview
      await sessionRef.set({
        lastActivity: FieldValue.serverTimestamp(),
        preview: text.substring(0, 100)
      }, { merge: true });

      // 🟢 META-RAG GENERATION: Trigger on AI response
      // Oct 2026: con Claude activo, la Memoria de MyWorld reemplaza este resumen (gastaba una llamada extra por mensaje).
      if ((role === 'model' || role === 'ia') && !claudeEnabledForCurrentUser()) {
        // Perform async background update (don't await to keep UI fast)
        // Actually, in Cloud Functions we should await or use a separate trigger.
        // For reliability in this surgical update, we'll do it here but catch errors.
        try {
          const messagesSnap = await sessionRef.collection("messages").orderBy("timestamp", "desc").limit(10).get();
          const fullText = messagesSnap.docs.reverse().map(m => `[${m.data().role}]: ${m.data().text}`).join("\n");

          const finalKey = getAIKey(request.data, googleApiKey.value());
          const genAI = new GoogleGenerativeAI(finalKey);
          const museTier = getTier(request.data);

          const summaryPrompt = `Resume esta conversación de MyWorld en una sola frase técnica que capture la esencia creativa, los personajes discutidos y el tema. Úsalo para búsqueda semántica futura.\n\nCONVERSACIÓN:\n${fullText}`;
          const summaryRes = await smartGenerateContent(genAI, summaryPrompt, { _tier: museTier, taskType: 'standard', contextLabel: 'MuseMetaRAG' });
          const summary = summaryRes.text || "";

          const embeddings = new GeminiEmbedder({ apiKey: finalKey, model: "gemini-embedding-001" });
          const vector = await embeddings.embedQuery(summary);

          await sessionRef.set({
            summary: summary,
            embedding: vector,
            vectorizedAt: FieldValue.serverTimestamp()
          }, { merge: true });

          logger.info(`🧠 Meta-RAG Updated for session ${sessionId}`);
        } catch (e) {
          logger.error("💥 Failed to update Meta-RAG:", e);
        }
      }

      return { success: true };
    } catch (error: any) {
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
      // Nov 2026: la lista de conversaciones muestra de qué se habló y cuántos mensajes hay (antes «…» y «- msgs»).
      const clean = String(text || "").replace(/^\s*\[mira:[a-záéíóú]+\]\s*/i, "").replace(/\s+/g, " ").trim();
      const extra: Record<string, any> = { lastActivity: FieldValue.serverTimestamp(), updatedAt: new Date().toISOString(), messageCount: FieldValue.increment(1) };
      if (clean) extra.lastMessageSnippet = clean.slice(0, 160);
      if (role === "user" && clean && !clean.startsWith("[")) {
        const snap = await sessionRef.get();
        if (!(snap.data() as any)?.firstUserMessage) extra.firstUserMessage = clean.slice(0, 140);
      }
      await sessionRef.set(extra, { merge: true });

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
    timeoutSeconds: 1800, // Oct 2026: el regulador de embeddings (100/min gratis) alarga la indexación
    secrets: [googleApiKey, anthropicApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { folderIds, projectId, accessToken, forceFullReindex } = request.data;
    const userId = request.auth.uid;
    const db = getFirestore();

    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");
    // 🟢 DECENTRALIZED V3: projectId is no longer strictly mandatory if folderIds exist
    // However, it's used to namespace things. If missing, we use a fallback.
    const effectiveProjectId = projectId || "decentralized-project";

    if (!folderIds || !Array.isArray(folderIds) || folderIds.length === 0) {
      throw new HttpsError("invalid-argument", "Falta folderIds (array).");
    }

    logger.info(`🧠 [INDEX TDB] Iniciando indexación REAL para ${userId}. Carpetas: ${folderIds.length}`);

    // Oct 2026: estado visible para la app. Si el navegador deja de esperar (5 min),
    // la app lee este documento para saber si sigue indexando o si falló de verdad.
    const statusRef = db.collection("users").doc(userId).collection("profile").doc("index_status");
    const setStatus = (data: any) => statusRef.set({ ...data, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
    await setStatus({ state: 'running', done: 0, total: 0, missingVectors: 0, startedAt: new Date().toISOString(), message: null, error: null });

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
            // 🟢 V3 FIX: MUST include the folder itself so the UI tree can render it!
            files.push({
              id: item.id,
              name: item.name, // Just the name for folders in tree
              path: itemPath,
              parentId: folderId, // Immediate parent
              category: category,
              mimeType: item.mimeType
            });
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
                id: item.id!,
                name: item.name!,
                path: itemPath,
                parentId: folderId, // 🟢 V3 FIX: Associate file with its parent folder
                category: category,
                mimeType: item.mimeType || 'text/markdown'
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
    await setStatus({ total: allFiles.length });

    if (allFiles.length === 0) {
      await setStatus({ state: 'done', message: "No se encontraron archivos para indexar.", finishedAt: new Date().toISOString() });
      return { success: true, message: "No se encontraron archivos para indexar.", count: 0 };
    }

    // 4. INDEXAR EN BATCHES (de 5 en 5 para evitar rate limits)
    const BATCH_SIZE = 5;
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let missingVectors = 0;
    const allVectors: number[][] = [];

    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (file) => {
        try {
          let content = "";
          const isFolder = file.mimeType === 'application/vnd.google-apps.folder';

          if (!isFolder) {
            // Descargar contenido desde Drive
            content = await _getDriveFileContentInternal(drive, file.id);

            if (!content || content.length < 10) {
              logger.warn(`⚠️ [INDEX TDB] Archivo vacío ignorado: ${file.name}`);
              skipped++;
              return;
            }
          }

          // Invocar la función real de ingesta
          const result = await ingestFile(
            db,
            userId,
            effectiveProjectId,
            file,
            content,
            embeddingsModel
          );

          if (result.status === 'processed') {
            processed++;
            if (result.vectorsMissing) missingVectors++;
            // Guardar el vector para calcular el centroide después
            try {
              const chunkRef = db.collection("TDB_Index").doc(userId)
                .collection("files").doc(file.id)
                .collection("chunks").doc("chunk_0");
              const chunkSnap = await chunkRef.get();
              if (chunkSnap.exists) {
                const embeddingData = chunkSnap.data()?.embedding;
                // VectorValue (FieldValue.vector) expone toArray(); los arrays antiguos, .values
                const arr = typeof embeddingData?.toArray === 'function' ? embeddingData.toArray() : embeddingData?.values;
                if (Array.isArray(arr) && arr.length > 0) {
                  allVectors.push(arr);
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
      await setStatus({ done: Math.min(i + BATCH_SIZE, allFiles.length), missingVectors });

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

    const message = `Indexación completa: ${processed} procesados, ${skipped} sin cambios, ${errors} errores.`
      + (missingVectors > 0 ? ` ${missingVectors} archivos quedaron sin vector por el límite de la IA gratuita: vuelve a indexar más tarde para completarlos.` : '');
    logger.info(`✅ [INDEX TDB] ${message}`);
    await setStatus({ state: 'done', done: allFiles.length, missingVectors, message, finishedAt: new Date().toISOString() });

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

import { EntityRepository } from "./repository/EntityRepository";

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
    secrets: [googleApiKey, anthropicApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

    let { text, context, fileId, accessToken } = request.data;
    const userId = request.auth.uid;

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
    const tier = getTier(request.data);

    // Oct 2026: voz de MyWorld (directa, razonada, accionable). Se conservan los tres jueces y el JSON.
    const JUDGE_PROMPT = (role: string, persona: string, focus: string) => `
Eres ${persona}, uno de los tres lectores del Tribunal de MyWorld. Lees un texto de ficción del autor y das tu evaluación desde tu enfoque.
ROL: ${role}

CONTEXTO (lo da el autor):
"${safeContext || 'Sin contexto adicional.'}"

TEXTO A EVALUAR:
"""${safeText}"""

TU ENFOQUE: ${focus}

CÓMO HABLAS:
- Directo y llano, como un editor que conoce el oficio. Nada de frases grandilocuentes, insultos ni teatro.
- Cada afirmación va con su motivo y, cuando puedas, con una cita breve del texto entre «».
- Si algo funciona, dilo y explica por qué; si no, di qué hacer, sin reescribirle la prosa.
- Responde en el mismo idioma del texto. Nada genérico: todo sobre ESTE texto.

FORMATO: responde SOLO JSON:
{
  "verdict": "Una frase clara con tu conclusión principal.",
  "critique": "3-5 frases: qué funciona o falla, por qué (con citas) y qué haría el autor a continuación.",
  "score": 7
}
`;

    try {
      const [architectResult, bardResult, haterResult] = await Promise.all([
        smartGenerateContent(genAI, JUDGE_PROMPT(
          'EL ARQUITECTO',
          'El Arquitecto — lector de estructura y lógica',
          'Estructura, coherencia de la trama, ritmo y lógica interna. Señala huecos y escenas que no se sostienen.'
        ), { _tier: tier, taskType: 'deep_analysis', jsonMode: true, temperature: 0.4, contextLabel: 'TribunalArchitect' }),

        smartGenerateContent(genAI, JUDGE_PROMPT(
          'EL BARDO',
          'El Bardo — lector de voz, prosa y emoción',
          'Calidad de la prosa, voz, emoción, imágenes y naturalidad de los diálogos. Señala lo que funciona y lo que se cae.'
        ), { _tier: tier, taskType: 'deep_analysis', jsonMode: true, temperature: 0.6, contextLabel: 'TribunalBard' }),

        smartGenerateContent(genAI, JUDGE_PROMPT(
          'EL HATER',
          'El Hater — el lector exigente que no perdona',
          'Lo débil, lo cliché, lo confuso o lo olvidable: dónde exactamente dejaría de leer un lector exigente y por qué. Duro con el texto, nunca con el autor.'
        ), { _tier: tier, taskType: 'deep_analysis', jsonMode: true, temperature: 0.8, contextLabel: 'TribunalHater' }),
      ]);

      const parseJudge = (result: any, fallbackName: string) => {
        if (result.error === 'QUOTA_EXCEEDED') {
          return { verdict: 'Cuota API agotada.', critique: QUOTA_USER_MESSAGE, score: 0 };
        }
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

      const finalVerdict = {
        architect: parseJudge(architectResult, 'TribunalArchitect'),
        bard: parseJudge(bardResult, 'TribunalBard'),
        hater: parseJudge(haterResult, 'TribunalHater'),
      };

      // 🟢 ECS PERSISTENCE: Save verdicts to WorldEntity if we have a fileId
      if (fileId) {
        const db = getFirestore();
        const entitiesRef = db.collection("users").doc(userId).collection("WorldEntities");
        const querySnap = await entitiesRef.where("driveFileId", "==", fileId).limit(1).get();

        if (!querySnap.empty) {
          const entityId = querySnap.docs[0].id;
          await EntityRepository.upsertEntity(userId, entityId, {
            modules: {
              judgement: {
                tribunalVerdicts: {
                  architect: JSON.stringify(finalVerdict.architect),
                  bard: JSON.stringify(finalVerdict.bard),
                  hater: JSON.stringify(finalVerdict.hater)
                },
                lastJudgedAt: new Date().toISOString()
              }
            }
          });
          logger.info(`✅ [TRIBUNAL] Verdict persisted for entity ${entityId}`);
        }
      }

      return finalVerdict;

    } catch (error: any) {
      if (isQuotaError(error)) {
        logger.warn("⚠️ [QUOTA] Cuota API agotada en summonTheTribunal:", error?.message);
        throw new HttpsError("resource-exhausted", QUOTA_USER_MESSAGE);
      }
      logger.error("[TRIBUNAL] Session failed:", error);
      throw new HttpsError("internal", error.message || "El Tribunal colapsó.");
    }
  }
);


// --- RECOVERED FUNCTIONS FROM MAIN ---

// @ts-nocheck
import { MAX_CHAT_MESSAGE_LIMIT, MAX_AI_INPUT_CHARS, MAX_SESSION_NAME_CHARS, TEMP_CREATIVE, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE, FolderRole, FinishReason, WriterProfile, AnyTypeHack, _getProjectConfigInternal, maskLog, extractUrls, fetchWebPageContent, matter, marked, sanitizeHtml, JSDOM, htmlToPdfmake, handleSecureError, appendToSessionLog, resolveDriveFolder, fetchFolderContents, flattenFileTree, createProjectCache, getFolderIdForRole, SecretManagerServiceClient, admin } from "./utils/legacy_stubs";


// La conversación de Mira (chatWithGem) vive en ./mira_chat.
// (Nov 2026: se retiró compileManuscript: ninguna pantalla lo usaba)
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
    secrets: [googleApiKey, anthropicApiKey],
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
      const model = routedModel(genAI, {
        model: modelForRequest(MODEL_FLASH, request.data),
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        generationConfig: {
          temperature: TEMP_PRECISION,
          responseMimeType: "application/json"
        }
      }, undefined, "TimelineExtract");

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

// (Nov 2026: se retiró worldEngine: ninguna pantalla lo usaba)
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
    secrets: [googleApiKey, anthropicApiKey],
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
      // The user wants "Pro" to have the memory. So we should target 'gemini-3.1-pro-preview'.
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

// (Nov 2026: se retiró enrichCharacterContext: ninguna pantalla lo usaba)
/**
 * CRYSTALLIZE NODE (La Materialización)
 * Convierte un nodo efímero en un archivo persistente en Drive.
 */
export const crystallizeNode = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    secrets: [googleApiKey, anthropicApiKey],
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
    secrets: [googleApiKey, anthropicApiKey],
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
      const model = routedModel(genAI, {
        model: modelForRequest(MODEL_FLASH, request.data),
        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
        generationConfig: {
          temperature: TEMP_PRECISION, // Analítico
        } as any
      }, undefined, "ForgeAnalyzer");

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
           - IF ENGLISH: Write 'report_summary' in English.
           - IF SPANISH: Write 'report_summary' in Spanish.
           - IF OTHER: Match the language.
        3. STRICT CONSTRAINT: The 'report_summary' MUST match the MANUSCRIPT LANGUAGE. Do not default to English if the text is Spanish.

        Directiva de Personalidad (Spanish Override):
        "Si el texto del manuscrito está en Español, TU RESPUESTA en 'report_summary' DEBE ser en Español. Habla en segunda persona, cercano y claro (sin títulos ni rangos)."

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
           - A brief, friendly summary addressed to the author in second person (no titles or ranks).
           - Highlight key findings (e.g., "I found 3 new characters", "Megu appears in 4 scenes").
           - Suggest immediate actions (e.g., "Should we create a sheet for 'The Baker'?").
           - REMEMBER: Write this summary in the language of the document.

        OUTPUT FORMAT (JSON STRICT):
        {
          "report_summary": "I read your draft... (IN DETECTED LANGUAGE)",
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

      // 🟢 ECS PERSISTENCE: Save Inspector Report to WorldEntity
      if (fileId) {
        const entitiesRef = db.collection("users").doc(userId).collection("WorldEntities");
        const querySnap = await entitiesRef.where("driveFileId", "==", fileId).limit(1).get();

        if (!querySnap.empty) {
          const entityId = querySnap.docs[0].id;
          await EntityRepository.upsertEntity(userId, entityId, {
            modules: {
              judgement: {
                lastInspectorReport: JSON.stringify(parsed),
                lastJudgedAt: new Date().toISOString()
              }
            }
          });
          logger.info(`✅ [INSPECTOR] Report persisted for entity ${entityId}`);
        }
      }

      return parsed;

    } catch (error: any) {
      throw handleSecureError(error, "forgeAnalyzer");
    }
  }
);

// (Nov 2026: se retiró syncCharacterManifest: ninguna pantalla lo usaba)
// (Nov 2026: se retiró checkSentinelIntegrity: ninguna pantalla lo usaba)
/**
 * Oct 2026: estado de la IA para la pantalla "Config IA".
 * Indica si esta cuenta usa Claude pagado por MyWorld y cuánto lleva gastado este mes (estimado).
 */
export const getAIStatus = onCall(
  { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
    const claudeActive = claudeEnabledForCurrentUser();
    // Oct 2026 (3 niveles): si la cuenta tiene Claude incluido (nivel MyWorld) y lo gastado con cada opción.
    const myworldAvailable = myworldClaudeAvailable(request.auth.uid);
    const month = new Date().toISOString().slice(0, 7);
    const u: any = (await getFirestore().collection("users").doc(request.auth.uid).collection("ai_usage").doc(month).get()).data() || {};
    return {
      claudeActive, myworldAvailable,
      // Beta cerrada: ¿MyWorld tiene su propia clave para buscar en el canon de las cuentas invitadas?
      systemSearchKey: !!String(googleApiKey.value() || "").trim(),
      monthCostUsd: u.costUsd || 0, calls: u.calls || 0, byFeature: u.byFeature || {}, byTool: u.byTool || {}, byDay: u.byDay || {},
      byokCostUsd: u.byokCostUsd || 0, byokCalls: u.byokCalls || 0,
      capUsd: monthlyCapUsd(), conversationModel: "Claude Sonnet 5.5", taskModel: "Claude Haiku 5.5",
    };
  }
);
