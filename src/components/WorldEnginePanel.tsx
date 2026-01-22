import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, updateDoc, collection, onSnapshot, query, setDoc, getDocs, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
    LayoutTemplate,
    Sparkles,
    TriangleAlert,
    X,
    Zap,
    Disc,
    Diamond,
    Loader2,
    Link as LinkIcon,
    Plus,
    Minus,
    RotateCcw,
    User,
    MapPin,
    Box,
    Swords,
    BrainCircuit,
    Send
} from 'lucide-react';
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import * as d3 from 'd3-force';

import { GemId } from '../types';
import { Character } from '../types/core';
import { GraphNode } from '../types/graph';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import InterrogationModal from './ui/InterrogationModal';
import CrystallizeModal from './ui/CrystallizeModal';
import MarkdownRenderer from './ui/MarkdownRenderer';
import { generateId } from '../utils/sha256';

const FRANKENSTEIN_DATA: GraphNode[] = [
    {
        id: "node-1",
        name: "Sofía",
        type: "character",
        projectId: "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq",
        relations: [
            { targetId: "node-2", relation: "ODIA", relationType: "conflict", targetName: "Malakar", targetType: "character", context: "Mock conflict", sourceFileId: "mock" } as any,
            { targetId: "node-1", relation: "Self", relationType: "self", targetName: "Sofía", targetType: "character", context: "Mock self", sourceFileId: "mock" } as any
        ],
        foundInFiles: [],
        meta: { node_type: "character", faction: "Protagonistas", brief: "Protagonista Mock" },
        isCanon: true
    },
    {
        id: "node-2",
        name: "Malakar",
        type: "character",
        projectId: "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq",
        relations: [
             { targetId: "node-3", relation: "OCUPA", relationType: "location", targetName: "La Torre Gris", targetType: "location", context: "Mock location", sourceFileId: "mock" } as any
        ],
        foundInFiles: [],
        meta: { node_type: "character", faction: "Antagonistas", brief: "Villano Mock" },
        isCanon: true
    },
    {
        id: "node-3",
        name: "La Torre Gris",
        type: "location",
        projectId: "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq",
        relations: [],
        foundInFiles: [],
        meta: { node_type: "location", faction: "Escenario", brief: "Lugar Mock" },
        isCanon: true
    },
    {
        id: "node-4",
        name: "La Traición",
        type: "event",
        projectId: "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq",
        relations: [],
        foundInFiles: [],
        meta: { node_type: "idea", state: "idea", brief: "Evento Flotante" },
        isCanon: true
    }
] as unknown as GraphNode[];

// 🟢 VISUAL EXO-SKELETON (Interface Extension)
interface VisualGraphNode extends GraphNode {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    isGhost?: boolean;
    isEphemeral?: boolean;
    isLocal?: boolean;
    agentId?: AgentType;
    isCanon?: boolean;
    fileId?: string;
    val?: number; // Visual Size
    content?: string;
}

interface WorldEnginePanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeGemId: GemId | null;
}

type AgentType = 'architect' | 'oracle' | 'advocate';

interface InterrogationState {
    isOpen: boolean;
    questions: string[];
    depth: number;
    history: { questions: string[]; answer: string }[];
    pendingPrompt: string;
}

interface Node {
    id: string;
    type: string;
    title: string;
    content: string;
    agentId: AgentType;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
    metadata?: {
        suggested_filename?: string;
        suggested_folder_category?: string;
        node_type?: string;
        related_node_ids?: string[];
        pending_relations?: {
            targetId: string;
            relationType: string;
            reason?: string;
            status?: string;
        }[];
    };
    coherency_report?: {
        warning: string;
        file_source: string;
        explanation: string;
    };
    auditStatus?: 'pending' | 'auditing' | 'audited';
}

interface SessionItem {
    prompt: string;
    result: any;
}

