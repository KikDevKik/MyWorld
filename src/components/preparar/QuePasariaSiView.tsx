// Oct 2026: «Qué pasaría si» — espacio no canon dentro de Preparar (antes: Laboratorio de ideas).
// Conversación libre para imaginar; las ideas que el autor quiere conservar se guardan como notas
// en Recursos/«Ideas (no canon)» de su Drive (visibles en Obsidian).
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, Sparkles, Bookmark, RotateCcw, BookOpen, Lightbulb, X, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';

interface Msg { role: 'user' | 'assistant'; text: string; at?: string }
interface RefFile { id: string; name: string; path: string }
interface Idea { id: string; name: string; modifiedTime?: string }

interface Props {
    accessToken: string | null;
    onOpenFile?: (fileId: string) => void;
}

const STARTERS = [
    '¿Qué pasaría si el villano tuviera razón?',
    'Mezcla mi sistema de poderes con algo de una de mis series favoritas',
    'Una escena que me encantaría escribir aunque no sé dónde va',
];

export default function QuePasariaSiView({ accessToken, onOpenFile }: Props) {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [refs, setRefs] = useState<RefFile[]>([]);
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [thinking, setThinking] = useState(false);
    const [draft, setDraft] = useState<{ titulo: string; cuerpo: string } | null>(null);
    const [preparing, setPreparing] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [refFilter, setRefFilter] = useState('');
    const endRef = useRef<HTMLDivElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        let alive = true;
        callFunction<any>('whatIf', { mode: 'load' })
            .then(r => { if (alive) { setMessages(r?.messages || []); setRefs(r?.references || []); } })
            .catch(() => {})
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, []);

    const loadIdeas = () => {
        if (!accessToken) return;
        callFunction<any>('whatIf', { mode: 'listIdeas', accessToken }).then(r => setIdeas(r?.ideas || [])).catch(() => {});
    };
    useEffect(loadIdeas, [accessToken]);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length, thinking]);

    const send = async (text?: string) => {
        const message = (text ?? input).trim();
        if (!message || thinking) return;
        setInput('');
        setMessages(m => [...m, { role: 'user', text: message }]);
        setThinking(true);
        try {
            const r = await callFunction<any>('whatIf', { mode: 'send', message, refIds: selected, accessToken }, { timeout: 180000 });
            setMessages(r?.messages || []);
        } catch (e: any) {
            toast.error(e?.message || 'No pude responder.');
            setMessages(m => m.slice(0, -1));
            setInput(message);
        } finally {
            setThinking(false);
            setTimeout(() => taRef.current?.focus(), 50);
        }
    };

    const prepareIdea = async (upTo: number) => {
        setPreparing(upTo);
        try {
            const r = await callFunction<any>('whatIf', { mode: 'distill', upTo }, { timeout: 120000 });
            setDraft({ titulo: r.titulo, cuerpo: r.cuerpo });
        } catch (e: any) {
            toast.error(e?.message || 'No pude preparar la nota.');
        } finally {
            setPreparing(null);
        }
    };

    const saveIdea = async () => {
        if (!draft) return;
        setSaving(true);
        try {
            const r = await callFunction<any>('whatIf', { mode: 'saveIdea', titulo: draft.titulo, cuerpo: draft.cuerpo, accessToken }, { timeout: 120000 });
            setIdeas(prev => [r.idea, ...prev.filter(i => i.id !== r.idea.id)]);
            setDraft(null);
            toast.success('Idea guardada en Recursos → Ideas (no canon).', { description: 'También la verás en Obsidian.' });
        } catch (e: any) {
            toast.error(e?.message || 'No pude guardar la idea.');
        } finally {
            setSaving(false);
        }
    };

    const reset = async () => {
        if (!messages.length) return;
        if (!window.confirm('¿Empezar una conversación nueva? Las ideas que guardaste se quedan en Recursos.')) return;
        try { await callFunction('whatIf', { mode: 'reset' }); setMessages([]); } catch { toast.error('No pude reiniciar.'); }
    };

    const toggleRef = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : (s.length >= 3 ? (toast.info('Hasta 3 referencias a la vez.'), s) : [...s, id]));
    const shownRefs = refs.filter(r => !refFilter || r.name.toLowerCase().includes(refFilter.toLowerCase()) || r.path.toLowerCase().includes(refFilter.toLowerCase()));

    return (
        <div className="h-full w-full flex overflow-hidden bg-[#0b0a09] bg-[radial-gradient(circle_at_40%_20%,#1d1913_0%,#0b0a09_75%)]">
            {/* Conversación */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="shrink-0 border-b border-amber-900/30 px-6 py-2.5 flex items-center gap-2 text-[12px] text-amber-200/80">
                    <Lightbulb size={14} className="text-amber-400" />
                    <span>Aquí nada es canon. Imagina sin miedo: lo que quieras conservar se guarda en <b>Recursos → Ideas (no canon)</b>.</span>
                    <button onClick={reset} disabled={!messages.length} className="ml-auto inline-flex items-center gap-1 rounded px-2 py-1 text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800/60 disabled:opacity-30" title="Conversación nueva">
                        <RotateCcw size={12} /> Nueva
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[760px] mx-auto px-8 py-8 space-y-6">
                        {loading ? (
                            <div className="flex justify-center py-20 text-titanium-500"><Loader2 className="animate-spin" size={18} /></div>
                        ) : !messages.length ? (
                            <div className="py-14 text-center space-y-5">
                                <Sparkles size={28} className="mx-auto text-amber-400/80" />
                                <div>
                                    <p className="text-lg text-titanium-100">¿Qué pasaría si…?</p>
                                    <p className="mt-1 text-sm text-titanium-500">Lanza una idea, una mezcla o una escena que te persigue. Jugamos con ella y, si te gusta, la guardas.</p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {STARTERS.map(s => (
                                        <button key={s} onClick={() => setInput(s)} className="rounded-full border border-amber-800/40 bg-amber-950/20 px-3 py-1.5 text-[12px] text-amber-100/80 hover:bg-amber-900/30">{s}</button>
                                    ))}
                                </div>
                            </div>
                        ) : messages.map((m, i) => (
                            m.role === 'user' ? (
                                <div key={i} className="flex justify-end">
                                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-titanium-800/70 px-4 py-2.5 text-[14px] text-titanium-100 whitespace-pre-wrap">{m.text}</div>
                                </div>
                            ) : (
                                <div key={i} className="group">
                                    <div className="prose prose-invert prose-sm max-w-none text-titanium-200 prose-p:leading-relaxed prose-strong:text-amber-100">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown>
                                    </div>
                                    <button onClick={() => prepareIdea(i)} disabled={preparing !== null} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-800/40 px-2.5 py-1 text-[11px] text-amber-200/80 hover:bg-amber-900/20 disabled:opacity-40">
                                        {preparing === i ? <Loader2 size={11} className="animate-spin" /> : <Bookmark size={11} />} Guardar como idea
                                    </button>
                                </div>
                            )
                        ))}
                        {thinking && <div className="flex items-center gap-2 text-titanium-500 text-sm"><Loader2 size={14} className="animate-spin text-amber-400" /> Imaginando…</div>}
                        <div ref={endRef} />
                    </div>
                </div>

                <div className="shrink-0 border-t border-titanium-800/70 px-6 py-4">
                    <div className="max-w-[760px] mx-auto">
                        {!!selected.length && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {selected.map(id => {
                                    const r = refs.find(x => x.id === id);
                                    return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-900/30 px-2 py-0.5 text-[11px] text-amber-100">{r?.name || id}<button onClick={() => toggleRef(id)}><X size={10} /></button></span>;
                                })}
                            </div>
                        )}
                        <div className="flex items-end gap-2 rounded-xl border border-titanium-700 bg-titanium-900/80 px-3 py-2 focus-within:border-amber-700/60">
                            <textarea
                                ref={taRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                                placeholder="¿Qué pasaría si…?"
                                className="flex-1 resize-none bg-transparent text-[14px] text-titanium-100 placeholder:text-titanium-600 outline-none py-1"
                            />
                            <button onClick={() => send()} disabled={!input.trim() || thinking} className="p-2 rounded-lg bg-amber-700/80 text-white hover:bg-amber-600 disabled:opacity-30" aria-label="Enviar">
                                {thinking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lateral: ideas guardadas y referencias */}
            <aside className="w-72 shrink-0 border-l border-titanium-800/70 bg-[#0d0c0b]/80 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-titanium-800/70 max-h-[45%] overflow-y-auto">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><Bookmark size={12} /> Ideas guardadas</p>
                    {!ideas.length ? (
                        <p className="mt-2 text-[12px] text-titanium-600">Aún no hay. Usa «Guardar como idea» debajo de una respuesta.</p>
                    ) : (
                        <ul className="mt-2 space-y-1">
                            {ideas.map(i => (
                                <li key={i.id}>
                                    <button onClick={() => onOpenFile?.(i.id)} className="w-full flex items-center gap-1.5 rounded px-2 py-1 text-left text-[12px] text-titanium-300 hover:bg-titanium-800/60" title="Abrir en el editor">
                                        <FileText size={11} className="shrink-0 text-amber-500/70" /><span className="truncate">{i.name}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="p-4 flex-1 overflow-y-auto">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><BookOpen size={12} /> Tus referencias</p>
                    <p className="mt-1 text-[11px] text-titanium-600">Marca hasta 3 para que entren completas en la conversación.</p>
                    {refs.length > 8 && (
                        <input value={refFilter} onChange={e => setRefFilter(e.target.value)} placeholder="Buscar…" className="mt-2 w-full rounded-md border border-titanium-800 bg-titanium-950 px-2 py-1 text-[12px] text-titanium-200 outline-none focus:border-amber-800" />
                    )}
                    {loading ? (
                        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-titanium-600"><Loader2 size={11} className="animate-spin" /> Cargando…</p>
                    ) : !refs.length ? (
                        <p className="mt-2 text-[12px] text-titanium-600">No encontré archivos de Recursos en el índice. Pulsa «Sincronizar» en el explorador.</p>
                    ) : (
                        <ul className="mt-2 space-y-0.5">
                            {shownRefs.map(r => (
                                <li key={r.id}>
                                    <label className="flex items-center gap-2 rounded px-2 py-1 text-[12px] text-titanium-300 hover:bg-titanium-800/50 cursor-pointer" title={r.path}>
                                        <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleRef(r.id)} className="accent-amber-600" />
                                        <span className="truncate">{r.name}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </aside>

            {/* Nota de idea (editable antes de guardar) */}
            {draft && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-2xl rounded-xl border border-amber-900/40 bg-titanium-900 shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between border-b border-titanium-800 px-5 py-3">
                            <p className="text-sm font-medium text-titanium-100">Guardar idea (no canon)</p>
                            <button onClick={() => setDraft(null)} className="text-titanium-500 hover:text-titanium-200"><X size={16} /></button>
                        </div>
                        <div className="p-5 space-y-3 overflow-y-auto">
                            <input value={draft.titulo} onChange={e => setDraft({ ...draft, titulo: e.target.value })} className="w-full rounded-md border border-titanium-700 bg-titanium-950 px-3 py-2 text-[14px] text-titanium-100 outline-none focus:border-amber-700" />
                            <textarea value={draft.cuerpo} onChange={e => setDraft({ ...draft, cuerpo: e.target.value })} rows={16} className="w-full rounded-md border border-titanium-700 bg-titanium-950 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-titanium-200 outline-none focus:border-amber-700" />
                            <p className="text-[11px] text-titanium-500">Edítala a tu gusto: es tuya. Se guarda como nota en Recursos → Ideas (no canon).</p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-titanium-800 px-5 py-3">
                            <button onClick={() => setDraft(null)} className="rounded-md px-3 py-1.5 text-[12px] text-titanium-400 hover:text-titanium-100">Cancelar</button>
                            <button onClick={saveIdea} disabled={saving || !draft.cuerpo.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-amber-700/90 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-amber-600 disabled:opacity-40">
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
