// Oct 2026: «Personajes» dentro de Preparar (antes: la Forja de Almas).
// Escanea el canon, separa a los personajes con ficha de los que solo aparecen en el manuscrito,
// revisa cada ficha contra el texto, entrevista al autor para completarla y propone la ficha
// actualizada (con sus palabras) para que la apruebe antes de guardarla en Drive.
import { confirmDialog } from '../ui/confirmDialog';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Users, ScanSearch, Loader2, FileText, Ghost, Anchor, Send, RotateCcw, Wand2, X, Check, AlertTriangle, HelpCircle, Search, FilePlus2, Lightbulb, Palette } from 'lucide-react';
import { toast } from 'sonner';
import { getAuth } from 'firebase/auth';
import { callFunction } from '../../services/api';
import { lineDiff } from '../../utils/lineDiff';
import { textHash } from '../../utils/textHash';
import { useIsNarrow } from '../../hooks/useMediaQuery';
import { costSuffix } from '../../utils/costHint';
import { MiraSprite } from '../mira/MiraSprite';

interface Personaje { id: string; nombre: string; alias: string[]; tipo: 'personaje' | 'criatura' | 'grupo'; rol: string; resumen: string; fichaFileId: string | null; fichaNombre: string | null; archivos: string[] }
interface Analisis { resumen: string; tiene: string[]; falta: { aspecto: string; porQue: string; pregunta: string }[]; choques: { explicacion: string; citaFicha?: string; citaTexto?: string; fuente?: string }[] }
interface Msg { role: 'user' | 'assistant'; text: string }
interface Propuesta { original: string; baseHash: string; propuesta: string; cambios: string[]; fileId: string | null }

interface Props { accessToken: string | null; onOpenFile?: (fileId: string) => void }

// Nov 2026: la ficha completa se lee y se edita aquí (antes solo se veía la frase del escaneo y había que ir al editor).
function FichaBlock({ fileId, name, accessToken }: { fileId: string; name: string; accessToken: string | null }) {
    const [text, setText] = useState<string | null>(null);
    const [base, setBase] = useState('');
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let alive = true;
        setText(null); setEditing(false);
        if (!accessToken) { setText(''); return; }
        callFunction<any>('getDriveFileContent', { fileId, accessToken })
            .then(r => { if (alive) { const c = String(r?.content || ''); setText(c); setBase(c); } })
            .catch(() => { if (alive) setText(''); });
        return () => { alive = false; };
    }, [fileId, accessToken]);
    // Sin el frontmatter, las líneas técnicas ni el título «# Nombre» (el nombre ya está arriba).
    const body = (text || '').replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^>\s*\*\*(Role|Traits)\*\*:.*$/gm, '').trim().replace(/^#\s+[^\n]*\n+/, '').trim();
    const save = async () => {
        setSaving(true);
        try {
            const r = await callFunction<any>('saveDriveFile', { fileId, content: draft, accessToken, baseHash: textHash(base) });
            if (r?.conflict) { toast.warning('La ficha cambió en Drive desde que la abriste. Vuelve a abrirla para no pisar esos cambios.'); return; }
            setText(draft); setBase(draft); setEditing(false);
            toast.success(`Ficha de ${name} guardada.`);
        } catch (e: any) { toast.error(e?.message || 'No pude guardar la ficha.'); }
        finally { setSaving(false); }
    };
    return (
        <section className="rounded-xl border border-titanium-800 bg-titanium-950/40 p-4" aria-label={`Ficha de ${name}`}>
            <div className="flex items-center gap-2 mb-2">
                <h3 className="flex-1 font-serif text-[16px] text-titanium-50">La ficha</h3>
                {text !== null && !editing && <button onClick={() => { setDraft(text || ''); setEditing(true); }} className="rounded-md border border-titanium-700 px-2.5 py-1 text-[12px] text-titanium-300 hover:bg-titanium-800">Editar a mano</button>}
            </div>
            {text === null ? <div className="py-3 text-titanium-600"><Loader2 size={14} className="animate-spin" aria-hidden="true" /></div>
                : editing ? (
                    <div className="flex flex-col gap-2">
                        <label htmlFor="ficha-edit" className="sr-only">Texto de la ficha</label>
                        <textarea id="ficha-edit" value={draft} onChange={e => setDraft(e.target.value)} rows={14} className="w-full rounded-md border border-titanium-700 bg-titanium-950 p-3 font-serif text-[14px] leading-relaxed text-titanium-100 outline-none focus:border-mira/70" />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setEditing(false)} className="rounded-md px-3 py-1.5 text-[13px] text-titanium-400 hover:text-titanium-100">Cancelar</button>
                            <button onClick={save} disabled={saving || draft === base} className="inline-flex items-center gap-1.5 rounded-md bg-coral text-on-coral px-4 py-1.5 text-[13px] font-medium disabled:opacity-40">{saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} Guardar</button>
                        </div>
                    </div>
                ) : body ? (
                    <div className="prose prose-invert prose-sm max-w-none font-serif text-titanium-200"><ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown></div>
                ) : <p className="text-[13px] text-titanium-500">La ficha está vacía o no se pudo leer.</p>}
        </section>
    );
}

