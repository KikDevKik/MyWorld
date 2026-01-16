import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";

// interface BaptismResult {
//     processed: number;
//     baptized: number;
//     errors: number;
//     lastDocId?: string;
//     message: string;
// }

// 🛡️ SECURITY: Master Key for manual execution
// In production, this should be a secret or a strict IAM check.
// For this task, we will check a header or body param.
const BAPTISM_MASTER_KEY = "PROTOCOL_SENTINEL_INITIATE_88";

/**
 * HELPER: Walk up Drive Tree to find Root (Project ID)
 * Returns the Root Folder ID if found, or null if it hits Drive Root without matching.
 */
async function resolveProjectRoot(
    drive: any,
    folderId: string,
    knownRoots: Set<string>,
    cache: Map<string, string | null>
): Promise<string | null> {
    if (knownRoots.has(folderId)) return folderId;
    if (cache.has(folderId)) return cache.get(folderId)!;

    try {
        const res = await drive.files.get({
            fileId: folderId,
            fields: "parents, id, name"
        });

        const parents = res.data.parents;
        if (!parents || parents.length === 0) {
            // Hit the top of Drive or Shared Drive Root
            cache.set(folderId, null);
            return null;
        }

        const parentId = parents[0]; // Drive files usually have one parent

        // Recursive Step
        const rootId = await resolveProjectRoot(drive, parentId, knownRoots, cache);

        // Update Cache for this node too (optimization)
        cache.set(folderId, rootId);
        return rootId;

    } catch (e: any) {
        logger.warn(`⚠️ [BAPTISM] Failed to resolve path for ${folderId}:`, e.message);
        return null;
    }
}

export const executeBaptismProtocol = onCall(
    {
        region: "us-central1",
        timeoutSeconds: 540, // Max duration
        memory: "1GiB",
        secrets: [],
    },
    async (request) => {
        const db = getFirestore();
        const { masterKey, userId, limit, startAfter, accessToken } = request.data;

        // 1. SECURITY CHECK
        if (masterKey !== BAPTISM_MASTER_KEY) {
            throw new HttpsError("permission-denied", "Protocolo denegado. Llave maestra inválida.");
        }
        if (!userId) {
            throw new HttpsError("invalid-argument", "Falta userId.");
        }

        // NOTE: For true batch processing of ALL users, a Service Account with Domain-Wide Delegation
        // would be required to impersonate users and access their Drive files.
        // For this implementation, we require the specific user's accessToken (Self-Baptism/Admin-Assisted).
        if (!accessToken) {
             throw new HttpsError("unauthenticated", "Falta accessToken para validación de Nivel 0. (Se requiere token del usuario propietario).");
        }

        logger.info(`✝️ [BAPTISM] Iniciando sacramento para Usuario: ${userId}`);

        // 2. LOAD KNOWN ROOTS (Project Config)
        const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
        const config = configDoc.data() || {};
        const knownRoots = new Set<string>();

        if (config.canonPaths) config.canonPaths.forEach((p: any) => knownRoots.add(p.id));
        if (config.resourcePaths) config.resourcePaths.forEach((p: any) => knownRoots.add(p.id));
        if (config.folderId) knownRoots.add(config.folderId); // Primary Anchor

        if (knownRoots.size === 0) {
             return { message: "⚠️ No hay raíces configuradas en project_config. Imposible validar.", processed: 0 };
        }

        logger.info(`   🏛️ Raíces Conocidas: ${Array.from(knownRoots).join(', ')}`);

        // 3. SETUP DRIVE & CACHE
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const folderCache = new Map<string, string | null>(); // folderId -> rootId

        // 4. SCAN FILES
        let query = db.collection("TDB_Index").doc(userId).collection("files")
            .orderBy("__name__") // Stable sort by ID
            .limit(limit || 50);

        if (startAfter) {
            query = query.startAfter(startAfter);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return { message: "✅ Bautismo completo (No más archivos).", processed: 0, baptized: 0, errors: 0 };
        }

        let processed = 0;
        let baptized = 0;
        let errors = 0;
        let lastDocId = "";

        let batch = db.batch(); // Firestore Write Batch
        let batchCount = 0;

        for (const doc of snapshot.docs) {
            const data = doc.data();
            lastDocId = doc.id;
            processed++;

            // CHECK: Does it need baptism?
            if (data.projectId && knownRoots.has(data.projectId)) {
                continue; // Already baptized and valid
            }

            const folderId = data.parentId || data.folderId;
            if (!folderId) {
                logger.warn(`   ⚠️ [SKIP] Archivo ${data.name} sin parentId.`);
                errors++;
                continue;
            }

            // RESOLVE TRUTH
            const trueRootId = await resolveProjectRoot(drive, folderId, knownRoots, folderCache);

            if (trueRootId) {
                logger.info(`   ✨ [BAUTISMO] ${data.name}: Asignando ProjectId ${trueRootId}`);

                // A. Update File Metadata
                batch.set(doc.ref, { projectId: trueRootId }, { merge: true });
                batchCount++;

                // B. Update Chunks (Subcollection)
                const chunksRef = doc.ref.collection("chunks");
                const chunksSnap = await chunksRef.get(); // Reads!

                for (const chunkDoc of chunksSnap.docs) {
                    batch.set(chunkDoc.ref, { projectId: trueRootId }, { merge: true });
                    batchCount++;
                }

                baptized++;
            } else {
                logger.warn(`   👻 [HUÉRFANO] ${data.name}: No se pudo trazar ruta a ninguna raíz conocida.`);
                errors++;
            }

            // Safety commit inside loop
            if (batchCount >= 400) {
                await batch.commit();
                batch = db.batch(); // Renew batch
                batchCount = 0;
            }
        }

        // Final Commit
        if (batchCount > 0) {
            await batch.commit();
        }

        return {
            processed,
            baptized,
            errors,
            lastDocId,
            message: `Batch finalizado. Continuar desde ${lastDocId}`
        };
    }
);
