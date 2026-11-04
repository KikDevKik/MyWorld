// Oct 2026: Reporte de capítulo.
// El autor termina un capítulo y pide un reporte: qué funciona, qué corregir (con la cita exacta para
// ubicarlo en el editor), ortografía con corrección aplicable, y lecturas recomendadas apoyadas en sus
// propias referencias (carpetas de Recursos). Se guarda el último reporte por archivo.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, CLAUDE_HAIKU, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext, applyMemoryOps } from "./utils/memory_store";
import { textHash } from "./utils/text_hash";
import { getAIKey } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { TaskType } from "./utils/genai";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

// Oct 2026: las tres revisiones (reporte, tres lecturas, Guardián) comparten el mismo sistema y el capítulo
// va primero con caché de 1 h: la segunda y tercera revisión leen el capítulo a 1/20 del precio.
const EDITOR_BASE = `Eres el editor de MyWorld. El autor te da un capítulo completo y, al final, la revisión que necesita.
Lees con atención, eres honesto y concreto, y nunca reescribes su prosa: señalas, explicas y sugieres.
Respondes SOLO con el JSON que pida la tarea.`;

const REPORT_SYSTEM = `TAREA: REPORTE DEL CAPÍTULO. El autor terminó el capítulo y te pide un reporte para reescribirlo.
Devuelves un diagnóstico útil, honesto y accionable.

QUÉ REVISAS:
- Lo que funciona (con la cita que lo demuestra), para que lo conserve.
- Si la memoria trae «Decisiones del libro» (punto de vista, quién narra, tiempo verbal, tono), el capítulo debe cumplirlas: cada salida es un problema de punto de vista con su cita, salvo las excepciones que el autor decidió (p. ej. capítulos cortos en otra voz).
- Problemas de oficio: punto de vista y persona narrativa, promesas sin cumplir (armas de Chéjov), continuidad con su plan y su canon, ritmo (escenas infladas o apresuradas), diálogos, claridad, tono.
- Ortografía y puntuación (incluida la de diálogos: raya, incisos, mayúsculas de nombres propios).
- LO QUE NOTA UN LECTOR REAL. Revísalo siempre; la gravedad depende de cuánto le cuesta al lector (alta solo si de verdad se pierde o deja de creerle a la escena):
  · Reparto: cuántos personajes aparecen por primera vez en el capítulo y si el lector puede seguirlos. Muchos nombres de golpe, sin un rasgo y su relación con la protagonista, confunden ("reparto").
  · Quién habla: en las escenas con tres o más voces, ¿se sabe quién dice cada línea sin releer? Si a menudo no, es un problema "dialogo" (alto si el lector se pierde).
  · Relaciones creíbles: cómo se tratan los personajes debe corresponder a la historia que comparten (una pareja de años no se habla como si se acabara de conocer; un rasgo de siempre no sorprende como si fuera nuevo). Si no corresponde, es "personaje".
- Sé tan franco como un amigo que le dice la verdad: si el capítulo hoy no funciona para un lector, dilo en la primera frase del resumen, sin suavizar (sin crueldad con el autor).
- Referencias para estudiar, ligadas a los problemas de ESTE capítulo:
  1. PRIMERO sus propias referencias (series, anime, películas, libros o autores que menciona en sus archivos de Recursos): para cada una, qué escena o recurso concreto mirar y qué problema del capítulo le ayuda a resolver. Márcalas con "deSusReferencias": true y "tipo" según lo que sean.
  2. Después, como mucho 3 libros reales y conocidos de los que estés completamente seguro: título y autor EXACTOS tal como se publicaron en español (p. ej. «Mientras escribo», Stephen King). Nunca inventes ni aproximes un título ("o similar" no vale); si no estás seguro, OMITE esa entrada por completo (nunca escribas una entrada que diga que no estás seguro o que se ignore).

REGLAS DE LAS CITAS (muy importante, el editor las usa para ubicar cada punto):
- "cita" debe ser texto COPIADO EXACTAMENTE del capítulo (mismas letras, tildes, errores y puntuación), de 4 a 15 palabras, sin "…" ni cambios.
- En ortografía, "original" es la palabra o tramo exacto con el error (tal cual aparece) y "cita" un tramo exacto que lo contiene; "correccion" reemplaza solo a "original".
- Ortografía según la RAE vigente (Ortografía 2010). Antes de marcar una tilde, mira la función de la palabra en la frase: «rio», «guion», «truhan», «fie», «crie» y otros monosílabos ortográficos van SIN tilde (verbo reír: «se rio»); «río» con tilde solo es el sustantivo (el río). «solo» y los demostrativos sin tilde son correctos. Si dudas, no lo marques.
- Si no puedes citar exacto, deja "cita" vacía.

OPINIONES DE LECTORES REALES: si el autor te pasa lo que le dijo alguien que leyó el capítulo, respóndela punto por punto en "respuestaLector": si tiene razón, muéstralo en el texto con una cita y súmalo a "problemas" si no estaba; si no la tiene o le falta contexto (por ejemplo, algo que el canon explica), dilo con respeto y por qué. Nunca la ignores.

FORMATO: responde SOLO JSON con esta forma:
{
 "resumen": "2-3 frases: estado del capítulo y lo más importante a mejorar (franco)",
 "lector": {"veredicto":"una frase: cómo le llega este capítulo a alguien que lo lee por primera vez, sin suavizar","seEntiende":"si|a medias|no","confusiones":["en qué se pierde el lector, máx. 4"]},
 "respuestaLector": [{"punto":"lo que dijo el lector, resumido","coincide":true,"explicacion":"por qué tiene razón o qué le falta saber","cita":"…"}],
 "fortalezas": [{"titulo":"…","explicacion":"…","cita":"…"}],
 "problemas": [{"tipo":"pov|continuidad|ritmo|dialogo|claridad|tono|estructura|reparto|personaje","gravedad":"alta|media|baja","titulo":"…","explicacion":"por qué no funciona","sugerencia":"qué hacer (sin escribirle la prosa)","citas":["…"]}],
 "ortografia": [{"original":"…","correccion":"…","cita":"…","nota":"regla breve, opcional"}],
 "lecturas": [{"titulo":"…","autor":"autor o estudio","tipo":"libro|serie|anime|película|otro","deSusReferencias":true,"porque":"qué escena o técnica mirar y para qué problema de este capítulo"}],
 "siguientePaso": "la primera cosa que haría en la reescritura"
}
Máximo: 4 fortalezas, 8 problemas (ordenados por gravedad), 30 ortografía, 6 referencias. Escribe en el idioma del autor.`;

