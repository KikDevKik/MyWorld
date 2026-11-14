// Nov 2026: una sola fuente de lo decidido. Las misiones del roadmap (lo que el autor decidió con el Arquitecto)
// se guardaban en users/uid/plan/current pero ninguna IA las leía: Mira y el Arquitecto no sabían, por ejemplo,
// que el autor había decidido «culpa dudosa» o quién iba en el bote. Ahora entran en su contexto, con lo ya hecho
// marcado, y el reporte del capítulo marca solo las misiones que el capítulo cumple.
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

const planRef = (uid: string) => getFirestore().collection("users").doc(uid).collection("plan").doc("current");

export interface Redo { doc: string; motivo: string; at?: string; hecho?: boolean }
export interface PlanState { missions: string[]; done: number[]; libro?: string; rehacer: Redo[]; reemplaza: string[]; reemplazaAt?: string }

export async function loadPlan(uid: string): Promise<PlanState | null> {
    try {
        const d: any = (await planRef(uid).get()).data();
        if (!d || !Array.isArray(d.missions) || !d.missions.length) return null;
        return {
            missions: d.missions.map(String), done: Array.isArray(d.done) ? d.done.map(Number) : [], libro: d.libro || "",
            rehacer: (Array.isArray(d.rehacer) ? d.rehacer : []).filter((r: any) => r?.doc && !r.hecho && (!r.at || Date.now() - new Date(r.at).getTime() < 90 * 864e5)).map((r: any) => ({ doc: String(r.doc), motivo: String(r.motivo || ""), at: r.at })),
            reemplaza: Array.isArray(d.reemplaza) ? d.reemplaza.map(String) : [], reemplazaAt: d.reemplazaAt || "",
        };
    } catch { return null; }
}

/** Texto para el contexto de una IA. Vacío si no hay plan. */
export async function planContext(uid: string): Promise<string> {
    const p = await loadPlan(uid);
    if (!p) return "";
    const lines = p.missions.map((m, i) => `${i + 1}. [${p.done.includes(i) ? "hecho" : "pendiente"}] ${m}`);
    const base = `PLAN DEL LIBRO${p.libro ? ` (${p.libro})` : ""}: lo que el autor decidió con el Arquitecto, convertido en misiones. Es lo decidido: respétalo, no lo vuelvas a preguntar como si no existiera; si algo que el autor dice o escribe lo contradice, pregúntale si cambió de idea.\n${lines.join("\n")}`;
    const extra: string[] = [];
    // Nov 2026: lo que el autor decidió volver a escribir. Para que nadie pula ni revise como definitivo un texto que va a reemplazar.
    if (p.rehacer.length) extra.push(`TEXTOS QUE EL AUTOR DECIDIÓ REHACER O DESCARTAR (con el Arquitecto):\n${p.rehacer.map(r => `- «${r.doc}»${r.motivo ? `: ${r.motivo}` : ""}`).join("\n")}\nSi el autor tiene abierto uno de esos textos, te pregunta por él o te pide revisarlo, dile primero y en una línea que quedó en rehacerlo y por qué, y pregúntale si quiere seguir con la versión vieja o empezar la nueva. No lo trates como texto definitivo ni lo uses como canon de lo que pasa en el libro.`);
    if (p.reemplaza.length) extra.push(`DECISIONES QUE CAMBIARON EN LA ÚLTIMA SESIÓN CON EL ARQUITECTO (vale lo nuevo; si un documento o la memoria aún dice lo anterior, está atrasado):\n${p.reemplaza.map(r => `- ${r}`).join("\n")}`);
    return [base, ...extra].join("\n\n");
}

/** Marca misiones como hechas (índices base 0). */
export async function markMissionsDone(uid: string, indices: number[]): Promise<void> {
    const p = await loadPlan(uid);
    if (!p || !indices.length) return;
    const valid = indices.filter(i => Number.isInteger(i) && i >= 0 && i < p.missions.length);
    if (!valid.length) return;
    const done = [...new Set([...p.done, ...valid])].sort((a, b) => a - b);
    try { await planRef(uid).set({ done, doneAt: new Date().toISOString() }, { merge: true }); }
    catch (e: any) { logger.warn(`[PLAN] No se pudieron marcar misiones: ${e?.message}`); }
}
