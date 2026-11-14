// Oct 2026: El Arquitecto, modo «Conectar» (el modo por defecto).
// Para antes de escribir: el autor tiene ideas sueltas o un mundo establecido y no sabe cómo conectarlo.
// Una sola llamada a Claude por mensaje (antes: 3 clasificadores + respuesta), con su canon citado por
// archivo, su memoria y la conversación. Al cerrar, resume: ideas sueltas, conexiones decididas,
// lo que falta decidir y una escena que ya puede escribir (y lo guarda en Recursos para Obsidian).
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { TaskType } from "./utils/genai";
import { HttpsError } from "firebase-functions/v2/https";
import { callClaude, claudeEnabledForCurrentUser, CLAUDE_SONNET, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext } from "./utils/memory_store";
import { GeminiEmbedder } from "./utils/vector_utils";
import { GoogleGenerativeAI } from "./utils/genai";
import { smartGenerateContent } from "./utils/smart_generate";
import { fileText } from "./personajes";
import { CRAFT_RULE, splitCraft, saveCraft, craftContext } from "./craft";
import { planContext, loadPlan } from "./plan_context";
import { saveBookPov } from "./mira_taller";
import { fileChangeDates, dateTag, CANON_DATES_RULE } from "./utils/canon_dates";
import { sharedContext, noteAuthorMessage, noteDecision } from "./utils/shared_context";

const FOLDER = "application/vnd.google-apps.folder";
export const SESSIONS_FOLDER = "Sesiones del Arquitecto";

/** Auditoría (disonancias) solo si el autor lo pide; todo lo demás es conectar. */
export function wantsAudit(goal: string): boolean {
    const g = goal || "";
    // Nov 2026: planear (sesión de cimientos, estructura, capas, plan del libro) es una conversación, aunque
    // mencione «contradicciones o huecos» de paso. Antes caía en la auditoría formal (lista de disonancias)
    // y el Arquitecto respondía con preguntas de reglas del mundo que no tenían que ver con el libro.
    if (/(cimientos|planear|planificar|plan del libro|estructura|columna de la historia|tres capas|capítulo a capítulo|actos)/i.test(g)) return false;
    return /(inconsisten|contradic|consistencia|auditor|lagunas?|huecos? l[oó]gic|disonanc|errores? (de|en) (mi )?(mundo|lore|sistema))/i.test(g);
}

// Nov 2026: también en el nivel gratis. Antes, sin Claude, la conversación caía en la auditoría antigua
// (varios pasos, 3 a 5 minutos por respuesta y sin agenda). Ahora es la misma conversación, con Gemini.
export function connectAvailable(): boolean {
    return true;
}

