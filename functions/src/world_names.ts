// Nov 2026: Revisión del canon con Mira («Nombres del mundo»).
// Como el corrector ortográfico, pero para el canon. Tres cosas:
//  1) Nombres: un concepto escrito con dos nombres (un renombre a medias como «Anima Fusione» / «Fusione»,
//     o variantes como «Psico-Energía» / «Psico Energía»). Incluye los títulos de los documentos.
//  2) Documentos repetidos: copias casi iguales con distinto nombre (un borrador viejo y el actual) y dos
//     fichas del mismo tema en carpetas distintas. Se muestra hasta dónde llega cada uno y qué tiene solo él.
//  3) Cambiar un nombre a mano en todo el canon (texto, enlaces [[ ]] y el título del documento).
// Las decisiones pasan al Arquitecto y a la memoria para que ninguna IA trate un concepto como dos.
//
// Detección barata: términos, conteos y parecido entre documentos se calculan sin IA; la IA solo agrupa
// los términos que son el mismo concepto. Los reemplazos son deterministas y con vista previa.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { GoogleGenerativeAI } from "./utils/genai";
import { getAIKey, getTier } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";
import { memoryCol, slugify, invalidateMemoryCache } from "./utils/memory_store";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

interface VariantFile { fileId: string; fileName: string; count: number; sample: string }
interface Variant { name: string; total: number; files: VariantFile[]; titles?: { fileId: string; fileName: string }[] }
interface NameGroup { id: string; variants: Variant[]; suggested: string; reason: string; kind: "renombre" | "ortografia" | "manual" }
interface NameDecision { canonical: string; others: string[]; kind: "mismo" | "distintos"; at: string; applied?: number }
interface DocInfo { fileId: string; name: string; folder: string; words: number; reach: number; modifiedTime?: string; uniqueWords: number; uniqueSample: string }
interface DocPair { id: string; kind: "copia" | "mismo_tema"; overlap: number; a: DocInfo; b: DocInfo }
interface DocDecision { ids: string[]; kind: "distintos" | "archivado"; keep?: string; at: string }
interface NamesState { groups: NameGroup[]; decisions: NameDecision[]; docs: DocPair[]; docDecisions: DocDecision[]; checkedAt?: string }
interface CorpusFile { id: string; name: string; path: string; text: string }

// Firestore no acepta undefined (p. ej. una fecha de Drive que no llegó): se limpian antes de guardar.
const clean = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const stateRef = (uid: string) => getFirestore().collection("users").doc(uid).collection("world_names").doc("state");

async function loadState(uid: string): Promise<NamesState> {
    const d: any = (await stateRef(uid).get()).data() || {};
    return { groups: d.groups || [], decisions: resolveChains(d.decisions || []), docs: d.docs || [], docDecisions: d.docDecisions || [], checkedAt: d.checkedAt };
}

// La memoria «Nombres del mundo» se reescribe entera desde las decisiones (sin líneas viejas que se contradigan).
async function syncNamesMemory(uid: string, decisions: NameDecision[]) {
    try {
        const now = new Date().toISOString();
        const lines = decisions.map((d, i) => ({
            id: `n${i}_${Date.now().toString(36)}`, at: d.at || now, source: "nombres",
            text: d.kind === "distintos"
                ? `«${d.canonical}» y ${d.others.map(o => `«${o}»`).join(", ")} son conceptos distintos.`
                : `«${d.canonical}» es el nombre actual; ${d.others.map(o => `«${o}»`).join(", ")} es el nombre antiguo o una variante. Usar «${d.canonical}».`,
        }));
        await memoryCol(uid).doc(slugify("Nombres del mundo")).set({ name: "Nombres del mundo", kind: "libro", description: "Cómo se llama cada concepto del mundo (decidido en la Revisión del canon).", lines, updatedAt: now }, { merge: true });
        invalidateMemoryCache(uid);
    } catch (e: any) { logger.warn(`[NOMBRES] Memoria: ${e?.message}`); }
}

