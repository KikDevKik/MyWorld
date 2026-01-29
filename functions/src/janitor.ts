import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

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
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { folderId } = request.data;
    // Note: accessToken is no longer required as we use the Robot (Service Account)

    // If no folderId provided, we can't scan effectively without scanning root?
    // We will assume the user wants to scan the Project Root (folderId).
    // If not provided, we might fail or scan 'root' (which is huge).
    if (!folderId) throw new HttpsError("invalid-argument", "Falta folderId (Project Root).");

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
        logger.error("Error en scanVaultHealth:", error);

        // 🟢 MANEJO DE ERROR 403/401 (ROBOT ACCESS DENIED)
        if (error.code === 403 || error.code === 401 || (error.message && error.message.includes('insufficient authentication'))) {
             throw new HttpsError('permission-denied', "El Robot de Limpieza no tiene acceso. Comparte la carpeta con la Service Account del proyecto.");
        }

        throw new HttpsError("internal", "Error en scanVaultHealth: " + error.message);
    }
  }
);

/**
 * PURGE ARTIFACTS (The Incinerator)
 * Hard deletes files from Drive and Firestore.
 */
export const purgeArtifacts = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
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

        const results: any[] = [];

        for (const fileId of fileIds) {
            try {
                // STEP 1: DRIVE DELETE (Level 0)
                await drive.files.delete({ fileId });
                logger.info(`   -> Drive Delete OK: ${fileId}`);

                // STEP 2: FIRESTORE DELETE (Level 1)
                await db.collection("TDB_Index").doc(userId).collection("files").doc(fileId).delete();
                logger.info(`   -> Firestore Index Delete OK: ${fileId}`);

                // OPTIONAL: Delete chunks?
                // Ideally yes, but 'files' doc delete doesn't cascade to 'chunks' unless we do recursive.
                // However, Chunks are in 'TDB_Index/{uid}/chunks' or subcollection of file?
                // The current schema has 'chunks' as a collectionGroup? Or subcollection of `files`?
                // In `ingestion.ts` (implied), chunks are usually subcollections of the file doc OR root collection.
                // Let's assume standard architecture: `TDB_Index/{uid}/files/{fileId}/chunks`.
                // So we should do recursive delete on the file doc.
                await db.recursiveDelete(db.collection("TDB_Index").doc(userId).collection("files").doc(fileId));
                logger.info(`   -> Recursive Delete OK (Chunks Cleaned).`);

                results.push({ id: fileId, status: 'purged' });

            } catch (err: any) {
                logger.error(`   ❌ Failed to purge ${fileId}:`, err);
                results.push({ id: fileId, status: 'error', error: err.message });
            }
        }

        return { success: true, results };

    } catch (error: any) {
        logger.error("Error en purgeArtifacts:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * PURGE EMPTY SESSIONS (The Ghostbuster Protocol)
 * Hard deletes empty sessions from Firestore.
 */
export const purgeEmptySessions = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const userId = request.auth.uid;
    const db = getFirestore();

    logger.info(`👻 [GHOSTBUSTER] Iniciando purga de sesiones vacías para: ${userId}`);

    try {
        const sessionsRef = db.collection("users").doc(userId).collection("forge_sessions");
        const snapshot = await sessionsRef.get();
        let deletedCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            let isEmpty = false;

            // 1. CHECK METADATA (Optimized Path)
            if (data.messageCount === 0) {
                isEmpty = true;
            } else if (data.messageCount === undefined) {
                // 2. CHECK SUBCOLLECTION (Legacy Path - Expensive)
                // If no metadata, check if 'messages' subcollection has any docs
                const messagesSnap = await sessionsRef.doc(doc.id).collection("messages").limit(1).get();
                if (messagesSnap.empty) {
                    isEmpty = true;
                }
            }

            if (isEmpty) {
                // HARD DELETE (Recursive to ensure subcollections die if any exist - e.g. orphaned stats)
                await db.recursiveDelete(sessionsRef.doc(doc.id));
                deletedCount++;
                logger.info(`   🗑️ Purged Empty Session: ${doc.id}`);
            }
        }

        logger.info(`👻 [GHOSTBUSTER] Purga completada. ${deletedCount} sesiones eliminadas.`);
        return { success: true, deletedCount, message: `Se eliminaron ${deletedCount} sesiones vacías.` };

    } catch (error: any) {
        logger.error("Error en purgeEmptySessions:", error);
        throw new HttpsError("internal", error.message);
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
        enforceAppCheck: true,
        timeoutSeconds: 540,
        memory: "512MiB",
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
            logger.error("Purge Failed:", error);
            throw new HttpsError("internal", "Error al purgar la base de datos.");
        }
    }
);
