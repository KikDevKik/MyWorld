// Nov 2026: el último documento que el autor ESCRIBIÓ (no solo abrió), por proyecto, para la Casa.
// Se guarda en este navegador y también en Firestore (users/uid/user_state/lastDoc_<proyecto>), así «Donde lo
// dejaste» funciona al cambiar de computador o de navegador.
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

export interface LastDoc { id: string; name: string; at: number; tail: string; words: number }
export const LAST_DOC_EVENT = 'mw-lastdoc';
const key = (folderId?: string) => `mw-last-doc-${folderId || 'proyecto'}`;
const remoteId = (folderId?: string) => `lastDoc_${(folderId || 'proyecto').replace(/[^A-Za-z0-9_-]/g, '_')}`;

export function readLastDoc(folderId?: string): LastDoc | null {
    try {
        const v = JSON.parse(localStorage.getItem(key(folderId)) || 'null');
        return v && v.id ? v as LastDoc : null;
    } catch { return null; }
}

let lastRemote = 0;
export function writeLastDoc(folderId: string | undefined, d: { id: string; name: string; content: string }) {
    const text = d.content || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const v: LastDoc = { id: d.id, name: (d.name || 'Documento').replace(/\.md$/i, ''), at: Date.now(), tail: text.trimEnd().slice(-600), words };
    try { localStorage.setItem(key(folderId), JSON.stringify(v)); } catch { /* sin almacenamiento */ }
    // A Firestore como mucho una vez por minuto (el autoguardado llama seguido).
    if (Date.now() - lastRemote < 60_000) return;
    lastRemote = Date.now();
    const uid = getAuth().currentUser?.uid;
    if (!uid) return;
    setDoc(doc(getFirestore(), 'users', uid, 'user_state', remoteId(folderId)), v).catch(() => { /* sin conexión: queda el local */ });
}

/** Trae el último documento guardado en la nube; si es más reciente que el local, lo usa y avisa a la Casa. */
export async function syncLastDoc(folderId?: string): Promise<LastDoc | null> {
    try {
        await getAuth().authStateReady();
        const uid = getAuth().currentUser?.uid;
        if (!uid) return readLastDoc(folderId);
        const snap = await getDoc(doc(getFirestore(), 'users', uid, 'user_state', remoteId(folderId)));
        const remote = snap.exists() ? (snap.data() as LastDoc) : null;
        const local = readLastDoc(folderId);
        if (remote?.id && (!local || remote.at > local.at)) {
            try { localStorage.setItem(key(folderId), JSON.stringify(remote)); } catch { /* sin almacenamiento */ }
            window.dispatchEvent(new CustomEvent(LAST_DOC_EVENT));
            return remote;
        }
        return local;
    } catch { return readLastDoc(folderId); }
}
