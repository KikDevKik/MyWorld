// Oct 2026: «Qué pasaría si» — espacio no canon dentro de Preparar (antes: Laboratorio de ideas).
// Conversación libre para imaginar; las ideas que el autor quiere conservar se guardan como notas
// en Recursos/«Ideas (no canon)» de su Drive (visibles en Obsidian).
// Nov 2026: imágenes (bocetos y referencias, guardadas en SU Drive), fuentes junto al mensaje,
// hojas de diseño y la nota guardada se lee aquí mismo como una hoja, sin salir del frasco.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, Sparkles, Bookmark, RotateCcw, BookOpen, Lightbulb, X, FileText, Paperclip, Palette, PencilLine, ChevronDown, Check, Flag } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { confirmDialog, promptDialog } from '../ui/confirmDialog';
import { DriveImage, rememberDriveImage, shrinkImage } from '../ui/DriveImage';

interface ImgRef { id: string; name: string; mimeType?: string }
interface Msg { role: 'user' | 'assistant'; text: string; at?: string; images?: ImgRef[] }
interface RefFile { id: string; name: string; path: string }
interface Idea { id: string; name: string; modifiedTime?: string }
interface PendingImage { name: string; mimeType: string; data: string; preview: string }
interface Draft { titulo: string; cuerpo: string; original: string; tipo: 'idea' | 'diseno'; sujeto: string; imagenes: ImgRef[]; upTo: number; conConversacion: boolean }
interface Sheet { id: string; name: string; loading: boolean; content?: string; modifiedTime?: string }

interface Props {
    accessToken: string | null;
    onOpenFile?: (fileId: string) => void;
}

const STARTERS = [
    '¿Qué pasaría si el villano tuviera razón?',
    'Mezcla mi sistema de poderes con algo de una de mis series favoritas',
    'Te muestro un boceto de mi personaje: ¿qué transmite?',
];
const MAX_IMAGES = 3;

/** Separa una nota guardada en sus partes: datos, imágenes, cuerpo y la conversación plegada. */
export function parseIdeaNote(content: string) {
    let body = String(content || '').replace(/\r\n/g, '\n');
    const meta: Record<string, string> = {};
    const images: ImgRef[] = [];
    const fm = body.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
        body = body.slice(fm[0].length);
        let inImages = false;
        for (const line of fm[1].split('\n')) {
            const item = line.match(/^\s+-\s+"?(.+?)\s*\|\s*([A-Za-z0-9_-]{10,})"?\s*$/);
            if (inImages && item) { images.push({ name: item[1].trim(), id: item[2] }); continue; }
            const kv = line.match(/^([A-Za-zñáéíóú_]+):\s*(.*)$/);
            if (!kv) continue;
            inImages = kv[1] === 'imagenes';
            if (!inImages) meta[kv[1]] = kv[2].replace(/^"|"$/g, '').trim();
        }
    }
    let conversation = '';
    const ci = body.search(/^> \[!quote\][-+]? .*$/m);
    if (ci >= 0) {
        conversation = body.slice(ci).split('\n').slice(1).filter(l => l.startsWith('>')).map(l => l.replace(/^> ?/, '')).join('\n')
            .replace(/!\[\[[^\]]+\]\]/g, '').trim();
        body = body.slice(0, ci);
    }
    let title = '';
    body = body.replace(/^\s*# (.+)\n/, (_m, t) => { title = String(t).trim(); return ''; });
    body = body.replace(/^!\[\[[^\]]+\]\]\s*$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    return { meta, images, title, body, conversation };
}

/** La IA cierra con «Idea: <título>». Se separa del texto para mostrarlo en el botón de guardar, no como una línea suelta. */
export function splitIdeaTitle(text: string): { body: string; title: string } {
    const m = String(text || '').match(/\n?\s*\**Idea:\**\s*(.+?)\**\s*$/);
    if (!m || m.index === undefined) return { body: text, title: '' };
    return { body: text.slice(0, m.index).trimEnd(), title: m[1].replace(/^[«"]|[»".]$/g, '').trim() };
}

const fmtDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};

