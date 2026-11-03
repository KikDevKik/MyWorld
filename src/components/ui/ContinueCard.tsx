import React, { useMemo } from 'react';
import { Landmark, MessageCircle } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { MiraSprite } from '../mira/MiraSprite';
import { getTips } from '../mira/tips';

// La Casa: lo primero que ves al entrar a un proyecto con historia.
// Ventana con el cielo (tus mundos como constelaciones), tu semana y un tip del rincón.
interface ContinueCardProps {
    projectName: string;
    onGoToArquitecto: () => void;
    onGoToDirector: () => void;
}

const STR = {
    es: {
        hi: (h: number) => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'),
        lead: 'Tu mundo ya tiene historia. Abre un capítulo en la barra de la izquierda para volver al escritorio, o elige un cuarto.',
        architect: 'La mesa del arquitecto', architectP: 'Planos, hilos y dudas por resolver',
        mira: 'Hablar con Mira', miraP: 'Pregúntale por tu mundo',
        week: 'Esta semana', weekP: (n: number) => `${n} ${n === 1 ? 'día' : 'días'} escribiendo. Descansar un día no rompe la racha.`,
        tip: 'Tip del rincón', days: ['L', 'M', 'M', 'J', 'V', 'S', 'D'], sky: 'tu mundo',
    },
    en: {
        hi: (h: number) => (h < 12 ? 'Good morning' : h < 19 ? 'Good afternoon' : 'Good evening'),
        lead: 'Your world already has a story. Open a chapter in the left bar to go back to the desk, or pick a room.',
        architect: 'The architect’s table', architectP: 'Plans, threads and open questions',
        mira: 'Talk to Mira', miraP: 'Ask her about your world',
        week: 'This week', weekP: (n: number) => `${n} ${n === 1 ? 'day' : 'days'} writing. A rest day doesn’t break the streak.`,
        tip: 'Tip of the day', days: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], sky: 'your world',
    },
};

function weekActivity(): boolean[] {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // lunes = 0
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now); d.setDate(now.getDate() - dow + i);
        try { return parseInt(localStorage.getItem(`myword_daily_${d.toISOString().split('T')[0]}`) || '0', 10) > 0; } catch { return false; }
    });
}

export default function ContinueCard({ projectName, onGoToArquitecto, onGoToDirector }: ContinueCardProps) {
    const { currentLanguage } = useLanguageStore();
    const s = currentLanguage === 'es' ? STR.es : STR.en;
    const tips = getTips(currentLanguage);
    const tip = tips[new Date().getDate() % tips.length];
    const week = useMemo(weekActivity, []);
    const today = (new Date().getDay() + 6) % 7;
    const stars = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 97, y: (i * 23) % 62, big: i % 7 === 0, d: (i % 5) * 0.7 })), []);

    return (
        <div className="flex-1 overflow-y-auto bg-titanium-950 p-6 md:p-10">
            <div className="max-w-5xl mx-auto flex flex-col gap-6">
                {/* Ventana al cielo */}
                <div className="relative h-56 rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(180deg,#0B0A12 0 35%,#100E1A 35% 62%,#1A1630 62%)' }}>
                    {stars.map((st, i) => (
                        <span key={i} aria-hidden className="absolute animate-pulse" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.big ? 4 : 2, height: st.big ? 4 : 2, background: st.big ? '#B9AEE0' : '#FFF4F4', animationDelay: `${st.d}s`, animationDuration: '3.6s' }} />
                    ))}
                    <svg aria-hidden viewBox="0 0 1000 80" preserveAspectRatio="none" className="absolute left-0 bottom-0 w-full h-20"><path d="M0 50 Q 250 10 520 40 T 1000 30 V80 H0 Z" fill="#17282B" /><rect x="0" y="66" width="1000" height="14" fill="#1F3D35" /></svg>
                    <svg aria-hidden width="320" height="140" viewBox="0 0 320 140" className="absolute right-8 top-5 hidden sm:block">
                        <g stroke="#B9AEE0" strokeOpacity=".4" strokeWidth="1.2" fill="none"><polyline points="20,90 80,50 140,70 200,30" /><polyline points="140,70 190,110 260,96 300,60" /></g>
                        <g fill="#FFF4F4"><rect x="18" y="88" width="4" height="4" /><rect x="78" y="48" width="4" height="4" /><rect x="137" y="67" width="7" height="7" fill="#FF9638" /><rect x="198" y="28" width="4" height="4" /><rect x="188" y="108" width="4" height="4" /><rect x="258" y="94" width="4" height="4" /><rect x="298" y="58" width="4" height="4" /></g>
                        <text x="150" y="92" fill="#FFD9B0" fontFamily="Figtree, sans-serif" fontSize="12">{projectName || s.sky}</text>
                    </svg>
                    <MiraSprite pose="saludo" label="Mira te saluda" className="absolute right-[38%] bottom-1 hidden md:block" />
                    <div className="absolute left-8 bottom-7">
                        <h1 className="font-serif text-4xl font-semibold text-[#FFF4F4]">{s.hi(new Date().getHours())}.</h1>
                    </div>
                </div>

                <p className="text-titanium-300 text-[15px] max-w-2xl">{s.lead}</p>

                <div className="grid gap-4 md:grid-cols-3">
                    <button onClick={onGoToArquitecto} className="text-left rounded-2xl border border-titanium-700 bg-titanium-800 hover:border-mira p-5 transition-colors flex flex-col gap-2 min-h-[120px]">
                        <Landmark size={18} className="text-mira" />
                        <span className="font-serif text-lg text-titanium-100">{s.architect}</span>
                        <span className="text-sm text-titanium-400">{s.architectP}</span>
                    </button>
                    <button onClick={onGoToDirector} className="text-left rounded-2xl border border-titanium-700 bg-titanium-800 hover:border-mira p-5 transition-colors flex flex-col gap-2 min-h-[120px]">
                        <MessageCircle size={18} className="text-mira" />
                        <span className="font-serif text-lg text-titanium-100">{s.mira}</span>
                        <span className="text-sm text-titanium-400">{s.miraP}</span>
                    </button>
                    <div className="rounded-2xl border border-titanium-700 bg-titanium-800 p-5 flex flex-col gap-3">
                        <span className="font-semibold text-titanium-100 text-sm">{s.week}</span>
                        <div className="grid grid-cols-7 gap-1.5">
                            {week.map((on, i) => (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <span className={`w-7 h-7 rounded-lg border ${on ? 'bg-logro border-logro' : i === today ? 'border-mira' : 'border-titanium-600'}`} />
                                    <span className="text-[11px] text-titanium-400">{s.days[i]}</span>
                                </div>
                            ))}
                        </div>
                        <span className="text-xs text-titanium-400">{s.weekP(week.filter(Boolean).length)}</span>
                    </div>
                </div>

                <div className="rounded-2xl bg-mira-bg border border-mira/40 p-5 flex items-end gap-4">
                    <MiraSprite pose="leyendo" />
                    <div className="pb-3">
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
