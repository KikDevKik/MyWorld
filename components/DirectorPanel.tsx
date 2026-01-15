import React, { useState } from 'react';
import { Sparkles, BrainCircuit, Flag, Lightbulb, Zap } from 'lucide-react';

interface ResonanceMatch {
    source_file: string;
    type: 'PLOT_SEED' | 'VIBE_SEED' | 'LORE_SEED';
    crumb_text: string;
    similarity_score: number;
}

interface StructureAlert {
    detected_phase?: string;
    advice?: string;
    confidence?: number;
}

interface DirectorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    resonanceMatches: ResonanceMatch[];
    structureAlerts?: StructureAlert; // From Resonance Check
    midpointAlert?: boolean; // From Editor Word Count (The Wall)
    isZenMode: boolean;
}

const DirectorPanel: React.FC<DirectorPanelProps> = ({
    resonanceMatches,
    structureAlerts,
    midpointAlert,
    isZenMode
}) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Filter relevant matches
    const activeMatches = resonanceMatches.filter(m => m.similarity_score > 0.80);

    // Visibility Logic: Show if (Active Matches OR Midpoint Alert OR Structure Advice)
    // AND NOT completely hidden by Zen Mode (unless hover?)
    // Actually, user spec says "DirectorPanel now is the main container of echoes".
    // Zen Mode usually hides everything, but if there is a Resonance, we might show a subtle indicator.

    const hasContent = activeMatches.length > 0 || midpointAlert || (structureAlerts?.advice && structureAlerts.confidence && structureAlerts.confidence > 0.7);

    if (!hasContent) return null;

    return (
        <div className={`
            fixed right-16 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-6 p-4
            transition-all duration-700 ease-in-out pointer-events-none
            ${isZenMode ? 'opacity-0 hover:opacity-100 pointer-events-auto' : 'opacity-100 pointer-events-auto'}
        `}>
            {/* 🟢 MIDPOINT WALL ALERT (STRUCTURE) */}
            {midpointAlert && (
                <div className="relative group flex items-center justify-end animate-in slide-in-from-right duration-700">
                    <div className="bg-amber-950/90 border border-amber-500/50 backdrop-blur-md shadow-[0_0_30px_rgba(245,158,11,0.2)] p-4 rounded-xl max-w-xs text-right">
                        <div className="flex items-center justify-end gap-2 mb-1 text-amber-500 font-bold uppercase tracking-widest text-xs">
                            <span>Alerta de Estructura</span>
                            <Flag size={14} className="fill-amber-500/20" />
                        </div>
                        <p className="text-titanium-100 text-sm font-medium leading-relaxed">
                            ¿Se ha alcanzado el Midpoint? <br/>
                            <span className="text-amber-200/70 text-xs italic">Revisa el giro de trama. (Muro de pág. 20-60)</span>
                        </p>
                    </div>
                    {/* Icon Indicator */}
                    <div className="w-1 h-12 bg-amber-500 rounded-full ml-4 shadow-[0_0_10px_rgba(245,158,11,0.5)]"></div>
                </div>
            )}

            {/* 🟢 RESONANCE ECHOES (BARD) */}
            {activeMatches.map((match, idx) => (
                <div
                    key={`${match.source_file}-${idx}`}
                    className="relative group flex items-center justify-end"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {/* CRUMB TOOLTIP */}
                    <div className={`
                        absolute right-6 top-1/2 -translate-y-1/2 w-72 p-4 rounded-xl
                        bg-titanium-900/95 border border-cyan-500/30 backdrop-blur-xl shadow-2xl
                        text-right transition-all duration-500 origin-right
                        ${hoveredIndex === idx ? 'opacity-100 scale-100 translate-x-0' : 'opacity-0 scale-90 translate-x-8 pointer-events-none'}
                    `}>
                        <div className="flex items-center justify-end gap-2 mb-2">
                             <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                                {match.type.replace('_SEED', '')}
                            </span>
                            <Sparkles size={12} className="text-cyan-400" />
                        </div>

                        <p className="text-sm text-titanium-100 italic font-serif leading-relaxed border-r-2 border-cyan-500/50 pr-3">
                            "{match.crumb_text}"
                        </p>

                        <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-titanium-500">
                             <BrainCircuit size={10} />
                             <span className="truncate max-w-[150px]">{match.source_file}</span>
                        </div>
                    </div>

                    {/* INDICATOR ORB */}
                    <button
                        aria-label={`Resonancia: ${match.type} en ${match.source_file}`}
                        className={`
                            w-3 h-3 rounded-full transition-all duration-500 shadow-[0_0_15px_transparent] ml-4 ring-2 ring-offset-2 ring-offset-titanium-950
                            ${match.type === 'PLOT_SEED' ? 'bg-red-500 ring-red-900/50 hover:shadow-[0_0_20px_rgba(248,113,113,0.6)]' :
                              match.type === 'VIBE_SEED' ? 'bg-purple-500 ring-purple-900/50 hover:shadow-[0_0_20px_rgba(192,132,252,0.6)]' :
                              'bg-emerald-500 ring-emerald-900/50 hover:shadow-[0_0_20px_rgba(52,211,153,0.6)]'}
                            ${hoveredIndex === idx ? 'scale-150' : 'opacity-60 hover:opacity-100 hover:scale-125'}
                        `}
                    />
                </div>
            ))}
        </div>
    );
};

export default DirectorPanel;
