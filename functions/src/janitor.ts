import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { handleSecureError } from "./utils/security";
import { ProjectConfig } from "./types/project";

// --- JANITOR PROTOCOL (Phase 5) ---

// 🛡️ SENTINEL CONSTANTS
const MAX_PURGE_LIMIT = 50; // Limit per batch to prevent DoS/Timeout

/**
 * SCAN VAULT HEALTH (The Auditor)
 * Scans Drive for "Ghost Files" (Empty or < 10 bytes).
 * Returns a health report.
 */
export const scanVaultHealth = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { folderId } = request.data;
    const userId = request.auth.uid;
    const db = getFirestore();

    // Note: accessToken is no longer required as we use the Robot (Service Account)

    // If no folderId provided, we can't scan effectively without scanning root?
    // We will assume the user wants to scan the Project Root (folderId).
    // If not provided, we might fail or scan 'root' (which is huge).
    if (!folderId) throw new HttpsError("invalid-argument", "Falta folderId (Project Root).");

    // 🛡️ SENTINEL: IDOR PREVENTION
    // Verify that the requested folderId belongs to the authenticated user's project configuration.
    // This prevents users from using the Janitor Robot to scan folders they don't own.
    const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

    if (!configDoc.exists) {
        throw new HttpsError("permission-denied", "Configuración de proyecto no encontrada. No puedes auditar una bóveda sin configurar el proyecto.");
    }

    const config = configDoc.data() as ProjectConfig;
    const allowedIds = new Set<string>();

    if (config.folderId) allowedIds.add(config.folderId);
    if (config.canonPaths) config.canonPaths.forEach(p => allowedIds.add(p.id));
    if (config.resourcePaths) config.resourcePaths.forEach(p => allowedIds.add(p.id));

    if (!allowedIds.has(folderId)) {
        logger.warn(`🛡️ [SENTINEL] IDOR Blocked. User ${userId} tried to scan unauthorized folder: ${folderId}`);
        throw new HttpsError("permission-denied", "Acceso denegado. Esta carpeta no está registrada en tu configuración de proyecto.");
    }

    logger.info(`🧹 [JANITOR] Iniciando escaneo de salud para: ${folderId}`);

    try {
        // 🟢 MODO ROBOT: SERVICE ACCOUNT AUTH (Application Default Credentials)
        // This ensures the "Janitor" process works independently of the user session,
        // provided the user has shared the folder with the Service Account email.
        const auth = new google.auth.GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/drive']
        });
        const drive = google.drive({ version: "v3", auth });

        // 1. QUERY DRIVE
        // Criteria: Not Trashed, Not Folder, Size < 10 bytes.
        // We scope it to the project folder?
        // Recursive query in Drive API is tricky. 'folderId' in parents only checks direct children.
        // For a full vault scan, we might need a recursive list OR rely on the fact that TDB_Index likely has the full list?
        // But the user insisted on "Backend certifies... metadatos de Drive".
        // A robust "Vault Health" should check the WHOLE project.
        // However, standard Drive search `q` doesn't support "in hierarchy of X".
        // Strategy: We can query `q: "trashed = false and size < 10 and mimeType != 'application/vnd.google-apps.folder'"`
        // AND then filtering by `parents` in our code? That's too heavy if the user has many files outside the vault.

        // ALTERNATIVE: Use the `getDriveFiles` logic (fetchFolderContents) but optimized?
        // Or just scan the current level + 1?
        // Given "Janitor" usually cleans up "Artifacts" (often created at root or specific folders),
        // let's stick to scanning the `folderId` (Project Root) and maybe one level down?
        // Actually, the Prompt says "Detectar Fantasmas...".
        // Let's rely on the query `q` with `parents` check for the ROOT folder only for now (MVP).
        // Or better: Scan TDB_Index first (Level 1) to get the list of known files, then check their metadata?
        // No, TDB doesn't have size.

        // BEST EFFORT STRATEGY:
        // Query for small files in the SPECIFIED folder (non-recursive for speed, or let user navigate).
        // The UI usually executes this in the context of the sidebar (root).
        // Let's check direct children of the root folder.

        // 🟢 FASE 6.8 FIX: Simplify Query (Remove 'size' check to avoid API Error 400)
        const query = `'${folderId}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`;

        const res = await drive.files.list({
            q: query,
            fields: "files(id, name, size)",
            pageSize: 100 // 🟢 USER MANDATE: Hard Limit 100
        });

        const allFiles = res.data.files || [];

        // 🟢 POST-PROCESSING: Filter Ghosts in Memory (Size < 10)
        // We fetch up to 100 files, then identify which ones are empty.
        const ghosts = allFiles
            .filter((f: any) => {
                const size = parseInt(f.size, 10) || 0;
                return size < 10;
            })
            .map((g: any) => ({
                id: g.id || 'unknown_id',
                name: g.name || 'Sin Nombre',
                size: g.size ? parseInt(g.size, 10) : 0
            }));

        const ghostCount = ghosts.length;
        // Simple heuristic: -5 health per ghost
        const health = Math.max(0, 100 - (ghostCount * 5));

        logger.info(`🧹 [JANITOR] Report: ${ghostCount} ghosts found. Health: ${health}%`);

        return {
            health,
            ghostCount,
            ghosts
        };

    } catch (error: any) {
        // 🟢 MANEJO DE ERROR 403/401 (ROBOT ACCESS DENIED)
        if (error.code === 403 || error.code === 401 || (error.message && error.message.includes('insufficient authentication'))) {
             throw new HttpsError('permission-denied', "El Robot de Limpieza no tiene acceso. Comparte la carpeta con la Service Account del proyecto.");
        }

        throw handleSecureError(error, "scanVaultHealth");
    }
  }
);

