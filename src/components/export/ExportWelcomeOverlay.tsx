import React, { useEffect, useRef, useState } from 'react';
import { X, Printer, Folder, BookOpen, Download, Shield, ChevronLeft, ChevronRight } from 'lucide-react';

interface ExportWelcomeOverlayProps {
    onDismiss: () => void;
    onHighlight: (element: string | null) => void;
}

type ExportStep = {
    highlight: string | null;
    icon: React.ReactNode;
    title: string;
    content: string;
    tip?: string;
};

const STEPS: ExportStep[] = [
    {
        highlight: null,
        icon: <Printer size={20} />,
        title: 'La Imprenta',
        content: 'Compila los archivos de tu proyecto en un PDF listo para publicar, con portada, tabla de contenidos y formato de libro. También genera reportes de autoría y certificados públicos de paternidad.',
    },
    {
        highlight: 'files',
        icon: <Folder size={20} />,
        title: 'Composición del Manuscrito',
        content: 'Selecciona los archivos que irán en el libro. Marca carpetas enteras o archivos individuales — el orden del árbol determina el orden en el PDF. Solo se incluyen los archivos marcados.',
        tip: 'Puedes dejar carpetas de notas o recursos sin marcar para que no aparezcan en el manuscrito final.',
    },
    {
        highlight: 'meta',
        icon: <BookOpen size={20} />,
        title: 'Título, Subtítulo y Autor',
        content: 'Estos datos aparecen en la portada del PDF y en el certificado de autoría. El título se rellena automáticamente con el nombre del proyecto, pero puedes cambiarlo.',
    },
    {
        highlight: 'compile',
        icon: <BookOpen size={20} />,
        title: 'Compilar Manuscrito',
        content: 'Genera el PDF con todos los archivos seleccionados. Una vez compilado, aparece el botón de descarga. Puedes ajustar las opciones de formato (portada, índice, saltos de página) antes de compilar.',
        tip: 'La compilación puede tardar según el número de archivos. El motor procesa el Markdown y aplica estilos tipográficos automáticamente.',
    },
    {
        highlight: 'cert',
        icon: <Shield size={20} />,
        title: 'Reporte y Certificado',
        content: 'El "Descargar Reporte" genera un registro de toda la actividad creativa del proyecto (TXT, MD o PDF) — útil como evidencia de autoría. El "Certificado Público" crea un enlace verificable que acredita que tú creaste este proyecto en esta fecha.',
        tip: 'El certificado genera una URL pública permanente. Compártela para demostrar autoría ante editores, concursos o plataformas.',
    },
];

export function ExportWelcomeOverlay({ onDismiss, onHighlight }: ExportWelcomeOverlayProps) {
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
            className="absolute top-16 right-4 z-50"
            style={{ width: '272px' }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className="rounded-xl shadow-2xl shadow-black/60"
                style={{
                    background: 'rgba(8, 12, 16, 0.97)',
                    border: '1px solid rgba(6,182,212,0.2)',
                    backdropFilter: 'blur(16px)',
                }}
            >
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
