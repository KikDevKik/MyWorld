import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Trash2, Plus, X } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { callFunction } from '../services/api';
import { useLanguageStore } from '../stores/useLanguageStore';

// Nov 2026: «Conversaciones con Mira». Antes («Archivos de memoria») tardaba en abrir (función en frío),
// mostraba «…» y «- msgs», y borraba con el confirm del navegador. Ahora lee directo de Firestore, muestra
// lo guardado al instante (caché), dice de qué se habló y confirma el borrado en la misma fila.
interface SessionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
}

interface Conv { id: string; updatedAt: number; title: string; snippet: string; count: number | null }

let CACHE: Conv[] | null = null;
const PREVIEW: Record<string, { title: string; count: number }> = {};

const toMs = (v: any): number => {
    if (!v) return 0;
    if (typeof v === 'string') return new Date(v).getTime() || 0;
    if (typeof v?.toDate === 'function') return v.toDate().getTime();
    if (typeof v?.seconds === 'number') return v.seconds * 1000;
    return 0;
};
const clean = (s: string) => String(s || '').replace(/^\s*\[mira:[^\]]+\]\s*/i, '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim();

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({ isOpen, onClose, activeSessionId, onSessionSelect }) => {
    const es = useLanguageStore(s => s.currentLanguage) !== 'en';
    const [items, setItems] = useState<Conv[] | null>(CACHE);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [purgeAsk, setPurgeAsk] = useState(false);
    const [purging, setPurging] = useState(false);
    const closeRef = useRef<HTMLButtonElement>(null);

    const load = async () => {
        const uid = getAuth().currentUser?.uid;
        if (!uid) return;
        try {
            const db = getFirestore();
            const snap = await getDocs(query(collection(db, 'users', uid, 'forge_sessions'), where('type', '==', 'director'), orderBy('updatedAt', 'desc'), limit(60)));
            const list: Conv[] = snap.docs.map(d => {
                const x: any = d.data();
                const pv = PREVIEW[d.id];
                return {
                    id: d.id,
                    updatedAt: Math.max(toMs(x.updatedAt), toMs(x.lastActivity)),
                    title: clean(x.firstUserMessage || pv?.title || ''),
                    snippet: clean(x.lastMessageSnippet || x.preview || ''),
                    count: typeof x.messageCount === 'number' ? x.messageCount : (pv ? pv.count : null),
                };
            }).sort((a, b) => b.updatedAt - a.updatedAt);
            CACHE = list;
            setItems(list);
            // Las conversaciones viejas no guardaban de qué trataban: se lee su primer mensaje (solo las visibles).
            const missing = list.filter(c => !c.title).slice(0, 14);
            await Promise.all(missing.map(async c => {
                try {
                    const m = await getDocs(query(collection(db, 'users', uid, 'forge_sessions', c.id, 'messages'), orderBy('timestamp', 'asc'), limit(4)));
                    const first = m.docs.map(d => d.data() as any).find(v => v.role === 'user' && !String(v.text || '').startsWith('['));
                    PREVIEW[c.id] = { title: clean(first?.text || ''), count: m.size };
                } catch { PREVIEW[c.id] = { title: '', count: 0 }; }
            }));
            if (missing.length) {
                const next = list.map(c => (PREVIEW[c.id] ? { ...c, title: c.title || PREVIEW[c.id].title, count: c.count ?? PREVIEW[c.id].count } : c));
                CACHE = next;
                setItems(next);
            }
        } catch (e) {
            console.error('Conversaciones:', e);
            if (!CACHE) setItems([]);
            toast.error(es ? 'No pude cargar tus conversaciones.' : 'Could not load your conversations.');
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setConfirmId(null); setPurgeAsk(false);
        load();
        closeRef.current?.focus();
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', k, true);
        return () => window.removeEventListener('keydown', k, true);
    }, [isOpen]);

    const groups = useMemo(() => {
        const now = new Date();
        const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startWeek = startToday - 6 * 86400000;
        const g: { label: string; list: Conv[] }[] = [
            { label: es ? 'Hoy' : 'Today', list: [] },
            { label: es ? 'Esta semana' : 'This week', list: [] },
            { label: es ? 'Antes' : 'Earlier', list: [] },
        ];
        for (const c of items || []) (c.updatedAt >= startToday ? g[0] : c.updatedAt >= startWeek ? g[1] : g[2]).list.push(c);
        return g.filter(x => x.list.length);
    }, [items, es]);

    const empties = (items || []).filter(c => c.count === 0 || (c.count !== null && c.count <= 1 && !c.title)).length;

    const when = (ms: number) => {
        if (!ms) return '';
        const d = new Date(ms), now = new Date();
        const sameDay = d.toDateString() === now.toDateString();
        return sameDay ? d.toLocaleTimeString(es ? 'es' : 'en', { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(es ? 'es' : 'en', { day: 'numeric', month: 'short' });
    };

    const remove = async (id: string) => {
        setDeleting(id);
        try {
            await callFunction('deleteForgeSession', { sessionId: id });
            const next = (items || []).filter(c => c.id !== id);
            CACHE = next; setItems(next);
            if (activeSessionId === id) onSessionSelect(null);
        } catch {
            toast.error(es ? 'No pude borrar esa conversación.' : 'Could not delete that conversation.');
        } finally {
            setDeleting(null); setConfirmId(null);
        }
    };

    const purge = async () => {
        setPurging(true);
        try {
            const r = await callFunction<{ deletedCount: number }>('purgeEmptySessions');
            toast.success(es ? `Borré ${r?.deletedCount ?? 0} conversaciones vacías.` : `Deleted ${r?.deletedCount ?? 0} empty conversations.`);
            await load();
        } catch {
            toast.error(es ? 'No pude limpiar las vacías.' : 'Could not clean up empty ones.');
        } finally {
            setPurging(false); setPurgeAsk(false);
        }
    };

    if (!isOpen) return null;
    return (
        <div data-inner-modal="true" className="absolute inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-titanium-950/60" onMouseDown={onClose} aria-hidden="true" />
            <div role="dialog" aria-modal="true" aria-labelledby="conv-title" className="relative w-full max-w-lg max-h-[80%] flex flex-col rounded-2xl border border-titanium-700 bg-titanium-900 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-titanium-800">
                    <div>
                        <h2 id="conv-title" className="font-serif text-lg font-semibold text-titanium-100">{es ? 'Conversaciones con Mira' : 'Conversations with Mira'}</h2>
                        <p className="text-[13px] text-titanium-400">{es ? 'Retoma una o empieza otra.' : 'Pick one up or start another.'}</p>
                    </div>
                    <button ref={closeRef} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'} className="p-2 rounded-lg text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-2">
                    {items === null ? (
                        <div className="space-y-2 p-2" aria-busy="true">{[0, 1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-titanium-800/60 animate-pulse" />)}</div>
                    ) : !items.length ? (
                        <p className="px-3 py-10 text-center text-sm text-titanium-400">{es ? 'Todavía no hay conversaciones guardadas.' : 'No saved conversations yet.'}</p>
                    ) : groups.map(g => (
                        <div key={g.label} className="py-1">
                            <h3 className="px-2 pt-2 pb-1 text-xs font-semibold text-titanium-400">{g.label}</h3>
                            <ul>
                                {g.list.map(c => {
                                    const active = c.id === activeSessionId;
                                    const asking = confirmId === c.id;
                                    return (
                                        <li key={c.id} className={`group relative rounded-xl ${active ? 'bg-mira-bg' : 'hover:bg-titanium-800/70'}`}>
                                            {asking ? (
                                                <div className="flex items-center gap-2 px-3 py-2.5">
                                                    <span className="flex-1 text-sm text-titanium-200">{es ? '¿Borrar esta conversación?' : 'Delete this conversation?'}</span>
                                                    <button onClick={() => remove(c.id)} disabled={deleting === c.id} className="px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-200 text-[13px]">
                                                        {deleting === c.id ? <Loader2 size={13} className="animate-spin" /> : (es ? 'Borrar' : 'Delete')}
                                                    </button>
                                                    <button onClick={() => setConfirmId(null)} className="px-3 py-1.5 rounded-lg text-titanium-300 text-[13px] hover:bg-titanium-700">{es ? 'No' : 'No'}</button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center">
                                                    <button onClick={() => { onSessionSelect(c.id); onClose(); }} className="flex-1 min-w-0 text-left px-3 py-2.5">
                                                        <span className="block text-sm text-titanium-100 truncate">{c.title || c.snippet || (es ? 'Conversación sin mensajes' : 'Empty conversation')}</span>
                                                        <span className="block text-xs text-titanium-400 truncate">
                                                            {active ? (es ? 'Abierta ahora · ' : 'Open now · ') : ''}{when(c.updatedAt)}{c.count != null ? ` · ${c.count} ${es ? (c.count === 1 ? 'mensaje' : 'mensajes') : (c.count === 1 ? 'message' : 'messages')}` : ''}
                                                        </span>
                                                    </button>
                                                    <button onClick={() => setConfirmId(c.id)} aria-label={es ? 'Borrar conversación' : 'Delete conversation'}
                                                        className="mr-2 p-2 rounded-lg text-titanium-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-300 hover:bg-titanium-700 transition-opacity">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-3 px-5 py-3 border-t border-titanium-800">
                    {purgeAsk ? (
                        <span className="flex items-center gap-2 text-[13px] text-titanium-300">
                            {es ? '¿Borrar las vacías?' : 'Delete empty ones?'}
                            <button onClick={purge} disabled={purging} className="text-red-300 hover:underline">{purging ? '…' : (es ? 'Sí' : 'Yes')}</button>
                            <button onClick={() => setPurgeAsk(false)} className="text-titanium-400 hover:underline">{es ? 'No' : 'No'}</button>
                        </span>
                    ) : (
                        <button onClick={() => setPurgeAsk(true)} className="text-[13px] text-titanium-400 hover:text-titanium-200">
                            {es ? `Limpiar las vacías${empties ? ` (${empties})` : ''}` : `Clean up empty ones${empties ? ` (${empties})` : ''}`}
                        </button>
                    )}
                    <button onClick={() => { onSessionSelect(null); onClose(); }} className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-coral text-on-coral px-4 py-2 text-sm font-semibold hover:brightness-110">
                        <Plus size={15} /> {es ? 'Nueva conversación' : 'New conversation'}
                    </button>
                </div>
            </div>
        </div>
    );
};