const ROL_ORDER: Record<string, number> = { protagonista: 0, principal: 1, secundario: 2, mencionado: 3 };
const ROL_STYLE: Record<string, string> = {
    protagonista: 'bg-mira/15 text-mira', principal: 'bg-sky-900/30 text-sky-200',
    secundario: 'bg-titanium-800 text-titanium-300', mencionado: 'bg-titanium-900 text-titanium-500',
};

export default function PersonajesView({ accessToken, onOpenFile }: Props) {
    // Nov 2026: en el celular, lista o ficha (una a la vez). Antes la ficha quedaba con 64 px y fuera de la pantalla.
    const narrow = useIsNarrow();
    const [list, setList] = useState<Personaje[]>([]);
    const [scannedAt, setScannedAt] = useState<string | null>(null);
    const [carpetas, setCarpetas] = useState<{ id: string; path: string }[]>([]);
    const [carpeta, setCarpeta] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [filter, setFilter] = useState('');
    const [sel, setSel] = useState<string | null>(null);
    const [analisis, setAnalisis] = useState<Analisis | null>(null);
    const [mensajes, setMensajes] = useState<Msg[]>([]);
    const [busy, setBusy] = useState<'' | 'detail' | 'analyze' | 'interview' | 'propose' | 'save'>('');
    const [input, setInput] = useState('');
    const [prop, setProp] = useState<Propuesta | null>(null);
    const [editMode, setEditMode] = useState(false);
    const [ideas, setIdeas] = useState<{ id: string; name: string }[]>([]);
    const endRef = useRef<HTMLDivElement>(null);

    // Nov 2026: las ideas y hojas de diseño (no canon) que nombran al personaje se enlazan desde su ficha.
    // Solo lectura: abrir una no la vuelve canon.
    useEffect(() => {
        if (!accessToken) return;
        callFunction<any>('whatIf', { mode: 'listIdeas', accessToken }).then(r => setIdeas(r?.ideas || [])).catch(() => {});
    }, [accessToken]);

    // Nov 2026: la lista llegaba en 5 a 20 s (arranque en frío). Se muestra la última conocida mientras llega la nueva.
    const CACHE_KEY = `mw-personajes-cache-${getAuth().currentUser?.uid || 'anon'}`;
    useEffect(() => {
        try {
            const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
            if (c?.personajes?.length) { setList(c.personajes); setScannedAt(c.scannedAt || null); setLoading(false); }
        } catch { /* sin caché */ }
    }, []);
    const loadList = async () => {
        try {
            const r = await callFunction<any>('personajes', { mode: 'list' });
            setList(r?.personajes || []);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify({ personajes: r?.personajes || [], scannedAt: r?.scannedAt || null })); } catch { /* lleno */ }
            setScannedAt(r?.scannedAt || null);
            setCarpetas(r?.carpetas || []);
            // Nov 2026: si el servidor no sugiere carpeta, la de personajes (antes empezaba en «Elige…»).
            const guess = (r?.carpetas || []).find((c: any) => /personaj|characters/i.test(String(c.path || '')))?.id || '';
            setCarpeta(c => c || r?.carpetaSugerida || guess);
        } catch { /* sin datos */ } finally { setLoading(false); }
    };
    useEffect(() => { loadList(); }, []);

    const scan = async () => {
        setScanning(true);
        try {
            const r = await callFunction<any>('personajes', { mode: 'scan' }, { timeout: 300000 });
            setList(r?.personajes || []);
            setScannedAt(r?.scannedAt || null);
            toast.success(`Encontré ${r?.personajes?.length || 0} personajes.`);
            loadList();
        } catch (e: any) { toast.error(e?.message || 'No pude escanear.'); } finally { setScanning(false); }
    };

    const open = async (id: string) => {
        setSel(id); setAnalisis(null); setMensajes([]); setInput(''); setBusy('detail');
        try {
            const r = await callFunction<any>('personajes', { mode: 'get', id });
            setAnalisis(r?.analisis || null);
            setMensajes(r?.mensajes || []);
        } catch { /* nada guardado */ } finally { setBusy(''); }
    };

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes.length, busy]);

    const run = async (kind: 'analyze' | 'interview', message?: string) => {
        if (!sel) return;
        setBusy(kind);
        if (kind === 'interview' && message) setMensajes(m => [...m, { role: 'user', text: message }]);
        try {
            const r = await callFunction<any>('personajes', { mode: kind, id: sel, accessToken, message }, { timeout: 180000 });
            if (kind === 'analyze') setAnalisis(r.analisis);
            else setMensajes(r.mensajes || []);
        } catch (e: any) {
            toast.error(e?.message || 'No pude completar esto.');
            if (kind === 'interview' && message) { setMensajes(m => m.slice(0, -1)); setInput(message); }
        } finally { setBusy(''); }
    };

    const resetInterview = async () => {
        if (!sel || !(await confirmDialog({ title: '¿Empezar la entrevista de nuevo?', message: 'Se borra lo conversado en esta entrevista. La ficha del personaje no se toca.', confirm: 'Empezar de nuevo', cancel: 'Seguir en esta' }))) return;
        try { await callFunction('personajes', { mode: 'resetInterview', id: sel }); setMensajes([]); } catch { toast.error('No pude reiniciar.'); }
    };

    const propose = async () => {
        if (!sel) return;
        setBusy('propose');
        try {
            const r = await callFunction<Propuesta>('personajes', { mode: 'propose', id: sel, accessToken }, { timeout: 180000 });
            setProp(r); setEditMode(false);
        } catch (e: any) { toast.error(e?.message || 'No pude proponer la ficha.'); } finally { setBusy(''); }
    };

    const save = async () => {
        if (!prop || !sel) return;
        const p = list.find(x => x.id === sel);
        setBusy('save');
        try {
            if (prop.fileId) {
                const r = await callFunction<any>('saveDriveFile', { fileId: prop.fileId, content: prop.propuesta, accessToken, baseHash: prop.baseHash });
                if (r?.conflict) { toast.warning('La ficha cambió en Drive u Obsidian desde que la leí. Vuelve a proponer para no pisar tus cambios.'); return; }
                toast.success(`Ficha de ${p?.nombre} actualizada en Drive.`);
            } else {
                if (!carpeta) { toast.info('Elige la carpeta donde va la ficha.'); return; }
                const r = await callFunction<any>('personajes', { mode: 'createFicha', id: sel, accessToken, folderId: carpeta, content: prop.propuesta });
                setList(l => l.map(x => x.id === sel ? { ...x, fichaFileId: r.fileId, fichaNombre: String(r.name).replace(/\.md$/, '') } : x));
                toast.success(`Creé la ficha de ${p?.nombre}.`, { description: 'Ya está en tu carpeta de personajes.' });
            }
            setProp(null);
        } catch (e: any) { toast.error(e?.message || 'No pude guardar.'); } finally { setBusy(''); }
    };

    const filtered = useMemo(() => {
        const q = filter.toLowerCase();
        return list.filter(p => !q || p.nombre.toLowerCase().includes(q) || p.alias.some(a => a.toLowerCase().includes(q)))
            .sort((a, b) => (ROL_ORDER[a.rol] ?? 9) - (ROL_ORDER[b.rol] ?? 9) || a.nombre.localeCompare(b.nombre));
    }, [list, filter]);
    const anchors = filtered.filter(p => p.fichaFileId);
    const ghosts = filtered.filter(p => !p.fichaFileId);
    const cur = list.find(p => p.id === sel) || null;
    const diff = useMemo(() => (prop ? lineDiff(prop.original || '', prop.propuesta) : []), [prop]);

    const Row = ({ p }: { p: Personaje }) => (
        <button onClick={() => open(p.id)} className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${sel === p.id ? 'bg-titanium-800' : 'hover:bg-titanium-900'}`}>
            <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-[13px] text-titanium-100">{p.nombre}</span>
                <span className={`rounded px-1.5 py-px text-[10px] ${ROL_STYLE[p.rol] || ROL_STYLE.secundario}`}>{p.rol}</span>
            </div>
            {p.resumen && <p className="mt-0.5 line-clamp-1 text-[11px] text-titanium-500">{p.resumen}</p>}
        </button>
    );

    return (
        <div className="h-full w-full flex overflow-hidden bg-titanium-950">
            {/* Lista */}
            <aside className={`${narrow ? (cur ? 'hidden' : 'w-full') : 'w-80 shrink-0 border-r border-titanium-800'} flex flex-col`}>
                <div data-tour="personajes-lista" className="p-4 border-b border-titanium-800 space-y-3">
                    <div className="flex items-center gap-2">
                        <Users size={15} className="text-mira" />
                        <p className="flex-1 text-sm font-medium text-titanium-100">Tus personajes</p>
                        <button onClick={scan} disabled={scanning} className="inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-2.5 py-1 text-[11px] text-titanium-100 disabled:opacity-50" title={`Lee tu canon y encuentra a tus personajes${costSuffix('~US$0,02')}`}>
                            {scanning ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />} {list.length ? 'Volver a escanear' : 'Escanear mi canon'}
                        </button>
                    </div>
                    {scannedAt && <p className="text-[10px] text-titanium-600">Último escaneo: {new Date(scannedAt).toLocaleString()}</p>}
                    {list.length > 8 && (
                        <div className="flex items-center gap-1.5 rounded-md border border-titanium-800 bg-titanium-950 px-2">
                            <Search size={12} className="text-titanium-600" />
                            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Buscar…" className="flex-1 bg-transparent py-1 text-[12px] text-titanium-200 outline-none" />
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {loading ? <div className="flex justify-center py-10 text-titanium-600"><Loader2 size={16} className="animate-spin" /></div>
                        : !list.length ? (
                            <p className="px-2 py-6 text-[12px] leading-relaxed text-titanium-500">Escanea tu canon: leo tus capítulos y fichas, y te muestro quién tiene ficha y quién aparece en tu historia sin tenerla.</p>
                        ) : (<>
                            {!!anchors.length && (
                                <div>
                                    <p className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-titanium-500"><Anchor size={11} /> Con ficha ({anchors.length})</p>
                                    {anchors.map(p => <Row key={p.id} p={p} />)}
                                </div>
                            )}
                            {!!ghosts.length && (
                                <div>
                                    <p className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-titanium-500"><Ghost size={11} /> Aparecen sin ficha ({ghosts.length})</p>
                                    {ghosts.map(p => <Row key={p.id} p={p} />)}
                                </div>
                            )}
                        </>)}
                </div>
            </aside>

            {/* Detalle */}
            <section className={`${narrow && !cur ? 'hidden' : 'flex'} flex-1 min-w-0 flex-col`}>
                {!cur ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-10">
                        {/* Nov 2026: Mira espera junto al fichero en vez de en la esquina. */}
                        <div className="flex items-end gap-3">
                            <img src="/assets/objetos/fichero.png" alt="" width={72} height={72} className="w-[72px] h-[72px] mb-3" style={{ imageRendering: 'pixelated' }} />
                            <MiraSprite pose="contenta" label="Mira" />
                        </div>
                        <p className="font-serif text-lg text-titanium-100">Elige un personaje y completamos su ficha juntos.</p>
                        <p className="max-w-md text-[13px] text-titanium-400 leading-relaxed">El Arquitecto compara la ficha con lo que tu manuscrito dice, te muestra qué falta y te entrevista. Al final te propone la ficha actualizada con tus palabras y tú decides si se guarda.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto">
                        <div className="max-w-[820px] mx-auto px-4 sm:px-8 py-6 space-y-6">
                            {narrow && (
                                <button onClick={() => setSel(null)} className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-2 text-sm text-titanium-300 hover:text-titanium-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                    ← Tus personajes
                                </button>
                            )}
                            <header className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-xl font-medium text-titanium-100">{cur.nombre}</h2>
                                    <span className={`rounded px-1.5 py-px text-[10px] ${ROL_STYLE[cur.rol] || ROL_STYLE.secundario}`}>{cur.rol}</span>
                                    {cur.tipo !== 'personaje' && <span className="text-[11px] text-titanium-500">{cur.tipo}</span>}
                                    <span className="ml-auto">
                                        {cur.fichaFileId ? (
                                            <button onClick={() => onOpenFile?.(cur.fichaFileId!)} className="inline-flex items-center gap-1.5 rounded-md border border-titanium-700 px-2.5 py-1 text-[11px] text-titanium-300 hover:bg-titanium-800"><FileText size={12} /> Abrir «{cur.fichaNombre}»</button>
                                        ) : <span className="inline-flex items-center gap-1 text-[11px] text-amber-300/80"><Ghost size={12} /> Sin ficha</span>}
                                    </span>
                                </div>
                                {!!cur.alias.length && <p className="text-[12px] text-titanium-500">También: {cur.alias.join(', ')}</p>}
                                {cur.resumen && <p className="text-[13px] text-titanium-300">{cur.resumen}</p>}
                                {!!cur.archivos.length && <p className="text-[11px] text-titanium-600">Aparece en: {cur.archivos.join(', ')}</p>}
                            </header>

                            {cur.fichaFileId && <FichaBlock fileId={cur.fichaFileId} name={cur.nombre} accessToken={accessToken} />}

                            {(() => {
                                const names = [cur.nombre, ...cur.alias].map(n => n.trim().toLowerCase()).filter(n => n.length >= 3);
                                const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const re = names.length ? new RegExp(`(^|[^\\p{L}])(${names.map(esc).join('|')})([^\\p{L}]|$)`, 'iu') : null;
                                const mine = re ? ideas.filter(i => re.test(i.name)) : [];
                                if (!mine.length) return null;
                                return (
                                    <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4">
                                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300/80"><Lightbulb size={12} aria-hidden="true" /> Ideas y diseños · no canon</p>
                                        <p className="mt-1 text-[11.5px] text-titanium-500">Viven en Recursos → Ideas. Abrirlas no las vuelve canon: lo que quieras conservar, pásalo tú a la ficha.</p>
                                        <ul className="mt-2 flex flex-wrap gap-1.5">
                                            {mine.slice(0, 8).map(i => (
                                                <li key={i.id}>
                                                    <button onClick={() => onOpenFile?.(i.id)} className="inline-flex items-center gap-1.5 rounded-md border border-amber-800/40 px-2.5 py-1 text-[11.5px] text-amber-100/85 hover:bg-amber-900/20">
                                                        {/^diseño\b/i.test(i.name) ? <Palette size={12} aria-hidden="true" /> : <FileText size={12} aria-hidden="true" />} {i.name}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}

                            {/* Revisión */}
                            <div className="rounded-xl border border-titanium-800 bg-titanium-950/40 p-4">
                                <div className="flex items-center gap-2">
                                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-titanium-500">{cur.fichaFileId ? 'Revisión de la ficha' : 'Lo que ya sabe tu manuscrito'}</p>
                                    <button onClick={() => run('analyze')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-2.5 py-1 text-[11px] text-titanium-100 disabled:opacity-50">
                                        {busy === 'analyze' ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />} {analisis ? 'Revisar de nuevo' : 'Revisar'}{costSuffix('~US$0,03')}
                                    </button>
                                </div>
                                {busy === 'detail' ? <div className="py-4 text-titanium-600"><Loader2 size={14} className="animate-spin" /></div>
                                    : !analisis ? <p className="mt-2 text-[12px] text-titanium-500">Compara la ficha con lo que dice tu manuscrito: qué está definido, qué falta y dónde se contradicen.</p>
                                        : (
                                            <div className="mt-3 space-y-4 text-[12.5px] text-titanium-300 leading-relaxed">
                                                <p className="text-titanium-100">{analisis.resumen}</p>
                                                {!!analisis.tiene?.length && (
                                                    <div>
                                                        <p className="mb-1 text-[10px] uppercase tracking-wider text-emerald-500/80">Ya definido</p>
                                                        <ul className="space-y-0.5">{analisis.tiene.map((t, i) => <li key={i} className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0 text-emerald-500/70" />{t}</li>)}</ul>
                                                    </div>
                                                )}
                                                {!!analisis.falta?.length && (
                                                    <div>
                                                        <p className="mb-1 text-[10px] uppercase tracking-wider text-amber-500/80">Falta</p>
                                                        <div className="space-y-2">{analisis.falta.map((f, i) => (
                                                            <div key={i} className="rounded-md bg-titanium-900/60 p-2.5">
                                                                <p className="font-medium text-titanium-100">{f.aspecto}</p>
                                                                <p className="text-titanium-400">{f.porQue}</p>
                                                                <p className="mt-1 flex gap-1.5 text-mira/90"><HelpCircle size={12} className="mt-0.5 shrink-0" />{f.pregunta}</p>
                                                            </div>
                                                        ))}</div>
                                                    </div>
                                                )}
                                                {!!analisis.choques?.length && (
                                                    <div>
                                                        <p className="mb-1 text-[10px] uppercase tracking-wider text-red-400/80">Choques con tu manuscrito</p>
                                                        <div className="space-y-2">{analisis.choques.map((c, i) => (
                                                            <div key={i} className="rounded-md border border-red-900/40 bg-red-950/10 p-2.5 space-y-1">
                                                                <p className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-400" />{c.explicacion}</p>
                                                                {c.citaFicha && <p className="border-l-2 border-titanium-700 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-titanium-600">Ficha: </span>«{c.citaFicha}»</p>}
                                                                {c.citaTexto && <p className="border-l-2 border-mira/40 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-mira">{c.fuente || 'Manuscrito'}: </span>«{c.citaTexto}»</p>}
                                                            </div>
                                                        ))}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                            </div>

                            {/* Entrevista */}
                            <div className="rounded-xl border border-titanium-800 bg-titanium-950/40 p-4">
                                <div className="flex items-center gap-2">
                                    <p className="flex-1 text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Entrevista para completar la ficha</p>
                                    {!!mensajes.length && <button onClick={resetInterview} className="p-1 text-titanium-500 hover:text-titanium-200" title="Empezar de nuevo"><RotateCcw size={12} /></button>}
                                    <button onClick={propose} disabled={!!busy || !mensajes.some(m => m.role === 'user')} className="inline-flex items-center gap-1.5 rounded-md bg-mira/15 hover:bg-mira/25 px-2.5 py-1 text-[11px] text-white disabled:opacity-40" title="Propone la ficha con lo que respondiste; tú la apruebas antes de guardar">
                                        {busy === 'propose' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} {cur.fichaFileId ? 'Proponer ficha actualizada' : 'Proponer ficha'}
                                    </button>
                                </div>
                                {!mensajes.length ? (
                                    <div className="mt-3">
                                        <p className="text-[12px] text-titanium-500">El Arquitecto te hace una pregunta a la vez, a partir de lo que falta y de lo que ya dice tu manuscrito. Tú respondes; nada se escribe sin tu aprobación.</p>
                                        <button onClick={() => run('interview')} disabled={!!busy} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-3 py-1.5 text-[12px] text-titanium-100 disabled:opacity-50">
                                            {busy === 'interview' ? <Loader2 size={12} className="animate-spin" /> : <HelpCircle size={12} />} Empezar entrevista
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-3 space-y-3">
                                        {mensajes.map((m, i) => m.role === 'user' ? (
                                            <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-titanium-800/70 px-3.5 py-2 text-[13px] text-titanium-100 whitespace-pre-wrap">{m.text}</div></div>
                                        ) : (
                                            <div key={i} className="prose prose-invert prose-sm max-w-none text-titanium-200"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.text}</ReactMarkdown></div>
                                        ))}
                                        {busy === 'interview' && <div className="text-titanium-500"><Loader2 size={13} className="animate-spin" /></div>}
                                        <div ref={endRef} />
                                        <div className="flex items-end gap-2 rounded-xl border border-titanium-700 bg-titanium-900/80 px-3 py-2 focus-within:border-mira/60">
                                            <textarea value={input} onChange={e => setInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim() && !busy) { const t = input.trim(); setInput(''); run('interview', t); } } }}
                                                rows={Math.min(6, Math.max(1, input.split('\n').length))} placeholder="Tu respuesta…"
                                                className="flex-1 resize-none bg-transparent text-[13px] text-titanium-100 placeholder:text-titanium-600 outline-none py-1" />
                                            <button onClick={() => { const t = input.trim(); if (!t) return; setInput(''); run('interview', t); }} disabled={!input.trim() || !!busy} className="p-2 rounded-lg bg-mira/15 text-white hover:bg-mira/25 disabled:opacity-30"><Send size={14} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Propuesta: diferencia y aprobación */}
            {prop && cur && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-xl border border-titanium-700 bg-titanium-900 shadow-2xl">
                        <div className="flex items-center gap-2 border-b border-titanium-800 px-5 py-3">
                            <p className="flex-1 text-sm font-medium text-titanium-100">{prop.fileId ? `Ficha de ${cur.nombre}: cambios propuestos` : `Nueva ficha de ${cur.nombre}`}</p>
                            <button onClick={() => setEditMode(v => !v)} className="rounded px-2 py-1 text-[11px] text-titanium-400 hover:bg-titanium-800 hover:text-titanium-100">{editMode ? 'Ver cambios' : 'Editar a mano'}</button>
                            <button onClick={() => setProp(null)} className="text-titanium-500 hover:text-titanium-200"><X size={16} /></button>
                        </div>
                        {!!prop.cambios?.length && (
                            <ul className="border-b border-titanium-800 px-5 py-2 text-[12px] text-titanium-300 space-y-0.5">
                                {prop.cambios.map((c, i) => <li key={i} className="flex gap-1.5"><span className="text-emerald-400">+</span>{c}</li>)}
                            </ul>
                        )}
                        <div className="flex-1 overflow-y-auto p-4">
                            {editMode ? (
                                <textarea value={prop.propuesta} onChange={e => setProp({ ...prop, propuesta: e.target.value })} className="h-[55vh] w-full rounded-md border border-titanium-700 bg-titanium-950 p-3 font-mono text-[12.5px] leading-relaxed text-titanium-200 outline-none" />
                            ) : (
                                <div className="whitespace-pre-wrap font-serif text-[14px] leading-relaxed">
                                    {/* Nov 2026: la ficha como texto, no como código: lo nuevo con un borde verde, lo que sale tachado. */}
                                    {diff.map((l, i) => (
                                        <div key={i} className={l.type === 'add' ? 'border-l-2 border-logro pl-3 text-titanium-50' : l.type === 'del' ? 'border-l-2 border-red-400/60 pl-3 text-red-300/80 line-through' : 'border-l-2 border-transparent pl-3 text-titanium-400'}>
                                            {(l.text || ' ').replace(/^#+\s/, '')}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 border-t border-titanium-800 px-5 py-3">
                            {!prop.fileId && (
                                <label className="flex items-center gap-2 text-[12px] text-titanium-400">
                                    <FilePlus2 size={13} /> Carpeta:
                                    <select value={carpeta} onChange={e => setCarpeta(e.target.value)} className="max-w-[320px] rounded border border-titanium-700 bg-titanium-950 px-2 py-1 text-[12px] text-titanium-200">
                                        <option value="">Elige…</option>
                                        {carpetas.map(c => <option key={c.id} value={c.id}>{c.path}</option>)}
                                    </select>
                                </label>
                            )}
                            <span className="ml-auto text-[11px] text-titanium-600">{prop.fileId ? (textHash(prop.original) === textHash(prop.propuesta) ? 'Sin cambios' : 'Se guarda en tu Drive.') : 'Se crea en tu Drive.'}</span>
                            <button onClick={() => setProp(null)} className="rounded-md px-3 py-1.5 text-[12px] text-titanium-400 hover:text-titanium-100">Cancelar</button>
                            <button onClick={save} disabled={busy === 'save' || (!prop.fileId && !carpeta)} className="inline-flex items-center gap-1.5 rounded-md bg-coral text-on-coral hover:brightness-110 px-4 py-1.5 text-[12px] font-medium disabled:opacity-40">
                                {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aprobar y guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
