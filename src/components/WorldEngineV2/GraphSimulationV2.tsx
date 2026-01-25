import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as d3Force from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select as d3Select } from 'd3-selection';
import { polygonHull } from 'd3-polygon';
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

// 🟢 HELPER: Deterministic Neon Color Generator
const deterministicColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 90%, 60%)`; // High Saturation, Medium Lightness
};

// 🟢 HELPER: Grouping Logic
const getPrimaryGroup = (node: VisualNode): string | null => {
    // 1. Metadata Faction
    if (node.meta?.faction) return node.meta.faction;

    // 2. Relations to Faction (PART_OF, MEMBER_OF, OWNED_BY)
    if (node.relations) {
        const factionRel = node.relations.find(r =>
            (r.targetType === 'faction' || (r.targetType as string) === 'group') &&
            ['PART_OF', 'MEMBER_OF', 'OWNED_BY'].includes(r.relation)
        );
        if (factionRel) return factionRel.targetName;
    }

    // 3. Fallback for Items: Relations to Character (OWNED_BY)
    if (node.type === 'object' || (node.type as string) === 'item') {
        const ownerRel = node.relations?.find(r =>
            r.targetType === 'character' && r.relation === 'OWNED_BY'
        );
        if (ownerRel) return ownerRel.targetName;
    }

    return null;
};

// 🟢 HELPER: Get Node Color for Gradient
const getNodeBaseColor = (type: string): string => {
    const t = type.toLowerCase();
    if (t === 'character') return '#eab308'; // Yellow
    if (t === 'location') return '#06b6d4'; // Cyan
    if (t === 'faction') return '#f97316'; // Orange
    if (t === 'idea') return '#a855f7'; // Purple
    if (t === 'conflict' || t === 'enemy') return '#ef4444'; // Red
    return '#64748b'; // Slate
};

// 🟢 ENTITY CARD (DOM Layer)
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
    else if ((node.meta as any)?.node_type === 'conflict' || (node.type as string) === 'enemy') nodeStyleKey = 'conflict';
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

// 🟢 GRAPH SIMULATION (Hybrid: DOM Nodes + Canvas Edges/Hulls)
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simulationRef = useRef<any>(null);
    const lodTierRef = useRef(lodTier); // 🟢 Keep Fresh for D3 Closure
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]); // For React Rendering only (Mount/Unmount)

    // 1. IMPERATIVE HANDLE (Sync from Parent)
    useImperativeHandle(ref, () => ({}));

    // Sync React State with Props (Initialization)
    useEffect(() => {
        const nextNodes = nodes.map(n => ({...n, x: n.x || undefined, y: n.y || undefined }));
        setSimNodes(nextNodes);
    }, [nodes]);

    // Sync LOD Ref & Wake up simulation on change
    useEffect(() => {
        lodTierRef.current = lodTier;
        if (simulationRef.current) simulationRef.current.alpha(0.01).restart(); // Wake up briefly to redraw
    }, [lodTier]);

    // 🧠 MEMOIZED LINKS (For Dependency Tracking)
    const links = useMemo(() => {
        const l: any[] = [];
        simNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(r => {
                    const target = simNodes.find(n => n.id === r.targetId);
                    if (target) {
                        l.push({
                            source: node, // D3 will mutate this to object ref
                            target: target,
                            sourceId: node.id,
                            targetId: r.targetId,
                            label: r.context || r.relation,
                            ...r
                        });
                    }
                });
            }
        });
        return l;
    }, [simNodes]);

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

        // 🔄 TICK: HYBRID RENDER LOOP
        simulation.on("tick", () => {
            // 1. Move Nodes (DOM)
            simNodes.forEach((node: any) => {
                const el = nodeRefs.current[node.id];
                if (el) {
                    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
                }
            });

            // 2. Render Canvas (Hulls + Edges)
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const { width, height } = canvas;
                    ctx.clearRect(0, 0, width, height);

                    // --- LAYER 1: TERRITORY HULLS (Macro View) ---
                    // Group nodes by Faction/PrimaryGroup
                    const groups: Record<string, [number, number][]> = {};
                    simNodes.forEach((node: any) => {
                        const group = getPrimaryGroup(node);
                        if (group) {
                            if (!groups[group]) groups[group] = [];
                            groups[group].push([node.x, node.y]);
                        }
                    });

                    // Draw Hulls
                    ctx.lineJoin = "round";
                    ctx.lineWidth = 40; // Soft corners

                    Object.entries(groups).forEach(([groupName, points]) => {
                        if (points.length < 3) return; // Need at least 3 points for a hull

                        const hull = polygonHull(points);
                        if (hull) {
                            const color = deterministicColor(groupName);
                            ctx.beginPath();
                            ctx.moveTo(hull[0][0], hull[0][1]);
                            for (let i = 1; i < hull.length; i++) {
                                ctx.lineTo(hull[i][0], hull[i][1]);
                            }
                            ctx.closePath();

                            // Style
                            ctx.fillStyle = color.replace('hsl', 'hsla').replace(')', ', 0.15)'); // 15% opacity
                            ctx.strokeStyle = color.replace('hsl', 'hsla').replace(')', ', 0.3)'); // 30% stroke
                            ctx.shadowBlur = 60;
                            ctx.shadowColor = color;

                            ctx.fill();
                            ctx.stroke();

                            // Reset Shadow for next ops
                            ctx.shadowBlur = 0;
                        }
                    });

                    // --- LAYER 2: ENERGY BEAMS (Edges) ---
                    ctx.globalCompositeOperation = 'lighter'; // Energy Glow
                    ctx.lineWidth = 2;

                    links.forEach((link: any) => {
                        const source = link.source as VisualNode;
                        const target = link.target as VisualNode;

                        // Safety check if physics hasn't populated x/y yet
                        if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;

                        const gradient = ctx.createLinearGradient(source.x, source.y, target.x, target.y);
                        gradient.addColorStop(0, getNodeBaseColor(source.type));
                        gradient.addColorStop(1, getNodeBaseColor(target.type));

                        ctx.strokeStyle = gradient;
                        ctx.beginPath();
                        ctx.moveTo(source.x, source.y);
                        ctx.lineTo(target.x, target.y);
                        ctx.stroke();
                    });

                    ctx.globalCompositeOperation = 'source-over'; // Reset

                    // --- LAYER 3: MACRO DOTS (When DOM is hidden) ---
                    if (lodTierRef.current === 'MACRO') {
                        simNodes.forEach((node: any) => {
                             ctx.fillStyle = getNodeBaseColor(node.type);
                             ctx.beginPath();
                             ctx.arc(node.x, node.y, 4, 0, Math.PI * 2);
                             ctx.fill();
                        });
                    }
                }
            }

            // 3. Notify Parent (if needed for overlay sync, though we moved overlay to canvas)
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
                // NOTE: We don't manually tick here for performance, we let the simulation tick loop handle rendering
                // But for super-smooth dragging we could call simulation.tick() or manually redraw canvas
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

            {/* 🟢 CANVAS LAYER (Bottom) */}
            <canvas
                ref={canvasRef}
                width={4000}
                height={4000}
                className="absolute inset-0 z-0 pointer-events-none"
            />

            {/* NODES (DOM Layer - Top) */}
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
