// Nov 2026: Nombres del mundo.
// Como el corrector ortográfico, pero para el canon: Mira busca conceptos que aparecen con dos nombres
// (un renombre a medias como «Anima Fusione» → «Anima», o variantes como «Psico-Energía» / «Psico Energía»).
// El autor elige el nombre que queda y puede unificarlo en sus documentos o solo dejarlo decidido; las
// decisiones pasan al Arquitecto y a la memoria para que ninguna IA los trate como dos cosas distintas.
//
// Detección barata: los términos se extraen sin IA (nombres propios y negritas, con conteos por archivo)
// y la IA solo agrupa los que son el mismo concepto. Los conteos y los reemplazos son deterministas.
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
import { applyMemoryOps } from "./utils/memory_store";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

interface VariantFile { fileId: string; fileName: string; count: number; sample: string }
interface Variant { name: string; total: number; files: VariantFile[] }
interface NameGroup { id: string; variants: Variant[]; suggested: string; reason: string; kind: "renombre" | "ortografia" }
interface NameDecision { canonical: string; others: string[]; kind: "mismo" | "distintos"; at: string; applied?: number }
interface NamesState { groups: NameGroup[]; decisions: NameDecision[]; checkedAt?: string }

const stateRef = (uid: string) => getFirestore().collection("users").doc(uid).collection("world_names").doc("state");

async function loadState(uid: string): Promise<NamesState> {
    const d: any = (await stateRef(uid).get()).data() || {};
    return { groups: d.groups || [], decisions: d.decisions || [], checkedAt: d.checkedAt };
}

/** Texto para los prompts del Arquitecto: los nombres que el autor ya decidió. */
export async function loadNameDecisionsText(uid: string): Promise<string> {
    try {
        const { decisions } = await loadState(uid);
        return decisions.slice(-30).map(d => d.kind === "distintos"
            ? `  · «${d.canonical}» y ${d.others.map(o => `«${o}»`).join(", ")} son conceptos distintos.`
            : `  · «${d.canonical}» es el nombre actual; ${d.others.map(o => `«${o}»`).join(", ")} es el nombre antiguo o una variante del mismo concepto. Usa «${d.canonical}».`
        ).join("\n");
    } catch { return ""; }
}

// ── Corpus: el texto indexado del canon (incluye subcarpetas; sin pedir el token de Drive) ──
async function loadCorpus(uid: string): Promise<{ id: string; name: string; text: string }[]> {
    const db = getFirestore();
    const filesSnap = await db.collection("TDB_Index").doc(uid).collection("files").limit(200).get();
    const docs = filesSnap.docs.filter(d => {
        const x: any = d.data();
        return x.category !== "reference" && !/^memoria del autor\.md$/i.test(x.name || "");
    });
    const out: { id: string; name: string; text: string }[] = [];
    for (let i = 0; i < docs.length; i += 15) {
        const part = await Promise.all(docs.slice(i, i + 15).map(async d => {
            const chunks = await d.ref.collection("chunks").select("text").get();
            const text = chunks.docs
                .sort((a, b) => Number(a.id.replace(/\D/g, "")) - Number(b.id.replace(/\D/g, "")))
                .map(c => String((c.data() as any).text || "")).join("\n\n");
            return { id: d.id, name: String((d.data() as any).name || d.id), text };
        }));
        out.push(...part.filter(p => p.text.trim().length > 0));
    }
    return out;
}

