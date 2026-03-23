import React from 'react';
import { Network, ZoomIn, X, ListTree } from 'lucide-react';

interface EfectoDominoProps {
    onClose: () => void;
}

const EfectoDomino: React.FC<EfectoDominoProps> = ({ onClose }) => {
    return (
        <section className="absolute bottom-0 left-0 w-full h-[460px] min-h-[400px] bg-[#0a0a0a] border-t border-titanium-800 rounded-t-2xl z-40 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col transform transition-transform duration-500 ease-out translate-y-0">
            {/* Panel Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-[#0a0a0a]/50 backdrop-blur-sm rounded-t-2xl shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-cyan-900/20 rounded-lg border border-cyan-500/20">
                        <Network size={14} className="text-cyan-500" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-titanium-100">Efecto Dominó</h2>
                        <p className="text-xs text-titanium-500 font-mono mt-0.5">Análisis de Consecuencias Estratégicas</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-3 py-1.5 text-xs font-mono text-titanium-500 border border-titanium-800 rounded hover:bg-white/5 hover:text-titanium-100 transition-colors flex items-center gap-1 opacity-50 cursor-not-allowed" disabled>
                        <ZoomIn size={14} />
                        100%
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-titanium-500 hover:text-titanium-100 hover:bg-white/5 rounded transition-colors group"
                        aria-label="Cerrar Efecto Dominó"
                    >
                        <X size={20} />
                    </button>
                </div>
            </header>

            {/* Node Canvas Area - Empty State */}
            {/* BACKGROUND MUST BE #0a0a0a AS PER CRITICAL RULE */}
            <div className="flex-1 relative overflow-hidden bg-[#0a0a0a] flex flex-col items-center justify-center text-center p-8">

                <div className="p-6 bg-titanium-900/30 rounded-full border border-titanium-800/50 mb-6 text-titanium-600 animate-pulse">
                    <ListTree size={40} />
                </div>

                <h3 className="text-titanium-200 text-base font-medium mb-3">
                    Esperando nodo focal
                </h3>

                <div className="max-w-md bg-titanium-900/50 border border-titanium-800 rounded-lg p-4 shadow-sm">
                    <p className="text-titanium-400 text-sm leading-relaxed">
                        Selecciona un elemento del <span className="text-cyan-500 font-medium">triage (Pendientes)</span> para ver sus consecuencias en el flujo narrativo.
                    </p>
                </div>

                <div className="absolute inset-0 w-full h-full pointer-events-none z-0 opacity-[0.03]">
                    {/* Ghostly background lines representing inactive state */}
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" className="text-titanium-100" />
                    </svg>
                </div>

            </div>
        </section>
    );
};

export default EfectoDomino;
