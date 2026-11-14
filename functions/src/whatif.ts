// Oct 2026: «Qué pasaría si» — el espacio no canon del Arquitecto (antes: el Laboratorio de ideas).
// El autor juega con ideas sin compromiso, mezclando sus referencias (anime, series, libros de Recursos).
// Nada de aquí entra al canon: las ideas que quiere conservar se guardan como notas en
// Recursos/«Ideas (no canon)» de su Drive, que también ve en Obsidian.
import { HttpsError } from "firebase-functions/v2/https";
import { Readable } from "stream";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { TaskType } from "./utils/genai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { CLAUDE_SONNET, CLAUDE_HAIKU, MYWORLD_VOICE } from "./utils/claude_router";
import { aiText } from "./utils/ai_text";
import { getMemoryContext } from "./utils/memory_store";
import { sharedContext, noteAuthorMessage, noteDecision, addCorrections } from "./utils/shared_context";
import { getAIKey } from "./utils/security";
import { GeminiEmbedder } from "./utils/vector_utils";
import { ingestFile } from "./ingestion";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

export const IDEAS_FOLDER = "Ideas (no canon)";
const FOLDER = "application/vnd.google-apps.folder";
const MAX_SAVED = 60;

// Nov 2026 (v2): reescrito tras leer conversaciones reales. Fallos de la v1: (a) le atribuía al autor detalles
// que había inventado ella («ella ve las orejas y la cola»); (b) cada respuesta tenía el mismo molde (tres caminos,
// «Mi opinión», «Pregunta», «Ojo») aunque el autor ya hubiera elegido; (c) repetía en cada turno de qué referencia
// tomaba qué; (d) preguntaba por lo que el autor había pedido dejar abierto.
const WHATIF_SYSTEM = `Eres la compañera de imaginación del autor en «Qué pasaría si», el frasco de ideas de MyWorld. Aquí NADA es canon: el autor juega con una idea y tú juegas con él. La idea es suya; tú la empujas.

PRIMERO MIRA EN QUÉ MOMENTO ESTÁ LA CONVERSACIÓN. No respondes igual en cada turno:
- IDEA RECIÉN LANZADA (o el autor pide opciones): ábrele el abanico con 2 o 3 caminos concretos y de verdad distintos entre sí (que cambien quién sufre, qué se sabe o qué está en juego; no tres versiones de lo mismo).
- EL AUTOR YA ELIGIÓ O AÑADIÓ PIEZAS SUYAS: no abras otro abanico. Construye sobre SU versión: (1) recoge en una o dos líneas SOLO lo nuevo que acaba de decir, con sus palabras, para que vea que lo entendiste; (2) empuja un paso: una consecuencia que no ha visto, un hueco que habría que tapar o un «¿y si…?» pequeño DENTRO de su camino. Como mucho dos aportes.
- NO VUELVAS A CONTAR LA IDEA ENTERA EN CADA TURNO. El resumen completo («queda así: …») se da una sola vez, cuando la idea toma forma por primera vez; después solo cuando él lo pida o cuando haya cambiado tanto que el anterior ya no sirva. Lo que ya quedó dicho en tus respuestas anteriores no se repite: él lo tiene delante.
- EL AUTOR SOLO CONFIRMA O CELEBRA («sí», «me encanta», «perfecto»): respuesta corta, de dos a cuatro líneas. Di qué quedó decidido con eso (solo eso, no todo lo anterior) y que puede guardarla. Un aporte más únicamente si es un hueco que de verdad rompería la idea; si tú mismo dirías que «no rompe nada», no lo saques ahora. No reabras dudas de turnos anteriores ni menciones las preguntas que quedaron sin responder.
- EL AUTOR DICE QUE ALGO QUEDA ABIERTO, QUE YA ESTÁ O QUE ES SUFICIENTE: respétalo. No preguntes por eso ni lo cierres por él. Dile en una línea qué quedó armado y qué quedó abierto a propósito, y que puede guardarla.
- EL AUTOR PREGUNTA ALGO CONCRETO: responde eso primero y corto.

DE QUIÉN ES CADA COSA (lo más importante):
- Hay tres fuentes y nunca las mezcles: lo que el AUTOR dijo en esta conversación, lo que dice su CANON (los fragmentos que recibes) y lo que PROPONES tú.
- Todo detalle concreto que añadas tú (un rasgo físico, un nombre, un lugar, un motivo, un objeto, un parentesco, qué ve o qué sabe un personaje) va marcado como propuesta: «propongo…», «¿y si…?», «podría…». Nunca lo escribas como si ya fuera parte de su idea, y no lo des por aceptado en el turno siguiente salvo que él lo tome.
- Cuando uses algo de su canon, di de qué documento sale («según Zoorians…») y apóyate en palabras que estén de verdad en el fragmento: antes de escribir «en X dice…», vuelve al fragmento y comprueba que lo dice. Un término entre comillas atribuido al canon tiene que estar ahí tal cual.
- Si es algo que deduces o recuerdas a medias, no lo presentes como cita: dilo como duda («creo que en X se da a entender que…, ¿es así?»). Si no lo ves en los fragmentos, no lo afirmes: pregúntalo o propónlo como idea. Un aviso de choque con el canon que resulta falso le cuesta al autor más que no avisar.
- Al recoger lo que él dijo, usa sus palabras y no le añadas nada.
- Lo que TÚ deduces de lo que él dijo también es tuyo, no suyo. Si de «A» sacas «entonces B», dilo como lectura tuya («si te entiendo bien…», «eso implicaría que…»), no como un hecho de su idea.
- DOCUMENTOS CORTADOS. Si un fragmento termina en «[AQUÍ SE CORTA…]» o a mitad de frase, no tienes el documento entero. Antes de decir que algo «no aparece», di que te llegó cortado y qué parte te falta, y pídele que lo adjunte entero desde «Fuentes» (ahí puede elegir documentos de su canon). Cuando él te diga que algo sí está escrito, créele: lo más probable es que esté en la parte que no recibiste.

SUS REFERENCIAS (series, anime, películas, libros, juegos):
- La primera vez que una referencia entra en la conversación, di en una frase qué tomas de ella (un recurso, una dinámica, una imagen); nunca copies su trama. Después no lo vuelvas a explicar: ya quedó dicho.

SI SU IDEA CHOCA CON SU CANON:
- Una sola línea al final («Ojo: …»), como dato y sin frenarlo, y solo si puedes señalar la frase del documento con la que choca. No repitas un aviso que ya diste.
- Si lo que el autor ACABA de decir contradice un fragmento, no decidas quién tiene razón: pon las dos cosas juntas («Me dices que X; en <documento> dice Y. ¿Cuál vale para esta idea?»). Puede que el documento esté viejo: si el fragmento trae fecha y es de hace semanas o meses, dilo («ese documento no cambia desde octubre»).
- Si dos fragmentos se contradicen entre sí, no elijas uno en silencio: muéstraselo como hallazgo en una línea («En A dice X y en B dice Y»), con sus fechas si las hay.
- Si el autor pregunta por algo de su mundo y no aparece ni en los fragmentos ni en la memoria, dilo tal cual: «No lo encontré en tus archivos». No rellenes con algo verosímil.

IMÁGENES (bocetos, referencias, diseños de personaje):
- Mira lo que de verdad hay: silueta, paleta, ropa, pose, expresión, estilo. Describe solo lo que ves; si algo no se distingue, dilo.
- Di qué transmite y qué le dice a un lector sobre ese personaje o lugar, y en qué coincide o choca con lo que su canon dice de él (si lo dice).
- Lo que el autor decida sobre un diseño («el mechón queda naranja») recógelo con sus palabras. Un diseño aquí sigue siendo no canon hasta que él lo pase al canon.

SIEMPRE:
- No escribes la prosa de su libro. Sí puedes dar ideas sueltas, una escena en esquema, una imagen, una línea de diálogo como ejemplo.
- Opina cuando ayude a elegir: cuál camino tomarías y por qué, en una o dos frases. No en cada respuesta, y sin el rótulo fijo «Mi opinión:»: si opinas, que entre en el texto.
- Como mucho UNA pregunta por respuesta, y solo si su respuesta cambiaría la idea. Nunca una que ya contestó.
- No empieces repitiendo cómo empezaste tu respuesta anterior, y no uses el mismo molde dos veces seguidas. Vale también para las muletillas de confirmación: si la anterior abrió con «Queda decidido:» o «Queda así:», esta abre de otra forma o entra directo al contenido.
- Si no recibiste fragmentos de su canon, dilo como mucho una vez en toda la conversación y solo si hace falta; después trabaja con lo que él cuenta, sin repetir el aviso.
- Cuando el autor confirma un dato («sí, es el mismo X»), no lo repitas con «Entonces lo tomo así:»: úsalo directamente en lo que aportas.
- Sin títulos. Viñetas solo cuando presentas caminos alternativos (normalmente la primera respuesta); cuando construyes sobre su versión, escribe en párrafos cortos, sin rótulos en negrita. Si tu respuesta anterior fue en viñetas, esta no.
- Breve y vivo: entre 100 y 220 palabras salvo que pida más.
- Cuando la idea ya tenga forma, termina con una línea «Idea: <título corto>» para que pueda guardarla. Mientras siga siendo la misma idea, conserva el mismo título.`;

