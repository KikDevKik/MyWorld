import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldPath } from "firebase-admin/firestore";
import { google } from "googleapis";
import { defineSecret } from "firebase-functions/params";
import { cosineSimilarity } from "./similarity";

const baptismMasterKey = defineSecret("BAPTISM_MASTER_KEY");

/**
 * HELPER: Walk up Drive Tree to find Root (Project ID)
 * Returns the Root Folder ID if found, or null if it hits Drive Root without matching.
 */
async function resolveProjectRoot(
    drive: any,
    folderId: string,
    targetRootId: string,
    cache: Map<string, string | null>
): Promise<string | null> {
    if (folderId === targetRootId) return targetRootId;
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

        // Optimization: Check if parent is already known
        if (parentId === targetRootId) {
             cache.set(folderId, targetRootId);
             return targetRootId;
        }

        // Recursive Step
        const rootId = await resolveProjectRoot(drive, parentId, targetRootId, cache);

        // Update Cache for this node
        cache.set(folderId, rootId);
        return rootId;

    } catch (e: any) {
        logger.warn(`⚠️ [BAPTISM] Failed to resolve path for ${folderId}:`, e.message);
        cache.set(folderId, null);
        return null;
    }
}

/**
 * HELPER: Generate and Write Manifest to Drive
 */
async function writeManifestToDrive(
    drive: any,
    targetRootId: string,
    stats: any,
    orphans: string[]
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const filename = `SYSTEM_LOG_BAPTISM_${today}.md`;

    // 1. Prepare Content Block
    const timestamp = new Date().toISOString();
    const logBlock = `
### Execution Log: ${timestamp}
- **Status:** ${stats.status}
- **Processed:** ${stats.processed}
- **Baptized (Success):** ${stats.baptized}
- **Errors/Skipped:** ${stats.errors}
- **Orphans Detected:** ${orphans.length}
${orphans.length > 0 ? `  - IDs: ${orphans.slice(0, 10).join(', ')}${orphans.length > 10 ? '...' : ''}` : ''}
--------------------------------------------------
`;

    try {
        // 2. Search for existing file today
        const listRes = await drive.files.list({
            q: `name = '${filename}' and '${targetRootId}' in parents and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        });

        const files = listRes.data.files;
        let fileId = null;
        let currentContent = "";

        if (files && files.length > 0) {
            fileId = files[0].id;
            // 3. Append Mode
            try {
                const getRes = await drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                });
                // Ensure we handle different return types (string or object)
                currentContent = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data);
            } catch (err) {
                // If empty or new, ignore
                currentContent = "";
            }
        }

        const finalContent = fileId ? (currentContent + logBlock) : (`# SENTINEL PROTOCOL - MIGRATION REPORT\n**Project Root:** ${targetRootId}\n**Date:** ${today}\n` + logBlock);

        const media = {
            mimeType: 'text/markdown',
            body: finalContent
        };

        if (fileId) {
            // Update
            await drive.files.update({
                fileId: fileId,
                media: media
            });
            logger.info(`📝 [MANIFEST] Updated log ${filename} (${fileId})`);
        } else {
            // Create
            await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [targetRootId],
                    mimeType: 'text/markdown'
                },
                media: media
            });
            logger.info(`📝 [MANIFEST] Created new log ${filename}`);
        }

    } catch (e: any) {
        logger.error(`❌ [MANIFEST] Failed to write log: ${e.message}`);
        // We do not throw here to avoid failing the whole function if logging fails
    }
}