// ── Extracción de términos (sin IA) ──
const STOP = new Set(["El", "La", "Los", "Las", "Un", "Una", "Unos", "Unas", "Y", "O", "Pero", "Si", "No", "Sí", "En", "De", "Del", "Al", "A", "Con", "Por", "Para", "Que", "Qué", "Como", "Cómo", "Cuando", "Cuándo", "Donde", "Dónde", "Este", "Esta", "Estos", "Estas", "Ese", "Esa", "Eso", "Su", "Sus", "Lo", "Le", "Les", "Se", "Es", "Era", "Fue", "Hay", "Hace", "Ella", "Él", "Ellos", "Yo", "Tu", "Tú", "Mi", "Nos", "También", "Aun", "Aún", "Así", "Ya", "Sin", "Sobre", "Entre", "Desde", "Hasta", "Muy", "Más", "Todo", "Todos", "Cada", "Otro", "Otra", "Porque", "Entonces", "Luego", "Después", "Antes", "Ahora", "Además", "Incluso", "Mientras", "Aunque", "Bueno", "Obviamente", "Imagina", "Nota", "Ej", "Ejemplo", "Ver", "Fase", "Parte", "Capítulo", "The", "And", "Of"]);
const LINK = new Set(["de", "del", "la", "las", "los", "el", "y"]);
const TERM_RE = /(?<![\p{L}\p{N}])([A-ZÁÉÍÓÚÑ][\p{L}]{1,}(?:(?:-|\s(?:(?:de|del|de\s+la|de\s+las|de\s+los)\s)?)[A-ZÁÉÍÓÚÑ][\p{L}]{1,}){0,3})(?![\p{L}\p{N}])/gu;

function extractTerms(files: { id: string; name: string; text: string }[]) {
    const stats = new Map<string, { total: number; files: Set<string> }>();
    const lowerFreq = new Map<string, number>();
    for (const f of files) {
        for (const w of f.text.match(/(?<![\p{L}])[a-záéíóúñ][\p{L}]+/gu) || []) lowerFreq.set(w, (lowerFreq.get(w) || 0) + 1);
    }
    const add = (t: string, fileId: string) => {
        const term = t.replace(/\s+/g, " ").trim();
        if (term.length < 3 || term.length > 48) return;
        const s = stats.get(term) || { total: 0, files: new Set<string>() };
        s.total++; s.files.add(fileId); stats.set(term, s);
    };
    for (const f of files) {
        const text = f.text.replace(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, "$1");
        for (const m of text.matchAll(TERM_RE)) {
            let term = m[1];
            const words = term.split(/\s+/);
            while (words.length && (STOP.has(words[0].replace(/-.*/, "")) || LINK.has(words[0]))) words.shift();
            while (words.length && LINK.has(words[words.length - 1])) words.pop();
            term = words.join(" ");
            if (!term) continue;
            if (!term.includes(" ") && !term.includes("-")) {
                const low = term.toLowerCase();
                if ((lowerFreq.get(low) || 0) > 2) continue; // palabra común con mayúscula inicial
            }
            add(term, f.id);
        }
        for (const m of text.matchAll(/\*\*([^*\n]{3,40})\*\*/g)) {
            const t = m[1].trim().replace(/[:.,;]+$/, "");
            if (/^[A-ZÁÉÍÓÚÑ]/.test(t) && t.split(/\s+/).length <= 4) add(t, f.id);
        }
    }
    return stats;
}

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

const snippet = (text: string, from: number, to: number, pad = 70) =>
    `${from > pad ? "…" : ""}${text.slice(Math.max(0, from - pad), from)}⟦${text.slice(from, to)}⟧${text.slice(to, to + pad)}${to + pad < text.length ? "…" : ""}`.replace(/\s+/g, " ");