// Antes "El Tribunal": tres lectores con enfoques distintos, ahora dentro del reporte.
const VOICES_TASK = `TAREA: TRES LECTURAS. Tres lectores leen el mismo capítulo, cada uno desde su enfoque, y le dicen al autor lo que vieron.
- "arquitecto": estructura, lógica interna, causa y efecto, ritmo. Dónde la escena no se sostiene o sobra.
- "bardo": voz, prosa, emoción, imágenes, diálogos. Qué suena vivo y qué suena a relleno.
- "hater": el lector exigente que no perdona. Lo cliché, lo confuso, lo olvidable: el punto exacto donde dejaría de leer y por qué. Duro con el texto, nunca con el autor.
Cada uno habla con su propia mirada; no repiten lo mismo entre ellos. Todo sobre ESTE capítulo, nada genérico.
Las "citas" son texto COPIADO EXACTAMENTE del capítulo (4 a 15 palabras, sin cambios ni "…").
FORMATO (solo JSON):
{
 "arquitecto": {"veredicto":"una frase","lectura":"3-5 frases con razones","nota":7,"citas":["…"]},
 "bardo": {"veredicto":"…","lectura":"…","nota":7,"citas":["…"]},
 "hater": {"veredicto":"…","lectura":"…","nota":5,"citas":["…"]}
}
"nota" de 0 a 10. Máximo 3 citas por lector. Escribe en el idioma del autor.`;