export const executeBaptismProtocol = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        timeoutSeconds: 540,
        memory: "1GiB",
        secrets: [baptismMasterKey],
    },
    async (request) => {
        const db = getFirestore();
        const { masterKey, userId, limit, startAfter, accessToken } = request.data;

        // 1. SECURITY CHECK (Hard Handshake)
        if (masterKey !== baptismMasterKey.value()) {
            throw new HttpsError("permission-denied", "Protocolo denegado. Llave maestra inválida.");
        }
        if (!userId || !accessToken) {
             throw new HttpsError("invalid-argument", "Falta userId o accessToken.");
        }

        logger.info(`✝️ [BAPTISM] Iniciando operación para: ${userId}`);

        // 2. LOAD ANCHOR
        const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
        const config = configDoc.data() || {};
        const targetRootId = config.folderId;

        if (!targetRootId) {
             return { message: "⚠️ No hay 'folderId' activo (Ancla de Realidad).", processed: 0 };
        }

        // 3. SENTINEL PROTOCOL: DRIVE HANDSHAKE
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        try {
            // Validate Access to the Project Root
            await drive.files.get({
                fileId: targetRootId,
                fields: 'id, capabilities'
            });
            logger.info("   🛡️ [SENTINEL] Token validado contra Ancla de Realidad.");
        } catch (e: any) {
            logger.error("   ⛔ [SENTINEL] Acceso denegado al Ancla.", e.message);
            throw new HttpsError("permission-denied", "El token no tiene acceso al Project Root.");
        }

        // 4. PREPARE CACHE & CENTROID
        const folderCache = new Map<string, string | null>(); // folderId -> resolvedRootId
        folderCache.set(targetRootId, targetRootId); // Seed with root

        let centroidVector: number[] | null = null;
        try {
            const centroidDoc = await db.collection("TDB_Index").doc(userId).collection("stats").doc("centroid").get();
            if (centroidDoc.exists) {
                centroidVector = centroidDoc.data()?.vector || null;
                logger.info("   ⚓ [SENTINEL] Centroid Loaded for Drift Analysis.");
            }
        } catch (e) {
            logger.warn("   ⚠️ [SENTINEL] Could not load Centroid.", e);
        }

        // 5. QUERY (User-Scoped & Orphaned)
        // Filter by userId is MANDATORY per User Instruction, ensuring multi-tenant safety.
        let query = db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("projectId", "==", null)
            .orderBy(FieldPath.documentId())
            .limit(limit || 100);

        if (startAfter) {
            // startAfter is the Full Document Path string
            query = query.startAfter(startAfter);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
            return { message: "✅ Bautismo completo (Sin huérfanos).", processed: 0 };
        }

        logger.info(`   🔍 Procesando batch de ${snapshot.size} chunks.`);

        let processed = 0;
        let baptized = 0;
        let errors = 0; // Treated as "Skipped/Orphan"
        const orphansDetected: string[] = [];

        let batch = db.batch();
        let batchCount = 0;

        // 5.1 PRE-WARM CACHE (Parallel Execution)
        const uniqueFolderIds = Array.from(new Set(
            snapshot.docs
                .map(d => d.data().folderId)
                .filter(id => id && id !== 'unknown')
        )) as string[];

        const CONCURRENCY_LIMIT = 10;
        for (let i = 0; i < uniqueFolderIds.length; i += CONCURRENCY_LIMIT) {
            const chunk = uniqueFolderIds.slice(i, i + CONCURRENCY_LIMIT);
            await Promise.all(chunk.map(fid => resolveProjectRoot(drive, fid, targetRootId, folderCache)));
        }

        // 6. ITERATION
        for (const doc of snapshot.docs) {
            const data = doc.data();
            processed++;

            const folderId = data.folderId;
            if (!folderId || folderId === 'unknown') {
                errors++;
                orphansDetected.push(doc.id);
                continue;
            }

            // CHECK CACHE / RESOLVE
            // Now instant due to Pre-Warm step
            const resolvedRoot = await resolveProjectRoot(drive, folderId, targetRootId, folderCache);

            if (resolvedRoot === targetRootId) {

                // 🟢 DRIFT CALCULATION
                let driftScore = 0.0;
                let needsReview = false;

                if (centroidVector && data.embedding) {
                    const similarity = cosineSimilarity(data.embedding, centroidVector);
                    driftScore = 1.0 - similarity;
                    if (driftScore > 0.4) {
                         needsReview = true;
                         orphansDetected.push(`DRIFT_ALERT:${doc.id}:${driftScore.toFixed(2)}`);
                    }
                }

                // UPDATE
                batch.set(doc.ref, {
                    projectId: targetRootId,
                    migration_metadata: {
                        baptized_at: new Date().toISOString(),
                        method: "SENTINEL_V8",
                        agent: "Jules-Agent"
                    },
                    chunk_metadata: { // 🟢 METADATA INJECTION
                        drift_score: driftScore,
                        needsReview: needsReview,
                        analysis_timestamp: new Date().toISOString()
                    }
                }, { merge: true });

                batchCount++;
                baptized++;
            } else {
                // ORPHAN (Out of Scope)
                errors++;
                orphansDetected.push(doc.id);
            }

            // Safety Commit
            if (batchCount >= 400) {
                await batch.commit();
                batch = db.batch();
                batchCount = 0;
            }
        }

        // Final Commit
        if (batchCount > 0) {
            await batch.commit();
        }

        // 7. MANIFEST GENERATION (Mission 4 & 5)
        await writeManifestToDrive(drive, targetRootId, {
            status: "Success",
            processed,
            baptized,
            errors
        }, orphansDetected);

        // Cursor for Next Page
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const lastDocPath = lastDoc ? lastDoc.ref.path : null;

        return {
            processed,
            baptized,
            errors,
            lastDocPath,
            message: `Batch complete: ${baptized} baptized, ${errors} orphans/skipped.`
        };
    }
);

