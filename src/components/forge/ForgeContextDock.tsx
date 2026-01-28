import React from 'react';
import { Character } from '../../types';
import { Users, Ghost, User, BookOpen, RefreshCw, Link2 } from 'lucide-react';

export interface DetectedEntity {
    id?: string; // Optional ID if matched
    name: string;
    role: string;
    relevance_score: number;
    status: 'EXISTING' | 'DETECTED' | 'EXTERNAL';
    suggested_action: string;
}

interface ForgeContextDockProps {
    characters: Character[];
    detectedEntities: DetectedEntity[];
    onCharacterSelect: (char: Character | DetectedEntity) => void;
    isLoading: boolean;
    onRefresh?: () => void;
}

const ForgeContextDock: React.FC<ForgeContextDockProps> = ({ characters, detectedEntities, onCharacterSelect, isLoading, onRefresh }) => {

    // Group characters
    const protagonists = characters.filter(c => c.tier === 'MAIN');
    const secondary = characters.filter(c => c.tier === 'SUPPORTING');

    // Filter ghosts
    const ghosts = detectedEntities.filter(e => e.status === 'DETECTED');
    const external = detectedEntities.filter(e => e.status === 'EXTERNAL');

    if (isLoading) {
        return (
            <div className="h-full w-full bg-titanium-900 border-l border-titanium-800 p-6 flex flex-col items-center justify-center text-titanium-500">
                <div className="animate-pulse flex flex-col items-center gap-2">
                    <Users size={32} />
                    <span className="text-sm font-mono">LOADING CONTEXT...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-titanium-950 border-l border-titanium-800 flex flex-col">
            {/* HEADER */}
            <div className="h-14 flex items-center justify-between px-6 border-b border-titanium-800 shrink-0 bg-titanium-900/50">
                <h3 className="text-sm font-bold text-titanium-300 uppercase tracking-wider flex items-center gap-2">
                    <BookOpen size={16} />
                    <span>PERSONAJES</span>
                </h3>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="p-1.5 rounded-full text-titanium-500 hover:text-accent-DEFAULT hover:bg-titanium-800 transition-colors"
                        title="Forzar Re-análisis"
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>

            {/* LIST */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">

                {/* PROTAGONISTS */}
                {protagonists.length > 0 && (
                    <section>
                        <h4 className="text-xs font-bold text-accent-DEFAULT mb-3 px-2 flex items-center gap-2">
                            <User size={12} /> PROTAGONISTAS
                        </h4>
                        <div className="space-y-1">
                            {protagonists.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => onCharacterSelect(char)}
                                    className="w-full text-left p-3 rounded-lg bg-titanium-900 hover:bg-titanium-800 border border-titanium-800 hover:border-accent-DEFAULT/30 transition-all group"
                                >
                                    <div className="font-bold text-titanium-100 group-hover:text-white truncate">{char.name}</div>
                                    <div className="text-xs text-titanium-500 truncate">{char.role || "Sin rol definido"}</div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* SECONDARY */}
                {secondary.length > 0 && (
                    <section>
                        <h4 className="text-xs font-bold text-titanium-500 mb-3 px-2 flex items-center gap-2">
                            <Users size={12} /> SECUNDARIOS
                        </h4>
                        <div className="space-y-1">
                            {secondary.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => onCharacterSelect(char)}
                                    className="w-full text-left p-3 rounded-lg bg-titanium-900/50 hover:bg-titanium-800 border border-titanium-800/50 hover:border-titanium-600 transition-all group"
                                >
                                    <div className="font-medium text-titanium-300 group-hover:text-titanium-100 truncate">{char.name}</div>
                                    <div className="text-xs text-titanium-600 truncate">{char.role || "Sin rol definido"}</div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* EXTERNAL (CROSS-SAGA) */}
                {external.length > 0 && (
                    <section>
                        <h4 className="text-xs font-bold text-amber-500/80 mb-3 px-2 flex items-center gap-2">
                            <Link2 size={12} /> REFERENCIAS EXTERNAS
                        </h4>
                        <div className="space-y-1">
                            {external.map((entity, idx) => (
                                <button
                                    key={`ext-${idx}`}
                                    onClick={() => onCharacterSelect(entity)}
                                    className="w-full text-left p-3 rounded-lg bg-titanium-900/20 border border-titanium-800 hover:border-amber-500/30 hover:bg-amber-900/10 transition-all group"
                                >
                                    <div className="font-medium text-titanium-300 group-hover:text-amber-200 truncate flex justify-between">
                                        <span>{entity.name}</span>
                                        {/* Optional Icon for External */}
                                    </div>
                                    <div className="text-xs text-titanium-600 truncate group-hover:text-amber-500/70">{entity.role}</div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {/* DETECTED (GHOSTS) */}
                {ghosts.length > 0 && (
                    <section>
                        <h4 className="text-xs font-bold text-purple-400 mb-3 px-2 flex items-center gap-2 animate-pulse">
                            <Ghost size={12} /> DETECTADOS (GHOST)
                        </h4>
                        <div className="space-y-1">
                            {ghosts.map((entity, idx) => (
                                <button
                                    key={`ghost-${idx}`}
                                    onClick={() => onCharacterSelect(entity)}
                                    className="w-full text-left p-3 rounded-lg border border-dashed border-purple-900/50 hover:bg-purple-900/10 hover:border-purple-500/50 transition-all group"
                                >
                                    <div className="font-medium text-titanium-400 group-hover:text-purple-300 truncate italic flex justify-between">
                                        <span>{entity.name}</span>
                                        <span className="text-[10px] bg-purple-900/50 px-1.5 rounded text-purple-300">{entity.relevance_score}/10</span>
                                    </div>
                                    <div className="text-xs text-titanium-600 truncate">{entity.role}</div>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
};

export default ForgeContextDock;