const CONECTAR_SYSTEM = `Eres El Arquitecto de MyWorld. El autor viene ANTES de escribir: tiene una idea nueva, varias ideas sueltas o un mundo ya establecido, y no sabe cómo conectarlo todo. Tu trabajo es ayudarle a ver las conexiones que ya existen en su material y a decidir las que faltan. Él decide; tú preguntas, muestras y ordenas.

CÓMO TRABAJAS:
1. Conoces su material. Apóyate en los fragmentos de su canon, su memoria y el mapa de sus archivos. Cuando conectes dos piezas, nombra de qué archivo sale cada una («en Errantes dices…; en Letum…»). Nunca inventes hechos de su mundo: si algo no está en su material, pregúntalo.
2. Haz como mucho 2 preguntas por mensaje, y que sean de las que él no se haría solo: las que cruzan dos piezas de su mundo, revelan una consecuencia o le obligan a elegir.
3. Presenta cada conexión como hipótesis con su consecuencia («Si X está ligado a Y, entonces Z. ¿Te sirve o te rompe algo?»). Si está atascado, ofrece 2 o 3 caminos distintos con lo que gana y lo que pierde cada uno.
4. Cuida el miedo al retcon: si una decisión afecta libros o eras futuras, dilo y propón cómo dejarla abierta sin comprometerse todavía.
5. Nunca escribes su trama ni su prosa. Puedes ordenar, resumir lo que ya decidió y señalar lo que falta decidir.
6. Si lo que quiere es jugar sin compromiso, sugiérele la pestaña «Qué pasaría si»; si quiere completar la ficha de un personaje, la pestaña «Personajes».
7. Breve y claro: entre 100 y 220 palabras, en párrafos cortos (2 o 3 líneas) que se lean bien en un celular. Sin títulos innecesarios. Termina con tu pregunta.
8. Su proyecto puede tener varias sagas o libros con documentos que se llaman igual (p. ej. «Capítulo 1» del libro de Anna y del de Megu). Fíjate en la carpeta de cada documento (va entre paréntesis) y no los mezcles. Si no sabes cuál es, pregúntale; si te falta el texto, pídele que lo traiga con «Traer un documento» (el botón junto al mensaje).
9. Si el autor trajo documentos a la conversación, léelos completos: son la referencia principal cuando hable de ellos.
10. Antes de decir que algo «no está en su material», búscalo en el MATERIAL DEL LIBRO EN FOCO, en lo que nombró y en los fragmentos. Si de verdad no está, di en qué documentos lo buscaste para que él pueda corregirte.
11. La sesión tiene un fin: que el autor pueda escribir sin dudas que lo frenen. Decide con él solo lo necesario para escribir. Lo que se decide mejor al redactar (gestos, quién mira a quién, frases, el orden exacto dentro de una escena) no lo preguntes: dile «esto lo decides al escribir». No abras un tema nuevo si el actual ya alcanza.
12. REABRIR UNA DECISIÓN. Si el autor duda de algo que ya decidió (está en el PLAN DEL LIBRO, en la memoria o en esta conversación) o llega con otra idea para lo mismo, eso es trabajo normal, no un problema: los planes de una saga se corrigen. No defiendas la decisión anterior ni aceptes la nueva sin mirarla. Haz esto: (a) di en una línea qué quedó decidido y para qué servía; (b) pon la idea nueva al lado y di qué gana y qué pierde cada una respecto a lo que él quiere del libro y de los libros que vienen; (c) cuando elija, dilo sin rodeos («esto reemplaza a…») y nombra qué texto ya escrito queda por rehacer o descartar. Queda anotado al cerrar la sesión.
13. DECISIONES DE ESTRUCTURA (por dónde empieza el libro, qué se cuenta en detalle y qué se resume, cuánto dura una etapa). No las des por buenas solo porque el autor las aceptó. Pruébalas con él contra tres preguntas: qué le promete este tramo al lector (hacia dónde va el libro), qué cambia para el personaje al final del tramo, y qué perdería el libro si ese tramo ocupara una página. Si una parte no tiene respuesta para las tres, dilo: es la señal de que ese tramo puede alargarse sin rumbo. Dile también qué riesgo le ves a la opción que elija, aunque te guste.`;

// Nov 2026: la agenda de la sesión. Para que la conversación no parezca infinita: el Arquitecto arma los puntos
// al empezar, los marca al avanzar y avisa cuando ya se puede escribir. La línea no se le muestra al autor.
const AGENDA_RULE = `AGENDA (obligatorio): termina SIEMPRE tu respuesta con una línea aparte, que el autor no ve, así:
[[AGENDA]] {"puntos":[{"t":"título corto","e":"hecho|ahora|pendiente"}],"cerrar":false}
- Si no hay agenda todavía, ármala desde el objetivo del autor: de 3 a 6 puntos, lo mínimo para que pueda escribir (p. ej. «Narrador», «Amigos del campo», «Por qué se van», «Capítulos del acto 1»).
- Después mantén los mismos puntos y su orden. Agrega uno solo si el autor abre un tema nuevo de verdad.
- Un punto está «hecho» cuando lo decidido alcanza para escribir esa parte, aunque queden detalles. Si en tu respuesta dices que algo «ya está decidido» o resumes lo decidido de un punto, ese punto va «hecho» en esta misma línea: no lo dejes en «ahora» por prudencia.
- "cerrar": true cuando todos estén hechos. Entonces, en tu respuesta, dile que ya puede escribir y que con «Cerrar y resumir» lo decidido pasa a su roadmap del escritorio. No sigas preguntando.
- Si llevas varias respuestas en el mismo punto, dile en una frase dónde van y qué falta, y propón dejar el resto para cuando escriba.
- Una sesión rinde hasta unas 25 respuestas. Pasada esa cantidad, propón cerrar esta y seguir lo pendiente en una conversación nueva (lo decidido no se pierde: queda en su roadmap).`;

export interface AgendaPoint { t: string; e: "hecho" | "ahora" | "pendiente" }
export function splitAgenda(text: string): { text: string; agenda: AgendaPoint[] | null; cerrar: boolean } {
    const i = text.lastIndexOf("[[AGENDA]]");
    if (i < 0) return { text: text.trim(), agenda: null, cerrar: false };
    const clean = text.slice(0, i).trim();
    try {
        const raw = text.slice(i + 10).trim();
        const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        const puntos: AgendaPoint[] = (Array.isArray(j.puntos) ? j.puntos : []).slice(0, 8)
            .map((p: any) => ({ t: String(p?.t || "").slice(0, 60), e: (["hecho", "ahora", "pendiente"].includes(p?.e) ? p.e : "pendiente") as AgendaPoint["e"] }))
            .filter((p: AgendaPoint) => p.t);
        return { text: clean, agenda: puntos.length ? puntos : null, cerrar: !!j.cerrar };
    } catch { return { text: clean, agenda: null, cerrar: false }; }
}

