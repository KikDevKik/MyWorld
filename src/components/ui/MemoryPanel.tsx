/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 */
// Oct 2026: panel "Memoria" — lo que MyWorld recuerda del trabajo con el autor
// (preferencias, decisiones por libro, personajes, pendientes). Se puede corregir y borrar.
import React, { useEffect, useState } from 'react';
import { X, Brain, Trash2, Pencil, Check, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';

interface Line { id: string; text: string; at: string; source?: string; }
interface MemFile { slug: string; name: string; kind: string; description?: string; lines: Line[]; }

const KIND_LABEL: Record<string, string> = {
    preferencias: 'Cómo quieres que te ayuden', libro: 'Libro', pendientes: 'Pendientes', personaje: 'Personaje', otro: 'Otros',
};

export default function MemoryPanel({ onClose, accessToken }: { onClose: () => void; accessToken?: string | null }) {
    const [files, setFiles] = useState<MemFile[] | null>(null);
    const [editing, setEditing] = useState<{ slug: string; id: string; text: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [newText, setNewText] = useState('');

    const load = async () => {
        try {
            const r = await callFunction<{ files: MemFile[] }>('getMemory', {});
            setFiles(r?.files || []);
        } catch { setFiles([]); toast.error('No se pudo cargar la memoria.'); }
    };
    useEffect(() => { load(); }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const act = async (payload: any, okMsg?: string) => {
        setBusy(true);
        try { await callFunction('editMemory', { ...payload, accessToken: accessToken || undefined }); if (okMsg) toast.success(okMsg); await load(); }
        catch { toast.error('No se pudo guardar el cambio.'); }
        finally { setBusy(false); setEditing(null); }
    };

    const total = (files || []).reduce((n, f) => n + f.lines.length, 0);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl w-[38rem] max-w-[94vw] max-h-[82vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-titanium-800">
                    <div className="flex items-center gap-2">
                        <Brain size={16} className="text-purple-400" />
                        <div>
                            <p className="text-sm font-medium text-titanium-100">Memoria</p>
                            <p className="text-[11px] text-titanium-500">Lo que MyWorld recuerda de tu trabajo. El Director y el Arquitecto la leen en cada mensaje.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-titanium-200" aria-label="Cerrar"><X size={16} /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {files === null && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-purple-400" size={18} /></div>}
                    {files && total === 0 && (
                        <p className="text-xs text-titanium-400 leading-relaxed">
                            Todavía no hay nada guardado. A medida que hables con el Director o el Arquitecto, MyWorld irá recordando tus decisiones, cómo quieres que te ayuden y dónde quedaste. También puedes añadir algo a mano abajo.
                        </p>
                    )}
                    {files?.filter(f => f.lines.length > 0).map(f => (
                        <section key={f.slug}>
                            <div className="flex items-baseline justify-between mb-1.5">
                                <h4 className="text-xs font-semibold text-titanium-200">{f.name}</h4>
                                <span className="text-[10px] uppercase tracking-wide text-titanium-600">{KIND_LABEL[f.kind] || f.kind}</span>
                            </div>
                            <ul className="space-y-1">
                                {f.lines.map(l => (
                                    <li key={l.id} className="group flex items-start gap-2 text-xs text-titanium-300 rounded-md px-2 py-1.5 hover:bg-titanium-800/60">
                                        {editing?.id === l.id ? (
                                            <>
                                                <textarea
                                                    value={editing.text}
                                                    onChange={e => setEditing({ ...editing, text: e.target.value })}
                                                    className="flex-1 bg-titanium-950 border border-purple-500/40 rounded px-2 py-1 text-xs text-titanium-100 focus:outline-none"
                                                    rows={2}
                                                    autoFocus
                                                />
                                                <button disabled={busy} onClick={() => act({ slug: f.slug, action: 'edit', lineId: l.id, text: editing.text }, 'Memoria corregida.')} className="text-emerald-400 hover:text-emerald-300 mt-1" aria-label="Guardar"><Check size={14} /></button>
                                                <button onClick={() => setEditing(null)} className="text-titanium-500 hover:text-titanium-300 mt-1" aria-label="Cancelar"><X size={14} /></button>
                                            </>
                                        ) : (
                                            <>
                                                <span className="flex-1 leading-relaxed">{l.text}</span>
                                                <button onClick={() => setEditing({ slug: f.slug, id: l.id, text: l.text })} className="text-titanium-500 hover:text-cyan-400 p-0.5" title="Corregir" aria-label="Corregir"><Pencil size={13} /></button>
                                                <button disabled={busy} onClick={() => act({ slug: f.slug, action: 'delete', lineId: l.id }, 'Olvidado.')} className="text-titanium-500 hover:text-red-400 p-0.5" title="Olvidar (borrar esta línea)" aria-label="Olvidar"><Trash2 size={13} /></button>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>

                <div className="border-t border-titanium-800 px-5 py-3 flex items-center gap-2">
                    <input
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newText.trim()) { act({ action: 'add', slug: 'preferencias-del-autor', name: 'Preferencias del autor', kind: 'preferencias', text: newText }, 'Guardado en la memoria.'); setNewText(''); } }}
                        placeholder="Añadir algo que quieras que siempre recuerde…"
                        className="flex-1 bg-titanium-950 border border-titanium-700 rounded-lg px-3 py-2 text-xs text-titanium-100 placeholder:text-titanium-600 focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                        disabled={!newText.trim() || busy}
                        onClick={() => { act({ action: 'add', slug: 'preferencias-del-autor', name: 'Preferencias del autor', kind: 'preferencias', text: newText }, 'Guardado en la memoria.'); setNewText(''); }}
                        className="px-3 py-2 rounded-lg bg-purple-700/70 hover:bg-purple-600 text-white text-xs disabled:opacity-40 flex items-center gap-1"
                    >
                        {busy ? <><Loader2 size={12} className="animate-spin" /> Guardando…</> : <><Plus size={12} /> Añadir</>}
                    </button>
                </div>
                <p className="px-5 pb-3 text-[10px] text-titanium-600">Hay una copia en la carpeta “_Memoria MyWorld” de tu proyecto (la ves en Obsidian). Edita aquí: los cambios hechos en Obsidian no vuelven a MyWorld.</p>
            </div>
        </div>
    );
}
