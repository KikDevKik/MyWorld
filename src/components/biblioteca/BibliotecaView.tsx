// Nov 2026: La biblioteca. Aprender y practicar con Mira, sin presión.
// Cuatro partes: para ti (lo que conviene reforzar, según tus conversaciones), practicar (ejercicios con opinión de Mira),
// aprender (lecciones, algunas hechas para ti) y decisiones del libro (punto de vista).
import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import RoomMira from '../mira/RoomMira';
import { callFunction } from '../../services/api';
import { LESSONS, Lesson } from './lessons';
import ParaTi, { toLesson } from './ParaTi';
import { useCraftFocus, OPEN_BIBLIOTECA_EVENT } from '../../hooks/useCraft';
import { requestTip, useTourStore, discoveredCount } from '../../tour/tourStore';
import ConoceTuCasa from '../../tour/ConoceTuCasa';

type Tab = 'parati' | 'decisiones' | 'practicar' | 'aprender' | 'casa';
interface Exercise { topic: string; voz?: string; titulo: string; consigna: string; objetivo: string; palabras: number; pista: string }
interface Feedback { resumen: string; funciona: { cita: string; porque: string }[]; mejorar: { cita: string; que: string }[]; siguiente: string }
interface Practice { id: string; exercise: Exercise; text: string; feedback: Feedback; at: string; words: number }

const TOPICS: { id: string; label: string }[] = [
    { id: 'sorpresa', label: 'Sorpréndeme' },
    { id: 'tercera_cercana', label: 'Tercera persona cercana' },
    { id: 'primera', label: 'Primera persona' },
    { id: 'dialogo', label: 'Quién habla' },
    { id: 'presentar', label: 'Presentar a un personaje' },
    { id: 'relacion', label: 'Una relación de años' },
    { id: 'dilema', label: 'Un dilema' },
    { id: 'pov', label: 'Punto de vista' },
    { id: 'narradora', label: 'Narrar recordando' },
    { id: 'sentido', label: 'Un sentido' },
    { id: 'estudio', label: 'Lo que vi en una serie' },
];

// Nov 2026: cualquier tema se puede practicar en cualquier voz.
const VOICES: { id: string; label: string }[] = [
    { id: '', label: 'La que elija Mira' },
    { id: 'libro', label: 'La de mi libro' },
    { id: 'primera', label: 'Primera persona' },
    { id: 'tercera_cercana', label: 'Tercera cercana' },
    { id: 'tercera_todo', label: 'Tercera que lo sabe todo' },
];

const NARRATORS = [
    { id: 'primera', text: 'narra la protagonista en primera persona', label: 'Primera persona: la protagonista cuenta («yo»)', gain: 'El lector vive lo que siente por dentro: el humor y el dolor llegan directo.', cost: 'Solo sabe lo que ella sabe y ve.' },
    { id: 'tercera_cerca', text: 'tercera persona pegada a la protagonista', label: 'Tercera persona pegada a ella («ella»)', gain: 'Cercanía con algo de distancia; puedes describirla desde fuera.', cost: 'Su voz propia se oye menos.' },
    { id: 'tercera_todo', text: 'narrador en tercera persona que lo sabe todo', label: 'Tercera persona que lo sabe todo', gain: 'Puedes contar lo que pasa lejos y lo que piensan todos.', cost: 'Es fácil perder la intimidad con la protagonista.' },
    { id: 'varias', text: 'varias voces, alternando por capítulos', label: 'Varias voces, por capítulos', gain: 'Cada capítulo muestra otra mirada.', cost: 'Cada voz tiene que sonar distinta, o se confunden.' },
];
const DISTANCES = [
    { id: 'vive', text: 'narra mientras lo vive, sin saber qué viene', label: 'Mientras lo vive', hint: 'No sabe qué viene: el lector descubre todo con ella.' },
    { id: 'recuerda', text: 'narra ya mayor, recordando', label: 'Ya mayor, recordando', hint: 'Puede adelantar algo («todavía no sabía que…») y mirar con humor lo que vivió.' },
    { id: 'final', text: 'narra desde el final del propio libro', label: 'Desde el final del libro', hint: 'La última escena cierra el círculo: el lector llega a donde ella empezó a recordar.' },
];

