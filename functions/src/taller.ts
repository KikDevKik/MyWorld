// Nov 2026: El taller de Mira.
// Un lugar para practicar y aprender sin tocar el libro:
//  · Practicar: Mira propone un ejercicio corto con los personajes y el mundo del autor, lo lee y le dice
//    qué funciona y qué mejorar (con la cita exacta).
//  · Preguntar: dudas de oficio («¿primera o tercera persona?»). Mira explica las opciones aplicadas a su
//    historia, da un ejemplo propio y breve, y si la duda es una decisión del libro, la ofrece para guardarla.
//  · Decisiones del libro: punto de vista, quién narra, tiempo verbal, tono… Se guardan en la memoria, así el
//    Arquitecto, Mira y el reporte de capítulo las respetan.
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_SONNET, MYWORLD_VOICE } from "./utils/claude_router";
import { getMemoryContext, applyMemoryOps } from "./utils/memory_store";
import { GoogleGenerativeAI } from "./utils/genai";
import { getAIKey, getTier } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

interface Decision { id: string; libro: string; tema: string; valor: string; nota?: string; at: string; lineId?: string }

const TALLER_SYSTEM = `Eres Mira, la compañera de escritura de MyWorld. En el taller eres una maestra paciente y concreta: enseñas oficio de escritura (punto de vista, diálogo, presentar personajes, dilemas, ritmo, escenas, saltos de tiempo, tono) a un autor que está escribiendo su propia saga.

CÓMO ENSEÑAS:
- Aplicas cada idea a SU historia: usa sus personajes, su mundo y sus decisiones cuando ayude (vienen en la memoria y en la lista de documentos).
- Explicas con opciones y lo que se gana y se pierde con cada una; no impones una regla. Si una opción te parece mejor para su caso, dilo y di por qué.
- Los ejemplos son tuyos, originales y breves (máximo 120 palabras). Nunca copies ni imites de cerca textos publicados. Puedes nombrar libros conocidos como referencia, sin citarlos.
- Nunca escribes su libro por él: los ejercicios los escribe él.
- Lenguaje claro y cercano, en español, sin jerga innecesaria; si usas un término técnico, explícalo en la misma frase.
- Respondes SOLO con el JSON que pida la tarea.`;

const EXERCISE_SHAPE = `{"titulo":"…","tecnica":"qué se practica, en 2-4 palabras","consigna":"qué escribir, concreto, con sus personajes o su mundo","objetivo":"lo que el lector debe entender o sentir al terminar","limite":300,"pista":"un consejo para hacerlo bien","porQue":"por qué este ejercicio le sirve a su libro, en una frase"}`;

const TASKS: Record<string, string> = {
    ejercicio: `TAREA: PROPONER UN EJERCICIO de práctica corto (200 a 400 palabras) para hoy.
Si el autor eligió un foco, el ejercicio trabaja ese foco. Si no, elige el que más le sirva según lo que sabes de su libro y sus dudas.
Varía: no repitas los ejercicios recientes que se listan.
Responde SOLO con JSON: ${EXERCISE_SHAPE}`,
    revisar: `TAREA: LEER LA PRÁCTICA del autor y devolverle una lectura útil y honesta, como una maestra que quiere que mejore.
- Mira si cumplió el objetivo del ejercicio.
- "funciona": 1 a 3 cosas concretas que funcionan, cada una con la cita exacta de su texto.
- "mejorar": 1 a 3 cosas, cada una con la cita exacta, qué pasa ahí y cómo podría hacerlo (sin reescribirle el párrafo entero; una frase de ejemplo como mucho).
- "siguiente": el siguiente paso de práctica, en una frase.
Responde SOLO con JSON: {"resumen":"2-3 frases","logrado":true,"funciona":[{"cita":"…","porque":"…"}],"mejorar":[{"cita":"…","que":"…","como":"…"}],"siguiente":"…"}`,
    preguntar: `TAREA: RESPONDER UNA DUDA DE OFICIO del autor, aplicada a su libro.
- "respuesta": la respuesta en Markdown, breve (máximo 180 palabras), directa al grano.
- "opciones": si la duda tiene caminos (p. ej. primera o tercera persona), de 2 a 4 opciones con lo que gana, lo que pierde y cómo se vería en su historia. Si no tiene caminos, [].
- "recomendacion": cuál le recomiendas para su caso y por qué, en 1-2 frases ("" si no corresponde).
- "ejemplo": un ejemplo original y breve con sus personajes que muestre la idea (máximo 120 palabras), o null.
- "ejercicio": un ejercicio para probarlo por su cuenta, con la forma ${EXERCISE_SHAPE}, o null.
- "decision": si la duda es una decisión que conviene fijar para un libro (punto de vista, quién narra, tiempo verbal, tono, estructura), {"tema":"Punto de vista","pregunta":"…","opciones":["…","…"]}; si no, null.
Responde SOLO con JSON: {"respuesta":"…","opciones":[{"nombre":"…","gana":"…","pierde":"…","enTuHistoria":"…"}],"recomendacion":"…","ejemplo":{"titulo":"…","texto":"…"},"ejercicio":null,"decision":null}`,
};

