/**
 * Oct 2026: huella corta de un texto para detectar si un archivo cambió en Drive
 * (p. ej. editado en Obsidian) desde que MyWorld lo abrió. FNV-1a 32 bits sobre el
 * texto normalizado (saltos de línea \n, sin espacios al final). Debe ser IDÉNTICA
 * en el frontend (src/utils/textHash.ts) y en functions (functions/src/utils/text_hash.ts).
 */
export function textHash(text: string): string {
    const s = (text || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + ':' + s.length;
}
