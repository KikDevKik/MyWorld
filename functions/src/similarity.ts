
/**
 * Calcula la Similitud de Coseno entre dos vectores.
 * @param vecA Primer vector de números.
 * @param vecB Segundo vector de números.
 * @returns El valor de similitud entre -1 y 1.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
        throw new Error("Los vectores deben tener la misma longitud");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface Chunk {
    text: string;
    embedding: number[];
    [key: string]: any; // Permitir otras propiedades si es necesario
}

/**
 * Encuentra los 5 chunks más similares al vector de consulta.
 * @param queryVector Vector de la consulta.
 * @param chunks Array de chunks con sus embeddings.
 * @returns Los 5 chunks más similares ordenados por similitud descendente.
 */
export function findMostSimilarChunks(
    queryVector: number[],
    chunks: Chunk[]
): Chunk[] {
    return chunks
        .map((chunk) => ({
            chunk,
            similarity: cosineSimilarity(queryVector, chunk.embedding),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5)
        .map((item) => item.chunk);
}
