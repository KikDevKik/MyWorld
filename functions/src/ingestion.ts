import * as crypto from 'crypto';
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export interface IngestionFile {
  id: string;
  name: string;
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

        // 2. HASH CHECK
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');
        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(file.id);
        const fileDoc = await fileRef.get();
        const storedHash = fileDoc.exists ? fileDoc.data()?.contentHash : null;

        if (storedHash === currentHash) {
            logger.info(`⏩ [INGEST] Hash Match for ${file.name}. Skipping vectors.`);
            await fileRef.update({ lastIndexed: new Date().toISOString() });
            return { status: 'skipped', hash: currentHash, chunksCreated: 0, chunksDeleted: 0 };
        }

        logger.info(`⚡ [INGEST] Hash Mismatch/New for ${file.name}. Processing...`);

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

        // Update File Metadata
        await fileRef.set({
            name: file.name,
            lastIndexed: now,
            chunkCount: 1,
            category: file.category || 'canon',
            timelineDate: null,
            contentHash: currentHash
        });

        // Embed
        const vector = await embeddingsModel.embedQuery(chunkText);

        // Save Chunk
        await chunksRef.doc("chunk_0").set({
            userId: userId,
            fileName: file.name,
            text: chunkText,
            docId: file.id,
            folderId: file.parentId || 'unknown',
            timestamp: now,
            type: 'file',
            category: file.category || 'canon',
            embedding: FieldValue.vector(vector)
        });

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
