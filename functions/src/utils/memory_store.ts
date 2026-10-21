// Oct 2026: Memoria de MyWorld (continuidad del trabajo del autor).
// Firestore: users/{uid}/memory/{slug} = { name, kind, description, lines:[{id,text,at,source}], updatedAt, driveFileId? }
// kind: 'preferencias' | 'libro' | 'personaje' | 'pendientes' | 'otro'
// La memoria NO es canon: guarda decisiones tomadas en conversación, preferencias y dónde quedó el autor.
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export type MemoryKind = 'preferencias' | 'libro' | 'personaje' | 'pendientes' | 'otro';
export interface MemoryLine { id: string; text: string; at: string; source?: string; }
export interface MemoryFile { slug: string; name: string; kind: MemoryKind; description?: string; lines: MemoryLine[]; updatedAt?: string; driveFileId?: string; }

export function memoryCol(uid: string) {
    return getFirestore().collection("users").doc(uid).collection("memory");
}

export function slugify(s: string): string {
    return String(s || "otro").toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "otro";
}

export async function loadAllMemory(uid: string): Promise<MemoryFile[]> {
    const snap = await memoryCol(uid).get();
    return snap.docs.map(d => ({ slug: d.id, ...(d.data() as any), lines: (d.data() as any).lines || [] }));
}

const cache = new Map<string, { at: number; files: MemoryFile[] }>();
export function invalidateMemoryCache(uid: string) { cache.delete(uid); }

async function loadCached(uid: string): Promise<MemoryFile[]> {
    const hit = cache.get(uid);
    if (hit && Date.now() - hit.at < 30_000) return hit.files;
    const files = await loadAllMemory(uid);
    cache.set(uid, { at: Date.now(), files });
    return files;
}

function render(f: MemoryFile): string {
    return `## ${f.name}${f.description ? ` — ${f.description}` : ""}\n` + f.lines.map(l => `- ${l.text}`).join("\n");
}

/**
 * Contexto de memoria para una conversación.
 * Siempre: preferencias, pendientes y libros. Personajes: solo los mencionados en `hint`.
 */
export async function getMemoryContext(uid: string | undefined, hint: string): Promise<string> {
    if (!uid) return "";
    try {
        const files = (await loadCached(uid)).filter(f => f.lines.length > 0);
        if (!files.length) return "";
        const h = (hint || "").toLowerCase();
        const always = files.filter(f => f.kind !== 'personaje');
        const chars = files.filter(f => f.kind === 'personaje' && f.name && h.includes(f.name.toLowerCase().replace(/^personaje:?\s*/i, "").split(" ")[0]));
        const text = [...always, ...chars].map(render).join("\n\n").slice(0, 8000);
        if (!text.trim()) return "";
        return `[MEMORIA DE MYWORLD — continuidad del trabajo con este autor: sus preferencias, decisiones tomadas en conversaciones anteriores y dónde quedó. Úsala para no hacerle repetir nada. No es canon: si contradice el canon, señálalo.]\n${text}`;
    } catch (e: any) {
        logger.warn(`[MEMORY] No se pudo leer: ${e?.message}`);
        return "";
    }
}

export function newLineId(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export interface MemoryOp {
    op: 'add' | 'update' | 'remove';
    file: string;           // nombre legible del archivo (ej. "Libro de Anna")
    kind?: MemoryKind;
    description?: string;
    text?: string;          // texto nuevo (add/update)
    lineId?: string;        // línea a cambiar (update/remove)
}

export interface AppliedOp { op: string; slug: string; fileName: string; lineId: string; text: string; previousText?: string; }

export async function applyMemoryOps(uid: string, ops: MemoryOp[], source: string): Promise<AppliedOp[]> {
    const col = memoryCol(uid);
    const applied: AppliedOp[] = [];
    for (const o of ops.slice(0, 4)) {
        if (!o || !o.file) continue;
        const slug = slugify(o.file);
        const ref = col.doc(slug);
        await getFirestore().runTransaction(async tx => {
            const snap = await tx.get(ref);
            const cur: any = snap.exists ? snap.data() : { name: o.file, kind: o.kind || 'otro', description: o.description || "", lines: [] };
            const lines: MemoryLine[] = cur.lines || [];
            const now = new Date().toISOString();
            if (o.op === 'add' && o.text?.trim()) {
                if (lines.some(l => l.text.trim().toLowerCase() === o.text!.trim().toLowerCase())) return;
                const id = newLineId();
                lines.push({ id, text: o.text.trim().slice(0, 500), at: now, source });
                applied.push({ op: 'add', slug, fileName: cur.name, lineId: id, text: o.text.trim() });
            } else if (o.op === 'update' && o.lineId && o.text?.trim()) {
                const l = lines.find(x => x.id === o.lineId);
                if (!l) return;
                applied.push({ op: 'update', slug, fileName: cur.name, lineId: l.id, text: o.text.trim(), previousText: l.text });
                l.text = o.text.trim().slice(0, 500); l.at = now; l.source = source;
            } else if (o.op === 'remove' && o.lineId) {
                const i = lines.findIndex(x => x.id === o.lineId);
                if (i < 0) return;
                applied.push({ op: 'remove', slug, fileName: cur.name, lineId: lines[i].id, text: lines[i].text, previousText: lines[i].text });
                lines.splice(i, 1);
            } else return;
            tx.set(ref, {
                name: cur.name || o.file, kind: cur.kind || o.kind || 'otro',
                description: cur.description || o.description || "",
                lines, updatedAt: now,
            }, { merge: true });
        });
    }
    invalidateMemoryCache(uid);
    return applied;
}

/** Deshace operaciones aplicadas (botón "Deshacer" del aviso). */
export async function undoMemoryOps(uid: string, applied: AppliedOp[]): Promise<number> {
    let n = 0;
    for (const a of applied) {
        const ref = memoryCol(uid).doc(a.slug);
        await getFirestore().runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const lines: MemoryLine[] = (snap.data() as any).lines || [];
            if (a.op === 'add') {
                const i = lines.findIndex(l => l.id === a.lineId); if (i >= 0) { lines.splice(i, 1); n++; }
            } else if (a.op === 'update') {
                const l = lines.find(x => x.id === a.lineId); if (l && a.previousText) { l.text = a.previousText; n++; }
            } else if (a.op === 'remove' && a.previousText) {
                lines.push({ id: a.lineId, text: a.previousText, at: new Date().toISOString(), source: 'deshacer' }); n++;
            }
            tx.set(ref, { lines, updatedAt: new Date().toISOString() }, { merge: true });
        });
    }
    invalidateMemoryCache(uid);
    return n;
}

export function memoryFileToMarkdown(f: MemoryFile): string {
    return `# ${f.name}\n\n${f.description ? `_${f.description}_\n\n` : ""}` +
        f.lines.map(l => `- ${l.text}`).join("\n") +
        `\n\n---\n_Memoria de MyWorld. Se edita desde el panel "Memoria" de la app; los cambios hechos aquí no vuelven a MyWorld._\n`;
}

export { FieldValue };
