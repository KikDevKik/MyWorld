// Nov 2026: una sola fuente de lo decidido. Las misiones del roadmap (lo que el autor decidió con el Arquitecto)
// se guardaban en users/uid/plan/current pero ninguna IA las leía: Mira y el Arquitecto no sabían, por ejemplo,
// que el autor había decidido «culpa dudosa» o quién iba en el bote. Ahora entran en su contexto, con lo ya hecho
// marcado, y el reporte del capítulo marca solo las misiones que el capítulo cumple.
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";

const planRef = (uid: string) => getFirestore().collection("users").doc(uid).collection("plan").doc("current");

export interface PlanState { missions: string[]; done: number[]; libro?: string }

export async function loadPlan(uid: string): Promise<PlanState | null> {
    try {
        const d: any = (await planRef(uid).get()).data();
        if (!d || !Array.isArray(d.missions) || !d.missions.length) return null;
        return { missions: d.missions.map(String), done: Array.isArray(d.done) ? d.done.map(Number) : [], libro: d.libro || "" };
    } catch { return null; }
}

/** Texto para el contexto de una IA. Vacío si no hay plan. */
export async function planContext(uid: string): Promise<string> {
    const p = await loadPlan(uid);
    if (!p) return "";
    const lines = p.missions.map((m, i) => `${i + 1}. [${p.done.includes(i) ? "hecho" : "pendiente"}] ${m}`);
    return `PLAN DEL LIBRO${p.libro ? ` (${p.libro})` : ""}: lo que el autor decidió con el Arquitecto, convertido en misiones. Es lo decidido: respétalo, no lo vuelvas a preguntar como si no existiera; si algo que el autor dice o escribe lo contradice, pregúntale si cambió de idea.\n${lines.join("\n")}`;
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
