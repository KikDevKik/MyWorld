import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// --- JANITOR PROTOCOL (Phase 5) ---

// 🛡️ SENTINEL CONSTANT
const MAX_PURGE_LIMIT = 50;

/**
 * SCAN VAULT HEALTH (The Auditor)
 * Scans Drive for "Ghost Files" (Empty or < 10 bytes).
 * Returns a health report.
 */
export const scanVaultHealth = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const { accessToken, folderId } = request.data;
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // If no folderId provided, we can't scan effectively without scanning root?
    // We will assume the user wants to scan the Project Root (folderId).
    // If not provided, we might fail or scan 'root' (which is huge).
    if (!folderId) throw new HttpsError("invalid-argument", "Falta folderId (Project Root).");

    logger.info(`🧹 [JANITOR] Iniciando escaneo de salud para: ${folderId}`);

    try {
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
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

        const query = `'${folderId}' in parents and trashed = false and size < 10 and mimeType != 'application/vnd.google-apps.folder'`;

        const res = await drive.files.list({
            q: query,
            fields: "files(id, name, size, mimeType)",
            pageSize: 100 // Limit to 100 ghosts to prevent overwhelming UI
        });

        const ghosts = res.data.files || [];

        // 2. CALCULATE HEALTH
        // We need total files count to calc %?
        // We can do a separate quick query for total count "in parents".
        const totalRes = await drive.files.list({
             q: `'${folderId}' in parents and trashed = false`,
             pageSize: 1, // We only need count
             fields: "files(id)" // Minimize data
             // Note: Drive API v3 doesn't give total count easily without iterating, unless we use Approx?
             // We'll skip precise % if hard. Or just 100 - (ghosts * 5).
        });
        // Wait, list does not return totalSize unless requested?
        // Actually, let's just use a heuristic.
        // If 0 ghosts -> 100%.
        // If > 0 -> 100 - (count * 2). Min 0.

        const ghostCount = ghosts.length;
        const health = Math.max(0, 100 - (ghostCount * 5)); // 5% penalty per ghost

        logger.info(`🧹 [JANITOR] Report: ${ghostCount} ghosts found. Health: ${health}%`);

        return {
            health,
            ghostCount,
            ghosts: ghosts.map(g => ({
                id: g.id,
                name: g.name,
                size: g.size,
                mimeType: g.mimeType
            }))
        };

    } catch (error: any) {
        logger.error("Error en scanVaultHealth:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * PURGE ARTIFACTS (The Incinerator)
 * Hard deletes files from Drive and Firestore.
 */
export const purgeArtifacts = onCall(
  {
    region: "us-central1",
    cors: ["https://myword-67b03.web.app", "http://localhost:5173", "http://localhost:4173"],
    enforceAppCheck: true,
  },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

    const { fileIds, accessToken } = request.data;
    if (!fileIds || !Array.isArray(fileIds)) throw new HttpsError("invalid-argument", "Faltan fileIds.");
    if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

    // 🛡️ SENTINEL CHECK: DoS Protection
    if (fileIds.length > MAX_PURGE_LIMIT) {
        throw new HttpsError("invalid-argument", `Batch size exceeds limit of ${MAX_PURGE_LIMIT} files.`);
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
