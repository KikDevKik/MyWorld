// Nov 2026: focos de oficio. Cuando Mira o el Arquitecto notan (con evidencia) algo de oficio que al autor le cuesta,
// o el autor lo dice («sé que debo mejorar en tercera persona cercana»), le dan un punto de partida en la misma
// respuesta y lo anotan aquí. La biblioteca lo muestra en «Para ti» (lección hecha para él + práctica) y el
// escritorio lo recuerda entre los pendientes. Es andamio, no regla: el autor decide si lo practica o lo quita.
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export const craftCol = (uid: string) => getFirestore().collection("users").doc(uid).collection("craft");

export interface CraftNote { tema: string; porque: string; paso: string }

export const CRAFT_RULE = `OFICIO (aprender mientras escribe):
Si en lo que el autor escribe o dice ves una dificultad de oficio concreta y con evidencia (algo que se repite en su texto, o que él mismo nombra, como «sé que debo mejorar en tercera persona cercana»), además de responder a lo que pidió:
1. Dale un punto de partida concreto: qué hacer primero y un ejemplo breve inventado por ti (2 a 4 líneas, con otros personajes; nunca reescribas su prosa ni escribas su escena).
2. Invítalo, en una frase, a practicarlo en la biblioteca (pestaña «Para ti»).
3. Anótalo en una línea aparte, que el autor no ve, ANTES de cualquier otra línea oculta:
[[OFICIO]] {"tema":"nombre corto del tema","porque":"la evidencia en una frase (qué viste o qué dijo)","paso":"el primer paso en una frase"}
Como máximo uno por respuesta. Si el tema ya está en FOCOS DE OFICIO, no lo anotes otra vez salvo que el paso cambie. Si el autor está en otra cosa urgente, basta una frase; no conviertas la conversación en una clase. Sin evidencia, no anotes nada.`;

const ONE_LINE = /\[\[OFICIO\]\]\s*(\{[^\n]*\})/;
export function splitCraft(text: string): { text: string; craft: CraftNote | null } {
    const m = String(text || "").match(ONE_LINE);
    if (!m) return { text, craft: null };
    const clean = text.replace(m[0], "").replace(/\n{3,}/g, "\n\n").trim();
    try {
        const j = JSON.parse(m[1]);
        const tema = String(j.tema || "").trim().slice(0, 80);
        if (!tema) return { text: clean, craft: null };
        return { text: clean, craft: { tema, porque: String(j.porque || "").trim().slice(0, 300), paso: String(j.paso || "").trim().slice(0, 300) } };
    } catch { return { text: clean, craft: null }; }
}

export const craftId = (tema: string) => tema.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "tema";

export async function saveCraft(uid: string, c: CraftNote, source: "mira" | "arquitecto" | "autor" | "reporte") {
    try {
        const ref = craftCol(uid).doc(craftId(c.tema));
        const prev = await ref.get();
        const now = new Date().toISOString();
        await ref.set({
            tema: c.tema,
            ...(c.porque ? { porque: c.porque } : {}),
            ...(c.paso ? { paso: c.paso } : {}),
            source: prev.exists ? (prev.data() as any).source : source,
            estado: "activo",
            veces: FieldValue.increment(1),
            updatedAt: now,
            ...(prev.exists ? {} : { createdAt: now }),
        }, { merge: true });
        logger.info(`🎓 [OFICIO] ${uid}: «${c.tema}» (${source})`);
    } catch (e: any) { logger.warn(`[OFICIO] No se guardó: ${e?.message}`); }
}

/** Para los prompts: lo que ya está anotado, para no repetirlo. */
export async function craftContext(uid: string): Promise<string> {
    try {
        const snap = await craftCol(uid).where("estado", "==", "activo").limit(8).get();
        if (snap.empty) return "";
        return "FOCOS DE OFICIO (ya anotados; no los repitas):\n" + snap.docs.map(d => { const x: any = d.data(); return `- ${x.tema}${x.paso ? `: ${x.paso}` : ""}`; }).join("\n");
    } catch { return ""; }
}
