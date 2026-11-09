import React, { useEffect, useMemo, useState } from 'react';
import { DraftingCompass, MessageCircle, PenLine } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { useArquitectoStore } from '../../stores/useArquitectoStore';
import { useMisionesEditor } from '../../hooks/useMisionesEditor';
import { MiraSprite } from '../mira/MiraSprite';
import { getTips } from '../mira/tips';
import { readLastDoc, LastDoc, syncLastDoc, LAST_DOC_EVENT } from '../../utils/lastDoc';
import { localDayKey } from '../../utils/dayKey';

// La Casa: lo primero que ves al entrar a un proyecto con historia.
// Nov 2026: Mira te dice dónde lo dejaste y qué sigue (según el plan de la mesa del arquitecto), con un botón para
// volver al último documento que escribiste. Si todavía no hay plan, lo dice y te invita a armarlo.
interface ContinueCardProps {
    projectName: string;
    folderId?: string;
    sessionId?: string | null;
    onGoToArquitecto: () => void;
    onGoToDirector: () => void;
    onContinue?: (doc: LastDoc) => void;
    onAskMira?: (message: string) => void;
    onNewChapter?: () => void; // Nov 2026: proyecto nuevo: el primer paso es escribir
}

const STR = {
    es: {
        hi: (h: number) => (h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'),
        architect: 'La mesa del arquitecto', architectP: 'Planos, hilos y dudas por resolver',
        mira: 'Hablar con Mira', miraP: 'Pregúntale por tu mundo',
        week: 'Esta semana', days: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], sky: 'tu mundo',
        weekP: (full: number, touch: number) => full || touch
            ? `${full} ${full === 1 ? 'día' : 'días'} escribiendo${touch ? ` · ${touch} con pocas palabras` : ''}. Descansar un día no rompe la racha.`
            : 'Todavía no escribes esta semana. Con unas líneas basta para empezar.',
        tip: 'Tip del rincón',
    },
    en: {
        hi: (h: number) => (h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening'),
        architect: 'The architect’s table', architectP: 'Plans, threads and open questions',
        mira: 'Talk to Mira', miraP: 'Ask her about your world',
        week: 'This week', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], sky: 'your world',
        weekP: (full: number, touch: number) => full || touch
            ? `${full} ${full === 1 ? 'day' : 'days'} writing${touch ? ` · ${touch} with just a few words` : ''}. A rest day doesn’t break the streak.`
            : 'No writing yet this week. A few lines are enough to start.',
        tip: 'Tip of the day',
    },
};

// Un día cuenta como «escrito» desde 100 palabras; menos es un toque (un título, una nota).
const FULL_DAY = 100;
function weekActivity(): number[] {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // lunes = 0
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(now.getDate() - dow + i);
        try { return parseInt(localStorage.getItem(`myword_daily_${localDayKey(d)}`) || '0', 10) || 0; } catch { return 0; }
    });
}