const AGENTS = {
    architect: {
        id: 'architect',
        name: 'EL ARQUITECTO',
        role: 'ESTRUCTURA',
        icon: LayoutTemplate,
        color: 'cyan',
        colorHex: '#06b6d4',
        desc: 'Diseño lógico y coherencia estructural.',
        styles: {
            focusRing: 'focus:border-cyan-500 focus:ring-cyan-500'
        }
    },
    oracle: {
        id: 'oracle',
        name: 'EL ORÁCULO',
        role: 'CAOS',
        icon: Sparkles,
        color: 'purple',
        colorHex: '#a855f7',
        desc: 'Creatividad desenfrenada y alucinación controlada.',
        styles: {
            focusRing: 'focus:border-purple-500 focus:ring-purple-500'
        }
    },
    advocate: {
        id: 'advocate',
        name: 'ABOGADO DEL DIABLO',
        role: 'CRÍTICA',
        icon: TriangleAlert,
        color: 'red',
        colorHex: '#ef4444',
        desc: 'Detección de riesgos y agujeros de guion.',
        styles: {
            focusRing: 'focus:border-red-500 focus:ring-red-500'
        }
    }
};

// 🟢 MICRO-CARD COMPONENT (Modular)
const NodeCard: React.FC<{
    node: VisualGraphNode | Node;
    onClick: () => void;
    onLinkStart: (e: React.MouseEvent) => void;
    onLinkDrop: () => void;
    isExpanded: boolean;
    styleType: any;
}> = ({ node, onClick, onLinkStart, onLinkDrop, styleType }) => {
    const updateXarrow = useXarrow();

    // Icon Mapping based on type
    const getIcon = () => {
        const type = ((node as any).type || 'default').toLowerCase();
        if (type === 'character' || type === 'canon') return <User size={12} />;
        if (type === 'location') return <MapPin size={12} />;
        if (type === 'object') return <Box size={12} />;
        if (type === 'enemy' || type === 'conflict') return <Swords size={12} />;
        if (type === 'idea') return <BrainCircuit size={12} />;
        return <Diamond size={12} className="rotate-45" />;
    };

    const hasAlert = !!(node as any).coherency_report;

    return (
        <motion.div
            id={node.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: 1,
                scale: 1,
                x: node.x || 0,
                y: node.y || 0
            }}
            transition={{ duration: 0.5, ease: "easeOut" }} // Smooth simulation updates
            drag
            dragMomentum={false}
            onDrag={updateXarrow}
            onPointerDown={(e) => e.stopPropagation()}
            // Note: We handle drag updates via D3 simulation usually, but here we let Framer handle the visual drag
            // and maybe update the simulation onDragEnd if we wanted to be strict.
            // For this implementation, we treat visual position as authoritative for the user.
            className={`absolute w-[160px] flex flex-col pointer-events-auto cursor-grab active:cursor-grabbing z-[20] group select-none
                ${styleType.border} bg-slate-900/90 backdrop-blur-md rounded-lg shadow-xl border
            `}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            onMouseUp={(e) => {
                e.stopPropagation();
                onLinkDrop();
            }}
        >
            {/* Header / Main Body */}
            <div className="flex items-center gap-2 p-2 relative overflow-hidden">
                {/* Background Glow for Type */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${styleType.bg}`} />

                <div className={`text-titanium-400 ${styleType.text}`}>
                    {getIcon()}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-titanium-100 truncate leading-tight">
                        {(node as any).title || node.name || "Unknown"}
                    </div>
                    <div className="text-[9px] text-titanium-500 truncate font-mono uppercase tracking-wider">
                        {(node as any).metadata?.node_type || (node as any).type || "ENTITY"}
                    </div>
                </div>

                {/* Status Icons */}
                {hasAlert && (
                    <TriangleAlert size={12} className="text-[#ff153f] animate-pulse shrink-0" />
                )}
            </div>

            {/* Link Handle (Right Side) */}
            <div
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-800 border border-cyan-500/30 hover:bg-cyan-500 hover:border-cyan-400 cursor-crosshair opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center z-30"
                onMouseDown={(e) => onLinkStart(e)}
            >
                <div className="w-1 h-1 bg-white rounded-full" />
            </div>
        </motion.div>
    );
};

const WorldEnginePanel: React.FC<WorldEnginePanelProps> = ({
    isOpen,
    onClose,
    activeGemId
}) => {
    // 🟢 AUTH INJECTION (GHOST MODE COMPATIBLE)
    const { config, user } = useProjectConfig();

    const [isLoading, setIsLoading] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string>("ESTABLISHING NEURAL LINK...");

    // DATA STATE
    const [nodes, setNodes] = useState<Node[]>([]); // Local Ideas
    const [entityNodes, setEntityNodes] = useState<GraphNode[]>([]); // Canon Entities
    const [loadingCanon, setLoadingCanon] = useState(true);

    // INPUT STATE
    const [inputValue, setInputValue] = useState("");
    const [rigorValue, setRigorValue] = useState(0.5); // 0.0 (Arch) - 1.0 (Oracle)

    // KINETIC STATE
    const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
    const [selectedCanonId, setSelectedCanonId] = useState<string | null>(null);

    // SIMULATION STATE
    const [simulatedNodes, setSimulatedNodes] = useState<(VisualGraphNode | Node)[]>([]);
    const simulationRef = useRef<any>(null);

    // 🟢 HARDWIRE OPERATION: TARGET LOCK
    const EFFECTIVE_PROJECT_ID = "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq";

    // --- 1. DATA SUBSCRIPTION (STRICT PROJECT ID) ---
    useEffect(() => {
        if (!isOpen) return;
        setLoadingCanon(true);

        // 🟢 SAFETY TIMEOUT (Ghost Mode Anti-Blindness)
        // If the real DB is empty or unreachable, we still want to use the tool.
        const safetyTimer = setTimeout(() => {
            setLoadingCanon((current) => {
                if (current) {
                    console.warn("⚠️ [WORLD_ENGINE] Connection timed out. Forcing UI load for Ghost Mode.");
                    setEntityNodes(prev => {
                        if (prev.length === 0) {
                            console.log("🧪 [WORLD_ENGINE] Safety Timeout: Injecting FRANKENSTEIN_DATA...");
                            return FRANKENSTEIN_DATA;
                        }
                        return prev;
                    });
                    return false;
                }
                return current;
            });
        }, 5000);

        const db = getFirestore();

        if (user) {
            console.log(`📡 [WORLD_ENGINE] Subscribing to entities for ${user.uid} / ${EFFECTIVE_PROJECT_ID}`);
            // ONLY FETCH ENTITIES FROM PROJECT (SOURCE OF TRUTH)
            const entitiesRef = collection(db, "users", user.uid, "projects", EFFECTIVE_PROJECT_ID, "entities");
            const unsubscribeEntities = onSnapshot(query(entitiesRef), (snapshot) => {
                const loadedEntities: GraphNode[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    const name = data.meta?.name || data.name || (data.aliases && data.aliases[0]) || "Unknown Entity";
                    loadedEntities.push({
                        ...data,
                        id: doc.id,
                        name: name,
                        type: data.type || 'concept',
                        projectId: EFFECTIVE_PROJECT_ID,
                        relations: data.relations || [],
                        foundInFiles: data.foundInFiles || [],
                        meta: { ...data.meta, brief: data.description || "" },
                        isCanon: true // Mark as Canon
                    } as GraphNode);
                });

                if (loadedEntities.length === 0) {
                    console.log("🧪 [WORLD_ENGINE] Empty Database detected. Injecting FRANKENSTEIN_DATA...");
                    setEntityNodes(FRANKENSTEIN_DATA);
                } else {
                    console.log(`📡 [WORLD_ENGINE] Loaded ${loadedEntities.length} entities.`);
                    setEntityNodes(loadedEntities);
                }

                setLoadingCanon(false);
                clearTimeout(safetyTimer);
            }, (error) => {
                console.error("Failed to subscribe to Entities:", error);
                console.log("🧪 [WORLD_ENGINE] Subscription Error. Injecting FRANKENSTEIN_DATA...");
                setEntityNodes(FRANKENSTEIN_DATA);
                setLoadingCanon(false); // Fail gracefully
                clearTimeout(safetyTimer);
            });

            return () => {
                unsubscribeEntities();
                clearTimeout(safetyTimer);
            }
        } else {
            setLoadingCanon(false);
            clearTimeout(safetyTimer);
        }
    }, [isOpen, user]);

    // --- 2. UNIFIED NODES (THE MERGER) ---
    const unifiedNodes = useMemo(() => {
        // Combine Local Ideas + Canon Entities
        // Map to common visual structure
        const combined: (VisualGraphNode | Node)[] = [];

        // A. Entities
        entityNodes.forEach(e => {
            combined.push({
                ...e,
                // If it has saved coords, use them. Else undefined (d3 will handle).
                x: (e as any).fx || (e as any).x,
                y: (e as any).fy || (e as any).y,
                // Ensure we have a type
                type: e.type || 'concept'
            } as VisualGraphNode);
        });

        // B. Local Ideas
        nodes.forEach(n => {
            combined.push({
                ...n,
                name: n.title, // Map title to name
                // Use existing coords
                x: n.x,
                y: n.y,
                isLocal: true
            } as any);
        });

        return combined;
    }, [entityNodes, nodes]);

    // --- 3. PHYSICS ENGINE (CLUSTER STYLE) ---
    useEffect(() => {
        if (!isOpen || unifiedNodes.length === 0) return;

        console.log("⚡ INITIATING PHYSICS SIMULATION...");

        // Stop existing
        if (simulationRef.current) simulationRef.current.stop();

        // Prepare simulation data (clone to avoid mutating props directly if they were props)
        // We use 'nodes' for D3.
        const simNodes = unifiedNodes.map(n => ({ ...n }));

        // Extract Links
        const links: any[] = [];
        simNodes.forEach(node => {
            const rels = (node as any).relations || (node as any).metadata?.pending_relations || [];
            rels.forEach((r: any) => {
                const targetId = r.targetId;
                // Only link if target exists in current graph
                if (simNodes.find(n => n.id === targetId)) {
                    links.push({
                        source: node.id,
                        target: targetId,
                        type: r.relationType || r.relation
                    });
                }
            });
        });

        const simulation = d3.forceSimulation(simNodes as any)
            // 1. Repulsion (Separation) - Reduced slightly to allow tighter clusters
            .force("charge", d3.forceManyBody().strength(-300))
            // 2. Attraction (Links) - Stronger and shorter to keep families together
            .force("link", d3.forceLink(links).id((d: any) => d.id).distance(80).strength(0.8))
            // 3. Semantic Gravity (Clusters by Type)
            .force("x", d3.forceX((d: any) => {
                const type = ((d.metadata?.node_type || d.type || 'default') as string).toLowerCase();
                if (type === 'location') return 2500; // East
                if (type === 'idea' || type === 'concept') return 1500; // West
                return 2000; // Center (Characters/Canon)
            }).strength(0.2))
            .force("y", d3.forceY((d: any) => {
                 const type = ((d.metadata?.node_type || d.type || 'default') as string).toLowerCase();
                 // Distribute slightly to avoid horizontal line clutter
                 if (type === 'enemy' || type === 'conflict') return 2400; // South
                 return 2000;
            }).strength(0.2))
            // 4. Collision (Avoid Overlap) - Adjusted for rectangular cards
            .force("collide", d3.forceCollide().radius(110).iterations(2));

        // GOLDEN SPIRAL INITIALIZATION FOR NEW NODES
        simNodes.forEach((node, i) => {
             if (node.x === undefined || node.y === undefined) {
                 const angle = i * 2.4; // Golden angle approx
                 const radius = 30 * i; // Spiral out
                 node.x = 2000 + radius * Math.cos(angle);
                 node.y = 2000 + radius * Math.sin(angle);
             }
        });

        // WARM UP (Tick manually to stabilize)
        simulation.stop(); // Don't run timer
        const numTicks = 300;
        for (let i = 0; i < numTicks; ++i) simulation.tick();

        setSimulatedNodes(simNodes);
        // updateXarrowRef logic removed: Xwrapper + TransformComponent nesting handles sync natively via CSS transform.

        simulationRef.current = simulation;

        return () => simulation.stop();

    }, [unifiedNodes.length, isOpen]); // Re-run if node count changes


    // --- 4. INTERACTION HANDLERS ---
    const handleNodeClick = (node: VisualGraphNode | Node) => {
        if ((node as any).isLocal || (node as any).type === 'idea') {
            // IDEA -> MODAL
            setExpandedNodeId(node.id);
            setSelectedCanonId(null);
        } else {
            // CANON -> SIDEBAR
            setSelectedCanonId(node.id);
            setExpandedNodeId(null);
        }
    };

    // LINKING LOGIC
    const [draggingLink, setDraggingLink] = useState<{ sourceId: string, x: number, y: number } | null>(null);

    const handleLinkStart = (nodeId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.target as Element).getBoundingClientRect();
        setDraggingLink({ sourceId: nodeId, x: e.clientX, y: e.clientY });
    };

    const handleLinkMove = (e: React.MouseEvent) => {
        if (draggingLink) {
            setDraggingLink(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
        }
    };

    const handleLinkDrop = (targetId: string) => {
        if (draggingLink && draggingLink.sourceId !== targetId) {
            handleLinkCreate(draggingLink.sourceId, targetId);
        }
        setDraggingLink(null);
    };

    const handleLinkCreate = async (sourceId: string, targetId: string) => {
        // Logic to add link to source node's metadata
        // For now, just log or add optimistic
        console.log(`Connecting ${sourceId} to ${targetId}`);
        setNodes(prev => prev.map(n => {
            if (n.id === sourceId) {
                return {
                    ...n,
                    metadata: {
                        ...n.metadata,
                        pending_relations: [
                            ...(n.metadata?.pending_relations || []),
                            { targetId, relationType: 'NEUTRAL', status: 'PENDING' }
                        ]
                    }
                };
            }
            return n;
        }));
    };

    // 🟢 NEW: INPUT BAR HANDLER (OPERATION LAZARUS)
    const handleInputSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inputValue.trim()) return;

        // 🟢 FIX: Correctly using generateId(projectId, name, type)
        const newId = generateId(EFFECTIVE_PROJECT_ID, inputValue.trim(), 'idea');
        const newIdea: Node = {
            id: newId,
            type: 'idea',
            title: inputValue.trim(),
            content: `# ${inputValue.trim()}\n\n*Idea generada en el Laboratorio*`,
            agentId: rigorValue > 0.5 ? 'oracle' : 'architect',
            x: 2000 + (Math.random() - 0.5) * 100, // Spawn near center
            y: 2000 + (Math.random() - 0.5) * 100,
            metadata: {
                node_type: 'IDEA',
                pending_relations: []
            }
        };

        setNodes(prev => [...prev, newIdea]);
        setInputValue("");

        // Optimistic Feedback
        console.log("💡 New Idea Created:", newIdea);
    };

    // VISUAL STYLES
    const getStyle = (type: string) => {
        const t = type.toLowerCase();
        if (t === 'conflict' || t === 'enemy') return { border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-500' };
        if (t === 'ally' || t === 'object') return { border: 'border-cyan-500', text: 'text-cyan-400', bg: 'bg-cyan-500' };
        if (t === 'canon' || t === 'character' || t === 'family') return { border: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-500' };
        if (t === 'idea') return { border: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500' };
        return { border: 'border-slate-600', text: 'text-slate-400', bg: 'bg-slate-600' };
    };

    const getLinkColor = (type: string, status?: string) => {
        if (type === 'CONTRADICTION' || status === 'INVALID') return '#ff00ff'; // MAGENTA GLITCH
        if (type === 'FAMILY' || type === 'CANON') return '#ddbf61';
        if (type === 'ENEMY' || type === 'conflict') return '#ff153f';
        return '#00fff7'; // CYAN DEFAULT
    };

    if (!isOpen) return null;

    // Helper for Canon Drawer
    const selectedCanonNode = selectedCanonId ? entityNodes.find(n => n.id === selectedCanonId) : null;

    return (
        <div className="relative w-full h-full bg-[#141413] overflow-hidden font-sans text-titanium-100 flex flex-col touch-none">

            {/* 🟢 LOADER */}
            <AnimatePresence>
                {loadingCanon && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] bg-titanium-950 flex flex-col items-center justify-center gap-4"
                    >
                        <Loader2 className="animate-spin text-cyan-500" size={48} />
                        <span className="text-xs font-mono tracking-widest text-titanium-400">CONNECTING TO OMNIVERSE...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 🟢 ZOOM WRAPPER */}
            <TransformWrapper
                initialScale={0.5}
                minScale={0.1}
                maxScale={4}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ velocityDisabled: true }}
                // Sync handled by CSS nesting in Xwrapper
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        {/* CONTROLS */}
                        <div className="absolute bottom-24 right-6 z-50 flex flex-col gap-2 pointer-events-auto">
                            <button onClick={() => zoomIn()} className="p-3 bg-slate-800/90 border border-slate-600 rounded-lg hover:border-cyan-500"><Plus size={18} /></button>
                            <button onClick={() => zoomOut()} className="p-3 bg-slate-800/90 border border-slate-600 rounded-lg hover:border-cyan-500"><Minus size={18} /></button>
                            <button onClick={() => resetTransform()} className="p-3 bg-slate-800/90 border border-slate-600 rounded-lg hover:border-cyan-500"><RotateCcw size={18} /></button>
                        </div>

                        <TransformComponent
                            wrapperClass="!w-full !h-full"
                            contentClass="!w-full !h-full"
                        >
                            {/* ARENA 4000x4000 */}
                            <div className="relative" style={{ width: 4000, height: 4000 }}>
                                {/* GRID */}
                                <div
                                    className="absolute inset-0 z-0 opacity-10 pointer-events-none"
                                    style={{
                                        backgroundImage: 'radial-gradient(#7c8090 1px, transparent 1px)',
                                        backgroundSize: '40px 40px',
                                        width: '100%',
                                        height: '100%'
                                    }}
                                />

                                <Xwrapper>
                                    {/* NODES */}
                                    {simulatedNodes.map(node => (
                                        <NodeCard
                                            key={node.id}
                                            node={node}
                                            onClick={() => handleNodeClick(node)}
                                            onLinkStart={(e) => handleLinkStart(node.id, e)}
                                            onLinkDrop={() => handleLinkDrop(node.id)}
                                            isExpanded={expandedNodeId === node.id}
                                            styleType={getStyle((node as any).metadata?.node_type || (node as any).type || 'default')}
                                        />
                                    ))}

                                    {/* CONNECTIONS */}
                                    {simulatedNodes.map(node => {
                                        const rels = (node as any).relations || (node as any).metadata?.pending_relations || [];
                                        return rels.map((rel: any, idx: number) => {
                                            // Check existence
                                            if (!simulatedNodes.find(n => n.id === rel.targetId)) return null;

                                            const isConflict = rel.relationType === 'CONTRADICTION' || rel.status === 'INVALID';
                                            return (
                                                <Xarrow
                                                    key={`${node.id}-${rel.targetId}-${idx}`}
                                                    start={node.id}
                                                    end={rel.targetId}
                                                    color={getLinkColor(rel.relationType || rel.relation, rel.status)}
                                                    strokeWidth={2}
                                                    headSize={4}
                                                    curveness={0.3}
                                                    path="smooth"
                                                    startAnchor="auto"
                                                    endAnchor="auto"
                                                    dashness={isConflict}
                                                    zIndex={10}
                                                />
                                            );
                                        });
                                    })}
                                </Xwrapper>
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>

            {/* 🟢 INPUT BAR (OPERATION LAZARUS) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 pointer-events-auto">
                <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl p-2 flex items-center gap-3 relative">
                    {/* Rigor Slider (Left) */}
                    <div className="flex flex-col items-center justify-center w-12 gap-1 border-r border-slate-700 pr-2">
                        <div className="h-8 w-1 bg-slate-800 rounded-full relative overflow-hidden">
                            <motion.div
                                className={`absolute bottom-0 w-full rounded-full ${rigorValue > 0.5 ? 'bg-purple-500' : 'bg-cyan-500'}`}
                                style={{ height: `${rigorValue * 100}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={rigorValue}
                            onChange={(e) => setRigorValue(parseFloat(e.target.value))}
                            className="absolute opacity-0 w-12 h-10 cursor-ns-resize"
                            title={rigorValue > 0.5 ? "Oracle Mode (Chaos)" : "Architect Mode (Logic)"}
                        />
                    </div>

                    {/* Input Field */}
                    <form onSubmit={handleInputSubmit} className="flex-1 flex items-center gap-2">
                         <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Escribe una nueva idea..."
                            className="flex-1 bg-transparent border-none outline-none text-white placeholder-slate-500 text-sm font-medium h-10"
                         />
                         <button
                            type="submit"
                            className="p-2 bg-slate-800 text-slate-400 rounded-xl hover:bg-slate-700 hover:text-white transition-colors"
                         >
                            <Send size={16} />
                         </button>
                    </form>
                </div>
            </div>

            {/* 🟢 RIGHT DRAWER: CANON INSPECTOR */}
            <div
                className={`absolute top-0 right-0 bottom-0 w-[400px] bg-titanium-950/95 border-l border-titanium-800 shadow-2xl transform transition-transform duration-300 ease-out z-50 flex flex-col pointer-events-auto
                    ${selectedCanonId ? 'translate-x-0' : 'translate-x-full'}
                `}
            >
                {selectedCanonNode && (
                    <div className="flex flex-col h-full">
                        <div className="p-6 border-b border-titanium-800 bg-titanium-900/50">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 border border-cyan-900 px-2 py-1 rounded bg-cyan-950/30">
                                    {selectedCanonNode.type}
                                </span>
                                <button onClick={() => setSelectedCanonId(null)} className="text-titanium-500 hover:text-white">
                                    <X size={20} />
                                </button>
                            </div>
                            <h2 className="text-3xl font-bold text-white font-serif">{selectedCanonNode.name}</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-titanium-500 uppercase tracking-wider">Descripción</h4>
                                <p className="text-titanium-200 text-sm leading-relaxed font-serif">
                                    {(selectedCanonNode as any).meta?.brief || (selectedCanonNode as any).description || "Sin descripción disponible."}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-titanium-500 uppercase tracking-wider">Metadatos</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-black/20 p-3 rounded border border-titanium-800">
                                        <div className="text-[10px] text-titanium-500 uppercase">Tier</div>
                                        <div className="text-sm font-bold text-white">{(selectedCanonNode as any).meta?.tier || "N/A"}</div>
                                    </div>
                                    <div className="bg-black/20 p-3 rounded border border-titanium-800">
                                        <div className="text-[10px] text-titanium-500 uppercase">Estado</div>
                                        <div className="text-sm font-bold text-emerald-400">CANON</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 🟢 CENTER MODAL: IDEA EDIT */}
            <AnimatePresence>
                {expandedNodeId && (
                     <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-12 pointer-events-auto"
                        onClick={() => setExpandedNodeId(null)}
                     >
                         <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="w-full max-w-4xl h-[80vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
                            onClick={e => e.stopPropagation()}
                         >
                            <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-950">
                                <div className="flex items-center gap-3">
                                    <BrainCircuit className="text-emerald-500" />
                                    <h2 className="text-xl font-bold text-white">
                                        {nodes.find(n => n.id === expandedNodeId)?.title}
                                    </h2>
                                </div>
                                <button onClick={() => setExpandedNodeId(null)} className="text-slate-500 hover:text-white"><X /></button>
                            </div>
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="prose prose-invert max-w-none">
                                    <MarkdownRenderer
                                        content={nodes.find(n => n.id === expandedNodeId)?.content || ""}
                                        mode="full"
                                    />
                                </div>
                            </div>
                         </motion.div>
                     </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default WorldEnginePanel;