const DISTILL_TASK = `Convierte esta conversación del frasco de ideas («Qué pasaría si») en una nota para el autor (no canon).
REGLAS:
- La nota es del autor: usa sus palabras cuando las haya.
- Lo que propuso la IA solo entra si el autor lo aceptó de forma explícita («me gusta», «sí», «vamos con esa») o lo retomó con sus palabras. Lo que propuso y él no tomó NO va en «La idea» ni en «Decidido»; si mostró interés va en «Sin decidir». Ante la duda, fuera: una nota con cosas que el autor no dijo es peor que una nota corta.
- Lo que el autor dijo que deja abierto va en «Abierto a propósito», no como pregunta pendiente.
- Nada de prosa literaria: viñetas claras y cortas.
- "tipo": "diseno" si la conversación trata sobre cómo se ve un personaje, criatura, lugar u objeto (con o sin imágenes); si no, "idea".
FORMATO: responde SOLO JSON {"tipo":"idea|diseno","titulo":"…(máx 8 palabras; en un diseño: «Diseño de <nombre>»)","sujeto":"nombre del personaje, lugar u objeto si es un diseño; si no, vacío","cuerpo":"markdown"}
"cuerpo" para una IDEA, con estas secciones si aplican: ## La idea / ## Ingredientes (de qué referencias sale y qué se toma de cada una) / ## Sin decidir / ## Abierto a propósito / ## Si algún día entra al canon (qué tendría que cambiar o qué documento choca)
"cuerpo" para un DISEÑO, con estas secciones si aplican: ## Cómo se ve (lo que muestran las imágenes y lo que el autor describió: silueta, colores, ropa, rasgos) / ## Decidido / ## Sin decidir / ## Qué debe transmitir / ## Si algún día entra al canon`;

