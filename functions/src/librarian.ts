import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";

// Lock duration in milliseconds (e.g., 5 minutes heartbeat)
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

interface LockRequest {
    fileId: string;
    clientId: string; // Unique ID for the browser tab/agent
    force?: boolean;
}

/**
 * ACQUIRE LOCK (El Candado)
 * Attempts to lock a file for exclusive editing.
 */
export const acquireLock = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { fileId, clientId, force } = request.data as LockRequest;
        if (!fileId || !clientId) throw new HttpsError("invalid-argument", "Missing fileId or clientId");

        const db = getFirestore();
        const userId = request.auth.uid;
        const lockRef = db.collection("TDB_Index").doc(userId).collection("locks").doc(fileId);

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(lockRef);
                const now = Date.now();

                if (doc.exists) {
                    const data = doc.data();
                    const isExpired = (now - data?.updatedAt.toMillis()) > LOCK_TIMEOUT_MS;

                    if (data?.clientId === clientId) {
                        // Refresh my own lock
                        t.update(lockRef, { updatedAt: FieldValue.serverTimestamp() });
                        return;
                    }

                    if (!isExpired && !force) {
                        throw new HttpsError("aborted", `File is locked by another session.`, {
                            owner: data?.clientId,
                            expiresIn: Math.ceil((LOCK_TIMEOUT_MS - (now - data?.updatedAt.toMillis())) / 1000)
                        });
                    }

                    if (force) {
                        logger.warn(`🔓 Force unlocking file ${fileId} for ${clientId}`);
                    }
                }

                // Create or Steal Lock
                t.set(lockRef, {
                    clientId: clientId,
                    fileId: fileId,
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                });
            });

            return { success: true, status: 'LOCKED' };

        } catch (error: any) {
            if (error.code === 'aborted') throw error;
            logger.error("Lock acquisition failed:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

/**
 * RELEASE LOCK
 */
export const releaseLock = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { fileId, clientId } = request.data as LockRequest;
        const db = getFirestore();
        const userId = request.auth.uid;
        const lockRef = db.collection("TDB_Index").doc(userId).collection("locks").doc(fileId);

        try {
            await db.runTransaction(async (t) => {
                const doc = await t.get(lockRef);
                if (!doc.exists) return; // Already free

                if (doc.data()?.clientId === clientId) {
                    t.delete(lockRef);
                } else {
                    // Not owner, ignore or warn
                    logger.warn(`Attempt to release lock owned by others. File: ${fileId}`);
                }
            });

            return { success: true, status: 'UNLOCKED' };
        } catch (error: any) {
            throw new HttpsError("internal", error.message);
        }
    }
);

// Internal Helper for other Functions
export async function verifyLock(userId: string, fileId: string, clientId?: string): Promise<boolean> {
    const db = getFirestore();
    const lockRef = db.collection("TDB_Index").doc(userId).collection("locks").doc(fileId);
    const doc = await lockRef.get();

    if (!doc.exists) return true; // No lock = Open

    const data = doc.data();
    const now = Date.now();
    const isExpired = (now - data?.updatedAt.toMillis()) > LOCK_TIMEOUT_MS;

    if (isExpired) return true; // Expired = Open

    if (clientId && data?.clientId === clientId) return true; // Owner = Open

    return false; // Locked by someone else
}