function parseJson(text: string): any {
    const j = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
    return JSON.parse(j.slice(j.indexOf("{"), j.lastIndexOf("}") + 1));
}

const dRef = (uid: string) => getFirestore().collection("users").doc(uid).collection("taller").doc("decisiones");
const pCol = (uid: string) => getFirestore().collection("users").doc(uid).collection("taller_practicas");

async function loadDecisions(uid: string): Promise<Decision[]> {
    return ((await dRef(uid).get()).data() as any)?.items || [];
}

export async function loadBookDecisionsText(uid: string): Promise<string> {
    try {
        const items = await loadDecisions(uid);
        return items.map(d => `- ${d.libro} · ${d.tema}: ${d.valor}${d.nota ? ` (${d.nota})` : ""}`).join("\n");
    } catch { return ""; }
}

async function projectContext(uid: string, hint: string, requestData: any) {
    const db = getFirestore();
    const [memory, decisions, files] = await Promise.all([
        getMemoryContext(uid, hint),
        loadBookDecisionsText(uid),
        db.collection("TDB_Index").doc(uid).collection("files").select("name", "category").limit(120).get().catch(() => null),
    ]);
    const names = (files?.docs || []).map(d => String((d.data() as any).name || "").replace(/\.md$/i, "")).filter(Boolean).slice(0, 80);
    const projectName = String(requestData?.projectName || "").slice(0, 120);
    return [
        projectName ? `PROYECTO: ${projectName}` : "",
        decisions ? `DECISIONES DEL LIBRO YA TOMADAS:\n${decisions}` : "",
        memory,
        names.length ? `DOCUMENTOS DE SU CANON (títulos; sirven para saber qué personajes y lugares tiene):\n${names.join(" · ")}` : "",
    ].filter(Boolean).join("\n\n");
}

async function generate(task: string, input: string, requestData: any, label: string): Promise<any> {
    const prompt = `${input}\n\n${TASKS[task]}`;
    if (claudeEnabledForCurrentUser()) {
        const r = await callClaude({
            model: CLAUDE_SONNET,
            system: [{ text: TALLER_SYSTEM + "\n\n" + MYWORLD_VOICE, cache: true }],
            content: [{ type: "text", text: prompt + "\n\nResponde SOLO con el JSON." }],
            maxTokens: 2500, effort: "low", label,
        } as any);
        if (r.ok && r.text) {
            try { return parseJson(r.text); } catch { /* se intenta con Gemini */ }
        } else if (r.noCredit || r.error === "MONTHLY_CAP") {
            logger.info("[TALLER] Sin saldo de Claude; sigue con Gemini");
        }
    }
    const genAI = new GoogleGenerativeAI(getAIKey(requestData, googleApiKey.value()));
    const g = await smartGenerateContent(genAI, `${TALLER_SYSTEM}\n\n${prompt}`, { _tier: getTier(requestData), taskType: "standard", jsonMode: true, temperature: 0.6, contextLabel: label });
    if (!g.text) throw new HttpsError("unavailable", "Mira no pudo responder ahora. Intenta en un momento.");
    try { return parseJson(g.text); } catch { throw new HttpsError("internal", "Mira se enredó con la respuesta. Intenta otra vez."); }
}

const clip = (s: any, n: number) => String(s || "").slice(0, n);

