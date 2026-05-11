import React, { useEffect, useRef, useState } from 'react';
import { X, ScanEye, Zap, Globe, ChevronLeft, ChevronRight } from 'lucide-react';

interface CanonRadarWelcomeOverlayProps {
    onDismiss: () => void;
    onHighlight: (element: string | null) => void;
}

type CanonStep = {
    highlight: string | null;
    icon: React.ReactNode;
    title: string;
    content: string;
    tip?: string;
};

const STEPS: CanonStep[] = [
    {
        highlight: null,
        icon: <ScanEye size={20} />,
        title: 'Guardián del Cánon',
        content: 'Vigila la coherencia narrativa de tu proyecto en tiempo real. Cada vez que escribes, el motor escanea tu texto en busca de contradicciones, fracturas de realidad y personajes que actúan fuera de su perfil establecido.',
        tip: 'El Guardián se activa automáticamente mientras editas. Pulsa el icono ↗ para expandir y ver todos los resultados en pantalla completa.',
    },
    {
        highlight: 'force',
        icon: <Zap size={20} />,
        title: 'Forzar Auditoría',
        content: 'Lanza un análisis inmediato del archivo que estás editando. Útil cuando el Guardián aún no ha procesado los últimos cambios o cuando quieres revisar un fragmento específico a demanda.',
    },
    {
        highlight: 'global',
        icon: <Globe size={20} />,
        title: 'Auditoría Global',
        content: 'Analiza todos los archivos canon del proyecto de una vez. Detecta paradojas entre diferentes capítulos o carpetas — contradicciones que el análisis local no puede ver porque span múltiples archivos.',
        tip: 'La auditoría global puede tardar varios minutos en proyectos grandes. Ejecutala cuando termines una sesión de escritura importante.',
    },
];

export function CanonRadarWelcomeOverlay({ onDismiss, onHighlight }: CanonRadarWelcomeOverlayProps) {
    const [step, setStep] = useState(0);
    const [paused, setPaused] = useState(false);
    const callbacksRef = useRef({ onDismiss, onHighlight });
    useEffect(() => { callbacksRef.current = { onDismiss, onHighlight }; });

    useEffect(() => {
        callbacksRef.current.onHighlight(STEPS[0].highlight);
        return () => { callbacksRef.current.onHighlight(null); };
    }, []);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setStep(prev => {
                const next = prev + 1;
                if (next >= STEPS.length) {
                    clearInterval(id);
                    callbacksRef.current.onDismiss();
                    return prev;
                }
                callbacksRef.current.onHighlight(STEPS[next].highlight);
                return next;
            });
        }, 5000);
        return () => clearInterval(id);
    }, [paused, step]);

    const goTo = (s: number) => {
        const next = Math.max(0, Math.min(s, STEPS.length - 1));
        setStep(next);
        onHighlight(STEPS[next].highlight);
        setPaused(true);
    };

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50"
            style={{ width: '268px' }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className="rounded-xl shadow-2xl shadow-black/60"
                style={{
                    background: 'rgba(8, 12, 16, 0.97)',
                    border: '1px solid rgba(6,182,212,0.22)',
                    backdropFilter: 'blur(16px)',
                }}
            >
                {/* Step dots + close */}
                <div className="flex items-center justify-between px-3 pt-3 pb-0">
                    <div className="flex items-center gap-1">
                        {STEPS.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                aria-label={`Paso ${i + 1}`}
                                style={{
                                    width: i === step ? '14px' : '6px',
                                    height: '6px',
                                    borderRadius: '9999px',
                                    background: i === step
                                        ? 'rgba(6,182,212,0.9)'
                                        : i < step
                                            ? 'rgba(6,182,212,0.28)'
                                            : 'rgba(255,255,255,0.1)',
                                    transition: 'width 200ms ease, background 200ms ease',
                                    border: 'none',
                                    padding: 0,
                                    cursor: 'pointer',
                                }}
                            />
                        ))}
                    </div>
                    <button
                        onClick={onDismiss}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                        aria-label="Cerrar tour"
                    >
                        <X size={12} />
                    </button>
                </div>

                <div className="px-4 pt-3 pb-4">
                    <div className="flex items-center gap-2.5 mb-3">
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'rgba(6,182,212,0.08)',
                                border: '1px solid rgba(6,182,212,0.18)',
                                color: 'rgba(6,182,212,0.8)',
                            }}
                        >
                            {current.icon}
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-white leading-none mb-0.5">
                                {current.title}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: 'rgba(6,182,212,0.5)' }}>
                                {step + 1} de {STEPS.length}
                            </p>
                        </div>
                    </div>

                    <p className="text-[12px] text-zinc-400 leading-relaxed mb-3">
                        {current.content}
                    </p>

                    {current.tip && (
                        <div
                            className="rounded-lg px-2.5 py-2 mb-3"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <p className="text-[10px] text-zinc-600 leading-snug">💡 {current.tip}</p>
                        </div>
                    )}

                    <div className="flex gap-1.5">
                        {step > 0 && (
                            <button
                                onClick={() => goTo(step - 1)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] transition-colors"
                                style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'rgba(161,161,170,0.8)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                            >
                                <ChevronLeft size={11} /> Atrás
                            </button>
                        )}
                        <button
                            onClick={() => { if (isLast) { onDismiss(); } else { goTo(step + 1); } }}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
                            style={{
                                background: 'rgba(6,182,212,0.1)',
                                border: '1px solid rgba(6,182,212,0.22)',
                                color: 'rgba(6,182,212,0.9)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.18)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.1)'; }}
                        >
                            {isLast ? 'Entendido' : <><span>Siguiente</span><ChevronRight size={11} /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
