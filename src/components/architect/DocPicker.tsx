import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Search, Loader2 } from 'lucide-react';
import { callFunction } from '../../services/api';

// Nov 2026: «Traer un documento». El autor elige un documento de su proyecto y el Arquitecto lo lee completo
// en la conversación. Muestra la carpeta de cada uno para no confundir dos «Capítulo 1» de sagas distintas.

export interface PickedDoc { id: string; name: string; folder: string }
let cache: PickedDoc[] | null = null;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function DocPicker({ picked, onPick, onClose }: { picked: PickedDoc[]; onPick: (d: PickedDoc) => void; onClose: () => void }) {
    const [q, setQ] = useState('');
    const [all, setAll] = useState<PickedDoc[] | null>(cache);
    useEffect(() => {
        callFunction<{ files: { id: string; name: string; path: string }[] }>('worldNames', { mode: 'files' }).then(r => {
            const raw = r?.files || [];
            // Una entrada es carpeta si otra vive dentro de ella (el índice a veces guarda carpetas como archivos).
            const paths = raw.map(f => f.path || f.name);
            const isFolder = (p: string) => paths.some(q => q !== p && q.startsWith(p + '/'));
            const list = raw.filter(f => !isFolder(f.path || f.name))
                .map(f => ({ id: f.id, name: f.name.replace(/\.(md|txt)$/i, ''), folder: f.path.includes('/') ? f.path.replace(/\/[^/]*$/, '').split('/').join(' / ') : '' }))
                .sort((a, b) => (a.folder + '\u0000' + a.name).localeCompare(b.folder + '\u0000' + b.name, 'es'));
            cache = list; setAll(list);
        }).catch(() => setAll([]));
    }, []);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        inputRef.current?.focus();
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', k, true);
        return () => window.removeEventListener('keydown', k, true);
    }, [onClose]);
    const list = useMemo(() => {
        const f = fold(q.trim());
        const src = all || [];
        const hits = f ? src.filter(d => fold(`${d.name} ${d.folder}`).includes(f)) : src;
        return hits.slice(0, 200);
    }, [all, q]);
    const groups = useMemo(() => {
        const m = new Map<string, PickedDoc[]>();
        for (const d of list) m.set(d.folder, [...(m.get(d.folder) || []), d]);
        return [...m.entries()];
    }, [list]);
    // Nov 2026: solo avisa si el mismo nombre está en carpetas distintas (dos entradas en la misma carpeta son el mismo documento indexado dos veces).
    const dupNames = useMemo(() => { const c = new Map<string, Set<string>>(); (all || []).forEach(d => c.set(fold(d.name), new Set([...(c.get(fold(d.name)) || []), d.folder]))); return new Map([...c].map(([k, v]) => [k, v.size])); }, [all]);

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-titanium-950/55 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
            <div role="dialog" aria-modal="true" aria-labelledby="docpick-title" className="relative w-full max-w-[600px] max-h-[80vh] flex flex-col rounded-2xl border border-titanium-700 bg-titanium-950 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-titanium-800">
                    <img src="/assets/objetos/icono/fichero.png" alt="" width={32} height={32} className="w-8 h-8 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0 flex-1">
                        <h2 id="docpick-title" className="font-serif text-lg text-titanium-100">Traer un documento</h2>
                        <p className="text-sm text-titanium-400">El Arquitecto lo lee completo y lo tiene en cuenta en esta conversación (hasta 3).</p>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800"><X size={18} aria-hidden="true" /></button>
                </div>
                <div className="px-5 py-3 border-b border-titanium-800">
                    <label className="relative block">
                        <span className="sr-only">Buscar documento</span>
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-titanium-500" aria-hidden="true" />
                        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Busca por nombre o carpeta…" autoComplete="off" spellCheck={false}
                            className="w-full rounded-xl bg-titanium-900 border border-titanium-700 pl-9 pr-3 py-2.5 text-[15px] text-titanium-100 placeholder:text-titanium-500 focus:border-mira/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/30" />
                    </label>
                </div>
                <ul className="overflow-y-auto overscroll-contain px-2 py-2">
                    {all === null && <li className="px-3 py-4 text-sm text-titanium-400 flex items-center gap-2"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Buscando tus documentos…</li>}
                    {all !== null && list.length === 0 && <li className="px-3 py-4 text-sm text-titanium-400">No encontré documentos con ese nombre.</li>}
                    {groups.map(([folder, docs]) => (
                        <li key={folder || '_raiz'} className="mb-1">
                            <div className="sticky top-0 z-10 flex items-center gap-2 bg-titanium-950 px-3 pt-2 pb-1 text-xs text-titanium-300">
                                <img src="/assets/objetos/icono/fichero.png" alt="" width={14} height={14} className="w-3.5 h-3.5 opacity-80" style={{ imageRendering: 'pixelated' }} />
                                <span className="truncate">{folder || 'Raíz del proyecto'}</span>
                                <span className="text-titanium-500 tabular-nums">{docs.length}</span>
                            </div>
                            <ul>
                                {docs.map(d => {
                                    const already = picked.some(p => p.id === d.id);
                                    const full = picked.length >= 3 && !already;
                                    const dup = (dupNames.get(fold(d.name)) || 0) > 1;
                                    return (
                                        <li key={d.id}>
                                            <button disabled={already || full} onClick={() => { onPick(d); onClose(); }}
                                                className="w-full flex items-start gap-3 rounded-xl pl-7 pr-3 py-2 text-left hover:bg-titanium-800/70 disabled:opacity-50 disabled:hover:bg-transparent">
                                                <FileText size={15} className="text-mira mt-0.5 shrink-0" aria-hidden="true" />
                                                <span className="min-w-0">
                                                    <span className="block text-[15px] text-titanium-100 truncate">{d.name}</span>
                                                    {(dup || already) && (
                                                        <span className={`block text-xs ${dup ? 'text-amber-200' : 'text-titanium-400'}`}>
                                                            {dup ? 'Hay otro documento con el mismo nombre en otra carpeta' : ''}{dup && already ? ' · ' : ''}{already ? 'Ya está en la conversación' : ''}
                                                        </span>
                                                    )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </li>
                    ))}
                </ul>
            </div>
        </div>,
        document.body
    );
}
