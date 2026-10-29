// Oct 2026: «Personajes» (antes: la Forja de Almas), dentro de Preparar.
// La verdad vive en los archivos del autor (Drive/Obsidian). Esta herramienta:
//  1. Escanea su canon y encuentra a sus personajes: los que tienen ficha (ANCLA) y los que aparecen
//     en el manuscrito sin ficha (FANTASMA).
//  2. Por personaje, revisa la ficha contra el manuscrito: qué tiene, qué le falta y dónde choca.
//  3. Lo entrevista el Arquitecto (una pregunta a la vez) para completar la ficha.
//  4. Propone la ficha actualizada con las palabras del autor; él la revisa y la aprueba antes de guardar.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { TaskType } from "@google/generative-ai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, CLAUDE_HAIKU, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext, slugify } from "./utils/memory_store";
import { getAIKey } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { textHash } from "./utils/text_hash";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const FOLDER = "application/vnd.google-apps.folder";

export interface Personaje {
    id: string; nombre: string; alias: string[]; tipo: "personaje" | "criatura" | "grupo";
    rol: "protagonista" | "principal" | "secundario" | "mencionado";
    resumen: string; fichaFileId: string | null; fichaNombre: string | null; archivos: string[];
}

const SCAN_TASK = `Eres el asistente de MyWorld que organiza los personajes de un autor. Recibes el catálogo de sus archivos del canon (con el inicio de cada uno) y fragmentos de su texto.
Devuelve TODOS los personajes con nombre propio (también criaturas con nombre y grupos que actúan como personaje, p. ej. una hermandad), sin inventar ninguno.
- "ficha": el nombre EXACTO del archivo (tal cual en el catálogo) que es la ficha o el documento principal de ese personaje (p. ej. «Anna», «Ficha Anna»), o null si no tiene. Una ficha es un archivo dedicado a ese personaje, no un capítulo donde aparece.
- "archivos": nombres exactos de los archivos donde aparece (máx. 8).
- Une alias y apodos del mismo personaje en una sola entrada.
- NO incluyas personajes de obras ajenas (series, anime, libros o películas que el autor analiza o cita como referencia): solo los de SU mundo.
- Razas, pueblos y especies (p. ej. «Humanos») no son personajes: omítelos; las organizaciones que actúan como personaje van como "grupo".
- "rol": protagonista | principal | secundario | mencionado, según el peso que tiene en el material.
- "resumen": una frase con lo que el material dice de él (sin inventar).
FORMATO: SOLO JSON {"personajes":[{"nombre":"…","alias":["…"],"tipo":"personaje|criatura|grupo","rol":"…","ficha":"…|null","archivos":["…"],"resumen":"…"}]}. Máximo 80, ordenados por importancia.`;

const ANALYZE_TASK = `Revisa la ficha de este personaje contra lo que el manuscrito y el canon dicen de él. No reescribes nada: diagnosticas.
Aspectos a mirar (solo los que apliquen a este tipo de personaje): deseo (lo que quiere), necesidad o herida, miedo, contradicción interna, voz (cómo habla), apariencia distintiva, relaciones clave, arco (de dónde a dónde va), lugar en el mundo (origen, afinidad, facción).
FORMATO: SOLO JSON
{
 "resumen": "2 frases: qué tan completo está y lo más importante que falta",
 "tiene": ["aspecto: lo que ya está definido, en pocas palabras"],
 "falta": [{"aspecto":"…","porQue":"por qué importa para SU historia (no genérico)","pregunta":"la pregunta que le harías al autor"}],
 "choques": [{"explicacion":"…","citaFicha":"copiada exacta de la ficha o vacía","citaTexto":"copiada exacta del manuscrito/canon","fuente":"archivo"}]
}
Máximo 6 en "falta" (los que más pesan primero) y 5 choques (solo contradicciones reales con las dos citas). Escribe en el idioma del autor.`;