function drv(accessToken: string) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth });
}

async function getConfig(uid: string): Promise<any> {
    return (await getFirestore().collection("users").doc(uid).collection("profile").doc("project_config").get()).data() || {};
}

async function findIdeasFolder(drive: any, uid: string, create: boolean): Promise<{ id: string; rootId: string } | null> {
    const cfg = await getConfig(uid);
    const rootId: string | undefined = (cfg.resourcePaths || [])[0]?.id;
    if (!rootId) {
        if (create) throw new HttpsError("failed-precondition", "No tienes una carpeta de Recursos configurada. Agrégala en Ajustes → Proyecto.");
        return null;
    }
    const q = `'${rootId}' in parents and name = '${IDEAS_FOLDER}' and mimeType = '${FOLDER}' and trashed = false`;
    const res = await drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
    const found = res.data.files?.[0];
    if (found?.id) return { id: found.id, rootId };
    if (!create) return null;
    const made = await drive.files.create({ requestBody: { name: IDEAS_FOLDER, mimeType: FOLDER, parents: [rootId] }, fields: "id" });
    const now = new Date().toISOString();
    await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(made.data.id!).set({
        name: IDEAS_FOLDER, path: IDEAS_FOLDER, saga: "Global", parentId: rootId, category: "reference",
        lastIndexed: now, updatedAt: now, driveId: made.data.id, mimeType: FOLDER, type: "folder",
    }, { merge: true });
    logger.info(`💡 [WHATIF] Carpeta «${IDEAS_FOLDER}» creada en Recursos`);
    return { id: made.data.id!, rootId };
}

function sessionRef(uid: string) {
    return getFirestore().collection("users").doc(uid).collection("whatif").doc("session");
}

async function referenceList(uid: string): Promise<{ id: string; name: string; path: string }[]> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").where("category", "==", "reference").limit(200).get();
    return snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((f: any) => f.type !== "folder" && f.mimeType !== FOLDER)
        .map((f: any) => ({ id: f.id, name: String(f.name || "").replace(/\.md$/i, ""), path: String(f.path || "") }));
}

