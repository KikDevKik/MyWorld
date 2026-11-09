import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MiraSprite, MiraBubble, MiraPose } from './MiraSprite';
import { getTips, getMiraPrefs, setMiraPrefs, MiraPrefs } from './tips';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { localDayKey } from '../../utils/dayKey';

/**
 * Mira en el escritorio.
 * - Mientras escribes: pequeña en su esquina, sin hablar.
 * - 5 minutos sin escribir: se duerme (Zzz), sin texto.
 * - Al volver a escribir: despierta y deja un tip que se va solo al seguir escribiendo.
 * - Meta del día cumplida o sesión larga: celebra y sugiere descansar.
 * - Una vez al día: ritual corto antes de empezar (opcional).
 */
const IDLE_MS = 5 * 60 * 1000;
const LONG_AWAY_MS = 20 * 60 * 1000;
const LONG_SESSION_MS = 50 * 60 * 1000;
const todayKey = () => `myword_daily_${localDayKey()}`;

type Bubble = { title?: string; text: string; rest?: boolean; until?: number; arrival?: boolean };

/** Nov 2026: al entrar al escritorio Mira repasa lo pendiente (plan y reporte) y pregunta cómo seguir. */
export interface DeskArrival { items: string[]; hasReport: boolean; review?: boolean }

const T = {
    es: {
        miraAria: 'Mira, tu compañera. Abre sus opciones', back: 'Volviste', backText: (s: string) => `Ibas por: «${s}». Sigue cuando quieras.`,
        goal: '¡Meta cumplida!', goalText: 'Llevas un buen rato escribiendo. Te mereces un descanso: estira, toma agua y vuelve cuando quieras.',
        long: 'Llevas casi una hora', longText: 'Buen trabajo. ¿Un descanso de 5 minutos? Tu texto queda guardado.',
        rest: 'Descansar 10 min', keep: 'Sigo un rato', resting: 'Descanso', restingText: 'Nos vemos en un rato. Tu capítulo queda guardado.',
        ritualT: 'Antes de empezar', ritualP: 'Diez segundos que ayudan a no perderse.', r1: 'Teléfono en otra habitación', r2: 'Agua cerca', r3: (g: number) => `Meta de hoy: ${g} palabras`,
        start: 'Empezar', skip: 'Saltar', never: 'No volver a mostrar',
        opts: 'Opciones de Mira', oTips: 'Tips al despertar', oRitual: 'Ritual antes de escribir', oHide: 'Ocultar a Mira',
        talk: 'Hablar con Mira', arrT: 'Antes de seguir', arrQ: '¿Sigues escribiendo o resolvemos pendientes?',
        aWrite: 'Seguir escribiendo', aReport: 'Ver el reporte', aNext: '¿Qué sigue?', aReview: 'Revisar el canon',
    },
    en: {
        miraAria: 'Mira, your companion. Open her options', back: 'Welcome back', backText: (s: string) => `You were at: “${s}”. Carry on whenever you like.`,
        goal: 'Goal reached!', goalText: 'You have been writing for a good while. You deserve a break: stretch, drink some water and come back whenever you like.',
        long: 'Almost an hour', longText: 'Great work. A 5-minute break? Your text is saved.',
        rest: 'Rest 10 min', keep: 'A bit longer', resting: 'Break', restingText: 'See you in a while. Your chapter is saved.',
        ritualT: 'Before you start', ritualP: 'Ten seconds that help you stay on track.', r1: 'Phone in another room', r2: 'Water nearby', r3: (g: number) => `Today’s goal: ${g} words`,
        start: 'Start', skip: 'Skip', never: 'Don’t show again',
        opts: 'Mira’s options', oTips: 'Tips when she wakes up', oRitual: 'Ritual before writing', oHide: 'Hide Mira',
        talk: 'Talk to Mira', arrT: 'Before you go on', arrQ: 'Keep writing or sort out what’s pending?',
        aWrite: 'Keep writing', aReport: 'See the report', aNext: 'What’s next?', aReview: 'Review the canon',
    },
};

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);
const lastSentence = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    const parts = t.split(/(?<=[.!?…])\s/);
    const last = parts[parts.length - 1] || '';
    return last.length > 90 ? '…' + last.slice(-90) : last;
};

