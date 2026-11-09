import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

// Nov 2026: focos de oficio activos (lo que Mira o el Arquitecto notaron, o lo que el autor quiere mejorar).
export interface CraftFocus { id: string; tema: string; porque?: string; paso?: string; source?: string; estado: string; updatedAt?: string; leccion?: any }

export function useCraftFocus(): CraftFocus[] {
    const [items, setItems] = useState<CraftFocus[]>([]);
    useEffect(() => {
        let unsub: (() => void) | null = null;
        const off = onAuthStateChanged(getAuth(), user => {
            unsub?.(); unsub = null;
            if (!user) { setItems([]); return; }
            const q = query(collection(getFirestore(), 'users', user.uid, 'craft'), where('estado', '==', 'activo'));
            unsub = onSnapshot(q, snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as CraftFocus[];
                list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
                setItems(list);
            }, () => setItems([]));
        });
        return () => { off(); unsub?.(); };
    }, []);
    return items;
}

export const OPEN_BIBLIOTECA_EVENT = 'mw-open-biblioteca';
/** Abre la biblioteca en una pestaña (lo escucha App). */
export function openBiblioteca(tab: 'parati' | 'practicar' | 'aprender' | 'decisiones' = 'parati') {
    try { localStorage.setItem('mw-biblioteca-tab', tab); } catch { /* */ }
    window.dispatchEvent(new CustomEvent(OPEN_BIBLIOTECA_EVENT, { detail: { tab } }));
}
