import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { google } from "googleapis";
import { getFirestore } from "firebase-admin/firestore";
import { handleSecureError } from "./utils/security";

/**
 * NUKE PROJECT (The Destroyer)
 * Completely wipes a project's data from Drive and Firestore.
 * PRESERVES: Writer Profile (style, rules).
 * DESTROYS: Files, Vector Index, Characters, Chats, Timeline, Project Config.
 */
export const nukeProject = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 540, // 9 Minutes (Long running op)
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { accessToken, rootFolderId } = request.data;
        // rootFolderId is optional (might already be deleted manually), but if provided, we trash it.
        // accessToken is required if we want to trash Drive items.

        const userId = request.auth.uid;
        const db = getFirestore();

        // 🟢 BACKUP: Fetch Config to find rootFolderId if missing
        let targetFolderId = rootFolderId;
        if (!targetFolderId) {
             const configDoc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();
             targetFolderId = configDoc.data()?.folderId;
             if (targetFolderId) logger.info(`   🔎 Found rootFolderId in config: ${targetFolderId}`);
        }

        logger.info(`☢️ [NUKE] INITIATING TOTAL DESTRUCTION FOR USER: ${userId}`);

        try {
            // 1. DRIVE DESTRUCTION (The Physical World)
            if (targetFolderId && accessToken) {
                try {
                    const auth = new google.auth.OAuth2();
                    auth.setCredentials({ access_token: accessToken });
                    const drive = google.drive({ version: "v3", auth });

                    logger.info(`   🗑️ Trashing Drive Root: ${targetFolderId}`);
                    await drive.files.update({
                        fileId: targetFolderId,
                        requestBody: { trashed: true }
                    });
                } catch (driveErr: any) {
                    logger.warn(`   ⚠️ Drive Trash Failed (Non-fatal): ${driveErr.message}`);
                    // Continue to wipe DB even if Drive fails (maybe already deleted)
                }
            }

            // 2. FIRESTORE DESTRUCTION (The Memory)
            // We run these in parallel where safe, but recursiveDelete is heavy.
            // Let's do them sequentially to manage resources or parallelize blocks.

            const collectionsToWipe = [
                db.collection("TDB_Index").doc(userId), // Vector Index
                db.collection("users").doc(userId).collection("forge_sessions"), // Chats
                db.collection("users").doc(userId).collection("characters"), // Characters
                db.collection("users").doc(userId).collection("projects"), // Entities/Graph
                db.collection("users").doc(userId).collection("forge_detected_entities"), // Ghosts
                db.collection("users").doc(userId).collection("audit_cache"), // Guardian Cache
                db.collection("TDB_Timeline").doc(userId) // Timeline
            ];

            logger.info(`   🔥 Wiping ${collectionsToWipe.length} collections/docs...`);

            await Promise.all(collectionsToWipe.map(ref => db.recursiveDelete(ref)));

            // 3. CONFIG RESET (The Identity)
            // Reset project_config to default
            const defaultConfig = {
                projectName: '',
                canonPaths: [],
                resourcePaths: [],
                primaryCanonPathId: null,
                activeBookContext: '',
                folderId: null,
                characterVaultId: null,
                folderMapping: {},
                styleIdentity: '', // Resetting style identity per user request context (usually style is attached to project, but Writer Profile is separate)
                // Note: User asked to KEEP "Writer Profile" (writer_config), but "styleIdentity" in project_config is often project-specific tone.
                // However, "Writer Profile" is stored in `users/{userId}/profile/writer_config`. We are NOT touching that.
                updatedAt: new Date().toISOString()
            };

            await db.collection("users").doc(userId).collection("profile").doc("project_config").set(defaultConfig);

            logger.info("   ✨ Project Config Reset.");

            logger.info(`✅ [NUKE] DESTRUCTION COMPLETE for ${userId}`);
            return { success: true };

        } catch (error: any) {
            throw handleSecureError(error, "nukeProject");
        }
    }
);
