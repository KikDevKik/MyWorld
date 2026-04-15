import React from 'react';
import { Network, Users, Map, Book, Settings, GitMerge } from 'lucide-react';

export type ActiveTool = 'none' | 'domino' | 'personajes' | 'patches' | 'map' | 'lore' | 'settings';

interface ToolbarButton {
    id: ActiveTool;
    icon: React.ReactNode;
    label: string;
    enabled: boolean;
}

interface ArquitectoToolbarProps {
    activeTool: ActiveTool;
    onToolChange: (tool: ActiveTool) => void;
    pendingPatchesCount?: number;
}

/**
 * ArquitectoToolbar — Barra flotante vertical fija en absolute left-8 bottom-8.
 * Al hacer clic en un botón activo lo cierra (toggle).
 * El botón activo se resalta con glow cyan.
 */
const ArquitectoToolbar: React.FC<ArquitectoToolbarProps> = ({ activeTool, onToolChange, pendingPatchesCount }) => {
    const tools: ToolbarButton[] = [
        { id: 'domino', icon: <Network size={20} />, label: 'Efecto Dominó', enabled: true },
        { id: 'personajes', icon: <Users size={20} />, label: 'Personajes', enabled: true },
        { id: 'patches', icon: <GitMerge size={20} />, label: 'Parches de Canon', enabled: true },
        { id: 'map', icon: <Map size={20} />, label: 'Mapa de Colisiones', enabled: true },
        { id: 'lore', icon: <Book size={20} />, label: 'Roadmap Final', enabled: true },
        { id: 'settings', icon: <Settings size={20} />, label: 'Ajustes Socráticos', enabled: true }
    ];

    const handleClick = (id: ActiveTool, enabled: boolean) => {
        if (!enabled) return;
        onToolChange(activeTool === id ? 'none' : id);
    };

    return (
        <div className="absolute left-8 bottom-8 z-20">
            <div className="bg-titanium-900/70 backdrop-blur-xl border border-titanium-800 rounded-full p-2 flex flex-col gap-3 shadow-2xl">
                {tools.map(tool => (
                    <button
                        key={tool.id}
                        onClick={() => handleClick(tool.id, tool.enabled)}
                        disabled={!tool.enabled}
                        title={tool.enabled ? undefined : `${tool.label} — próximamente`}
                        className={`
                            w-10 h-10 flex items-center justify-center rounded-full
                            transition-all group relative
                            ${!tool.enabled
                                ? 'text-titanium-700 cursor-not-allowed opacity-40'
                                : activeTool === tool.id
                                    ? 'text-cyan-400 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                                    : 'text-titanium-500 hover:text-cyan-400 hover:bg-titanium-800/50'
                            }
                        `}
                        aria-label={tool.label}
                        aria-pressed={activeTool === tool.id}
                    >
                        {tool.icon}
                        
                        {/* Badge para patches */}
                        {tool.id === 'patches' && pendingPatchesCount !== undefined && pendingPatchesCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center">
                                {pendingPatchesCount > 9 ? '9+' : pendingPatchesCount}
                            </span>
                        )}

                        {/* Tooltip */}
                        <span className="
                            absolute left-full ml-4 px-2 py-1
                            bg-titanium-950 border border-titanium-800 rounded
                            text-[11px] font-mono uppercase tracking-wider text-titanium-300
                            opacity-0 group-hover:opacity-100 pointer-events-none
                            whitespace-nowrap transition-opacity z-30
                        ">
                            {tool.label}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ArquitectoToolbar;