/** Documentos del canon del autor (para adjuntarlos enteros desde «Fuentes»). */
async function canonList(uid: string): Promise<{ id: string; name: string; path: string }[]> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").select("name", "path", "category", "type", "mimeType", "driveId").limit(600).get();
    return snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) }))
        .filter((f: any) => f.category !== "reference" && f.type !== "folder" && f.mimeType !== FOLDER && (!f.driveId || f.driveId === f.id))
        .map((f: any) => ({ id: f.id, name: String(f.name || "").replace(/\.md$/i, ""), path: String(f.path || "") }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** El texto de un documento del índice, en orden y hasta maxChars. Si no cabe entero, lo dice al final:
 *  antes la IA recibía el documento cortado a mitad de frase y creía que eso era todo. */
async function indexedDoc(uid: string, fileId: string, maxChars: number): Promise<string> {
    const snap = await getFirestore().collection("TDB_Index").doc(uid).collection("files").doc(fileId).collection("chunks").select("text").get();
    const parts = snap.docs.map(d => ({ n: Number(d.id.replace(/\D/g, "")) || 0, t: String((d.data() as any).text || "") })).sort((a, b) => a.n - b.n);
    const full = parts.map(p => p.t).join("\n\n").trim();
    if (full.length <= maxChars) return full;
    const cut = full.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
    return `${cut.slice(0, end > maxChars * 0.7 ? end + 1 : maxChars).trim()}\n[AQUÍ SE CORTA: el documento sigue unas ${Math.round((full.length - maxChars) / 100) * 100} letras más que no recibiste. Si lo que falta importa para responder, dilo y pídele al autor que lo adjunte entero desde «Fuentes».]`;
}

/** « · cambió por última vez el 3 oct 2026» a partir de la fecha del índice; vacío si no hay fecha. */
function dateTag(iso?: string): string {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    return ` · cambió por última vez el ${d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

async function canonPeek(uid: string, text: string, requestData: any): Promise<string> {
    try {
        const embedder = new GeminiEmbedder({ apiKey: getAIKey(requestData, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_QUERY });
        const v = await embedder.embedQuery(text.slice(0, 1500));
        const snap = await getFirestore().collectionGroup("chunks").where("userId", "==", uid)
            .where("path", ">=", "").where("path", "<=", "\uf8ff")
            .findNearest({ vectorField: "embedding", queryVector: v, limit: 8, distanceMeasure: "COSINE" }).get();
        const out: string[] = [];
        let chars = 0;
        // Nov 2026: si la idea nombra algo que tiene su propio documento («GardenFlowers»), ese documento entra primero.
        // La búsqueda por parecido a veces no lo trae y la IA decía «no lo tengo en tu proyecto».
        try {
            const files = await getFirestore().collection("TDB_Index").doc(uid).collection("files").select("name", "category", "updatedAt").limit(400).get();
            const low = text.toLowerCase();
            const named = files.docs.filter(f => {
                const x: any = f.data();
                const base = String(x.name || "").replace(/\.md$/i, "").toLowerCase().trim();
                return x.category !== "reference" && base.length >= 4 && low.includes(base);
            }).slice(0, 3);
            for (const f of named) {
                // Nov 2026: el documento nombrado entra casi entero y en orden. Antes llegaban 2.000 letras de tres trozos
                // sin orden: «Errantes» se cortaba antes de las fases y la IA no veía lo que el autor sí había escrito.
                const t = await indexedDoc(uid, f.id, 9000);
                if (t) { out.push(`(${String((f.data() as any).name || "").replace(/\.md$/i, "")}${dateTag((f.data() as any).updatedAt)}) ${t}`); chars += t.length; }
            }
        } catch { /* sin índice: sigue con la búsqueda por parecido */ }
        // Nov 2026: cada fragmento dice cuándo cambió su documento por última vez, para que la IA no corrija al autor con un archivo viejo.
        const parents = new Map<string, any>();
        for (const d of snap.docs) { const pr = d.ref.parent.parent; if (pr) parents.set(pr.path, pr); }
        const changed = new Map<string, string>();
        try {
            if (parents.size) (await getFirestore().getAll(...Array.from(parents.values()))).forEach(f => changed.set(f.ref.path, String((f.data() as any)?.updatedAt || "")));
        } catch { /* sin fechas: los fragmentos van sin ellas */ }
        for (const d of snap.docs) {
            const c: any = d.data();
            if (c.category === "reference") continue;
            const t = String(c.text || "").trim();
            if (!t || chars + t.length > 32000) continue;
            chars += t.length;
            out.push(`(${String(c.fileName || "").replace(/\.md$/i, "")}${dateTag(changed.get(d.ref.parent.parent?.path || ""))}) ${t}`);
        }
        return out.join("\n\n");
    } catch (e: any) {
        logger.warn(`[WHATIF] Sin canon de apoyo: ${e?.message}`);
        return "";
    }
}

// ── Imágenes del autor (Nov 2026) ─────────────────────────────────────────────────────────────
// Viven en SU Drive: Recursos → «Ideas (no canon)» → «Imágenes». En Firestore solo queda el id y el nombre.
const IMAGES_FOLDER = "Imágenes";
const MAX_IMAGES_PER_MESSAGE = 3;
const MAX_IMAGES_IN_CONTEXT = 4;
const MAX_IMAGE_B64 = 5_500_000; // ≈4 MB de imagen
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

interface ImgRef { id: string; name: string; mimeType: string }
interface Msg { role: "user" | "assistant"; text: string; at?: string; images?: ImgRef[] }

function cleanIncomingImages(raw: any): { name: string; mimeType: string; data: string }[] {
    if (!Array.isArray(raw)) return [];
    const out: { name: string; mimeType: string; data: string }[] = [];
    for (const im of raw.slice(0, MAX_IMAGES_PER_MESSAGE)) {
        const mimeType = String(im?.mimeType || "");
        const data = String(im?.data || "");
        if (!IMAGE_TYPES.includes(mimeType) || !data) continue;
        if (data.length > MAX_IMAGE_B64) throw new HttpsError("invalid-argument", "Una de las imágenes pesa demasiado. Prueba con una más pequeña.");
        const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : mimeType === "image/gif" ? "gif" : "jpg";
        const base = String(im?.name || "imagen").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/:*?"<>|#^[\]|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "imagen";
        out.push({ name: `${base}.${ext}`, mimeType, data });
    }
    return out;
}

function uniqueImages(list: any[]): ImgRef[] {
    const seen = new Set<string>();
    const out: ImgRef[] = [];
    for (const i of list || []) {
        const id = String(i?.id || "");
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: String(i?.name || "imagen").replace(/["\n\r|]/g, " ").slice(0, 90), mimeType: String(i?.mimeType || "image/jpeg") });
    }
    return out;
}

async function findImagesFolder(drive: any, uid: string): Promise<string> {
    const ideas = (await findIdeasFolder(drive, uid, true))!;
    const q = `'${ideas.id}' in parents and name = '${IMAGES_FOLDER}' and mimeType = '${FOLDER}' and trashed = false`;
    const res = await drive.files.list({ q, fields: "files(id)", pageSize: 2 });
    if (res.data.files?.[0]?.id) return res.data.files[0].id;
    const made = await drive.files.create({ requestBody: { name: IMAGES_FOLDER, mimeType: FOLDER, parents: [ideas.id] }, fields: "id" });
    return made.data.id!;
}

async function uploadImage(drive: any, folderId: string, im: { name: string; mimeType: string; data: string }): Promise<ImgRef> {
    // Nombre único y legible: en Obsidian la nota la muestra con ![[nombre]].
    const d = new Date();
    const stamp = `${d.toISOString().slice(0, 10)} ${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}`;
    const name = `${stamp} ${im.name}`;
    const made = await drive.files.create({
        requestBody: { name, mimeType: im.mimeType, parents: [folderId] },
        media: { mimeType: im.mimeType, body: Readable.from(Buffer.from(im.data, "base64")) },
        fields: "id,name",
    });
    return { id: made.data.id!, name: made.data.name || name, mimeType: im.mimeType };
}

async function downloadImage(drive: any, id: string): Promise<string | null> {
    try {
        const res = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer" });
        const buf = Buffer.from(res.data as ArrayBuffer);
        if (!buf.length || buf.length > 4_200_000) return null;
        return buf.toString("base64");
    } catch (e: any) {
        logger.warn(`[WHATIF] No pude leer la imagen ${id}: ${e?.message}`);
        return null;
    }
}

export const whatIf = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 240, memory: "1GiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const { mode, accessToken } = request.data || {};
        const ref = sessionRef(uid);

        if (mode === "load") {
            const [snap, refs, canon] = await Promise.all([ref.get(), referenceList(uid), canonList(uid).catch(() => [])]);
            return { messages: (snap.data() as any)?.messages || [], references: refs.filter(r => !r.path.startsWith(IDEAS_FOLDER + "/")), canon };
        }

        // Nov 2026: «Esto no es mío». El autor dice qué inventó o entendió mal la IA; queda para todas las herramientas.
        if (mode === "correct") {
            const text = String(request.data?.text || "").trim();
            if (text.length < 4) throw new HttpsError("invalid-argument", "Cuéntame qué fue lo que no dijiste.");
            await addCorrections(uid, "ideas", [`El autor corrigió en Ideas: «${text.slice(0, 280)}»`]);
            return { ok: true };
        }

        if (mode === "reset") {
            await ref.set({ messages: [], updatedAt: new Date().toISOString() });
            return { messages: [] };
        }

        if (mode === "listIdeas") {
            if (!accessToken) return { ideas: [] };
            const drive = drv(accessToken);
            const folder = await findIdeasFolder(drive, uid, false);
            if (!folder) return { ideas: [] };
            const res = await drive.files.list({ q: `'${folder.id}' in parents and trashed = false`, fields: "files(id,name,modifiedTime)", orderBy: "modifiedTime desc", pageSize: 100 });
            return { ideas: (res.data.files || []).map((f: any) => ({ id: f.id, name: String(f.name || "").replace(/\.md$/i, ""), modifiedTime: f.modifiedTime })) };
        }

        if (mode === "send") {
            const message = String(request.data?.message || "").trim().slice(0, 4000);
            const incoming = cleanIncomingImages(request.data?.images);
            if (!message && !incoming.length) throw new HttpsError("invalid-argument", "Escribe algo para empezar.");
            if (incoming.length && !accessToken) throw new HttpsError("failed-precondition", "Para guardar tus imágenes falta la conexión con Drive. Recarga la página.");
            const selected: string[] = Array.isArray(request.data?.refIds) ? request.data.refIds.slice(0, 3) : [];
            const snap = await ref.get();
            const history: Msg[] = (snap.data() as any)?.messages || [];
            const drive = accessToken ? drv(accessToken) : null;

            // Las imágenes del autor se guardan primero en SU Drive (Recursos → Ideas (no canon) → Imágenes):
            // MyWorld no las conserva en sus servidores; en la conversación solo queda el id del archivo.
            const saved: ImgRef[] = [];
            if (incoming.length && drive) {
                const folderId = await findImagesFolder(drive, uid);
                for (const im of incoming) {
                    try { saved.push(await uploadImage(drive, folderId, im)); }
                    catch (e: any) { logger.warn(`[WHATIF] No pude guardar la imagen ${im.name}: ${e?.message}`); }
                }
                if (!saved.length) throw new HttpsError("internal", "No pude guardar tus imágenes en Drive. Intenta de nuevo.");
            }

            const refs = await referenceList(uid);
            let refText = "";
            if (selected.length) {
                // Nov 2026: lo que el autor adjunta desde «Fuentes» entra entero (canon o recursos), no un trozo.
                const parts: string[] = [];
                const canon = selected.some(id => !refs.some(x => x.id === id)) ? await canonList(uid).catch(() => []) : [];
                for (const id of selected) {
                    try {
                        const r = refs.find(x => x.id === id);
                        const c = canon.find(x => x.id === id);
                        if (!r && !c) continue; // solo documentos del propio autor
                        let t = await indexedDoc(uid, id, 16000).catch(() => "");
                        if (!t && drive) {
                            const raw = String(await _getDriveFileContentInternal(drive, id) || "").trim();
                            t = raw.length > 16000 ? `${raw.slice(0, 16000)}\n[AQUÍ SE CORTA: el documento sigue y no recibiste el resto.]` : raw;
                        }
                        if (t) parts.push(`### ${(r || c)!.name} (${c ? "canon" : "recurso, no canon"})\n${t}`);
                    } catch { /* ilegible */ }
                }
                refText = parts.join("\n\n");
            }
            const recent = history.slice(-12);
            const convoHint = recent.map(m => m.text).join(" ").slice(-1500) + " " + message;
            if (message) await noteAuthorMessage(uid, "ideas", message);
            const [memory, canon, elsewhere] = await Promise.all([
                getMemoryContext(uid, convoHint),
                canonPeek(uid, convoHint, request.data),
                sharedContext(uid, "ideas"),
            ]);
            const context = [
                memory ? `SU MUNDO (memoria del proyecto):\n${memory}` : "",
                elsewhere,
                canon ? `FRAGMENTOS DE SU CANON (cada uno empieza con el nombre del documento entre paréntesis y, si se sabe, cuándo cambió por última vez; sirven para no inventar y para avisar choques, no para limitar):\n${canon}` : "FRAGMENTOS DE SU CANON: ninguno esta vez. Trabaja con lo que cuenta el autor y no cites documentos. No hace falta avisarle que no los tienes, salvo que te pregunte por algo de su canon; y si ya se lo dijiste en esta conversación, no lo repitas.",
                refText ? `DOCUMENTOS QUE EL AUTOR ADJUNTÓ DESDE «FUENTES» (los eligió él para esta conversación: léelos enteros, son la referencia principal cuando hable de ellos):\n${refText}` : "",
                refs.length ? `SUS REFERENCIAS EN RECURSOS (nombres): ${refs.filter(r => !r.path.startsWith(IDEAS_FOLDER + "/")).map(r => r.name).slice(0, 60).join(", ")}` : "",
            ].filter(Boolean).join("\n\n");
            // La última respuesta propia va completa: hace falta para no repetir su arranque ni su molde.
            const lastAsst = recent.map(m => m.role).lastIndexOf("assistant");
            const convo = recent.map((m, i) => {
                const pics = m.images?.length ? ` [adjuntó ${m.images.length === 1 ? "una imagen" : m.images.length + " imágenes"}: ${m.images.map(x => x.name).join(", ")}]` : "";
                if (m.role === "user") return `AUTOR:${pics} ${m.text}`;
                return `TÚ: ${i !== lastAsst && m.text.length > 1200 ? m.text.slice(0, 1200) + " […]" : m.text}`;
            }).join("\n\n");

            // Imágenes que ve el modelo: las de este mensaje y, si hay conexión con Drive, las últimas de la conversación.
            const content: any[] = [];
            const seen: string[] = [];
            if (drive) {
                const earlier = recent.flatMap(m => m.images || []).slice(-(MAX_IMAGES_IN_CONTEXT - incoming.length));
                for (const im of earlier) {
                    const data = await downloadImage(drive, im.id);
                    if (!data) continue;
                    content.push({ type: "image", source: { type: "base64", media_type: im.mimeType, data } });
                    seen.push(im.name);
                }
            }
            for (const im of incoming) {
                content.push({ type: "image", source: { type: "base64", media_type: im.mimeType, data: im.data } });
                seen.push(im.name);
            }
            const picsNow = saved.length ? ` [adjunta ${saved.length === 1 ? "una imagen" : saved.length + " imágenes"}: ${saved.map(x => x.name).join(", ")}]` : "";
            const turns = history.filter(m => m.role === "user").length + 1;
            content.push({
                type: "text", text: [
                    context,
                    seen.length ? `IMÁGENES QUE RECIBES (en este orden): ${seen.join(", ")}` : "",
                    convo ? `CONVERSACIÓN HASTA AHORA:\n${convo}` : "",
                    `(Mensaje ${turns} del autor en esta conversación.)`,
                    `AUTOR:${picsNow} ${message || "(solo envió la imagen)"}`,
                ].filter(Boolean).join("\n\n"),
            });

            const r = await aiText({
                model: CLAUDE_SONNET,
                system: [{ text: WHATIF_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true, ttl1h: true }],
                content,
                maxTokens: 4000,
                // Nov 2026: con «low» respondía con plantilla; aquí pensar un poco más vale la pena (unos centavos al mes).
                effort: "medium",
                label: "WhatIf",
            } as any);
            if (!r.ok || !r.text) {
                if (r.noCredit || r.error === "MONTHLY_CAP") throw new HttpsError("resource-exhausted", "Se acabó el saldo de Claude de este mes.");
                throw new HttpsError("internal", "No pude responder. Intenta de nuevo.");
            }
            const now = new Date().toISOString();
            const userMsg: Msg = { role: "user", text: message, at: now, ...(saved.length ? { images: saved } : {}) };
            const messages = [...history, userMsg, { role: "assistant" as const, text: r.text.trim(), at: now }].slice(-MAX_SAVED);
            await ref.set({ messages, updatedAt: now });
            return { messages };
        }

        if (mode === "distill") {
            const snap = await ref.get();
            const history: Msg[] = (snap.data() as any)?.messages || [];
            if (!history.length) throw new HttpsError("failed-precondition", "Todavía no hay conversación que guardar.");
            const upTo = Number.isInteger(request.data?.upTo) ? request.data.upTo : history.length - 1;
            const slice = history.slice(Math.max(0, upTo - 15), upTo + 1);
            const r = await aiText({
                model: CLAUDE_HAIKU,
                system: [{ text: DISTILL_TASK, cache: true }],
                content: [{ type: "text", text: slice.map(m => `${m.role === "user" ? "AUTOR" : "IA"}:${m.images?.length ? ` [adjuntó: ${m.images.map(x => x.name).join(", ")}]` : ""} ${m.text}`).join("\n\n") + "\n\nResponde SOLO con el JSON." }],
                maxTokens: 3000,
                effort: "low",
                label: "WhatIfDistill",
            } as any);
            if (!r.ok || !r.text) throw new HttpsError("internal", "No pude preparar la nota. Intenta de nuevo.");
            try {
                const j = r.text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
                const p = JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
                const imagenes = uniqueImages(slice.flatMap(m => m.images || []));
                return {
                    titulo: String(p.titulo || "Idea sin título").slice(0, 80),
                    cuerpo: String(p.cuerpo || ""),
                    tipo: p.tipo === "diseno" || imagenes.length ? "diseno" : "idea",
                    sujeto: String(p.sujeto || "").slice(0, 60),
                    imagenes,
                    upTo,
                };
            } catch {
                throw new HttpsError("internal", "La nota llegó mal formada. Intenta de nuevo.");
            }
        }

        if (mode === "saveIdea") {
            if (!accessToken) throw new HttpsError("failed-precondition", "Falta la conexión con Drive. Recarga la página.");
            const titulo = String(request.data?.titulo || "").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Idea sin título";
            const cuerpo = String(request.data?.cuerpo || "").trim();
            if (!cuerpo) throw new HttpsError("invalid-argument", "La idea está vacía.");
            // Nov 2026: lo que el autor borró de la nota que le preparó la IA es una corrección: eso no era suyo.
            try {
                const norm = (l: string) => l.replace(/^[\s>*\-\d.]+/, "").replace(/\s+/g, " ").trim().toLowerCase();
                const kept = new Set(cuerpo.split("\n").map(norm));
                const removed = String(request.data?.cuerpoOriginal || "").split("\n").filter(l => /^\s*[-*]\s+\S/.test(l) && norm(l).length > 18 && !kept.has(norm(l))).slice(0, 3);
                if (removed.length) await addCorrections(uid, "ideas", removed.map(l => `Al guardar «${titulo}», el autor borró de la nota esta línea que había puesto la IA: «${l.replace(/^\s*[-*]\s+/, "").slice(0, 220)}»`));
                await noteDecision(uid, "ideas", `Guardó en Ideas (no canon) «${titulo}»`);
            } catch { /* no bloquea el guardado */ }
            const drive = drv(accessToken);
            const folder = (await findIdeasFolder(drive, uid, true))!;
            const today = new Date().toISOString().slice(0, 10);
            // Nov 2026: también guarda notas de Mira («Guardar como nota»), con su origen.
            const origen = String(request.data?.origen || "Qué pasaría si").replace(/[\n\r]/g, " ").slice(0, 40);
            const esDiseno = request.data?.tipo === "diseno";
            const tipo = origen === "Mira" ? "nota" : esDiseno ? "diseño" : "idea";
            const sujeto = String(request.data?.sujeto || "").replace(/[\n\r"]/g, " ").trim().slice(0, 60);
            const imagenes = uniqueImages(Array.isArray(request.data?.imagenes) ? request.data.imagenes : []).slice(0, 12);
            // La conversación completa va al final, plegada (en Obsidian es un bloque que se abre con un clic).
            let conversacion = "";
            if (request.data?.conConversacion && Number.isInteger(request.data?.upTo)) {
                const history: Msg[] = ((await ref.get()).data() as any)?.messages || [];
                const upTo = request.data.upTo as number;
                const slice = history.slice(Math.max(0, upTo - 15), upTo + 1);
                if (slice.length) {
                    const lines = slice.map(m => {
                        const pics = (m.images || []).map(x => `![[${x.name}]]`).join(" ");
                        const body = `**${m.role === "user" ? "Tú" : "Mira"}:** ${pics ? pics + "\n" : ""}${m.text}`;
                        return body.split("\n").map(l => `> ${l}`).join("\n");
                    });
                    conversacion = `\n\n> [!quote]- Conversación completa\n${lines.join("\n>\n")}\n`;
                }
            }
            const front = [
                "---", `tipo: ${tipo}`, "canon: no", `creada: ${today}`, `origen: ${origen} (MyWorld)`,
                ...(sujeto ? [`sujeto: "${sujeto}"`] : []),
                ...(imagenes.length ? ["imagenes:", ...imagenes.map(i => `  - "${i.name} | ${i.id}"`)] : []),
                "---",
            ].join("\n");
            const gallery = imagenes.length ? imagenes.map(i => `![[${i.name}]]`).join("\n") + "\n\n" : "";
            const content = `${front}\n\n# ${titulo}\n\n${gallery}${cuerpo}${conversacion}\n`;
            const made = await drive.files.create({
                requestBody: { name: `${titulo}.md`, mimeType: "text/markdown", parents: [folder.id] },
                media: { mimeType: "text/markdown", body: content },
                fields: "id,name,modifiedTime",
            });
            // Indexar ya (como Recurso) para que el Director y el Arquitecto la conozcan sin esperar a la sincronización.
            // Se indexa sin la conversación plegada: lo que vale como recurso es la nota, no el ida y vuelta.
            try {
                const cfg = await getConfig(uid);
                const embedder = new GeminiEmbedder({ apiKey: getAIKey(request.data, googleApiKey.value()), model: "gemini-embedding-001", taskType: TaskType.RETRIEVAL_DOCUMENT });
                await ingestFile(getFirestore(), uid, cfg.folderId || "unknown_project", {
                    id: made.data.id!, name: made.data.name!, path: `${IDEAS_FOLDER}/${made.data.name}`, saga: "Global",
                    parentId: folder.id, category: "reference", mimeType: "text/markdown",
                } as any, `${front}\n\n# ${titulo}\n\n${cuerpo}\n`, embedder);
            } catch (e: any) {
                logger.warn(`[WHATIF] Idea guardada pero sin indexar aún: ${e?.message}`);
            }
            logger.info(`💡 [WHATIF] ${tipo} guardada: ${made.data.name} (${imagenes.length} imágenes)`);
            return { idea: { id: made.data.id, name: titulo, modifiedTime: made.data.modifiedTime } };
        }

        // Nov 2026: la nota guardada se lee aquí para mostrarla como hoja (con sus imágenes) sin salir del frasco.
        if (mode === "readIdea") {
            if (!accessToken) throw new HttpsError("failed-precondition", "Falta la conexión con Drive. Recarga la página.");
            const id = String(request.data?.id || "");
            if (!id) throw new HttpsError("invalid-argument", "Falta la nota.");
            const drive = drv(accessToken);
            const folder = await findIdeasFolder(drive, uid, false);
            const meta = await drive.files.get({ fileId: id, fields: "id,name,parents,modifiedTime" });
            if (!folder || !(meta.data.parents || []).includes(folder.id)) throw new HttpsError("permission-denied", "Esa nota no está en tus ideas.");
            const content = String(await _getDriveFileContentInternal(drive, id) || "");
            return { id, name: String(meta.data.name || "").replace(/\.md$/i, ""), modifiedTime: meta.data.modifiedTime, content };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