export default function QuePasariaSiView({ accessToken, onOpenFile }: Props) {
    const [messages, setMessages] = useState<Msg[]>([]);
    const [refs, setRefs] = useState<RefFile[]>([]);
    const [canonRefs, setCanonRefs] = useState<RefFile[]>([]);
    const [ideas, setIdeas] = useState<Idea[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [input, setInput] = useState('');
    const [pending, setPending] = useState<PendingImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [thinking, setThinking] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [preparing, setPreparing] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [refFilter, setRefFilter] = useState('');
    const [refsOpen, setRefsOpen] = useState(false);
    const [ideasOpen, setIdeasOpen] = useState(false);
    const [sheet, setSheet] = useState<Sheet | null>(null);
    const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
    const [dragging, setDragging] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const refsBoxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let alive = true;
        callFunction<any>('whatIf', { mode: 'load' })
            .then(r => { if (alive) { setMessages(r?.messages || []); setRefs(r?.references || []); setCanonRefs(r?.canon || []); } })
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

    // Cerrar con Escape lo que esté encima (de arriba hacia abajo) y el selector de fuentes al hacer clic fuera.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            if (lightbox) setLightbox(null);
            else if (refsOpen) setRefsOpen(false);
            else if (draft && !saving) setDraft(null);
            else if (sheet) setSheet(null);
            else if (ideasOpen) setIdeasOpen(false);
        };
        const onDown = (e: MouseEvent) => { if (refsOpen && refsBoxRef.current && !refsBoxRef.current.contains(e.target as Node)) setRefsOpen(false); };
        document.addEventListener('keydown', onKey);
        document.addEventListener('mousedown', onDown);
        return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
    }, [lightbox, refsOpen, draft, saving, sheet, ideasOpen]);

    const addFiles = async (files: FileList | File[] | null) => {
        const list = Array.from(files || []).filter(f => f.type.startsWith('image/'));
        if (!list.length) return;
        if (!accessToken) { toast.error('Para guardar imágenes falta la conexión con Drive. Recarga la página.'); return; }
        const room = MAX_IMAGES - pending.length;
        if (room <= 0 || list.length > room) toast.info(`Hasta ${MAX_IMAGES} imágenes por mensaje.`);
        const out: PendingImage[] = [];
        for (const f of list.slice(0, Math.max(0, room))) {
            try { out.push(await shrinkImage(f)); } catch { toast.error(`No pude leer «${f.name}».`); }
        }
        if (out.length) setPending(p => [...p, ...out].slice(0, MAX_IMAGES));
        taRef.current?.focus();
    };

    const send = async (text?: string) => {
        const message = (text ?? input).trim();
        const images = pending;
        if ((!message && !images.length) || thinking) return;
        setInput('');
        setPending([]);
        const stamp = Date.now();
        const localImgs: ImgRef[] = images.map((im, i) => ({ id: `local-${stamp}-${i}`, name: im.name }));
        images.forEach((im, i) => rememberDriveImage(localImgs[i].id, im.preview));
        setMessages(m => [...m, { role: 'user', text: message, images: localImgs }]);
        setThinking(true);
        try {
            const r = await callFunction<any>('whatIf', {
                mode: 'send', message, refIds: selected, accessToken,
                images: images.map(im => ({ name: im.name, mimeType: im.mimeType, data: im.data })),
            }, { timeout: 240000 });
            const next: Msg[] = r?.messages || [];
            // Las imágenes recién guardadas ya están en el navegador: no hace falta volver a bajarlas de Drive.
            const sent = [...next].reverse().find(m => m.role === 'user');
            (sent?.images || []).forEach((im, i) => { if (images[i]) rememberDriveImage(im.id, images[i].preview); });
            setMessages(next);
        } catch (e: any) {
            toast.error(e?.message || 'No pude responder.');
            setMessages(m => m.slice(0, -1));
            setInput(message);
            setPending(images);
        } finally {
            setThinking(false);
            setTimeout(() => taRef.current?.focus(), 50);
        }
    };

    const prepareIdea = async (upTo: number) => {
        setPreparing(upTo);
        try {
            const r = await callFunction<any>('whatIf', { mode: 'distill', upTo }, { timeout: 120000 });
            const imagenes: ImgRef[] = r.imagenes || [];
            setDraft({ titulo: r.titulo, cuerpo: r.cuerpo, original: r.cuerpo, tipo: r.tipo === 'diseno' ? 'diseno' : 'idea', sujeto: r.sujeto || '', imagenes, upTo, conConversacion: r.tipo === 'diseno' || imagenes.length > 0 });
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
            const r = await callFunction<any>('whatIf', {
                mode: 'saveIdea', titulo: draft.titulo, cuerpo: draft.cuerpo, cuerpoOriginal: draft.original, accessToken,
                tipo: draft.tipo, sujeto: draft.sujeto, imagenes: draft.imagenes, upTo: draft.upTo, conConversacion: draft.conConversacion,
            }, { timeout: 120000 });
            setIdeas(prev => [r.idea, ...prev.filter(i => i.id !== r.idea.id)]);
            setDraft(null);
            toast.success(draft.tipo === 'diseno' ? 'Hoja de diseño guardada en Recursos → Ideas (no canon).' : 'Idea guardada en Recursos → Ideas (no canon).', {
                action: { label: 'Verla', onClick: () => openSheet(r.idea) },
            });
        } catch (e: any) {
            toast.error(e?.message || 'No pude guardar la idea.');
        } finally {
            setSaving(false);
        }
    };

    const openSheet = async (idea: Idea) => {
        setIdeasOpen(false);
        if (!accessToken) { onOpenFile?.(idea.id); return; }
        setSheet({ id: idea.id, name: idea.name, loading: true, modifiedTime: idea.modifiedTime });
        try {
            const r = await callFunction<any>('whatIf', { mode: 'readIdea', id: idea.id, accessToken }, { timeout: 60000 });
            setSheet(s => (s && s.id === idea.id ? { ...s, loading: false, content: r.content, modifiedTime: r.modifiedTime || s.modifiedTime } : s));
        } catch (e: any) {
            toast.error(e?.message || 'No pude abrir la nota.');
            setSheet(null);
        }
    };

    const reset = async () => {
        if (!messages.length) return;
        const ok = await confirmDialog({
            title: '¿Empezar una conversación nueva?',
            message: 'Esta conversación se borra. Las ideas que ya guardaste siguen en Recursos → Ideas (no canon), con sus imágenes.',
            confirm: 'Empezar de nuevo',
            cancel: 'Seguir en esta',
        });
        if (!ok) return;
        try { await callFunction('whatIf', { mode: 'reset' }); setMessages([]); } catch { toast.error('No pude reiniciar.'); }
    };

    // «Esto no es mío»: el autor dice qué inventó o entendió mal la IA. Queda guardado para todas las herramientas.
    const notMine = async () => {
        const text = await promptDialog({
            title: '¿Qué no era tuyo?',
            message: 'Cuéntame en una línea qué inventé o entendí mal. Lo recuerdo para no repetirlo, aquí y en las demás herramientas.',
            placeholder: 'Nunca dije que tuviera cola',
            confirm: 'Guardar corrección',
        });
        if (!text || !text.trim()) return;
        try { await callFunction('whatIf', { mode: 'correct', text: text.trim() }); toast.success('Anotado. No lo repito.'); }
        catch (e: any) { toast.error(e?.message || 'No pude guardar la corrección.'); }
    };

    const toggleRef = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : (s.length >= 3 ? (toast.info('Hasta 3 fuentes a la vez.'), s) : [...s, id]));
    const matches = (r: RefFile) => !refFilter || r.name.toLowerCase().includes(refFilter.toLowerCase()) || r.path.toLowerCase().includes(refFilter.toLowerCase());
    const shownRefs = refs.filter(matches);
    const shownCanon = canonRefs.filter(matches);
    const allRefs = useMemo(() => [...canonRefs, ...refs], [canonRefs, refs]);
    const parsed = useMemo(() => (sheet?.content ? parseIdeaNote(sheet.content) : null), [sheet?.content]);

    const ideasList = (
        <>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-400"><Bookmark size={12} aria-hidden="true" /> Ideas guardadas</p>
            {!ideas.length ? (
                <p className="mt-2 text-[12px] leading-relaxed text-titanium-500">Aún no hay. Usa «Guardar como idea» debajo de una respuesta.</p>
            ) : (
                <ul className="mt-2 space-y-0.5">
                    {ideas.map(i => (
                        <li key={i.id}>
                            <button onClick={() => openSheet(i)} className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] hover:bg-titanium-800/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${sheet?.id === i.id ? 'bg-titanium-800/70 text-titanium-50' : 'text-titanium-300'}`}>
                                {/^diseño\b/i.test(i.name) ? <Palette size={12} className="shrink-0 text-amber-400/80" aria-hidden="true" /> : <FileText size={12} className="shrink-0 text-amber-500/70" aria-hidden="true" />}
                                <span className="truncate">{i.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );

    return (
        <div
            className="relative h-full w-full flex overflow-hidden bg-titanium-950 bg-[radial-gradient(circle_at_40%_20%,#1d1913_0%,#0b0a09_75%)]"
            onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragging(true); } }}
            onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
            onDrop={e => { if (e.dataTransfer.files?.length) { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); } }}
        >
            {/* Conversación */}
            <div className="flex-1 flex flex-col min-w-0">
                <div className="shrink-0 border-b border-amber-900/30 px-4 sm:px-6 py-2.5 flex items-center gap-2 text-[12px] text-amber-200/80">
                    <Lightbulb size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
                    <span className="min-w-0">Aquí nada es canon.<span className="hidden sm:inline"> Imagina sin miedo: lo que quieras conservar se guarda en <b>Recursos → Ideas (no canon)</b>.</span></span>
                    <button onClick={() => setIdeasOpen(true)} className="ml-auto lg:hidden shrink-0 inline-flex items-center gap-1 rounded px-2 py-1.5 text-titanium-300 hover:text-titanium-50 hover:bg-titanium-800/60">
                        <Bookmark size={12} aria-hidden="true" /> Guardadas{ideas.length ? ` (${ideas.length})` : ''}
                    </button>
                    <button onClick={reset} disabled={!messages.length} className="lg:ml-auto shrink-0 inline-flex items-center gap-1 rounded px-2 py-1.5 text-titanium-300 hover:text-titanium-50 hover:bg-titanium-800/60 disabled:opacity-30">
                        <RotateCcw size={12} aria-hidden="true" /> Nueva
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <div className="max-w-[760px] mx-auto px-4 sm:px-8 py-8 space-y-6">
                        {loading ? (
                            <div className="flex justify-center py-20 text-titanium-500"><Loader2 className="animate-spin" size={18} aria-label="Cargando" /></div>
                        ) : !messages.length ? (
                            <div className="py-14 text-center space-y-5">
                                <Sparkles size={28} className="mx-auto text-amber-400/80" aria-hidden="true" />
                                <div>
                                    <p className="font-serif text-xl text-titanium-50">¿Qué pasaría si…?</p>
                                    <p className="mt-1.5 text-sm text-titanium-400">Lanza una idea, una mezcla o una escena que te persigue. También puedes traer un boceto o una referencia: se guarda en tu Drive.</p>
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {STARTERS.map(s => (
                                        <button key={s} onClick={() => { setInput(s); taRef.current?.focus(); }} className="rounded-full border border-amber-800/40 bg-amber-950/20 px-3 py-1.5 text-[12px] text-amber-100/80 hover:bg-amber-900/30">{s}</button>
                                    ))}
                                </div>
                            </div>
                        ) : messages.map((m, i) => (
                            m.role === 'user' ? (
                                <div key={i} className="flex flex-col items-end gap-1.5">
                                    {!!m.images?.length && (
                                        <div className={`grid gap-1.5 max-w-[85%] ${m.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                            {m.images.map(im => (
                                                <DriveImage key={im.id} id={im.id} token={accessToken} alt={im.name}
                                                    onClick={url => setLightbox({ url, alt: im.name })}
                                                    className={`rounded-xl border border-titanium-700/70 ${m.images!.length === 1 ? 'w-[260px] max-w-full aspect-[4/5]' : 'w-[150px] aspect-square'}`} />
                                            ))}
                                        </div>
                                    )}
                                    {m.text && <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-titanium-800/70 px-4 py-2.5 text-[14px] text-titanium-100 whitespace-pre-wrap">{m.text}</div>}
                                </div>
                            ) : (() => { const { body, title } = splitIdeaTitle(m.text); return (
                                <div key={i} className="group">
                                    <div className="prose prose-invert prose-sm max-w-none text-titanium-200 prose-p:leading-relaxed prose-strong:text-amber-100">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                                    </div>
                                    <button onClick={() => prepareIdea(i)} disabled={preparing !== null} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-800/40 px-2.5 py-1.5 text-[11.5px] text-amber-200/90 hover:bg-amber-900/20 disabled:opacity-40">
                                        {preparing === i ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Bookmark size={11} aria-hidden="true" />} {title ? <>Guardar <span className="font-medium text-amber-100">«{title}»</span></> : 'Guardar como idea'}
                                    </button>
                                    <button onClick={notMine} className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] text-titanium-400 hover:bg-titanium-800/60 hover:text-titanium-100">
                                        <Flag size={11} aria-hidden="true" /> Esto no es mío
                                    </button>
                                </div>
                            ); })()
                        ))}
                        {thinking && <div role="status" className="flex items-center gap-2 text-titanium-400 text-sm"><Loader2 size={14} className="animate-spin text-amber-400" aria-hidden="true" /> {pending.length || messages[messages.length - 1]?.images?.length ? 'Guardando en tu Drive e imaginando…' : 'Imaginando…'}</div>}
                        <div ref={endRef} />
                    </div>
                </div>

                <div className="shrink-0 border-t border-titanium-800/70 px-4 sm:px-6 py-4">
                    <div className="max-w-[760px] mx-auto">
                        {(!!selected.length || !!pending.length) && (
                            <div className="mb-2 flex flex-wrap items-end gap-2">
                                {pending.map((im, i) => (
                                    <span key={i} className="relative">
                                        <img src={im.preview} alt={im.name} className="h-16 w-16 rounded-lg object-cover border border-titanium-700" />
                                        <button onClick={() => setPending(p => p.filter((_, j) => j !== i))} aria-label={`Quitar ${im.name}`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-titanium-950 border border-titanium-600 text-titanium-200 hover:text-white"><X size={11} aria-hidden="true" /></button>
                                    </span>
                                ))}
                                {selected.map(id => {
                                    const r = allRefs.find(x => x.id === id);
                                    return <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-900/30 pl-2.5 pr-1 py-0.5 text-[11.5px] text-amber-100"><BookOpen size={10} aria-hidden="true" />{r?.name || id}<button onClick={() => toggleRef(id)} aria-label={`Quitar ${r?.name || 'fuente'}`} className="rounded-full p-0.5 hover:bg-amber-800/50"><X size={10} aria-hidden="true" /></button></span>;
                                })}
                            </div>
                        )}
                        <div data-tour="ideas-input" className="relative flex items-end gap-1 rounded-xl border border-titanium-700 bg-titanium-900/80 pl-1.5 pr-2 py-1.5 focus-within:border-amber-700/60">
                            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                            <button type="button" onClick={() => fileRef.current?.click()} disabled={thinking || pending.length >= MAX_IMAGES} title="Adjuntar imágenes (se guardan en tu Drive)" aria-label="Adjuntar imágenes" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-titanium-400 hover:bg-titanium-800 hover:text-amber-200 disabled:opacity-30">
                                <Paperclip size={16} aria-hidden="true" />
                            </button>
                            <div ref={refsBoxRef} className="shrink-0">
                                <button type="button" onClick={() => setRefsOpen(o => !o)} aria-expanded={refsOpen} aria-haspopup="dialog" title="Traer tus fuentes a la conversación" className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-[12px] hover:bg-titanium-800 ${selected.length ? 'text-amber-200' : 'text-titanium-400 hover:text-amber-200'}`}>
                                    <BookOpen size={15} aria-hidden="true" /><span className="hidden sm:inline">Fuentes</span>{!!selected.length && <span className="rounded-full bg-amber-700/70 px-1.5 text-[10px] font-semibold text-white">{selected.length}</span>}
                                </button>
                                {refsOpen && (
                                    <div role="dialog" aria-label="Tus fuentes" className="absolute bottom-full left-0 z-20 mb-2 w-[min(340px,calc(100vw-2rem))] rounded-xl border border-titanium-700 bg-titanium-900 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
                                        <p className="text-[12px] font-medium text-titanium-100">Tus fuentes</p>
                                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-titanium-400">Marca hasta 3 documentos para que entren enteros en la conversación. Sirve cuando necesitas que lea uno completo.</p>
                                        {allRefs.length > 8 && (
                                            <input autoFocus value={refFilter} onChange={e => setRefFilter(e.target.value)} placeholder="Buscar…" aria-label="Buscar en tus fuentes" className="mt-2 w-full rounded-md border border-titanium-700 bg-titanium-950 px-2 py-1.5 text-[12px] text-titanium-100 outline-none focus:border-amber-700" />
                                        )}
                                        {!allRefs.length ? (
                                            <p className="mt-2 text-[12px] text-titanium-500">No encontré documentos. Pulsa «Sincronizar» en el explorador.</p>
                                        ) : (
                                            <div className="mt-2 max-h-64 overflow-y-auto pr-1">
                                                {([['Canon', 'lo que ya es verdad en tu historia', shownCanon], ['Recursos', 'notas e inspiración, no canon', shownRefs]] as const).map(([title, hint, list]) => !!list.length && (
                                                    <div key={title} className="mb-2 last:mb-0">
                                                        <p className="sticky top-0 bg-titanium-900 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-titanium-400">{title} <span className="font-normal normal-case tracking-normal text-titanium-500">· {hint}</span></p>
                                                        <ul className="space-y-0.5">
                                                            {list.map(r => (
                                                                <li key={r.id}>
                                                                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-titanium-200 hover:bg-titanium-800/60" title={r.path}>
                                                                        <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleRef(r.id)} className="accent-amber-600" />
                                                                        <span className="truncate">{r.name}</span>
                                                                    </label>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                                {!shownRefs.length && !shownCanon.length && <p className="px-2 py-1.5 text-[12px] text-titanium-500">Nada con ese nombre.</p>}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <textarea
                                ref={taRef}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                                onPaste={e => { const files = Array.from(e.clipboardData.files || []).filter(f => f.type.startsWith('image/')); if (files.length) { e.preventDefault(); addFiles(files); } }}
                                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                                placeholder="¿Qué pasaría si…?"
                                aria-label="Tu idea"
                                className="flex-1 min-w-0 resize-none bg-transparent text-[14px] text-titanium-100 placeholder:text-titanium-500 outline-none py-2 pl-1"
                            />
                            <button onClick={() => send()} disabled={(!input.trim() && !pending.length) || thinking} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-700/80 text-white hover:bg-amber-600 disabled:opacity-30" aria-label="Enviar">
                                {thinking ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Lateral: ideas guardadas (en pantallas angostas se abre con «Guardadas») */}
            <aside className="hidden lg:flex w-72 shrink-0 border-l border-titanium-800/70 bg-titanium-950/80 flex-col overflow-hidden">
                <div className="p-4 flex-1 overflow-y-auto">{ideasList}</div>
            </aside>
            {ideasOpen && (
                <div className="lg:hidden absolute inset-0 z-30 flex justify-end bg-black/50" onMouseDown={e => { if (e.target === e.currentTarget) setIdeasOpen(false); }}>
                    <div role="dialog" aria-label="Ideas guardadas" className="h-full w-[min(320px,88vw)] overflow-y-auto border-l border-titanium-800 bg-titanium-950 p-4">
                        <div className="mb-2 flex justify-end"><button onClick={() => setIdeasOpen(false)} aria-label="Cerrar" className="rounded p-1.5 text-titanium-400 hover:bg-titanium-800 hover:text-titanium-50"><X size={16} aria-hidden="true" /></button></div>
                        {ideasList}
                    </div>
                </div>
            )}

            {dragging && (
                <div className="pointer-events-none absolute inset-3 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-amber-500/70 bg-titanium-950/80">
                    <p className="text-sm text-amber-100">Suelta la imagen: se guarda en tu Drive y entra en la conversación.</p>
                </div>
            )}

            {/* Hoja de la nota guardada */}
            {sheet && (
                <div className="absolute inset-0 z-[60] flex justify-end bg-black/55" onMouseDown={e => { if (e.target === e.currentTarget) setSheet(null); }}>
                    <article role="dialog" aria-modal="true" aria-labelledby="mw-sheet-title" className="flex h-full w-full max-w-[720px] flex-col border-l border-titanium-700 bg-titanium-900 shadow-[-30px_0_80px_rgba(0,0,0,0.45)] motion-safe:animate-in motion-safe:slide-in-from-right-8 motion-safe:duration-200">
                        <header className="flex shrink-0 items-center gap-3 border-b border-titanium-800 px-5 py-3">
                            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-amber-200">
                                {parsed?.meta.tipo === 'diseño' ? <Palette size={11} aria-hidden="true" /> : <Lightbulb size={11} aria-hidden="true" />}
                                {parsed?.meta.tipo === 'diseño' ? 'Hoja de diseño' : parsed?.meta.tipo === 'nota' ? 'Nota' : 'Idea'} · no canon
                            </span>
                            <span className="truncate text-[11.5px] text-titanium-400">{fmtDate(parsed?.meta.creada || sheet.modifiedTime)}</span>
                            <button onClick={() => setSheet(null)} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-titanium-400 hover:bg-titanium-800 hover:text-titanium-50"><X size={18} aria-hidden="true" /></button>
                        </header>
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            <div className="mx-auto max-w-[600px] px-5 sm:px-8 py-8">
                                <h2 id="mw-sheet-title" className="font-serif text-[28px] leading-tight text-titanium-50 text-balance">{parsed?.title || sheet.name}</h2>
                                {parsed?.meta.sujeto && <p className="mt-1 text-[13px] text-titanium-400">{parsed.meta.sujeto}</p>}
                                {sheet.loading ? (
                                    <div className="flex justify-center py-16 text-titanium-500"><Loader2 className="animate-spin" size={18} aria-label="Abriendo la nota" /></div>
                                ) : parsed && (
                                    <>
                                        {!!parsed.images.length && (
                                            <div className="mt-6">
                                                <DriveImage id={parsed.images[0].id} token={accessToken} alt={parsed.images[0].name}
                                                    onClick={url => setLightbox({ url, alt: parsed.images[0].name })} fit="contain"
                                                    className="w-full rounded-xl border border-titanium-700 bg-titanium-950 aspect-[4/3]" />
                                                {parsed.images.length > 1 && (
                                                    <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
                                                        {parsed.images.slice(1).map(im => (
                                                            <DriveImage key={im.id} id={im.id} token={accessToken} alt={im.name}
                                                                onClick={url => setLightbox({ url, alt: im.name })}
                                                                className="aspect-square rounded-lg border border-titanium-700 bg-titanium-950" />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-7 text-[14.5px] leading-relaxed text-titanium-200">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                                                h2: ({ children }) => <h3 className="mt-8 mb-2.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-300/90">{children}<span className="h-px flex-1 bg-titanium-800" aria-hidden="true" /></h3>,
                                                h3: ({ children }) => <h4 className="mt-5 mb-1.5 text-[13.5px] font-semibold text-titanium-50">{children}</h4>,
                                                p: ({ children }) => <p className="my-2.5">{children}</p>,
                                                ul: ({ children }) => <ul className="my-2 space-y-1.5 pl-1">{children}</ul>,
                                                ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-5">{children}</ol>,
                                                li: ({ children }) => <li className="relative pl-4 before:absolute before:left-0 before:top-[0.68em] before:h-1 before:w-1 before:rounded-full before:bg-amber-500/70 [ol>&]:pl-0 [ol>&]:before:hidden">{children}</li>,
                                                strong: ({ children }) => <strong className="font-semibold text-titanium-50">{children}</strong>,
                                                a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-200 underline underline-offset-2">{children}</a>,
                                            }}>{parsed.body}</ReactMarkdown>
                                        </div>
                                        {parsed.conversation && (
                                            <details className="group mt-10 rounded-xl border border-titanium-800 bg-titanium-950/50">
                                                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12.5px] text-titanium-300 hover:text-titanium-50 [&::-webkit-details-marker]:hidden">
                                                    <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /> La conversación de donde salió
                                                </summary>
                                                <div className="prose prose-invert prose-sm max-w-none border-t border-titanium-800 px-4 py-3 text-titanium-300 prose-strong:text-titanium-100">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.conversation}</ReactMarkdown>
                                                </div>
                                            </details>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <footer className="flex shrink-0 items-center gap-3 border-t border-titanium-800 px-5 py-3">
                            <p className="min-w-0 flex-1 truncate text-[11.5px] text-titanium-500">Vive en tu Drive: Recursos → Ideas (no canon). También la ves en Obsidian.</p>
                            {onOpenFile && (
                                <button onClick={() => { const id = sheet.id; setSheet(null); onOpenFile(id); }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-titanium-700 px-3 py-2 text-[12.5px] text-titanium-100 hover:bg-titanium-800">
                                    <PencilLine size={13} aria-hidden="true" /> Editarla
                                </button>
                            )}
                        </footer>
                    </article>
                </div>
            )}

            {/* Nota de idea (editable antes de guardar) */}
            {draft && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onMouseDown={e => { if (e.target === e.currentTarget && !saving) setDraft(null); }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="mw-draft-title" className="w-full max-w-2xl rounded-2xl border border-amber-900/40 bg-titanium-900 shadow-2xl flex flex-col max-h-[88dvh]">
                        <div className="flex items-center justify-between border-b border-titanium-800 px-5 py-3">
                            <p id="mw-draft-title" className="font-serif text-[16px] text-titanium-50">Guardar en tus ideas <span className="font-sans text-[12px] text-titanium-400">· no canon</span></p>
                            <button onClick={() => setDraft(null)} aria-label="Cerrar" className="rounded p-1 text-titanium-400 hover:text-titanium-50"><X size={16} aria-hidden="true" /></button>
                        </div>
                        <div className="p-5 space-y-3 overflow-y-auto">
                            <div role="radiogroup" aria-label="Tipo de nota" className="inline-flex rounded-lg border border-titanium-700 p-0.5 text-[12px]">
                                {([['idea', 'Idea', Lightbulb], ['diseno', 'Hoja de diseño', Palette]] as const).map(([k, label, Icon]) => (
                                    <button key={k} role="radio" aria-checked={draft.tipo === k} onClick={() => setDraft({ ...draft, tipo: k })} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 ${draft.tipo === k ? 'bg-amber-700/80 text-white' : 'text-titanium-300 hover:text-titanium-50'}`}>
                                        <Icon size={12} aria-hidden="true" /> {label}
                                    </button>
                                ))}
                            </div>
                            <input value={draft.titulo} onChange={e => setDraft({ ...draft, titulo: e.target.value })} aria-label="Título" className="w-full rounded-md border border-titanium-700 bg-titanium-950 px-3 py-2 font-serif text-[16px] text-titanium-50 outline-none focus:border-amber-700" />
                            {!!draft.imagenes.length && (
                                <div>
                                    <p className="mb-1.5 text-[11.5px] text-titanium-400">Imágenes que van en la nota (ya están en tu Drive):</p>
                                    <div className="flex flex-wrap gap-2">
                                        {draft.imagenes.map(im => (
                                            <span key={im.id} className="relative">
                                                <DriveImage id={im.id} token={accessToken} alt={im.name} className="h-16 w-16 rounded-lg border border-titanium-700" />
                                                <button onClick={() => setDraft({ ...draft, imagenes: draft.imagenes.filter(x => x.id !== im.id) })} aria-label={`No incluir ${im.name}`} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-titanium-950 border border-titanium-600 text-titanium-200 hover:text-white"><X size={11} aria-hidden="true" /></button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <textarea value={draft.cuerpo} onChange={e => setDraft({ ...draft, cuerpo: e.target.value })} rows={14} aria-label="Contenido de la nota" className="w-full rounded-md border border-titanium-700 bg-titanium-950 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-titanium-200 outline-none focus:border-amber-700" />
                            <label className="flex cursor-pointer items-start gap-2 text-[12.5px] text-titanium-300">
                                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${draft.conConversacion ? 'border-amber-600 bg-amber-700' : 'border-titanium-600'}`}>{draft.conConversacion && <Check size={11} className="text-white" aria-hidden="true" />}</span>
                                <input type="checkbox" className="sr-only" checked={draft.conConversacion} onChange={e => setDraft({ ...draft, conConversacion: e.target.checked })} />
                                <span>Guardar también la conversación, plegada al final de la nota.</span>
                            </label>
                            <p className="text-[11.5px] text-titanium-500">Edítala a tu gusto: es tuya. Solo debería tener lo que tú dijiste o aceptaste; si se coló algo que no, bórralo.</p>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-titanium-800 px-5 py-3">
                            <button onClick={() => setDraft(null)} className="rounded-lg px-3 py-2 text-[12.5px] text-titanium-300 hover:text-titanium-50">Cancelar</button>
                            <button onClick={saveIdea} disabled={saving || !draft.cuerpo.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700/90 px-4 py-2 text-[12.5px] font-medium text-white hover:bg-amber-600 disabled:opacity-40">
                                {saving ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Bookmark size={12} aria-hidden="true" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {lightbox && (
                <div role="dialog" aria-modal="true" aria-label={lightbox.alt} className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)}>
                    <img src={lightbox.url} alt={lightbox.alt} className="max-h-full max-w-full rounded-lg object-contain" />
                    <button onClick={() => setLightbox(null)} aria-label="Cerrar imagen" className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><X size={18} aria-hidden="true" /></button>
                </div>
            )}
        </div>
    );
}