// Antes "El Guardián del canon": contradicciones del capítulo contra lo que el autor ya estableció.
const CANON_TASK = `TAREA: GUARDIÁN DEL CANON. Comparas el capítulo con el canon del autor (fragmentos de sus archivos y su memoria del proyecto) y buscas SOLO contradicciones reales y demostrables:
- "hecho": algo que el canon establece de otra forma (edades, lugares, parentescos, quién sabe qué, cómo se llama algo).
- "cronologia": eventos fuera de orden, personajes presentes cuando el canon dice que estaban muertos, ausentes o en otra parte; objetos que ya no existían.
- "ley": poderes, magia, tecnología o reglas del mundo usadas de una forma que el canon prohíbe o limita.
- "personaje": alguien actúa o habla en contra de cómo el canon lo define, sin que el texto lo justifique.
REGLAS:
- Cada contradicción necesita DOS citas exactas: "citaCapitulo" (copiada tal cual del capítulo, 4 a 15 palabras) y "citaCanon" (copiada tal cual del fragmento del canon), más "fuente" (el nombre del archivo del canon).
- Si el canon no dice nada sobre algo, NO es una contradicción. Si hay tensión pero no certeza, va en "dudas" como pregunta al autor.
- LÍNEA DE TIEMPO: ubica primero el capítulo en la historia usando la memoria del proyecto (plan del libro, actos). Si el canon describe algo que pasa DESPUÉS (una muerte, una mudanza, un cambio), que el capítulo muestre el estado anterior NO es contradicción. Nunca marques eso como error.
- PLAN RECIENTE vs. ARCHIVO VIEJO: la memoria del proyecto refleja las decisiones más recientes del autor. Si un archivo del canon dice algo distinto a esa memoria y el capítulo sigue la memoria, el problema es el archivo: va en "dudas" como «¿Actualizo <archivo>? Dice X, pero tu plan actual dice Y», no como contradicción del capítulo.
- Ignora fragmentos que sean un borrador anterior de este mismo capítulo, y no comentes estilo ni ortografía (eso va en el reporte).
- No encontrar nada es un buen resultado: dilo en el resumen y deja las listas vacías. Nunca rellenes.
FORMATO (solo JSON):
{
 "resumen": "1-2 frases",
 "contradicciones": [{"tipo":"hecho|cronologia|ley|personaje","gravedad":"alta|media|baja","titulo":"…","explicacion":"qué choca y por qué importa","citaCapitulo":"…","citaCanon":"…","fuente":"archivo","sugerencia":"cómo resolverlo sin escribirle la prosa (cambiar el capítulo o actualizar el canon)"}],
 "dudas": [{"pregunta":"…","citaCapitulo":"…","fuente":"archivo o vacío"}]
}
Máximo 8 contradicciones (por gravedad) y 5 dudas. Escribe en el idioma del autor.`;

// Guardián pasivo: revisión rápida y barata (Haiku) al guardar. Solo errores gigantes.
const WATCH_TASK = `TAREA: VIGILANCIA RÁPIDA DEL GUARDIÁN. El autor está escribiendo; no lo interrumpas por matices.
Señala SOLO errores GRAVES y evidentes contra su canon:
- un personaje muerto, desaparecido o en otro lugar según el canon que aparece actuando aquí;
- un nombre, parentesco, edad o rasgo central cambiado;
- una ley del mundo explícita (poderes, magia, tecnología) rota sin explicación;
- un hecho central de la historia contradicho.
Cada alerta necesita "citaCapitulo" (copiada tal cual del capítulo, 4 a 15 palabras), "citaCanon" (copiada tal cual del canon) y "fuente" (archivo del canon). Si no puedes citar ambas cosas, no es alerta.
Un hecho del canon que ocurre más adelante en la historia (p. ej. una muerte futura) NO es un error si el capítulo transcurre antes. Ante la duda, no alertes.
Lo normal es que no haya nada: entonces responde {"alertas":[]}. Nunca rellenes. Máximo 3.
FORMATO (solo JSON): {"alertas":[{"titulo":"…","explicacion":"1-2 frases","citaCapitulo":"…","citaCanon":"…","fuente":"…"}]}
Escribe en el idioma del autor.`;

// Nov 2026: las «dudas para ti» del Guardián se responden en un minichat con Mira.
const DOUBT_SYSTEM = `Eres Mira, la compañera de escritura de MyWorld. El Guardián del canon le dejó al autor una duda sobre su capítulo y ahora la están resolviendo juntos en un chat corto.
Tu trabajo: entender lo que el autor decide y cerrar la duda sin hacerle perder tiempo.
- Si su respuesta la resuelve y no cambia nada más, ciérrala: "estado":"resuelta".
- Si su respuesta obliga a cambiar un archivo del canon (una ficha, la estructura del libro, una cronología), propón el cambio: "estado":"cambio", con "cambio.archivo" (el nombre exacto del archivo de la duda u otro que conozcas por el contexto) y "cambio.texto" (2-6 líneas en tono de apunte, para añadir al final del archivo, con lo que el autor dijo y sin inventar nada).
- Si su respuesta abre otras preguntas, haz UNA sola pregunta breve: "estado":"sigue".
- Si la decisión toca la estructura del libro (actos, orden de capítulos, qué debe lograr un capítulo), sugiere hablarlo con el Arquitecto: "llevarA":"arquitecto".
- Si lo que el autor decide cambia lo que el capítulo cuenta de forma que buena parte habría que reescribirla, dilo claro en "respuesta".
Nunca inventes canon. Breve y cálida, en el idioma del autor.
Responde SOLO JSON: {"respuesta":"2-4 frases","estado":"resuelta|cambio|sigue","decision":"una línea con lo decidido, para la memoria del proyecto (vacía si sigue)","cambio":{"archivo":"…","texto":"…"} o null,"llevarA":"arquitecto|ninguno"}`;

