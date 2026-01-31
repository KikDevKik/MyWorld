import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
    driveId?: string;
    type?: string;
    [key: string]: any;
}

export async function updateFirestoreTree(
    userId: string,
    operation: 'add' | 'rename' | 'delete',
    targetId: string, // For rename: fileId. For add: unused (or new fileId)
    payload: { name?: string; parentId?: string; newNode?: FileNode }
) {
    const db = getFirestore();
    const treeRef = db.collection("TDB_Index").doc(userId).collection("structure").doc("tree");

    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(treeRef);
            if (!doc.exists) return;

            const treeData = doc.data();
            if (!treeData || !Array.isArray(treeData.tree)) return;

            // Clone tree to avoid mutation issues if any (though Firestore SDK handles object serialization)
            const tree = treeData.tree as FileNode[];

            if (operation === 'rename') {
                // Recursive find and update
                const updateNode = (nodes: FileNode[]): boolean => {
                    for (const node of nodes) {
                        if (node.id === targetId || node.driveId === targetId) {
                            if (payload.name) node.name = payload.name;
                            return true;
                        }
                        if (node.children) {
                            if (updateNode(node.children)) return true;
                        }
                    }
                    return false;
                };
                updateNode(tree);
            } else if (operation === 'add') {
                const { parentId, newNode } = payload;
                if (!newNode || !parentId) return;

                const addToParent = (nodes: FileNode[]): boolean => {
                    for (const node of nodes) {
                         // Check if this node is the parent
                         if (node.id === parentId || node.driveId === parentId) {
                             if (!node.children) node.children = [];
                             // Avoid duplicates just in case
                             if (!node.children.some(c => c.id === newNode.id)) {
                                 node.children.push(newNode);
                             }
                             return true;
                         }
                         if (node.children) {
                             if (addToParent(node.children)) return true;
                         }
                    }
                    return false;
                };

                // Try to find parent
                const found = addToParent(tree);
                if (!found) {
                     logger.warn(`⚠️ updateFirestoreTree: Parent ${parentId} not found in tree. Node not added.`);
                }
            } else if (operation === 'delete') {
                const deleteNode = (nodes: FileNode[]): boolean => {
                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        if (node.id === targetId || node.driveId === targetId) {
                            nodes.splice(i, 1);
                            return true;
                        }
                        if (node.children) {
                            if (deleteNode(node.children)) return true;
                        }
                    }
                    return false;
                };
                deleteNode(tree);
            }

            t.set(treeRef, { tree, updatedAt: new Date().toISOString() }, { merge: true });
        });
        logger.info(`🌳 Firestore Tree Updated: ${operation} on ${targetId}`);
    } catch (e) {
        logger.error("Failed to update Firestore Tree:", e);
    }
}