function lastSentence(tail: string): string {
    // Nov 2026: solo prosa (sin títulos, metadatos ni citas del sistema).
    const paras = tail.split(/\n+/).map(p => p.trim().replace(/#+\s.*$/, '').trim())
        .filter(p => p && !/^(#+\s|>|---|[a-z_]+:\s|[-*•]\s)/i.test(p));
    const p = paras[paras.length - 1] || '';
    if (p.length <= 180) return p;
    const cut = p.slice(-180);
    const k = cut.search(/[.!?…»]\s+\S/);
    return '…' + (k >= 0 ? cut.slice(k + 1).trim() : cut.trim());
}

function since(at: number, es: boolean): string {
    const days = Math.floor((Date.now() - at) / 86400000);
    if (days <= 0) return es ? 'hoy' : 'today';
    if (days === 1) return es ? 'ayer' : 'yesterday';
    return es ? `hace ${days} días` : `${days} days ago`;
}

const PLAN_SNOOZE = 'mw-plan-snooze';

export default function ContinueCard({ projectName, folderId, sessionId, onGoToArquitecto, onGoToDirector, onContinue, onAskMira, onNewChapter }: ContinueCardProps) {
    const { currentLanguage } = useLanguageStore();
    const es = currentLanguage === 'es';
    const s = es ? STR.es : STR.en;
    const tips = getTips(currentLanguage);
    const tip = tips[new Date().getDate() % tips.length];
    const weekRaw = useMemo(weekActivity, []);
    const today = (new Date().getDay() + 6) % 7;
    const stars = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 97, y: (i * 23) % 62, big: i % 7 === 0, d: (i % 5) * 0.7 })), []);
    // Nov 2026: también desde la nube (otro computador u otro navegador).
    const [lastTick, setLastTick] = useState(0);
    useEffect(() => {
        const on = () => setLastTick(t => t + 1);
        window.addEventListener(LAST_DOC_EVENT, on);
        syncLastDoc(folderId);
        return () => window.removeEventListener(LAST_DOC_EVENT, on);
    }, [folderId]);
    const last = useMemo(() => readLastDoc(folderId), [folderId, lastTick]);
    // Nov 2026: si escribiste hoy (o esta semana) pero pegaste el texto de golpe, la meta no lo contaba y la tarjeta
    // decía «Todavía no escribes esta semana» al lado de «La última vez escribiste… hoy». El día del último documento cuenta.
    const week = useMemo(() => {
        if (!last?.at) return weekRaw;
        const now = new Date(); const dow = (now.getDay() + 6) % 7;
        const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - dow);
        const i = Math.floor((last.at - monday.getTime()) / 86400000);
        return i >= 0 && i < 7 && !weekRaw[i] ? weekRaw.map((w, k) => (k === i ? 1 : w)) : weekRaw;
    }, [weekRaw, last?.at]);
    const { misiones } = useMisionesEditor(sessionId || null);
    const pendingItems = useArquitectoStore(st => st.arquitectoPendingItems);
    const nextMission = misiones.find(m => !m.completed);
    const openItems = (pendingItems || []).filter(p => !p.resolved);
    const hasPlan = misiones.length > 0 || openItems.length > 0;
    const [snoozed, setSnoozed] = useState(() => { try { return Date.now() < parseInt(localStorage.getItem(PLAN_SNOOZE) || '0', 10); } catch { return false; } });
    const full = week.filter(w => w >= FULL_DAY).length;
    const touch = week.filter(w => w > 0 && w < FULL_DAY).length;

    const next = nextMission
        ? { label: es ? 'Lo que sigue, según tu plan' : 'What’s next, from your plan', text: nextMission.text }
        : openItems.length
            ? { label: es ? `Lo que sigue: ${openItems.length} ${openItems.length === 1 ? 'duda pendiente' : 'dudas pendientes'} en la mesa` : `What’s next: ${openItems.length} open ${openItems.length === 1 ? 'question' : 'questions'} at the table`, text: openItems[0].title }
            : null;

    const askMira = () => onAskMira?.(es
        ? `Vuelvo a escribir${last ? ` después de ${since(last.at, true)}` : ''}. ${last ? `Lo último que toqué fue «${last.name}». ` : ''}¿Dónde me quedé y qué me toca escribir ahora? Ten en cuenta mi plan, mi memoria del proyecto y lo que hablé con el Arquitecto, y dime si me falta definir algo para no escribir sin rumbo.`
        : `I'm coming back to writing${last ? ` after ${since(last.at, false)}` : ''}. ${last ? `The last thing I worked on was "${last.name}". ` : ''}Where did I leave off and what should I write next? Use my plan, project memory and what I discussed with the Architect, and tell me if I need to define something so I'm not writing aimlessly.`);

    const miraLine = last
        ? (next
            ? (es ? `La última vez escribiste en «${last.name}», ${since(last.at, true)}. Te dejo lo que sigue para retomar.` : `Last time you wrote in "${last.name}", ${since(last.at, false)}. Here’s what’s next so you can pick it up.`)
            : (es ? `La última vez escribiste en «${last.name}», ${since(last.at, true)}. Todavía no tenemos un plan, así que no sé con certeza qué sigue.` : `Last time you wrote in "${last.name}", ${since(last.at, false)}. We don’t have a plan yet, so I can’t be sure what’s next.`))
        : (es ? 'Abre un capítulo de tus documentos o empieza uno nuevo. Cuando vuelvas, te digo dónde lo dejaste.' : 'Open a chapter from your documents or start a new one. When you come back, I’ll tell you where you left off.');

    return (
        <div className="flex-1 overflow-y-auto bg-titanium-950 p-6 md:p-10">
            <div className="max-w-5xl mx-auto flex flex-col gap-6">
                {/* Ventana al cielo */}
                <div className="relative h-32 sm:h-56 rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(180deg,#0B0A12 0 35%,#100E1A 35% 62%,#1A1630 62%)' }}>
                    {stars.map((st, i) => (
                        <span key={i} aria-hidden className="absolute animate-pulse motion-reduce:animate-none" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.big ? 4 : 2, height: st.big ? 4 : 2, background: st.big ? '#B9AEE0' : '#FFF4F4', animationDelay: `${st.d}s`, animationDuration: '3.6s' }} />
                    ))}
                    <svg aria-hidden viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute left-0 bottom-0 w-full h-20"><path d="M0 50 Q 250 10 520 40 T 1000 30 V80 H0 Z" fill="#17282B" /><rect x="0" y="66" width="1000" height="14" fill="#1F3D35" /></svg>
                    <svg aria-hidden width="320" height="140" viewBox="0 0 320 140" className="absolute right-8 top-5 hidden sm:block">
                        <g stroke="#B9AEE0" strokeOpacity=".4" strokeWidth="1.2" fill="none"><polyline points="20,90 80,50 140,70 200,30" /><polyline points="140,70 190,110 260,96 300,60" /></g>
                        <g fill="#FFF4F4"><rect x="18" y="88" width="4" height="4" /><rect x="78" y="48" width="4" height="4" /><rect x="137" y="67" width="7" height="7" fill="#FF9638" /><rect x="198" y="28" width="4" height="4" /><rect x="188" y="108" width="4" height="4" /><rect x="258" y="94" width="4" height="4" /><rect x="298" y="58" width="4" height="4" /></g>
                        <text x="150" y="92" fill="#FFD9B0" fontFamily="Figtree, sans-serif" fontSize="12">{projectName || s.sky}</text>
                    </svg>
                    <MiraSprite pose="saludo" label="Mira te saluda" className="absolute right-[38%] bottom-1 hidden md:block" />
                    <div className="absolute left-8 bottom-7">
                        <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-[#FFF4F4] text-balance">{s.hi(new Date().getHours())}.</h1>
                    </div>
                </div>

                {/* Donde lo dejaste — Mira señala la tarjeta */}
                <section aria-labelledby="cc-where" className="relative rounded-2xl border border-mira/40 bg-mira-bg p-5 md:pl-44 flex flex-col gap-3">
                    <MiraSprite pose="senalando" label="Mira señala dónde lo dejaste" className="hidden md:block absolute left-2 bottom-0" />
                    <h2 id="cc-where" className="text-xs font-semibold text-mira">{es ? 'Donde lo dejaste' : 'Where you left off'}</h2>
                    <p className="text-[15px] text-titanium-100 leading-relaxed" role="status">{miraLine}</p>
                    {last?.tail && lastSentence(last.tail) && (
                        <blockquote className="font-serif text-[16px] leading-relaxed text-titanium-200 border-l-2 border-mira/50 pl-3">«{lastSentence(last.tail)}»</blockquote>
                    )}
                    {next && (
                        <div className="rounded-xl bg-titanium-900/70 border border-titanium-700 px-4 py-3">
                            <div className="text-xs text-titanium-400">{next.label}</div>
                            <div className="text-[15px] text-titanium-100 mt-0.5">{next.text}</div>
                        </div>
                    )}
                    {last && !hasPlan && !snoozed && (
                        <div className="rounded-xl bg-titanium-900/70 border border-dashed border-mira/50 px-4 py-3 text-sm text-titanium-200 leading-relaxed">
                            {es
                                ? 'Sin plan también se escribe, pero es fácil perder el rumbo. Si le cuentas a la mesa del arquitecto hacia dónde va tu historia (aunque cambie después), la próxima vez te digo qué sigue.'
                                : 'You can write without a plan, but it’s easy to lose your way. Tell the architect’s table where your story is going (even if it changes later), and next time I’ll tell you what’s next.'}
                            <div className="mt-2 flex flex-wrap gap-3">
                                <button type="button" onClick={onGoToArquitecto} className="font-semibold text-mira hover:underline underline-offset-4">{es ? 'Armar el roadmap en la mesa' : 'Make a roadmap at the table'}</button>
                                <button type="button" onClick={() => { try { localStorage.setItem(PLAN_SNOOZE, String(Date.now() + 7 * 86400000)); } catch { /* sin almacenamiento */ } setSnoozed(true); }} className="text-titanium-400 hover:text-titanium-200">{es ? 'Voy explorando, avísame en una semana' : 'I’m exploring, remind me in a week'}</button>
                            </div>
                        </div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                        {!last && onNewChapter && (
                            <button type="button" onClick={onNewChapter} className="inline-flex items-center gap-2 rounded-xl bg-coral text-on-coral px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition">
                                <PenLine size={16} aria-hidden="true" /> {es ? 'Empezar un capítulo nuevo' : 'Start a new chapter'}
                            </button>
                        )}
                        {last && onContinue && (
                            <button type="button" onClick={() => onContinue(last)} className="inline-flex items-center gap-2 rounded-xl bg-coral text-on-coral px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition">
                                <PenLine size={16} /> {es ? 'Continuar donde lo dejaste' : 'Continue where you left off'}
                            </button>
                        )}
                        {onAskMira && (
                            <button type="button" onClick={askMira} className="rounded-xl border border-titanium-600 px-4 py-2.5 text-sm text-titanium-100 hover:border-mira transition-colors">
                                {es ? 'Preguntarle a Mira qué sigue' : 'Ask Mira what’s next'}
                            </button>
                        )}
                    </div>
                </section>

                <div className="grid gap-4 md:grid-cols-3">
                    <button onClick={onGoToArquitecto} className="text-left rounded-2xl border border-titanium-700 bg-titanium-800 hover:border-mira p-5 transition-colors flex flex-col gap-2 min-h-[120px]">
                        <img src="/assets/objetos/icono/planos.png" alt="" width={36} height={36} className="w-9 h-9" />
                        <span className="font-serif text-lg text-titanium-100">{s.architect}</span>
                        <span className="text-sm text-titanium-400">{s.architectP}</span>
                    </button>
                    <button onClick={onGoToDirector} className="text-left rounded-2xl border border-titanium-700 bg-titanium-800 hover:border-mira p-5 transition-colors flex flex-col gap-2 min-h-[120px]">
                        <img src="/assets/mira/mira_cara_icono.png" alt="" width={36} height={36} className="w-9 h-9 mira-rim" />
                        <span className="font-serif text-lg text-titanium-100">{s.mira}</span>
                        <span className="text-sm text-titanium-400">{s.miraP}</span>
                    </button>
                    <div className="rounded-2xl border border-titanium-700 bg-titanium-800 p-5 flex flex-col gap-3">
                        <span className="font-semibold text-titanium-100 text-sm">{s.week}</span>
                        <div className="grid grid-cols-7 gap-1.5">
                            {week.map((w, i) => (
                                <div key={i} className="flex flex-col items-center gap-1" title={w ? `${w} ${es ? 'palabras' : 'words'}` : undefined}>
                                    <span className={`w-7 h-7 rounded-lg border ${w >= FULL_DAY ? 'bg-logro border-logro' : w > 0 ? 'border-logro bg-[linear-gradient(to_top,var(--mw-orange)_35%,transparent_35%)]' : i === today ? 'border-mira' : 'border-titanium-600'}`} />
                                    <span className="text-[11px] text-titanium-400">{s.days[i]}</span>
                                </div>
                            ))}
                        </div>
                        <span className="text-xs text-titanium-400">{s.weekP(full, touch)}</span>
                    </div>
                </div>

                <div className="rounded-2xl bg-mira-bg border border-mira/40 p-5 flex items-end gap-4">
                    <img src="/assets/objetos/libros.png" alt="" width={72} height={72} className="w-[72px] h-[72px] shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="pb-1">
                        <div className="text-xs font-semibold text-mira">{s.tip}</div>
                        <div className="font-serif text-lg text-titanium-100 mt-1">{tip.title}</div>
                        <div className="text-sm text-titanium-300 mt-1 max-w-xl">{tip.text}</div>
                        <button type="button" onClick={() => window.dispatchEvent(new Event('OPEN_TIPS'))} className="mt-3 text-sm font-semibold text-mira underline underline-offset-4">{currentLanguage === 'es' ? 'Abrir el rincón de tips' : 'Open the tips corner'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
