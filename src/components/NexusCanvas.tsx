import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import * as d3Force from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select as d3Select } from 'd3-selection';
import {
    Globe,
    Zap,
    Save,
    FileText,
    Plus,
    Loader2,
    BrainCircuit,
    User,
    MapPin,
    Box,
    Swords,
    Diamond,
    AlertTriangle,
    Bug,
    Trash2
} from 'lucide-react';
import { getFirestore, collection, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';

import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { GraphNode, EntityType } from '../types/graph';
import CrystallizeModal from './ui/CrystallizeModal';
import { callFunction } from '../services/api';

// 🟢 VISUAL TYPES
interface VisualNode extends GraphNode {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    // UI Flags
    isGhost?: boolean; // True = Local Draft (Idea)
    isRescue?: boolean; // True = Failed Save (Lifeboat)
    meta?: any; // 🟢 Fallback for meta
}

interface PendingCrystallization {
    node: VisualNode;
    targetData: {
        fileName: string;
        folderId: string;
        frontmatter: any;
    };
    timestamp: number;
}

const PENDING_KEY = 'nexus_pending_crystallization';
const DRAFTS_KEY = 'nexus_drafts_v1';

// 🟢 STYLES (CYBERPUNK PALETTE REFINED)
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

const RELATION_COLORS: Record<string, string> = {
    ENEMY: '#ef4444', // Red-500
    RIVAL: '#ef4444',
    HATE: '#ef4444',
    ALLY: '#06b6d4', // Cyan-500
    FRIEND: '#06b6d4',
    LOVE: '#ec4899', // Pink-500
    FAMILY: '#eab308', // Yellow-500
    BLOOD: '#eab308',
    MAGIC: '#a855f7', // Purple-500
    MYSTIC: '#a855f7',
    DEFAULT: '#64748b' // Slate-500
};

const getRelationColor = (type: string) => {
    if (!type) return RELATION_COLORS.DEFAULT;
    const key = type.toUpperCase();
    if (key.includes('ENEMY') || key.includes('WAR') || key.includes('KILL') || key.includes('HATE') || key.includes('ODIA') || key.includes('TRAICIÓN') || key.includes('RIVAL') || key.includes('MUERTE')) return RELATION_COLORS.ENEMY;
    if (key.includes('ALLY') || key.includes('FRIEND') || key.includes('TRADE') || key.includes('LOVE')) return RELATION_COLORS.ALLY;
    if (key.includes('FAMILY') || key.includes('SPOUSE') || key.includes('BLOOD') || key.includes('SIB')) return RELATION_COLORS.FAMILY;
    if (key.includes('MAGIC') || key.includes('SPELL') || key.includes('CURSE')) return RELATION_COLORS.MAGIC;
    return RELATION_COLORS.DEFAULT;
};

// 🟢 FACTION LABEL (MACRO VIEW)
// Now purely presentational, position injected via style by parent tick or ignored in this pass?
// We'll leave it as Motion for now, but might lag.
const FactionLabel: React.FC<{ name: string, x: number, y: number, count: number }> = ({ name, x, y, count }) => (
    <div
        style={{ transform: `translate(${x}px, ${y}px)` }}
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center cursor-default pointer-events-none z-0 transition-transform duration-300 ease-out"
    >
        <div className="text-[60px] font-black text-white/10 uppercase tracking-[0.2em] drop-shadow-2xl whitespace-nowrap select-none">
            {name}
        </div>
        <div className="text-sm text-cyan-500/50 font-mono tracking-[0.5em] uppercase mt-2 bg-black/50 px-2 rounded">
            {count} NODES
        </div>
    </div>
);

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
    const type = (node.type || '').toUpperCase();

    if (type === 'CHARACTER' || type === 'PERSON') nodeStyleKey = 'character';
    else if (type === 'LOCATION') nodeStyleKey = 'location';
    else if (node.meta?.node_type === 'conflict' || type === 'ENEMY') nodeStyleKey = 'conflict';
    else if (type === 'IDEA' || node.isGhost) nodeStyleKey = 'idea';
    else if (['FACTION', 'EVENT', 'OBJECT'].includes(type)) nodeStyleKey = 'default';

    const style = NODE_STYLES[nodeStyleKey] || NODE_STYLES.default;

    // Icon Mapping
    const getIcon = () => {
        if (node.isRescue) return <AlertTriangle size={12} className="text-red-500 animate-pulse" />;
        const type = (node.type || '').toUpperCase();
        switch (type) {
            case 'CHARACTER':
            case 'PERSON': return <User size={12} />;
            case 'LOCATION': return <MapPin size={12} />;
            case 'OBJECT': return <Box size={12} />;
            case 'EVENT': return <Zap size={12} />;
            case 'FACTION': return <Swords size={12} />;
            case 'IDEA': return <BrainCircuit size={12} />;
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
                    // Prevent drag click from triggering click if moved? D3 handles this usually.
                    // e.stopPropagation(); // We want to allow D3 drag to not trigger this if dragged?
                    // Actually, for pure click:
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
    // No methods needed currently, but keeping for future extensibility or D3 control
}

const GraphSimulation = forwardRef<GraphSimulationHandle, {
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
        // Deep compare or just id check?
        // We want to preserve existing simulation nodes if possible to avoid re-layout?
        // But for now, simple sync.
        // We clone to avoid mutating props
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
                    const type = (d.type || 'concept').toUpperCase();
                    if (d.isGhost) return 900;
                    if (type === 'CHARACTER' || type === 'PERSON') return 100;
                    if (type === 'LOCATION') return 500;
                    if (type === 'FACTION') return 300;
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


// 🟢 LINKS OVERLAY (Static Layer - "The Divorce")
export interface LinksOverlayHandle {
    forceUpdate: () => void;
}

const LinksOverlay = forwardRef<LinksOverlayHandle, {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    hoveredNodeId: string | null;
    hoveredLineId: string | null;
    setHoveredLineId: (id: string | null) => void;
}>(({ nodes, lodTier, hoveredNodeId, hoveredLineId, setHoveredLineId }, ref) => {
    const updateXarrow = useXarrow();

    useImperativeHandle(ref, () => ({
        forceUpdate: () => updateXarrow()
    }));

    if (lodTier === 'MACRO') return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <Xwrapper>
                {nodes.map((node) => {
                    if (!node.relations) return null;
                    return node.relations.map((rel, idx) => {
                        // 🟢 ROBUST TARGET RESOLUTION
                        let targetNode = nodes.find(n => n.id === rel.targetId);

                        // Fallback: Name Match (Case Insensitive)
                        if (!targetNode && rel.target) {
                            const normTarget = rel.target.toLowerCase().trim();
                            targetNode = nodes.find(n => n.name.toLowerCase().trim() === normTarget);
                        }

                        if (!targetNode) return null;

                        const lineId = `${node.id}-${targetNode.id}-${idx}`;
                        const isFocused = hoveredNodeId === node.id || hoveredNodeId === targetNode.id || hoveredLineId === lineId;
                        const relColor = getRelationColor(rel.relation);
                        const labelText = rel.context
                            ? (rel.context.length > 30 ? rel.context.substring(0, 27) + "..." : rel.context)
                            : rel.relation;

                        return (
                            <Xarrow
                                key={lineId}
                                start={node.id}
                                end={targetNode.id}
                                startAnchor="middle"
                                endAnchor="middle"
                                color={relColor}
                                strokeWidth={1.5}
                                headSize={3}
                                curveness={0.3}
                                path="smooth"
                                zIndex={0}
                                animateDrawing={false}
                                passProps={{
                                    onMouseEnter: () => setHoveredLineId(lineId),
                                    onMouseLeave: () => setHoveredLineId(null),
                                    style: { cursor: 'pointer', pointerEvents: 'auto' }
                                }}
                                labels={{
                                    middle: (
                                        <div
                                            className={`
                                                bg-black/90 backdrop-blur text-[9px] px-2 py-0.5 rounded-full border max-w-[200px] truncate cursor-help transition-all duration-300
                                                ${isFocused ? 'opacity-100 scale-100 z-50' : 'opacity-0 scale-90 -z-10'}
                                            `}
                                            style={{
                                                borderColor: relColor,
                                                color: relColor,
                                                boxShadow: `0 0 5px ${relColor}20`,
                                                pointerEvents: 'auto'
                                            }}
                                            title={`${rel.relation}: ${rel.context || 'Sin contexto'}`}
                                        >
                                            {labelText}
                                        </div>
                                    )
                                }}
                            />
                        );
                    });
                })}
            </Xwrapper>
        </div>
    );
});


// 🟢 MAIN COMPONENT
const NexusCanvas: React.FC<{ isOpen?: boolean }> = ({ isOpen = true }) => {
    const graphRef = useRef<GraphSimulationHandle>(null);
    const linksOverlayRef = useRef<LinksOverlayHandle>(null);
    const { config, user } = useProjectConfig();
    const [dbNodes, setDbNodes] = useState<GraphNode[]>([]);
    const [ghostNodes, setGhostNodes] = useState<VisualNode[]>([]);
    const [pendingNodes, setPendingNodes] = useState<PendingCrystallization[]>([]);

    // UI State
    const [inputValue, setInputValue] = useState("");
    const [entropy, setEntropy] = useState(0.5);
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);

    // View State
    const [lodTier, setLodTier] = useState<'MACRO' | 'MESO' | 'MICRO'>('MESO');
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // Lifeboat & Drafts logic (Simplified for brevity, same as before)
    useEffect(() => {
        const savedRescue = localStorage.getItem(PENDING_KEY);
        let initialGhosts: VisualNode[] = [];
        if (savedRescue) {
            try {
                const parsed = JSON.parse(savedRescue) as PendingCrystallization[];
                setPendingNodes(parsed);
                initialGhosts = parsed.map(p => ({ ...p.node, isGhost: true, isRescue: true }));
            } catch (e) {}
        }
        const savedDrafts = localStorage.getItem(DRAFTS_KEY);
        if (savedDrafts) {
            try {
                const parsedDrafts = JSON.parse(savedDrafts) as VisualNode[];
                const rescueIds = new Set(initialGhosts.map(n => n.id));
                const uniqueDrafts = parsedDrafts.filter(d => !rescueIds.has(d.id));
                initialGhosts = [...initialGhosts, ...uniqueDrafts];
            } catch (e) {}
        }
        if (initialGhosts.length > 0) setGhostNodes(prev => [...prev, ...initialGhosts]);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (ghostNodes.length > 0) localStorage.setItem(DRAFTS_KEY, JSON.stringify(ghostNodes));
            else if (localStorage.getItem(DRAFTS_KEY)) localStorage.removeItem(DRAFTS_KEY);
        }, 1000);
        return () => clearTimeout(timer);
    }, [ghostNodes]);

    const saveToLifeboat = (node: VisualNode, targetData: any) => {
        const newItem: PendingCrystallization = { node, targetData, timestamp: Date.now() };
        setPendingNodes(prev => {
            const next = [...prev, newItem];
            localStorage.setItem(PENDING_KEY, JSON.stringify(next));
            return next;
        });
        setGhostNodes(prev => prev.map(g => g.id === node.id ? { ...g, isRescue: true } : g));
        toast.warning("⚠️ Guardado fallido. Nodo asegurado en Boya Local.");
    };

    const removeFromLifeboat = (nodeId: string) => {
        setPendingNodes(prev => {
            const next = prev.filter(p => p.node.id !== nodeId);
            localStorage.setItem(PENDING_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleCrystallizeConfirm = async (data: any, overrideNode?: VisualNode) => {
        const targetNode = overrideNode || crystallizeModal.node;
        if (!targetNode) return;
        setIsCrystallizing(true);

        try {
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Falta Token.");
            await callFunction('crystallizeNode', {
                accessToken: token,
                folderId: data.folderId,
                fileName: data.fileName,
                content: targetNode.content || `# ${targetNode.name}\n\n*Creado via NexusCanvas*`,
                frontmatter: data.frontmatter
            });
            setGhostNodes(prev => prev.filter(g => g.id !== targetNode.id));
            removeFromLifeboat(targetNode.id);
            toast.success(`💎 ${data.fileName} cristalizado.`);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
            saveToLifeboat(targetNode, data);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } finally {
            setIsCrystallizing(false);
        }
    };

    // Data Subscription
    useEffect(() => {
        if (!user || !config?.folderId) {
            setLoading(false);
            return;
        }
        const db = getFirestore();
        const entitiesRef = collection(db, "users", user.uid, "projects", config.folderId, "entities");
        const unsubscribe = onSnapshot(entitiesRef, (snapshot) => {
            const loaded: GraphNode[] = [];
            snapshot.forEach(doc => loaded.push(doc.data() as GraphNode));
            setDbNodes(loaded);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, config?.folderId]);

    const unifiedNodes = useMemo(() => {
        const combined: VisualNode[] = [];
        dbNodes.forEach(n => combined.push({ ...n }));
        ghostNodes.forEach(g => combined.push({ ...g }));
        return combined;
    }, [dbNodes, ghostNodes]);

    // Handlers
    const handleUpdateGhost = (nodeId: string, updates: any) => {
        setGhostNodes(prev => prev.map(g => g.id === nodeId ? { ...g, ...updates } : g));
    };

    const spawnDebugNodes = (count: number = 50) => {
         const newGhosts: VisualNode[] = [];
         for (let i = 0; i < count; i++) {
            const id = `debug-${Date.now()}-${i}`;
            const r = Math.random();
            // Cast to any to bypass strict enum check for debug
            let type: any = r < 0.5 ? 'PERSON' : (r < 0.8 ? 'ENEMY' : 'LOCATION');
            const relations: any[] = [];
            if (i > 0) {
                // Link to previous for chain
                relations.push({
                    targetId: `debug-${Date.now()}-${i-1}`, // This ID might be slightly off if Date.now changes?
                    // Wait, Date.now() is constant in the loop? No, loop is fast but Date.now() might be same.
                    // Better to assign IDs first.
                    relation: 'FRIEND',
                    context: 'Swarm Link'
                });
            }
            newGhosts.push({
                id,
                name: `DEBUG ${i}`,
                type,
                description: "Test node",
                projectId: config?.folderId || 'debug',
                isGhost: true,
                x: 2000 + (Math.random()-0.5)*1000,
                y: 2000 + (Math.random()-0.5)*1000,
                relations: [],
                meta: {}
            });
         }

         // Post-link to avoid ID issues
         for(let i=1; i<count; i++) {
             newGhosts[i].relations = [{
                 targetId: newGhosts[i-1].id,
                 targetName: newGhosts[i-1].name,
                 targetType: newGhosts[i-1].type,
                 relation: 'ALLY',
                 context: 'Swarm Connection',
                 sourceFileId: 'debug'
             }];
         }

         setGhostNodes(prev => [...prev, ...newGhosts]);
         toast.success(`🪲 +${count} Nodos`);
    };

    const handleClearAll = async () => {
        if (!confirm("⚠️ ¿ELIMINAR TODO? Esto borrará todos los nodos de la base de datos y la vista local.")) return;

        // 1. Clear Local Ghosts
        setGhostNodes([]);
        localStorage.removeItem('nexus_drafts_v1');

        // 2. Delete Canon Nodes (Firestore)
        if (user && config?.folderId) {
             const db = getFirestore();
             const entitiesRef = collection(db, "users", user.uid, "projects", config.folderId, "entities");
             try {
                 const snapshot = await getDocs(entitiesRef);
                 const batch = writeBatch(db);
                 snapshot.docs.forEach((doc) => {
                     batch.delete(doc.ref);
                 });
                 await batch.commit();
                 toast.success("🗑️ Todo eliminado (Local + DB).");
             } catch (e: any) {
                 console.error(e);
                 toast.error("Error borrando DB: " + e.message);
             }
        } else {
             toast.success("🗑️ Vista local limpia.");
        }
    };

    const handleInputEnter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        setIsGenerating(true);
        // ... (Simplified World Engine Call - keeping core logic assumed from context)
        // For brevity in this refactor, I'll simulate or copy minimal logic.
        // Actually I should preserve the logic.

        try {
             toast.info("🧠 Contactando al Motor...");
             const data = await callFunction<any>('worldEngine', {
                prompt: inputValue,
                agentId: 'nexus-terminal',
                chaosLevel: entropy,
                context: { canon_dump: "", timeline_dump: "" },
                currentGraphContext: unifiedNodes.slice(0, 20),
                accessToken: localStorage.getItem('google_drive_token')
             });

             if(data.newNodes) {
                 const newG = data.newNodes.map((n: any) => ({
                     id: n.id || `ai-${Date.now()}`,
                     name: n.title,
                     type: (n.metadata?.node_type || 'IDEA').toUpperCase(),
                     description: n.content,
                     isGhost: true,
                     x: 2000, y: 2000,
                     meta: n.metadata
                 }));
                 setGhostNodes(p => [...p, ...newG]);
                 toast.success("✨ Ideas generadas.");
             }
             setInputValue("");
        } catch(e: any) {
            toast.error("Error: " + e.message);
            // Fallback
             setGhostNodes(p => [...p, { id: `manual-${Date.now()}`, name: inputValue, type: 'IDEA' as any, isGhost: true, projectId: 'temp', x: 2000, y: 2000, meta: {} }]);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="relative w-full h-full bg-[#141413] overflow-hidden font-sans text-white select-none">
             {/* WARMUP */}
             <AnimatePresence>
                {loading && (
                    <motion.div exit={{ opacity: 0 }} className="absolute inset-0 bg-[#141413] z-[100] flex items-center justify-center pointer-events-none">
                         <div className="text-cyan-500 font-mono">CARGANDO NEXUS...</div>
                    </motion.div>
                )}
             </AnimatePresence>

             {/* CANVAS WRAPPER */}
             <TransformWrapper
                initialScale={0.8}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ activationKeys: ["Shift"], excluded: ["nodrag"] }} // 🔒 EXCLUDED CLASS
                onPanning={() => linksOverlayRef.current?.forceUpdate()}
                onZooming={() => linksOverlayRef.current?.forceUpdate()}
                onTransformed={(ref) => {
                    linksOverlayRef.current?.forceUpdate();
                    const s = ref.state.scale;
                    if (s < 0.6) setLodTier('MACRO');
                    else if (s > 2.0) setLodTier('MICRO');
                    else setLodTier('MESO');
                }}
             >
                {({ zoomIn, zoomOut }) => (
                    <>
                        {/* 🟢 LINKS OVERLAY (Separated Layer) */}
                        <LinksOverlay
                            ref={linksOverlayRef}
                            nodes={unifiedNodes}
                            lodTier={lodTier}
                            hoveredNodeId={hoveredNodeId}
                            hoveredLineId={hoveredLineId}
                            setHoveredLineId={setHoveredLineId}
                        />

                        <TransformComponent
                            wrapperClass="!w-full !h-full"
                            contentClass="!w-full !h-full !z-10 relative !pointer-events-none"
                        >
                            <GraphSimulation
                                ref={graphRef}
                                nodes={unifiedNodes}
                                lodTier={lodTier}
                                setHoveredNodeId={setHoveredNodeId}
                                onNodeClick={(n) => console.log("Clicked", n.name)}
                                onUpdateGhost={handleUpdateGhost}
                                onCrystallize={(n) => setCrystallizeModal({ isOpen: true, node: n })}
                                isLoading={loading}
                                onTick={() => linksOverlayRef.current?.forceUpdate()}
                            />
                        </TransformComponent>

                         {/* ZOOM CONTROLS */}
                        <div className="absolute bottom-24 right-6 flex flex-col gap-2 pointer-events-auto">
                            <button onClick={handleClearAll} className="p-2 bg-slate-900/50 border border-slate-700 hover:bg-red-900/80 hover:border-red-500 rounded text-slate-400 hover:text-white transition-colors" title="Limpiar Todo (DB + Local)"><Trash2 size={16} /></button>
                            <button onClick={() => spawnDebugNodes(50)} className="p-2 bg-red-900/50 border border-red-700 rounded text-red-500 mb-2" title="Debug: Spawn Swarm"><Bug size={16} /></button>
                            <button onClick={() => zoomIn()} className="p-2 bg-slate-900 border border-slate-700 rounded"><Plus size={16} /></button>
                            <button onClick={() => zoomOut()} className="p-2 bg-slate-900 border border-slate-700 rounded"><div className="w-4 h-[2px] bg-white my-2" /></button>
                        </div>
                    </>
                )}
             </TransformWrapper>

             {/* TERMINAL (Same as before) */}
             <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl pointer-events-auto z-50">
                <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-1 flex flex-col gap-0">
                    <form onSubmit={handleInputEnter} className="flex items-center gap-2 p-2">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
                             {isGenerating ? <Loader2 size={16} className="animate-spin text-cyan-500" /> : <Globe size={16} className="text-cyan-500" />}
                        </div>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={isGenerating ? "Procesando..." : "Inyectar variable..."}
                            disabled={isGenerating}
                            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-600 font-mono"
                        />
                        <button type="submit" disabled={isGenerating} className="text-slate-500 hover:text-white"><Plus size={20} /></button>
                    </form>
                    {/* Entropy Slider */}
                    <div className="h-1 w-full bg-slate-900 relative rounded-full overflow-hidden mx-2 mb-2 max-w-[96%] self-center">
                        <div className={`absolute top-0 left-0 h-full ${entropy > 0.6 ? "bg-red-500" : "bg-cyan-500"}`} style={{ width: `${entropy * 100}%` }} />
                        <input type="range" min="0" max="1" step="0.1" value={entropy} onChange={(e) => setEntropy(parseFloat(e.target.value))} className="absolute inset-0 opacity-0 cursor-ew-resize" />
                    </div>
                </div>
             </div>

             {/* MODAL */}
             <AnimatePresence>
                {crystallizeModal.isOpen && (
                    <CrystallizeModal
                        isOpen={crystallizeModal.isOpen}
                        onClose={() => setCrystallizeModal({ isOpen: false, node: null })}
                        node={crystallizeModal.node ? {
                            title: crystallizeModal.node.name,
                            content: "",
                            metadata: { node_type: crystallizeModal.node.type, suggested_folder_category: 'Personajes' }
                        } : null}
                        onConfirm={handleCrystallizeConfirm}
                        isProcessing={isCrystallizing}
                    />
                )}
             </AnimatePresence>
        </div>
    );
};

export default NexusCanvas;