// --- TITANIUM MIGRATION (V1 -> V2) ---

interface FileNode {
    id: string; // Drive ID
    name: string;
    mimeType: string;
    children?: FileNode[];
    type?: string;
    [key: string]: any;
}

function flattenTreeForMigration(nodes: FileNode[], parentId: string | null = null): any[] {
    let flat: any[] = [];
    for (const node of nodes) {
        // Map to new schema
        const docId = node.id; // Old tree uses DriveID as ID

        flat.push({
            docId: docId,
            data: {
                name: node.name,
                mimeType: node.mimeType || 'unknown',
                type: node.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
                parentId: parentId,
                driveId: docId, // Explicit
                lastIndexed: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                category: 'canon', // Default
                isGhost: false
            }
        });

        if (node.children && node.children.length > 0) {
            flat = flat.concat(flattenTreeForMigration(node.children, docId));
        }
    }
    return flat;
}

/**
 * 24.1 MIGRATE DATABASE V1->V2 (The Bridge)
 * Explodes the monolithic JSON tree into the new scalable 'files' collection.
 */
export const migrateDatabaseV1toV2 = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 540,
        memory: "2GiB",
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const userId = request.auth.uid;
        logger.info(`🏗️ Starting Titanium Migration (V1->V2) for ${userId}`);

        try {
            // 1. READ LEGACY TREE
            const treeRef = db.collection("TDB_Index").doc(userId).collection("structure").doc("tree");
            const treeDoc = await treeRef.get();

            if (!treeDoc.exists) {
                return { success: true, message: "No legacy tree found. System ready for V2." };
            }

            const treeData = treeDoc.data();
            if (!treeData || !Array.isArray(treeData.tree)) {
                return { success: true, message: "Legacy tree is empty or invalid." };
            }

            // 2. FLATTEN
            logger.info("   -> Flattening JSON Tree...");
            const flatNodes = flattenTreeForMigration(treeData.tree);
            logger.info(`   -> Found ${flatNodes.length} nodes to migrate.`);

            // 3. BATCH WRITE (Titanium Schema)
            const filesCollection = db.collection("TDB_Index").doc(userId).collection("files");
            let batch = db.batch();
            let count = 0;
            let totalMigrated = 0;

            for (const node of flatNodes) {
                const docRef = filesCollection.doc(node.docId);

                // Use 'set' with merge to avoid overwriting existing V2 data if partial migration happened
                batch.set(docRef, node.data, { merge: true });
                count++;
                totalMigrated++;

                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }

            if (count > 0) {
                await batch.commit();
            }

            // 4. ARCHIVE LEGACY (Rename, don't delete yet for safety)
            const backupRef = db.collection("TDB_Index").doc(userId).collection("structure").doc("tree_v1_backup");
            await backupRef.set({ ...treeData, archivedAt: new Date().toISOString() });

            // Delete original to force Frontend to switch (or we handle in UI)
            await treeRef.delete();

            logger.info(`✅ Migration Complete. ${totalMigrated} files moved to Collection.`);

            return { success: true, count: totalMigrated };

        } catch (error: any) {
             logger.error("💥 Migration Failed:", error);
             throw new HttpsError("internal", error.message);
        }
    }
);