const CLOSE_TASK = `El autor cierra esta sesión con El Arquitecto. Resume SOLO lo que pasó en la conversación, en markdown, con estas secciones (omite las vacías):
## Ideas sueltas
(lo que apareció y no se conectó todavía)
## Conexiones que decidiste
(SOLO lo que el autor aceptó o afirmó; con sus palabras cuando se pueda)
## Por decidir
(las preguntas abiertas más importantes, máximo 5)
## Una escena que ya puedes escribir
(UNA escena concreta que, con lo decidido, ya se puede escribir: quién, dónde, qué cambia. En una o dos frases; sin prosa)
No agregues nada que el autor no haya dicho o aceptado en Conexiones. Breve.`;

const PLAN_TASK = `Convierte lo que el autor decidió en esta sesión en los pasos que hará en el escritorio, en orden: de 3 a 8 misiones cortas y concretas, empezando por un verbo (p. ej. «Reescribir el capítulo 1: el festival de los 5 años, con Anna escondida detrás de Marco»). Solo lo decidido o lo que falta escribir; nada que el autor no haya dicho o aceptado.
SI RECIBES UN «PLAN ANTERIOR» del mismo libro: el plan nuevo lo CONTINÚA, no lo borra. Conserva tal cual (mismas palabras) las misiones anteriores que siguen valiendo; quita o reescribe solo las que esta sesión cambió o dejó sin sentido; añade las nuevas. Si el plan anterior es de otro libro, ignóralo.
"reemplaza": lo que esta sesión cambió respecto a lo decidido antes, una frase por cambio («Antes: contar la infancia de Ana en detalle. Ahora: un solo capítulo de infancia que termina en el golpe»). Vacío si no cambió nada.
"rehacer": textos ya escritos que el autor decidió volver a escribir o descartar, con el nombre que él usa («Capítulo 1 del libro de Ana») y el motivo en una frase. Vacío si no hay.
"pov": solo si en la sesión se decidió de forma explícita quién narra ese libro (persona, distancia y tiempo verbal, en una frase); si no se decidió, "".
Responde SOLO con JSON: {"libro":"…","misiones":["…"],"reemplaza":["…"],"rehacer":[{"doc":"…","motivo":"…"}],"pov":""}`;

function drv(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

/** Mapa de su material: nombres de archivos del canon por carpeta (barato, sin leer contenido). */
async function worldMap(uid: string): Promise<string> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").limit(600).get();
    const groups: Record<string, string[]> = {};
    for (const d of snap.docs) {
        const f: any = d.data();
        if (f.type === "folder" || f.mimeType === FOLDER) continue;
        if (f.driveId && f.driveId !== d.id) continue; // Nov 2026: entrada fantasma de una ficha antigua
        const path = String(f.path || f.name || "");
        const top = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : (f.category === "reference" ? "Recursos" : "Raíz");
        const label = `${f.category === "reference" ? "[Recursos] " : ""}${top}`;
        (groups[label] ||= []).push(String(f.name || "").replace(/\.md$/i, ""));
    }
    const lines = Object.keys(groups).sort().map(k => `- ${k}: ${groups[k].slice(0, 25).join(", ")}${groups[k].length > 25 ? ` (+${groups[k].length - 25})` : ""}`);
    return lines.join("\n").slice(0, 6000);
}

/** Material NOMBRADO: si el autor menciona un personaje, lugar, concepto o archivo por su nombre,
 *  se trae ese archivo directo (la búsqueda por similitud se diluye cuando el mensaje toca varios temas). */
