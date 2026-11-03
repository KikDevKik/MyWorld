// Nov 2026: el último documento que el autor ESCRIBIÓ (no solo abrió), por proyecto, para la Casa.
export interface LastDoc { id: string; name: string; at: number; tail: string; words: number }
const key = (folderId?: string) => `mw-last-doc-${folderId || 'proyecto'}`;

export function readLastDoc(folderId?: string): LastDoc | null {
    try {
        const v = JSON.parse(localStorage.getItem(key(folderId)) || 'null');
        return v && v.id ? v as LastDoc : null;
    } catch { return null; }
}

export function writeLastDoc(folderId: string | undefined, doc: { id: string; name: string; content: string }) {
    const text = doc.content || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const v: LastDoc = { id: doc.id, name: (doc.name || 'Documento').replace(/\.md$/i, ''), at: Date.now(), tail: text.trimEnd().slice(-600), words };
    try { localStorage.setItem(key(folderId), JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}