// Nov 2026: renombres en cadena. «Psico-Energía → Psico Energía» y después «Psico Energía → Anima» deben quedar
// como una sola decisión («Anima» en vez de las tres); si no, el Arquitecto recibe dos órdenes que se contradicen.
function resolveChains(list: NameDecision[]): NameDecision[] {
    const ds = list.map(x => ({ ...x, others: [...x.others] }));
    const f = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-\s]+/g, "");
    for (let i = 0; i < ds.length; i++) {
        if (ds[i].kind !== "mismo") continue;
        for (let j = i + 1; j < ds.length; j++) {
            if (ds[j].kind !== "mismo") continue;
            if (ds[j].others.some(o => f(o) === f(ds[i].canonical))) {
                const old = ds[i].canonical;
                ds[i] = { ...ds[i], canonical: ds[j].canonical, others: [...ds[i].others, old] };
            }
        }
    }
    const out: NameDecision[] = [];
    for (const d of ds) {
        const same = d.kind === "mismo" ? out.find(x => x.kind === "mismo" && f(x.canonical) === f(d.canonical)) : undefined;
        if (same) {
            same.others = [...same.others, ...d.others];
            same.applied = (same.applied || 0) + (d.applied || 0) || undefined;
            same.at = d.at > same.at ? d.at : same.at;
        } else out.push({ ...d });
    }
    for (const d of out) {
        // Se quitan solo los repetidos exactos: «KARLA» o «Psico Energia» son variantes reales que hay que nombrar.
        const seen = new Set<string>([d.canonical.trim()]);
        d.others = d.others.filter(o => { const k = o.trim(); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    return out.filter(d => d.others.length > 0);
}

/** Texto para los prompts del Arquitecto: los nombres que el autor ya decidió. */
export async function loadNameDecisionsText(uid: string): Promise<string> {
    try {
        const { decisions, docs } = await loadState(uid);
        const lines = decisions.slice(-30).map(d => d.kind === "distintos"
            ? `  · «${d.canonical}» y ${d.others.map(o => `«${o}»`).join(", ")} son conceptos distintos.`
            : `  · «${d.canonical}» es el nombre actual; ${d.others.map(o => `«${o}»`).join(", ")} es el nombre antiguo o una variante del mismo concepto. Usa «${d.canonical}».`
        );
        // Documentos repetidos sin resolver: que no los lea como dos fuentes distintas.
        for (const p of docs.slice(0, 10)) {
            lines.push(p.kind === "copia"
                ? `  · «${p.a.name}» y «${p.b.name}» son versiones casi iguales del mismo texto (el autor aún no decide cuál queda). No los trates como dos historias ni saques contradicciones de sus diferencias; si importa, pregúntale cuál es la vigente.`
                : `  · «${p.a.name}» y «${p.b.name}» tratan del mismo tema. Si se contradicen, no elijas tú: pregúntale al autor cuál es la versión oficial.`);
        }
        return lines.join("\n");
    } catch { return ""; }
}

// ── Corpus: el texto indexado del canon (incluye subcarpetas; sin pedir el token de Drive) ──
async function loadCorpus(uid: string): Promise<CorpusFile[]> {
    const db = getFirestore();
    const filesSnap = await db.collection("TDB_Index").doc(uid).collection("files").limit(250).get();
    const docs = filesSnap.docs.filter(d => {
        const x: any = d.data();
        return x.category !== "reference" && !/^memoria del autor\.md$/i.test(x.name || "");
    });
    const out: CorpusFile[] = [];
    for (let i = 0; i < docs.length; i += 15) {
        const part = await Promise.all(docs.slice(i, i + 15).map(async d => {
            const chunks = await d.ref.collection("chunks").select("text").get();
            const text = chunks.docs
                .sort((a, b) => Number(a.id.replace(/\D/g, "")) - Number(b.id.replace(/\D/g, "")))
                .map(c => String((c.data() as any).text || "")).join("\n\n");
            const x: any = d.data();
            return { id: d.id, name: String(x.name || d.id), path: String(x.path || x.name || ""), text };
        }));
        out.push(...part.filter(p => p.text.trim().length > 0));
    }
    return out;
}

const baseName = (name: string) => String(name || "").replace(/\.(md|txt|markdown)$/i, "").trim();
const folderOf = (f: CorpusFile) => {
    const parts = f.path.split("/").filter(Boolean);
    return parts.length > 1 ? parts.slice(0, -1).join(" / ") : "";
};

// ── Extracción de términos (sin IA) ──
const STOP = new Set(["El", "La", "Los", "Las", "Un", "Una", "Unos", "Unas", "Y", "O", "Pero", "Si", "No", "Sí", "En", "De", "Del", "Al", "A", "Con", "Por", "Para", "Que", "Qué", "Como", "Cómo", "Cuando", "Cuándo", "Donde", "Dónde", "Este", "Esta", "Estos", "Estas", "Ese", "Esa", "Eso", "Su", "Sus", "Lo", "Le", "Les", "Se", "Es", "Era", "Fue", "Hay", "Hace", "Ella", "Él", "Ellos", "Yo", "Tu", "Tú", "Mi", "Nos", "También", "Aun", "Aún", "Así", "Ya", "Sin", "Sobre", "Entre", "Desde", "Hasta", "Muy", "Más", "Todo", "Todos", "Cada", "Otro", "Otra", "Porque", "Entonces", "Luego", "Después", "Antes", "Ahora", "Además", "Incluso", "Mientras", "Aunque", "Bueno", "Obviamente", "Imagina", "Nota", "Ej", "Ejemplo", "Ver", "Fase", "Parte", "Capítulo", "The", "And", "Of", "Role", "Traits", "Type", "Tags", "Status", "Rol", "Rasgos", "Tipo", "Estado"]);
const LINK = new Set(["de", "del", "la", "las", "los", "el", "y"]);
const TERM_RE = /(?<![\p{L}\p{N}])([A-ZÁÉÍÓÚÑ][\p{L}]{1,}(?:(?:-|\s(?:(?:de|del|de\s+la|de\s+las|de\s+los)\s)?)[A-ZÁÉÍÓÚÑ][\p{L}]{1,}){0,3})(?![\p{L}\p{N}])/gu;

function extractTerms(files: CorpusFile[]) {
    const stats = new Map<string, { total: number; files: Set<string>; title: boolean }>();
    const lowerFreq = new Map<string, number>();
    // Nov 2026: expresiones comunes escritas en minúscula («en serio», «de verdad»), juntas y sin tildes.
    // Si un «término» con mayúscula es una de ellas («Enserio», «EN SERIO»), no es un nombre del mundo: es ortografía.
    const lowerPhrases = new Set<string>();
    for (const f of files) {
        const ws = f.text.match(/(?<![\p{L}])[a-záéíóúñ][\p{L}]*/gu) || [];
        for (const w of ws) if (w.length > 1) lowerFreq.set(w, (lowerFreq.get(w) || 0) + 1);
        for (let i = 0; i < ws.length; i++) {
            if (i + 1 < ws.length) lowerPhrases.add(foldWord(ws[i] + ws[i + 1]));
        }
    }
    const add = (t: string, fileId: string, title = false) => {
        const term = t.replace(/\s+/g, " ").trim();
        if (term.length < 3 || term.length > 48) return;
        const s = stats.get(term) || { total: 0, files: new Set<string>(), title: false };
        s.total++; s.files.add(fileId); if (title) s.title = true; stats.set(term, s);
    };
    for (const f of files) {
        // El título del documento también es un nombre: «Fusione.md» explica lo que el texto llama «Anima Fusione».
        const title = baseName(f.name);
        if (title && title.split(/\s+/).length <= 4 && /^[A-ZÁÉÍÓÚÑ]/.test(title)) add(title, f.id, true);
        // Nov 2026: sin metadatos (frontmatter y líneas «> **Role**: …», «> **Traits**: …» que MyWorld pone en las
        // fichas): en un proyecto nuevo la revisión decía que «Role» y «Traits» eran lo mismo con dos nombres.
        const text = f.text
            .replace(/^---\n[\s\S]*?\n---\n?/, "")
            .replace(/^>\s*\*\*[^*\n]{1,30}\*\*\s*:?.*$/gm, "")
            .replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1");
        for (const m of text.matchAll(TERM_RE)) {
            let term = m[1];
            const words = term.split(/\s+/);
            while (words.length && (STOP.has(words[0].replace(/-.*/, "")) || LINK.has(words[0]))) words.shift();
            while (words.length && LINK.has(words[words.length - 1])) words.pop();
            term = words.join(" ");
            if (!term) continue;
            // Gritos en los diálogos («EN SERIO», «QUÉ ESTUPIDEZ») no son nombres.
            if (term.length > 3 && term === term.toUpperCase() && /\p{Lu}{2}/u.test(term)) continue;
            if (term.split(/\s+/).length <= 2 && lowerPhrases.has(foldWord(term))) continue;
            if (!term.includes(" ") && !term.includes("-")) {
                const low = term.toLowerCase();
                if ((lowerFreq.get(low) || 0) > 2) continue; // palabra común con mayúscula inicial
            }
            add(term, f.id);
        }
        for (const m of text.matchAll(/\*\*([^*\n]{3,40})\*\*/g)) {
            const t = m[1].trim().replace(/[:.,;]+$/, "");
            if (/^[A-ZÁÉÍÓÚÑ]/.test(t) && t.split(/\s+/).length <= 4 && !STOP.has(t)) add(t, f.id);
        }
    }
    return stats;
}

const foldWord = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-\s]+/g, "");
const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-\s]+/g, "");
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

