import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import * as d3 from 'd3-force';
import {
    Globe,
    Zap,
    Save,
    FileText,
    X,
    Plus,
    Loader2,
    BrainCircuit,
    User,
    MapPin,
    Box,
    Swords,
    Diamond,
    AlertTriangle,
    Bug
} from 'lucide-react';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { GraphNode, EntityType } from '../types/graph';
import { generateId } from '../utils/sha256';
import CrystallizeModal from './ui/CrystallizeModal';

// 🟢 VISUAL TYPES
interface VisualNode extends GraphNode {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    // UI Flags
    isGhost?: boolean; // True = Local Draft (Idea)
    isLocal?: boolean; // Deprecated but kept for compat
    isRescue?: boolean; // True = Failed Save (Lifeboat)
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
const FactionLabel: React.FC<{ name: string, x: number, y: number, count: number }> = ({ name, x, y, count }) => (
    <motion.div
        animate={{ x, y }}
        transition={{ type: "spring", stiffness: 30, damping: 20 }} // Smooth float
        className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center cursor-default pointer-events-none z-0"
    >
        <div className="text-[60px] font-black text-white/10 uppercase tracking-[0.2em] drop-shadow-2xl whitespace-nowrap select-none">
            {name}
        </div>
        <div className="text-sm text-cyan-500/50 font-mono tracking-[0.5em] uppercase mt-2 bg-black/50 px-2 rounded">
            {count} NODES
        </div>
    </motion.div>
);

// 🟢 NEW: ENTITY CARD (MICRO-CARD)
const EntityCard: React.FC<{
    node: VisualNode;
    onClick: () => void;
    onCrystallize?: () => void;
    onEdit?: (nodeId: string, updates: { name: string, description: string }) => void;
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    currentScale: number;
    setHoveredNodeId: (id: string | null) => void;
    onDragStart?: () => void;
    onDrag?: (dx: number, dy: number) => void;
    onDragEnd?: () => void;
}> = ({ node, onClick, onCrystallize, onEdit, lodTier, currentScale, setHoveredNodeId, onDragStart, onDrag, onDragEnd }) => {
    const updateXarrow = useXarrow();
    const [isEditing, setIsEditing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false); // Used for Z-Index King of the Hill
    const [editName, setEditName] = useState(node.name);
    const [editDesc, setEditDesc] = useState(node.description || "");

    // Detect Style
    let nodeStyleKey = 'default';
    if (node.type === 'character') nodeStyleKey = 'character';
    else if (node.type === 'location') nodeStyleKey = 'location';
    else if (node.meta?.node_type === 'conflict' || node.type === 'enemy') nodeStyleKey = 'conflict'; // Red detection
    else if (node.type === 'idea') nodeStyleKey = 'idea';
    else if (node.isGhost) nodeStyleKey = 'idea'; // Fallback for generic ghosts
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

    // 🟢 LOD: MACRO VIEW (Hidden via Opacity for smooth transition/Xarrow safety)
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
        // 🧱 OUTER GHOST CONTAINER (Physics Anchor & Drag Handle)
        // Keeps X/Y stable while Inner Card scales visually.
        <motion.div
            id={node.id}
            initial={{ opacity: 0 }}
            animate={{
                opacity: 1,
                x: isDragging ? undefined : (node.x || 0),
                y: isDragging ? undefined : (node.y || 0),
                zIndex: isDragging || isHovered ? 100 : 10 // 👑 King of the Hill (Adjusted for Layering)
            }}
            transition={{ duration: 0 }}
            drag
            dragMomentum={false}
            onDragStart={() => {
                setIsDragging(true);
                if (onDragStart) onDragStart();
            }}
            onDrag={(e, info) => {
                updateXarrow();
                if (onDrag) onDrag(info.delta.x / currentScale, info.delta.y / currentScale);
            }}
            onDragEnd={() => {
                setIsDragging(false);
                if (onDragEnd) onDragEnd();
            }}
            onPointerDownCapture={(e) => e.stopPropagation()}
            onMouseEnter={() => {
                setIsHovered(true);
                setHoveredNodeId(node.id);
            }}
            onMouseLeave={() => {
                setIsHovered(false);
                setHoveredNodeId(null);
            }}
            className={`
                absolute flex items-center justify-center
                ${isMicro ? 'w-[200px] h-auto' : 'w-[120px] h-[60px]'}
                ${isMacro ? 'opacity-0 pointer-events-none' : 'opacity-100'}
            `}
            style={{ willChange: 'transform' }} // Optimization
        >
            {/* ⚓ GHOST ANCHOR (1x1px Center Target for Lines) */}
            {/* Using 1px instead of 0px to ensure browser engine renders it as valid target */}
            <div
                id={`${node.id}-anchor`}
                className="absolute top-1/2 left-1/2 w-px h-px -translate-x-1/2 -translate-y-1/2 opacity-0 pointer-events-none"
            />

            {/* 🎨 INNER VISUAL CARD (Scales without affecting Lines) */}
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
                    ${isDragging ? 'pointer-events-none' : ''}
                `}
                onClick={(e) => {
                    e.stopPropagation();
                    if (!isEditing) onClick();
                }}
            >
                {isEditing ? (
                    // 🟢 EDIT FORM
                    <div className="flex flex-col gap-2 pointer-events-auto" onClick={e => e.stopPropagation()}>
                        <input
                            className="bg-slate-900/50 border border-slate-700 rounded px-1 text-sm font-bold text-white outline-none focus:border-cyan-500"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Nombre..."
                        />
                        <textarea
                            className="bg-slate-900/50 border border-slate-700 rounded px-1 text-[10px] text-slate-300 outline-none resize-none focus:border-cyan-500"
                            rows={2}
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            placeholder="Descripción..."
                        />
                        <div className="flex gap-1 justify-end mt-1">
                            <button onClick={() => setIsEditing(false)} className="text-[10px] text-red-400 hover:text-white px-2 py-0.5 border border-red-500/30 rounded">X</button>
                            <button onClick={handleSaveEdit} className="text-[10px] text-green-400 hover:text-white px-2 py-0.5 border border-green-500/30 rounded">OK</button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className={`flex items-center gap-1.5 ${style.iconColor} font-mono font-bold text-[10px] uppercase tracking-wider`}>
                                {getIcon()}
                                <span className="truncate max-w-[80px]">{node.type}</span>
                            </div>
                            {/* Actions (Only Micro & Ghosts) */}
                            {isMicro && node.isGhost && (
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {onEdit && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                            title="Editar Borrador"
                                        >
                                            <FileText size={10} />
                                        </button>
                                    )}
                                    {onCrystallize && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onCrystallize(); }}
                                            className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors"
                                            title="Hacer Canon"
                                        >
                                            <Save size={10} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Title */}
                        <div className={`font-sans font-bold text-white leading-tight ${isMicro ? 'text-sm' : 'text-xs truncate'}`}>
                            {node.name}
                        </div>

                        {/* Brief (Only Micro) */}
                        {isMicro && (node.meta?.brief || node.description) && (
                            <div className="text-[10px] text-slate-400 line-clamp-3 leading-relaxed font-mono">
                                {node.meta?.brief || node.description}
                            </div>
                        )}
                    </>
                )}
            </div>
        </motion.div>
    );
};

const NexusCanvas: React.FC<{
    isOpen?: boolean; // Prop kept for API compat
    onClose?: () => void;
    activeGemId?: string;
}> = ({ isOpen = true }) => {
    const { config, user } = useProjectConfig();

    // --- STATE ---
    const [dbNodes, setDbNodes] = useState<GraphNode[]>([]);
    const [ghostNodes, setGhostNodes] = useState<VisualNode[]>([]);
    const [simulatedNodes, setSimulatedNodes] = useState<VisualNode[]>([]);
    const [pendingNodes, setPendingNodes] = useState<PendingCrystallization[]>([]);

    // UI State
    const [inputValue, setInputValue] = useState("");
    const [entropy, setEntropy] = useState(0.5); // 0.0 (Rigor) -> 1.0 (Chaos)
    const [loading, setLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isStabilizing, setIsStabilizing] = useState(true);

    // 🟢 LOD State
    const [lodTier, setLodTier] = useState<'MACRO' | 'MESO' | 'MICRO'>('MESO');
    const [currentScale, setCurrentScale] = useState(0.8);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);

    // Modal State
    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // Physics Ref
    const simulationRef = useRef<any>(null);

    // --- 0. LIFEBOAT & DRAFTS (Paranoid Persistence) ---
    useEffect(() => {
        // 1. Load Lifeboat (Failed Saves)
        const savedRescue = localStorage.getItem(PENDING_KEY);
        let initialGhosts: VisualNode[] = [];

        if (savedRescue) {
            try {
                const parsed = JSON.parse(savedRescue) as PendingCrystallization[];
                console.log("⚓ NEXUS LIFEBOAT: Found pending nodes:", parsed.length);
                setPendingNodes(parsed);
                initialGhosts = parsed.map(p => ({
                    ...p.node,
                    isGhost: true,
                    isRescue: true
                }));
            } catch (e) {
                console.error("💥 LIFEBOAT ERROR: Could not parse local storage.", e);
            }
        }

        // 2. Load Paranoid Drafts
        const savedDrafts = localStorage.getItem(DRAFTS_KEY);
        if (savedDrafts) {
            try {
                const parsedDrafts = JSON.parse(savedDrafts) as VisualNode[];
                console.log("💾 NEXUS PARANOID: Found drafts:", parsedDrafts.length);

                // Dedupe: If ID exists in Rescue, keep Rescue (it implies pending action)
                const rescueIds = new Set(initialGhosts.map(n => n.id));
                const uniqueDrafts = parsedDrafts.filter(d => !rescueIds.has(d.id));

                initialGhosts = [...initialGhosts, ...uniqueDrafts];
            } catch (e) {
                console.error("💥 DRAFTS ERROR: Could not parse local storage.", e);
            }
        }

        if (initialGhosts.length > 0) {
            setGhostNodes(prev => {
                const existingIds = new Set(prev.map(n => n.id));
                const newGhosts = initialGhosts.filter(g => !existingIds.has(g.id));
                return [...prev, ...newGhosts];
            });
        }
    }, []);

    // 🟢 PARANOID SAVER (Debounce 1s)
    useEffect(() => {
        const timer = setTimeout(() => {
            if (ghostNodes.length > 0) {
                localStorage.setItem(DRAFTS_KEY, JSON.stringify(ghostNodes));
            } else {
                 if (localStorage.getItem(DRAFTS_KEY)) localStorage.removeItem(DRAFTS_KEY);
            }
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
        // Update visual state
        setGhostNodes(prev => prev.map(g => g.id === node.id ? { ...g, isRescue: true } : g));
        toast.warning("⚠️ Guardado fallido. Nodo asegurado en Boya Local.");
    };

    const removeFromLifeboat = (nodeId: string) => {
        setPendingNodes(prev => {
            const next = prev.filter(p => p.node.id !== nodeId);
            localStorage.setItem(PENDING_KEY, JSON.stringify(next));
            return next;
        });
        // Remove visual ghost if it was purely a rescue, or just clear the flag?
        // If successful, we usually remove the ghost entirely in handleCrystallizeConfirm.
    };

    const retryAllRescue = async () => {
        if (pendingNodes.length === 0) return;
        toast.info(`⚓ Reintentando guardar ${pendingNodes.length} nodos...`);

        // Process sequentially to avoid rate limits
        for (const item of pendingNodes) {
             await handleCrystallizeConfirm({
                 ...item.targetData,
                 // Hack: pass the node context implicitly or we need to refactor handleCrystallizeConfirm to accept node
             }, item.node);
        }
    };

    // --- 1. DATA SUBSCRIPTION ---
    useEffect(() => {
        if (!user || !config?.folderId) {
            setLoading(false);
            return;
        }

        const db = getFirestore();
        const entitiesRef = collection(db, "users", user.uid, "projects", config.folderId, "entities");
        // We fetch ALL entities for the graph
        // Optimization: In Phase 2 we might limit by view bounds, but for now we load all.

        console.log("📡 NEXUS: Subscribing to Entities...");
        const unsubscribe = onSnapshot(entitiesRef, (snapshot) => {
            const loaded: GraphNode[] = [];
            snapshot.forEach(doc => {
                loaded.push(doc.data() as GraphNode);
            });
            console.log(`📡 NEXUS: Loaded ${loaded.length} entities.`);
            setDbNodes(loaded);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, config?.folderId]);

    // --- 2. UNIFIED NODES & AMNESIA ---
    const unifiedNodes = useMemo(() => {
        // Merge DB + Ghosts
        // Important: Create NEW objects to force D3 to pick them up,
        // BUT we must be careful not to reset positions if we were preserving them.
        // HOWEVER: "Protocolo de Amnesia" -> Force fx=null, fy=null on entry.
        // We will strip x/y from incoming data to let simulation decide.

        const combined: VisualNode[] = [];

        dbNodes.forEach(n => {
            combined.push({
                ...n,
                // 🟢 AMNESIA PROTOCOL: Force Floating
                x: undefined,
                y: undefined,
                fx: null,
                fy: null
            });
        });

        ghostNodes.forEach(g => {
            combined.push({
                ...g,
                // Ghosts also float
                x: g.x || undefined,
                y: g.y || undefined
            });
        });

        return combined;
    }, [dbNodes, ghostNodes]);

    // --- 3. PHYSICS ENGINE (SOLAR SYSTEM) ---
    useEffect(() => {
        if (unifiedNodes.length === 0) {
            setIsStabilizing(false);
            return;
        }

        setIsStabilizing(true);
        console.log("⚡ NEXUS PHYSICS: Initiating Big Bang...");
        if (simulationRef.current) simulationRef.current.stop();

        const width = 4000;
        const height = 4000;
        const cx = width / 2;
        const cy = height / 2;

        const simNodes = unifiedNodes.map(n => ({ ...n }));

        // Extract Links
        const links: any[] = [];
        simNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(r => {
                    // Check if target exists in current graph
                    if (simNodes.find(n => n.id === r.targetId)) {
                        links.push({
                            source: node.id,
                            target: r.targetId,
                            label: r.context || r.relation // For Tooltip
                        });
                    }
                });
            }
        });

        const simulation = d3.forceSimulation(simNodes as any)
            // 1. Universal Repulsion (Space)
            .force("charge", d3.forceManyBody().strength(-300))

            // 2. Center Gravity (The Sun) - Weak pull to keep them in view
            .force("center", d3.forceCenter(cx, cy).strength(0.05))

            // 3. COLLISION (Personal Space)
            .force("collide", d3.forceCollide().radius(100).strength(0.7))

            // 4. SOLAR ORBITS (The Secret Sauce)
            .force("radial", d3.forceRadial(
                (d: any) => {
                    const type = (d.type || 'concept').toLowerCase();
                    if (d.isGhost) return 900; // Asteroid Belt (Outer)

                    if (type === 'character') return 100; // Core (Sun)
                    if (type === 'location') return 500; // Habitable Zone (Planets)
                    if (type === 'faction') return 300;
                    return 800; // Oort Cloud
                },
                cx,
                cy
            ).strength(0.6)) // Orbit strength

            // 5. Links
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(200))
            .stop(); // 🛑 Stop auto-start

        // 🔥 WARM-UP (300 ticks in memory)
        console.log("🔥 NEXUS: Stabilizing Gravity (300 ticks)...");
        simulation.tick(300);

        // Render Frame 1 (Stable)
        setSimulatedNodes([...simNodes]);
        setIsStabilizing(false);

        // Start Live Interaction
        simulation.on("tick", () => {
            setSimulatedNodes([...simNodes]);
        });
        simulation.restart();

        simulationRef.current = simulation;

        return () => simulation.stop();

    }, [unifiedNodes]);

    // 🟢 CENTROID CALCULATION (MACRO VIEW)
    const factionCentroids = useMemo(() => {
        if (lodTier !== 'MACRO') return [];

        const groups: Record<string, { x: number, y: number, count: number }> = {};

        simulatedNodes.forEach(node => {
            // 1. Priority: Meta Faction
            let faction = node.meta?.faction;

            // 2. Fallback: Relations (PART_OF)
            if (!faction && node.relations) {
                 const partOfRel = node.relations.find(r => r.relation === 'PART_OF');
                 if (partOfRel) faction = partOfRel.targetName;
            }

            // Clean up faction name (default group if none)
            // Or skip if no faction? Let's skip orphans for clarity in Macro
            if (faction) {
                if (!groups[faction]) groups[faction] = { x: 0, y: 0, count: 0 };
                groups[faction].x += (node.x || 0);
                groups[faction].y += (node.y || 0);
                groups[faction].count++;
            }
        });

        return Object.entries(groups).map(([name, data]) => ({
            name,
            x: data.x / data.count,
            y: data.y / data.count,
            count: data.count
        }));
    }, [simulatedNodes, lodTier]);

    // --- 4. HANDLERS ---

    // 🟢 SEMANTIC CONTEXT FILTER (AI OPTIMIZATION)
    const getSemanticContext = (input: string, allNodes: VisualNode[]) => {
        const lowerInput = input.toLowerCase();

        // 1. Identify Direct Mentions
        const mentionedNodes = allNodes.filter(n => {
            if (!n.name) return false;
            // Loose check: If input contains name (e.g. "Create a brother for Anna")
            return lowerInput.includes(n.name.toLowerCase());
        });

        const mentionedIds = new Set(mentionedNodes.map(n => n.id));

        // 2. Identify 1st Degree Neighbors (Outgoing & Incoming)
        const relevantIds = new Set(mentionedIds);

        allNodes.forEach(node => {
            // Check Outgoing from this node to a Mentioned node
            const pointsToMentioned = node.relations?.some(r => mentionedIds.has(r.targetId));

            // Check Incoming (Is this node mentioned? Then include its targets)
            const isMentioned = mentionedIds.has(node.id);

            if (isMentioned) {
                // Add all my targets
                node.relations?.forEach(r => relevantIds.add(r.targetId));
            }

            if (pointsToMentioned) {
                relevantIds.add(node.id);
            }
        });

        const filtered = allNodes.filter(n => relevantIds.has(n.id));
        console.log(`🧠 SEMANTIC FILTER: Reduced context from ${allNodes.length} to ${filtered.length} nodes.`);
        return filtered;
    };

    const handleInputEnter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        setIsGenerating(true);

        const functions = getFunctions();
        const worldEngineFn = httpsCallable(functions, 'worldEngine');

        try {
            toast.info("🧠 Contactando al Motor del Mundo...");

            // 1. Prepare Context (Lite Version for efficiency)
            const allNodes = [...dbNodes, ...ghostNodes];
            const filteredNodes = getSemanticContext(inputValue, allNodes);

            const currentGraphContext = filteredNodes.map(n => ({
                id: n.id,
                name: n.name,
                type: n.type,
                description: n.description || ""
            }));

            // 2. Call AI
            const result: any = await worldEngineFn({
                prompt: inputValue,
                agentId: 'nexus-terminal',
                chaosLevel: entropy,
                context: {
                    canon_dump: "", // We rely on vector search mostly, or could pass brief text
                    timeline_dump: ""
                },
                currentGraphContext: currentGraphContext, // Pass context for wiring
                accessToken: localStorage.getItem('google_drive_token') // For session logging
            });

            const data = result.data;

            if (data.error) throw new Error(data.error);

            // 3. Process Response
            if (data.newNodes && Array.isArray(data.newNodes)) {
                const incomingGhosts: VisualNode[] = data.newNodes.map((n: any, idx: number) => ({
                    id: n.id || `ai-ghost-${Date.now()}-${idx}`,
                    name: n.title,
                    type: (n.metadata?.node_type || 'idea') as EntityType,
                    description: n.content,
                    projectId: config?.folderId || 'temp',
                    isGhost: true,
                    // Relations are handled below, but we store them on the node structure for now?
                    // The backend returns 'newRelations' separately usually.
                    // But our GraphNode structure has 'relations' property.
                    relations: [],
                    x: 2000 + (Math.random() - 0.5) * 400,
                    y: 2000 + (Math.random() - 0.5) * 400
                }));

                // Process Relations
                if (data.newRelations && Array.isArray(data.newRelations)) {
                    data.newRelations.forEach((rel: any) => {
                        // Find source node (could be one of the new ones or existing)
                        const sourceNode = incomingGhosts.find(g => g.id === rel.source);
                        if (sourceNode) {
                            if (!sourceNode.relations) sourceNode.relations = [];
                            sourceNode.relations.push({
                                targetId: rel.target,
                                relation: rel.label || 'LINK', // Type (ENEMY, etc)
                                context: rel.context || rel.label, // Context text (The Story)
                                targetName: "Unknown", // Resolved later
                                targetType: "concept"
                            });
                        }
                    });
                }

                setGhostNodes(prev => [...prev, ...incomingGhosts]);
                toast.success(`✨ ${incomingGhosts.length} Ideas generadas por el Motor.`);
            }

            setInputValue("");

        } catch (error: any) {
            console.error("World Engine Error:", error);
            toast.error(`Fallo del Motor: ${error.message}`);
            // Fallback: Create dumb node
            const fallbackGhost: VisualNode = {
                id: `manual-${Date.now()}`,
                name: inputValue,
                type: 'idea',
                isGhost: true,
                projectId: config?.folderId || 'temp',
                description: "Generado manualmente tras fallo de IA.",
                x: 2000 + (Math.random() - 0.5) * 100,
                y: 2000 + (Math.random() - 0.5) * 100
            };
            setGhostNodes(prev => [...prev, fallbackGhost]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCrystallizeConfirm = async (
        data: { fileName: string; folderId: string; frontmatter: any },
        overrideNode?: VisualNode // Optional: Allow passing node directly for retries
    ) => {
        const targetNode = overrideNode || crystallizeModal.node;
        if (!targetNode) return;

        setIsCrystallizing(true);
        const functions = getFunctions();
        const crystallizeNodeFn = httpsCallable(functions, 'crystallizeNode');

        try {
            // 1. Backend Call
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Falta Token de Google.");

            // Prepare Content
            const content = targetNode.content || `# ${targetNode.name}\n\n*Creado via NexusCanvas*`;

            await crystallizeNodeFn({
                accessToken: token,
                folderId: data.folderId,
                fileName: data.fileName,
                content: content,
                frontmatter: data.frontmatter
            });

            // 2. Success Cleanup
            setGhostNodes(prev => prev.filter(g => g.id !== targetNode.id));

            // Also remove from Lifeboat if it was there
            removeFromLifeboat(targetNode.id);

            toast.success(`💎 ${data.fileName} cristalizado exitosamente.`);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });

        } catch (error: any) {
            console.error("Crystallize Error:", error);
            toast.error(`Error al cristalizar: ${error.message}`);

            // 3. ⚓ LIFEBOAT RESCUE
            saveToLifeboat(targetNode, data);

            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });

        } finally {
            setIsCrystallizing(false);
        }
    };

    const handleUpdateGhost = (nodeId: string, updates: { name: string, description: string }) => {
        setGhostNodes(prev => prev.map(g => {
            if (g.id === nodeId) {
                return { ...g, name: updates.name, description: updates.description };
            }
            return g;
        }));
        toast.success("Borrador actualizado localmente.");
    };

    // 🟢 PHYSICS HANDLERS (Jitter Fix)
    const handleDragStart = useCallback((nodeId: string) => {
        if (!simulationRef.current) return;
        const d = simulationRef.current.nodes().find((n: any) => n.id === nodeId);
        if (!d) return;
        d.fx = d.x;
        d.fy = d.y;
        simulationRef.current.alphaTarget(0.3).restart();
    }, []);

    const handleDrag = useCallback((nodeId: string, dx: number, dy: number) => {
        if (!simulationRef.current) return;
        const d = simulationRef.current.nodes().find((n: any) => n.id === nodeId);
        if (!d) return;
        // Init fx/fy if missing
        if (d.fx === null) d.fx = d.x;
        if (d.fy === null) d.fy = d.y;

        d.fx += dx;
        d.fy += dy;
        // Simulation tick will auto-update
    }, []);

    const handleDragEnd = useCallback((nodeId: string) => {
        if (!simulationRef.current) return;
        const d = simulationRef.current.nodes().find((n: any) => n.id === nodeId);
        if (!d) return;
        d.fx = null;
        d.fy = null;
        simulationRef.current.alphaTarget(0);
    }, []);

    // 🟢 DEBUG: SWARM GENERATOR
    const spawnDebugNodes = (count: number = 50) => {
        const newGhosts: VisualNode[] = [];
        const width = 4000;
        const center = width / 2;

        for (let i = 0; i < count; i++) {
            const r = Math.random();
            let type: EntityType | string = 'character';
            if (r < 0.5) type = 'enemy'; // 50% (Red)
            else if (r < 0.7) type = 'location'; // 20% (Cyan)
            else type = 'character'; // 30% (Yellow)

            const id = `debug-${Date.now()}-${i}`;
            const node: VisualNode = {
                id,
                name: `${type.toUpperCase()} ${i}`,
                type: type as EntityType,
                description: "Simulación de estrés. Nodo generado por el protocolo de prueba.",
                projectId: config?.folderId || 'debug',
                isGhost: true,
                x: center + (Math.random() - 0.5) * 2000,
                y: center + (Math.random() - 0.5) * 2000,
                relations: []
            };

            // Relations
            if (i > 0 && Math.random() > 0.6) {
                const target = newGhosts[Math.floor(Math.random() * i)];
                const relTypes = [
                    { rel: 'ODIA A', ctx: 'Rivalidad a muerte' },
                    { rel: 'ALIANZA', ctx: 'Tratado comercial' },
                    { rel: 'TRAICIÓN', ctx: 'Puñalada por la espalda' }
                ];
                const rt = relTypes[Math.floor(Math.random() * relTypes.length)];

                node.relations?.push({
                    targetId: target.id,
                    relation: rt.rel,
                    context: rt.ctx,
                    targetName: target.name,
                    targetType: target.type
                });
            }

            newGhosts.push(node);
        }

        setGhostNodes(prev => [...prev, ...newGhosts]);
        toast.success(`🪲 ENJAMBRE: ${count} nodos inyectados.`);
    };

    // Expose to window for console access
    useEffect(() => {
        (window as any).spawnDebugNodes = spawnDebugNodes;
    }, []);

    // --- RENDER ---
    return (
        <div className="relative w-full h-full bg-[#141413] overflow-hidden font-sans text-white select-none">

            {/* WARM-UP LOADER */}
            <AnimatePresence>
                {(isStabilizing || loading) && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-[#141413] z-[100] flex items-center justify-center pointer-events-none"
                    >
                        <div className="flex flex-col items-center gap-4">
                            <div className="font-mono text-cyan-500 text-xl tracking-[0.2em] animate-pulse">
                                &gt; ESTABILIZANDO GRAVEDAD...
                            </div>
                            {/* Simple Matrix Loader */}
                            <div className="flex gap-1">
                                <motion.div animate={{ height: [10, 30, 10] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1 bg-cyan-500/50" />
                                <motion.div animate={{ height: [10, 30, 10] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1 bg-cyan-500/50" />
                                <motion.div animate={{ height: [10, 30, 10] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1 bg-cyan-500/50" />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* CANVAS */}
            <TransformWrapper
                initialScale={0.8}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ activationKeys: ["Shift"] }} // 🔒 STRICT INPUT PROTOCOL
                onTransformed={(ref) => {
                    const s = ref.state.scale;
                    setCurrentScale(s);
                    let tier: 'MACRO' | 'MESO' | 'MICRO' = 'MESO';
                    if (s < 0.6) tier = 'MACRO';
                    else if (s > 2.0) tier = 'MICRO';

                    if (tier !== lodTier) {
                        setLodTier(tier);
                        console.log("🔭 ZOOM LOD CHANGE:", tier);
                    }
                }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <TransformComponent
                            wrapperClass="!w-full !h-full"
                            contentClass="!w-full !h-full"
                        >
                            <div className="relative" style={{ width: 4000, height: 4000 }}>
                                {/* Background Grid (Cyberpunk) */}
                                <div
                                    className="absolute inset-0 opacity-20 pointer-events-none"
                                    style={{
                                        backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)',
                                        backgroundSize: '50px 50px'
                                    }}
                                />

                                <Xwrapper>
                                    {/* FACTION LABELS (MACRO ONLY) */}
                                    {lodTier === 'MACRO' && factionCentroids.map(f => (
                                        <FactionLabel
                                            key={f.name}
                                            name={f.name}
                                            x={f.x}
                                            y={f.y}
                                            count={f.count}
                                        />
                                    ))}

                                    {/* NODES (MESO/MICRO) */}
                                    {simulatedNodes.map(node => (
                                        <EntityCard
                                            key={node.id}
                                            node={node}
                                            lodTier={lodTier}
                                            currentScale={currentScale}
                                            setHoveredNodeId={setHoveredNodeId}
                                            onClick={() => {
                                                console.log("Clicked:", node.name);
                                            }}
                                            onDragStart={() => handleDragStart(node.id)}
                                            onDrag={(dx, dy) => handleDrag(node.id, dx, dy)}
                                            onDragEnd={() => handleDragEnd(node.id)}
                                            onCrystallize={node.isGhost ? () => setCrystallizeModal({ isOpen: true, node }) : undefined}
                                            onEdit={node.isGhost ? handleUpdateGhost : undefined}
                                        />
                                    ))}

                                    {/* CONNECTIONS (Hidden in MACRO) */}
                                    {lodTier !== 'MACRO' && simulatedNodes.map(node => {
                                        if (!node.relations) return null;
                                        return node.relations.map((rel, idx) => {
                                            if (!simulatedNodes.find(n => n.id === rel.targetId)) return null;

                                            const lineId = `${node.id}-${rel.targetId}-${idx}`;
                                            const isFocused = hoveredNodeId === node.id || hoveredNodeId === rel.targetId || hoveredLineId === lineId;
                                            const relColor = getRelationColor(rel.relation);

                                            // 🟢 SEMANTIC CONTEXT: Show Story first, Type as fallback
                                            const labelText = rel.context
                                                ? (rel.context.length > 30 ? rel.context.substring(0, 27) + "..." : rel.context)
                                                : rel.relation;

                                            return (
                                                <Xarrow
                                                    key={lineId}
                                                    start={`${node.id}-anchor`} // ⚓ Anchor Target
                                                    end={`${rel.targetId}-anchor`} // ⚓ Anchor Target
                                                    color={relColor}
                                                    strokeWidth={1.5}
                                                    headSize={3}
                                                    curveness={0.3}
                                                    path="smooth"
                                                    zIndex={0} // 📉 Layer 0 (Below Cards)
                                                    passProps={{
                                                        onMouseEnter: () => setHoveredLineId(lineId),
                                                        onMouseLeave: () => setHoveredLineId(null),
                                                        style: { cursor: 'pointer' }
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
                                                                    boxShadow: `0 0 5px ${relColor}20`
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
                        </TransformComponent>

                        {/* ZOOM CONTROLS (Floating) */}
                        <div className="absolute bottom-24 right-6 flex flex-col gap-2 pointer-events-auto">
                            <button onClick={() => spawnDebugNodes(50)} className="p-2 bg-red-900/50 border border-red-700 rounded hover:border-red-500 text-red-500 hover:text-white mb-2" title="Debug: Spawn Swarm"><Bug size={16} /></button>
                            <button onClick={() => zoomIn()} className="p-2 bg-slate-900 border border-slate-700 rounded hover:border-cyan-500"><Plus size={16} /></button>
                            <button onClick={() => zoomOut()} className="p-2 bg-slate-900 border border-slate-700 rounded hover:border-cyan-500"><div className="w-4 h-[2px] bg-white my-2" /></button>
                        </div>

            {/* ⚓ LIFEBOAT INDICATOR */}
            {pendingNodes.length > 0 && (
                 <div className="absolute top-6 right-6 pointer-events-auto animate-bounce">
                     <button
                        onClick={retryAllRescue}
                        className="bg-red-500/20 backdrop-blur border border-red-500 text-red-500 p-3 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 hover:text-white transition-all flex items-center gap-2"
                        title="Hay nodos pendientes de guardado. Click para reintentar."
                     >
                         <AlertTriangle size={24} />
                         <span className="font-bold">{pendingNodes.length}</span>
                     </button>
                 </div>
            )}
                    </>
                )}
            </TransformWrapper>

            {/* GENESIS TERMINAL (Bottom Overlay) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl pointer-events-auto z-50">
                <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-1 flex flex-col gap-0">

                    {/* Input Row */}
                    <form onSubmit={handleInputEnter} className="flex items-center gap-2 p-2">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
                            {isGenerating ? (
                                <Loader2 size={16} className="text-cyan-500 animate-spin" />
                            ) : (
                                <Globe size={16} className={entropy > 0.6 ? "text-red-500 animate-pulse" : "text-cyan-500"} />
                            )}
                        </div>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={isGenerating ? "Consultando al Oráculo..." : "Inyectar nueva variable..."}
                            disabled={isGenerating}
                            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-600 font-mono disabled:opacity-50"
                        />
                        <button type="submit" disabled={isGenerating} className="text-slate-500 hover:text-white transition-colors disabled:opacity-50">
                            <Plus size={20} />
                        </button>
                    </form>

                    {/* Entropy Slider (Visual Bar) */}
                    <div className="h-1 w-full bg-slate-900 relative rounded-full overflow-hidden mx-2 mb-2 max-w-[96%] self-center group">
                        <div
                            className={`absolute top-0 left-0 h-full transition-all duration-300 ${entropy > 0.6 ? "bg-red-500 shadow-[0_0_10px_red]" : "bg-cyan-500 shadow-[0_0_10px_cyan]"}`}
                            style={{ width: `${entropy * 100}%` }}
                        />
                        <input
                            type="range"
                            min="0" max="1" step="0.1"
                            value={entropy}
                            onChange={(e) => setEntropy(parseFloat(e.target.value))}
                            className="absolute inset-0 opacity-0 cursor-ew-resize"
                            title={`Nivel de Entropía: ${entropy}`}
                        />
                    </div>
                </div>
            </div>

            {/* CRYSTALLIZE MODAL */}
            <AnimatePresence>
                {crystallizeModal.isOpen && (
                    <CrystallizeModal
                        isOpen={crystallizeModal.isOpen}
                        onClose={() => setCrystallizeModal({ isOpen: false, node: null })}
                        node={crystallizeModal.node ? {
                            title: crystallizeModal.node.name,
                            content: "", // Will use default generation
                            metadata: {
                                node_type: crystallizeModal.node.type,
                                suggested_folder_category: crystallizeModal.node.type === 'character' ? 'Personajes' : 'Lugares'
                            }
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
