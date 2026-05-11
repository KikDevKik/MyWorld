import React, { useEffect, useRef, useState } from 'react';
import { X, Network, Users, GitMerge, Map, Book, Settings, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ArquitectoWelcomeOverlayProps {
    onDismiss: () => void;
}

const HOW_IT_WORKS = [
    'Detecta disonancias — contradicciones o vacíos en tu canon antes de que se vuelvan un problema',
    'Trabaja de forma socrática: pregunta, no dicta',
    'Al resolver una disonancia, puede generar cambios en cascada — eso es el Efecto Dominó',
];

const MODES = [
    { dot: 'bg-cyan-400 animate-pulse', label: 'Exploración', desc: 'para bloqueos creativos e ideas libres' },
    { dot: 'bg-amber-400', label: 'Auditoría', desc: 'cuando hay disonancias formales activas' },
];

const TOOLS = [
    { icon: <RefreshCw size={11} />, label: 'Analizar', desc: 'escanea el proyecto — 3 capas: MACRO, MESO, MICRO' },
    { icon: <Network size={11} />, label: 'Efecto Dominó', desc: 'cómo las resoluciones se conectan en cascada' },
    { icon: <Users size={11} />, label: 'Personajes', desc: 'elenco discutido en esta sesión' },
    { icon: <GitMerge size={11} />, label: 'Parches', desc: 'cambios propuestos a .md y .txt (Drive Docs: copia manual)' },
    { icon: <Map size={11} />, label: 'Colisiones', desc: 'topografía visual de todas las disonancias activas' },
    { icon: <Book size={11} />, label: 'Roadmap', desc: 'mapa de lo acordado en la sesión — usa el modelo más potente' },
    { icon: <Settings size={11} />, label: 'Config', desc: 'personaliza el comportamiento del Arquitecto' },
];

export function ArquitectoWelcomeOverlay({ onDismiss }: ArquitectoWelcomeOverlayProps) {
    const [progress, setProgress] = useState(100);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const progressRef = useRef(100);
    const DURATION = 12000;

    const startTimer = (fromProgress: number) => {
        if (timerRef.current) clearInterval(timerRef.current);
        const startAt = Date.now() - ((100 - fromProgress) / 100) * DURATION;
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startAt;
            const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
            progressRef.current = remaining;
            setProgress(remaining);
            if (remaining === 0) onDismiss();
        }, 80);
    };

    useEffect(() => {
        startTimer(100);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [onDismiss]);

    const pause = () => { if (timerRef.current) clearInterval(timerRef.current); };
    const resume = () => startTimer(progressRef.current);

    const handleGuide = () => {
        onDismiss();
        toast.info('Guía completa disponible en el botón ❓ del sidebar izquierdo.', { duration: 4000 });
    };

    return (
        <div
            className="absolute top-16 right-3 z-50 rounded-xl shadow-2xl shadow-black/50"
            style={{
                width: 'min(280px, calc(100% - 24px))',
                background: 'rgba(8, 14, 18, 0.97)',
                border: '1px solid rgba(34, 211, 238, 0.18)',
                backdropFilter: 'blur(16px)',
            }}
            onMouseEnter={pause}
            onMouseLeave={resume}
        >
            {/* Progress bar */}
            <div className="h-0.5 rounded-t-xl overflow-hidden" style={{ background: 'rgba(34,211,238,0.08)' }}>
                <div
                    className="h-full"
                    style={{ width: `${progress}%`, background: 'rgba(34,211,238,0.45)', transition: 'none' }}
                />
            </div>

            <div className="p-3.5">
                {/* Dismiss */}
                <button
                    onClick={onDismiss}
                    className="absolute top-2.5 right-2.5 text-zinc-600 hover:text-zinc-300 transition-colors"
                    aria-label="Cerrar guía"
                >
                    <X size={12} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-2 mb-2.5 pr-4">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                        style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.22)' }}
                    >
                        🏛️
                    </div>
                    <div>
                        <h3 className="text-xs font-semibold text-white leading-none mb-0.5">El Arquitecto</h3>
                        <p className="text-[10px]" style={{ color: 'rgba(34,211,238,0.75)' }}>Estratega narrativo socrático</p>
                    </div>
                </div>

                {/* Description */}
                <p className="text-[11px] text-zinc-400 leading-relaxed mb-2.5">
                    Analiza tu mundo completo, detecta contradicciones y te hace las preguntas que desbloquean tu próxima decisión. No te da respuestas — te ayuda a encontrarlas.
                </p>

                {/* How it works */}
                <div className="space-y-1 mb-2.5">
                    {HOW_IT_WORKS.map((item, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                            <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: 'rgba(34,211,238,0.55)' }}>→</span>
                            <span className="text-[11px] text-zinc-500 leading-snug">{item}</span>
                        </div>
                    ))}
                </div>

                {/* Modes */}
                <div className="border-t pt-2 mb-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Modos (automáticos)</p>
                    <div className="space-y-1">
                        {MODES.map(({ dot, label, desc }, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-16">{label}</span>
                                <span className="text-zinc-600">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tool buttons */}
                <div className="border-t pt-2 mb-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Herramientas del panel lateral ←</p>
                    <div className="space-y-1">
                        {TOOLS.map(({ icon, label, desc }, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span
                                    className="flex-shrink-0 w-3 mt-0.5 flex items-center"
                                    style={{ color: 'rgba(34,211,238,0.45)' }}
                                >
                                    {icon}
                                </span>
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-16">{label}</span>
                                <span className="text-zinc-600 leading-snug">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Subtle notices */}
                <div
                    className="rounded-lg px-2.5 py-2 mb-3 space-y-1"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <p className="text-[10px] text-zinc-600 leading-snug">
                        💡 Toma un descanso cada 5–7 resoluciones. Tu creatividad también necesita procesar.
                    </p>
                    <p className="text-[10px] text-zinc-700 leading-snug">
                        ⚡ Roadmap Final usa el modelo más potente — úsalo con moderación si tienes API del free tier.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                    <button
                        onClick={onDismiss}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                        style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)', color: 'rgba(34,211,238,0.9)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(34,211,238,0.1)')}
                    >
                        Entendido
                    </button>
                    <button
                        onClick={handleGuide}
                        className="flex-1 py-1.5 rounded-lg text-[11px] transition-all"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(161,161,170,0.8)' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(228,228,231,0.9)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(161,161,170,0.8)'; }}
                    >
                        Ver guía
                    </button>
                </div>
            </div>
        </div>
    );
}