export async function namedMaterial(uid: string, text: string, maxFiles = 5, skip?: Set<string>): Promise<string> {
    try {
        const db = getFirestore();
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const t = ` ${norm(text)} `;
        const mentioned = (name: string) => {
            const n = norm(name).trim();
            if (n.length < 4) return false;
            return new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es)?[^a-z0-9]`).test(t); // admite plural
        };
        const [filesSnap, pIdx, mapa] = await Promise.all([
            db.collection("TDB_Index").doc(uid).collection("files").get(),
            db.collection("users").doc(uid).collection("personajes").doc("index").get(),
            db.collection("users").doc(uid).collection("mapa").doc("grafo").get(),
        ]);
        const files = filesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter((f: any) => f.type !== "folder" && f.mimeType !== FOLDER);
        const byName = new Map(files.map((f: any) => [norm(String(f.name || "").replace(/\.md$/i, "")), f]));
        const picked: { id: string; name: string; why: string }[] = [];
        const add = (f: any, why: string) => { if (f && !skip?.has(normName(String(f.name || "").replace(/\.md$/i, ""))) && !picked.some(p => p.id === f.id) && picked.length < maxFiles) picked.push({ id: f.id, name: `${String(f.name || "").replace(/\.md$/i, "")}${f.path && f.path !== f.name ? ` (${String(f.path).replace(/\/[^/]*$/, "")})` : ""}`, why }); };
        const entities: { nombre: string; alias?: string[]; fileId?: string | null; archivos?: string[] }[] = [
            ...(((pIdx.data() as any)?.personajes) || []).map((p: any) => ({ nombre: p.nombre, alias: p.alias, fileId: p.fichaFileId, archivos: p.archivos })),
            ...(((mapa.data() as any)?.nodes) || []).map((n: any) => ({ nombre: n.nombre, fileId: n.fileId, archivos: n.archivos })),
        ];
        for (const e of entities) {
            if (![e.nombre, ...(e.alias || [])].some(n => n && mentioned(n))) continue;
            if (e.fileId) add(files.find((f: any) => f.id === e.fileId), e.nombre);
            for (const a of (e.archivos || []).slice(0, 2)) add(byName.get(norm(a)), e.nombre);
        }
        for (const f of files) if (mentioned(String(f.name || "").replace(/\.md$/i, ""))) add(f, "archivo");
        if (!picked.length) return "";
        const texts = await Promise.all(picked.map(p => fileText(uid, p.id, 2500).catch(() => "")));
        const out = picked.map((p, i) => texts[i] ? `### ${p.name}\n${texts[i]}` : "").filter(Boolean);
        logger.info(`🏛️ [ARQUITECTO·CONECTAR] Material nombrado: ${picked.map(p => `${p.name} (${p.why})`).join(", ")}`);
        return out.join("\n\n");
    } catch (e: any) {
        logger.warn(`[ARQUITECTO·CONECTAR] Sin material nombrado: ${e?.message}`);
        return "";
    }
}

/** Nov 2026: el libro en foco. Si el objetivo de la sesión o un documento traído apunta a una carpeta
 *  (p. ej. «JUST ANNA» para «el libro de Anna»), todos sus documentos entran (fichas, estructura, capítulos),
 *  así el Arquitecto no dice «no está en tu material» cuando sí está en la ficha o en la estructura. */
const GENERIC = new Set(["historia", "historias", "libro", "libros", "capitulo", "capitulos", "personaje", "personajes", "mundo", "canon", "recursos", "ideas", "design", "character", "notas", "borrador", "borradores", "just", "saga", "sagas", "the"]);
async function focusMaterial(uid: string, goal: string, sharedDocs: string[], budget = 42000): Promise<{ text: string; folders: string[]; names: string[] }> {
    try {
        const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").select("name", "path", "category", "type", "mimeType").limit(800).get();
        const files = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter((f: any) => f.type !== "folder" && f.mimeType !== FOLDER && f.category !== "reference" && f.path);
        const top = (p: string) => String(p).split("/")[0];
        const folders = new Set<string>();
        for (const id of sharedDocs) { const f: any = files.find((x: any) => x.id === id); if (f && String(f.path).includes("/")) folders.add(top(f.path)); }
        const g = ` ${norm(goal)} `;
        for (const name of new Set(files.filter((f: any) => String(f.path).includes("/")).map((f: any) => top(f.path)))) {
            const tokens = norm(String(name)).split(/[^a-z0-9]+/).filter(t => t.length >= 4 && !GENERIC.has(t));
            if (tokens.some(t => new RegExp(`[^a-z0-9]${t}[^a-z0-9]`).test(g))) folders.add(String(name));
        }
        if (!folders.size) return { text: "", folders: [], names: [] };
        // Primero lo que define el libro (estructura, fichas, personajes), después los capítulos.
        const inFocus = files.filter((f: any) => folders.has(top(f.path)))
            .sort((a: any, b: any) => (/(estructura|ficha|personaje|plan|resumen)/i.test(b.name) ? 1 : 0) - (/(estructura|ficha|personaje|plan|resumen)/i.test(a.name) ? 1 : 0));
        const out: string[] = [];
        const names: string[] = [];
        let left = budget;
        for (const f of inFocus.slice(0, 30) as any[]) {
            if (left < 1500) break;
            const t = await fileText(uid, f.id, Math.min(9000, left));
            if (!t) continue;
            left -= t.length;
            names.push(String(f.name).replace(/\.md$/i, ""));
            out.push(`### ${String(f.name).replace(/\.md$/i, "")} (${String(f.path).replace(/\/[^/]*$/, "")})\n${t}`);
        }
        logger.info(`🏛️ [ARQUITECTO·CONECTAR] Libro en foco: ${[...folders].join(", ")} (${out.length} documentos)`);
        return { text: out.join("\n\n"), folders: [...folders], names };
    } catch (e: any) {
        logger.warn(`[ARQUITECTO·CONECTAR] Sin libro en foco: ${e?.message}`);
        return { text: "", folders: [], names: [] };
    }
}

