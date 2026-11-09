// Oct 2026: Reporte de capítulo — panel lateral del editor.
// Pide a Claude un reporte del capítulo abierto; cada punto trae la cita exacta para ubicarlo
// ("Ir"), la ortografía se puede corregir con un clic y los puntos se marcan como hechos.
import React, { useEffect, useMemo, useState } from 'react';
import { MiraSprite } from '../mira/MiraSprite';
import { X, FileSearch, Loader2, LocateFixed, Check, RefreshCw, BookOpen, Sparkles, AlertTriangle, SpellCheck, ShieldCheck, Users, HelpCircle, MessageSquareQuote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { textHash } from '../../utils/textHash';
import { locateQuote, locateWord } from '../../utils/locateQuote';

interface Strength { titulo: string; explicacion: string; cita?: string }
interface Problem { tipo: string; gravedad: 'alta' | 'media' | 'baja'; titulo: string; explicacion: string; sugerencia: string; citas?: string[] }
interface Spelling { original: string; correccion: string; cita?: string; nota?: string }
interface Reading { titulo: string; autor: string; tipo?: string; deSusReferencias?: boolean; porque: string }
interface ReaderView { veredicto: string; seEntiende?: 'si' | 'a medias' | 'no'; confusiones?: string[] }
interface ReaderReply { punto: string; coincide: boolean; explicacion: string; cita?: string }
interface Question { pregunta: string; cita?: string; tema?: string }
interface Report { resumen: string; fortalezas: Strength[]; problemas: Problem[]; ortografia: Spelling[]; lecturas: Reading[]; siguientePaso?: string; lector?: ReaderView; respuestaLector?: ReaderReply[]; preguntas?: Question[] }
const TIPO_LABEL: Record<string, string> = { pov: 'punto de vista', continuidad: 'continuidad', ritmo: 'ritmo', dialogo: 'diálogo', claridad: 'claridad', tono: 'tono', estructura: 'estructura', reparto: 'reparto', personaje: 'personajes' };
// Oct 2026: el Tribunal y el Guardián viven ahora dentro del reporte.
interface Voice { veredicto: string; lectura: string; nota?: number; citas?: string[] }
interface Voices { arquitecto?: Voice; bardo?: Voice; hater?: Voice }
interface Contradiction { tipo: string; gravedad: 'alta' | 'media' | 'baja'; titulo: string; explicacion: string; citaCapitulo?: string; citaCanon?: string; fuente?: string; sugerencia?: string }
interface Doubt { pregunta: string; citaCapitulo?: string; fuente?: string; resuelta?: boolean; estado?: string; decision?: string; chat?: { role: 'autor' | 'mira'; text: string }[]; cambio?: { archivo?: string; texto?: string } | null; llevarA?: string; aplicadoEn?: string }
interface CanonCheck { resumen: string; contradicciones: Contradiction[]; dudas: Doubt[]; archivos?: string[] }

// Nov 2026: «Antes de juzgar». El reporte pregunta cuando algo parece deliberado (otro narrador en este capítulo,
// un salto de tiempo…). Si el autor dice que es a propósito y por qué, queda como excepción del libro y ya no se señala.
function QuestionItem({ q, fileName, answered, onAnswered, goBtn }: { q: Question; fileName: string; answered?: string; onAnswered: (how: string) => void; goBtn: React.ReactNode }) {
    const [why, setWhy] = useState('');
    const [busy, setBusy] = useState(false);
    const keep = async () => {
        const text = why.trim();
        if (text.length < 3) { toast.info('Cuéntale por qué, en una frase.'); return; }
        setBusy(true);
        try {
            await callFunction('miraTaller', { mode: 'povException', where: fileName || 'este capítulo', why: text });
            onAnswered('apropósito');
            toast.success('Anotado como decisión de tu libro. No se volverá a señalar.');
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setBusy(false); }
    };
    return (
        <div className={`rounded-lg border border-mira/40 bg-titanium-950/40 p-3 space-y-2 ${answered ? 'opacity-60' : ''}`}>
            <div className="flex items-start gap-2">
                <HelpCircle size={14} className="mt-0.5 shrink-0 text-mira" aria-hidden="true" />
                <p className="flex-1 text-titanium-100 leading-relaxed">{q.pregunta}</p>
                {goBtn}
            </div>
            {answered ? (
                <p className="text-xs text-titanium-400">{answered === 'apropósito' ? 'Es a propósito: quedó en las decisiones de tu libro.' : 'Era un desliz: corrígelo cuando reescribas.'}</p>
            ) : (
                <>
                    <label className="sr-only" htmlFor={`q-${q.pregunta.slice(0, 12)}`}>Por qué lo hiciste así</label>
                    <textarea id={`q-${q.pregunta.slice(0, 12)}`} value={why} onChange={e => setWhy(e.target.value)} rows={2} placeholder="Si es a propósito, cuéntale por qué (p. ej. «este capítulo lo narra Daniel»)"
                        className="w-full rounded-lg bg-titanium-900 border border-titanium-700 px-2.5 py-2 text-[13px] text-titanium-100 placeholder:text-titanium-500 focus:border-mira/70 focus-visible:outline-none" />
                    <div className="flex flex-wrap gap-2">
                        <button onClick={keep} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-coral text-on-coral px-3 py-1.5 text-[13px] font-medium disabled:opacity-50">
                            {busy && <Loader2 size={13} className="animate-spin" aria-hidden="true" />} Es a propósito
                        </button>
                        <button onClick={() => onAnswered('error')} className="rounded-lg border border-titanium-700 px-3 py-1.5 text-[13px] text-titanium-200 hover:border-titanium-500">Fue un desliz</button>
                    </div>
                </>
            )}
        </div>
    );
}

// Nov 2026: cada duda del Guardián se responde en un minichat con Mira. Si se resuelve, queda en la memoria;
// si cambia un archivo del canon, Mira propone el texto y se añade con un clic; si toca la estructura, va al Arquitecto.
function DoubtItem({ d, index, fileId, fileName, accessToken, onUpdate, goBtn, onAskArquitecto }: { d: Doubt; index: number; fileId: string; fileName: string; accessToken?: string | null; onUpdate: (dudas: Doubt[]) => void; goBtn: React.ReactNode; onAskArquitecto?: (text: string) => void }) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState<'' | 'chat' | 'apply'>('');
    const chat = d.chat || [];
    const send = async () => {
        const text = draft.trim();
        if (!text) return;
        setBusy('chat');
        try {
            const r = await callFunction<any>('chapterReport', { mode: 'duda', fileId, fileName, index, mensajes: [...chat, { role: 'autor', text }], accessToken: accessToken || undefined }, { timeout: 120000 });
            if (r?.dudas) onUpdate(r.dudas);
            setDraft('');
        } catch (e: any) { toast.error(e?.message || 'Mira no pudo responder.'); }
        finally { setBusy(''); }
    };
    const apply = async () => {
        setBusy('apply');
        try {
            const r = await callFunction<any>('chapterReport', { mode: 'aplicarDuda', fileId, fileName, index, accessToken: accessToken || undefined });
            if (r?.dudas) onUpdate(r.dudas);
            toast.success(`Añadido a «${r?.archivo || d.cambio?.archivo}».`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar el cambio.'); }
        finally { setBusy(''); }
    };
    if (d.resuelta) {
        return (
            <div className="rounded-md border border-titanium-800 bg-titanium-950/40 p-2">
                <p className="flex items-start gap-1.5 text-titanium-400"><Check size={12} className="mt-0.5 shrink-0 text-logro" /><span className="line-through decoration-titanium-600">{d.pregunta}</span></p>
                {d.decision && <p className="mt-1 pl-[18px] text-titanium-200">{d.decision}{d.aplicadoEn ? <span className="text-titanium-500"> · añadido a {d.aplicadoEn}</span> : null}</p>}
            </div>
        );
    }
    return (
        <div className="rounded-md bg-titanium-950/40 p-2 space-y-2">
            <div className="flex items-start gap-1.5">
                <p className="flex-1">{d.pregunta}{d.fuente ? <span className="text-titanium-600"> · {d.fuente}</span> : null}</p>
                {goBtn}
            </div>
            {!open && !chat.length && <button onClick={() => setOpen(true)} className="text-[12px] font-medium text-mira hover:underline">Responder</button>}
            {(open || chat.length > 0) && (
                <div className="space-y-2 border-t border-titanium-800 pt-2">
                    {chat.map((m, i) => (
                        <p key={i} className={m.role === 'mira' ? 'rounded-lg rounded-bl-sm bg-mira-bg border border-mira/40 px-2.5 py-1.5 text-titanium-100' : 'ml-6 rounded-lg rounded-br-sm bg-titanium-800 px-2.5 py-1.5 text-titanium-200'}>{m.text}</p>
                    ))}
                    {d.estado === 'cambio' && d.cambio?.texto && (
                        <div className="rounded-lg border border-dashed border-mira/50 p-2 space-y-1.5">
                            <p className="text-[11px] text-titanium-400">Propuesta para «{d.cambio.archivo || d.fuente}»:</p>
                            <p className="whitespace-pre-wrap text-titanium-200">{d.cambio.texto}</p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={apply} disabled={!!busy} className="rounded-lg bg-coral px-2.5 py-1 text-[12px] font-semibold text-on-coral disabled:opacity-50">{busy === 'apply' ? 'Guardando…' : `Añadir a «${d.cambio.archivo || d.fuente}»`}</button>
                            </div>
                        </div>
                    )}
                    {d.llevarA === 'arquitecto' && onAskArquitecto && (
                        <button onClick={() => onAskArquitecto(`Tengo una duda del canon sobre «${fileName}»: ${d.pregunta}\n\nLo que decidí con Mira: ${d.decision || chat.filter(m => m.role === 'autor').map(m => m.text).join(' ')}\n\n¿Cómo afecta esto la estructura del libro y qué capítulos habría que ajustar o reescribir?`)}
                            className="text-[12px] font-medium text-mira hover:underline">Hablarlo con el Arquitecto</button>
                    )}
                    <div className="flex items-end gap-1.5">
                        <label className="sr-only" htmlFor={`duda-${index}`}>Tu respuesta</label>
                        <textarea id={`duda-${index}`} value={draft} onChange={e => setDraft(e.target.value)} rows={2} autoFocus={open && !chat.length}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                            placeholder={chat.length ? 'Responde a Mira…' : 'Tu respuesta: qué es cierto en tu historia…'}
                            className="flex-1 resize-none rounded-lg border border-titanium-700 bg-titanium-900 p-2 text-[13px] text-titanium-100 placeholder-titanium-500 focus:border-mira/70 focus-visible:outline-none" />
                        <button onClick={send} disabled={!!busy || !draft.trim()} className="rounded-lg bg-coral px-3 py-2 text-[12px] font-semibold text-on-coral disabled:opacity-40">{busy === 'chat' ? <Loader2 size={13} className="animate-spin" /> : 'Enviar'}</button>
                    </div>
                </div>
            )}
        </div>
    );
}
type Extra = 'voices' | 'canon';
const VOICE_META: { key: keyof Voices; nombre: string; enfoque: string; color: string }[] = [
    { key: 'arquitecto', nombre: 'El Arquitecto', enfoque: 'estructura y lógica', color: 'text-sky-300' },
    { key: 'bardo', nombre: 'El Bardo', enfoque: 'voz, prosa y emoción', color: 'text-purple-300' },
    { key: 'hater', nombre: 'El Hater', enfoque: 'dónde dejaría de leer', color: 'text-red-300' },
];
const TIPO_CANON: Record<string, string> = { hecho: 'hecho', cronologia: 'cronología', ley: 'ley del mundo', personaje: 'personaje' };

interface Props {
    fileId: string;
    fileName: string;
    accessToken?: string | null;
    watchAlerts?: { titulo: string; explicacion: string; citaCapitulo?: string; citaCanon?: string; fuente?: string }[];
    getText: () => string;
    reveal: (from: number, to: number) => void;
    replace: (from: number, to: number, text: string) => void;
    onClose: () => void;
    onAskArquitecto?: (text: string) => void;
}

const GRAVEDAD: Record<string, string> = {
    alta: 'bg-red-500/15 text-red-300 border-red-500/30',
    media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    baja: 'bg-titanium-700/40 text-titanium-300 border-titanium-600/40',
};

export default function ChapterReportPanel({ fileId, fileName, accessToken, watchAlerts = [], getText, reveal, replace, onClose, onAskArquitecto }: Props) {
    const [report, setReport] = useState<Report | null>(null);
    const [meta, setMeta] = useState<{ createdAt?: string; contentHash?: string }>({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [voices, setVoices] = useState<Voices | null>(null);
    const [canon, setCanon] = useState<CanonCheck | null>(null);
    const [extraHash, setExtraHash] = useState<{ voices?: string; canon?: string }>({});
    const [busy, setBusy] = useState<Record<Extra, boolean>>({ voices: false, canon: false });
    // Nov 2026: opiniones de lectores reales (un amigo que leyó el capítulo); el reporte las responde.
    const [lectores, setLectores] = useState<{ texto: string; fecha: string }[]>([]);
    const [lectorDraft, setLectorDraft] = useState('');
    const [lectorOpen, setLectorOpen] = useState(false);
    const [savingLector, setSavingLector] = useState(false);
    const doneKey = `myworld_report_done_${fileId}`;
    const [done, setDone] = useState<Record<string, boolean>>(() => {
        try { return JSON.parse(localStorage.getItem(doneKey) || '{}'); } catch { return {}; }
    });

    useEffect(() => {
        let alive = true;
        setLoading(true);
        callFunction<any>('chapterReport', { mode: 'get', fileId })
            .then(r => {
                if (!alive || !r?.found) return;
                if (r.report) { setReport(r.report); setMeta({ createdAt: r.createdAt, contentHash: r.contentHash }); }
                if (r.voices) setVoices(r.voices);
                if (r.canon) setCanon(r.canon);
                if (Array.isArray(r.lectores)) setLectores(r.lectores);
                setExtraHash({ voices: r.voicesHash, canon: r.canonHash });
            })
            .catch(() => {})
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [fileId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const toggleDone = (k: string) => {
        setDone(prev => {
            const next = { ...prev, [k]: !prev[k] };
            try { localStorage.setItem(doneKey, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
            return next;
        });
    };

    const generate = async () => {
        const text = getText();
        if (text.trim().length < 300) { toast.warning('El capítulo es muy corto para un reporte.'); return; }
        setGenerating(true);
        try {
            const r = await callFunction<any>('chapterReport', { mode: 'generate', fileId, fileName, content: text, accessToken: accessToken || undefined }, { timeout: 300000 });
            if (!r) throw new Error('Sin respuesta del servidor.');
            setReport(r.report);
            setMeta({ createdAt: r.createdAt, contentHash: r.contentHash });
            setDone(prev => {
                const next = Object.fromEntries(Object.entries(prev).filter(([key]) => key.startsWith('v') || key.startsWith('c')));
                try { localStorage.setItem(doneKey, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
                return next;
            });
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo generar el reporte.');
        } finally {
            setGenerating(false);
        }
    };

    const runExtra = async (kind: Extra) => {
        const text = getText();
        if (text.trim().length < 300) { toast.warning('El capítulo es muy corto para revisarlo.'); return; }
        setBusy(b => ({ ...b, [kind]: true }));
        try {
            const r = await callFunction<any>('chapterReport', { mode: kind, fileId, fileName, content: text }, { timeout: 300000 });
            if (kind === 'voices') { setVoices(r.voices); setExtraHash(h => ({ ...h, voices: r.voicesHash })); }
            else { setCanon(r.canon); setExtraHash(h => ({ ...h, canon: r.canonHash })); }
            const k = kind === 'voices' ? 'v' : 'c';
            setDone(prev => {
                const next = Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith(k)));
                try { localStorage.setItem(doneKey, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
                return next;
            });
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo hacer la revisión.');
        } finally {
            setBusy(b => ({ ...b, [kind]: false }));
        }
    };

    const goTo = (quote?: string) => {
        if (!quote) { toast.info('Este punto no trae una cita para ubicarlo.'); return; }
        const pos = locateQuote(getText(), quote);
        if (!pos) { toast.warning('No encontré ese pasaje: puede que ya lo hayas cambiado.'); return; }
        reveal(pos.from, pos.to);
    };
    // Nov 2026: en ortografía se ubica la palabra exacta (dentro de su cita, o su primera aparición).
    const goToWord = (s: Spelling) => {
        const pos = locateWord(getText(), s.original, s.cita);
        if (!pos) { toast.warning(`No encontré «${s.original}»: puede que ya lo hayas corregido.`); return; }
        reveal(pos.from, pos.to);
    };

    const fix = (s: Spelling, k: string) => {
        const text = getText();
        const area = s.cita ? locateQuote(text, s.cita) : null;
        let pos: { from: number; to: number } | null = null;
        if (area) {
            const hit = locateWord(text, s.original, s.cita);
            if (hit && hit.to - hit.from === s.original.length && text.slice(hit.from, hit.to) === s.original) pos = hit;
        }
        if (!pos) {
            const first = text.indexOf(s.original);
            if (first >= 0 && text.indexOf(s.original, first + 1) < 0) pos = { from: first, to: first + s.original.length };
        }
        if (!pos) { toast.warning(`No pude ubicar «${s.original}» con seguridad. Usa «Ir» y corrígelo a mano.`); return; }
        replace(pos.from, pos.to, s.correccion);
        if (!done[k]) toggleDone(k);
    };

    const saveLector = async (quitar?: number) => {
        if (quitar === undefined && lectorDraft.trim().length < 10) { toast.warning('Pega lo que te dijo el lector (al menos una frase).'); return; }
        setSavingLector(true);
        try {
            const r = await callFunction<any>('chapterReport', quitar === undefined ? { mode: 'lector', fileId, fileName, texto: lectorDraft } : { mode: 'lector', fileId, fileName, quitar });
            setLectores(r?.lectores || []);
            if (quitar === undefined) { setLectorDraft(''); setLectorOpen(false); toast.success('Guardé lo que dijo tu lector. El próximo reporte lo responde punto por punto.'); }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar.');
        } finally {
            setSavingLector(false);
        }
    };

    const renderLector = () => (
        <section className="rounded-xl border border-titanium-700 bg-titanium-950/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
                <MessageSquareQuote size={14} className="text-mira shrink-0" />
                <h3 className="flex-1 text-[13px] font-semibold text-titanium-100">Lo que dijo un lector real</h3>
                {!lectorOpen && <button onClick={() => setLectorOpen(true)} className="text-[12px] text-mira hover:underline">{lectores.length ? 'Añadir otro' : 'Añadir'}</button>}
            </div>
            {!lectores.length && !lectorOpen && <p className="text-titanium-400">¿Alguien leyó este capítulo? Pega lo que te dijo, tal cual. El reporte le responde punto por punto y suma lo que se le haya escapado.</p>}
            {lectores.map((l, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-titanium-900 border border-titanium-800 p-2">
                    <p className="flex-1 whitespace-pre-wrap text-titanium-300 line-clamp-4">{l.texto}</p>
                    <button onClick={() => saveLector(i)} disabled={savingLector} className="p-1 text-titanium-500 hover:text-red-300" aria-label="Quitar esta opinión"><Trash2 size={12} /></button>
                </div>
            ))}
            {lectorOpen && (
                <div className="space-y-2">
                    <label className="sr-only" htmlFor="lector-draft">Opinión del lector</label>
                    <textarea id="lector-draft" value={lectorDraft} onChange={e => setLectorDraft(e.target.value)} rows={5} autoFocus
                        placeholder="Ej.: «Demasiados personajes se presentan de golpe. La mitad del tiempo no se entiende quién habla…»"
                        className="w-full rounded-lg border border-titanium-700 bg-titanium-900 p-2 text-[13px] text-titanium-100 placeholder-titanium-500 focus:border-mira/70 focus-visible:outline-none" />
                    <div className="flex items-center gap-2">
                        <button onClick={() => saveLector()} disabled={savingLector} className="rounded-lg bg-coral px-3 py-1.5 text-[12px] font-semibold text-on-coral disabled:opacity-50">{savingLector ? 'Guardando…' : 'Guardar'}</button>
                        <button onClick={() => { setLectorOpen(false); setLectorDraft(''); }} className="rounded-lg px-3 py-1.5 text-[12px] text-titanium-300 hover:bg-titanium-800">Cancelar</button>
                    </div>
                </div>
            )}
            {!!lectores.length && report && !report.respuestaLector?.length && !lectorOpen && (
                <button onClick={generate} disabled={generating} className="text-[12px] font-medium text-mira hover:underline">Rehacer el reporte con esta opinión</button>
            )}
        </section>
    );

    const stale = useMemo(() => !!(meta.contentHash && report && textHash(getText()) !== meta.contentHash), [meta.contentHash, report, getText]);
    const fecha = meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '';

    const Item = ({ k, children }: { k: string; children: React.ReactNode }) => (
        <div className={`rounded-lg border border-titanium-800 bg-titanium-950/60 p-3 transition-opacity ${done[k] ? 'opacity-45' : ''}`}>
            <div className="flex gap-2">
                <button onClick={() => toggleDone(k)} className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${done[k] ? 'bg-emerald-600 border-emerald-600' : 'border-titanium-600'}`} aria-label="Marcar como hecho">
                    {done[k] && <Check size={11} className="text-white" />}
                </button>
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );

    const nowHash = (voices || canon) ? textHash(getText()) : '';

    const ExtraIntro = ({ kind, icon, title, text, cost }: { kind: Extra; icon: React.ReactNode; title: string; text: string; cost: string }) => (
        <div className="rounded-lg border border-dashed border-titanium-700 p-3">
            <p className="flex items-center gap-1.5 font-medium text-titanium-100">{icon} {title}</p>
            <p className="mt-1 text-titanium-400">{text}</p>
            <button onClick={() => runExtra(kind)} disabled={busy[kind]} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-3 py-1.5 text-[11px] text-titanium-100 disabled:opacity-50">
                {busy[kind] ? <><Loader2 size={12} className="animate-spin" /> Leyendo…</> : <><Sparkles size={12} /> Revisar · {cost}</>}
            </button>
        </div>
    );

    const ExtraHeader = ({ kind, icon, title }: { kind: Extra; icon: React.ReactNode; title: string }) => (
        <div className="flex items-center gap-2">
            <h3 className="flex flex-1 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500">{icon} {title}</h3>
            {extraHash[kind] && nowHash && extraHash[kind] !== nowHash && <span className="text-[10px] text-amber-300/80">el texto cambió</span>}
            <button onClick={() => runExtra(kind)} disabled={busy[kind]} className="p-1 rounded text-titanium-500 hover:text-titanium-100 disabled:opacity-40" title="Revisar de nuevo">
                <RefreshCw size={12} className={busy[kind] ? 'animate-spin' : ''} />
            </button>
        </div>
    );

    const renderWatch = () => !watchAlerts.length ? null : (
        <section className="space-y-2 rounded-lg border border-red-800/40 bg-red-950/10 p-3">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-300/90"><AlertTriangle size={12} /> El Guardián vio esto al guardar</h3>
            {watchAlerts.map((a, i) => (
                <div key={i} className="space-y-1">
                    <p className="font-medium text-titanium-100">{a.titulo}</p>
                    <p>{a.explicacion}</p>
                    {a.citaCapitulo && (
                        <div className="flex items-start gap-1.5">
                            <span className="flex-1 border-l-2 border-titanium-700 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-titanium-600">Tu capítulo: </span>«{a.citaCapitulo}»</span>
                            <GoBtn quote={a.citaCapitulo} />
                        </div>
                    )}
                    {a.citaCanon && <p className="border-l-2 border-emerald-800/60 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-emerald-500/80">{a.fuente || 'Canon'}: </span>«{a.citaCanon}»</p>}
                </div>
            ))}
        </section>
    );

    const renderCanon = () => !canon ? (
        <ExtraIntro kind="canon" icon={<ShieldCheck size={13} className="text-emerald-400" />} title="Coherencia con tu canon"
            text="El Guardián compara el capítulo con tus fichas, reglas y capítulos anteriores, y te muestra solo las contradicciones que puede demostrar con las dos citas." cost="~US$0,05" />
    ) : (
        <section className="space-y-2">
            <ExtraHeader kind="canon" icon={<ShieldCheck size={12} />} title={`Coherencia con tu canon${canon.contradicciones?.length ? ` (${canon.contradicciones.length})` : ''}`} />
            <p className="text-titanium-300">{canon.resumen}</p>
            {(canon.contradicciones || []).map((c, i) => (
                <Item key={`c${i}`} k={`c${i}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded border px-1.5 py-px text-[10px] ${GRAVEDAD[c.gravedad] || GRAVEDAD.baja}`}>{c.gravedad}</span>
                        <span className="text-[10px] text-titanium-500">{TIPO_CANON[c.tipo] || c.tipo}</span>
                    </div>
                    <p className="mt-1 font-medium text-titanium-100">{c.titulo}</p>
                    <p className="mt-1">{c.explicacion}</p>
                    {c.citaCapitulo && (
                        <div className="mt-1.5 flex items-start gap-1.5">
                            <span className="flex-1 border-l-2 border-titanium-700 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-titanium-600">Tu capítulo: </span>«{c.citaCapitulo}»</span>
                            <GoBtn quote={c.citaCapitulo} />
                        </div>
                    )}
                    {c.citaCanon && (
                        <p className="mt-1 border-l-2 border-emerald-800/60 pl-2 italic text-titanium-400"><span className="not-italic text-[10px] text-emerald-500/80">{c.fuente || 'Canon'}: </span>«{c.citaCanon}»</p>
                    )}
                    {c.sugerencia && <p className="mt-1 text-emerald-300/90"><b>Qué hacer:</b> {c.sugerencia}</p>}
                </Item>
            ))}
            {!!canon.dudas?.length && (
                <div className="space-y-1.5 pt-1">
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-titanium-400"><HelpCircle size={11} /> Dudas para ti ({canon.dudas.filter(x => !x.resuelta).length} por resolver)</p>
                    {canon.dudas.map((d, i) => (
                        <DoubtItem key={i} d={d} index={i} fileId={fileId} fileName={fileName} accessToken={accessToken}
                            onUpdate={(dudas) => setCanon(c => (c ? { ...c, dudas } : c))}
                            goBtn={d.citaCapitulo ? <GoBtn quote={d.citaCapitulo} /> : null}
                            onAskArquitecto={onAskArquitecto} />
                    ))}
                </div>
            )}
            {!!canon.archivos?.length && <p className="text-[10px] text-titanium-600">Comparado con: {canon.archivos.join(', ')}</p>}
        </section>
    );

    const renderVoices = () => !voices ? (
        <ExtraIntro kind="voices" icon={<Users size={13} className="text-sky-400" />} title="Tres lecturas"
            text="Tres lectores leen el capítulo cada uno a su manera: estructura (el Arquitecto), voz y emoción (el Bardo) y dónde dejaría de leer alguien exigente (el Hater)." cost="~US$0,04" />
    ) : (
        <section className="space-y-2">
            <ExtraHeader kind="voices" icon={<Users size={12} />} title="Tres lecturas" />
            {VOICE_META.map((m, i) => {
                const v = voices[m.key];
                if (!v) return null;
                return (
                    <Item key={`v${i}`} k={`v${i}`}>
                        <div className="flex items-baseline gap-2">
                            <p className={`font-medium ${m.color}`}>{m.nombre}</p>
                            <span className="text-[10px] text-titanium-500">{m.enfoque}</span>
                            {typeof v.nota === 'number' && <span className="ml-auto text-[11px] text-titanium-400">{v.nota}/10</span>}
                        </div>
                        <p className="mt-1 text-titanium-100">{v.veredicto}</p>
                        <p className="mt-1">{v.lectura}</p>
                        {(v.citas || []).filter(Boolean).map((c, j) => (
                            <div key={j} className="mt-1.5 flex items-start gap-1.5">
                                <span className="flex-1 border-l-2 border-titanium-700 pl-2 italic text-titanium-400">«{c}»</span>
                                <GoBtn quote={c} />
                            </div>
                        ))}
                    </Item>
                );
            })}
        </section>
    );

    const GoBtn = ({ quote }: { quote?: string }) => (
        <button onClick={() => goTo(quote)} disabled={!quote} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-30" title="Ir al pasaje en el editor">
            <LocateFixed size={11} /> Ir
        </button>
    );

    return (
        <div className="fixed right-0 top-0 bottom-0 z-[150] w-[440px] max-w-[96vw] bg-titanium-900 border-l border-titanium-700 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-titanium-800">
                <div className="flex items-center gap-2 min-w-0">
                    <MiraSprite pose={((canon?.contradicciones?.length || 0) + watchAlerts.length) > 0 ? 'ojo' : 'contenta'} face label="Mira" className="shrink-0 -my-2" />
                    <div className="min-w-0">
                        <p className="font-serif text-base font-semibold text-titanium-100">El estudio <span className="font-sans text-xs font-normal text-titanium-400">· reporte del capítulo</span></p>
                        <p className="text-[11px] text-titanium-500 truncate">{fileName}{fecha ? ` · ${fecha}` : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {report && (
                        <button onClick={generate} disabled={generating} className="p-1.5 rounded text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 disabled:opacity-40" title="Generar de nuevo">
                            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-1.5 rounded text-titanium-500 hover:text-titanium-200" aria-label="Cerrar"><X size={16} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs text-titanium-300 leading-relaxed">
                {loading ? (
                    <div className="flex items-center gap-2 text-titanium-500"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
                ) : generating ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center text-titanium-400">
                        <MiraSprite pose="leyendo" label="Mira lee tu capítulo" />
                        <p role="status">Mira está leyendo el capítulo completo…<br /><span className="text-titanium-600">Tarda entre 30 segundos y 2 minutos.</span></p>
                    </div>
                ) : !report ? (
                    <div className="py-6 text-center space-y-3">
                        <MiraSprite pose="leyendo" className="mx-auto" />
                        <p className="text-titanium-300">Cuando termines un capítulo, pide un reporte: qué funciona, qué corregir y dónde está cada cosa en tu texto, ortografía con corrección de un clic y lecturas apoyadas en tus referencias. Debajo puedes pedir también la revisión del canon y las tres lecturas.</p>
                        <p className="text-titanium-600">Usa Claude · cuesta alrededor de US$0,10 por reporte.</p>
                        <button onClick={generate} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-purple-700/80 hover:bg-purple-600 px-4 py-2 text-xs font-medium text-white">
                            <Sparkles size={13} /> Generar reporte
                        </button>
                        <div className="pt-4 space-y-3 text-left">
                            {renderLector()}
                            {renderWatch()}
                            {renderCanon()}
                            {renderVoices()}
                        </div>
                    </div>
                ) : (
                    <>
                        {stale && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 p-2.5 text-amber-200/90">
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                <span>El texto cambió desde este reporte. Algunos «Ir» pueden no encontrar el pasaje. <button onClick={generate} className="underline">Generar de nuevo</button></span>
                            </div>
                        )}
                        <section>
                            <p className="text-titanium-100 text-[13px] leading-relaxed">{report.resumen}</p>
                            {report.siguientePaso && <p className="mt-2 text-purple-300"><b>Primer paso:</b> {report.siguientePaso}</p>}
                        </section>

                        {report.lector?.veredicto && (
                            <section className="rounded-xl border border-mira/40 bg-mira-bg p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <h3 className="flex-1 text-[13px] font-semibold text-titanium-100">Así le llega a un lector</h3>
                                    {report.lector.seEntiende && <span className={`rounded border px-1.5 py-px text-[10px] ${report.lector.seEntiende === 'si' ? GRAVEDAD.baja : report.lector.seEntiende === 'no' ? GRAVEDAD.alta : GRAVEDAD.media}`}>{report.lector.seEntiende === 'si' ? 'se entiende' : report.lector.seEntiende === 'no' ? 'no se entiende' : 'se entiende a medias'}</span>}
                                </div>
                                <p className="font-serif text-[14px] text-titanium-100">«{report.lector.veredicto}»</p>
                                {!!report.lector.confusiones?.length && (
                                    <ul className="list-disc pl-4 space-y-0.5">{report.lector.confusiones.map((c, i) => <li key={i}>{c}</li>)}</ul>
                                )}
                            </section>
                        )}

                        {!!report.preguntas?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[13px] font-semibold text-titanium-100">Antes de juzgar, una pregunta</h3>
                                <p className="text-titanium-400">Esto no lo cuento como problema: puede ser una decisión tuya.</p>
                                {report.preguntas.map((q, i) => (
                                    <QuestionItem key={i} q={q} fileName={fileName}
                                        answered={done['q' + i] ? (localStorage.getItem(`myworld_report_q_${fileId}_${i}`) || 'apropósito') : undefined}
                                        onAnswered={how => { try { localStorage.setItem(`myworld_report_q_${fileId}_${i}`, how); } catch { /* */ } if (!done['q' + i]) toggleDone('q' + i); }}
                                        goBtn={q.cita ? <GoBtn quote={q.cita} /> : null} />
                                ))}
                            </section>
                        )}

                        {!!report.respuestaLector?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Tu lector dijo… ({report.respuestaLector.length})</h3>
                                {report.respuestaLector.map((r, i) => (
                                    <div key={i} className="rounded-lg border border-titanium-800 bg-titanium-950/40 p-3">
                                        <div className="flex items-start gap-2">
                                            <span className={`mt-0.5 rounded border px-1.5 py-px text-[10px] ${r.coincide ? GRAVEDAD.alta : GRAVEDAD.baja}`}>{r.coincide ? 'tiene razón' : 'con matices'}</span>
                                            <p className="flex-1 font-medium text-titanium-100">{r.punto}</p>
                                            {r.cita && <GoBtn quote={r.cita} />}
                                        </div>
                                        <p className="mt-1">{r.explicacion}</p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {renderLector()}

                        {!!report.problemas?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Qué corregir ({report.problemas.length})</h3>
                                {report.problemas.map((p, i) => (
                                    <Item key={`p${i}`} k={`p${i}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`rounded border px-1.5 py-px text-[10px] ${GRAVEDAD[p.gravedad] || GRAVEDAD.baja}`}>{p.gravedad}</span>
                                            <span className="text-[10px] text-titanium-500">{TIPO_LABEL[p.tipo] || p.tipo}</span>
                                        </div>
                                        <p className="mt-1 font-medium text-titanium-100">{p.titulo}</p>
                                        <p className="mt-1">{p.explicacion}</p>
                                        <p className="mt-1 text-emerald-300/90"><b>Qué hacer:</b> {p.sugerencia}</p>
                                        {(p.citas || []).filter(Boolean).map((c, j) => (
                                            <div key={j} className="mt-1.5 flex items-start gap-1.5">
                                                <span className="flex-1 border-l-2 border-titanium-700 pl-2 italic text-titanium-400">«{c}»</span>
                                                <GoBtn quote={c} />
                                            </div>
                                        ))}
                                    </Item>
                                ))}
                            </section>
                        )}

                        {renderWatch()}
                        {renderCanon()}

                        {!!report.ortografia?.length && (
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><SpellCheck size={12} /> Ortografía y puntuación ({report.ortografia.length})</h3>
                                {report.ortografia.map((s, i) => (
                                    <Item key={`o${i}`} k={`o${i}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-red-300 line-through">{s.original}</span>
                                            <span className="text-titanium-600">→</span>
                                            <span className="text-emerald-300">{s.correccion}</span>
                                            <span className="ml-auto flex gap-1">
                                                <button onClick={() => goToWord(s)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-900/30" title="Ir a la palabra en el editor"><LocateFixed size={11} /> Ir</button>
                                                <button onClick={() => fix(s, `o${i}`)} disabled={!!done[`o${i}`]} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-30">
                                                    <Check size={11} /> Corregir
                                                </button>
                                            </span>
                                        </div>
                                        {s.nota && <p className="mt-1 text-titanium-500">{s.nota}</p>}
                                    </Item>
                                ))}
                            </section>
                        )}

                        {renderVoices()}

                        {!!report.fortalezas?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Lo que funciona</h3>
                                {report.fortalezas.map((f, i) => (
                                    <div key={i} className="rounded-lg border border-titanium-800 bg-titanium-950/40 p-3">
                                        <div className="flex items-start gap-2">
                                            <p className="flex-1 font-medium text-titanium-100">{f.titulo}</p>
                                            <GoBtn quote={f.cita} />
                                        </div>
                                        <p className="mt-1">{f.explicacion}</p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {!!report.lecturas?.length && (
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><BookOpen size={12} /> Para estudiar</h3>
                                {report.lecturas.map((l, i) => (
                                    <div key={i} className="rounded-lg border border-titanium-800 bg-titanium-950/40 p-3">
                                        <p className="text-titanium-100"><b>{l.titulo}</b>{l.autor ? ` — ${l.autor}` : ''}
                                            {l.tipo && <span className="ml-2 text-[10px] text-titanium-500">{l.tipo}</span>}
                                            {l.deSusReferencias && <span className="ml-2 rounded bg-purple-900/40 px-1.5 py-px text-[10px] text-purple-300">de tus referencias</span>}
                                        </p>
                                        <p className="mt-1">{l.porque}</p>
                                    </div>
                                ))}
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
