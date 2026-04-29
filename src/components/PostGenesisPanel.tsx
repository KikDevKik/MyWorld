import React from 'react';
import { Sparkles, BookOpen, PenLine, ChevronRight, X } from 'lucide-react';

interface PostGenesisPanelProps {
    projectName: string;
    filesCreated: number;
    premise?: string;
    onGoToCapitulo?: () => void;
    onGoToArquitecto: () => void;
    onDismiss: () => void;
}

export function PostGenesisPanel({
    projectName,
    filesCreated,
    premise,
    onGoToCapitulo,
    onGoToArquitecto,
    onDismiss
}: PostGenesisPanelProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full px-8 py-12 text-center bg-titanium-950">
            {/* Ícono celebración */}
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30
                flex items-center justify-center mb-6">
                <Sparkles size={28} className="text-cyan-400" />
            </div>

            {/* Título */}
            <h2 className="text-xl font-semibold text-white mb-2">
                ¡{projectName} está listo!
            </h2>

            {/* Descripción */}
            <p className="text-sm text-zinc-400 mb-8 max-w-xs leading-relaxed">
                Se crearon {filesCreated} archivos base con el mundo de tu historia.
                ¿Por dónde quieres empezar?
            </p>

            <div className="w-full max-w-xs space-y-3">
                {/* CTA primario — Comenzar a escribir */}
                {onGoToCapitulo && (
                    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30
                                flex items-center justify-center flex-shrink-0 mt-0.5">
                                <PenLine size={14} className="text-cyan-400" />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-medium text-white mb-1">Escribir ahora</p>
                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    El Director te hará 3 preguntas para encontrar
                                    tu punto de entrada al Capítulo 01.
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onGoToCapitulo}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                                bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium
                                rounded-lg transition-colors"
                        >
                            Comenzar a escribir
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}

                {/* CTA secundario — El Arquitecto */}
                <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30
                            flex items-center justify-center flex-shrink-0 mt-0.5">
                            <BookOpen size={14} className="text-violet-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-medium text-white mb-1">Construir el mundo</p>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                El Arquitecto analizará tu mundo y te ayudará
                                a detectar inconsistencias antes de escribir.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onGoToArquitecto}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                            bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium
                            rounded-lg transition-colors"
                    >
                        Abrir El Arquitecto
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Opción terciaria */}
            <button
                onClick={onDismiss}
                className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 transition-colors
                    flex items-center gap-1"
            >
                <X size={12} />
                Explorar solo por ahora
            </button>
        </div>
    );
}
