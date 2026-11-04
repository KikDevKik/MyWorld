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
};

const MIRA = `Eres Mira, la compañera de escritura de MyWorld: cercana, honesta y concreta, como una amiga que sabe de oficio. Hablas en español, en segunda persona y con frases claras. Enseñas con ejemplos breves inventados por ti (nunca citas libros ni canciones). Usas lo que sabes del autor y su historia para que el ejercicio o la explicación le sirva a él.`;

async function generate(requestData: any, prompt: string, label: string) {
    const genAI = new GoogleGenerativeAI(getAIKey(requestData, googleApiKey.value()));
    const r = await smartGenerateContent(genAI, prompt, { _tier: getTier(requestData), taskType: "standard", jsonMode: true, temperature: 0.7, contextLabel: label });
    if (!r.text) throw new HttpsError("unavailable", "Mira no pudo responder ahora. Intenta en un momento.");
    const parsed = parseSecureJSON(r.text, label);
    if (!parsed || parsed.error) throw new HttpsError("internal", "Mira se enredó con la respuesta. Intenta otra vez.");
    return parsed;
}

const s = (v: any, max: number) => String(v || "").trim().slice(0, max);

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
            const memory = await getMemoryContext(uid, `${TOPICS[topic]} ${s(d.hint, 300)}`);
            const prompt = `${MIRA}

TAREA: crea UN ejercicio de escritura corto para practicar: ${TOPICS[topic]}.
- Que se pueda hacer en 15 a 25 minutos (entre 150 y 400 palabras).
- Si en la memoria hay personajes o escenas del autor que sirvan, úsalos (es práctica, no canon: puede escribir algo que nunca entre al libro). Si no hay, inventa una situación simple.
- "consigna": lo que debe escribir, en dos o tres frases, con una situación concreta.
- "objetivo": qué debe lograr el texto para que el ejercicio funcione («la idea es que se entienda…»).
- "pista": un consejo de oficio corto para lograrlo, con un mini ejemplo inventado si ayuda.
${s(d.hint, 300) ? `PIDE ADEMÁS: ${s(d.hint, 300)}` : ""}

${memory || "(No hay memoria del autor todavía.)"}

Responde SOLO con JSON: {"titulo":"…","consigna":"…","objetivo":"…","palabras":250,"pista":"…"}`;
            const ex = await generate(d, prompt, "TallerEjercicio");
            return { exercise: { topic, titulo: s(ex.titulo, 120), consigna: s(ex.consigna, 900), objetivo: s(ex.objetivo, 400), palabras: Math.min(600, Math.max(100, Number(ex.palabras) || 250)), pista: s(ex.pista, 600) } };
        }

        if (mode === "feedback") {
            const text = s(d.text, 8000);
            if (text.split(/\s+/).filter(Boolean).length < 40) throw new HttpsError("invalid-argument", "Escribe un poco más (al menos unas 40 palabras) para que Mira pueda opinar.");
            const ex = d.exercise || {};
            const memory = await getMemoryContext(uid, `${s(ex.consigna, 400)} ${text.slice(0, 1200)}`);
            const prompt = `${MIRA}

TAREA: el autor hizo este ejercicio de práctica y te pide tu opinión.
EJERCICIO: ${s(ex.titulo, 120)}
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

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
