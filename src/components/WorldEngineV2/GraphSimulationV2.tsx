import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as d3Force from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select as d3Select } from 'd3-selection';
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
    AlertTriangle
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

// 🟢 GRAPH SIMULATION (D3 Logic + Direct DOM)
export interface GraphSimulationHandle {
    // No methods needed currently
}

const GraphSimulationV2 = forwardRef<GraphSimulationHandle, {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    setHoveredNodeId: (id: string | null) => void;
    onNodeClick: (node: VisualNode) => void;
    onUpdateGhost: (id: string, updates: any) => void;
    onCrystallize: (node: VisualNode) => void;
    isLoading: boolean;
    onTick: () => void;
}>(({ nodes, lodTier, setHoveredNodeId, onNodeClick, onUpdateGhost, onCrystallize, isLoading, onTick }, ref) => {
    const nodeRefs = useRef<Record<string, HTMLDivElement>>({});
    const simulationRef = useRef<any>(null);
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]); // For React Rendering only (Mount/Unmount)

    // 1. IMPERATIVE HANDLE (Sync from Parent)
    useImperativeHandle(ref, () => ({}));

    // Sync React State with Props (Initialization)
    useEffect(() => {
        const nextNodes = nodes.map(n => ({...n, x: n.x || undefined, y: n.y || undefined }));
        setSimNodes(nextNodes);
    }, [nodes]);

    // 🧠 MEMOIZED LINKS (For Dependency Tracking)
    const links = useMemo(() => {
        const l: any[] = [];
        simNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(r => {
                    if (simNodes.find(n => n.id === r.targetId)) {
                        l.push({ source: node.id, target: r.targetId, label: r.context || r.relation, ...r });
                    }
                });
            }
        });
        return l;
    }, [simNodes]);

    // 🐛 SWARM FIX: Watch Links Explicitly
    useEffect(() => {
        onTick();
    }, [links.length]);

    // ⚡ D3 PHYSICS & DRAG
    useEffect(() => {
        if (simNodes.length === 0) return;

        const width = 4000;
        const height = 4000;
        const cx = width / 2;
        const cy = height / 2;

        // Simulation Setup (ZERO KELVIN PROTOCOL)
        const simulation = d3Force.forceSimulation(simNodes as any)
            .alphaDecay(0.05) // ❄️ Faster freeze (default ~0.0228)
            .force("charge", d3Force.forceManyBody().strength(-300))
            .force("center", d3Force.forceCenter(cx, cy).strength(0.05))
            .force("collide", d3Force.forceCollide().radius(100).strength(0.7))
            .force("radial", d3Force.forceRadial(
                (d: any) => {
                    const type = (d.type || 'concept').toLowerCase();
                    if (d.isGhost) return 900;
                    if (type === 'character') return 100;
                    if (type === 'location') return 500;
                    if (type === 'faction') return 300;
                    return 800;
                }, cx, cy).strength(0.6))
            .force("link", d3Force.forceLink(links).id((d: any) => d.id).distance(200));

        // 🔄 TICK: DIRECT DOM MANIPULATION
        simulation.on("tick", () => {
            // 1. Move Nodes
            simNodes.forEach((node: any) => {
                const el = nodeRefs.current[node.id];
                if (el) {
                    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
                }
            });

            // 2. Sync Lines
            onTick();
        });

        simulation.on("end", () => {
            onTick();
        });

        // ✋ DRAG BEHAVIOR (SLEEP & WAKE)
        const dragBehavior = d3Drag<HTMLDivElement, any>()
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart(); // Wake up!
                d.fx = d.x;
                d.fy = d.y;
                // 🟢 LOGIC GATE: Start Tracking
                d._dragStartX = event.x;
                d._dragStartY = event.y;

                if(nodeRefs.current[d.id]) nodeRefs.current[d.id].style.cursor = 'grabbing';
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
                // Force immediate update of this node for smoothness (though tick handles it)
                const el = nodeRefs.current[d.id];
                if (el) el.style.transform = `translate(${event.x}px, ${event.y}px)`;
                onTick(); // ⚡ SURGICAL PRECISION
            })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0); // Go back to sleep
                d.fx = null;
                d.fy = null;
                if(nodeRefs.current[d.id]) nodeRefs.current[d.id].style.cursor = 'grab';

                // 🟢 LOGIC GATE: Click Detection (< 5px movement)
                const dist = Math.sqrt(
                    Math.pow(event.x - (d._dragStartX || 0), 2) +
                    Math.pow(event.y - (d._dragStartY || 0), 2)
                );

                if (dist < 5) {
                    onNodeClick(d);
                }
            });

        // Attach Drag to Refs
        // We use a timeout to ensure refs are populated after render
        setTimeout(() => {
             simNodes.forEach((node: any) => {
                 const el = nodeRefs.current[node.id];
                 if (el) {
                     d3Select(el).datum(node).call(dragBehavior as any);
                 }
             });
        }, 0);

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [simNodes]); // Re-run if node list changes

    // 🟢 RENDER
    return (
        <div className="relative w-[4000px] h-[4000px]">
             {/* Background Grid */}
             <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                }}
            />

            {/* NODES */}
            {simNodes.map((node) => (
                <EntityCard
                    key={node.id}
                    ref={(el) => { if(el) nodeRefs.current[node.id] = el; }}
                    node={node}
                    lodTier={lodTier}
                    setHoveredNodeId={setHoveredNodeId}
                    onClick={() => onNodeClick(node)}
                    onEdit={onUpdateGhost}
                    onCrystallize={() => onCrystallize(node)}
                />
            ))}

        </div>
    );
});

export default GraphSimulationV2;
