import React, { useEffect, useRef, useState } from 'react';
import { X, Network, GitMerge, SpellCheck, Map, Book, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

// Nov 2026: el tour del panel, con los colores de la app y lo que cada herramienta hace hoy.
// Ya no avanza solo: cada quien lo lee a su ritmo (en el celular no hay «pasar el mouse» para pausarlo).

interface ArquitectoWelcomeOverlayProps {
    onDismiss: () => void;
    onHighlight: (tool: string | null) => void;
    narrow?: boolean; // en pantallas angostas las herramientas están arriba, no abajo
}

type Step = { tool: string | null; icon: React.ReactNode; title: string; subtitle?: string; content: string; tip?: string };

const STEPS: Step[] = [
    {
        tool: null,
        icon: <img src="/assets/objetos/icono/planos.png" alt="" width={22} height={22} className="w-[22px] h-[22px]" style={{ imageRendering: 'pixelated' }} />,
        title: 'El Arquitecto',
        subtitle: 'Planea contigo antes de escribir',
        content: 'Conversa contigo sobre lo que quieres planear: un acto, una saga o una duda. Pregunta, propone y te dice de qué documento sale lo que afirma. Las decisiones son tuyas.',
        tip: 'Cuando la agenda de hoy esté completa, pasa lo decidido a tu roadmap. Lo verás al llegar al escritorio.',
    },
    { tool: 'domino', icon: <Network size={18} />, title: 'Efecto dominó', content: 'Cuando resuelves una contradicción, muestra qué otras partes de tu historia cambian por esa decisión.' },
    { tool: 'patches', icon: <GitMerge size={18} />, title: 'Cambios propuestos al canon', content: 'Lo que el Arquitecto propone cambiar en tus documentos. Nada se aplica sin que lo apruebes.' },
    { tool: 'names', icon: <SpellCheck size={18} />, title: 'Revisión del canon', content: 'Encuentra nombres escritos de varias formas y documentos repetidos, para que todo tu canon diga lo mismo.' },
    { tool: 'map', icon: <Map size={18} />, title: 'Mapa de dudas', content: 'Las dudas abiertas de tu historia, ordenadas por capa, para ver qué está conectado con qué.' },
    { tool: 'lore', icon: <Book size={18} />, title: 'Roadmap', content: 'Lo que decidieron, convertido en misiones. Es lo que Mira te recuerda cuando vuelves a escribir.' },
    { tool: 'settings', icon: <Settings size={18} />, title: 'Ajustes', content: 'Ajusta cómo trabaja el Arquitecto contigo.' },
];

export function ArquitectoWelcomeOverlay({ onDismiss, onHighlight, narrow }: ArquitectoWelcomeOverlayProps) {
    const [step, setStep] = useState(0);
    const callbacksRef = useRef({ onDismiss, onHighlight });
    useEffect(() => { callbacksRef.current = { onDismiss, onHighlight }; });

    useEffect(() => {
        callbacksRef.current.onHighlight(STEPS[0].tool);
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') callbacksRef.current.onDismiss(); };
        window.addEventListener('keydown', k);
        return () => { window.removeEventListener('keydown', k); callbacksRef.current.onHighlight(null); };
    }, []);

    const goTo = (s: number) => {
        const next = Math.max(0, Math.min(s, STEPS.length - 1));
        setStep(next);
        onHighlight(STEPS[next].tool);
    };

    const current = STEPS[step];
    const isLast = step === STEPS.length - 1;

    return (
        <div
            role="dialog"
            aria-label="Tour del panel del Arquitecto"
            className={narrow ? 'absolute left-[76px] right-3 top-14 z-50' : 'absolute left-[88px] bottom-4 z-50 w-[280px]'}
        >
            {!narrow && <div aria-hidden="true" className="absolute -left-[6px] top-8 w-3 h-3 rotate-45 border-l border-b border-titanium-700 bg-titanium-900" />}

            <div className="relative rounded-2xl border border-titanium-700 bg-titanium-900 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between px-4 pt-3">
                    <div className="flex items-center gap-1" aria-hidden="true">
                        {STEPS.map((_, i) => (
                            <span key={i} className={`h-1.5 rounded-full transition-all duration-200 ${i === step ? 'w-4 bg-mira' : i < step ? 'w-1.5 bg-mira/40' : 'w-1.5 bg-titanium-700'}`} />
                        ))}
                    </div>
                    <button onClick={onDismiss} aria-label="Cerrar tour" className="p-1 -mr-1 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800">
                        <X size={15} aria-hidden="true" />
                    </button>
                </div>

                <div className="px-4 pt-2 pb-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-mira/10 border border-mira/25 text-mira" aria-hidden="true">
                            {current.icon}
                        </div>
                        <div className="min-w-0">
                            <p className="font-serif text-[15px] text-titanium-50 leading-tight">{current.title}</p>
                            <p className="text-xs text-titanium-400">{current.subtitle ?? `${step + 1} de ${STEPS.length}`}</p>
                        </div>
                    </div>

                    <p className="text-sm text-titanium-200 leading-relaxed mb-3" aria-live="polite">{current.content}</p>

                    {current.tip && (
                        <p className="rounded-lg px-3 py-2 mb-3 bg-titanium-950/60 border border-titanium-800 text-xs text-titanium-300 leading-snug">{current.tip}</p>
                    )}

                    <div className="flex gap-2">
                        {step > 0 && (
                            <button onClick={() => goTo(step - 1)} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm border border-titanium-700 text-titanium-300 hover:text-titanium-100 hover:bg-titanium-800">
                                <ChevronLeft size={14} aria-hidden="true" /> Atrás
                            </button>
                        )}
                        <button
                            onClick={() => { if (isLast) onDismiss(); else goTo(step + 1); }}
                            className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium bg-coral text-on-coral hover:brightness-110"
                        >
                            {isLast ? 'Entendido' : <>Siguiente <ChevronRight size={14} aria-hidden="true" /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
