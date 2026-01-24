import React, { useState, forwardRef } from 'react';
import {
    Zap,
    Save,
    FileText,
    BrainCircuit,
    User,
    MapPin,
    Box,
    Swords,
    Diamond,
    AlertTriangle,
    PawPrint,
    Dna
} from 'lucide-react';
import { VisualNode } from './types';

// 🟢 DUPLICATED STYLES (Refined Cyberpunk Palette)
const NODE_STYLES: Record<string, { border: string, shadow: string, iconColor: string }> = {
    character: {
        border: 'border-yellow-500',
        shadow: 'shadow-[0_0_15px_rgba(234,179,8,0.5)]', // Yellow-500
        iconColor: 'text-yellow-500'
    },
    location: {
        border: 'border-cyan-500',
        shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.5)]', // Cyan-500
        iconColor: 'text-cyan-500'
    },
    idea: {
        border: 'border-purple-500',
        shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]', // Purple-500
        iconColor: 'text-purple-500'
    },
    conflict: {
        border: 'border-red-600',
        shadow: 'shadow-[0_0_15px_rgba(220,38,38,0.6)]', // Red-600
        iconColor: 'text-red-500'
    },
    creature: {
        border: 'border-emerald-500',
        shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.5)]', // Emerald-500
        iconColor: 'text-emerald-500'
    },
    race: {
        border: 'border-purple-500',
        shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]', // Purple-500
        iconColor: 'text-purple-500'
    },
    default: {
        border: 'border-slate-600',
        shadow: '',
        iconColor: 'text-slate-400'
    }
};

// 🟢 ENTITY CARD (OPTIMIZED: Memo + Ref + No Internal Drag)
const EntityCard = React.memo(forwardRef<HTMLDivElement, {
    node: VisualNode;
    onClick: () => void;
    onCrystallize?: () => void;
    onEdit?: (nodeId: string, updates: { name: string, description: string }) => void;
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    setHoveredNodeId: (id: string | null) => void;
}>(({ node, onClick, onCrystallize, onEdit, lodTier, setHoveredNodeId }, ref) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(node.name);
    const [editDesc, setEditDesc] = useState(node.description || "");

    // Detect Style
    let nodeStyleKey = 'default';
    if (node.type === 'character') nodeStyleKey = 'character';
    else if (node.type === 'location') nodeStyleKey = 'location';
    else if (node.meta?.node_type === 'conflict' || node.type === 'enemy') nodeStyleKey = 'conflict';
    else if (node.type === 'idea' || node.isGhost) nodeStyleKey = 'idea';
    else if (node.type === 'creature') nodeStyleKey = 'creature';
    else if (node.type === 'race') nodeStyleKey = 'race';
    else if (['faction', 'event', 'object'].includes(node.type)) nodeStyleKey = 'default';

    const style = NODE_STYLES[nodeStyleKey] || NODE_STYLES.default;

    // Icon Mapping
    const getIcon = () => {
        if (node.isRescue) return <AlertTriangle size={12} className="text-red-500 animate-pulse" />;
        switch (node.type) {
            case 'character': return <User size={12} />;
            case 'location': return <MapPin size={12} />;
            case 'object': return <Box size={12} />;
            case 'event': return <Zap size={12} />;
            case 'faction': return <Swords size={12} />;
            case 'idea': return <BrainCircuit size={12} />;
            case 'creature': return <PawPrint size={12} />;
            case 'race': return <Dna size={12} />;
            default: return <Diamond size={12} className="rotate-45" />;
        }
    };

    const isMacro = lodTier === 'MACRO';
    const isMicro = lodTier === 'MICRO';

    const handleSaveEdit = (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onEdit) {
            onEdit(node.id, { name: editName, description: editDesc });
            setIsEditing(false);
        }
    };

    return (
        <div
            ref={ref}
            id={node.id}
            className={`
                absolute flex items-center justify-center nodrag
                ${isMicro ? 'w-[200px] h-auto' : 'w-[120px] h-[60px]'}
                ${isMacro ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}
            `}
            style={{
                willChange: 'transform',
                zIndex: 10
            }}
            onMouseEnter={() => setHoveredNodeId(node.id)}
            onMouseLeave={() => setHoveredNodeId(null)}
        >
            {/* 🎨 INNER VISUAL CARD */}
            <div
                className={`
                    relative w-full h-full flex flex-col gap-1
                    bg-black/90 backdrop-blur-[4px] rounded-lg border
                    ${style.border}
                    ${isMicro ? 'p-3' : 'p-2 overflow-hidden'}
                    cursor-grab active:cursor-grabbing group transition-all duration-200
                    hover:scale-110 hover:shadow-xl hover:bg-black/95
                    ${style.shadow}
                    select-none
                `}
                onClick={(e) => {
                    if (!isEditing) onClick();
                }}
            >
                {isEditing ? (
                    <div className="flex flex-col gap-2 pointer-events-auto" onClick={e => e.stopPropagation()}>
                         <input
                            className="bg-slate-900/50 border border-slate-700 rounded px-1 text-sm font-bold text-white outline-none focus:border-cyan-500"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            placeholder="Nombre..."
                        />
                        <textarea
                            className="bg-slate-900/50 border border-slate-700 rounded px-1 text-[10px] text-slate-300 outline-none resize-none focus:border-cyan-500"
                            rows={2}
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            onKeyDown={e => e.stopPropagation()}
                            placeholder="Descripción..."
                        />
                        <div className="flex gap-1 justify-end mt-1">
                            <button onClick={() => setIsEditing(false)} className="text-[10px] text-red-400 hover:text-white px-2 py-0.5 border border-red-500/30 rounded">X</button>
                            <button onClick={handleSaveEdit} className="text-[10px] text-green-400 hover:text-white px-2 py-0.5 border border-green-500/30 rounded">OK</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between">
                            <div className={`flex items-center gap-1.5 ${style.iconColor} font-mono font-bold text-[10px] uppercase tracking-wider`}>
                                {getIcon()}
                                <span className="truncate max-w-[80px]">{node.type}</span>
                            </div>
                            {isMicro && node.isGhost && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {onEdit && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                        >
                                            <FileText size={10} />
                                        </button>
                                    )}
                                    {onCrystallize && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCrystallize(); }}
                                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                        >
                                            <Save size={10} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={`font-sans font-bold text-white leading-tight ${isMicro ? 'text-sm' : 'text-xs truncate'}`}>
                            {node.name}
                        </div>

                        {/* Subtype Display (Micro Only) */}
                        {isMicro && (node as any).subtype && (
                             <div className="text-[9px] text-cyan-500/80 font-mono tracking-wider uppercase">
                                 {(node as any).subtype}
                             </div>
                        )}

                        {isMicro && (node.meta?.brief || node.description) && (
                            <div className="text-[10px] text-slate-400 line-clamp-3 leading-relaxed font-mono">
                                {node.meta?.brief || node.description}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}));

export default EntityCard;
