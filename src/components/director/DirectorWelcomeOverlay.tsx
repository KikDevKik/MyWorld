import React, { useEffect, useRef, useState } from 'react';
import { X, LayoutTemplate, Search, Scale, Database } from 'lucide-react';
import { toast } from 'sonner';

interface DirectorWelcomeOverlayProps {
    onDismiss: () => void;
}

// Mismo SVG del reloj que usa el header del Director
const HistorialIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        width="11" height="11">
        <circle cx="12" cy="12" r="9"/>
        <polyline points="12 7 12 12 15.5 14"/>
    </svg>
);

const CAPABILITIES = [
    'Comparte imágenes, documentos o fragmentos para que analice el contexto de tu escena',
    'Te hace preguntas socráticas para desbloquearte cuando no sabes cómo continuar',
    'Si insistes en que "escriba", marca el ejemplo: EJEMPLO — la voz es tuya, no mía',
];

const CONTROLS = [
    { icon: <HistorialIcon />, label: 'Historial', desc: 'abre tus sesiones anteriores' },
    { icon: <LayoutTemplate size={11} />, label: 'Expandir', desc: 'amplía el panel y muestra las herramientas' },
];

const EXPANDED_TOOLS = [
    { icon: <Search size={11} />, label: 'Inspector', desc: 'analiza el elenco del archivo abierto' },
    { icon: <Scale size={11} />, label: 'Tribunal', desc: 'invoca los 3 jueces — consume más cuota' },
    { icon: <Database size={11} />, label: 'Memoria', desc: 'sincroniza contexto fresco del archivo actual' },
];

export function DirectorWelcomeOverlay({ onDismiss }: DirectorWelcomeOverlayProps) {
    const [progress, setProgress] = useState(100);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startRef = useRef(Date.now());
    const progressRef = useRef(100);
    const DURATION = 8000;

    const startTimer = (fromProgress: number) => {
        if (timerRef.current) clearInterval(timerRef.current);
        startRef.current = Date.now() - ((100 - fromProgress) / 100) * DURATION;
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
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
            className="absolute top-3 right-3 z-20 rounded-xl shadow-xl shadow-black/40"
            style={{
                width: 'min(268px, calc(100% - 24px))',
                background: 'rgba(10, 18, 14, 0.97)',
                border: '1px solid rgba(52, 211, 153, 0.18)',
                backdropFilter: 'blur(12px)',
            }}
            onMouseEnter={pause}
            onMouseLeave={resume}
        >
            {/* Progress bar */}
            <div className="h-0.5 rounded-t-xl overflow-hidden" style={{ background: 'rgba(52,211,153,0.08)' }}>
                <div className="h-full" style={{ width: `${progress}%`, background: 'rgba(52,211,153,0.45)', transition: 'none' }} />
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
                        style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.22)' }}
                    >
                        🎬
                    </div>
                    <div>
                        <h3 className="text-xs font-semibold text-white leading-none mb-0.5">El Director de Escena</h3>
                        <p className="text-[10px]" style={{ color: 'rgba(52,211,153,0.75)' }}>Copiloto narrativo socrático</p>
                    </div>
                </div>

                {/* Description */}
                <p className="text-[11px] text-zinc-400 leading-relaxed mb-2.5">
                    Co-piloto para los momentos de bloqueo. Conoce tu mundo y te hace las preguntas correctas para que encuentres tu próxima escena — nunca escribe por ti.
                </p>

                {/* Capabilities */}
                <div className="space-y-1 mb-2.5">
                    {CAPABILITIES.map((cap, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                            <span className="text-[10px] mt-0.5 flex-shrink-0" style={{ color: 'rgba(52,211,153,0.6)' }}>→</span>
                            <span className="text-[11px] text-zinc-500 leading-snug">{cap}</span>
                        </div>
                    ))}
                </div>

                {/* Controls — iconos reales del header del Director */}
                <div className="border-t pt-2 mb-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Botones del panel</p>
                    <div className="space-y-1">
                        {CONTROLS.map(({ icon, label, desc }, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="text-zinc-500 flex-shrink-0 w-3 flex items-center">{icon}</span>
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-12">{label}</span>
                                <span className="text-zinc-600">{desc}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-zinc-500 flex-shrink-0 w-3 text-center">↔</span>
                            <span className="text-zinc-400 font-semibold flex-shrink-0 w-12">Resize</span>
                            <span className="text-zinc-600">arrastra el borde izquierdo del panel</span>
                        </div>
                    </div>
                </div>

                {/* Expanded tools */}
                <div className="border-t pt-2 mb-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Al expandir el panel</p>
                    <div className="space-y-1">
                        {EXPANDED_TOOLS.map(({ icon, label, desc }, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span className="flex-shrink-0 w-3 mt-0.5 flex items-center" style={{ color: 'rgba(52,211,153,0.45)' }}>{icon}</span>
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-12">{label}</span>
                                <span className="text-zinc-600 leading-snug">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-1.5">
                    <button
                        onClick={onDismiss}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                        style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: 'rgba(52,211,153,0.9)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
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
