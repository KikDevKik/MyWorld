/**
 * Oct 2026: ubica una cita (copiada por la IA) dentro del texto del editor.
 * 1) búsqueda exacta; 2) si falla, ignora mayúsculas, espacios repetidos y tipos de comillas/guiones.
 * Devuelve posiciones en el texto ORIGINAL o null.
 */
export function locateQuote(doc: string, quote: string, startAt = 0): { from: number; to: number } | null {
    const q = (quote || '').trim();
    if (!q || q.length < 3) return null;
    let i = doc.indexOf(q, startAt);
    if (i < 0 && startAt > 0) i = doc.indexOf(q);
    if (i >= 0) return { from: i, to: i + q.length };

    const norm = (c: string) => {
        if (/\s/.test(c)) return ' ';
        if (/[«»“”"]/.test(c)) return '"';
        if (/[‘’']/.test(c)) return "'";
        if (/[—–-]/.test(c)) return '-';
        return c.toLowerCase();
    };
    // texto normalizado con mapa de posiciones al original
    const map: number[] = [];
    let n = '';
    for (let k = 0; k < doc.length; k++) {
        const c = norm(doc[k]);
        if (c === ' ' && n.endsWith(' ')) continue;
        n += c; map.push(k);
    }
    let nq = '';
    for (const ch of q) { const c = norm(ch); if (c === ' ' && nq.endsWith(' ')) continue; nq += c; }
    nq = nq.trim();
    const j = n.indexOf(nq);
    if (j < 0) return null;
    return { from: map[j], to: map[j + nq.length - 1] + 1 };
}
