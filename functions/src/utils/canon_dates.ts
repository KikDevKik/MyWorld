// Nov 2026: cuándo cambió por última vez cada documento del autor, según el índice.
// Va junto a cada fragmento que lee la IA, para que no corrija al autor con un archivo viejo
// y pueda decir «ese documento no cambia desde octubre».
import { getFirestore } from "firebase-admin/firestore";

/** « · cambió por última vez el 3 oct 2026»; vacío si no hay fecha. */
export function dateTag(iso?: string): string {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return "";
    return ` · cambió por última vez el ${d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
}

/** id del archivo → fecha de su último cambio. Si algo falla devuelve lo que tenga: los fragmentos van sin fecha. */
export async function fileChangeDates(uid: string, fileIds: Array<string | undefined>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = Array.from(new Set(fileIds.filter((x): x is string => !!x && x !== "unknown_id"))).slice(0, 40);
    if (!uid || !ids.length) return out;
    try {
        const col = getFirestore().collection("TDB_Index").doc(uid).collection("files");
        (await getFirestore().getAll(...ids.map(id => col.doc(id)))).forEach(f => {
            const at = String((f.data() as any)?.updatedAt || "");
            if (at) out.set(f.id, at);
        });
    } catch { /* sin fechas */ }
    return out;
}

/** Regla común para las herramientas que reciben fragmentos con fecha. */
export const CANON_DATES_RULE = `[FECHAS DEL CANON Y CONTRADICCIONES]:
- Junto al nombre de cada documento puede venir cuándo cambió por última vez. Es contexto para ti, no algo que recitar en cada respuesta.
- Si lo que el autor acaba de decir contradice un fragmento, no decidas tú quién tiene razón: pon las dos cosas juntas y pregunta cuál vale. Si el documento lleva semanas o meses sin cambiar, dilo («ese documento no cambia desde octubre»): lo más probable es que él ya cambió de idea y el archivo quedó atrás.
- Si dos documentos se contradicen entre sí, no elijas uno en silencio: muéstraselo como hallazgo en una línea, con el nombre de cada documento y su fecha si la tienes.
- Para afirmar «en X dice…», la frase tiene que estar en el fragmento. Si lo deduces o lo recuerdas a medias, dilo como duda.`;
