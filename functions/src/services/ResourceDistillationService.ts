import * as logger from "firebase-functions/logger";

export class ResourceDistillationService {
    /**
     * Extrae la esencia de un recurso para cristalizarlo como una WorldEntity (RESOURCE).
     * @param fileName Nombre del archivo analizado
     * @param content Contenido de texto extraído
     * @param aiModel Instancia del modelo de IA (Gemini)
     */
    static async distill(
        fileName: string,
        content: string,
        aiModel: any
    ): Promise<{ summary: string; tags: string[]; name: string; smartTags: string[] } | null> {
        if (!content || content.trim().length === 0) return null;

        const prompt = `
            ACT AS: Archivista de Conocimiento y Analista.
            TASK: Acabas de recibir un documento de referencia o recurso de inspiración titulado "${fileName}".
            Analiza su contenido y extrae su esencia narrativa o conceptual para integrarlo a una base de datos de Worldbuilding como un nodo de inspiración.

            REGLAS:
            1. Devuelve estrictamente un objeto JSON con la siguiente estructura:
               {
                 "name": "Un nombre corto y representativo del concepto o recurso (máx 5 palabras)",
                 "summary": "Un resumen de 1-2 párrafos destilando las ideas principales o la inspiración que aporta. ¿De qué trata y cómo puede servir de inspiración?",
                 "tags": ["Etiqueta1", "Etiqueta2"], // Etiquetas temáticas descriptivas
                 "smartTags": ["LORE", "VISUAL", "CIENCIA", "INSPIRACIÓN", "AUDIO", "OTROS"] // Elige 1 o 2 de estas categorías maestras
               }
            2. No devuelvas markdown, solo el JSON bruto.
            3. Si el texto es puro ruido sin sentido, devuelve null.

            CONTENIDO DEL RECURSO:
            """
            ${content.substring(0, 15000)} 
            """
        `;

        try {
            if (aiModel && aiModel.generateContent) {
                const result = await aiModel.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });
                const rawText = result.response.text();
                const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
                
                if (cleanJson === "null") return null;
                
                const distillation = JSON.parse(cleanJson);
                return distillation;
            }
        } catch (e) {
            logger.error(`[DistillationService] Failed to distill resource ${fileName}`, e);
        }
        return null;
    }
}