interface Props { content: string; fileId?: string | null; isZenMode?: boolean; arrival?: DeskArrival | null; onOpenReport?: () => void; onAskMira?: (msg?: string) => void; onReviewCanon?: () => void }

const MiraDeskCompanion: React.FC<Props> = ({ content, fileId, arrival, onOpenReport, onAskMira, onReviewCanon }) => {
    const lang = useLanguageStore(s => s.currentLanguage) === 'es' ? 'es' : 'en';
    const t = T[lang];
    const tips = useMemo(() => getTips(lang), [lang]);
    const [prefs, setPrefs] = useState<MiraPrefs>(getMiraPrefs);
    const [pose, setPose] = useState<MiraPose>('neutral');
    const [bubble, setBubble] = useState<Bubble | null>(null);
    const [bubbleChars, setBubbleChars] = useState(0);
    const [menu, setMenu] = useState(false);
    const [ritual, setRitual] = useState(false);
    const [checks, setChecks] = useState([false, false, false]);

    const lastType = useRef(Date.now());
    const sessionStart = useRef(Date.now());
    const prevContent = useRef(content);
    const fileRef = useRef(fileId);
    const tipIdx = useRef(Math.floor(Math.random() * 8));
    const celebrated = useRef(false);
    const longShown = useRef(false);
    const goal = (() => { const g = parseInt(localStorage.getItem('myword_daily_goal') || '1000', 10); return g > 0 ? g : 1000; })();

    useEffect(() => {
        const on = (e: Event) => setPrefs((e as CustomEvent).detail);
        window.addEventListener('mw-mira-prefs', on);
        return () => window.removeEventListener('mw-mira-prefs', on);
    }, []);

    // Ritual: una vez al día, al abrir un archivo
    useEffect(() => {
        if (!fileId || !prefs.ritual) return;
        const k = 'mw-ritual-' + localDayKey();
        try {
            // Nov 2026: el primer día no (ya hay bastante que descubrir) y en el celular tampoco (tapaba todo el editor).
            const first = localStorage.getItem('mw-first-day');
            if (!first) { localStorage.setItem('mw-first-day', localDayKey()); return; }
            if (first === localDayKey() || window.matchMedia?.('(max-width: 639px)').matches) return;
            if (!localStorage.getItem(k)) { setRitual(true); localStorage.setItem(k, '1'); }
        } catch { /* */ }
    }, [fileId, prefs.ritual]);

    // Llegada: cuando ya no está el ritual, Mira repasa lo pendiente.
    // Nov 2026: cada aviso sale una vez al día (antes, el mismo aviso del roadmap salía en cada capítulo que abrías);
    // al abrir otro capítulo solo vuelve si trae algo nuevo, como lo pendiente de su reporte.
    useEffect(() => {
        if (!fileId || ritual || !arrival || !arrival.items.length) return;
        const k = `mw-arrival-${localDayKey()}`;
        let seen: string[] = [];
        try { seen = JSON.parse(localStorage.getItem(k) || '[]'); } catch { /* */ }
        if (arrival.items.every(it => seen.includes(it))) return;
        const id = window.setTimeout(() => {
            try { localStorage.setItem(k, JSON.stringify([...new Set([...seen, ...arrival.items])].slice(-30))); } catch { /* */ }
            setPose('neutral');
            setBubble({ title: t.arrT, text: '', arrival: true });
        }, 1200);
        return () => window.clearTimeout(id);
    }, [fileId, ritual, arrival?.items.join('|')]);

    // Reloj: dormirse tras 5 min sin escribir; sugerir descanso tras sesión larga
    useEffect(() => {
        const id = window.setInterval(() => {
            const now = Date.now();
            if (bubble?.until && now > bubble.until) setBubble(null);
            if (pose === 'neutral' && !bubble && !ritual && now - lastType.current > IDLE_MS) setPose('dormida');
            if (!longShown.current && pose === 'neutral' && now - sessionStart.current > LONG_SESSION_MS && now - lastType.current < 60_000) {
                longShown.current = true;
                setPose('celebrando');
                setBubble({ title: t.long, text: t.longText, rest: true });
            }
        }, 5000);
        return () => window.clearInterval(id);
    }, [pose, bubble, ritual, t]);

    // Escritura: cada cambio de contenido cuenta como actividad
    useEffect(() => {
        if (fileRef.current !== fileId) { fileRef.current = fileId; prevContent.current = content; return; }
        if (content === prevContent.current) return;
        const prev = prevContent.current;
        prevContent.current = content;
        const now = Date.now();
        const away = now - lastType.current;
        lastType.current = now;

        if (pose === 'dormida') {
            setPose('despertando');
            if (away > LONG_AWAY_MS) {
                setBubble({ title: t.back, text: t.backText(lastSentence(prev)), until: now + 9000 });
            } else if (prefs.tipsOnWake) {
                const tip = tips[tipIdx.current++ % tips.length];
                setBubble({ title: tip.title, text: tip.text, until: now + 9000 });
            }
            setBubbleChars(0);
        } else if (bubble && !bubble.rest && !bubble.arrival) {
            setBubbleChars(c => { if (c > 14) setBubble(null); return c + 1; });
        }

        let today = 0;
        try { today = parseInt(localStorage.getItem(todayKey()) || '0', 10); } catch { /* */ }
        if (!celebrated.current && today >= goal) {
            celebrated.current = true;
            setPose('celebrando');
            setBubble({ title: t.goal, text: t.goalText, rest: true });
        }
    }, [content, fileId]);

    if (!prefs.visible) return null;

    const ritualLabels = [t.r1, t.r2, t.r3(goal)];

    return (
        <>
            {ritual && (
                <div className="absolute inset-x-0 top-10 z-40 flex justify-center px-4 pointer-events-none">
                    <div role="dialog" aria-label={t.ritualT} className="pointer-events-auto w-full max-w-md bg-titanium-800 border border-titanium-700 rounded-2xl p-6 shadow-2xl flex flex-col gap-3">
                        <div className="font-serif text-2xl font-semibold text-titanium-100">{t.ritualT}</div>
                        <div className="text-sm text-titanium-300">{t.ritualP}</div>
                        {ritualLabels.map((l, i) => (
                            <button key={i} type="button" aria-pressed={checks[i]}
                                onClick={() => setChecks(c => c.map((v, j) => (j === i ? !v : v)))}
                                className={`flex items-center gap-3 min-h-[46px] px-3 rounded-xl border border-titanium-700 text-left text-[15px] text-titanium-100 ${checks[i] ? 'bg-mira-bg' : ''}`}>
                                <span className={`w-5 h-5 rounded-md border-2 border-mira shrink-0 ${checks[i] ? 'bg-mira' : ''}`} />{l}
                            </button>
                        ))}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button type="button" onClick={() => { setRitual(false); lastType.current = Date.now(); }} className="min-h-[46px] px-6 rounded-full bg-coral text-on-coral font-bold">{t.start}</button>
                            <button type="button" onClick={() => { setRitual(false); lastType.current = Date.now(); }} className="min-h-[46px] px-5 rounded-full border border-titanium-700 text-titanium-200">{t.skip}</button>
                            <button type="button" onClick={() => { setRitual(false); setMiraPrefs({ ritual: false }); }} className="ml-auto text-xs text-titanium-400 hover:text-titanium-200 underline">{t.never}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Nov 2026: en el celular Mira no se dibuja sobre el texto (tapaba palabras); quedan solo sus avisos. */}
            <div className="absolute right-3 max-lg:left-3 lg:right-5 bottom-12 z-30 flex items-end justify-end gap-2 pointer-events-none">
                {bubble && (
                    <div className={`pointer-events-auto mb-2 lg:mb-16 ${bubble.arrival ? 'max-w-[340px]' : 'max-w-[290px]'} transition-opacity duration-300`} style={{ opacity: bubble.rest || bubble.arrival ? 1 : Math.max(0.35, 1 - bubbleChars / 16) }}>
                        <MiraBubble title={bubble.title} tail="right" live>
                            {bubble.text}
                            {bubble.arrival && arrival && (
                                <>
                                    <ul className="space-y-1.5">
                                        {arrival.items.map((it, i) => <li key={i} className="flex gap-2"><span aria-hidden className="mt-[7px] w-1.5 h-1.5 shrink-0 bg-mira" />{it}</li>)}
                                    </ul>
                                    <p className="mt-2 font-medium">{t.arrQ}</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        <button type="button" onClick={() => { setBubble(null); lastType.current = Date.now(); }} className="min-h-[36px] px-4 rounded-full bg-coral text-on-coral font-semibold text-sm">{t.aWrite}</button>
                                        {arrival.review && onReviewCanon && <button type="button" onClick={() => { setBubble(null); onReviewCanon(); }} className="min-h-[36px] px-4 rounded-full border border-titanium-600 text-titanium-100 text-sm">{t.aReview}</button>}
                                        {arrival.hasReport && onOpenReport && <button type="button" onClick={() => { setBubble(null); onOpenReport(); }} className="min-h-[36px] px-4 rounded-full border border-titanium-600 text-titanium-100 text-sm">{t.aReport}</button>}
                                        {onAskMira && <button type="button" onClick={() => { setBubble(null); onAskMira(); }} className="min-h-[36px] px-4 rounded-full border border-titanium-600 text-titanium-100 text-sm">{t.aNext}</button>}
                                    </div>
                                </>
                            )}
                            {bubble.rest && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    <button type="button" onClick={() => { setBubble({ title: t.resting, text: t.restingText, until: Date.now() + 5000 }); setPose('dormida'); }} className="min-h-[38px] px-4 rounded-full bg-coral text-on-coral font-semibold text-sm">{t.rest}</button>
                                    <button type="button" onClick={() => { setBubble(null); setPose('neutral'); lastType.current = Date.now(); }} className="min-h-[38px] px-4 rounded-full border border-titanium-600 text-titanium-100 text-sm">{t.keep}</button>
                                </div>
                            )}
                        </MiraBubble>
                    </div>
                )}
                <div className="relative pointer-events-auto max-lg:hidden">
                    <button type="button" onClick={() => setMenu(m => !m)} aria-label={t.miraAria} aria-expanded={menu} className="block rounded-lg">
                        <MiraSprite
                            pose={pose}
                            onEnd={() => { if (pose === 'despertando' || pose === 'celebrando') setPose('neutral'); }}
                        />
                    </button>
                    {pose === 'dormida' && <span aria-hidden className="absolute -right-1 -top-4 font-mono font-bold text-mira animate-pulse">z Z</span>}
                    {menu && (
                        <div className="absolute right-0 bottom-full mb-2 w-60 bg-titanium-800 border border-titanium-700 rounded-xl p-2 shadow-2xl">
                            {onAskMira && <button type="button" onClick={() => { setMenu(false); onAskMira(''); }} className="w-full text-left min-h-[40px] px-2 rounded-lg hover:bg-titanium-700 text-sm font-semibold text-titanium-100">{t.talk}</button>}
                            <div className="px-2 py-1 text-xs font-semibold text-titanium-300">{t.opts}</div>
                            {([['tipsOnWake', t.oTips], ['ritual', t.oRitual]] as const).map(([k, l]) => (
                                <button key={k} type="button" role="switch" aria-checked={prefs[k]} onClick={() => setPrefs(setMiraPrefs({ [k]: !prefs[k] }))}
                                    className="w-full flex items-center justify-between gap-3 min-h-[40px] px-2 rounded-lg hover:bg-titanium-700 text-sm text-titanium-100">
                                    {l}<span className={`w-9 h-5 rounded-full relative ${prefs[k] ? 'bg-coral' : 'bg-titanium-600'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-titanium-50 ${prefs[k] ? 'left-[18px]' : 'left-0.5'}`} /></span>
                                </button>
                            ))}
                            <button type="button" onClick={() => setMiraPrefs({ visible: false })} className="w-full text-left min-h-[40px] px-2 rounded-lg hover:bg-titanium-700 text-sm text-titanium-300">{t.oHide}</button>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default MiraDeskCompanion;