function countGroup(files: { id: string; name: string; text: string }[], names: string[]): Variant[] {
    const by = new Map<string, Variant>(names.map(n => [n, { name: n, total: 0, files: [] }]));
    for (const f of files) {
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

const SCAN_PROMPT = `Eres Mira, la compañera de escritura de MyWorld. Revisas el VOCABULARIO del canon de un autor (nombres propios, mecánicas, reglas, lugares, objetos) para encontrar el MISMO concepto escrito con nombres distintos: un renombre que quedó a medias en algunos documentos, una abreviatura, o una variante de escritura (tildes, guiones, espacios).

REGLAS:
- Agrupa SOLO lo que es el mismo concepto. Dos cosas relacionadas pero distintas (una mecánica y una de sus partes, un personaje y su familia, un lugar y su región) NO van juntas. Usa los contextos para decidir; si dudas, no lo agrupes.
- Cada variante debe copiarse EXACTA de la lista de términos.
- "sugerido": el nombre que parece el actual (el más usado o el de los documentos que lo definen). El autor decide al final.
- "tipo": "ortografia" si solo cambian tildes, guiones, espacios o mayúsculas; "renombre" si cambian las palabras.
- "razon": una frase corta y concreta para el autor, en español, con tono cercano.
- Si no hay nada, devuelve "grupos": [].

Responde SOLO con JSON: {"grupos":[{"variantes":["…","…"],"sugerido":"…","tipo":"renombre","razon":"…"}]}`;

export const worldNames = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 300, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, groupId, canonical, fileIds, accessToken } = request.data || {};
        const ref = stateRef(uid);

        if (mode === "get") return await loadState(uid);

        if (mode === "scan") {
            const state = await loadState(uid);
            const files = await loadCorpus(uid);
            if (!files.length) return { ...state, noIndex: true };
            const stats = extractTerms(files);
            const terms = [...stats.entries()].filter(([, s]) => s.total >= 2).sort((a, b) => b[1].total - a[1].total).slice(0, 260);
            const termSet = new Set(terms.map(([t]) => t));

            // Candidatos seguros para dar contexto: misma forma sin tildes/guiones, o uno es el comienzo del otro.
            const cands = new Set<string>();
            const byFold = new Map<string, string[]>();
            for (const [t] of terms) byFold.set(fold(t), [...(byFold.get(fold(t)) || []), t]);
            for (const list of byFold.values()) if (list.length > 1) list.forEach(t => cands.add(t));
            for (const [a] of terms) for (const [b] of terms) if (b !== a && b.startsWith(a + " ") && b.split(" ").length <= a.split(" ").length + 2) { cands.add(a); cands.add(b); }
            const ctx = [...cands].slice(0, 70).map(t => {
                const f = files.find(x => x.text.includes(t));
                if (!f) return "";
                const i = f.text.indexOf(t);
                return `- «${t}» (${f.name}): ${snippet(f.text, i, i + t.length, 110)}`;
            }).filter(Boolean).join("\n");
            const decided = state.decisions.map(d => `${d.kind === "distintos" ? "DISTINTOS" : "MISMO"}: ${[d.canonical, ...d.others].join(" / ")}`).join("\n");

            const prompt = [
                SCAN_PROMPT,
                `TÉRMINOS (veces · documentos):\n${terms.map(([t, s]) => `${t} · ${s.total} · ${s.files.size}`).join("\n")}`,
                ctx ? `CONTEXTOS DE LOS CANDIDATOS:\n${ctx}` : "",
                decided ? `YA DECIDIDO POR EL AUTOR (no los repitas):\n${decided}` : "",
            ].filter(Boolean).join("\n\n");

            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const r = await smartGenerateContent(genAI, prompt, { _tier: getTier(request.data), taskType: "standard", jsonMode: true, temperature: 0.1, contextLabel: "WorldNames" });
            if (!r.text) throw new HttpsError("unavailable", "Mira no pudo revisar los nombres ahora. Intenta en un momento.");
            const parsed = parseSecureJSON(r.text, "WorldNames");
            const raw: any[] = Array.isArray(parsed?.grupos) ? parsed.grupos : [];

            const groups: NameGroup[] = [];
            const seen = new Set<string>();
            for (const g of raw.slice(0, 20)) {
                const names = [...new Set((Array.isArray(g?.variantes) ? g.variantes : []).map((v: any) => String(v || "").trim()).filter((v: string) => termSet.has(v)))] as string[];
                if (names.length < 2 || isDecided(names, state.decisions)) continue;
                const key = groupKey(names);
                if (seen.has(key)) continue;
                seen.add(key);
                const variants = countGroup(files, names).filter(v => v.total > 0);
                if (variants.length < 2) continue;
                const suggested = names.includes(String(g?.sugerido)) ? String(g.sugerido) : variants.sort((a, b) => b.total - a.total)[0].name;
                groups.push({ id: key, variants, suggested, reason: String(g?.razon || "").slice(0, 240), kind: g?.tipo === "ortografia" ? "ortografia" : "renombre" });
            }
            const next: NamesState = { groups, decisions: state.decisions, checkedAt: new Date().toISOString() };
            await ref.set(next, { merge: true });
            logger.info(`[NOMBRES] ${uid}: ${groups.length} grupos en ${files.length} documentos`);
            return next;
        }

        const state = await loadState(uid);
        const group = state.groups.find(g => g.id === groupId);

        if (mode === "forget") {
            const idx = Number(request.data?.index);
            const decisions = state.decisions.filter((_, i) => i !== idx);
            await ref.set({ decisions }, { merge: true });
            return { ...state, decisions };
        }

        if (!group) throw new HttpsError("not-found", "Ese grupo ya no está. Vuelve a revisar los nombres.");
        const names = group.variants.map(v => v.name);

        const saveDecision = async (d: NameDecision) => {
            const decisions = [...state.decisions.filter(x => groupKey([x.canonical, ...x.others]) !== groupKey([d.canonical, ...d.others])), d];
            const groups = state.groups.filter(g => g.id !== group.id);
            await ref.set({ decisions, groups }, { merge: true });
            const line = d.kind === "distintos"
                ? `«${d.canonical}» y ${d.others.map(o => `«${o}»`).join(", ")} son conceptos distintos.`
                : `«${d.canonical}» es el nombre actual; ${d.others.map(o => `«${o}»`).join(", ")} es el nombre antiguo o una variante. Usar «${d.canonical}».`;
            try { await applyMemoryOps(uid, [{ op: "add", file: "Nombres del mundo", kind: "libro", text: line }], "nombres"); } catch (e: any) { logger.warn(`[NOMBRES] Memoria: ${e?.message}`); }
            return { ...state, decisions, groups };
        };

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
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });
        const targets = [...new Set(group.variants.filter(v => v.name !== canonical).flatMap(v => v.files.map(f => f.fileId)))];

        if (mode === "preview") {
            const out: any[] = [];
            for (let i = 0; i < targets.length; i += 6) {
                const part = await Promise.all(targets.slice(i, i + 6).map(async id => {
                    try {
                        const meta = await drive.files.get({ fileId: id, fields: "name, mimeType" });
                        const text = String(await _getDriveFileContentInternal(drive, id) || "");
                        const spans = findSpans(text, names).filter(s => s.v !== canonical);
                        const links = ((text.match(/\[\[[^\]]*\]\]/g) || []) as string[]).filter(l => others.some(o => l.includes(o))).length;
                        if (!spans.length && !links) return null;
                        return {
                            fileId: id, fileName: meta.data.name, count: spans.length, links,
                            googleDoc: meta.data.mimeType === "application/vnd.google-apps.document",
                            samples: spans.slice(0, 3).map(s => snippet(text, s.from, s.to, 60)),
                        };
                    } catch { return null; }
                }));
                out.push(...part.filter(Boolean));
            }
            return { files: out };
        }

        if (mode === "apply") {
            const chosen: string[] = (Array.isArray(fileIds) ? fileIds : []).filter((id: string) => targets.includes(id));
            if (!chosen.length) throw new HttpsError("invalid-argument", "Elige al menos un documento.");
            const changed: { fileId: string; fileName: string; count: number }[] = [];
            const skipped: string[] = [];
            for (const id of chosen.slice(0, 60)) {
                try {
                    const meta = await drive.files.get({ fileId: id, fields: "name, mimeType" });
                    if (meta.data.mimeType === "application/vnd.google-apps.document") { skipped.push(String(meta.data.name)); continue; }
                    const text = String(await _getDriveFileContentInternal(drive, id) || "");
                    const spans = findSpans(text, names).filter(s => s.v !== canonical);
                    if (!spans.length) continue;
                    let next = "", last = 0;
                    for (const s of spans) { next += text.slice(last, s.from) + canonical; last = s.to; }
                    next += text.slice(last);
                    await drive.files.update({ fileId: id, media: { mimeType: meta.data.mimeType || "text/markdown", body: next } });
                    changed.push({ fileId: id, fileName: String(meta.data.name), count: spans.length });
                } catch (e: any) {
                    logger.warn(`[NOMBRES] No se pudo cambiar ${id}: ${e?.message}`);
                    skipped.push(id);
                }
            }
            const total = changed.reduce((a, c) => a + c.count, 0);
            const s2 = await saveDecision({ canonical, others, kind: "mismo", at: new Date().toISOString(), applied: total });
            logger.info(`[NOMBRES] ${uid}: «${others.join("/")}» → «${canonical}» en ${changed.length} documentos (${total} cambios)`);
            return { ...s2, changed, skipped };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
