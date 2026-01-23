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
    Diamond
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
}

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

const NodeCard: React.FC<{
    node: VisualNode;
    onClick: () => void;
    onCrystallize?: () => void;
}> = ({ node, onClick, onCrystallize }) => {
    const updateXarrow = useXarrow();
    const style = NODE_STYLES[node.type] || NODE_STYLES.default;

    // Ghost Override
    const finalStyle = node.isGhost ? NODE_STYLES.idea : style;

    // Icon Mapping
    const getIcon = () => {
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
                cursor-grab active:cursor-grabbing z-20 group
            `}
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
                {/* Ghost Action: Crystallize */}
                {node.isGhost && onCrystallize && (
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
            <div className="text-sm font-bold text-white leading-tight line-clamp-2">
                {node.name}
            </div>

            {/* Brief/Snippet */}
            {(node.meta?.brief || node.description) && (
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

    // UI State
    const [inputValue, setInputValue] = useState("");
    const [entropy, setEntropy] = useState(0.5); // 0.0 (Rigor) -> 1.0 (Chaos)
    const [loading, setLoading] = useState(true);

    // Modal State
    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // Physics Ref
    const simulationRef = useRef<any>(null);

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

    const handleInputEnter = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;

        // Create Ghost Node
        const ghostId = `ghost-${Date.now()}`;
        const newGhost: VisualNode = {
            id: ghostId,
            name: inputValue.trim(),
            type: 'idea', // Default type for drafts
            projectId: config?.folderId || 'temp',
            isGhost: true,
            meta: {
                brief: "Borrador en memoria volátil"
            },
            // Initial position (randomized near outer rim)
            x: 2000 + (Math.random() - 0.5) * 500,
            y: 2000 + (Math.random() - 0.5) * 500
        };

        setGhostNodes(prev => [...prev, newGhost]);
        setInputValue("");
        toast.success("Nodo Fantasma generado");
    };

    const handleCrystallizeConfirm = async (data: { fileName: string; folderId: string; frontmatter: any }) => {
        setIsCrystallizing(true);
        const functions = getFunctions();
        const crystallizeNodeFn = httpsCallable(functions, 'crystallizeNode');

        try {
            // 1. Backend Call
            // We need accessToken. Assuming it's handled in App or we fetch it.
            // Currently, `crystallizeNode` requires `accessToken`.
            // We need to get it from localStorage or Context.
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Falta Token de Google.");

            // Prepare Content (Default if empty)
            const content = crystallizeModal.node?.content || `# ${crystallizeModal.node?.title}\n\n*Creado via NexusCanvas*`;

            await crystallizeNodeFn({
                accessToken: token,
                folderId: data.folderId,
                fileName: data.fileName,
                content: content,
                frontmatter: data.frontmatter
            });

            // 2. Cleanup Ghost
            if (crystallizeModal.node?.id) {
                setGhostNodes(prev => prev.filter(g => g.id !== crystallizeModal.node?.id));
            }

            toast.success(`💎 ${data.fileName} cristalizado exitosamente.`);
            setCrystallizeModal({ isOpen: false, node: null });

        } catch (error: any) {
            console.error("Crystallize Error:", error);
            toast.error(`Error al cristalizar: ${error.message}`);
        } finally {
            setIsCrystallizing(false);
        }
    };

    // --- RENDER ---
    return (
        <div className="relative w-full h-full bg-black overflow-hidden font-sans text-white select-none">

            {/* CANVAS */}
            <TransformWrapper
                initialScale={0.4}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
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
                                            onClick={() => {
                                                console.log("Clicked:", node.name);
                                            }}
                                            onCrystallize={node.isGhost ? () => setCrystallizeModal({ isOpen: true, node }) : undefined}
                                        />
                                    ))}

                                    {/* CONNECTIONS */}
                                    {simulatedNodes.map(node => {
                                        if (!node.relations) return null;
                                        return node.relations.map((rel, idx) => {
                                            if (!simulatedNodes.find(n => n.id === rel.targetId)) return null;

                                            // Tooltip logic via labels or passProps?
                                            // Xarrow 'labels' prop accepts ReactNode.
                                            // We want a simple native tooltip title on the path if possible, or a visual label.
                                            // Xarrow SVG path doesn't easily expose 'title' attribute.
                                            // We'll use a small label if context exists.

                                            return (
                                                <Xarrow
                                                    key={`${node.id}-${rel.targetId}-${idx}`}
                                                    start={node.id}
                                                    end={rel.targetId}
                                                    color="#334155"
                                                    strokeWidth={1}
                                                    headSize={3}
                                                    curveness={0.3}
                                                    path="smooth"
                                                    zIndex={10}
                                                    // Tooltip Implementation (Labels)
                                                    labels={rel.context ? {
                                                        middle: (
                                                            <div
                                                                className="bg-black/80 text-[8px] text-slate-400 px-1 rounded border border-slate-700 max-w-[100px] truncate cursor-help hover:z-50 hover:bg-slate-800 hover:text-white transition-colors"
                                                                title={rel.context} // Native Tooltip on hover
                                                            >
                                                                {rel.relation}
                                                            </div>
                                                        )
                                                    } : undefined}
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
                    </>
                )}
            </TransformWrapper>

            {/* GENESIS TERMINAL (Bottom Overlay) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl pointer-events-auto z-50">
                <div className="bg-slate-950/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl p-1 flex flex-col gap-0">

                    {/* Input Row */}
                    <form onSubmit={handleInputEnter} className="flex items-center gap-2 p-2">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
                            <Globe size={16} className={entropy > 0.6 ? "text-red-500 animate-pulse" : "text-cyan-500"} />
                        </div>
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Inyectar nueva variable..."
                            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-slate-600 font-mono"
                        />
                        <button type="submit" className="text-slate-500 hover:text-white transition-colors">
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
