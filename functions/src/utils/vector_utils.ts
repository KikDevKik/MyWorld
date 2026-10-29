import { GoogleGenerativeAI, TaskType } from "./genai";
import * as logger from "firebase-functions/logger";

/**
 * GEMINI EMBEDDER WRAPPER
 * Replaces LangChain's GoogleGenerativeAIEmbeddings to ensure strict control over:
 * 1. Model selection (gemini-embedding-001 -> 768 dimensions)
 * 2. Input truncation (avoid API errors)
 * 3. Output dimensionality (prevent > 2048 errors in Firestore)
 */
// Oct 2026: límite del nivel gratuito = 100 embeddings/min por proyecto.
// Regulador simple por instancia (ventana deslizante) + reintento al recibir 429.
const EMBED_WINDOW_MS = 60_000;
const EMBED_MAX_PER_WINDOW = 85;
let embedSent: number[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function acquireEmbedSlots(n: number) {
    for (;;) {
        const now = Date.now();
        embedSent = embedSent.filter(t => now - t < EMBED_WINDOW_MS);
        if (embedSent.length + n <= EMBED_MAX_PER_WINDOW) {
            for (let i = 0; i < n; i++) embedSent.push(now);
            return;
        }
        const waitMs = Math.min(EMBED_WINDOW_MS - (now - embedSent[0]) + 250, 15_000);
        await sleep(Math.max(waitMs, 500));
    }
}
function retryDelayMs(err: any): number | null {
    const msg = String(err?.message || '');
    if (!msg.includes('429')) return null;
    const m = msg.match(/retry in ([\d.]+)s/i);
    return (m ? Math.ceil(parseFloat(m[1]) * 1000) : 30_000) + 1000;
}

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
            await acquireEmbedSlots(1);
            let result: any;
            try {
                result = await this.model.embedContent({
                    content: { role: 'user', parts: [{ text: processedText }] },
                    taskType: this.taskType,
                    // Oct 2026: pedir 768 directo (antes llegaban 3072 y se recortaban). Si el SDK lo ignora, se recorta abajo.
                    outputDimensionality: 768,
                } as any);
            } catch (e: any) {
                const d = retryDelayMs(e);
                if (d === null || d > 65_000) throw e;
                await sleep(d);
                embedSent = [];
                result = await this.model.embedContent({
                    content: { role: 'user', parts: [{ text: processedText }] },
                    taskType: this.taskType,
                    // Oct 2026: pedir 768 directo (antes llegaban 3072 y se recortaban). Si el SDK lo ignora, se recorta abajo.
                    outputDimensionality: 768,
                } as any);
            }

            const vector = result.embedding.values;

            // 3. Dimensionality Check (The Fix)
            if (vector.length > 2048) {
                // Oct 2026: gemini-embedding-001 devuelve 3072 dims por defecto; recortar a 768 es esperado
                // (representación Matryoshka) y coincide con el índice vectorial. No es un error.
                logger.debug(`[EMBEDDER] ${vector.length} dims -> 768 (${this.modelName})`);
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
        // Oct 2026: usar batchEmbedContents (hasta 100 textos por llamada) para gastar
        // muchas menos peticiones de la cuota gratuita que una llamada por fragmento.
        const SAFE_CHAR_LIMIT = 9000;
        const out: number[][] = [];
        const BATCH = 40;
        for (let i = 0; i < documents.length; i += BATCH) {
            const slice = documents.slice(i, i + BATCH).map(d => (d && typeof d === 'string' ? d : ' ').substring(0, SAFE_CHAR_LIMIT));
            let done = false;
            for (let attempt = 0; attempt < 4 && !done; attempt++) {
                try {
                    await acquireEmbedSlots(slice.length);
                    const res = await this.model.batchEmbedContents({
                        requests: slice.map(text => ({ content: { role: 'user', parts: [{ text }] }, taskType: this.taskType, outputDimensionality: 768 } as any)),
                    });
                    for (const e of res.embeddings || []) {
                        const v: number[] = e.values || [];
                        out.push(v.length > 2048 ? v.slice(0, 768) : v);
                    }
                    done = true;
                } catch (err: any) {
                    const d = retryDelayMs(err);
                    if (d !== null && d <= 65_000) {
                        logger.info(`[EMBEDDER] Límite de cuota alcanzado; esperando ${Math.round(d / 1000)} s (intento ${attempt + 1}).`);
                        embedSent = embedSent.concat(new Array(EMBED_MAX_PER_WINDOW).fill(Date.now()));
                        await sleep(d);
                        continue;
                    }
                    throw err; // error no recuperable (o cuota diaria): que lo maneje quien llama
                }
            }
            if (!done) throw new Error('EMBED_QUOTA: no se pudo generar embeddings tras varios intentos.');
        }
        return out;
    }
}