const INTERVIEW_SYSTEM = `Eres El Arquitecto de MyWorld ayudando al autor a completar la ficha de un personaje suyo. Lo entrevistas: UNA pregunta a la vez, concreta, nacida de lo que falta en la ficha y de lo que ya dice su manuscrito.
- Antes de la pregunta, en una o dos frases, recoge lo que acaba de responder (con sus palabras) o señala una consecuencia de su respuesta que debería ver.
- Si su respuesta choca con algo de su canon, dilo citando el archivo y pregunta qué prefiere.
- Nunca decides por él ni escribes la ficha en la conversación; si te pide ideas, da 2 o 3 opciones cortas y distintas, y que él elija.
- Breve: máximo 120 palabras.`;

const PROPOSE_TASK = `Con la entrevista, propone la ficha actualizada del personaje.
REGLAS (muy importantes):
- Conserva TODO el texto original de la ficha, palabra por palabra, en su orden. Solo AGREGAS: nuevas líneas en la sección que corresponda, o secciones nuevas al final si no existen.
- Lo que agregues sale de las respuestas del autor, con sus palabras. Nada que él no haya dicho o aceptado.
- Si el autor corrigió explícitamente algo de la ficha, en lugar de borrar la línea original, déjala y agrega debajo la línea corregida marcada «(actualizado)». Él decidirá si borra la vieja.
FORMATO: SOLO JSON {"ficha":"markdown completo de la ficha actualizada","cambios":["resumen de cada cosa agregada, 1 línea cada una"]}`;

