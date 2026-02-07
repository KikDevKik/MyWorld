import * as logger from "firebase-functions/logger";
import { GoogleAIFileManager, GoogleAICacheManager } from "@google/generative-ai/server";

// Standard TTL: 60 minutes (Cost efficient)
const DEFAULT_TTL_SECONDS = 3600;

export interface CacheResult {
    cacheName: string;
    expirationTime: string;
    fileUri: string;
    tokenCount: number;
}

/**
 * 🧠 CONTEXT CACHING MANAGER
 * Handles the creation and management of Gemini Context Caches for "God Mode".
 */
export async function createProjectCache(
    apiKey: string,
    uniqueName: string, // e.g. "project-123-v5"
    content: string,
    modelName: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<CacheResult> {
    try {
        const fileManager = new GoogleAIFileManager(apiKey);
        const cacheManager = new GoogleAICacheManager(apiKey);

        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        // 1. Create Temp File
        const tempFilePath = path.join(os.tmpdir(), `${uniqueName}.txt`);
        fs.writeFileSync(tempFilePath, content);

        logger.info(`📦 [CACHE] Temporary file created at ${tempFilePath} (${content.length} chars)`);

        // 2. Upload File to Gemini (for Caching)
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: "text/plain",
            displayName: uniqueName,
        });

        logger.info(`🚀 [CACHE] File uploaded: ${uploadResponse.file.uri} (State: ${uploadResponse.file.state})`);

        // Wait for file to be active? Usually text is instant.

        // 3. Create Cached Content
        // The cache stores the TOKENS of the file.
        const cacheResult = await cacheManager.create({
            model: modelName,
            displayName: uniqueName,
            contents: [
                {
                    role: 'user',
                    parts: [{ fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } }]
                }
            ],
            ttlSeconds: ttlSeconds
        });

        logger.info(`🧠 [CACHE] Cache Created: ${cacheResult.name} (Exp: ${cacheResult.expireTime})`);

        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        return {
            cacheName: cacheResult.name,
            expirationTime: cacheResult.expireTime,
            fileUri: uploadResponse.file.uri,
            tokenCount: 0 // TODO: Get from result if available
        };

    } catch (error: any) {
        logger.error("💥 [CACHE ERROR]", error);
        throw error;
    }
}

/**
 * CHECK CACHE STATUS
 */
export async function getCacheStatus(apiKey: string, cacheName: string): Promise<any> {
    try {
        const cacheManager = new GoogleAICacheManager(apiKey);
        const cache = await cacheManager.get(cacheName);
        return cache;
    } catch (e) {
        logger.warn(`Cache ${cacheName} check failed:`, e);
        return null;
    }
}
