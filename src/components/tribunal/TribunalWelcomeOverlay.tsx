import React, { useEffect, useRef, useState } from 'react';
import { X, Gavel, Scale, Feather, Skull, Type, FileText, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';

interface TribunalWelcomeOverlayProps {
    onDismiss: () => void;
    onHighlight: (element: string | null) => void;
}

type TribunalStep = {
    highlight: string | null;
    icon: React.ReactNode;
    title: string;
    content: string;
    tip?: string;
};

const STEPS: TribunalStep[] = [
    {
        highlight: null,
        icon: <Gavel size={20} />,
        title: 'Tribunal Literario',
        content: 'Somete tu escritura al juicio de tres críticos de IA independientes: el Arquitecto (estructura), el Bardo (ritmo y emoción) y El Odiador (crítico despiadado). Cada uno da una puntuación y un análisis.',
        tip: 'El Tribunal no edita ni reescribe — solo juzga. Úsalo para detectar puntos débiles antes de revisar.',
    },
    {
        highlight: 'tabs',
        icon: (
            <span className="flex items-center gap-1">
                <Type size={14} />
                <FileText size={14} />
            </span>
        ),
        title: 'Texto Manual / Archivo Actual',
        content: 'En "Texto Manual" pegas directamente el fragmento a juzgar. En "Archivo Actual" el Tribunal lee el archivo que tengas abierto en el editor — sin copiar ni pegar nada.',
    },
    {
        highlight: 'text',
        icon: <Type size={20} />,
        title: 'Texto a Juzgar',
        content: 'Pega aquí el fragmento: una escena, un capítulo, un diálogo. No hay límite estricto, aunque fragmentos de 500–2000 palabras dan los mejores análisis. El texto no se guarda ni sale de la sesión.',
    },
    {
        highlight: 'context',
        icon: <MessageSquare size={20} />,
        title: 'Contexto (Opcional)',
        content: 'Ayuda a los jueces a entender la escena: quiénes son los personajes, qué acaba de pasar, en qué punto de la historia estás. Cuanto más contexto des, más preciso será el análisis.',
    },
    {
        highlight: 'summon',
        icon: <Gavel size={20} />,
        title: 'Invocar al Tribunal',
        content: 'Lanza el juicio. Los tres críticos analizan el texto en paralelo y devuelven su veredicto: puntuación /10, un veredicto corto y un análisis detallado. Pulsa "Leer análisis completo" en cada tarjeta para ver todo.',
        tip: 'El análisis puede tardar 15–30 segundos. El botón superior derecho expande el Tribunal a pantalla completa para comparar los tres veredictos a la vez.',
    },
];

export function TribunalWelcomeOverlay({ onDismiss, onHighlight }: TribunalWelcomeOverlayProps) {
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
            className="absolute top-20 right-4 z-50"
            style={{ width: '272px' }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className="rounded-xl shadow-2xl shadow-black/60"
                style={{
                    background: 'rgba(8, 10, 14, 0.97)',
                    border: '1px solid rgba(239,68,68,0.22)',
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
                                        ? 'rgba(239,68,68,0.9)'
                                        : i < step
                                            ? 'rgba(239,68,68,0.28)'
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
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.18)',
                                color: 'rgba(239,68,68,0.8)',
                            }}
                        >
                            {current.icon}
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-white leading-none mb-0.5">
                                {current.title}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: 'rgba(239,68,68,0.5)' }}>
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
                                background: 'rgba(239,68,68,0.1)',
                                border: '1px solid rgba(239,68,68,0.22)',
                                color: 'rgba(239,68,68,0.9)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                        >
                            {isLast ? 'Entendido' : <><span>Siguiente</span><ChevronRight size={11} /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