// Ubica todas las apariciones de las variantes sin solaparse (las más largas primero), fuera de [[enlaces]].
function findSpans(text: string, variants: string[]): { from: number; to: number; v: string }[] {
    const blocked: [number, number][] = [];
    for (const m of text.matchAll(/\[\[[^\]]*\]\]/g)) blocked.push([m.index!, m.index! + m[0].length]);
    const spans: { from: number; to: number; v: string }[] = [];
    const taken = (a: number, b: number) => spans.some(s => a < s.to && b > s.from) || blocked.some(([x, y]) => a < y && b > x);
    for (const v of [...variants].sort((a, b) => b.length - a.length)) {
        const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(v)}(?![\\p{L}\\p{N}])`, "gu");
        for (const m of text.matchAll(re)) {
            const a = m.index!, b = a + m[0].length;
            if (!taken(a, b)) spans.push({ from: a, to: b, v });
        }
    }
    return spans.sort((x, y) => x.from - y.from);
}

// Enlaces [[destino|alias]] o [[destino#sección]] cuyo destino es uno de los nombres viejos.
const LINK_RE = /\[\[([^\]|#]+)((?:[#|][^\]]*)?)\]\]/g;
const linkTargetsOld = (target: string, others: string[]) => others.some(o => o.toLowerCase() === target.trim().toLowerCase());

const snippet = (text: string, from: number, to: number, pad = 70) =>
    `${from > pad ? "…" : ""}${text.slice(Math.max(0, from - pad), from)}⟦${text.slice(from, to)}⟧${text.slice(to, to + pad)}${to + pad < text.length ? "…" : ""}`.replace(/\s+/g, " ");

function countGroup(files: CorpusFile[], names: string[]): Variant[] {
    const by = new Map<string, Variant>(names.map(n => [n, { name: n, total: 0, files: [], titles: [] }]));
    for (const f of files) {
        const t = baseName(f.name);
        for (const n of names) if (t.toLowerCase() === n.toLowerCase()) by.get(n)!.titles!.push({ fileId: f.id, fileName: f.name });
        const spans = findSpans(f.text, names);
        const per = new Map<string, { count: number; first: { from: number; to: number } }>();
        for (const s of spans) {
            const p = per.get(s.v);
            if (p) p.count++; else per.set(s.v, { count: 1, first: s });
        }
        for (const [v, p] of per) {
            const vv = by.get(v)!;
            vv.total += p.count;
            vv.files.push({ fileId: f.id, fileName: f.name, count: p.count, sample: snippet(f.text, p.first.from, p.first.to) });
        }
    }
    return [...by.values()].map(v => ({ ...v, files: v.files.sort((a, b) => b.count - a.count) }));
}

function groupKey(names: string[]) { return names.map(n => fold(n)).sort().join("|"); }
function isDecided(names: string[], decisions: NameDecision[]) {
    const set = new Set(names.map(fold));
    return decisions.some(d => {
        const ds = new Set([d.canonical, ...d.others].map(fold));
        return [...set].every(n => ds.has(n));
    });
}

// ── Documentos repetidos (sin IA) ──
const plainWords = (t: string) => (t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9ñ]+/g) || []);
function shingles(words: string[]): Set<number> {
    const s = new Set<number>();
    for (let i = 0; i + 5 <= words.length; i++) {
        let h = 2166136261;
        for (let k = i; k < i + 5; k++) {
            const w = words[k];
            for (let c = 0; c < w.length; c++) { h ^= w.charCodeAt(c); h = Math.imul(h, 16777619); }
            h ^= 32; h = Math.imul(h, 16777619);
        }
        s.add(h >>> 0);
    }
    return s;
}
const NUMS: Record<string, number> = { uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
function romanToInt(r: string) { const m: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 }; let n = 0; for (let i = 0; i < r.length; i++) { const a = m[r[i]] || 0, b = m[r[i + 1]] || 0; n += a < b ? -a : a; } return n; }
function chapterReach(text: string): number {
    let max = 0;
    for (const m of text.matchAll(/(?:^|\n)\s*#{0,4}\s*(?:cap[ií]tulo|chapter|cap\.)\s*([0-9]{1,3}|[ivxlc]{1,6}|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/gi)) {
        const raw = m[1].toLowerCase();
        const n = /^\d+$/.test(raw) ? Number(raw) : NUMS[raw] || romanToInt(raw);
        if (n > max && n < 500) max = n;
    }
    return max;
}
const TOPIC_NOISE = new Set(["ficha", "fichas", "personaje", "personajes", "pj", "copia", "copy", "borrador", "final", "nuevo", "nueva", "viejo", "vieja", "de", "del", "la", "el", "los", "las", "v", "version"]);
const topicKey = (name: string) => plainWords(baseName(name).replace(/\(\d+\)|\bv\d+\b/gi, "")).filter(w => !TOPIC_NOISE.has(w) && !/^\d+$/.test(w)).join(" ");

function uniquePart(a: CorpusFile, bSet: Set<number>) {
    let words = 0; let sample = "";
    for (const p of a.text.split(/\n\s*\n/)) {
        const w = plainWords(p);
        if (w.length < 12) continue;
        const sh = shingles(w);
        let hit = 0; sh.forEach(h => { if (bSet.has(h)) hit++; });
        if (hit / Math.max(1, sh.size) < 0.3) {
            words += w.length;
            if (!sample) sample = p.replace(/\s+/g, " ").trim().slice(0, 220) + (p.length > 220 ? "…" : "");
        }
    }
    return { words, sample };
}

function findDocPairs(files: CorpusFile[], decided: DocDecision[]): DocPair[] {
    const sets = files.map(f => shingles(plainWords(f.text)));
    const post = new Map<number, number[]>();
    sets.forEach((s, i) => s.forEach(h => { const l = post.get(h); if (l) { if (l.length < 8) l.push(i); } else post.set(h, [i]); }));
    const overlap = new Map<string, number>();
    for (const list of post.values()) {
        if (list.length < 2 || list.length > 6) continue;
        for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
            const k = `${list[x]}:${list[y]}`;
            overlap.set(k, (overlap.get(k) || 0) + 1);
        }
    }
    const decidedKeys = new Set(decided.map(d => [...d.ids].sort().join("|")));
    const pairs: DocPair[] = [];
    const seen = new Set<string>();
    const info = (i: number, otherSet: Set<number>): DocInfo => {
        const f = files[i];
        const u = uniquePart(f, otherSet);
        return { fileId: f.id, name: f.name, folder: folderOf(f), words: plainWords(f.text).length, reach: chapterReach(f.text), uniqueWords: u.words, uniqueSample: u.sample };
    };
    const push = (i: number, j: number, kind: DocPair["kind"], ov: number) => {
        const id = [files[i].id, files[j].id].sort().join("|");
        if (seen.has(id) || decidedKeys.has(id)) return;
        seen.add(id);
        pairs.push({ id, kind, overlap: Math.round(ov * 100), a: info(i, sets[j]), b: info(j, sets[i]) });
    };
    for (const [k, n] of overlap) {
        const [i, j] = k.split(":").map(Number);
        const min = Math.min(sets[i].size, sets[j].size);
        if (min < 40 || n < 30) continue;
        const c = n / min;
        if (c >= 0.45) push(i, j, "copia", c);
    }
    // Mismo tema en dos documentos (p. ej. dos fichas de Anna en carpetas distintas).
    const byTopic = new Map<string, number[]>();
    files.forEach((f, i) => { const t = topicKey(f.name); if (t.length >= 3) byTopic.set(t, [...(byTopic.get(t) || []), i]); });
    for (const list of byTopic.values()) {
        if (list.length < 2 || list.length > 5) continue;
        for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
            const i = list[x], j = list[y];
            const n = overlap.get(`${Math.min(i, j)}:${Math.max(i, j)}`) || 0;
            push(i, j, "mismo_tema", n / Math.max(1, Math.min(sets[i].size, sets[j].size)));
        }
    }
    return pairs.sort((p, q) => (p.kind === q.kind ? q.overlap - p.overlap : p.kind === "copia" ? -1 : 1)).slice(0, 25);
}

// ── Plan para combinar: compara línea por línea (en las fichas cada dato suele ser una línea) ──
interface MergeItem { kind: "nuevo" | "distinto"; other: string; anchor: number; anchorText?: string; baseIndex?: number; base?: string }
function lineShingles(t: string): Set<string> {
    const w = plainWords(t);
    const s = new Set<string>();
    if (w.length < 3) { if (w.length) s.add(w.join(" ")); return s; }
    for (let i = 0; i + 3 <= w.length; i++) s.add(w.slice(i, i + 3).join(" "));
    return s;
}
function sim(a: Set<string>, b: Set<string>) {
    if (!a.size || !b.size) return 0;
    let n = 0; a.forEach(x => { if (b.has(x)) n++; });
    return n / Math.min(a.size, b.size);
}
const fieldKey = (l: string) => { const m = l.match(/^\s*[-*]?\s*\**([^:*]{2,40})\**\s*:/); return m ? plainWords(m[1]).join(" ") : ""; };
function mergePlan(baseText: string, otherText: string): { items: MergeItem[] } {
    const base = baseText.split("\n");
    const bSh = base.map(lineShingles);
    const bKey = base.map(fieldKey);
    const items: MergeItem[] = [];
    let anchor = -1;
    const used = new Set<number>();
    for (const raw of otherText.split("\n")) {
        const line = raw.replace(/\s+$/, "");
        if (!line.trim()) continue;
        const sh = lineShingles(line);
        const key = fieldKey(line);
        let best = -1, bestSim = 0;
        bSh.forEach((s, i) => { const v = sim(sh, s); if (v > bestSim) { bestSim = v; best = i; } });
        // El mismo campo de ficha («Familia:») con otro contenido cuenta como distinto aunque compartan pocas palabras.
        const sameField = key ? bKey.findIndex((k, i) => k === key && !used.has(i)) : -1;
        if (bestSim >= 0.85) { anchor = Math.max(anchor, best); used.add(best); continue; }
        if (sameField >= 0 || bestSim >= 0.4) {
            const i = sameField >= 0 ? sameField : best;
            if (base[i].trim() === line.trim()) { anchor = Math.max(anchor, i); continue; }
            used.add(i); anchor = Math.max(anchor, i);
            items.push({ kind: "distinto", other: line, anchor: i, baseIndex: i, base: base[i] });
            continue;
        }
        items.push({ kind: "nuevo", other: line, anchor, anchorText: anchor >= 0 ? base[anchor].slice(0, 90) : "" });
    }
    return { items: items.slice(0, 120) };
}

const SCAN_PROMPT = `Eres Mira, la compañera de escritura de MyWorld. Revisas el VOCABULARIO del canon de un autor (nombres propios, mecánicas, reglas, lugares, objetos y los TÍTULOS de sus documentos) para encontrar el MISMO concepto escrito con nombres distintos: un renombre que quedó a medias en algunos documentos, una abreviatura, el título de un documento que dice una cosa mientras el texto dice otra, o una variante de escritura (tildes, guiones, espacios).

