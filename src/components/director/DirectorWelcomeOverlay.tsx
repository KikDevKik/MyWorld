import React, { useEffect, useRef, useState } from 'react';
import { X, Clock, Maximize2, GripVertical, Search, Scale, Database } from 'lucide-react';
import { toast } from 'sonner';

interface DirectorWelcomeOverlayProps {
    onDismiss: () => void;
}

const CAPABILITIES = [
    'Comparte imágenes, documentos o fragmentos para que analice el contexto de tu escena',
    'Te hace preguntas socráticas para desbloquearte cuando no sabes cómo continuar',
    'Si insistes en que "escriba", marca el ejemplo claramente: EJEMPLO — la voz es tuya, no mía',
];

const CONTROLS = [
    { icon: <Clock size={11} />, label: 'Historial', desc: 'tus sesiones anteriores con el Director' },
    { icon: <Maximize2 size={11} />, label: 'Expandir', desc: 'vista completa con herramientas adicionales' },
    { icon: <GripVertical size={11} />, label: 'Arrastrar', desc: 'extiende el chat arrastrando el borde izquierdo' },
];

const EXPANDED_TOOLS = [
    { icon: <Search size={11} />, label: 'Inspector', desc: 'analiza el elenco del archivo abierto (requiere archivo guardado en Drive)' },
    { icon: <Scale size={11} />, label: 'Tribunal', desc: 'invoca los 3 jueces sobre tu texto — consume más cuota de API' },
    { icon: <Database size={11} />, label: 'Memoria', desc: 'sincroniza el archivo actual para que el Director tenga contexto fresco' },
];

export function DirectorWelcomeOverlay({ onDismiss }: DirectorWelcomeOverlayProps) {
    const [progress, setProgress] = useState(100);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startRef = useRef(Date.now());
    const DURATION = 8000;

    // Auto-close after 8 seconds with a countdown bar
    useEffect(() => {
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
            setProgress(remaining);
            if (remaining === 0) onDismiss();
        }, 80);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [onDismiss]);

    const pause = () => { if (timerRef.current) clearInterval(timerRef.current); };
    const resume = () => {
        startRef.current = Date.now() - ((100 - progress) / 100) * DURATION;
        timerRef.current = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
            setProgress(remaining);
            if (remaining === 0) onDismiss();
        }, 80);
    };

    const handleGuide = () => {
        onDismiss();
        toast.info('Abre la guía completa desde el botón ❓ en el sidebar izquierdo.', { duration: 4000 });
    };

    return (
        <div
            className="absolute top-3 right-3 z-20 w-72 rounded-xl shadow-xl shadow-black/40"
            style={{
                background: 'rgba(10, 18, 14, 0.97)',
                border: '1px solid rgba(52, 211, 153, 0.18)',
                backdropFilter: 'blur(12px)',
            }}
            onMouseEnter={pause}
            onMouseLeave={resume}
        >
            {/* Auto-close progress bar */}
            <div className="h-0.5 rounded-t-xl overflow-hidden" style={{ background: 'rgba(52,211,153,0.1)' }}>
                <div
                    className="h-full transition-none"
                    style={{ width: `${progress}%`, background: 'rgba(52,211,153,0.5)' }}
                />
            </div>

            <div className="p-4">
                {/* Dismiss */}
                <button
                    onClick={onDismiss}
                    className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                    aria-label="Cerrar guía"
                >
                    <X size={13} />
                </button>

                {/* Header */}
                <div className="flex items-center gap-2.5 mb-3 pr-5">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                        style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}
                    >
                        🎬
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-white leading-none mb-0.5">El Director de Escena</h3>
                        <p className="text-[10px]" style={{ color: 'rgba(52,211,153,0.8)' }}>Copiloto narrativo socrático</p>
                    </div>
                </div>

                {/* Description */}
                <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                    Tu co-piloto para los momentos de bloqueo. Conoce tu mundo completo y te hace las preguntas correctas para que encuentres tu próxima escena — nunca escribe por ti, pero siempre está listo para guiarte.
                </p>

                {/* Capabilities */}
                <div className="space-y-1.5 mb-3">
                    {CAPABILITIES.map((cap, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <span className="text-xs mt-0.5 flex-shrink-0" style={{ color: 'rgba(52,211,153,0.7)' }}>→</span>
                            <span className="text-xs text-zinc-500 leading-snug">{cap}</span>
                        </div>
                    ))}
                </div>

                {/* Controls */}
                <div className="border-t pt-2.5 mb-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Controles del panel</p>
                    <div className="space-y-1">
                        {CONTROLS.map(({ icon, label, desc }, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="text-zinc-500 flex-shrink-0 w-3">{icon}</span>
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-14">{label}</span>
                                <span className="text-zinc-600 leading-snug">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Expanded tools */}
                <div className="border-t pt-2.5 mb-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mb-1.5 font-medium">Herramientas — vista expandida</p>
                    <div className="space-y-1">
                        {EXPANDED_TOOLS.map(({ icon, label, desc }, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px]">
                                <span className="flex-shrink-0 w-3 mt-0.5" style={{ color: 'rgba(52,211,153,0.5)' }}>{icon}</span>
                                <span className="text-zinc-400 font-semibold flex-shrink-0 w-14">{label}</span>
                                <span className="text-zinc-600 leading-snug">{desc}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                    <button
                        onClick={onDismiss}
                        className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{
                            background: 'rgba(52,211,153,0.1)',
                            border: '1px solid rgba(52,211,153,0.2)',
                            color: 'rgba(52,211,153,0.9)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.18)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(52,211,153,0.1)')}
                    >
                        Entendido
                    </button>
                    <button
                        onClick={handleGuide}
                        className="flex-1 py-1.5 rounded-lg text-xs transition-colors"
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(161,161,170,0.8)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(228,228,231,0.9)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'rgba(161,161,170,0.8)'; }}
                    >
                        Ver guía completa
                    </button>
                </div>
            </div>
        </div>
    );
}
