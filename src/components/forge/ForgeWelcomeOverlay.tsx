import React, { useEffect, useRef, useState } from 'react';
import { X, Ghost, FileEdit, Anchor, User, PawPrint, FlaskConical, ChevronLeft, ChevronRight } from 'lucide-react';

interface ForgeWelcomeOverlayProps {
    onDismiss: () => void;
    onHighlight: (column: string | null) => void;
}

type ForgeStep = {
    highlight: string | null;
    icon: React.ReactNode;
    title: string;
    content: string;
    tip?: string;
};

const STEPS: ForgeStep[] = [
    {
        highlight: null,
        icon: <FlaskConical size={20} />,
        title: 'La Forja de Almas',
        content: 'Extrae y organiza las entidades de tu mundo. El análisis escanea tus archivos y clasifica personajes, criaturas y flora en tres niveles según su presencia en la narrativa.',
        tip: 'Pulsa "Analizar" en la cabecera para iniciar el escaneo. Cada entidad detectada aparece en la columna que le corresponde.',
    },
    {
        highlight: 'ecos',
        icon: <Ghost size={20} />,
        title: 'Ecos (Radar)',
        content: 'Personajes detectados en tus archivos que aún NO tienen ficha. Son menciones únicas o poco frecuentes — figuras de fondo, nombres de pasada, referencias secundarias que tal vez no necesiten desarrollo.',
    },
    {
        highlight: 'limbos',
        icon: <FileEdit size={20} />,
        title: 'Limbos (Taller)',
        content: 'Entidades que aparecen en múltiples obras o con alta frecuencia en una sola. El motor recomienda crearles ficha. Aquí es donde un eco pasa a ser un personaje real: la mesa de trabajo antes de cristalizarlo.',
    },
    {
        highlight: 'anclas',
        icon: <Anchor size={20} />,
        title: 'Anclas (Bóveda)',
        content: 'Personajes que ya tienen su ficha completa. Son las entidades cristalizadas — el núcleo estable de tu universo. Cada ancla alimenta el contexto de todas las demás herramientas.',
    },
    {
        highlight: 'tabs',
        icon: (
            <span className="flex items-center gap-1">
                <User size={14} />
                <PawPrint size={14} />
            </span>
        ),
        title: 'Personajes / Bestiario',
        content: 'Cambia entre los dos modos de la Forja. Personajes gestiona personas y figuras humanas. Bestiario gestiona animales, criaturas y flora — con sub-filtros para Fauna y Flora por separado.',
    },
    {
        highlight: 'analyze',
        icon: <FlaskConical size={20} />,
        title: 'Botón Analizar',
        content: 'Lanza el escaneo de tus archivos canon. El motor detecta entidades nuevas, actualiza las existentes y redistribuye todo en Ecos, Limbos y Anclas. Ejecútalo cada vez que actualices tus archivos.',
        tip: 'El análisis puede tardar según el tamaño de tu proyecto. Puedes volver a ejecutarlo las veces que necesites.',
    },
];

export function ForgeWelcomeOverlay({ onDismiss, onHighlight }: ForgeWelcomeOverlayProps) {
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
            style={{ width: '268px' }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className="rounded-xl shadow-2xl shadow-black/60"
                style={{
                    background: 'rgba(8, 12, 16, 0.97)',
                    border: '1px solid rgba(52,211,153,0.2)',
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
                                        ? 'rgba(52,211,153,0.9)'
                                        : i < step
                                            ? 'rgba(52,211,153,0.28)'
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
                    {/* Icon + title */}
                    <div className="flex items-center gap-2.5 mb-3">
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'rgba(52,211,153,0.08)',
                                border: '1px solid rgba(52,211,153,0.18)',
                                color: 'rgba(52,211,153,0.8)',
                            }}
                        >
                            {current.icon}
                        </div>
                        <div>
                            <p className="text-[13px] font-semibold text-white leading-none mb-0.5">
                                {current.title}
                            </p>
                            <p className="text-[10px] font-mono" style={{ color: 'rgba(52,211,153,0.5)' }}>
                                {step + 1} de {STEPS.length}
                            </p>
                        </div>
                    </div>

                    {/* Content */}
                    <p className="text-[12px] text-zinc-400 leading-relaxed mb-3">
                        {current.content}
                    </p>

                    {/* Tip */}
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
                                background: 'rgba(52,211,153,0.1)',
                                border: '1px solid rgba(52,211,153,0.22)',
                                color: 'rgba(52,211,153,0.9)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.18)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(52,211,153,0.1)'; }}
                        >
                            {isLast ? 'Entendido' : <><span>Siguiente</span><ChevronRight size={11} /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
