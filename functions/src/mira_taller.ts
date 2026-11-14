// Nov 2026: La biblioteca de Mira. Aprender y practicar sin presión.
//  · Decisiones del libro: el punto de vista (quién narra, desde cuándo y en qué tiempo). Se guarda en la
//    memoria, así el Arquitecto, el reporte de capítulo y Mira lo respetan.
//  · Practicar: Mira propone un ejercicio corto (con los personajes del autor si sirve) y da su opinión.
//    Nunca reescribe la prosa del autor: señala con citas de su texto y explica.
//  · Preguntas de oficio («¿primera o tercera persona?»), respondidas para su historia.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { GoogleGenerativeAI } from "./utils/genai";
import { getAIKey, getTier } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";
import { applyMemoryOps, getMemoryContext, memoryCol, slugify } from "./utils/memory_store";
import { craftCol, craftId, saveCraft } from "./craft";
import { MYWORLD_VOICE } from "./utils/claude_router";
import { sharedContext } from "./utils/shared_context";
import { getRequestUid } from "./utils/request_context";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const DECISIONS_FILE = "Decisiones del libro";
const practiceCol = (uid: string) => getFirestore().collection("users").doc(uid).collection("practice");

const TOPICS: Record<string, string> = {
    sorpresa: "cualquier aspecto del oficio que le sirva ahora a su historia",
    dialogo: "un diálogo con tres o más personajes donde siempre se sepa quién habla",
    presentar: "presentar a un personaje nuevo para que el lector lo recuerde (un rasgo y su relación con el protagonista)",
    relacion: "mostrar una relación de años (pareja, padres, amigos) sin explicarla, con gestos y costumbres",
    dilema: "un dilema donde el personaje elige entre dos cosas que quiere",
    pov: "el punto de vista: escribir la misma escena con dos narradores distintos para comparar",
    narradora: "una narradora adulta que recuerda su infancia: la voz del recuerdo y la de la niña",
    sentido: "anclar una escena con un sentido además de la vista (olor, sonido, textura)",
    estudio: "analizar una escena de una serie, película o anime que le gustó y llevar la técnica a su historia",
    tercera_cercana: "la tercera persona cercana: contar en «ella/él» pero desde dentro del personaje (lo que nota, piensa y siente, con sus palabras), sin «pensó» ni «sintió» de más",
    primera: "la primera persona: que la voz del narrador se oiga en cada frase (lo que elige contar, cómo lo dice y lo que calla)",
};

// Nov 2026: la voz en la que se escribe el ejercicio (cualquiera de los temas se puede practicar en cualquier voz).
const VOICES: Record<string, string> = {
    primera: "en primera persona («yo»), desde dentro del personaje",
    tercera_cercana: "en tercera persona cercana («ella/él», pegada a un solo personaje: solo lo que ese personaje percibe, piensa y siente)",
    tercera_todo: "en tercera persona omnisciente (un narrador que sabe lo que pasa en todas partes y lo que piensan todos)",
};

const MIRA = `Eres Mira, la compañera de escritura de MyWorld: cercana, honesta y concreta, como una amiga que sabe de oficio. Hablas en español, en segunda persona y con frases claras. Enseñas con ejemplos breves inventados por ti (nunca citas libros ni canciones). Usas lo que sabes del autor y su historia para que el ejercicio o la explicación le sirva a él.`;

async function generate(requestData: any, prompt: string, label: string) {
    const genAI = new GoogleGenerativeAI(getAIKey(requestData, googleApiKey.value()));
    // Nov 2026: el Taller habla con la misma voz que las demás herramientas y conoce las correcciones del autor.
    const uid = getRequestUid();
    const shared = uid ? await sharedContext(uid, "estudio").catch(() => "") : "";
    const systemInstruction = MYWORLD_VOICE + "\n(Esta voz aplica al texto que va dentro de cada campo del JSON.)" + (shared ? "\n\n" + shared : "");
    const r = await smartGenerateContent(genAI, prompt, { _tier: getTier(requestData), taskType: "standard", jsonMode: true, temperature: 0.7, contextLabel: label, systemInstruction });
    if (!r.text) throw new HttpsError("unavailable", "Mira no pudo responder ahora. Intenta en un momento.");
    const parsed = parseSecureJSON(r.text, label);
    if (!parsed || parsed.error) throw new HttpsError("internal", "Mira se enredó con la respuesta. Intenta otra vez.");
    return parsed;
}

const s = (v: any, max: number) => String(v || "").trim().slice(0, max);

/** Nov 2026: guarda (o actualiza) el punto de vista de un libro en «Decisiones del libro». También lo usa el
 *  Arquitecto al cerrar una conversación donde se decidió quién narra. */
