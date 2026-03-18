import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";

/**
 * GEMINI EMBEDDER WRAPPER
 * Replaces LangChain's GoogleGenerativeAIEmbeddings to ensure strict control over:
 * 1. Model selection (gemini-embedding-001 -> 768 dimensions)
 * 2. Input truncation (avoid API errors)
 * 3. Output dimensionality (prevent > 2048 errors in Firestore)
 */
export class GeminiEmbedder {
    private model: any;
    private apiKey: string;
    private modelName: string;
    private taskType: TaskType;

    constructor(fields: { apiKey: string, model?: string, taskType?: TaskType }) {
        this.apiKey = fields.apiKey;
        this.modelName = fields.model || "gemini-embedding-001";
        this.taskType = fields.taskType || TaskType.RETRIEVAL_DOCUMENT;

        const genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = genAI.getGenerativeModel({ model: this.modelName });
    }

    /**
     * Embeds a query or document text.
     * Guaranteed to return a single vector (number[]).
     */
    async embedQuery(text: string): Promise<number[]> {
        // 1. Validate Input
        if (!text || typeof text !== 'string') {
            logger.warn("⚠️ [EMBEDDER] Empty or invalid text provided. Returning zero vector.");
            return new Array(768).fill(0);
        }

        // 2. Truncate (Safe limit for gemini-embedding-001 is 2048 tokens)
        // We use a char limit of 9000 to be safe (approx 2200 tokens, might clip but safe)
        // If text is extremely long, we take the beginning.
        // Strategy A (Best): Use ONLY the Content vector (truncated).
        const SAFE_CHAR_LIMIT = 9000;
        const processedText = text.length > SAFE_CHAR_LIMIT ? text.substring(0, SAFE_CHAR_LIMIT) : text;

        try {
            const result = await this.model.embedContent({
                content: { role: 'user', parts: [{ text: processedText }] },
                taskType: this.taskType
            });

            const vector = result.embedding.values;

            // 3. Dimensionality Check (The Fix)
            if (vector.length > 2048) {
                logger.error(`💥 [EMBEDDER] DIMENSION OVERFLOW: ${vector.length}. Model: ${this.modelName}. Truncating to 768.`);
                // If model returns huge vector (e.g. concatenated), we must fix it.
                // gemini-embedding-001 should be 768.
                return vector.slice(0, 768);
            }

            return vector;

        } catch (error: any) {
            logger.error(`💥 [EMBEDDER] Failed to embed text: ${error.message}`);
            // Rethrowing is safer to alert caller of failure.
            throw error;
        }
    }

    /**
     * Batch embedding for compatibility with LangChain interface.
     */
    async embedDocuments(documents: string[]): Promise<number[][]> {
        return Promise.all(documents.map(doc => this.embedQuery(doc)));
    }
}
