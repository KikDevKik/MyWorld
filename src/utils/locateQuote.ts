/**
 * Ubica una cita (copiada por la IA) dentro del texto del editor y devuelve posiciones en el texto ORIGINAL.
 * Nov 2026: la IA a veces cambia detalles al copiar (comillas, rayas, «…» por «...», tildes que «corrige»,
 * signos ¡! o mayúsculas, asteriscos de Markdown). Se prueba en pasadas cada vez más tolerantes:
 *   1) exacta; 2) sin mayúsculas, espacios dobles ni tipos de comillas/guiones; 3) además sin tildes ni
 *   puntuación; 4) el tramo más largo de palabras seguidas de la cita (mín. 4 palabras, o 1 si la cita es corta).
 */
type Pos = { from: number; to: number };

const stripMarks = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '');

function build(doc: string, loose: boolean) {
    const map: number[] = [];
    let n = '';
    for (let k = 0; k < doc.length; k++) {
        const c = normChar(doc[k], loose);
        if (c === '') continue;
        if (c === ' ' && (n === '' || n.endsWith(' '))) continue;
        n += c; map.push(k);
    }
    return { n, map };
}
function normChar(ch: string, loose: boolean): string {
    if (/\s/.test(ch)) return ' ';
    if (ch === '…') return loose ? '' : '.';
    if (/[«»“”"„]/.test(ch)) return loose ? '' : '"';
    if (/[‘’'`]/.test(ch)) return loose ? '' : "'";
    if (/[—–‒-]/.test(ch)) return loose ? ' ' : '-';
    if (/[*_~#]/.test(ch)) return '';
    let c = ch.toLowerCase();
    if (loose) {
        c = stripMarks(c);
        if (/[¡!¿?.,;:()[\]{}]/.test(c)) return ' ';
    }
    return c;
}
function normQuote(q: string, loose: boolean) {
    let n = '';
    for (const ch of q) { const c = normChar(ch, loose); if (c === '') continue; if (c === ' ' && (n === '' || n.endsWith(' '))) continue; n += c; }
    return n.trim();
}
function findIn(doc: string, q: string, loose: boolean, startAt: number): Pos | null {
    const { n, map } = build(doc, loose);
    const nq = normQuote(q, loose);
    if (nq.length < 2) return null;
    const startN = map.findIndex(i => i >= startAt);
    let j = startN > 0 ? n.indexOf(nq, startN) : -1;
    if (j < 0) j = n.indexOf(nq);
    if (j < 0) return null;
    return { from: map[j], to: map[j + nq.length - 1] + 1 };
}

export function locateQuote(doc: string, quote: string, startAt = 0): Pos | null {
    const q = (quote || '').replace(/^[\s"«“']+|[\s"»”']+$/g, '').replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, '').trim();
    if (!q || q.length < 2) return null;
    let i = doc.indexOf(q, startAt);
    if (i < 0 && startAt > 0) i = doc.indexOf(q);
    if (i >= 0) return { from: i, to: i + q.length };
    const strict = findIn(doc, q, false, startAt);
    if (strict) return strict;
    const loose = findIn(doc, q, true, startAt);
    if (loose) return loose;
    // 4) tramo más largo de palabras seguidas que sí aparece.
    const words = normQuote(q, true).split(' ').filter(Boolean);
    const min = words.length <= 3 ? 1 : 4;
    for (let len = words.length - 1; len >= min; len--) {
        for (let s = 0; s + len <= words.length; s++) {
            const part = words.slice(s, s + len).join(' ');
            if (len < 2 && part.length < 4) continue;
            const hit = findIn(doc, part, true, startAt);
            if (hit) return hit;
        }
    }
    return null;
}

/** Palabra con error ortográfico: se busca dentro de su cita; si no, la aparición (como palabra entera) más cercana. */
export function locateWord(doc: string, word: string, cita?: string): Pos | null {
    const w = (word || '').trim();
    if (!w) return null;
    const area = cita ? locateQuote(doc, cita) : null;
    const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
    const occurrences = (from: number, to: number) => {
        const out: number[] = [];
        let k = doc.indexOf(w, from);
        while (k >= 0 && k < to) {
            if (!isWordChar(doc[k - 1]) && !isWordChar(doc[k + w.length])) out.push(k);
            k = doc.indexOf(w, k + 1);
        }
        return out;
    };
    if (area) {
        const inside = occurrences(Math.max(0, area.from - 2), area.to + 2);
        if (inside.length) return { from: inside[0], to: inside[0] + w.length };
        return area;
    }
    const all = occurrences(0, doc.length);
    if (all.length) return { from: all[0], to: all[0] + w.length };
    return locateQuote(doc, w);
}
