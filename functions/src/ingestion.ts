import * as crypto from 'crypto';
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export interface IngestionFile {
  id: string; // Drive ID (Kept for metadata linking)
  name: string;
  path: string; // 👈 SHA-256(path) is the new Primary Key
  saga?: string;
  parentId?: string;
  category?: 'canon' | 'reference';
}

export interface IngestionResult {
    status: 'processed' | 'skipped' | 'error';
    hash: string;
    chunksCreated: number;
    chunksDeleted: number;
}

/**
 * CORE INGESTION LOGIC (The Digestion System)
 * Handles Hashing, Deduplication, Vectorization, and Storage.
 */
export async function ingestFile(
    db: FirebaseFirestore.Firestore,
    userId: string,
    projectId: string, // 👈 New: Project Anchor
    file: IngestionFile,
    content: string,
    embeddingsModel: any
): Promise<IngestionResult> {
    try {
        // 1. VALIDATION
        if (!content || content.trim().length === 0) {
            logger.warn(`⚠️ [INGEST] File is empty: ${file.name}`);
            return { status: 'skipped', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        // 🟢 ID GENERATION: HASH(PATH) -> The New Primary Key
        if (!file.path) {
            logger.error(`💥 [INGEST ERROR] File missing path: ${file.name}`);
            return { status: 'error', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        const docId = crypto.createHash('sha256').update(file.path).digest('hex');
        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(docId);

        // 2. HASH CHECK (Upsert Logic)
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        const fileDoc = await fileRef.get();
        const storedHash = fileDoc.exists ? fileDoc.data()?.contentHash : null;

        if (storedHash === currentHash) {
            logger.info(`⏩ [INGEST] Hash Match for ${file.path}. Updating metadata only.`);
            // Ensure path and saga are updated even on skip (in case they changed for same content?? Unlikely but good practice)
            await fileRef.set({
                lastIndexed: new Date().toISOString(),
                path: file.path,
                saga: file.saga || 'Global',
                driveId: file.id // Keep legacy link
            }, { merge: true });

            return { status: 'skipped', hash: currentHash, chunksCreated: 0, chunksDeleted: 0 };
        }

        logger.info(`⚡ [INGEST] Content Change for ${file.path} (Saga: ${file.saga}). Processing...`);

        // 3. CLEANUP OLD CHUNKS
        const chunksRef = fileRef.collection("chunks");
        let deletedCount = 0;
        const snapshot = await chunksRef.get();

        if (!snapshot.empty) {
            let batch = db.batch();
            let operationCount = 0;

            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                operationCount++;
                deletedCount++;

                if (operationCount >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    operationCount = 0;
                }
            }

            if (operationCount > 0) {
                await batch.commit();
            }
        }

        // 4. VECTORIZE & SAVE
        // Note: Currently we treat the whole file as one chunk (up to a limit),
        // mimicking the logic from the original indexTDB.
        // In the future, a proper splitter should be used here.
        const chunkText = content.substring(0, 8000);
        const now = new Date().toISOString();

        // 🟢 NARRATIVE INTENT LOGIC (AUTO-CLASSIFIER)
        let narrativeIntent: string | null = null;
        if (file.path.endsWith('Ideas.md')) {
            narrativeIntent = 'TRAMA_PROBABLE';
        } else if (file.path.endsWith('Que he Aprendido.md')) {
            narrativeIntent = 'REGLA_ESTILISTICA';
        }

        // Update File Metadata (UPSERT)
        const fileMetadata: any = {
            name: file.name,
            path: file.path,
            saga: file.saga || 'Global',
            driveId: file.id, // Legacy link
            lastIndexed: now,
            chunkCount: 1,
            category: file.category || 'canon',
            timelineDate: null,
            contentHash: currentHash
        };

        if (narrativeIntent) {
            fileMetadata.narrativeIntent = narrativeIntent;
        }

        await fileRef.set(fileMetadata);

        // Embed
        const vector = await embeddingsModel.embedQuery(chunkText);

        // Save Chunk
        // Note: chunks now live under the Hashed Path ID, not the Drive ID.
        const chunkPayload: any = {
            userId: userId,
            projectId: projectId, // 👈 New: Strict Project Scoping
            fileName: file.name,
            text: chunkText,
            docId: docId, // Hashed Path ID
            driveId: file.id, // Original Drive ID reference
            folderId: file.parentId || 'unknown',
            path: file.path, // 👈 New: Full Path for Filtering
            saga: file.saga || 'Global', // 👈 New: Saga Context
            timestamp: now,
            type: 'file',
            category: file.category || 'canon',
            embedding: FieldValue.vector(vector)
        };

        if (narrativeIntent) {
            chunkPayload.narrativeIntent = narrativeIntent;
        }

        await chunksRef.doc("chunk_0").set(chunkPayload);

        logger.info(`   ✨ [INGEST] Indexed: ${file.name}`);

        return {
            status: 'processed',
            hash: currentHash,
            chunksCreated: 1,
            chunksDeleted: deletedCount
        };

    } catch (error: any) {
        logger.error(`💥 [INGEST ERROR] Failed to ingest ${file.name}:`, error);
        return { status: 'error', hash: '', chunksCreated: 0, chunksDeleted: 0 };
    }
}

/**
 * DELETE VECTORS (The Eraser)
 * Removes all trace of a file from the vector index and metadata.
 */
export async function deleteFileVectors(
    db: FirebaseFirestore.Firestore,
    userId: string,
    fileId: string
): Promise<number> {
    try {
        // 1. Delete Chunks (Vector Data)
        // We use Collection Group to find chunks regardless of where they are nested (though usually under TDB_Index/files)
        const chunksQuery = db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("driveId", "==", fileId);

        const snapshot = await chunksQuery.get();
        let deletedCount = 0;

        if (!snapshot.empty) {
            let batch = db.batch();
            let count = 0;

            for (const doc of snapshot.docs) {
                batch.delete(doc.ref);
                count++;
                deletedCount++;

                if (count >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    count = 0;
                }
            }

            if (count > 0) {
                await batch.commit();
            }
        }

        // 2. Delete File Metadata (TDB_Index Entry)
        // We find the parent file doc by driveId
        const filesQuery = db.collection("TDB_Index").doc(userId).collection("files").where("driveId", "==", fileId);
        const filesSnap = await filesQuery.get();

        if (!filesSnap.empty) {
            let batch = db.batch();
            for (const doc of filesSnap.docs) {
                // Also recursively delete subcollections?
                // We just deleted chunks via collectionGroup, but there might be stragglers or other subcols?
                // Ideally recursive delete, but batch delete is safer/faster for simple structure.
                // Since we deleted chunks already, deleting the parent doc is fine.
                // But Firestore recommends deleting subcollections first. We did that (chunks).
                batch.delete(doc.ref);
            }
            await batch.commit();
        }

        logger.info(`🗑️ [DELETE VECTORS] Cleared ${deletedCount} chunks and metadata for file ${fileId}`);
        return deletedCount;

    } catch (error) {
        logger.error(`💥 [DELETE VECTORS ERROR] Failed to delete vectors for ${fileId}:`, error);
        return 0;
    }
}
