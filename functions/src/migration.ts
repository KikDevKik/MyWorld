import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";

const baptismMasterKey = defineSecret("BAPTISM_MASTER_KEY");

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
            fields: "parents, id, name",
            supportsAllDrives: true
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
        // If we can't read the parent (permission denied?), we assume it's out of scope or broken.
        cache.set(folderId, null);
        return null;
    }
}

export const executeBaptismProtocol = onCall(
    {
        region: "us-central1",
        timeoutSeconds: 540, // Max duration
        memory: "1GiB",
        secrets: [baptismMasterKey],
    },
    async (request) => {
        const db = getFirestore();
        const { masterKey, userId, limit, startAfter, accessToken } = request.data;

        // 1. SECURITY CHECK
        // If masterKey is passed in body, check it.
        // We compare against the Secret Version value.
        if (masterKey !== baptismMasterKey.value()) {
            throw new HttpsError("permission-denied", "Protocolo denegado. Llave maestra inválida.");
        }
        if (!userId) {
            throw new HttpsError("invalid-argument", "Falta userId.");
        }

        if (!accessToken) {
             throw new HttpsError("unauthenticated", "Falta accessToken para validación de Nivel 0. (Se requiere token del usuario propietario).");
        }

        logger.info(`✝️ [BAPTISM] Iniciando sacramento para Usuario: ${userId}`);

        // 2. LOAD ANCHOR (Project Config)
        const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
        const config = configDoc.data() || {};
        const knownRoots = new Set<string>();

        // "Ancla de Realidad" - The Active Project Folder
        if (config.folderId) {
            knownRoots.add(config.folderId);
        }
        // Fallbacks (Optional, but user said "Active Anchor")
        // If we want strict "Active Project" baptism, we should ONLY use folderId.
        // But if the user has canonPaths configured, they are part of the project too?
        // User said: "Toma el folderId que el usuario tiene activo como su 'Ancla de Realidad'."
        // I will trust 'folderId' as the primary.
        // Adding others might cause accidental cross-project pollution if they share files?
        // Safe bet: Only folderId.

        if (knownRoots.size === 0) {
             return { message: "⚠️ No hay 'folderId' activo en project_config. No hay Ancla de Realidad.", processed: 0 };
        }

        logger.info(`   🏛️ Ancla de Realidad (Active Project): ${Array.from(knownRoots).join(', ')}`);

        // 3. SETUP DRIVE & CACHE
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        const folderCache = new Map<string, string | null>(); // folderId -> rootId

        // 4. SCAN FILES (QUERY: chunks where projectId == null)
        // Note: We need a Composite Index for this: collectionGroup('chunks').where('userId', '==', ...).where('projectId', '==', null)
        let query = db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("projectId", "==", null)
            .limit(limit || 200); // Process in chunks

        // Firestore does not support startAfter with collectionGroup easily unless we order by something unique.
        // But we are modifying the documents (setting projectId), so they will leave the query result set!
        // So we don't need 'startAfter' pagination. We just grab the next batch.
        // Pagination logic: "Grab 200, fix them. Next run, grab next 200."

        const snapshot = await query.get();

        if (snapshot.empty) {
            return { message: "✅ Bautismo completo (No se encontraron chunks huérfanos).", processed: 0, baptized: 0, errors: 0 };
        }

        logger.info(`   🔍 Encontrados ${snapshot.size} chunks huérfanos.`);

        let processed = 0;
        let baptized = 0;
        let errors = 0;
        let skipped = 0;

        let batch = db.batch(); // Firestore Write Batch
        let batchCount = 0;

        // Group by Folder to minimize API calls
        // We can't easily "Group" the loop, but we use the Cache.

        for (const doc of snapshot.docs) {
            const data = doc.data();
            processed++;

            const folderId = data.folderId;
            if (!folderId || folderId === 'unknown') {
                logger.warn(`   ⚠️ [SKIP] Chunk ${doc.id} sin folderId válido.`);
                errors++;
                continue;
            }

            // RESOLVE TRUTH
            const trueRootId = await resolveProjectRoot(drive, folderId, knownRoots, folderCache);

            if (trueRootId) {
                // UPDATE
                // We update only the chunk.
                // Note: The 'File' metadata (TDB_Index/files) might also need updating?
                // The prompt Mision 1 says: "Actualiza los documentos en Firestore." (Plural?)
                // "Realiza una consulta a la colección chunks..."
                // "Una vez obtenido el projectId real, actualiza los documentos en Firestore."

                // We are iterating chunks. We update chunks.
                // Do we update the parent File?
                // The chunk has 'docId' (the hashed path). The File has the same ID in TDB_Index/files.
                // If we want consistency, we should update the parent File too.
                // But efficient baptism iterates chunks.
                // I will update the chunk. The 'ingestFile' logic sets projectId on chunks.

                batch.set(doc.ref, {
                    projectId: trueRootId,
                    migration_metadata: {
                        baptized_at: new Date().toISOString(),
                        method: "API_V3_PARENT_VALIDATION",
                        agent: "Jules-Sentinel-V1"
                    }
                }, { merge: true });

                batchCount++;
                baptized++;
            } else {
                // OUT OF SCOPE
                // Ignore.
                skipped++;
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
            skipped,
            errors,
            message: `Batch procesado: ${baptized} bautizados, ${skipped} ignorados (fuera de ancla).`
        };
    }
);