async function findCanonFile(uid: string, name: string): Promise<{ id: string; name: string } | null> {
    if (!name) return null;
    const col = getFirestore().collection("TDB_Index").doc(uid).collection("files");
    const base = name.replace(/\.md$/i, "").trim();
    for (const n of [base + ".md", base, base + ".txt"]) {
        const s = await col.where("name", "==", n).limit(1).get();
        if (!s.empty) return { id: s.docs[0].id, name: (s.docs[0].data() as any).name || n };
    }
    return null;
}

function parseJsonReply(text: string): any {
    const j = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    return JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
}

// Llamada común: sistema fijo (caché 1 h) + capítulo (caché 1 h) + tarea y contexto (sin caché).
async function runReview(task: string, chapter: string, fileName: string, extra: string, opts: { maxTokens: number; effort: "low" | "medium"; label: string; model?: string }) {
    const r = await callClaude({
        model: opts.model || CLAUDE_SONNET,
        system: [{ text: EDITOR_BASE + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
        content: [
            { type: "text", text: `ARCHIVO: ${fileName || "(sin nombre)"}\nCAPÍTULO:\n<<<\n${chapter}\n>>>`, cache_control: { type: "ephemeral", ttl: "1h" } },
            { type: "text", text: [extra, task, "Responde SOLO con el JSON."].filter(Boolean).join("\n\n") },
        ],
        maxTokens: opts.maxTokens,
        effort: opts.effort,
        label: opts.label,
    } as any);
    if (!r.ok || !r.text) {
        if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
        throw new HttpsError("internal", r.refusal ? "Claude no quiso revisar este texto." : "No se pudo generar la revisión. Intenta de nuevo.");
    }
    try {
        return parseJsonReply(r.text);
    } catch {
        logger.warn(`[REPORT] ${opts.label}: JSON inválido: ${r.text.slice(0, 300)}`);
        throw new HttpsError("internal", "La revisión llegó mal formada. Intenta de nuevo.");
    }
}

// Fragmentos del canon parecidos a cada parte del capítulo (búsqueda vectorial en el índice del autor).
async function loadCanonForChapter(uid: string, fileId: string, chapter: string, requestData: any, maxWindows = 8, maxChars = 18000): Promise<{ text: string; files: string[] }> {
    const paras = chapter.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 40);
    const windows: string[] = [];
    let cur = "";
    for (const p of paras) {
        if (cur && (cur.length + p.length) > 1800) { windows.push(cur); cur = ""; }
        cur += (cur ? "\n\n" : "") + p;
    }
    if (cur) windows.push(cur);
    const MAXW = maxWindows;
    const picked = windows.length <= MAXW ? windows : Array.from({ length: MAXW }, (_, i) => windows[Math.floor(i * windows.length / MAXW)]);

    const embedder = new GeminiEmbedder({ apiKey: getAIKey(requestData, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
    let vectors: number[][];
    try {
        vectors = await Promise.all(picked.map(w => embedder.embedQuery(w.slice(0, 1800))));
    } catch (e: any) {
        const em = String(e?.message || e);
        logger.warn(`[GUARDIAN] Embedding falló: ${em.slice(0, 300)}`);
        throw new HttpsError("failed-precondition", /401|403|API key|ACCESS_TOKEN|PERMISSION/i.test(em)
            ? "No pude consultar tu canon: Google rechazó tu clave de Gemini. Cámbiala en Ajustes → Claves de API."
            : "No pude consultar tu canon (Gemini no respondió). Intenta de nuevo en un momento.");
    }
    const db = getFirestore();
    const results = await Promise.all(vectors.map(v => db.collectionGroup("chunks")
        .where("userId", "==", uid).where("path", ">=", "").where("path", "<=", "\uf8ff")
        .findNearest({ vectorField: "embedding", queryVector: v, limit: 10, distanceMeasure: "COSINE", distanceResultField: "_dist" } as any)
        .get().catch((e: any) => { logger.warn(`[GUARDIAN] Búsqueda falló: ${e?.message}`); return null; })));
    const seen = new Set<string>();
    const all: { text: string; fileName: string; dist: number }[] = [];
    for (const snap of results) {
        for (const d of snap?.docs || []) {
            const c: any = d.data();
            const fid = d.ref.parent.parent?.id;
            if (fid === fileId || c.category === "reference") continue;
            const text = String(c.text || "").trim();
            const key = text.slice(0, 100);
            if (!text || seen.has(key)) continue;
            seen.add(key);
            all.push({ text, fileName: String(c.fileName || "Desconocido").replace(/\.md$/i, ""), dist: Number(c._dist ?? 1) });
        }
    }
    all.sort((a, b) => a.dist - b.dist);
    const perFile: Record<string, number> = {};
    let chars = 0;
    const kept = all.filter(c => {
        perFile[c.fileName] = (perFile[c.fileName] || 0) + 1;
        if (perFile[c.fileName] > 3 || chars + c.text.length > maxChars) return false;
        chars += c.text.length;
        return true;
    });
    const files = [...new Set(kept.map(c => c.fileName))];
    logger.info(`🛡️ [GUARDIAN] Canon para el capítulo: ${kept.length} fragmentos de ${files.length} archivos (${files.join(", ")})`);
    return { text: kept.map(c => `### ${c.fileName}\n${c.text}`).join("\n\n"), files };
}

// Oct 2026: las referencias se leen directo de las carpetas de Recursos en Drive (el índice no siempre
// las tiene: archivos cortos o sin re-indexar). Si no hay token de Drive, se intenta con el índice.
async function loadReferencesFromDrive(uid: string, accessToken: string): Promise<string> {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth });
    const cfg: any = (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
    const roots: string[] = (cfg.resourcePaths || []).map((p: any) => p.id).filter(Boolean);
    const files: { id: string; name: string }[] = [];
    const walk = async (folderId: string, depth: number) => {
        if (depth > 3 || files.length >= 12) return;
        const res = await drive.files.list({ q: `'${folderId}' in parents and trashed = false`, fields: "files(id,name,mimeType)", pageSize: 100 });
        for (const f of res.data.files || []) {
            if (files.length >= 12) break;
            if (f.mimeType === "application/vnd.google-apps.folder") await walk(f.id!, depth + 1);
            else if (/\.(md|txt)$/i.test(f.name || "") || f.mimeType === "application/vnd.google-apps.document") files.push({ id: f.id!, name: f.name! });
        }
    };
    for (const r of roots) await walk(r, 0);
    const parts: string[] = [];
    for (const f of files) {
        try {
            const text = String(await _getDriveFileContentInternal(drive, f.id) || "").trim().slice(0, 900);
            if (text) parts.push(`### ${f.name.replace(/\.md$/i, "")}\n${text}`);
        } catch { /* archivo ilegible: se omite */ }
    }
    logger.info(`[REPORT] Referencias (Drive): ${parts.length} archivos (${files.map(f => f.name).join(", ")})`);
    return parts.join("\n\n").slice(0, 9000);
}

async function loadReferences(uid: string, accessToken?: string): Promise<string> {
    if (accessToken) {
        try {
            const fromDrive = await loadReferencesFromDrive(uid, accessToken);
            if (fromDrive) return fromDrive;
        } catch (e: any) {
            logger.warn(`[REPORT] No se pudieron leer las referencias de Drive: ${e?.message}`);
        }
    }
    try {
        const db = getFirestore();
        const files = await db.collection("TDB_Index").doc(uid).collection("files")
            .where("category", "==", "reference").limit(40).get();
        const docs = files.docs.filter(d => (d.data() as any).type !== "folder").slice(0, 12);
        const parts: string[] = [];
        for (const d of docs) {
            const name = (d.data() as any).name || d.id;
            const ch = await d.ref.collection("chunks").limit(2).get();
            const text = ch.docs.map(c => String((c.data() as any).text || "")).join("\n").slice(0, 700);
            if (text.trim()) parts.push(`### ${name}\n${text}`);
        }
        logger.info(`[REPORT] Referencias del autor: ${parts.length} archivos (${parts.map(p => p.split("\n")[0].replace("### ", "")).join(", ")})`);
        return parts.join("\n\n").slice(0, 8000);
    } catch (e: any) {
        logger.warn(`[REPORT] No se pudieron leer las referencias: ${e?.message}`);
        return "";
    }
}

export const chapterReport = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 300, memory: "512MiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, fileId, fileName, content, accessToken } = request.data || {};
        if (!fileId) throw new HttpsError("invalid-argument", "Falta fileId.");
        const ref = getFirestore().collection("users").doc(uid).collection("chapter_reports").doc(fileId);

        if (mode === "get") {
            const snap = await ref.get();
            return snap.exists ? { found: true, ...(snap.data() as any) } : { found: false };
        }

        // Nov 2026: minichat para resolver una duda del Guardián.
        if (mode === "duda" || mode === "aplicarDuda") {
            const idx = Number(request.data?.index);
            const prev: any = (await ref.get()).data() || {};
            const dudas: any[] = prev.canon?.dudas || [];
            const d = dudas[idx];
            if (!d) throw new HttpsError("not-found", "No encontré esa duda. Rehaz la revisión del canon.");

            if (mode === "aplicarDuda") {
                const cambio = d.cambio;
                if (!cambio?.texto) throw new HttpsError("failed-precondition", "Esta duda no tiene un cambio propuesto.");
                if (!accessToken) throw new HttpsError("unauthenticated", "Reconecta Google Drive para guardar el cambio.");
                const file = await findCanonFile(uid, cambio.archivo || d.fuente);
                if (!file) throw new HttpsError("not-found", `No encontré «${cambio.archivo || d.fuente}» en tu proyecto. Cópialo a mano.`);
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: accessToken });
                const drive = google.drive({ version: "v3", auth });
                const meta = await drive.files.get({ fileId: file.id, fields: "mimeType" });
                if (meta.data.mimeType === "application/vnd.google-apps.document") throw new HttpsError("failed-precondition", `«${file.name}» es un Google Doc: copia el texto a mano.`);
                const current = String(await _getDriveFileContentInternal(drive, file.id) || "");
                const fecha = new Date().toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" });
                const next = `${current.trimEnd()}\n\n> Decidido con Mira (${fecha}): ${String(cambio.texto).trim().replace(/\n/g, "\n> ")}\n`;
                await drive.files.update({ fileId: file.id, media: { mimeType: meta.data.mimeType || "text/markdown", body: next } });
                dudas[idx] = { ...d, resuelta: true, aplicadoEn: file.name, aplicadoAt: new Date().toISOString() };
                await ref.set({ canon: { ...prev.canon, dudas } }, { merge: true });
                logger.info(`[DUDA] Cambio aplicado en ${file.name}`);
                return { found: true, dudas, archivo: file.name };
            }

            if (!claudeEnabledForCurrentUser()) throw new HttpsError("failed-precondition", "El chat de dudas usa Claude y todavía no está activo para tu cuenta.");
            const mensajes: { role: string; text: string }[] = (Array.isArray(request.data?.mensajes) ? request.data.mensajes : []).slice(-10)
                .map((m: any) => ({ role: m?.role === "mira" ? "mira" : "autor", text: String(m?.text || "").slice(0, 2000) })).filter((m: any) => m.text.trim());
            if (!mensajes.some(m => m.role === "autor")) throw new HttpsError("invalid-argument", "Escribe tu respuesta a la duda.");
            const [memory, file] = await Promise.all([
                getMemoryContext(uid, `${d.pregunta} ${d.fuente || ""}`),
                findCanonFile(uid, d.fuente || ""),
            ]);
            let fileText = "";
            if (file && accessToken) {
                try {
                    const auth = new google.auth.OAuth2();
                    auth.setCredentials({ access_token: accessToken });
                    fileText = String(await _getDriveFileContentInternal(google.drive({ version: "v3", auth }), file.id) || "").slice(0, 6000);
                } catch { /* sin acceso al archivo: se sigue sin él */ }
            }
            const contexto = [
                `CAPÍTULO: ${fileName || prev.fileName || "(sin nombre)"}`,
                `DUDA DEL GUARDIÁN: ${d.pregunta}`,
                d.citaCapitulo ? `CITA DEL CAPÍTULO: «${d.citaCapitulo}»` : "",
                d.fuente ? `ARCHIVO DEL CANON: ${d.fuente}${fileText ? `\n<<<\n${fileText}\n>>>` : ""}` : "",
                memory ? `MEMORIA DEL PROYECTO:\n${memory}` : "",
                `CONVERSACIÓN:\n${mensajes.map(m => `${m.role === "mira" ? "Mira" : "Autor"}: ${m.text}`).join("\n")}`,
            ].filter(Boolean).join("\n\n");
            const r = await callClaude({
                model: CLAUDE_SONNET,
                system: [{ text: DOUBT_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true }],
                content: [{ type: "text", text: contexto + "\n\nResponde SOLO con el JSON." }],
                maxTokens: 2500, effort: "low", label: "ChapterDoubt",
            } as any);
            if (!r.ok || !r.text) throw new HttpsError("internal", r.noCredit || r.error === "MONTHLY_CAP" ? "Se acabó el saldo de Claude de este mes." : "Mira no pudo responder. Intenta de nuevo.");
            let out: any;
            try { out = parseJsonReply(r.text); } catch { out = { respuesta: r.text.slice(0, 600), estado: "sigue" }; }
            const estado = ["resuelta", "cambio", "sigue"].includes(out.estado) ? out.estado : "sigue";
            const chat = [...mensajes, { role: "mira", text: String(out.respuesta || "") }];
            dudas[idx] = { ...d, chat, estado, resuelta: estado === "resuelta", decision: out.decision || d.decision || "", cambio: estado === "cambio" ? out.cambio || null : null, llevarA: out.llevarA === "arquitecto" ? "arquitecto" : "" };
            if ((estado === "resuelta" || estado === "cambio") && out.decision) {
                try { await applyMemoryOps(uid, [{ op: "add", file: "Decisiones del canon", kind: "libro", text: `${fileName || prev.fileName || "Capítulo"}: ${String(out.decision).trim()}` }], "duda"); } catch (e: any) { logger.warn(`[DUDA] Memoria: ${e?.message}`); }
            }
            await ref.set({ canon: { ...prev.canon, dudas } }, { merge: true });
            return { found: true, dudas };
        }

        // Nov 2026: lo que dijo un lector real del capítulo; el próximo reporte lo responde punto por punto.
        if (mode === "lector") {
            const texto = String(request.data?.texto || "").trim().slice(0, 4000);
            const quitar = Number.isInteger(request.data?.quitar) ? Number(request.data.quitar) : -1;
            const prev: any = (await ref.get()).data() || {};
            let lectores: { texto: string; fecha: string }[] = Array.isArray(prev.lectores) ? prev.lectores : [];
            if (quitar >= 0) lectores = lectores.filter((_, i) => i !== quitar);
            else if (texto.length >= 10) lectores = [...lectores, { texto, fecha: new Date().toISOString() }].slice(-5);
            else throw new HttpsError("invalid-argument", "Pega lo que te dijo el lector (al menos una frase).");
            await ref.set({ lectores, fileName: fileName || prev.fileName || "" }, { merge: true });
            return { found: true, lectores };
        }

        const text = String(content || "");
        if (text.trim().length < 300) throw new HttpsError("invalid-argument", "El capítulo es demasiado corto para un reporte.");
        if (text.length > 120000) throw new HttpsError("invalid-argument", "El capítulo es demasiado largo (máx. ~20.000 palabras).");
        if (!claudeEnabledForCurrentUser()) {
            throw new HttpsError("failed-precondition", "El reporte de capítulo usa Claude y todavía no está activo para tu cuenta.");
        }

        const name = fileName || "(sin nombre)";
        const hash = textHash(text);

        // Tres lecturas (antes: el Tribunal)
        if (mode === "voices") {
            const voices = await runReview(VOICES_TASK, text, name, "", { maxTokens: 5000, effort: "low", label: "ChapterVoices" });
            const out = { voices, voicesHash: hash, voicesAt: new Date().toISOString() };
            await ref.set({ ...out, fileName: name }, { merge: true });
            return { found: true, ...out };
        }

        // Guardián pasivo (al guardar): barato, con freno, y solo para archivos del canon.
        if (mode === "watch") {
            const prev: any = (await ref.get()).data() || {};
            const last = prev.watchAt ? new Date(prev.watchAt).getTime() : 0;
            if (prev.watchHash === hash || Date.now() - last < 8 * 60 * 1000) {
                return { found: true, skipped: true, watch: prev.watch || { alertas: [] }, watchAt: prev.watchAt || null };
            }
            const fdoc: any = (await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(fileId).get()).data();
            if (fdoc && (fdoc.category === "reference" || /^memoria del autor\.md$/i.test(fdoc.name || ""))) {
                return { found: true, skipped: true, watch: { alertas: [] } };
            }
            let canon: { text: string; files: string[] };
            try {
                canon = await loadCanonForChapter(uid, fileId, text, request.data, 5, 10000);
            } catch {
                return { found: true, skipped: true, watch: prev.watch || { alertas: [] } }; // sin clave de Gemini: no molestar
            }
            if (!canon.text) return { found: true, skipped: true, watch: { alertas: [] } };
            const memory = await getMemoryContext(uid, `${name} ${text.slice(0, 1500)}`);
            const result = await runReview(WATCH_TASK, text, name, [memory ? `MEMORIA DEL PROYECTO (plan actual del autor):\n${memory}` : "", `CANON DEL AUTOR (fragmentos de sus archivos):\n${canon.text}`].filter(Boolean).join("\n\n"),
                { maxTokens: 3000, effort: "low", label: "GuardianWatch", model: CLAUDE_HAIKU });
            const alertas = (Array.isArray(result?.alertas) ? result.alertas : []).filter((a: any) => a?.citaCapitulo && a?.citaCanon).slice(0, 3);
            const out = { watch: { alertas }, watchHash: hash, watchAt: new Date().toISOString() };
            await ref.set({ ...out, fileName: name }, { merge: true });
            logger.info(`🛡️ [GUARDIAN] Vigilancia de ${name}: ${alertas.length} alertas`);
            return { found: true, ...out };
        }

        // Guardián del canon
        if (mode === "canon") {
            const [memory, canon] = await Promise.all([
                getMemoryContext(uid, `${name} canon personajes reglas cronología ${text.slice(0, 2000)}`),
                loadCanonForChapter(uid, fileId, text, request.data),
            ]);
            if (!canon.text && !memory) {
                throw new HttpsError("failed-precondition", "No encontré canon indexado con qué comparar. Sincroniza tus notas y vuelve a intentar.");
            }
            const extra = [
                memory ? `MEMORIA DEL PROYECTO (plan y decisiones del autor):\n${memory}` : "",
                canon.text ? `CANON DEL AUTOR (fragmentos de sus archivos):\n${canon.text}` : "CANON DEL AUTOR: (sin fragmentos relevantes)",
            ].filter(Boolean).join("\n\n");
            const result = await runReview(CANON_TASK, text, name, extra, { maxTokens: 8000, effort: "medium", label: "ChapterCanon" });
            const out = { canon: { ...result, archivos: canon.files }, canonHash: hash, canonAt: new Date().toISOString() };
            await ref.set({ ...out, fileName: name }, { merge: true });
            return { found: true, ...out };
        }

        const [memory, references, prevDoc] = await Promise.all([
            getMemoryContext(uid, `${fileName || ""} reporte capítulo`),
            loadReferences(uid, accessToken),
            ref.get(),
        ]);
        const lectores: { texto: string; fecha: string }[] = ((prevDoc.data() as any)?.lectores || []).slice(-5);
        const extra = [
            memory ? `MEMORIA DEL PROYECTO (plan y decisiones del autor):\n${memory}` : "",
            lectores.length ? `OPINIONES DE LECTORES REALES (lo que le dijeron al autor sobre este capítulo, tal cual):\n${lectores.map((l, i) => `[Lector ${i + 1}]\n${l.texto}`).join("\n\n")}` : "",
            references ? `REFERENCIAS DEL AUTOR (de sus carpetas de Recursos):\n${references}` : "REFERENCIAS DEL AUTOR: (no hay archivos de Recursos indexados)",
        ].filter(Boolean).join("\n\n");
        const report = await runReview(REPORT_SYSTEM, text, name, extra, { maxTokens: 12000, effort: "medium", label: "ChapterReport" });
        const saved = { report, fileName: fileName || "", contentHash: hash, createdAt: new Date().toISOString() };
        await ref.set(saved, { merge: true });
        return { found: true, ...saved };
    }
);