REGLAS:
- Agrupa SOLO lo que es el mismo concepto. Dos cosas relacionadas pero distintas (una mecánica y una de sus partes, un personaje y su familia, un lugar y su región) NO van juntas. Usa los contextos para decidir; si dudas, no lo agrupes.
- Ojo con los títulos: si el documento «Fusione» explica lo que el texto llama «Anima Fusione», son el mismo concepto.
- Cada variante debe copiarse EXACTA de la lista de términos.
- "sugerido": el nombre que parece el actual (el título del documento que lo define, o el más usado). El autor decide al final.
- "tipo": "ortografia" si solo cambian tildes, guiones, espacios o mayúsculas; "renombre" si cambian las palabras.
- "razon": una frase corta y concreta para el autor, en español, con tono cercano.
- Solo nombres y términos PROPIOS del mundo del autor (personajes, lugares, razas, poderes, objetos, instituciones). Las palabras y expresiones comunes del idioma («en serio», «de verdad», un insulto, una exclamación) NO van, aunque estén escritas de dos formas: eso es ortografía, no coherencia del canon.
- Si no hay nada, devuelve "grupos": [].

Responde SOLO con JSON: {"grupos":[{"variantes":["…","…"],"sugerido":"…","tipo":"renombre","razon":"…"}]}`;

function driveFor(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

async function deleteFromIndex(uid: string, fileId: string) {
    const ref = getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(fileId);
    const chunks = await ref.collection("chunks").listDocuments();
    for (let i = 0; i < chunks.length; i += 400) {
        const b = getFirestore().batch();
        chunks.slice(i, i + 400).forEach(c => b.delete(c));
        await b.commit();
    }
    await ref.delete();
}

export const worldNames = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 300, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, groupId, canonical, fileIds, accessToken } = request.data || {};
        const ref = stateRef(uid);

        if (mode === "get") return await loadState(uid);

        // Nov 2026: lista de documentos indexados (para «Traer un documento» del Arquitecto), con su carpeta.
        if (mode === "files") {
            const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").select("name", "path", "category", "type", "mimeType", "driveId").limit(800).get();
            // Nov 2026: sin las entradas fantasma de las fichas antiguas (otra clave, mismo archivo de Drive).
            return { files: snap.docs.filter(d => { const dr = (d.data() as any).driveId; return !dr || dr === d.id; }).map(d => { const x: any = d.data(); return { id: d.id, name: String(x.name || ""), path: String(x.path || ""), category: x.category || "canon", folder: x.type === "folder" || x.mimeType === "application/vnd.google-apps.folder" }; }).filter(f => f.name && !f.folder) };
        }

        if (mode === "scan") {
            const state = await loadState(uid);
            const files = await loadCorpus(uid);
            if (!files.length) return { ...state, noIndex: true };
            const stats = extractTerms(files);
            const terms = [...stats.entries()].filter(([, s]) => s.total >= 2 || s.title).sort((a, b) => b[1].total - a[1].total).slice(0, 300);
            const termSet = new Set(terms.map(([t]) => t));

            // Candidatos seguros para dar contexto: misma forma sin tildes/guiones, o uno es el comienzo o el final del otro.
            const cands = new Set<string>();
            const byFold = new Map<string, string[]>();
            for (const [t] of terms) byFold.set(fold(t), [...(byFold.get(fold(t)) || []), t]);
            for (const list of byFold.values()) if (list.length > 1) list.forEach(t => cands.add(t));
            for (const [a] of terms) for (const [b] of terms) {
                if (b === a || b.split(" ").length > a.split(" ").length + 2) continue;
                if (b.startsWith(a + " ") || b.endsWith(" " + a)) { cands.add(a); cands.add(b); }
            }
            const ctx = [...cands].slice(0, 80).map(t => {
                const f = files.find(x => x.text.includes(t));
                if (!f) return stats.get(t)?.title ? `- «${t}»: es el título de un documento` : "";
                const i = f.text.indexOf(t);
                return `- «${t}» (${f.name}): ${snippet(f.text, i, i + t.length, 110)}`;
            }).filter(Boolean).join("\n");
            const decided = state.decisions.map(d => `${d.kind === "distintos" ? "DISTINTOS" : "MISMO"}: ${[d.canonical, ...d.others].join(" / ")}`).join("\n");

            const prompt = [
                SCAN_PROMPT,
                `TÉRMINOS (veces · documentos · T = título de un documento):\n${terms.map(([t, s]) => `${t} · ${s.total} · ${s.files.size}${s.title ? " · T" : ""}`).join("\n")}`,
                ctx ? `CONTEXTOS DE LOS CANDIDATOS:\n${ctx}` : "",
                decided ? `YA DECIDIDO POR EL AUTOR (no los repitas):\n${decided}` : "",
            ].filter(Boolean).join("\n\n");

            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const r = await smartGenerateContent(genAI, prompt, { _tier: getTier(request.data), taskType: "standard", jsonMode: true, temperature: 0.1, contextLabel: "WorldNames" });
            const parsed = r.text ? parseSecureJSON(r.text, "WorldNames") : null;
            const raw: any[] = Array.isArray(parsed?.grupos) ? parsed.grupos : [];

            const groups: NameGroup[] = state.groups.filter(g => g.kind === "manual");
            const seen = new Set<string>(groups.map(g => g.id));
            for (const g of raw.slice(0, 20)) {
                const names = [...new Set((Array.isArray(g?.variantes) ? g.variantes : []).map((v: any) => String(v || "").trim()).filter((v: string) => termSet.has(v)))] as string[];
                if (names.length < 2 || isDecided(names, state.decisions)) continue;
                const key = groupKey(names);
                if (seen.has(key)) continue;
                seen.add(key);
                const variants = countGroup(files, names).filter(v => v.total > 0 || (v.titles?.length || 0) > 0);
                if (variants.length < 2) continue;
                const suggested = names.includes(String(g?.sugerido)) ? String(g.sugerido) : [...variants].sort((a, b) => b.total - a.total)[0].name;
                groups.push({ id: key, variants, suggested, reason: String(g?.razon || "").slice(0, 240), kind: g?.tipo === "ortografia" ? "ortografia" : "renombre" });
            }

            const docs = findDocPairs(files, state.docDecisions);
            // Fecha de la última edición (Drive), para saber cuál es el viejo.
            if (accessToken && docs.length) {
                try {
                    const drive = driveFor(accessToken);
                    const ids = [...new Set(docs.flatMap(p => [p.a.fileId, p.b.fileId]))].slice(0, 40);
                    const meta = new Map<string, string>();
                    await Promise.all(ids.map(async id => {
                        try { const m = await drive.files.get({ fileId: id, fields: "modifiedTime, trashed" }); if (!m.data.trashed) meta.set(id, String(m.data.modifiedTime || "")); else meta.set(id, "TRASHED"); } catch { /* sin acceso */ }
                    }));
                    for (const p of docs) { p.a.modifiedTime = meta.get(p.a.fileId); p.b.modifiedTime = meta.get(p.b.fileId); }
                } catch (e: any) { logger.warn(`[NOMBRES] Fechas: ${e?.message}`); }
            }
            const liveDocs = docs.filter(p => p.a.modifiedTime !== "TRASHED" && p.b.modifiedTime !== "TRASHED");

            const next: NamesState = { groups, decisions: state.decisions, docs: liveDocs, docDecisions: state.docDecisions, checkedAt: new Date().toISOString() };
            await ref.set(clean(next), { merge: true });
            await syncNamesMemory(uid, state.decisions);
            logger.info(`[NOMBRES] ${uid}: ${groups.length} grupos y ${liveDocs.length} pares de documentos en ${files.length} documentos`);
            return next;
        }

        const state = await loadState(uid);

        if (mode === "forget") {
            const idx = Number(request.data?.index);
            const decisions = state.decisions.filter((_, i) => i !== idx);
            await ref.set(clean({ decisions }), { merge: true });
            await syncNamesMemory(uid, decisions);
            return { ...state, decisions };
        }

        // ── Combinar dos documentos repetidos (Nov 2026) ──
        // Se queda uno (la base) y se le agrega lo que solo tiene el otro, en el lugar que le corresponde.
        // Las líneas que dicen lo mismo con otras palabras se muestran como «distintas» para que el autor elija.
        if (mode === "mergePreview" || mode === "mergeApply") {
            const pair = state.docs.find(p => p.id === request.data?.pairId);
            if (!pair) throw new HttpsError("not-found", "Ese par ya no está. Vuelve a revisar.");
            const keep = String(request.data?.keepId || "");
            if (keep !== pair.a.fileId && keep !== pair.b.fileId) throw new HttpsError("invalid-argument", "Elige en cuál documento se combinan.");
            if (!accessToken) throw new HttpsError("unauthenticated", "Reconecta Google Drive para combinar los documentos.");
            const drop = keep === pair.a.fileId ? pair.b : pair.a;
            const base = keep === pair.a.fileId ? pair.a : pair.b;
            const drive = driveFor(accessToken);
            const meta = await drive.files.get({ fileId: keep, fields: "mimeType" });
            if (meta.data.mimeType === "application/vnd.google-apps.document") throw new HttpsError("failed-precondition", `«${base.name}» es un Google Doc: combínalo a mano.`);
            const [baseText, otherText] = await Promise.all([keep, drop.fileId].map(async id => String(await _getDriveFileContentInternal(drive, id) || "")));
            const plan = mergePlan(baseText, otherText);
            if (mode === "mergePreview") return { baseName: base.name, otherName: drop.name, items: plan.items };

            // Qué eligió el autor: índices de líneas nuevas que entran y, en las distintas, cuál queda.
            const include = new Set<number>((Array.isArray(request.data?.include) ? request.data.include : []).map(Number));
            const choices: Record<string, string> = request.data?.choices || {};
            const lines = baseText.split("\n");
            const after = new Map<number, string[]>(); // índice de línea base → líneas que van después
            const replace = new Map<number, string[]>();
            plan.items.forEach((it, i) => {
                if (it.kind === "nuevo") {
                    if (!include.has(i)) return;
                    after.set(it.anchor, [...(after.get(it.anchor) || []), it.other]);
                } else {
                    const c = choices[String(i)] || "base";
                    if (c === "other") replace.set(it.baseIndex!, [it.other]);
                    else if (c === "both") replace.set(it.baseIndex!, [lines[it.baseIndex!], it.other]);
                }
            });
            const out: string[] = [...(after.get(-1) || [])];
            lines.forEach((l, i) => { out.push(...(replace.get(i) || [l])); out.push(...(after.get(i) || [])); });
            const next = out.join("\n");
            await drive.files.update({ fileId: keep, media: { mimeType: meta.data.mimeType || "text/markdown", body: next } });
            try { await drive.files.update({ fileId: drop.fileId, requestBody: { trashed: true } }); } catch (e: any) {
                throw new HttpsError("failed-precondition", `Combiné en «${base.name}», pero no pude mover «${drop.name}» a la papelera: ${e?.message || "sin permiso"}. Hazlo a mano.`);
            }
            try { await deleteFromIndex(uid, drop.fileId); } catch (e: any) { logger.warn(`[NOMBRES] Índice: ${e?.message}`); }
            const docs = state.docs.filter(p => p.a.fileId !== drop.fileId && p.b.fileId !== drop.fileId);
            const docDecisions = [...state.docDecisions, { ids: [pair.a.fileId, pair.b.fileId], kind: "archivado" as const, keep, at: new Date().toISOString() }];
            await ref.set(clean({ docs, docDecisions }), { merge: true });
            logger.info(`[NOMBRES] ${uid}: «${drop.name}» combinado en «${base.name}»`);
            return { ...state, docs, docDecisions, merged: { into: base.name, fileId: keep, trashed: drop.name, trashedId: drop.fileId } };
        }

        // ── Documentos repetidos ──
        if (mode === "docDistinct" || mode === "docKeep") {
            const pair = state.docs.find(p => p.id === request.data?.pairId);
            if (!pair) throw new HttpsError("not-found", "Ese par ya no está. Vuelve a revisar.");
            const at = new Date().toISOString();
            if (mode === "docDistinct") {
                const docs = state.docs.filter(p => p.id !== pair.id);
                const docDecisions = [...state.docDecisions, { ids: [pair.a.fileId, pair.b.fileId], kind: "distintos" as const, at }];
                await ref.set(clean({ docs, docDecisions }), { merge: true });
                return { ...state, docs, docDecisions };
            }
            const keep = String(request.data?.keepId || "");
            if (keep !== pair.a.fileId && keep !== pair.b.fileId) throw new HttpsError("invalid-argument", "Elige cuál documento se queda.");
            if (!accessToken) throw new HttpsError("unauthenticated", "Reconecta Google Drive para mover el documento.");
            const drop = keep === pair.a.fileId ? pair.b : pair.a;
            const drive = driveFor(accessToken);
            try {
                await drive.files.update({ fileId: drop.fileId, requestBody: { trashed: true } });
            } catch (e: any) {
                throw new HttpsError("failed-precondition", `No pude mover «${drop.name}» a la papelera de Drive: ${e?.message || "sin permiso"}.`);
            }
            try { await deleteFromIndex(uid, drop.fileId); } catch (e: any) { logger.warn(`[NOMBRES] Índice: ${e?.message}`); }
            const docs = state.docs.filter(p => p.a.fileId !== drop.fileId && p.b.fileId !== drop.fileId);
            const docDecisions = [...state.docDecisions, { ids: [pair.a.fileId, pair.b.fileId], kind: "archivado" as const, keep, at }];
            await ref.set(clean({ docs, docDecisions }), { merge: true });
            logger.info(`[NOMBRES] ${uid}: «${drop.name}» a la papelera; se queda ${keep}`);
            return { ...state, docs, docDecisions, trashed: drop.name };
        }

        // ── Cambiar un nombre a mano ──
        if (mode === "manual") {
            const from = String(request.data?.from || "").trim().slice(0, 60);
            const to = String(request.data?.to || "").trim().slice(0, 60);
            if (from.length < 2 || to.length < 2) throw new HttpsError("invalid-argument", "Escribe el nombre actual y el nuevo.");
            if (from.toLowerCase() === to.toLowerCase()) throw new HttpsError("invalid-argument", "El nombre nuevo es igual al actual.");
            const files = await loadCorpus(uid);
            const variants = countGroup(files, [from, to]);
            const old = variants.find(v => v.name === from)!;
            const linkFiles = files.filter(f => [...f.text.matchAll(LINK_RE)].some(m => linkTargetsOld(m[1], [from])));
            if (!old.total && !(old.titles?.length) && !linkFiles.length) throw new HttpsError("not-found", `No encontré «${from}» en tus documentos. Revisa cómo está escrito (mayúsculas y tildes cuentan).`);
            const id = groupKey([from, to]);
            const group: NameGroup = { id, variants, suggested: to, reason: `Cambio de nombre que pediste: «${from}» pasa a llamarse «${to}».`, kind: "manual" };
            const groups = [...state.groups.filter(g => g.id !== id), group];
            await ref.set(clean({ groups }), { merge: true });
            return { ...state, groups, groupId: id };
        }

        const group = state.groups.find(g => g.id === groupId);
        if (!group) throw new HttpsError("not-found", "Ese grupo ya no está. Vuelve a revisar los nombres.");
        const names = group.variants.map(v => v.name);

        const saveDecision = async (d: NameDecision) => {
            const decisions = resolveChains([...state.decisions.filter(x => groupKey([x.canonical, ...x.others]) !== groupKey([d.canonical, ...d.others])), d]);
            const groups = state.groups.filter(g => g.id !== group.id);
            await ref.set(clean({ decisions, groups }), { merge: true });
            await syncNamesMemory(uid, decisions);
            return { ...state, decisions, groups };
        };

        if (mode === "dismissManual") {
            const groups = state.groups.filter(g => g.id !== group.id);
            await ref.set(clean({ groups }), { merge: true });
            return { ...state, groups };
        }

        if (mode === "distinct") {
            return await saveDecision({ canonical: names[0], others: names.slice(1), kind: "distintos", at: new Date().toISOString() });
        }

        if (!names.includes(String(canonical))) throw new HttpsError("invalid-argument", "Elige uno de los nombres del grupo.");
        const others = names.filter(n => n !== canonical);

        if (mode === "decide") {
            return await saveDecision({ canonical, others, kind: "mismo", at: new Date().toISOString() });
        }

        // preview / apply: se lee Drive en ese momento (la fuente de verdad), no el índice.
        if (!accessToken) throw new HttpsError("unauthenticated", "Reconecta Google Drive para revisar tus documentos.");
        const drive = driveFor(accessToken);
        const corpus = await loadCorpus(uid);
        // Documentos con el nombre viejo en el texto o en un enlace [[ ]].
        const withLinks = corpus.filter(f => [...f.text.matchAll(LINK_RE)].some(m => linkTargetsOld(m[1], others))).map(f => f.id);
        const targets = [...new Set([...group.variants.filter(v => v.name !== canonical).flatMap(v => v.files.map(f => f.fileId)), ...withLinks])];
        // Documentos cuyo título es el nombre viejo (se pueden renombrar) y si ya existe uno con el nombre nuevo.
        const renameable = corpus.filter(f => others.some(o => baseName(f.name).toLowerCase() === o.toLowerCase()))
            .map(f => ({ fileId: f.id, fileName: f.name, newName: f.name.replace(baseName(f.name), canonical) }));
        const canonicalFileExists = corpus.some(f => baseName(f.name).toLowerCase() === canonical.toLowerCase());

        const transform = (text: string, retarget: boolean) => {
            const spans = findSpans(text, names).filter(s => s.v !== canonical);
            let next = "", last = 0;
            for (const s of spans) { next += text.slice(last, s.from) + canonical; last = s.to; }
            next += text.slice(last);
            let links = 0;
            if (retarget) next = next.replace(LINK_RE, (m, target: string, rest: string) => {
                if (!linkTargetsOld(target, others)) return m;
                links++;
                return `[[${canonical}${rest || ""}]]`;
            });
            return { next, count: spans.length, links, spans };
        };

        if (mode === "preview") {
            const out: any[] = [];
            for (let i = 0; i < targets.length; i += 6) {
                const part = await Promise.all(targets.slice(i, i + 6).map(async id => {
                    try {
                        const meta = await drive.files.get({ fileId: id, fields: "name, mimeType, trashed" });
                        if (meta.data.trashed) return null;
                        const text = String(await _getDriveFileContentInternal(drive, id) || "");
                        const { count, spans } = transform(text, false);
                        const links = [...text.matchAll(LINK_RE)].filter(m => linkTargetsOld(m[1], others)).length;
                        if (!count && !links) return null;
                        return {
                            fileId: id, fileName: meta.data.name, count, links,
                            googleDoc: meta.data.mimeType === "application/vnd.google-apps.document",
                            samples: spans.slice(0, 3).map(s => snippet(text, s.from, s.to, 60)),
                        };
                    } catch { return null; }
                }));
                out.push(...part.filter(Boolean));
            }
            return { files: out, renameable, canonicalFileExists };
        }

        if (mode === "apply") {
            const chosen: string[] = (Array.isArray(fileIds) ? fileIds : []).filter((id: string) => targets.includes(id));
            const toRename: string[] = (Array.isArray(request.data?.renameFileIds) ? request.data.renameFileIds : []).filter((id: string) => renameable.some(r => r.fileId === id));
            if (!chosen.length && !toRename.length) throw new HttpsError("invalid-argument", "Elige al menos un documento.");
            // Los enlaces solo se cambian si el destino nuevo existe (ya hay un documento con ese nombre o se renombra ahora).
            const retarget = canonicalFileExists || toRename.length > 0;
            const changed: { fileId: string; fileName: string; count: number }[] = [];
            const skipped: string[] = [];
            const renamed: string[] = [];
            for (const id of chosen.slice(0, 80)) {
                try {
                    const meta = await drive.files.get({ fileId: id, fields: "name, mimeType" });
                    if (meta.data.mimeType === "application/vnd.google-apps.document") { skipped.push(String(meta.data.name)); continue; }
                    const text = String(await _getDriveFileContentInternal(drive, id) || "");
                    const { next, count, links } = transform(text, retarget);
                    if (next === text) continue;
                    await drive.files.update({ fileId: id, media: { mimeType: meta.data.mimeType || "text/markdown", body: next } });
                    changed.push({ fileId: id, fileName: String(meta.data.name), count: count + links });
                } catch (e: any) {
                    logger.warn(`[NOMBRES] No se pudo cambiar ${id}: ${e?.message}`);
                    skipped.push(id);
                }
            }
            for (const id of toRename) {
                const r = renameable.find(x => x.fileId === id)!;
                try {
                    await drive.files.update({ fileId: id, requestBody: { name: r.newName } });
                    await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(id).set({ name: r.newName }, { merge: true });
                    renamed.push(`${r.fileName} → ${r.newName}`);
                } catch (e: any) {
                    logger.warn(`[NOMBRES] No se pudo renombrar ${id}: ${e?.message}`);
                    skipped.push(r.fileName);
                }
            }
            const total = changed.reduce((a, c) => a + c.count, 0);
            const s2 = await saveDecision({ canonical, others, kind: "mismo", at: new Date().toISOString(), applied: total });
            logger.info(`[NOMBRES] ${uid}: «${others.join("/")}» → «${canonical}» en ${changed.length} documentos (${total} cambios, ${renamed.length} renombrados)`);
            return { ...s2, changed, skipped, renamed };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
