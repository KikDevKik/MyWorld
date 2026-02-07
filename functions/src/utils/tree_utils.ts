import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    driveId?: string;
    parentId?: string;
    type?: string;
    [key: string]: any;
}

/**
 * TITANIUM UPDATE (V2): Direct Collection Manipulation
 * Replaces legacy JSON tree walker with O(1) Firestore operations.
 */
export async function updateFirestoreTree(
    userId: string,
    operation: 'add' | 'rename' | 'delete' | 'move',
    targetId: string, // driveId
    payload: { name?: string; parentId?: string; newNode?: FileNode }
) {
    const db = getFirestore();
    const filesRef = db.collection("TDB_Index").doc(userId).collection("files");
    const now = new Date().toISOString();

    try {
        if (operation === 'rename') {
            if (!payload.name) return;
            await filesRef.doc(targetId).update({
                name: payload.name,
                updatedAt: now // 🟢 DIRTY CHECK CONTRACT
            });
        } else if (operation === 'add') {
            const { parentId, newNode } = payload;
            if (!newNode || !newNode.id) return;

            // Ensure ID is set
            const docId = newNode.id; // driveId

            await filesRef.doc(docId).set({
                ...newNode,
                parentId: parentId || null,
                driveId: docId, // Redundant but safe
                updatedAt: now,
                lastIndexed: now,
                category: newNode.category || 'canon',
                isGhost: false
            }, { merge: true });

        } else if (operation === 'delete') {
            await filesRef.doc(targetId).delete();
            // Note: Does not recursively delete children in Firestore to save reads/writes.
            // Orphaned children will just not show up in a tree traversal if parent is gone.
        } else if (operation === 'move') {
            const { parentId } = payload;
            if (!parentId) return;

            await filesRef.doc(targetId).update({
                parentId: parentId,
                updatedAt: now
            });
        }

        logger.info(`🌳 Firestore Tree (V2) Updated: ${operation} on ${targetId}`);
    } catch (e) {
        logger.error("Failed to update Firestore Tree (V2):", e);
    }
}

export async function updateFirestoreTreeBatch(
    userId: string,
    operation: 'delete',
    targetIds: string[]
) {
    const db = getFirestore();
    const filesRef = db.collection("TDB_Index").doc(userId).collection("files");

    try {
        let batch = db.batch();
        let count = 0;

        for (const id of targetIds) {
            batch.delete(filesRef.doc(id));
            count++;
            if (count >= 450) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
        }

        logger.info(`🌳 Firestore Tree Batch (V2) Updated: ${operation} on ${targetIds.length} items`);
    } catch (e) {
        logger.error("Failed to update Firestore Tree Batch (V2):", e);
    }
}
