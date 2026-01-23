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
    AlertTriangle
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

// 🟢 STYLES (CYBERPUNK PALETTE)
const NODE_STYLES: Record<string, { border: string, bg: string, text: string, glow: string }> = {
    character: {
        border: 'border-[#ddbf61]', // Gold
        bg: 'bg-[#ddbf61]/10',
        text: 'text-[#ddbf61]',
        glow: 'shadow-[0_0_15px_rgba(221,191,97,0.3)]'
    },
    location: {
        border: 'border-[#00fff7]', // Cyan
        bg: 'bg-[#00fff7]/10',
        text: 'text-[#00fff7]',
        glow: 'shadow-[0_0_15px_rgba(0,255,247,0.3)]'
    },
    idea: {
        border: 'border-[#a855f7]', // Violet (Ghost/Draft)
        bg: 'bg-[#a855f7]/10',
        text: 'text-[#a855f7]',
        glow: 'shadow-[0_0_10px_rgba(168,85,247,0.2)]'
    },
    default: {
        border: 'border-slate-600',
        bg: 'bg-slate-900/80',
        text: 'text-slate-400',
        glow: ''
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
    if (key.includes('ENEMY') || key.includes('WAR') || key.includes('KILL') || key.includes('HATE')) return RELATION_COLORS.ENEMY;
    if (key.includes('ALLY') || key.includes('FRIEND') || key.includes('TRADE') || key.includes('LOVE')) return RELATION_COLORS.ALLY;
    if (key.includes('FAMILY') || key.includes('SPOUSE') || key.includes('BLOOD') || key.includes('SIB')) return RELATION_COLORS.FAMILY;
    if (key.includes('MAGIC') || key.includes('SPELL') || key.includes('CURSE')) return RELATION_COLORS.MAGIC;
    return RELATION_COLORS.DEFAULT;
};

const NodeCard: React.FC<{
    node: VisualNode;
    onClick: () => void;
    onCrystallize?: () => void;
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
}> = ({ node, onClick, onCrystallize, lodTier }) => {
    const updateXarrow = useXarrow();
    const style = NODE_STYLES[node.type] || NODE_STYLES.default;

    // Ghost Override
    const finalStyle = node.isGhost ? NODE_STYLES.idea : style;

    // Icon Mapping
    const getIcon = () => {
        if (node.isRescue) return <AlertTriangle size={14} className="text-red-500 animate-pulse" />;
        if (node.isGhost) return <BrainCircuit size={14} />;
        switch (node.type) {
            case 'character': return <User size={14} />;
            case 'location': return <MapPin size={14} />;
            case 'object': return <Box size={14} />;
            case 'event': return <Zap size={14} />;
            case 'faction': return <Swords size={14} />;
            default: return <Diamond size={14} className="rotate-45" />;
        }
    };

    // 🟢 LOD: MACRO VIEW (The Strategist)
    if (lodTier === 'MACRO') {
        // Show only Factions or important locations, otherwise hide
        const isStrategicallyImportant = node.type === 'faction' || node.type === 'group';

        if (!isStrategicallyImportant) {
            // We still render it but hidden to maintain physics/layout, or return null?
            // If we return null, React might unmount it, which is fine for visual, but Xarrow needs the ID to exist?
            // No, Xarrow needs the element to exist in DOM to draw lines.
            // BUT in MACRO view, lines are hidden too! So we can return null (or hidden div).
            // However, we must ensure physics simulation (d3) isn't affected. D3 runs in parent.
            // Rendering is separate.
            return null;
        }

        // Render HUGE Label
        return (
             <motion.div
                id={node.id}
                animate={{ x: node.x || 0, y: node.y || 0, scale: 2 }} // 2x Scale
                transition={{ duration: 0.5 }}
                className="absolute flex flex-col items-center justify-center cursor-pointer pointer-events-none"
            >
                <div className="text-[40px] font-black text-white/20 uppercase tracking-[0.2em] drop-shadow-xl whitespace-nowrap">
                    {node.name}
                </div>
            </motion.div>
        );
    }

    // 🟢 LOD: MESO & MICRO
    const isMicro = lodTier === 'MICRO';

    return (
        <motion.div
            id={node.id}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{
                opacity: 1,
                scale: 1,
                x: node.x || 0,
                y: node.y || 0
            }}
            // Instant update for physics tick
            transition={{ duration: 0 }}
            drag
            dragMomentum={false}
            onDrag={updateXarrow}
            // Capture pointer to prevent pan
            onPointerDownCapture={(e) => e.stopPropagation()}
            className={`
                absolute w-[180px] p-2 flex flex-col gap-1
                bg-black/90 backdrop-blur-md rounded border ${finalStyle.border} ${finalStyle.glow}
                cursor-grab active:cursor-grabbing z-20 group transition-all duration-300
                ${!isMicro ? 'h-[60px] overflow-hidden' : ''}
            `}
            // Meso View: fixed height, hide details
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 ${finalStyle.text} font-bold text-xs uppercase tracking-wider`}>
                    {getIcon()}
                    <span className="truncate max-w-[100px]">{node.type}</span>
                </div>
                {/* Ghost Action: Crystallize (Only visible in MICRO or always?)
                    Commander said: "Meso: Oculta botones de acción". */}
                {isMicro && node.isGhost && onCrystallize && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onCrystallize(); }}
                        className="p-1 hover:bg-white/10 rounded text-white/50 hover:text-white transition-colors"
                        title="Hacer Canon"
                    >
                        <Save size={12} />
                    </button>
                )}
            </div>

            {/* Title */}
            <div className={`font-bold text-white leading-tight ${isMicro ? 'text-sm line-clamp-2' : 'text-xs truncate'}`}>
                {node.name}
            </div>

            {/* Brief/Snippet (Only MICRO) */}
            {isMicro && (node.meta?.brief || node.description) && (
                <div className="text-[9px] text-slate-400 line-clamp-2 leading-relaxed mt-1 font-mono">
                    {node.meta?.brief || node.description}
                </div>
            )}
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

    // 🟢 LOD State
    const [lodTier, setLodTier] = useState<'MACRO' | 'MESO' | 'MICRO'>('MESO');

    // Modal State
    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // Physics Ref
    const simulationRef = useRef<any>(null);

    // --- 0. LIFEBOAT (Boya de Rescate) ---
    useEffect(() => {
        const saved = localStorage.getItem(PENDING_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as PendingCrystallization[];
                console.log("⚓ NEXUS LIFEBOAT: Found pending nodes:", parsed.length);
                setPendingNodes(parsed);
                // Re-hydrate visual ghosts
                const rescuedGhosts = parsed.map(p => ({
                    ...p.node,
                    isGhost: true,
                    isRescue: true
                }));
                setGhostNodes(prev => {
                    // Avoid dupes if strict mode double mounts
                    const existingIds = new Set(prev.map(n => n.id));
                    const newGhosts = rescuedGhosts.filter(g => !existingIds.has(g.id));
                    return [...prev, ...newGhosts];
                });
            } catch (e) {
                console.error("💥 LIFEBOAT ERROR: Could not parse local storage.", e);
            }
        }
    }, []);

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
        if (unifiedNodes.length === 0) return;

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
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(200));

        // TICK
        simulation.on("tick", () => {
            setSimulatedNodes([...simNodes]);
        });

        simulationRef.current = simulation;

        return () => simulation.stop();

    }, [unifiedNodes]);

    // --- 4. HANDLERS ---

    const handleInputEnter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        setIsGenerating(true);

        const functions = getFunctions();
        const worldEngineFn = httpsCallable(functions, 'worldEngine');

        try {
            toast.info("🧠 Contactando al Motor del Mundo...");

            // 1. Prepare Context (Lite Version for efficiency)
            const currentGraphContext = [...dbNodes, ...ghostNodes].map(n => ({
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

    // --- RENDER ---
    return (
        <div className="relative w-full h-full bg-black overflow-hidden font-sans text-white select-none">

            {/* CANVAS */}
            <TransformWrapper
                initialScale={0.8}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                onTransformed={(ref) => {
                    const s = ref.state.scale;
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
                                    {/* NODES */}
                                    {simulatedNodes.map(node => (
                                        <NodeCard
                                            key={node.id}
                                            node={node}
                                            lodTier={lodTier}
                                            onClick={() => {
                                                console.log("Clicked:", node.name);
                                            }}
                                            onCrystallize={node.isGhost ? () => setCrystallizeModal({ isOpen: true, node }) : undefined}
                                        />
                                    ))}

                                    {/* CONNECTIONS (Hidden in MACRO) */}
                                    {lodTier !== 'MACRO' && simulatedNodes.map(node => {
                                        if (!node.relations) return null;
                                        return node.relations.map((rel, idx) => {
                                            if (!simulatedNodes.find(n => n.id === rel.targetId)) return null;

                                            const relColor = getRelationColor(rel.relation);
                                            // 🟢 SEMANTIC CONTEXT: Show Story first, Type as fallback
                                            const labelText = rel.context
                                                ? (rel.context.length > 30 ? rel.context.substring(0, 27) + "..." : rel.context)
                                                : rel.relation;

                                            return (
                                                <Xarrow
                                                    key={`${node.id}-${rel.targetId}-${idx}`}
                                                    start={node.id}
                                                    end={rel.targetId}
                                                    color={relColor}
                                                    strokeWidth={1.5}
                                                    headSize={3}
                                                    curveness={0.3}
                                                    path="smooth"
                                                    zIndex={10}
                                                    labels={{
                                                        middle: (
                                                            <div
                                                                className="bg-black/90 backdrop-blur text-[9px] px-2 py-0.5 rounded-full border max-w-[200px] truncate cursor-help hover:z-50 hover:scale-110 hover:text-white transition-all shadow-sm"
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
