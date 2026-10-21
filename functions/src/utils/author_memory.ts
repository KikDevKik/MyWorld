// Oct 2026: memoria compartida del autor (v1).
// Si el canon tiene un archivo "Memoria del autor.md", su contenido se incluye en CADA
// mensaje del Director y del Arquitecto (no depende de la búsqueda por similitud).
// Vive en Drive como cualquier archivo del canon, así que Obsidian también lo ve.
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const NAMES = ["Memoria del autor.md", "Memoria del Autor.md", "MEMORIA DEL AUTOR.md", "memoria del autor.md"];
const MAX_CHARS = 6000;
const cache = new Map<string, { at: number; text: string }>();

export async function getAuthorMemory(uid?: string): Promise<string> {
    if (!uid) return "";
    const hit = cache.get(uid);
    if (hit && Date.now() - hit.at < 120_000) return hit.text;
    let text = "";
    try {
        const db = getFirestore();
        const files = await db.collection("TDB_Index").doc(uid).collection("files").where("name", "in", NAMES).limit(1).get();
        if (!files.empty) {
            const chunks = await files.docs[0].ref.collection("chunks").get();
            text = chunks.docs
                .sort((a, b) => parseInt(a.id.replace(/\D/g, "") || "0") - parseInt(b.id.replace(/\D/g, "") || "0"))
                .map(d => d.data()?.text || "")
                .join("\n\n")
                .slice(0, MAX_CHARS);
        }
    } catch (e: any) {
        logger.warn(`[AUTHOR_MEMORY] No se pudo leer: ${e?.message}`);
    }
    cache.set(uid, { at: Date.now(), text });
    return text;
}

export function authorMemoryBlock(text: string): string {
    if (!text.trim()) return "";
    return `[MEMORIA DEL AUTOR — decisiones y contexto que el autor quiere que tengas SIEMPRE presentes. Tienen prioridad sobre suposiciones; si el canon las contradice, señálalo.]\n${text}`;
}