export async function saveBookPov(uid: string, book: string, detail: string, source = "biblioteca") {
    const text = `Punto de vista de «${book}»: ${detail}${/[.!?]$/.test(detail) ? "" : "."}`;
    const snap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
    const lines: any[] = (snap.data() as any)?.lines || [];
    const prev = lines.find(l => String(l.text || "").startsWith(`Punto de vista de «${book}»`));
    await applyMemoryOps(uid, [prev
        ? { op: "update", file: DECISIONS_FILE, kind: "libro", lineId: prev.id, text }
        : { op: "add", file: DECISIONS_FILE, kind: "libro", description: "Decisiones de oficio por libro: punto de vista, narrador y tiempo verbal. Respétalas al revisar o proponer.", text }] as any, source);
    return text;
}

export const miraTaller = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 120, memory: "512MiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const d = request.data || {};
        const mode = d.mode;

        if (mode === "decisions") {
            const snap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
            const lines: any[] = (snap.data() as any)?.lines || [];
            return { lines: lines.map(l => ({ id: l.id, text: l.text, at: l.at })) };
        }

        if (mode === "forgetDecision") {
            const lineId = s(d.lineId, 80);
            if (!lineId) throw new HttpsError("invalid-argument", "Falta la decisión.");
            await applyMemoryOps(uid, [{ op: "remove", file: DECISIONS_FILE, lineId }] as any, "biblioteca");
            const snap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
            return { lines: (((snap.data() as any)?.lines) || []).map((l: any) => ({ id: l.id, text: l.text, at: l.at })) };
        }

        if (mode === "decide") {
            const book = s(d.book, 80) || "mi libro";
            const parts = [
                s(d.narrator, 160),
                s(d.distance, 160),
                s(d.tense, 60) ? `tiempo verbal: ${s(d.tense, 60)}` : "",
                s(d.others, 200),
                s(d.note, 300),
            ].filter(Boolean);
            if (!parts.length) throw new HttpsError("invalid-argument", "Elige al menos quién narra.");
            const text = `Punto de vista de «${book}»: ${parts.join("; ")}.`;
            const snap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
            const lines: any[] = (snap.data() as any)?.lines || [];
            const prev = lines.find(l => String(l.text || "").startsWith(`Punto de vista de «${book}»`));
            await applyMemoryOps(uid, [prev
                ? { op: "update", file: DECISIONS_FILE, kind: "libro", lineId: prev.id, text }
                : { op: "add", file: DECISIONS_FILE, kind: "libro", description: "Decisiones de oficio por libro: punto de vista, narrador y tiempo verbal. Respétalas al revisar o proponer.", text }] as any, "biblioteca");
            logger.info(`[BIBLIOTECA] ${uid}: ${text}`);
            return { ok: true, text };
        }

        if (mode === "history") {
            const snap = await practiceCol(uid).orderBy("at", "desc").limit(15).get();
            return { items: snap.docs.map(x => ({ id: x.id, ...(x.data() as any) })) };
        }

        if (mode === "exercise") {
            const topic = TOPICS[d.topic] ? d.topic : "sorpresa";
            const voz = s(d.voz, 40);
            // «libro»: la voz decidida para su libro (si la hay en «Decisiones del libro»).
            let vozText = VOICES[voz] || "";
            if (voz === "libro") {
                const dsnap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
                const pov = (((dsnap.data() as any)?.lines) || []).map((l: any) => String(l.text || "")).find((t: string) => t.startsWith("Punto de vista de"));
                vozText = pov ? `con el mismo punto de vista que decidió para su libro (${pov})` : "";
            }
            const memory = await getMemoryContext(uid, `${TOPICS[topic]} ${s(d.hint, 300)}`);
            const prompt = `${MIRA}

TAREA: crea UN ejercicio de escritura corto para practicar: ${TOPICS[topic]}.
- Que se pueda hacer en 15 a 25 minutos (entre 150 y 400 palabras).
- Si en la memoria hay personajes o escenas del autor que sirvan, úsalos (es práctica, no canon: puede escribir algo que nunca entre al libro). Si no hay, inventa una situación simple.
- "consigna": lo que debe escribir, en dos o tres frases, con una situación concreta.
- "objetivo": qué debe lograr el texto para que el ejercicio funcione («la idea es que se entienda…»).
- "pista": un consejo de oficio corto para lograrlo, con un mini ejemplo inventado si ayuda.
${vozText ? `- VOZ: el texto se escribe ${vozText}. Dilo en la consigna y haz que el objetivo incluya sostener esa voz.` : ""}
${s(d.hint, 300) ? `PIDE ADEMÁS: ${s(d.hint, 300)}` : ""}

${memory || "(No hay memoria del autor todavía.)"}

Responde SOLO con JSON: {"titulo":"…","consigna":"…","objetivo":"…","palabras":250,"pista":"…"}`;
            const ex = await generate(d, prompt, "TallerEjercicio");
            return { exercise: { topic, voz: vozText ? voz : "", titulo: s(ex.titulo, 120), consigna: s(ex.consigna, 900), objetivo: s(ex.objetivo, 400), palabras: Math.min(600, Math.max(100, Number(ex.palabras) || 250)), pista: s(ex.pista, 600) } };
        }

        if (mode === "feedback") {
            const text = s(d.text, 8000);
            if (text.split(/\s+/).filter(Boolean).length < 40) throw new HttpsError("invalid-argument", "Escribe un poco más (al menos unas 40 palabras) para que Mira pueda opinar.");
            const ex = d.exercise || {};
            const memory = await getMemoryContext(uid, `${s(ex.consigna, 400)} ${text.slice(0, 1200)}`);
            const prompt = `${MIRA}

TAREA: el autor hizo este ejercicio de práctica y te pide tu opinión.
EJERCICIO: ${s(ex.titulo, 120)}${VOICES[ex.voz] ? `\nVOZ PEDIDA: ${VOICES[ex.voz]} (revisa si la sostiene en todo el texto; si se sale, cita dónde)` : ""}
CONSIGNA: ${s(ex.consigna, 900)}
OBJETIVO: ${s(ex.objetivo, 400)}

TEXTO DEL AUTOR:
<<<
${text}
>>>

REGLAS:
- Mide el texto contra el OBJETIVO del ejercicio. Di con franqueza si lo logró, a medias o no, en la primera frase.
- NUNCA reescribas su texto ni le propongas frases tuyas para reemplazar las suyas. Señala con citas cortas y literales de SU texto (máximo 12 palabras cada una) y explica qué hacer.
- Máximo 3 cosas que funcionan y 3 para mejorar. Concretas, nada genérico.
- "siguiente": un reto pequeño para la próxima vez, en una frase.
${memory ? `\n${memory}\n` : ""}
Responde SOLO con JSON: {"resumen":"…","funciona":[{"cita":"…","porque":"…"}],"mejorar":[{"cita":"…","que":"…"}],"siguiente":"…"}`;
            const fb = await generate(d, prompt, "Director_TallerOpinion");
            const feedback = {
                resumen: s(fb.resumen, 600),
                funciona: (Array.isArray(fb.funciona) ? fb.funciona : []).slice(0, 3).map((x: any) => ({ cita: s(x?.cita, 140), porque: s(x?.porque, 400) })),
                mejorar: (Array.isArray(fb.mejorar) ? fb.mejorar : []).slice(0, 3).map((x: any) => ({ cita: s(x?.cita, 140), que: s(x?.que, 400) })),
                siguiente: s(fb.siguiente, 300),
            };
            const doc = await practiceCol(uid).add({ exercise: ex, text, feedback, at: new Date().toISOString(), words: text.split(/\s+/).filter(Boolean).length });
            return { feedback, id: doc.id };
        }

        if (mode === "ask") {
            const q = s(d.question, 1200);
            if (q.length < 5) throw new HttpsError("invalid-argument", "Escribe tu pregunta.");
            const memory = await getMemoryContext(uid, q);
            const prompt = `${MIRA}

El autor te hace una pregunta de oficio. Respóndele para SU historia (usa la memoria), no en abstracto:
- Empieza por tu recomendación en una o dos frases y por qué, pensando en lo que su libro quiere lograr.
- Luego qué gana y qué le cuesta cada opción, aplicado a sus personajes y escenas.
- Si sirve, un mini ejemplo inventado de dos o tres líneas para cada opción (no de su libro).
- Termina con una prueba práctica corta para decidir con su propio texto.
- La decisión es suya: no la impongas.
- Formato: Markdown con párrafos cortos y, si ayuda, una lista breve. Máximo 350 palabras.

PREGUNTA: ${q}

${memory || "(No hay memoria del autor todavía.)"}

Responde SOLO con JSON: {"respuesta":"…markdown…"}`;
            const r = await generate(d, prompt, "Director_TallerPregunta");
            return { respuesta: s(r.respuesta, 4000) };
        }

        // Nov 2026: el autor explica por qué un capítulo o personaje se narra distinto: queda como excepción del libro
        // (el reporte, Mira y el Arquitecto la respetan y ya no lo señalan).
        if (mode === "povException") {
            const where = s(d.where, 120);
            const why = s(d.why, 400);
            if (!where || !why) throw new HttpsError("invalid-argument", "Falta dónde y por qué.");
            const text = `Excepción de punto de vista en «${where}»: ${why}${/[.!?]$/.test(why) ? "" : "."}`;
            await applyMemoryOps(uid, [{ op: "add", file: DECISIONS_FILE, kind: "libro", description: "Decisiones de oficio por libro: punto de vista, narrador y tiempo verbal. Respétalas al revisar o proponer.", text }] as any, "biblioteca");
            const snap = await memoryCol(uid).doc(slugify(DECISIONS_FILE)).get();
            return { ok: true, text, lines: (((snap.data() as any)?.lines) || []).map((l: any) => ({ id: l.id, text: l.text, at: l.at })) };
        }

        // ── Nov 2026: focos de oficio («Para ti») ──
        if (mode === "craft") {
            const snap = await craftCol(uid).limit(40).get();
            const items = snap.docs.map(x => ({ id: x.id, ...(x.data() as any) }))
                .sort((a: any, b: any) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
            return { items };
        }
        if (mode === "craftAdd") {
            const tema = s(d.tema, 80);
            if (tema.length < 3) throw new HttpsError("invalid-argument", "Escribe qué quieres mejorar.");
            await saveCraft(uid, { tema, porque: s(d.nota, 300) || "Lo dijiste tú.", paso: "" }, "autor");
            return { id: craftId(tema) };
        }
        if (mode === "craftState") {
            const id = s(d.id, 80);
            const estado = d.estado === "hecho" ? "hecho" : d.estado === "activo" ? "activo" : "";
            if (!id) throw new HttpsError("invalid-argument", "Falta el tema.");
            if (d.forget) { await craftCol(uid).doc(id).delete(); return { ok: true }; }
            if (estado) await craftCol(uid).doc(id).set({ estado, updatedAt: new Date().toISOString() }, { merge: true });
            return { ok: true };
        }
        if (mode === "lesson") {
            // Una lección hecha para el autor sobre uno de sus focos: con su historia, sus personajes y lo que se notó.
            const id = s(d.id, 80);
            const ref = craftCol(uid).doc(id);
            const f: any = (await ref.get()).data();
            if (!f) throw new HttpsError("not-found", "Ese tema ya no está.");
            if (f.leccion && !d.refresh) return { lesson: f.leccion };
            const [memory, practices] = await Promise.all([
                getMemoryContext(uid, `${f.tema} ${f.porque || ""}`),
                practiceCol(uid).orderBy("at", "desc").limit(5).get().catch(() => null),
            ]);
            const past = (practices?.docs || []).map(x => (x.data() as any)?.feedback?.resumen).filter(Boolean).slice(0, 3);
            const prompt = `${MIRA}

TAREA: escribe una lección corta, hecha para este autor, sobre: «${f.tema}».
${f.porque ? `POR QUÉ LE SIRVE (lo que se notó): ${f.porque}` : ""}
${f.paso ? `PUNTO DE PARTIDA YA SUGERIDO: ${f.paso}` : ""}
${past.length ? `LO QUE MIRA LE DIJO EN SUS ÚLTIMAS PRÁCTICAS:\n- ${past.join("\n- ")}` : ""}

REGLAS:
- "resumen": en una o dos frases, qué es y por qué le importa a SU libro.
- "bloques": de 3 a 5, cada uno con un subtítulo corto ("h") y un párrafo claro ("p"). El primero es SIEMPRE el punto de partida: qué hacer mañana al escribir, en pasos concretos.
- "ejemplos": 2 o 3 fragmentos inventados por ti, cortos (2 a 4 líneas), que contrasten cómo no y cómo sí, con una etiqueta ("label"). Pueden usar sus personajes en situaciones nuevas; nunca reescribas su texto ni cites libros o canciones.
- "practica": una frase con el ejercicio que conviene hacer después de leer.
- Nada genérico: si algo no aplica a su historia, no lo pongas.

${memory || "(No hay memoria del autor todavía.)"}

Responde SOLO con JSON: {"titulo":"…","resumen":"…","bloques":[{"h":"…","p":"…"}],"ejemplos":[{"label":"…","text":"…"}],"practica":"…"}`;
            const r = await generate(d, prompt, "Director_TallerLeccion");
            const lesson = {
                titulo: s(r.titulo, 120) || f.tema,
                resumen: s(r.resumen, 500),
                bloques: (Array.isArray(r.bloques) ? r.bloques : []).slice(0, 6).map((b: any) => ({ h: s(b?.h, 100), p: s(b?.p, 1200) })).filter((b: any) => b.p),
                ejemplos: (Array.isArray(r.ejemplos) ? r.ejemplos : []).slice(0, 3).map((e: any) => ({ label: s(e?.label, 60), text: s(e?.text, 600) })).filter((e: any) => e.text),
                practica: s(r.practica, 300),
                at: new Date().toISOString(),
            };
            await ref.set({ leccion: lesson }, { merge: true });
            return { lesson };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
