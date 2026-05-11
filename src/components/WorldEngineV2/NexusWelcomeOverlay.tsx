import React, { useEffect, useRef, useState } from 'react';
import { X, Globe, Eye, Plus, Minus, ChevronLeft, ChevronRight } from 'lucide-react';

interface NexusWelcomeOverlayProps {
    onDismiss: () => void;
}

type NexusStep = {
    icon: React.ReactNode;
    title: string;
    location?: string;
    content: string;
    tip?: string;
    alphaWarning?: boolean;
};

const STEPS: NexusStep[] = [
    {
        icon: <Globe size={20} />,
        title: 'El Nexus',
        content: 'Visualiza las entidades de tu mundo y sus relaciones en un grafo interactivo. El motor escanea tus archivos canon, extrae personajes, lugares y conceptos, y los conecta según el contexto narrativo.',
        alphaWarning: true,
        tip: 'Alpha: puede generar nodos duplicados, conexiones imprecisas o candidatos con poca consistencia. Revisa cada candidato en el Tribunal antes de aprobarlo.',
    },
    {
        icon: <Globe size={20} />,
        title: 'EL NEXUS',
        location: '↑ Centro superior',
        content: 'Pulsa el botón central para iniciar el escaneo del proyecto. El motor lee tus archivos canon, extrae entidades y abre el Tribunal — donde revisas y apruebas cada candidato antes de que aparezca en el grafo.',
    },
    {
        icon: <Eye size={20} />,
        title: 'Icono del Ojo',
        location: '← Superior izquierda',
        content: 'Oculta todos los controles e interfaz para explorar el grafo sin distracciones. Ideal para revisar conexiones o tomar capturas limpias. Pulsa de nuevo para restaurar la UI.',
    },
    {
        icon: (
            <span className="flex items-center gap-0.5">
                <Plus size={13} />
                <span className="text-[10px] font-mono text-zinc-500 mx-0.5">/</span>
                <Minus size={13} />
            </span>
        ),
        title: 'Zoom',
        location: '→ Inferior derecha',
        content: 'Acerca (+) o aleja (−) la vista del grafo. También puedes usar la rueda del mouse, o mantener Shift y arrastrar para desplazarte por el lienzo.',
    },
];

export function NexusWelcomeOverlay({ onDismiss }: NexusWelcomeOverlayProps) {
    const [step, setStep] = useState(0);
    const [paused, setPaused] = useState(false);
    const onDismissRef = useRef(onDismiss);
    useEffect(() => { onDismissRef.current = onDismiss; });

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => {
            setStep(prev => {
                const next = prev + 1;
                if (next >= STEPS.length) {
                    clearInterval(id);
                    onDismissRef.current();
                    return prev;
                }
                return next;
            });
        }, 5000);
        return () => clearInterval(id);
    }, [paused, step]);

    const goTo = (s: number) => {
        setStep(Math.max(0, Math.min(s, STEPS.length - 1)));
        setPaused(true);
    };

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div
            className="absolute top-8 right-8 z-50"
            style={{ width: '268px' }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className="rounded-xl shadow-2xl shadow-black/70"
                style={{
                    background: 'rgba(10, 12, 16, 0.97)',
                    border: '1px solid rgba(6,182,212,0.2)',
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
                    {/* Icon + title + location */}
                    <div className="flex items-start gap-2.5 mb-3">
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{
                                background: 'rgba(6,182,212,0.08)',
                                border: '1px solid rgba(6,182,212,0.18)',
                                color: 'rgba(6,182,212,0.8)',
                            }}
                        >
                            {current.icon}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <p className="text-[13px] font-semibold text-white leading-none">
                                    {current.title}
                                </p>
                                {current.alphaWarning && (
                                    <span
                                        className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
                                        style={{
                                            background: 'rgba(251,191,36,0.1)',
                                            border: '1px solid rgba(251,191,36,0.3)',
                                            color: 'rgba(251,191,36,0.9)',
                                        }}
                                    >
                                        ALPHA
                                    </span>
                                )}
                            </div>
                            {current.location ? (
                                <p className="text-[10px] font-mono" style={{ color: 'rgba(6,182,212,0.55)' }}>
                                    {current.location}
                                </p>
                            ) : (
                                <p className="text-[10px] text-zinc-600 font-mono">{step + 1} de {STEPS.length}</p>
                            )}
                        </div>
                    </div>

                    {/* Content */}
                    <p className="text-[12px] text-zinc-400 leading-relaxed mb-3">
                        {current.content}
                    </p>

                    {/* Tip / Alpha warning box */}
                    {current.tip && (
                        <div
                            className="rounded-lg px-2.5 py-2 mb-3"
                            style={{
                                background: current.alphaWarning
                                    ? 'rgba(251,191,36,0.05)'
                                    : 'rgba(255,255,255,0.03)',
                                border: current.alphaWarning
                                    ? '1px solid rgba(251,191,36,0.18)'
                                    : '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <p className="text-[10px] leading-snug" style={{
                                color: current.alphaWarning ? 'rgba(251,191,36,0.7)' : 'rgba(113,113,122,1)'
                            }}>
                                {current.alphaWarning ? '⚠️ ' : '💡 '}
                                {current.tip}
                            </p>
                        </div>
                    )}

                    {/* Navigation */}
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