function drv(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

function parseJson(text: string): any {
    const j = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    return JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
}

async function claude(model: string, system: string, user: string, label: string, maxTokens: number, effort: "low" | "medium" = "low"): Promise<string> {
    const r = await callClaude({
        model, system: [{ text: system + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
        content: [{ type: "text", text: user }], maxTokens, effort, label,
    } as any);
    if (!r.ok || !r.text) {
        if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
        throw new HttpsError("internal", "No pude completar esto. Intenta de nuevo.");
    }
    return r.text.trim();
}

function userDoc(uid: string) { return getFirestore().collection("users").doc(uid); }

export async function canonFiles(uid: string) {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").get();
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((f: any) => f.type !== "folder" && f.mimeType !== FOLDER && f.category !== "reference");
}

export async function fileText(uid: string, fileId: string, maxChars: number): Promise<string> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(fileId).collection("chunks").select("text").get();
    const parts = snap.docs.map(d => ({ n: Number(d.id.replace(/\D/g, "")) || 0, t: String((d.data() as any).text || "") })).sort((a, b) => a.n - b.n);
    let out = "";
    for (const p of parts) { if (out.length + p.t.length > maxChars) break; out += (out ? "\n\n" : "") + p.t; }
    return out;
}

async function mentions(uid: string, query: string, apiKey: string, excludeFileId?: string | null): Promise<string> {
    try {
        const embedder = new GeminiEmbedder({ apiKey, model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
        const v = await embedder.embedQuery(query.slice(0, 1500));
        const snap = await getFirestore().collectionGroup("chunks").where("userId", "==", uid)
            .where("path", ">=", "").where("path", "<=", "")
            .findNearest({ vectorField: "embedding", queryVector: v, limit: 16, distanceMeasure: "COSINE" }).get();
        const perFile: Record<string, number> = {};
        let chars = 0;
        const out: string[] = [];
        for (const d of snap.docs) {
            const c: any = d.data();
            if (c.category === "reference" || (excludeFileId && d.ref.parent.parent?.id === excludeFileId)) continue;
            const name = String(c.fileName || "").replace(/\.md$/i, "");
            perFile[name] = (perFile[name] || 0) + 1;
            const t = String(c.text || "").trim();
            if (!t || perFile[name] > 3 || chars + t.length > 12000) continue;
            chars += t.length;
            out.push(`### ${name}\n${t}`);
        }
        return out.join("\n\n");
    } catch (e: any) {
        logger.warn(`[PERSONAJES] Sin menciones (embedding): ${e?.message}`);
        return "";
    }
}

async function getCharacter(uid: string, id: string): Promise<Personaje> {
    const data: any = (await userDoc(uid).collection("personajes").doc("index").get()).data() || {};
    const p = (data.personajes || []).find((x: Personaje) => x.id === id);
    if (!p) throw new HttpsError("not-found", "No encontré ese personaje. Vuelve a escanear.");
    return p;
}

export async function runPersonajesScan(uid: string): Promise<{ personajes: Personaje[]; scannedAt: string }> {
    const idxRef = userDoc(uid).collection("personajes").doc("index");
    const files = await canonFiles(uid);
    if (!files.length) throw new HttpsError("failed-precondition", "No hay archivos del canon indexados. Sincroniza tus notas primero.");
    const catalog: string[] = [];
    const bodies: string[] = [];
    let budget = 260000;
    const texts = await Promise.all(files.map(f => fileText(uid, f.id, 7000).catch(() => "")));
    files.forEach((f: any, i: number) => {
        const name = String(f.name || "").replace(/\.md$/i, "");
        const t = texts[i] || "";
        catalog.push(`- «${name}» (${f.path || name}): ${t.slice(0, 220).replace(/\s+/g, " ")}`);
        if (t && budget > 0) { const piece = t.slice(0, Math.min(7000, budget)); budget -= piece.length; bodies.push(`### ${name}\n${piece}`); }
    });
    const out = await claude(CLAUDE_HAIKU, SCAN_TASK, `CATÁLOGO DE ARCHIVOS DEL CANON:\n${catalog.join("\n").slice(0, 60000)}\n\nTEXTO:\n${bodies.join("\n\n")}\n\nResponde SOLO con el JSON.`, "PersonajesScan", 12000);
    let parsed: any;
    try { parsed = parseJson(out); } catch { throw new HttpsError("internal", "El escaneo llegó mal formado. Intenta de nuevo."); }
    const byName = new Map(files.map((f: any) => [String(f.name || "").replace(/\.md$/i, "").toLowerCase(), f]));
    const list: Personaje[] = (parsed.personajes || []).filter((p: any) => p?.nombre).map((p: any) => {
        const ficha = p.ficha ? byName.get(String(p.ficha).replace(/\.md$/i, "").toLowerCase()) : null;
        return {
            id: slugify(p.nombre), nombre: String(p.nombre), alias: (p.alias || []).map(String).slice(0, 6),
            tipo: ["criatura", "grupo"].includes(p.tipo) ? p.tipo : "personaje",
            rol: ["protagonista", "principal", "secundario", "mencionado"].includes(p.rol) ? p.rol : "secundario",
            resumen: String(p.resumen || ""), fichaFileId: ficha ? ficha.id : null, fichaNombre: ficha ? String(ficha.name).replace(/\.md$/i, "") : null,
            archivos: (p.archivos || []).map(String).slice(0, 8),
        } as Personaje;
    });
    const seen = new Set<string>();
    const unique = list.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    const now = new Date().toISOString();
    await idxRef.set({ personajes: unique, scannedAt: now });
    logger.info(`👥 [PERSONAJES] Escaneo: ${unique.length} personajes (${unique.filter(p => p.fichaFileId).length} con ficha) en ${files.length} archivos`);
    return { personajes: unique, scannedAt: now };
}

export const personajes = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 300, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, id, accessToken } = request.data || {};
        const idxRef = userDoc(uid).collection("personajes").doc("index");

        if (mode === "list") {
            const d: any = (await idxRef.get()).data() || {};
            const list: Personaje[] = d.personajes || [];
            // Carpetas del canon para crear fichas nuevas; sugerida: donde ya están la mayoría de las fichas.
            const all = (await getFirestore().collection("TDB_Index").doc(uid).collection("files").get()).docs.map(x => ({ id: x.id, ...(x.data() as any) }));
            const folders = all.filter((f: any) => (f.type === "folder" || f.mimeType === FOLDER) && f.category !== "reference")
                .map((f: any) => ({ id: f.id, path: String(f.path || f.name || "") })).sort((a, b) => a.path.localeCompare(b.path));
            const count: Record<string, number> = {};
            const fichaIds = new Set(list.map(x => x.fichaFileId).filter(Boolean));
            all.forEach((f: any) => { if (fichaIds.has(f.id) && f.parentId) count[f.parentId] = (count[f.parentId] || 0) + 1; });
            const sugerida = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
            return { personajes: list, scannedAt: d.scannedAt || null, carpetas: folders, carpetaSugerida: sugerida };
        }

        if (mode === "get") {
            const p = await getCharacter(uid, id);
            const s: any = (await userDoc(uid).collection("personajes").doc(id).get()).data() || {};
            return { personaje: p, analisis: s.analisis || null, analisisHash: s.analisisHash || null, mensajes: s.mensajes || [] };
        }

        if (!claudeEnabledForCurrentUser()) throw new HttpsError("failed-precondition", "Personajes usa Claude y todavía no está activo para tu cuenta.");

        // 1. Escanear el canon
        if (mode === "scan") return runPersonajesScan(uid);

        const p = await getCharacter(uid, id);
        const sRef = userDoc(uid).collection("personajes").doc(p.id);
        const apiKey = getAIKey(request.data, googleApiKey.value());
        const readFicha = async (): Promise<string> => {
            if (!p.fichaFileId) return "";
            if (accessToken) {
                try { return String(await _getDriveFileContentInternal(drv(accessToken), p.fichaFileId) || ""); } catch { /* cae al índice */ }
            }
            return fileText(uid, p.fichaFileId, 30000);
        };
        const who = `${p.nombre}${p.alias.length ? ` (también: ${p.alias.join(", ")})` : ""}`;

        // 2. Qué tiene, qué falta, dónde choca
        if (mode === "analyze") {
            const [ficha, memory, ment] = await Promise.all([readFicha(), getMemoryContext(uid, who), mentions(uid, `${who}: ${p.resumen}`, apiKey, p.fichaFileId)]);
            const out = await claude(CLAUDE_SONNET, ANALYZE_TASK, [
                `PERSONAJE: ${who} · ${p.tipo} · ${p.rol}`,
                ficha ? `FICHA (${p.fichaNombre}):\n<<<\n${ficha.slice(0, 30000)}\n>>>` : "FICHA: (no tiene; todo lo que se sabe sale del manuscrito)",
                memory ? `MEMORIA DEL PROYECTO:\n${memory}` : "",
                ment ? `LO QUE DICE SU MANUSCRITO Y CANON:\n${ment}` : "",
                "Responde SOLO con el JSON.",
            ].filter(Boolean).join("\n\n"), "PersonajesAnalisis", 6000, "medium");
            let analisis: any;
            try { analisis = parseJson(out); } catch { throw new HttpsError("internal", "La revisión llegó mal formada. Intenta de nuevo."); }
            const analisisHash = textHash(ficha);
            await sRef.set({ analisis, analisisHash, updatedAt: new Date().toISOString() }, { merge: true });
            return { analisis, analisisHash };
        }

        // 3. Entrevista
        if (mode === "interview") {
            const message = String(request.data?.message || "").trim().slice(0, 4000);
            const s: any = (await sRef.get()).data() || {};
            const mensajes: { role: string; text: string }[] = s.mensajes || [];
            const [ficha, ment] = await Promise.all([readFicha(), mentions(uid, `${who} ${message}`, apiKey, p.fichaFileId)]);
            const falta = (s.analisis?.falta || []).map((f: any) => `- ${f.aspecto}: ${f.pregunta}`).join("\n");
            const convo = mensajes.slice(-14).map(m => `${m.role === "user" ? "AUTOR" : "ARQUITECTO"}: ${m.text}`).join("\n\n");
            const reply = await claude(CLAUDE_SONNET, INTERVIEW_SYSTEM, [
                `PERSONAJE: ${who}`,
                ficha ? `SU FICHA ACTUAL:\n<<<\n${ficha.slice(0, 20000)}\n>>>` : "SU FICHA ACTUAL: (no tiene)",
                falta ? `LO QUE FALTA (según la revisión):\n${falta}` : "",
                ment ? `LO QUE DICE SU MANUSCRITO:\n${ment}` : "",
                convo ? `ENTREVISTA HASTA AHORA:\n${convo}` : "",
                message ? `AUTOR: ${message}` : "INICIO: haz tu primera pregunta (la que más le sirve a este personaje ahora).",
            ].filter(Boolean).join("\n\n"), "PersonajesEntrevista", 2500);
            const next = [...mensajes, ...(message ? [{ role: "user", text: message }] : []), { role: "assistant", text: reply }].slice(-60);
            await sRef.set({ mensajes: next, updatedAt: new Date().toISOString() }, { merge: true });
            return { mensajes: next };
        }

        if (mode === "resetInterview") {
            await sRef.set({ mensajes: [] }, { merge: true });
            return { mensajes: [] };
        }

        // 4. Proponer la ficha actualizada (el autor la revisa antes de guardar)
        if (mode === "propose") {
            const s: any = (await sRef.get()).data() || {};
            const mensajes: { role: string; text: string }[] = s.mensajes || [];
            if (!mensajes.some(m => m.role === "user")) throw new HttpsError("failed-precondition", "Primero responde algunas preguntas de la entrevista.");
            const ficha = await readFicha();
            const base = ficha || `# ${p.nombre}\n`;
            const out = await claude(CLAUDE_SONNET, PROPOSE_TASK, [
                `PERSONAJE: ${who}`,
                `FICHA ORIGINAL:\n<<<\n${base}\n>>>`,
                `ENTREVISTA:\n${mensajes.map(m => `${m.role === "user" ? "AUTOR" : "ARQUITECTO"}: ${m.text}`).join("\n\n")}`,
                "Responde SOLO con el JSON.",
            ].join("\n\n"), "PersonajesPropuesta", 12000, "medium");
            let parsed: any;
            try { parsed = parseJson(out); } catch { throw new HttpsError("internal", "La propuesta llegó mal formada. Intenta de nuevo."); }
            return { original: ficha, baseHash: textHash(ficha), propuesta: String(parsed.ficha || ""), cambios: parsed.cambios || [], fileId: p.fichaFileId };
        }

        // 5. Crear la ficha de un personaje que no la tiene (queda en Drive y el índice la toma al sincronizar)
        if (mode === "createFicha") {
            if (!accessToken) throw new HttpsError("failed-precondition", "Falta la conexión con Drive. Recarga la página.");
            if (p.fichaFileId) throw new HttpsError("already-exists", "Este personaje ya tiene ficha.");
            const folderId = String(request.data?.folderId || "");
            if (!folderId) throw new HttpsError("invalid-argument", "Elige la carpeta de la ficha.");
            const body = String(request.data?.content || "").trim() || `# ${p.nombre}\n`;
            const name = `${p.nombre.replace(/[\\/:*?"<>|#^[\]]/g, " ").trim()}.md`;
            const made = await drv(accessToken).files.create({
                requestBody: { name, mimeType: "text/markdown", parents: [folderId] },
                media: { mimeType: "text/markdown", body },
                fields: "id,name",
            });
            const d: any = (await idxRef.get()).data() || {};
            const list: Personaje[] = (d.personajes || []).map((x: Personaje) => x.id === p.id ? { ...x, fichaFileId: made.data.id!, fichaNombre: name.replace(/\.md$/, "") } : x);
            await idxRef.set({ personajes: list }, { merge: true });
            return { fileId: made.data.id, name };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