// Helper: Delete single artifact
async function deleteFileArtifact(drive: any, db: admin.firestore.Firestore, userId: string, fileId: string) {
    try {
        // STEP 1: DRIVE DELETE (Level 0)
        await drive.files.delete({ fileId });
        logger.info(`   -> Drive Delete OK: ${fileId}`);

        // STEP 2: FIRESTORE DELETE (Level 1)
        await db.collection("TDB_Index").doc(userId).collection("files").doc(fileId).delete();
        logger.info(`   -> Firestore Index Delete OK: ${fileId}`);

        // RECURSIVE DELETE (Chunks)
        // Ideally yes, but 'files' doc delete doesn't cascade to 'chunks' unless we do recursive.
        // Let's assume standard architecture: `TDB_Index/{uid}/files/{fileId}/chunks`.
        // So we should do recursive delete on the file doc.
        await db.recursiveDelete(db.collection("TDB_Index").doc(userId).collection("files").doc(fileId));
        logger.info(`   -> Recursive Delete OK (Chunks Cleaned).`);

        return { id: fileId, status: 'purged' };

    } catch (err: any) {
        logger.error(`   ❌ Failed to purge ${fileId}:`, err);
        return { id: fileId, status: 'error', error: err.message };
    }
}

/**
 * PURGE ARTIFACTS (The Incinerator)
 * Hard deletes files from Drive and Firestore.
 */
export const purgeArtifacts = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { fileIds, accessToken } = request.data;
    if (!fileIds || !Array.isArray(fileIds)) throw new HttpsError("invalid-argument", "Faltan fileIds.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // 🛡️ SECURITY: RESOURCE LIMIT
    if (fileIds.length > MAX_PURGE_LIMIT) {
        throw new HttpsError("resource-exhausted", `Batch limit exceeded. Max ${MAX_PURGE_LIMIT} files allowed per purge.`);
    }
    if (fileIds.length === 0) {
        throw new HttpsError("invalid-argument", "File list is empty.");
    }

    const userId = request.auth.uid;
    const db = getFirestore();

    logger.info(`🔥 [JANITOR] Ejecutando purga para ${fileIds.length} artefactos.`);

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const results = await Promise.all(fileIds.map(fileId => deleteFileArtifact(drive, db, userId, fileId)));

        return { success: true, results };

    } catch (error: any) {
        throw handleSecureError(error, "purgeArtifacts");
    }
  }
);

/**
 * PURGE EMPTY SESSIONS (The Ghostbuster Protocol)
 * Hard deletes empty or STUB (<=2 messages) sessions from Firestore.
 */
export const purgeEmptySessions = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const userId = request.auth.uid;
    const db = getFirestore();

    logger.info(`👻 [GHOSTBUSTER] Iniciando purga de sesiones cortas/vacías para: ${userId}`);

    try {
        const sessionsRef = db.collection("users").doc(userId).collection("forge_sessions");
        const snapshot = await sessionsRef.limit(500).get();
        let deletedCount = 0;

        const now = new Date();
        const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 Hours ago

        for (const doc of snapshot.docs) {
            const data = doc.data();
            let shouldPurge = false;

            // 0. SAFETY CHECK: TIME BUFFER (Protect Active Sessions)
            // If session was updated recently (last 24h), DO NOT TOUCH IT.
            const lastActiveStr = data.updatedAt || data.createdAt;
            let lastActiveDate = new Date(0); // Epoch default

            if (lastActiveStr) {
                if (typeof lastActiveStr === 'string') {
                    lastActiveDate = new Date(lastActiveStr);
                } else if (lastActiveStr.toDate) {
                    // Firestore Timestamp
                    lastActiveDate = lastActiveStr.toDate();
                }
            }

            if (lastActiveDate > cutoff) {
                // Too new, skip safe
                continue;
            }

            // 1. CHECK METADATA (Optimized Path)
            // Rule: Delete if 0 messages OR <= 2 messages (Stub: Prompt + Response)
            if (typeof data.messageCount === 'number') {
                if (data.messageCount <= 2) {
                    shouldPurge = true;
                }
            } else {
                // 2. CHECK SUBCOLLECTION (Legacy Path - Expensive)
                // If no metadata, fallback to checking if it's TRULY empty (0 messages)
                const messagesSnap = await sessionsRef.doc(doc.id).collection("messages").limit(1).get();
                if (messagesSnap.empty) {
                    shouldPurge = true;
                }
            }

            if (shouldPurge) {
                // HARD DELETE (Recursive to ensure subcollections die if any exist - e.g. orphaned stats)
                await db.recursiveDelete(sessionsRef.doc(doc.id));
                deletedCount++;
                logger.info(`   🗑️ Purged Stub Session: ${doc.id} (MsgCount: ${data.messageCount ?? 'Unknown'})`);
            }
        }

        logger.info(`👻 [GHOSTBUSTER] Purga completada. ${deletedCount} sesiones eliminadas.`);
        return { success: true, deletedCount, message: `Se eliminaron ${deletedCount} sesiones cortas o vacías.` };

    } catch (error: any) {
        throw handleSecureError(error, "purgeEmptySessions");
    }
  }
);

