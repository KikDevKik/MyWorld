import * as crypto from 'crypto';
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export interface IngestionFile {
  id: string; // Drive ID (The Primary Key)
  name: string;
  path: string;
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
    projectId: string, // Project Anchor
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

        // 🟢 ID STRATEGY: DRIVE ID IS KING 👑 (Titanium Spec)
        if (!file.id) {
            logger.error(`💥 [INGEST ERROR] File missing Drive ID: ${file.name}`);
            return { status: 'error', hash: '', chunksCreated: 0, chunksDeleted: 0 };
        }

        const docId = file.id; // Use Drive ID directly
        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(docId);

        // 2. HASH CHECK (Upsert Logic)
        // We hash the content to detect changes.
        const currentHash = crypto.createHash('sha256').update(content).digest('hex');

        const fileDoc = await fileRef.get();
        const storedHash = fileDoc.exists ? fileDoc.data()?.contentHash : null;

        // 🟢 DIRTY CHECK: Compare Hash AND Ensure Metadata is fresh
        if (storedHash === currentHash && fileDoc.exists) {
            logger.info(`⏩ [INGEST] Hash Match for ${file.name} (${file.id}). Updating metadata only.`);

            // Sync metadata (Name, Path, Parent) even if content is same
            await fileRef.set({
                name: file.name,
                path: file.path,
                saga: file.saga || 'Global',
                parentId: file.parentId || null,
                category: file.category || 'canon',
                lastIndexed: new Date().toISOString(), // Touch timestamp
                updatedAt: new Date().toISOString(),   // 🟢 CRITICAL: Enforce Timestamp Contract
                driveId: file.id, // Redundant but safe
                contentHash: currentHash // 🟢 Explicit persistence just in case
            }, { merge: true });

            return { status: 'skipped', hash: currentHash, chunksCreated: 0, chunksDeleted: 0 };
        }

        logger.info(`⚡ [INGEST] Content Change for ${file.name} (Saga: ${file.saga}). Processing...`);

        // 3. CLEANUP OLD CHUNKS
        // Since we are reusing the docId (DriveId), we wipe existing chunks under it.
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
        // Note: Currently we treat the whole file as one chunk (up to a limit).
        // Future: Splitter logic goes here.
        const chunkText = content.substring(0, 8000);
        const now = new Date().toISOString();

        // 🟢 NARRATIVE INTENT LOGIC (AUTO-CLASSIFIER)
        let narrativeIntent: string | null = null;
        if (file.path && file.path.endsWith('Ideas.md')) {
            narrativeIntent = 'TRAMA_PROBABLE';
        } else if (file.path && file.path.endsWith('Que he Aprendido.md')) {
            narrativeIntent = 'REGLA_ESTILISTICA';
        }

        // Update File Metadata (UPSERT)
        const fileMetadata: any = {
            name: file.name,
            path: file.path || file.name,
            saga: file.saga || 'Global',
            driveId: file.id, // Explicit field
            parentId: file.parentId || null, // 🟢 STORE PARENT ID for Hierarchy
            lastIndexed: now,
            updatedAt: now, // 🟢 CRITICAL: Timestamp Contract
            chunkCount: 1,
            category: file.category || 'canon',
            timelineDate: null,
            contentHash: currentHash // 🟢 CRITICAL: Hash Persistence
        };

        if (narrativeIntent) {
            fileMetadata.narrativeIntent = narrativeIntent;
        }

        await fileRef.set(fileMetadata);

        // Embed
        const vector = await embeddingsModel.embedQuery(chunkText);

        // Save Chunk
        const chunkPayload: any = {
            userId: userId,
            projectId: projectId,
            fileName: file.name,
            text: chunkText,
            docId: docId, // Drive ID
            driveId: file.id, // Drive ID
            folderId: file.parentId || 'unknown',
            path: file.path || file.name,
            saga: file.saga || 'Global',
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
        // We use Collection Group to find chunks regardless of where they are nested
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
        // 🟢 DIRECT ID ACCESS (Titanium Spec)
        // Since docId IS the fileId (Drive ID), we can delete directly.
        const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(fileId);

        // Check if exists first to log properly? Or just delete.
        await fileRef.delete();
        // Also ensure subcollections are gone? 'chunks' were deleted via collectionGroup,
        // but if we used subcollection on this doc, recursive delete is safer.
        // But collectionGroup query + direct doc delete covers 99%.
        // For absolute safety regarding potential leftover subcollections (like stats?):
        // await db.recursiveDelete(fileRef); // Requires Cloud Functions permission usually.
        // Stick to simple delete for speed, as we manually cleared chunks.

        logger.info(`🗑️ [DELETE VECTORS] Cleared ${deletedCount} chunks and metadata for file ${fileId}`);
        return deletedCount;

    } catch (error) {
        logger.error(`💥 [DELETE VECTORS ERROR] Failed to delete vectors for ${fileId}:`, error);
        return 0;
    }
}
