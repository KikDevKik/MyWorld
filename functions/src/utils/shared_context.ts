// Nov 2026: lo que las herramientas se cuentan entre sí al momento, sin esperar al índice ni a la memoria.
//  - «reciente»: lo último que el autor dijo o decidió en cada herramienta (Mira no sabía lo hablado con el Arquitecto).
//  - «correcciones»: lo que el autor ya le corrigió a la IA («eso no lo dije», una línea que borró de una nota).
// Todo vive en un solo documento por autor, corto, y no cuesta ninguna llamada a la IA.
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export type Tool = "mira" | "arquitecto" | "ideas" | "estudio";
const TOOL_NAME: Record<Tool, string> = { mira: "Mira", arquitecto: "el Arquitecto", ideas: "Ideas (no canon)", estudio: "El estudio" };
interface Item { at: string; tool: Tool; text: string }

const MAX_RECENT = 14, MAX_CORRECTIONS = 25, RECENT_DAYS = 10;
const ref = (uid: string) => getFirestore().collection("users").doc(uid).collection("profile").doc("shared_context");
const clip = (s: string, n: number) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; };

async function push(uid: string, field: "recent" | "corrections", items: Item[], max: number) {
    if (!uid || !items.length) return;
    try {
        await getFirestore().runTransaction(async tx => {
            const snap = await tx.get(ref(uid));
            const cur: Item[] = Array.isArray((snap.data() as any)?.[field]) ? (snap.data() as any)[field] : [];
            const fresh = items.filter(i => i.text && !cur.some(c => c.text === i.text));
            if (!fresh.length) return;
            tx.set(ref(uid), { [field]: [...cur, ...fresh].slice(-max), updatedAt: new Date().toISOString() }, { merge: true });
        });
    } catch (e: any) {
        logger.warn(`[SHARED] No pude guardar ${field}: ${e?.message}`);
    }
}

/** El autor corrige a la IA con estas fórmulas en cualquier herramienta. */
const CORRECTION = /\b(eso no lo dije|yo no dije|nunca dije|no dije eso|no he dicho|eso (te )?lo inventaste|te lo inventaste|te (lo )?est[aá]s inventando|no es as[ií]|est[aá]s equivocad[ao]|te equivocas|te confundiste|eso no es canon|eso no est[aá] en mi)\b/i;

/** Anota lo que el autor acaba de decir en una herramienta; si además corrige a la IA, lo guarda como corrección. */
export async function noteAuthorMessage(uid: string, tool: Tool, message: string): Promise<void> {
    const text = clip(message, 420);
    if (text.length < 25) {
        if (CORRECTION.test(message)) await push(uid, "corrections", [{ at: new Date().toISOString(), tool, text: `El autor dijo: «${clip(message, 300)}»` }], MAX_CORRECTIONS);
        return;
    }
    const now = new Date().toISOString();
    await push(uid, "recent", [{ at: now, tool, text }], MAX_RECENT);
    if (CORRECTION.test(message)) await push(uid, "corrections", [{ at: now, tool, text: `El autor dijo: «${clip(message, 300)}»` }], MAX_CORRECTIONS);
}

/** Algo que quedó decidido o guardado (un punto de la agenda cerrado, una idea guardada). */
export async function noteDecision(uid: string, tool: Tool, text: string): Promise<void> {
    await push(uid, "recent", [{ at: new Date().toISOString(), tool, text: clip(text, 420) }], MAX_RECENT);
}

/** Una corrección explícita del autor a la IA. */
export async function addCorrections(uid: string, tool: Tool, texts: string[]): Promise<void> {
    const now = new Date().toISOString();
    await push(uid, "corrections", texts.map(t => ({ at: now, tool, text: clip(t, 320) })).filter(i => i.text.length > 8), MAX_CORRECTIONS);
}

function ago(iso: string): string {
    const h = (Date.now() - new Date(iso).getTime()) / 3.6e6;
    if (h < 1) return "hace un rato";
    if (h < 24) return `hace ${Math.round(h)} h`;
    const d = Math.round(h / 24);
    return d === 1 ? "ayer" : `hace ${d} días`;
}

/** Bloque para el contexto de una herramienta: lo reciente de LAS OTRAS y las correcciones del autor. */
export async function sharedContext(uid: string, self: Tool): Promise<string> {
    try {
        const d: any = (await ref(uid).get()).data() || {};
        const since = Date.now() - RECENT_DAYS * 864e5;
        const recent: Item[] = (Array.isArray(d.recent) ? d.recent : []).filter((i: Item) => i.tool !== self && new Date(i.at).getTime() > since).slice(-7).reverse();
        const corrections: Item[] = (Array.isArray(d.corrections) ? d.corrections : []).slice(-12).reverse();
        const out: string[] = [];
        if (recent.length) out.push(`LO ÚLTIMO QUE EL AUTOR HABLÓ EN OTRAS HERRAMIENTAS (lo más reciente primero; son sus palabras o lo que dejó decidido, y puede no estar aún en sus archivos ni en la memoria. Úsalo para no preguntarle lo que ya resolvió allí; lo de Ideas sigue siendo no canon):\n${recent.map(i => `- [${TOOL_NAME[i.tool]}, ${ago(i.at)}] ${i.text}`).join("\n")}`);
        if (corrections.length) out.push(`CORRECCIONES QUE EL AUTOR YA LE HIZO A LA IA (no repitas estos errores; si vas a rozar uno, compruébalo antes):\n${corrections.map(i => `- ${i.text}`).join("\n")}`);
        return out.join("\n\n");
    } catch {
        return "";
    }
}
