import React from 'react';
import { Network, ZoomIn, X, MoreHorizontal, AlertTriangle, ExternalLink, AlertCircle } from 'lucide-react';

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
                    <button className="px-3 py-1.5 text-xs font-mono text-titanium-500 border border-titanium-800 rounded hover:bg-white/5 hover:text-titanium-100 transition-colors flex items-center gap-1">
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

            {/* Node Canvas Area */}
            {/* BACKGROUND MUST BE #0a0a0a AS PER CRITICAL RULE - We'll use bg-[#0a0a0a] specifically to be totally certain */}
            <div className="flex-1 relative overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing bg-[#0a0a0a]">

                {/* Canvas Container (forces width to allow panning) */}
                <div className="absolute min-w-[1200px] h-full flex items-center px-12 py-8">

                    {/* SVG Connecting Lines Layer */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ minWidth: '100%' }}>
                        {/* Root to Branch A */}
                        <path d="M 300 160 C 350 160, 350 100, 420 100" fill="none" stroke="#63625e" strokeDasharray="4 4" strokeWidth="1.5"></path>
                        {/* Root to Branch B */}
                        <path d="M 300 160 C 350 160, 350 220, 420 220" fill="none" stroke="#63625e" strokeWidth="1.5"></path>
                        {/* Branch A to Sub A1 */}
                        <path d="M 680 100 C 720 100, 720 70, 780 70" fill="none" stroke="#63625e" strokeWidth="1.5"></path>
                        {/* Branch A to Sub A2 */}
                        <path d="M 680 100 C 720 100, 720 130, 780 130" fill="none" stroke="#63625e" strokeWidth="1.5"></path>
                        {/* Branch B to Sub B1 */}
                        <path d="M 680 220 C 730 220, 730 220, 780 220" fill="none" stroke="#ef4444" strokeWidth="1.5"></path>
                    </svg>

                    {/* Nodes Layout container */}
                    <div className="relative z-10 flex items-center gap-24 w-full h-full">

                        {/* Level 0: Root Node */}
                        <div className="flex-shrink-0 w-[260px] bg-titanium-900 border border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.1)] rounded-xl p-4 flex flex-col gap-3 relative before:absolute before:inset-0 before:rounded-xl before:ring-1 before:ring-cyan-500/30 before:pointer-events-none">
                            <div className="flex items-center justify-between">
                                <span className="px-2 py-0.5 text-[10px] font-mono bg-cyan-900/20 text-cyan-400 border border-cyan-500/30 rounded uppercase tracking-wider">Trigger</span>
                                <MoreHorizontal size={14} className="text-titanium-500" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-titanium-100 mb-1">Traición al Gremio</h3>
                                <p className="text-xs text-titanium-500 font-mono leading-relaxed line-clamp-2">El protagonista decide abandonar el pacto y robar los planos del Distrito 4.</p>
                            </div>
                        </div>

                        {/* Level 1: Immediate Consequences */}
                        <div className="flex flex-col gap-12 flex-shrink-0">
                            {/* Branch A */}
                            <div className="w-[260px] bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-3 hover:border-titanium-500 transition-colors cursor-pointer group">
                                <div className="flex items-center justify-between">
                                    <span className="px-2 py-0.5 text-[10px] font-mono bg-white/5 text-titanium-300 border border-titanium-800 rounded uppercase tracking-wider">Consecuencia</span>
                                    <ExternalLink size={14} className="text-titanium-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-titanium-100 mb-1">Pérdida de recursos</h3>
                                    <p className="text-xs text-titanium-500 font-mono leading-relaxed line-clamp-2">Corte inmediato de suministros en el Distrito 4. Aliados locales se vuelven hostiles.</p>
                                </div>
                            </div>

                            {/* Branch B */}
                            <div className="w-[260px] bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-3 hover:border-titanium-500 transition-colors cursor-pointer group relative">
                                {/* Warning Indicator */}
                                <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-1 h-8 bg-amber-500 rounded-full"></div>

                                <div className="flex items-center justify-between pl-2">
                                    <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-900/10 text-amber-500 border border-amber-500/20 rounded uppercase tracking-wider flex items-center gap-1">
                                        <AlertTriangle size={10} />
                                        Riesgo Alto
                                    </span>
                                </div>
                                <div className="pl-2">
                                    <h3 className="text-sm font-semibold text-titanium-100 mb-1">Exposición de la Base</h3>
                                    <p className="text-xs text-titanium-500 font-mono leading-relaxed line-clamp-2">El rastro del robo permite al Antagonista deducir la ubicación de la base secreta.</p>
                                </div>
                            </div>
                        </div>

                        {/* Level 2: Secondary Consequences */}
                        <div className="flex flex-col justify-between h-full py-2 flex-shrink-0">
                            {/* Sub Branch A1 */}
                            <div className="w-[240px] bg-titanium-950 border border-titanium-800 rounded-lg p-3 opacity-80 hover:opacity-100 transition-opacity cursor-pointer mb-4 mt-2">
                                <h3 className="text-xs font-semibold text-titanium-300 mb-1">Mercado Negro Bloqueado</h3>
                                <p className="text-[11px] text-titanium-500 font-mono truncate">Requiere nueva vía de comercio.</p>
                            </div>

                            {/* Sub Branch A2 */}
                            <div className="w-[240px] bg-titanium-950 border border-titanium-800 rounded-lg p-3 opacity-80 hover:opacity-100 transition-opacity cursor-pointer mb-16">
                                <h3 className="text-xs font-semibold text-titanium-300 mb-1">Cazarrecompensas activados</h3>
                                <p className="text-[11px] text-titanium-500 font-mono truncate">Facción "Sombras" inicia búsqueda.</p>
                            </div>

                            {/* Sub Branch B1 (Critical) */}
                            <div className="w-[240px] bg-titanium-900 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.1)] rounded-lg p-3 cursor-pointer mt-12 mb-4 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500"></div>
                                <div className="flex items-center gap-1 mb-1">
                                    <AlertCircle size={12} className="text-red-500" />
                                    <h3 className="text-xs font-semibold text-red-500">Asedio Inevitable</h3>
                                </div>
                                <p className="text-[11px] text-titanium-300 font-mono leading-tight mt-1.5">Batalla forzada en Cap. 5. Puede romper el arco de sigilo planeado.</p>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </section>
    );
};

export default EfectoDomino;