/**
 * PURGE FORGE ENTITIES
 * Deletes all documents in the 'forge_detected_entities' collection for the authenticated user.
 * Used to reset the Soul Forge state and remove duplicates/outdated scans.
 */
export const purgeForgeEntities = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 540,
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const uid = request.auth.uid;
        const db = getFirestore();
        const collectionRef = db.collection("users").doc(uid).collection("forge_detected_entities");

        logger.info(`🔥 PURGE: Starting full cleanup for User ${uid}`);

        try {
            // Recursive delete is supported by firebase-tools cli, but in Admin SDK
            // we usually batch delete. Since this is a subcollection, we can list and delete.
            // Note: For massive collections, this should be chunked. Assuming < 5000 entities for now.

            const snapshot = await collectionRef.get();
            if (snapshot.empty) {
                logger.info("   -> Collection already empty.");
                return { success: true, count: 0 };
            }

            const batchSize = 400;
            let batch = db.batch();
            let count = 0;
            let totalDeleted = 0;

            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                count++;

                if (count >= batchSize) {
                    await batch.commit();
                    batch = db.batch();
                    totalDeleted += count;
                    count = 0;
                }
            }

            if (count > 0) {
                await batch.commit();
                totalDeleted += count;
            }

            logger.info(`   -> Successfully deleted ${totalDeleted} entities.`);

            return { success: true, count: totalDeleted };

        } catch (error: any) {
        throw handleSecureError(error, "purgeForgeEntities");
        }
    }
);

/**
 * RELINK ANCHOR (The Medic)
 * Searches for a lost file in Drive by name and repairs the Firestore link.
 */
export const relinkAnchor = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 60,
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { characterId, characterName, accessToken, folderId, sourceContext, category, tier } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        if (!characterId || !characterName) {
            throw new HttpsError("invalid-argument", "Falta ID o Nombre del personaje.");
        }
        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

        logger.info(`🚑 [RELINK] Intentando reparar vínculo para: ${characterName} (${characterId})`);

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. SEARCH DRIVE
            // We search for exact name match (with .md extension or without)
            // Ideally we check both or just 'name contains'.
            // Let's try exact match first with .md, as Anchors are usually markdown.
            let q = `name = '${characterName}.md' and trashed = false`;

            // If folderId (Vault) is provided, scope it for safety/speed
            if (folderId) {
                // Note: 'in parents' is not recursive. But characters are usually at root of vault.
                // If deep, we skip scoping or use 'ancestors' (expensive).
                // Let's rely on name uniqueness for now globally in Drive (or at least prioritized).
                // Actually, duplicate names are possible.
                // Let's try simple name match first.
            }

            let res = await drive.files.list({
                q: q,
                fields: "files(id, name, modifiedTime, parents)",
                orderBy: "modifiedTime desc", // Get most recent
                pageSize: 5
            });

            // Fallback: Try without extension if 0 results
            if (!res.data.files || res.data.files.length === 0) {
                 q = `name = '${characterName}' and trashed = false`;
                 res = await drive.files.list({
                    q: q,
                    fields: "files(id, name, modifiedTime, parents)",
                    orderBy: "modifiedTime desc",
                    pageSize: 5
                });
            }

            const candidates = res.data.files || [];

            if (candidates.length === 0) {
                logger.warn(`   ⚠️ No se encontró ningún archivo para '${characterName}'.`);
                return { success: false, message: "No se encontró ningún archivo con ese nombre." };
            }

            // 2. SELECT BEST CANDIDATE
            // We take the most recent one (index 0 due to sort).
            const bestMatch = candidates[0];
            logger.info(`   ✅ Archivo encontrado: ${bestMatch.name} (${bestMatch.id})`);

            // 3. UPDATE FIRESTORE
            await db.collection("users").doc(userId).collection("characters").doc(characterId).set({
                masterFileId: bestMatch.id,
                lastRelinked: new Date().toISOString(),
                ...(sourceContext ? { sourceContext } : {}),
                name: characterName,
                category: category || 'PERSON',
                tier: tier || 'ANCHOR',
                sourceType: 'MASTER',
                status: 'EXISTING'
            }, { merge: true });

            return {
                success: true,
                fileId: bestMatch.id,
                fileName: bestMatch.name,
                message: "Vínculo reparado exitosamente."
            };

        } catch (error: any) {
            throw handleSecureError(error, "relinkAnchor");
        }
    }
);