const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60';
const btnSecondary = 'inline-flex items-center gap-2 px-4 py-2 text-sm text-titanium-100 rounded-lg border border-titanium-700 hover:border-titanium-500 disabled:opacity-50';
const card = 'rounded-2xl border border-titanium-700 bg-titanium-900 px-5 py-4';
const inputCls = 'w-full rounded-xl bg-titanium-900 border border-titanium-700 px-3 py-2.5 text-[15px] text-titanium-100 placeholder:text-titanium-500 focus:border-mira/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/30';
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

// Nov 2026: un capítulo o un personaje puede narrarse distinto a propósito. Anotarlo aquí evita que el reporte,
// Mira o el Arquitecto lo señalen como error (y si no está anotado, preguntan antes de juzgar).
function ExceptionForm({ inputCls, btnSecondary, onSaved }: { inputCls: string; btnSecondary: string; onSaved: (lines: { id: string; text: string }[]) => void }) {
    const [open, setOpen] = useState(false);
    const [where, setWhere] = useState('');
    const [why, setWhy] = useState('');
    const [busy, setBusy] = useState(false);
    const save = async () => {
        if (!where.trim() || !why.trim()) { toast.info('Di dónde y por qué.'); return; }
        setBusy(true);
        try {
            const r = await callFunction<{ lines: { id: string; text: string }[] }>('miraTaller', { mode: 'povException', where: where.trim(), why: why.trim() });
            if (r?.lines) onSaved(r.lines);
            setWhere(''); setWhy(''); setOpen(false);
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setBusy(false); }
    };
    if (!open) return <button onClick={() => setOpen(true)} className="mt-3 text-sm text-mira hover:text-titanium-50">+ Un capítulo o personaje que se narra distinto</button>;
    return (
        <div className="mt-3 flex flex-col gap-2 border-t border-titanium-800 pt-3">
            <label className="flex flex-col gap-1">
                <span className="text-sm text-titanium-300">¿Dónde? (capítulo, parte o personaje)</span>
                <input value={where} onChange={e => setWhere(e.target.value)} placeholder="Ej.: Capítulo 7, o los capítulos de Daniel" className={inputCls} />
            </label>
            <label className="flex flex-col gap-1">
                <span className="text-sm text-titanium-300">¿Cómo se narra y por qué?</span>
                <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Ej.: en tercera persona desde Daniel, porque Anna no está en esa escena" className={inputCls} />
            </label>
            <div className="flex gap-2">
                <button onClick={save} disabled={busy} className={btnSecondary}>{busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Guardar</button>
                <button onClick={() => setOpen(false)} className="text-sm text-titanium-400 hover:text-titanium-100 px-2">Cancelar</button>
            </div>
        </div>
    );
}

function Option({ name, checked, onChange, label, children }: { name: string; checked: boolean; onChange: () => void; label: string; children?: React.ReactNode }) {
    return (
        <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${checked ? 'border-mira/60 bg-mira/10' : 'border-titanium-700 hover:border-titanium-500'}`}>
            <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 accent-[var(--color-mira)] w-4 h-4 shrink-0" />
            <span className="min-w-0">
                <span className="block text-[15px] text-titanium-100">{label}</span>
                {children && <span className="block text-sm text-titanium-400 mt-0.5 leading-relaxed">{children}</span>}
            </span>
        </label>
    );
}

export default function BibliotecaView({ onClose }: { onClose: () => void }) {
    const [tab, setTab] = useState<Tab>(() => { try { return (localStorage.getItem('mw-biblioteca-tab') as Tab) || 'parati'; } catch { return 'parati'; } });
    useEffect(() => { try { localStorage.setItem('mw-biblioteca-tab', tab); } catch { /* sin almacenamiento */ } }, [tab]);
    useEffect(() => {
        const on = (e: Event) => { const t = (e as CustomEvent).detail?.tab as Tab | undefined; if (t) setTab(t); };
        window.addEventListener(OPEN_BIBLIOTECA_EVENT, on);
        return () => window.removeEventListener(OPEN_BIBLIOTECA_EVENT, on);
    }, []);
    const focos = useCraftFocus();

    // ── Decisiones ──
    const [book, setBook] = useState(() => { try { return localStorage.getItem('mw-biblioteca-book') || ''; } catch { return ''; } });
    const [narrator, setNarrator] = useState('');
    const [distance, setDistance] = useState('');
    const [tense, setTense] = useState('pasado');
    const [otherPov, setOtherPov] = useState(false);
    const [note, setNote] = useState('');
    const [decisions, setDecisions] = useState<{ id: string; text: string }[]>([]);
    const [saving, setSaving] = useState(false);
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [asking, setAsking] = useState(false);

    // ── Práctica ──
    const [topic, setTopic] = useState('sorpresa');
    const [voz, setVoz] = useState<string>(() => { try { return localStorage.getItem('mw-biblioteca-voz') ?? ''; } catch { return ''; } });
    const [practiceHint, setPracticeHint] = useState('');
    const [exercise, setExercise] = useState<Exercise | null>(null);
    const [draft, setDraft] = useState('');
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const [busy, setBusy] = useState<'exercise' | 'feedback' | null>(null);
    const [showHint, setShowHint] = useState(false);
    const [history, setHistory] = useState<Practice[]>([]);
    const [openPractice, setOpenPractice] = useState<string | null>(null);

    // ── Lecciones ──
    const [lesson, setLesson] = useState<Lesson | null>(null);

    useEffect(() => {
        callFunction<{ lines: { id: string; text: string }[] }>('miraTaller', { mode: 'decisions' }).then(r => r && setDecisions(r.lines)).catch(() => { /* vacío */ });
        callFunction<{ items: Practice[] }>('miraTaller', { mode: 'history' }).then(r => r && setHistory(r.items)).catch(() => { /* vacío */ });
    }, []);

    const saveDecision = async () => {
        const n = NARRATORS.find(x => x.id === narrator);
        if (!n) { toast.info('Elige primero quién narra.'); return; }
        setSaving(true);
        try {
            try { localStorage.setItem('mw-biblioteca-book', book); } catch { /* sin almacenamiento */ }
            const dist = narrator === 'primera' ? DISTANCES.find(x => x.id === distance)?.text : '';
            const r = await callFunction<{ text: string }>('miraTaller', {
                mode: 'decide', book: book.trim() || 'mi libro', narrator: n.text, distance: dist, tense,
                others: otherPov ? 'algunos capítulos cortos en tercera persona para lo que la protagonista no ve' : '', note,
            });
            toast.success('Decisión guardada. El Arquitecto, el reporte y Mira la van a respetar.');
            const d = await callFunction<{ lines: { id: string; text: string }[] }>('miraTaller', { mode: 'decisions' });
            if (d) setDecisions(d.lines); else if (r) setDecisions(prev => [...prev, { id: String(Date.now()), text: r.text }]);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar.');
        } finally { setSaving(false); }
    };

    const ask = async (q?: string) => {
        const text = (q ?? question).trim();
        if (!text) return;
        setAsking(true); setAnswer('');
        try {
            const r = await callFunction<{ respuesta: string }>('miraTaller', { mode: 'ask', question: text });
            setAnswer(r?.respuesta || '');
        } catch (e: any) { toast.error(e?.message || 'Mira no pudo responder.'); }
        finally { setAsking(false); }
    };

    const newExercise = async (t = topic, hint = practiceHint, v = voz) => {
        setBusy('exercise'); setFeedback(null); setShowHint(false);
        try { localStorage.setItem('mw-biblioteca-voz', v); } catch { /* */ }
        try {
            const r = await callFunction<{ exercise: Exercise }>('miraTaller', { mode: 'exercise', topic: t, hint, voz: v });
            if (r?.exercise) { setExercise(r.exercise); setDraft(''); }
        } catch (e: any) { toast.error(e?.message || 'Mira no pudo pensar un ejercicio.'); }
        finally { setBusy(null); }
    };

    const practiceTopic = (t: string, hint = '', v?: string) => {
        const vv = v ?? voz;
        setTopic(t); setPracticeHint(hint); if (v !== undefined) setVoz(v); setTab('practicar'); newExercise(t, hint, vv);
    };

    const askFeedback = async () => {
        if (!exercise) return;
        setBusy('feedback');
        try {
            const r = await callFunction<{ feedback: Feedback; id: string }>('miraTaller', { mode: 'feedback', exercise, text: draft });
            if (r?.feedback) {
                setFeedback(r.feedback);
                setHistory(h => [{ id: r.id, exercise, text: draft, feedback: r.feedback, at: new Date().toISOString(), words: words(draft) }, ...h].slice(0, 15));
            }
        } catch (e: any) { toast.error(e?.message || 'Mira no pudo leer tu texto.'); }
        finally { setBusy(null); }
    };

    const miraLine = useMemo(() => tab === 'parati'
        ? 'Lo que vamos notando al conversar. Poco a poco, sin prisa.'
        : tab === 'decisiones'
        ? 'Antes de escribir, decidamos quién cuenta tu historia. Si dudas, pregúntame.'
        : tab === 'casa' ? 'Cada cuarto tiene algo mío. Pídeme que te lo muestre cuando quieras.'
        : tab === 'practicar' ? 'Sin presión: esto no entra a tu libro. Es para soltar la mano.'
            : 'Lecciones cortas. Cuando una te sirva, practícala.', [tab]);

    // Nov 2026: «Conoce tu casa» (tutorial progresivo) vive aquí.
    const casaN = discoveredCount(useTourStore(s => s.seen));
    useEffect(() => { requestTip('biblioteca.intro'); }, []);
    const TABS: { id: Tab; label: string }[] = [
        { id: 'parati', label: focos.length ? `Para ti · ${focos.length}` : 'Para ti' },
        { id: 'practicar', label: 'Practicar' },
        { id: 'aprender', label: 'Aprender' },
        { id: 'decisiones', label: 'Decisiones del libro' },
        { id: 'casa', label: `Conoce tu casa · ${casaN}/9` },
    ];

    return (
        <div className="relative h-full w-full flex flex-col overflow-hidden bg-titanium-950">
            <RoomMira roomKey={`biblioteca-${tab}`} pose={tab === 'practicar' ? 'escribiendo' : 'leyendo'} line={miraLine} className="right-6 bottom-6" />
            <header className="shrink-0 flex items-center gap-3 border-b border-titanium-800 px-4 py-2.5">
                <button onClick={onClose} className="flex items-center gap-1.5 text-titanium-400 hover:text-titanium-100 p-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60" aria-label="Volver al escritorio"><ArrowLeft size={18} aria-hidden="true" /></button>
                <img src="/assets/objetos/icono/libros.png" alt="" width={28} height={28} className="w-7 h-7" style={{ imageRendering: 'pixelated' }} />
                <h1 className="font-serif text-lg text-titanium-100">La biblioteca</h1>
                <span className="text-sm text-titanium-400 hidden sm:inline">Aprende y practica con Mira</span>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="max-w-[820px] mx-auto px-4 sm:px-6 pt-5 pb-40 flex flex-col gap-6">
                    <div role="tablist" data-tour="biblioteca-tabs" aria-label="Partes de la biblioteca" className="flex gap-1 border-b border-titanium-800 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
                        {TABS.map(t => (
                            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                                className={`shrink-0 px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${tab === t.id ? 'border-mira text-titanium-50' : 'border-transparent text-titanium-400 hover:text-titanium-100'}`}>
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {tab === 'casa' && <ConoceTuCasa />}

                    {/* ── Para ti ── */}
                    {tab === 'parati' && (
                        <ParaTi
                            onPractice={hint => practiceTopic('sorpresa', hint)}
                            onOpenLesson={l => { setLesson(l); setTab('aprender'); }}
                            btnPrimary={btnPrimary} btnSecondary={btnSecondary} card={card} inputCls={inputCls}
                        />
                    )}

                    {/* ── Decisiones del libro ── */}
                    {tab === 'decisiones' && (
                        <>
                            <p className="text-[15px] text-titanium-200 leading-relaxed">
                                Quién cuenta la historia cambia todo el libro: qué sabe el lector, cómo suena el humor y qué tan cerca siente a la protagonista. Lo que decidas aquí lo respetan el Arquitecto, el reporte de capítulo y Mira.
                            </p>

                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm text-titanium-300">¿Para qué libro?</span>
                                <input name="libro" autoComplete="off" value={book} onChange={e => setBook(e.target.value)} placeholder="Ej.: El libro de Anna…" className={inputCls} />
                            </label>

                            <fieldset className="flex flex-col gap-2">
                                <legend className="font-serif text-lg text-titanium-100 mb-2">¿Quién cuenta la historia?</legend>
                                {NARRATORS.map(n => (
                                    <Option key={n.id} name="narrador" checked={narrator === n.id} onChange={() => setNarrator(n.id)} label={n.label}>
                                        <span className="text-titanium-300">Ganas:</span> {n.gain} <span className="text-titanium-300">Cuesta:</span> {n.cost}
                                    </Option>
                                ))}
                            </fieldset>

                            {narrator === 'primera' && (
                                <fieldset className="flex flex-col gap-2">
                                    <legend className="font-serif text-lg text-titanium-100 mb-2">¿Desde cuándo cuenta?</legend>
                                    {DISTANCES.map(d => (
                                        <Option key={d.id} name="distancia" checked={distance === d.id} onChange={() => setDistance(d.id)} label={d.label}>{d.hint}</Option>
                                    ))}
                                    <button onClick={() => { setLesson(LESSONS.find(l => l.id === 'narradora') || null); setTab('aprender'); }} className="self-start text-sm text-mira hover:text-titanium-50 mt-1">
                                        ¿Cómo suena una narradora que recuerda? Ver la lección
                                    </button>
                                </fieldset>
                            )}

                            {narrator && (
                                <>
                                    <fieldset>
                                        <legend className="font-serif text-lg text-titanium-100 mb-2">¿En qué tiempo?</legend>
                                        <div className="flex flex-wrap gap-2">
                                            {[['pasado', 'Pasado («caminé»)'], ['presente', 'Presente («camino»)']].map(([v, l]) => (
                                                <label key={v} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 cursor-pointer ${tense === v ? 'border-mira/60 bg-mira/10' : 'border-titanium-700 hover:border-titanium-500'}`}>
                                                    <input type="radio" name="tiempo" checked={tense === v} onChange={() => setTense(v)} className="accent-[var(--color-mira)] w-4 h-4" />
                                                    <span className="text-[15px] text-titanium-100">{l}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>
                                    {narrator === 'primera' && (
                                        <label className="flex items-start gap-3 cursor-pointer">
                                            <input type="checkbox" checked={otherPov} onChange={e => setOtherPov(e.target.checked)} className="mt-1 accent-[var(--color-coral)] w-4 h-4" />
                                            <span className="text-[15px] text-titanium-100">
                                                Algunos capítulos cortos en tercera persona
                                                <span className="block text-sm text-titanium-400">Para lo que ella no puede ver, como una escena entre sus padres. Úsalos pocas veces y por una razón clara.</span>
                                            </span>
                                        </label>
                                    )}
                                    <label className="flex flex-col gap-1.5">
                                        <span className="text-sm text-titanium-300">Algo más que quieras recordar (opcional)</span>
                                        <input name="nota" autoComplete="off" value={note} onChange={e => setNote(e.target.value)} placeholder="Ej.: la voz madura con ella a lo largo del libro…" className={inputCls} />
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        <button onClick={saveDecision} disabled={saving} className={btnPrimary}>
                                            {saving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} Guardar la decisión
                                        </button>
                                        <button onClick={() => practiceTopic('pov', `Compara ${NARRATORS.find(x => x.id === narrator)?.label} con otra opción${book ? ` para «${book}»` : ''}.`)} className={btnSecondary}>
                                            Probarlo antes en una escena
                                        </button>
                                    </div>
                                </>
                            )}

                            {decisions.length > 0 && (
                                <div className={card}>
                                    <h2 className="text-sm text-titanium-300 mb-2">Ya decidido</h2>
                                    <ul className="flex flex-col gap-1.5">
                                        {decisions.map(d => (
                                            <li key={d.id} className="flex items-start gap-3">
                                                <span className="flex-1 text-[15px] text-titanium-100 leading-relaxed">{d.text}</span>
                                                <button onClick={async () => { try { const r = await callFunction<{ lines: { id: string; text: string }[] }>('miraTaller', { mode: 'forgetDecision', lineId: d.id }); if (r) setDecisions(r.lines); } catch { toast.error('No se pudo quitar.'); } }}
                                                    className="shrink-0 text-sm text-titanium-500 hover:text-titanium-200">Quitar</button>
                                            </li>
                                        ))}
                                    </ul>
                                    <ExceptionForm inputCls={inputCls} btnSecondary={btnSecondary} onSaved={setDecisions} />
                                </div>
                            )}

                            <div className={card}>
                                <div className="flex items-start gap-3">
                                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0" style={{ imageRendering: 'pixelated' }} />
                                    <div className="min-w-0 flex-1 flex flex-col gap-3">
                                        <label htmlFor="pregunta-mira" className="text-[15px] text-titanium-100">¿Tienes una duda de oficio? Pregúntame y te respondo pensando en tu historia.</label>
                                        <textarea id="pregunta-mira" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ej.: ¿Escribo el libro de Anna en primera o en tercera persona?…" className={`${inputCls} resize-y`} />
                                        <div>
                                            <button onClick={() => ask()} disabled={asking || !question.trim()} className={btnPrimary}>
                                                {asking && <Loader2 size={15} className="animate-spin" aria-hidden="true" />} {asking ? 'Pensando…' : 'Preguntarle a Mira'}
                                            </button>
                                        </div>
                                        {answer && (
                                            <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 text-titanium-100" style={{ fontFamily: 'var(--font-serif)', fontSize: 16, lineHeight: 1.7 }} aria-live="polite">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Practicar ── */}
                    {tab === 'practicar' && (
                        <>
                            <p className="text-[15px] text-titanium-200 leading-relaxed">
                                Para cuando estás en pausa o no sabes qué escribir. Elige qué practicar y te propongo un ejercicio corto, con tus personajes si sirve. Es práctica: no entra a tu libro.
                            </p>
                            {practiceHint && (
                                <p className="text-sm text-titanium-300 flex items-center gap-2">
                                    <span><span className="text-mira">Enfoque: </span>{practiceHint.replace(/^Practicar:\s*/, '')}</span>
                                    <button onClick={() => setPracticeHint('')} className="text-titanium-500 hover:text-titanium-100 underline underline-offset-2">quitar</button>
                                </p>
                            )}
                            <h2 className="text-sm text-titanium-300 -mb-3">¿Qué practicar?</h2>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Qué practicar">
                                {TOPICS.map(t => (
                                    <button key={t.id} role="radio" aria-checked={topic === t.id} onClick={() => setTopic(t.id)}
                                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${topic === t.id ? 'border-mira/60 bg-mira/15 text-titanium-50' : 'border-titanium-700 text-titanium-300 hover:border-titanium-500'}`}>
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <h2 className="text-sm text-titanium-300 -mb-3">¿En qué voz?</h2>
                            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="En qué voz escribir">
                                {VOICES.filter(v => v.id !== 'libro' || decisions.some(d => d.text.startsWith('Punto de vista'))).map(v => (
                                    <button key={v.id || 'libre'} role="radio" aria-checked={voz === v.id} onClick={() => setVoz(v.id)}
                                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${voz === v.id ? 'border-mira/60 bg-mira/15 text-titanium-50' : 'border-titanium-700 text-titanium-300 hover:border-titanium-500'}`}>
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <button onClick={() => newExercise()} disabled={busy === 'exercise'} className={btnPrimary}>
                                    {busy === 'exercise' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                    {busy === 'exercise' ? 'Pensando un ejercicio…' : exercise ? 'Otro ejercicio' : 'Dame un ejercicio'}
                                </button>
                            </div>

                            {exercise && (
                                <div className={`${card} flex flex-col gap-3`}>
                                    <h2 className="font-serif text-xl text-titanium-100 text-pretty">{exercise.titulo}</h2>
                                    <p className="text-[15px] text-titanium-100 leading-relaxed">{exercise.consigna}</p>
                                    <p className="text-[15px] text-mira leading-relaxed"><span className="text-titanium-400">La idea es que: </span>{String(exercise.objetivo || '').replace(/^\s*la idea es que:?\s*/i, '')}</p>
                                    <p className="text-sm text-titanium-400">Unas {exercise.palabras} palabras.</p>
                                    {exercise.pista && (
                                        <div>
                                            <button onClick={() => setShowHint(v => !v)} aria-expanded={showHint} className="inline-flex items-center gap-1 text-sm text-mira hover:text-titanium-50">
                                                {showHint ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />} {showHint ? 'Ocultar la pista' : 'Ver una pista'}
                                            </button>
                                            {showHint && <p className="text-[15px] text-titanium-200 leading-relaxed mt-2">{exercise.pista}</p>}
                                        </div>
                                    )}
                                    <label htmlFor="practica-texto" className="sr-only">Tu texto</label>
                                    <textarea id="practica-texto" value={draft} onChange={e => setDraft(e.target.value)} rows={12} placeholder="Escribe aquí…"
                                        className={`${inputCls} resize-y leading-relaxed`} style={{ fontFamily: 'var(--font-serif)', fontSize: 17 }} />
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button onClick={askFeedback} disabled={busy === 'feedback' || words(draft) < 40} className={btnPrimary}>
                                            {busy === 'feedback' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                            {busy === 'feedback' ? 'Mira está leyendo…' : 'Pedir la opinión de Mira'}
                                        </button>
                                        <span className="text-sm text-titanium-400 tabular-nums">{words(draft)} palabras{words(draft) < 40 ? ' · mínimo 40 para opinar' : ''}</span>
                                    </div>
                                </div>
                            )}

                            {feedback && (
                                <div className={`${card} flex flex-col gap-3`} aria-live="polite">
                                    <div className="flex items-start gap-3">
                                        <img src="/assets/mira/mira_cara_icono.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0" style={{ imageRendering: 'pixelated' }} />
                                        <p className="text-[15px] text-titanium-100 leading-relaxed">{feedback.resumen}</p>
                                    </div>
                                    {feedback.funciona.length > 0 && (
                                        <div>
                                            <h3 className="text-sm text-logro mb-1.5">Lo que funciona</h3>
                                            <ul className="flex flex-col gap-2">{feedback.funciona.map((f, i) => <li key={i} className="text-[15px] text-titanium-200 leading-relaxed">{f.cita && <span className="font-serif text-titanium-100">«{f.cita}» </span>}{f.porque}</li>)}</ul>
                                        </div>
                                    )}
                                    {feedback.mejorar.length > 0 && (
                                        <div>
                                            <h3 className="text-sm text-amber-200 mb-1.5">Para mejorar</h3>
                                            <ul className="flex flex-col gap-2">{feedback.mejorar.map((f, i) => <li key={i} className="text-[15px] text-titanium-200 leading-relaxed">{f.cita && <span className="font-serif text-titanium-100">«{f.cita}» </span>}{f.que}</li>)}</ul>
                                        </div>
                                    )}
                                    {feedback.siguiente && <p className="text-[15px] text-mira"><span className="text-titanium-400">Para la próxima: </span>{feedback.siguiente}</p>}
                                </div>
                            )}

                            {history.length > 0 && (
                                <div className="border-t border-titanium-800 pt-4">
                                    <h2 className="text-sm text-titanium-300 mb-2">Tus prácticas</h2>
                                    <ul className="flex flex-col gap-2">
                                        {history.map(p => (
                                            <li key={p.id} className="rounded-xl border border-titanium-800 bg-titanium-900/60">
                                                <button onClick={() => setOpenPractice(openPractice === p.id ? null : p.id)} aria-expanded={openPractice === p.id} className="w-full flex items-center gap-3 px-4 py-2.5 text-left">
                                                    <span className="flex-1 min-w-0 text-[15px] text-titanium-100 truncate">{p.exercise?.titulo || 'Práctica'}</span>
                                                    <span className="text-sm text-titanium-400 shrink-0 tabular-nums">{p.words} palabras · {new Date(p.at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}</span>
                                                </button>
                                                {openPractice === p.id && (
                                                    <div className="px-4 pb-3 flex flex-col gap-2">
                                                        <p className="font-serif text-[15px] text-titanium-200 whitespace-pre-wrap leading-relaxed">{p.text}</p>
                                                        {p.feedback?.resumen && <p className="text-sm text-mira">{p.feedback.resumen}</p>}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Aprender ── */}
                    {tab === 'aprender' && !lesson && focos.some(f => f.leccion) && (
                        <section aria-label="Hechas para ti" className="flex flex-col gap-2">
                            <h2 className="text-sm text-titanium-300">Hechas para ti</h2>
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {focos.filter(f => f.leccion).map(f => (
                                    <li key={f.id}>
                                        <button onClick={() => setLesson(toLesson(f, f.leccion))} className={`${card} w-full h-full text-left border-mira/40 hover:border-mira/70 transition-colors`}>
                                            <span className="block font-serif text-lg text-titanium-100 text-pretty">{f.leccion.titulo || f.tema}</span>
                                            <span className="block text-sm text-titanium-300 mt-1 leading-relaxed">{f.leccion.resumen}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            <h2 className="text-sm text-titanium-300 mt-3">Para todos</h2>
                        </section>
                    )}
                    {tab === 'aprender' && !lesson && (
                        <ul className="grid gap-3 sm:grid-cols-2">
                            {LESSONS.map(l => (
                                <li key={l.id}>
                                    <button onClick={() => setLesson(l)} className={`${card} w-full h-full text-left hover:border-titanium-500 transition-colors`}>
                                        <span className="block font-serif text-lg text-titanium-100 text-pretty">{l.title}</span>
                                        <span className="block text-sm text-titanium-300 mt-1 leading-relaxed">{l.summary}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {tab === 'aprender' && lesson && (
                        <article className="flex flex-col gap-4">
                            <button onClick={() => setLesson(null)} className="self-start inline-flex items-center gap-1 text-sm text-titanium-400 hover:text-titanium-100"><ArrowLeft size={15} aria-hidden="true" /> Todas las lecciones</button>
                            <h2 className="font-serif text-2xl text-titanium-100 text-pretty">{lesson.title}</h2>
                            <p className="text-[16px] text-titanium-200 leading-relaxed">{lesson.summary}</p>
                            {lesson.body.map((b, i) => (
                                <section key={i}>
                                    {b.h && <h3 className="font-serif text-lg text-titanium-100 mb-1">{b.h}</h3>}
                                    <p className="text-[16px] text-titanium-200 leading-relaxed">{b.p}</p>
                                </section>
                            ))}
                            {lesson.example?.map((e, i) => (
                                <figure key={i} className="rounded-xl border border-titanium-700 bg-titanium-900 px-4 py-3">
                                    <figcaption className="text-sm text-titanium-400 mb-1">{e.label}</figcaption>
                                    <blockquote className="font-serif text-[16px] text-titanium-100 leading-relaxed border-l-2 border-mira/60 pl-3">{e.text}</blockquote>
                                </figure>
                            ))}
                            <div className="flex flex-wrap gap-2 pt-2">
                                <button onClick={() => practiceTopic(lesson.topic, lesson.hint || '', lesson.voz)} className={btnPrimary}>Practicar esto</button>
                                <button onClick={() => { setTab('decisiones'); setQuestion(`Sobre «${lesson.title}»: ¿cómo lo aplico en mi libro?`); }} className={btnSecondary}>Preguntarle a Mira por mi libro</button>
                            </div>
                        </article>
                    )}
                </div>
            </div>
        </div>
    );
}
