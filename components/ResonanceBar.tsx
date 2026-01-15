import React, { useState } from 'react';
import { Sparkles, BrainCircuit, BookOpen } from 'lucide-react';

interface ResonanceMatch {
    source_file: string;
    type: 'PLOT_SEED' | 'VIBE_SEED' | 'LORE_SEED';
    crumb_text: string;
    similarity_score: number;
}

interface ResonanceBarProps {
    matches: ResonanceMatch[];
    isZenMode: boolean;
}

const ResonanceBar: React.FC<ResonanceBarProps> = ({ matches, isZenMode }) => {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Filter relevant matches
    const activeMatches = matches.filter(m => m.similarity_score > 0.80); // Strict threshold for visibility (Updated to 0.80)

    // If no matches and in Zen Mode, completely hide
    if (activeMatches.length === 0 && isZenMode) return null;

    // In normal mode, if no matches, show nothing or maybe a faint placeholder?
    // User said: "opacity 20% indicator" that "glows" when match.
    // If no matches, maybe just hide to keep it clean.
    if (activeMatches.length === 0) return null;

    return (
        <div className={`
            fixed right-16 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-4 p-4
            transition-all duration-700 ease-in-out
            ${isZenMode ? (activeMatches.length > 0 ? 'opacity-100' : 'opacity-0') : 'opacity-100'}
        `}>
            {activeMatches.map((match, idx) => (
                <div
                    key={`${match.source_file}-${idx}`}
                    className="relative group flex items-center justify-end"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                >
                    {/* CRUMB TOOLTIP (Left side of icon) */}
                    <div className={`
                        absolute right-12 top-1/2 -translate-y-1/2 w-64 p-3 rounded-lg
                        bg-titanium-900/90 border border-accent-DEFAULT/30 backdrop-blur-md shadow-xl
                        text-right transition-all duration-300 pointer-events-none
                        ${hoveredIndex === idx ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}
                    `}>
                        <p className="text-xs text-accent-DEFAULT font-bold mb-1 uppercase tracking-wider">
                            {match.type.replace('_SEED', '')}
                        </p>
                        <p className="text-sm text-titanium-100 italic font-serif leading-relaxed">
                            "{match.crumb_text}"
                        </p>
                        <p className="text-[10px] text-titanium-500 mt-2 truncate">
                            {match.source_file}
                        </p>
                    </div>

                    {/* INDICATOR ICON */}
                    <button
                        aria-label={`Resonancia: ${match.type} en ${match.source_file}`}
                        className={`
                            w-2 h-12 rounded-full transition-all duration-500 shadow-[0_0_10px_transparent]
                            ${match.type === 'PLOT_SEED' ? 'bg-red-500/50 hover:bg-red-400 hover:shadow-[0_0_15px_rgba(248,113,113,0.5)]' :
                              match.type === 'VIBE_SEED' ? 'bg-purple-500/50 hover:bg-purple-400 hover:shadow-[0_0_15px_rgba(192,132,252,0.5)]' :
                              'bg-emerald-500/50 hover:bg-emerald-400 hover:shadow-[0_0_15px_rgba(52,211,153,0.5)]'}
                            ${hoveredIndex === idx ? 'w-3 scale-110 opacity-100' : 'opacity-40 hover:opacity-80'}
                        `}
                    />
                </div>
            ))}
        </div>
    );
};

export default ResonanceBar;