export const miraTaller = onCall(
    { region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS, enforceAppCheck: false, secrets: [googleApiKey, anthropicApiKey], timeoutSeconds: 180, memory: "512MiB" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const uid = request.auth.uid;
        const data = request.data || {};
        const mode = String(data.mode || "");

        // ── Decisiones del libro ──
        if (mode === "decisiones") return { items: await loadDecisions(uid) };
        if (mode === "decidir" || mode === "quitarDecision") {
            const items = await loadDecisions(uid);
            if (mode === "quitarDecision") {
                const d = items.find(x => x.id === data.id);
                if (d?.lineId) { try { await applyMemoryOps(uid, [{ op: "remove", file: "Decisiones del libro", lineId: d.lineId }], "taller"); } catch { /* sin memoria */ } }
                const next = items.filter(x => x.id !== data.id);
                await dRef(uid).set({ items: next }, { merge: true });
                return { items: next };
            }
            const libro = clip(data.libro, 80).trim(), tema = clip(data.tema, 60).trim(), valor = clip(data.valor, 240).trim(), nota = clip(data.nota, 240).trim();
            if (!libro || !tema || !valor) throw new HttpsError("invalid-argument", "Falta el libro, el tema o la decisión.");
            const line = `${libro} · ${tema}: ${valor}${nota ? ` (${nota})` : ""}`;
            const prev = items.find(x => x.libro.toLowerCase() === libro.toLowerCase() && x.tema.toLowerCase() === tema.toLowerCase());
            let lineId = prev?.lineId;
            try {
                const ops = prev?.lineId
                    ? [{ op: "update" as const, file: "Decisiones del libro", kind: "libro" as const, lineId: prev.lineId, text: line }]
                    : [{ op: "add" as const, file: "Decisiones del libro", kind: "libro" as const, description: "Cómo se cuenta cada libro: punto de vista, narrador, tiempo verbal, tono. El reporte y el Arquitecto lo respetan.", text: line }];
                const applied = await applyMemoryOps(uid, ops, "taller");
                lineId = applied[0]?.lineId || lineId;
            } catch (e: any) { logger.warn(`[TALLER] Memoria: ${e?.message}`); }
            const d: Decision = { id: prev?.id || Math.random().toString(36).slice(2, 10), libro, tema, valor, nota, at: new Date().toISOString(), lineId };
            const next = prev ? items.map(x => (x.id === prev.id ? d : x)) : [...items, d];
            await dRef(uid).set({ items: next }, { merge: true });
            return { items: next };
        }

        // ── Historial de prácticas ──
        if (mode === "historial") {
            const snap = await pCol(uid).orderBy("at", "desc").limit(20).get();
            return { items: snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) };
        }

        if (mode === "ejercicio") {
            const foco = clip(data.foco, 120);
            const recientes = (await pCol(uid).orderBy("at", "desc").limit(8).get().catch(() => null))?.docs.map(d => (d.data() as any).ejercicio?.titulo).filter(Boolean) || [];
            const ctx = await projectContext(uid, `${foco} ${data.libro || ""} ejercicio práctica`, data);
            const input = [ctx, foco ? `FOCO QUE ELIGIÓ EL AUTOR: ${foco}` : "FOCO: el que más le sirva", recientes.length ? `EJERCICIOS RECIENTES (no repetir): ${recientes.join(" · ")}` : ""].filter(Boolean).join("\n\n");
            const ej = await generate("ejercicio", input, data, "TallerEjercicio");
            return { ejercicio: { ...ej, limite: Number(ej?.limite) || 300 } };
        }

        if (mode === "revisar") {
            const ejercicio = data.ejercicio || {};
            const texto = clip(data.texto, 12000).trim();
            if (texto.split(/\s+/).length < 30) throw new HttpsError("invalid-argument", "Escribe un poco más (al menos unas 30 palabras) para que Mira pueda leerlo.");
            const ctx = await projectContext(uid, `${ejercicio.titulo || ""} ${texto.slice(0, 1500)}`, data);
            const input = [ctx, `EJERCICIO:\n${JSON.stringify({ titulo: ejercicio.titulo, consigna: ejercicio.consigna, objetivo: ejercicio.objetivo, tecnica: ejercicio.tecnica })}`, `PRÁCTICA DEL AUTOR:\n<<<\n${texto}\n>>>`].join("\n\n");
            const lectura = await generate("revisar", input, data, "TallerRevisar");
            const doc = await pCol(uid).add({ ejercicio: { titulo: clip(ejercicio.titulo, 160), consigna: clip(ejercicio.consigna, 1200), objetivo: clip(ejercicio.objetivo, 600), tecnica: clip(ejercicio.tecnica, 80) }, texto, lectura, palabras: texto.split(/\s+/).filter(Boolean).length, at: new Date().toISOString() });
            return { lectura, id: doc.id };
        }

        if (mode === "preguntar") {
            const pregunta = clip(data.pregunta, 1500).trim();
            if (pregunta.length < 4) throw new HttpsError("invalid-argument", "Escribe tu duda.");
            const historial: { role: string; text: string }[] = (Array.isArray(data.historial) ? data.historial : []).slice(-6).map((m: any) => ({ role: m?.role === "mira" ? "Mira" : "Autor", text: clip(m?.text, 1500) }));
            const ctx = await projectContext(uid, pregunta, data);
            const input = [ctx, historial.length ? `CONVERSACIÓN ANTERIOR:\n${historial.map(m => `${m.role}: ${m.text}`).join("\n")}` : "", `DUDA DEL AUTOR: ${pregunta}`].filter(Boolean).join("\n\n");
            const out = await generate("preguntar", input, data, "TallerPreguntar");
            return { leccion: out };
        }

        throw new HttpsError("invalid-argument", "Modo desconocido.");
    }
);