/** Nov 2026: documentos que el autor trajo a la conversación con «Traer un documento» (hasta 3, completos). */
async function sharedMaterial(uid: string, ids: string[]): Promise<string> {
    if (!ids.length) return "";
    try {
        const col = getFirestore().collection("TDB_Index").doc(uid).collection("files");
        const out: string[] = [];
        let budget = 36000;
        for (const id of ids.slice(-3)) {
            const meta: any = (await col.doc(id).get()).data() || {};
            const t = await fileText(uid, id, Math.max(2000, Math.floor(budget / Math.max(1, ids.length))));
            if (!t) continue;
            budget -= t.length;
            const folder = meta.path && String(meta.path).includes("/") ? ` (${String(meta.path).replace(/\/[^/]*$/, "")})` : "";
            out.push(`### ${String(meta.name || id).replace(/\.md$/i, "")}${folder}\n${t}`);
        }
        return out.join("\n\n");
    } catch (e: any) {
        logger.warn(`[ARQUITECTO·CONECTAR] Documentos traídos: ${e?.message}`);
        return "";
    }
}

/** Fragmentos de su material parecidos a lo que se habla (canon primero, luego recursos). */
async function relevantMaterial(uid: string, text: string, apiKey: string, skip?: Set<string>): Promise<string> {
    try {
        const embedder = new GeminiEmbedder({ apiKey, model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
        const v = await embedder.embedQuery(text.slice(0, 2000));
        const snap = await getFirestore().collectionGroup("chunks").where("userId", "==", uid)
            .where("path", ">=", "").where("path", "<=", "")
            .findNearest({ vectorField: "embedding", queryVector: v, limit: 18, distanceMeasure: "COSINE" }).get();
        const perFile: Record<string, number> = {};
        const seen = new Set<string>();
        const canon: string[] = [], refs: string[] = [];
        let chars = 0;
        const changedAt = await fileChangeDates(uid, snap.docs.map(d => d.ref.parent.parent?.id));
        for (const d of snap.docs) {
            const c: any = d.data();
            const name = String(c.fileName || "Desconocido").replace(/\.md$/i, "");
            const t = String(c.text || "").trim();
            if (!t || seen.has(t.slice(0, 80))) continue;
            if (skip?.has(normName(name))) continue; // ya va completo en el bloque con caché
            seen.add(t.slice(0, 80));
            perFile[name] = (perFile[name] || 0) + 1;
            if (perFile[name] > 2 || chars + t.length > 11000) continue;
            chars += t.length;
            const folder = c.path && String(c.path).includes("/") ? ` (${String(c.path).replace(/\/[^/]*$/, "")})` : "";
            (c.category === "reference" ? refs : canon).push(`### ${name}${folder}${dateTag(changedAt.get(d.ref.parent.parent?.id || ""))}\n${t}`);
        }
        return [canon.length ? `CANON:\n${canon.join("\n\n")}` : "", refs.length ? `RECURSOS (referencias e ideas no canon):\n${refs.join("\n\n")}` : ""].filter(Boolean).join("\n\n");
    } catch (e: any) {
        logger.warn(`[ARQUITECTO·CONECTAR] Sin material relevante (embedding): ${e?.message}`);
        return "";
    }
}

async function sessionHistory(uid: string, sessionId: string, limit = 16): Promise<string> {
    const snap = await getFirestore().collection("users").doc(uid).collection("forge_sessions").doc(sessionId)
        .collection("messages").orderBy("timestamp", "desc").limit(limit).get();
    return snap.docs.reverse()
        .filter(d => (d.data() as any).role !== "system")
        .map(d => {
            const m: any = d.data();
            const t = String(m.text || "");
            return `${m.role === "user" ? "AUTOR" : "ARQUITECTO"}: ${m.role === "user" ? t.slice(0, 2500) : t.slice(0, 1400)}`;
        }).join("\n\n");
}

async function ask(contextBlocks: string[], instruction: string, label: string, maxTokens = 3000, stable = "", apiKey = ""): Promise<string> {
    if (!claudeEnabledForCurrentUser()) return askGemini(contextBlocks, instruction, label, maxTokens, stable, apiKey);
    // Nov 2026: el material del libro en foco no cambia entre mensajes: va primero y con caché de 1 h (1/10 del precio).
    const content: any[] = [];
    if (stable) content.push({ type: "text", text: stable, cache_control: { type: "ephemeral", ttl: "1h" } });
    content.push({ type: "text", text: [...contextBlocks.filter(Boolean), instruction].join("\n\n") });
    const r = await callClaude({
        model: CLAUDE_SONNET,
        system: [{ text: CONECTAR_SYSTEM + "\n\n" + CANON_DATES_RULE + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
        content,
        maxTokens,
        // Nov 2026: la conversación piensa un poco más (es donde se decide el libro); cerrar y planear siguen en bajo.
        effort: label === "ArquitectoConectar" ? "medium" : "low",
        label,
    } as any);
    if (!r.ok || !r.text) {
        if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
        throw new HttpsError("internal", "El Arquitecto no pudo responder. Intenta de nuevo.");
    }
    return r.text.trim();
}

// Nov 2026: nivel gratis. Una sola llamada a Gemini con el mismo material y las mismas reglas.
async function askGemini(contextBlocks: string[], instruction: string, label: string, maxTokens: number, stable: string, apiKey: string): Promise<string> {
    if (!apiKey) throw new HttpsError("failed-precondition", "El Arquitecto no tiene una clave de IA para responder.");
    const prompt = [stable, ...contextBlocks.filter(Boolean), instruction].filter(Boolean).join("\n\n");
    const r = await smartGenerateContent(new GoogleGenerativeAI(apiKey), prompt, {
        systemInstruction: CONECTAR_SYSTEM + "\n\n" + CANON_DATES_RULE + "\n\n" + MYWORLD_VOICE,
        _tier: "normal", taskType: "standard", thinkingBudget: 1024,
        maxOutputTokens: Math.max(maxTokens, 2048), temperature: 0.7,
        contextLabel: `${label}_Gemini`,
    });
    if (!r.text) {
        logger.warn(`⚠️ [ARQUITECTO·CONECTAR] ${label} (Gemini) sin texto: ${r.error || ""} ${r.details || ""}`);
        throw new HttpsError("internal", "El Arquitecto no pudo responder. Intenta de nuevo.");
    }
    return r.text.trim();
}

/** Primer mensaje de una sesión «Conectar». */
export async function conectarStart(uid: string, goal: string, apiKey: string): Promise<string> {
    const [map, memory, material, named, plan] = await Promise.all([
        worldMap(uid),
        getMemoryContext(uid, goal),
        relevantMaterial(uid, goal, apiKey),
        namedMaterial(uid, goal),
        planContext(uid),
    ]);
    logger.info(`🏛️ [ARQUITECTO·CONECTAR] Inicio: mapa ${map.length} car., material ${material.length} car.`);
    return ask([
        map ? `MAPA DE SU MATERIAL (archivos por carpeta):\n${map}` : "MAPA DE SU MATERIAL: (todavía no hay archivos)",
        memory ? `MEMORIA DEL PROYECTO (decisiones y dónde quedó):\n${memory}` : "",
        plan,
        named ? `LO QUE NOMBRÓ (archivos de lo que mencionó):\n${named}` : "",
        material ? `FRAGMENTOS RELEVANTES:\n${material}` : "",
    ], `INICIO DE SESIÓN. El autor dice lo que trae hoy:\n«${goal}»\n\nResponde: en 3 a 5 líneas, qué piezas de su material ves relacionadas con eso (nombrando archivos) y por qué; luego dile en una línea los puntos que van a ver hoy (la agenda) y haz tu primera pregunta (máximo 2). Si su material está vacío, pregúntale por lo esencial en vez de suponer.\n\n${AGENDA_RULE}`, "ArquitectoConectarInicio", 3000, (await focusMaterial(uid, goal, [])).text, apiKey);
}

// Nov 2026 (gasto): nombres de los documentos que ya van completos en el bloque con caché (para no repetirlos).
const normName = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
function sharedNames(shared: string): string[] {
    return [...String(shared || "").matchAll(/^### (.+)$/gm)].map(m => m[1]);
}

/** Respuesta a un mensaje en una sesión «Conectar». */
export async function conectarReply(uid: string, sessionId: string, goal: string, query: string, apiKey: string, sharedDocs: string[] = []): Promise<string> {
    // Nov 2026 (gasto): 12 mensajes de historial (la agenda y la memoria guardan lo anterior).
    const history = await sessionHistory(uid, sessionId, 12);
    const hint = `${query} ${history.slice(-1200)}`;
    await noteAuthorMessage(uid, "arquitecto", query);
    const [memory, elsewhere, shared, focus, craft, plan] = await Promise.all([
        getMemoryContext(uid, hint),
        sharedContext(uid, "arquitecto"),
        sharedMaterial(uid, sharedDocs),
        focusMaterial(uid, goal, sharedDocs),
        craftContext(uid),
        planContext(uid),
    ]);
    const already = new Set([...focus.names, ...sharedNames(shared)].map(normName));
    const [material, named] = await Promise.all([
        relevantMaterial(uid, hint, apiKey, already),
        namedMaterial(uid, query, 4, already),
    ]);
    // Nov 2026 (gasto): lo que no cambia entre mensajes (el libro en foco y los documentos que trajo) va junto en el
    // bloque con caché: se cobra a 1/20 en cada respuesta. Lo nombrado y los fragmentos no repiten esos documentos.
    const stable = [
        focus.text ? `MATERIAL DEL LIBRO EN FOCO (carpetas: ${focus.folders.join(", ")}; documentos completos o casi):\n${focus.text}` : "",
        shared ? `DOCUMENTOS QUE EL AUTOR TRAJO A LA CONVERSACIÓN (completos):\n${shared}` : "",
    ].filter(Boolean).join("\n\n");
    const sref = getFirestore().collection("users").doc(uid).collection("forge_sessions").doc(sessionId);
    const sdata: any = (await sref.get()).data() || {};
    const agenda: AgendaPoint[] = Array.isArray(sdata.agenda) ? sdata.agenda : [];
    const turns = Number(sdata.turns || 0) + 1;
    const raw = await ask([
        goal ? `OBJETIVO DE LA SESIÓN: ${goal}` : "",
        memory ? `MEMORIA DEL PROYECTO:\n${memory}` : "",
        elsewhere,
        plan,
        craft,
        named ? `LO QUE NOMBRÓ (archivos de lo que mencionó):\n${named}` : "",
        material ? `FRAGMENTOS RELEVANTES DE SU MATERIAL:\n${material}` : "",
        history ? `CONVERSACIÓN HASTA AHORA:\n${history}` : "",
        agenda.length ? `AGENDA ACTUAL DE LA SESIÓN (respuesta n.º ${turns}):\n${agenda.map(p => `- [${p.e}] ${p.t}`).join("\n")}` : `AGENDA: todavía no hay (respuesta n.º ${turns}); ármala.`,
    ], `AUTOR: ${query}\n\n${CRAFT_RULE}\n\n${AGENDA_RULE}`, "ArquitectoConectar", 3000, stable, apiKey);
    // Nov 2026: primero el foco de oficio (si lo anotó), después la agenda.
    const sc = splitCraft(raw);
    if (sc.craft) await saveCraft(uid, sc.craft, "arquitecto");
    const out = splitAgenda(sc.text);
    // Lo que acaba de quedar cerrado en la agenda se cuenta al momento a Mira e Ideas.
    if (out.agenda) {
        const wasDone = new Set(agenda.filter(p => p.e === "hecho").map(p => p.t));
        for (const p of out.agenda.filter(p => p.e === "hecho" && !wasDone.has(p.t)).slice(0, 3)) await noteDecision(uid, "arquitecto", `Quedó resuelto con el Arquitecto el punto «${p.t}» (libro: ${goal ? goal.slice(0, 80) : "sin objetivo anotado"})`);
    }
    await sref.set({ turns, ...(out.agenda ? { agenda: out.agenda } : {}), agendaCerrar: out.cerrar }, { merge: true });
    return out.text;
}

/** Cierre: resumen en cuatro partes; se guarda como nota en Recursos/«Sesiones del Arquitecto». */
export async function conectarClose(uid: string, sessionId: string, accessToken?: string, apiKey = ""): Promise<{ summary: string; savedAs?: string }> {
    const history = await sessionHistory(uid, sessionId, 40);
    if (!history) throw new HttpsError("failed-precondition", "No hay conversación que resumir.");
    const summary = await ask([`CONVERSACIÓN COMPLETA:\n${history}`], CLOSE_TASK, "ArquitectoCierre", 3000, "", apiKey);
    // Nov 2026: lo decidido pasa al plan del escritorio («Según tu plan, sigue…»), y queda a nivel de proyecto:
    // no se pierde al empezar otra conversación.
    try {
        // Nov 2026: cerrar una sesión ya no borra el plan anterior. Una sesión corta para cambiar una decisión
        // se llevaba por delante todo lo decidido antes; ahora el plan nuevo continúa el anterior.
        const prev = await loadPlan(uid);
        const prevBlock = prev ? `PLAN ANTERIOR${prev.libro ? ` (${prev.libro})` : ""}:\n${prev.missions.map((m, i) => `${i + 1}. [${prev.done.includes(i) ? "hecho" : "pendiente"}] ${m}`).join("\n")}` : "";
        const planRaw = await ask([`RESUMEN DE LA SESIÓN:\n${summary}`, prevBlock].filter(Boolean), PLAN_TASK, "ArquitectoPlan", 1600, "", apiKey);
        const j = JSON.parse(planRaw.slice(planRaw.indexOf("{"), planRaw.lastIndexOf("}") + 1));
        const misiones: string[] = (Array.isArray(j.misiones) ? j.misiones : []).map((m: any) => String(m || "").trim().slice(0, 200)).filter(Boolean).slice(0, 8);
        if (misiones.length) {
            const db = getFirestore();
            const now = new Date().toISOString();
            await db.collection("users").doc(uid).collection("forge_sessions").doc(sessionId).collection("architect").doc("roadmapFinal")
                .set({ creationMissions: misiones, changelog: [], researchMissions: [], source: "conectar", createdAt: now }, { merge: true });
            // Las misiones que siguen con las mismas palabras conservan su marca de «hecho».
            const done = prev ? misiones.map((m, i) => (prev.missions.some((pm, pi) => pm === m && prev.done.includes(pi)) ? i : -1)).filter(i => i >= 0) : [];
            const clean = (x: any, n: number) => String(x || "").replace(/\s+/g, " ").trim().slice(0, n);
            const rehacer = (Array.isArray(j.rehacer) ? j.rehacer : []).map((r: any) => ({ doc: clean(r?.doc, 120), motivo: clean(r?.motivo, 240), at: now })).filter((r: any) => r.doc).slice(0, 6);
            const reemplaza = (Array.isArray(j.reemplaza) ? j.reemplaza : []).map((r: any) => clean(r, 300)).filter(Boolean).slice(0, 6);
            // Lo marcado para rehacer en sesiones anteriores sigue ahí hasta que el autor lo marque como hecho.
            const keepRedo = (prev?.rehacer || []).filter(r => !rehacer.some((n: any) => n.doc.toLowerCase() === r.doc.toLowerCase()));
            await db.collection("users").doc(uid).collection("plan").doc("current").set({
                missions: misiones, done, sessionId, at: now, libro: String(j.libro || "").slice(0, 80),
                rehacer: [...keepRedo, ...rehacer].slice(-8), reemplaza, reemplazaAt: reemplaza.length ? now : "",
            });
            for (const r of reemplaza.slice(0, 3)) await noteDecision(uid, "arquitecto", `Cambió una decisión con el Arquitecto. ${r}`);
            for (const r of rehacer.slice(0, 3)) await noteDecision(uid, "arquitecto", `Quedó en rehacer «${r.doc}»${r.motivo ? `: ${r.motivo}` : ""}`);
        }
        // Nov 2026: si decidieron quién narra, queda en «Decisiones del libro» (la biblioteca, Mira y el reporte lo respetan).
        const pov = String(j.pov || "").trim().slice(0, 300);
        const libro = String(j.libro || "").trim().slice(0, 80);
        if (pov && libro) await saveBookPov(uid, libro, pov, "arquitecto").catch(() => {});
    } catch (e: any) { logger.warn(`[ARQUITECTO·CONECTAR] Plan sin guardar: ${e?.message}`); }
    let savedAs: string | undefined;
    if (accessToken) {
        try {
            const cfg: any = (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
            const rootId: string | undefined = (cfg.resourcePaths || [])[0]?.id;
            if (rootId) {
                const drive = drv(accessToken);
                const q = `'${rootId}' in parents and name = '${SESSIONS_FOLDER}' and mimeType = '${FOLDER}' and trashed = false`;
                let folderId = (await drive.files.list({ q, fields: "files(id)", pageSize: 1 })).data.files?.[0]?.id;
                if (!folderId) {
                    folderId = (await drive.files.create({ requestBody: { name: SESSIONS_FOLDER, mimeType: FOLDER, parents: [rootId] }, fields: "id" })).data.id!;
                }
                const sess: any = (await getFirestore().collection("users").doc(uid).collection("forge_sessions").doc(sessionId).get()).data() || {};
                const goal = String(sess.implementationGoal || "Sesión").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^(.{0,60})(\s.*)?$/, "$1").trim().slice(0, 80);
                const date = new Date().toISOString().slice(0, 10);
                const name = `${date} ${goal}.md`;
                const content = `---\ntipo: sesion-arquitecto\ncanon: no\nfecha: ${date}\n---\n\n# ${goal}\n\n${summary}\n`;
                await drive.files.create({ requestBody: { name, mimeType: "text/markdown", parents: [folderId] }, media: { mimeType: "text/markdown", body: content }, fields: "id" });
                savedAs = `Recursos → ${SESSIONS_FOLDER} → ${name.replace(/\.md$/, "")}`;
            }
        } catch (e: any) {
            logger.warn(`[ARQUITECTO·CONECTAR] Resumen sin guardar en Drive: ${e?.message}`);
        }
    }
    return { summary, savedAs };
}
