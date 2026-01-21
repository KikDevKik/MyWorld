import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, updateDoc, collection, onSnapshot, query, setDoc, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
    LayoutTemplate,
    Sparkles,
    TriangleAlert,
    X,
    Zap,
    Disc,
    Diamond,
    Loader2
} from 'lucide-react';
import { GemId } from '../types';
import { Character } from '../types/core';
import { GraphNode } from '../types/graph';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import InterrogationModal from './ui/InterrogationModal';
import CrystallizeModal from './ui/CrystallizeModal';
import MarkdownRenderer from './ui/MarkdownRenderer';
import NexusGraph from './forge/NexusGraph';
import { generateId } from '../utils/sha256';

// 🟢 VISUAL EXO-SKELETON (Interface Extension)
// Allows UI-specific props (physics, selection state) without polluting the Database Schema.
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
    x?: number; // Graph Coordinate X
    y?: number; // Graph Coordinate Y
    fx?: number; // Fixed Position X
    fy?: number; // Fixed Position Y
    metadata?: {
        suggested_filename?: string;
        suggested_folder_category?: string;
        node_type?: string;
        related_node_ids?: string[];
        // Pending relationships to be created on crystallization
        pending_relations?: {
            targetId: string;
            relationType: string;
        }[];
    };
    coherency_report?: {
        warning: string;
        file_source: string;
        explanation: string;
    };
}

// 🟢 SESSION INTERFACE
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

const CONTENT_TYPES: {[key: string]: {color: string, border: string, shadow: string, text: string}} = {
    concept: {
        color: 'blue',
        border: 'border-blue-500/50',
        shadow: 'shadow-[0_0_30px_rgba(59,130,246,0.2)]',
        text: 'text-blue-400'
    },
    conflict: {
        color: 'red',
        border: 'border-red-500/50',
        shadow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)]',
        text: 'text-red-400'
    },
    lore: {
        color: 'violet',
        border: 'border-violet-500/50',
        shadow: 'shadow-[0_0_30px_rgba(139,92,246,0.2)]',
        text: 'text-violet-400'
    },
    default: {
        color: 'slate',
        border: 'border-slate-500/50',
        shadow: 'shadow-[0_0_20px_rgba(100,116,139,0.2)]',
        text: 'text-slate-400'
    }
};

const getChaosColor = (value: number) => {
    if (value <= 0.3) return 'from-cyan-500 to-blue-500';
    if (value <= 0.7) return 'from-purple-500 to-violet-500';
    return 'from-pink-500 to-white';
};

const ChaosSlider: React.FC<{ value: number; onChange: (val: number) => void }> = ({ value, onChange }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const updateValue = (clientX: number) => {
        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const percent = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
        onChange(Number(percent.toFixed(2))); // Round to 2 decimals
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        updateValue(e.clientX);
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging) updateValue(e.clientX);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const step = 0.05;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(Math.min(1, Number((value + step).toFixed(2))));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(Math.max(0, Number((value - step).toFixed(2))));
        }
    };

    return (
        <div className="flex items-center gap-4 select-none w-full">
            <span className="text-xs font-bold text-titanium-400 tracking-widest min-w-[50px]">RIGOR</span>

            <div
                ref={trackRef}
                role="slider"
                aria-label="Nivel de Caos (Entropía)"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={value}
                aria-valuetext={`${(value * 100).toFixed(0)}% Caos`}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                className="relative flex-1 h-4 bg-slate-800 rounded-full cursor-pointer touch-none group border border-slate-700 overflow-hidden focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT focus:border-transparent"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
            >
                <div
                    className={`absolute top-0 left-0 bottom-0 bg-gradient-to-r ${getChaosColor(value)} transition-all duration-100 ease-out`}
                    style={{ width: `${value * 100}%` }}
                />
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10"
                    style={{ left: `calc(${value * 100}% - 6px)` }}
                    animate={{ scale: isDragging ? 1.2 : 1 }}
                    whileHover={{ scale: 1.2 }}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                     <span className="text-[9px] font-mono font-bold text-white drop-shadow-md">{value.toFixed(2)}</span>
                </div>
            </div>

            <span className="text-xs font-bold text-titanium-400 tracking-widest min-w-[60px] text-right">ENTROPÍA</span>
        </div>
    );
};

const CombatToggle: React.FC<{ value: boolean; onChange: (val: boolean) => void }> = ({ value, onChange }) => {
    return (
        <button
            onClick={() => onChange(!value)}
            className={`flex items-center gap-3 px-4 py-2 rounded-lg border transition-all duration-300 ${
                value
                    ? 'bg-red-900/40 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.2)]'
                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800'
            }`}
        >
            <Zap size={16} className={value ? 'text-red-500' : 'text-titanium-500'} />
            <span className={`text-xs font-bold tracking-wider ${value ? 'text-red-100' : 'text-titanium-400'}`}>
                {value ? 'RED ALERT' : 'SAFE MODE'}
            </span>
        </button>
    );
};

const WorldEnginePanel: React.FC<WorldEnginePanelProps> = ({
    isOpen,
    onClose,
    activeGemId
}) => {
    // UI STATE
    const [activeAgent, setActiveAgent] = useState<AgentType>('architect');
    const [chaosLevel, setChaosLevel] = useState<number>(0.3);
    const [combatMode, setCombatMode] = useState<boolean>(false);

    // DATA STATE
    const [nodes, setNodes] = useState<Node[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>("ESTABLISHING NEURAL LINK...");

    // 🟢 CANON STATE (Elevated)
    const [canonCharacters, setCanonCharacters] = useState<Character[]>([]);
    const [entityNodes, setEntityNodes] = useState<GraphNode[]>([]);
    const [loadingCanon, setLoadingCanon] = useState(true);
    const [selectedCanonId, setSelectedCanonId] = useState<string | null>(null);

    // 🟢 KINETIC STATE
    const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

    const [interrogation, setInterrogation] = useState<InterrogationState>({
        isOpen: false,
        questions: [],
        depth: 0,
        history: [],
        pendingPrompt: ''
    });

    // CRYSTALLIZATION STATE
    const [crystallizeModal, setCrystallizeModal] = useState<{isOpen: boolean, node: Node | null, isProcessing: boolean}>({
        isOpen: false, node: null, isProcessing: false
    });

    // 🟢 TACTICAL LOCKDOWN: OVERLAY STATE
    const isOverlayActive = crystallizeModal.isOpen || interrogation.isOpen || !!expandedNodeId;

    // 🟢 PHASE 4.3: SESSION STATE
    const [sessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
    const [sessionHistory, setSessionHistory] = useState<SessionItem[]>([]);

    // CONTEXT
    const { config } = useProjectConfig();

    // 🟢 HARDWIRE OPERATION: TARGET LOCK
    // Manual Bypass to force connection to the specific Nexus ID.
    const EFFECTIVE_PROJECT_ID = "1mImHC6_uFVo06QjqL-pFcKF-E6ufQUdq";

    const activeAgentConfig = AGENTS[activeAgent];

    // 🟢 COHERENCY MONITOR
    const latestNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    const activeAlert = latestNode?.coherency_report;

    // --- 0. DATA SUBSCRIPTION (LIFTED STATE) ---
    useEffect(() => {
        if (!isOpen) return;

        // 🟢 HARDWIRE: Ignore config.folderId, use Target
        const folderId = EFFECTIVE_PROJECT_ID;
        const auth = getAuth();

        if (!folderId || !auth.currentUser) {
            setLoadingCanon(false);
            return;
        }

        setLoadingCanon(true);
        const db = getFirestore();

        // 1. SOURCE: CANON (Manual Truth)
        const charactersRef = collection(db, "users", auth.currentUser.uid, "characters");
        const unsubscribeCharacters = onSnapshot(query(charactersRef), (snapshot) => {
            const loadedChars: Character[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loadedChars.push({
                    ...data,
                    id: doc.id, // FORCE ID FROM DOC
                    name: data.name || "Unknown Character"
                } as Character);
            });
            setCanonCharacters(loadedChars);
        });

        // 2. SOURCE: ENTITIES (AI/Hash Truth - The Rich Collection)
        const entitiesRef = collection(db, "users", auth.currentUser.uid, "projects", folderId, "entities");
        const unsubscribeEntities = onSnapshot(query(entitiesRef), (snapshot) => {
            const loadedEntities: GraphNode[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();

                // 🟢 DIAGNOSTIC: Check if we are reading the Rich Collection
                // We expect 'relations' array to be present.
                if (loadedEntities.length === 0) {
                     console.log("[WorldEngine] First Entity Sample:", {
                         id: doc.id,
                         hasRelations: !!data.relations,
                         relationCount: data.relations?.length || 0,
                         keys: Object.keys(data)
                     });
                }

                // 🟢 EXACT MAPPING DIRECTIVE
                // ID: doc.id
                // Label: data.meta.name ?? data.name ?? data.aliases
                // Type: data.type
                const name = data.meta?.name || data.name || (data.aliases && data.aliases[0]) || "Unknown Entity";

                loadedEntities.push({
                    ...data,
                    id: doc.id,
                    name: name,
                    type: data.type || 'concept', // Default to concept if type missing
                    projectId: folderId,
                    relations: data.relations || [],
                    foundInFiles: data.foundInFiles || [], // Ensure we carry this over
                    meta: {
                        ...data.meta,
                        brief: data.description || ""
                    }
                } as GraphNode);
            });
            setEntityNodes(loadedEntities);
            setLoadingCanon(false);
        }, (error) => {
            console.error("Failed to subscribe to Entities:", error);
            setLoadingCanon(false);
        });

        return () => {
            unsubscribeCharacters();
            unsubscribeEntities();
        };
    }, [isOpen, config?.folderId, config?.characterVaultId]); // Keep dependencies but logic ignores them

    // --- HARVESTER (FRONTEND LOGIC) ---
    const harvestWorldContext = async (): Promise<{ canon_dump: string; timeline_dump: string }> => {
        if (!config) return { canon_dump: "", timeline_dump: "" };

        const functions = getFunctions();
        const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
        const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');

        let canonText = "";
        let timelineText = "";

        // 🟢 HELPER: Flatten tree and track Priority (Source of Truth)
        const flattenAndSortFiles = (
            nodes: any[],
            isPriorityBranch: boolean = false,
            primaryId: string | null = null
        ): { file: any; isPriority: boolean }[] => {
            let result: { file: any; isPriority: boolean }[] = [];

            for (const node of nodes) {
                // Determine if this node (root or child) is part of the Primary Tree
                // If we are already in a priority branch, children inherit it.
                // If not, check if this node IS the primary root.
                const currentIsPriority = isPriorityBranch || (primaryId && node.id === primaryId);

                if (node.type === 'file' || node.mimeType !== 'application/vnd.google-apps.folder') {
                    // Filter for markdown/text
                    if (node.name.endsWith('.md') || node.name.endsWith('.txt')) {
                        result.push({ file: node, isPriority: !!currentIsPriority });
                    }
                }

                if (node.children && node.children.length > 0) {
                    result = [...result, ...flattenAndSortFiles(node.children, !!currentIsPriority, primaryId)];
                }
            }

            return result;
        };

        // HELPER: Fetch content with Sorting & Headers
        const fetchContent = async (items: { file: any; isPriority: boolean }[]): Promise<string> => {
            // SORT: Priority First
            const sortedItems = [...items].sort((a, b) => {
                if (a.isPriority && !b.isPriority) return -1;
                if (!a.isPriority && b.isPriority) return 1;
                return 0;
            });

            let combined = "";
            for (const item of sortedItems) {
                try {
                    const token = localStorage.getItem('google_drive_token');
                    if (!token) continue;

                    const res = await getDriveFileContent({ fileId: item.file.id, accessToken: token }) as any;

                    // 🏷️ APPLY PRIORITY TAGS
                    const header = item.isPriority
                        ? `[CORE WORLD RULES / PRIORITY LORE - File: ${item.file.name}]`
                        : `[FILE: ${item.file.name}]`;

                    combined += `\n\n${header}\n${res.data.content}`;
                } catch (e) {
                    console.warn(`Failed to read ${item.file.name}`, e);
                }
            }
            return combined;
        };

        if (config.canonPaths && config.canonPaths.length > 0) {
            setStatusMessage("ALIGNING WITH CANON PROTOCOLS...");
            const token = localStorage.getItem('google_drive_token');
            if (token) {
                try {
                     const folderIds = config.canonPaths.map(p => p.id);
                     const res = await getDriveFiles({ folderIds, accessToken: token, recursive: true }) as any;

                     // 🟢 FLATTEN & IDENTIFY PRIORITY
                     const flatList = flattenAndSortFiles(res.data, false, config.primaryCanonPathId);

                     canonText = await fetchContent(flatList);
                } catch (e) {
                    console.error("Canon Harvest Failed", e);
                }
            }
        }

        if (config.chronologyPath) {
             setStatusMessage("SYNCHRONIZING TIMELINE EVENTS...");
             const token = localStorage.getItem('google_drive_token');
             if (token) {
                 try {
                     const res = await getDriveFiles({ folderId: config.chronologyPath.id, accessToken: token, recursive: true }) as any;

                     // Flatten simple for timeline (no priority distinction needed here, but reusing logic)
                     const flatList = flattenAndSortFiles(res.data, false, null);

                     timelineText = await fetchContent(flatList);
                 } catch (e) {
                     console.error("Timeline Harvest Failed", e);
                 }
             }
        }

        return { canon_dump: canonText, timeline_dump: timelineText };
    };

    // --- NEURAL LINK (BACKEND CONNECTION) ---
    const runSimulation = async (
        prompt: string,
        currentDepth: number,
        clarificationHistory: { questions: string[]; answer: string }[]
    ) => {
        setIsLoading(true);
        setStatusMessage(currentDepth > 0 ? `REFINING... (DEPTH ${currentDepth}/3)` : "INITIALIZING HARVESTER...");

        const functions = getFunctions();
        const worldEngine = httpsCallable(functions, 'worldEngine', { timeout: 1800000 });

        let backendAgentId = 'ARCHITECT';
        if (activeAgent === 'oracle') backendAgentId = 'ORACLE';
        if (activeAgent === 'advocate') backendAgentId = 'DEVIL_ADVOCATE';

        try {
            const contextPayload = await harvestWorldContext();

            // 🟢 HARVEST VISUAL CONTEXT (THE EYES)
            // We map unifiedNodes to a lightweight structure
            const currentGraphContext = unifiedNodes.map(n => ({
                id: n.id,
                name: n.name,
                type: n.type || 'concept'
            }));

            setStatusMessage("DEEP REASONING IN PROGRESS... DO NOT REFRESH.");

            let clarificationsText = "";
            if (clarificationHistory.length > 0) {
                clarificationsText = clarificationHistory.map((item, idx) =>
                    `[ROUND ${idx + 1}]\nQ: ${item.questions.join(" / ")}\nA: ${item.answer}`
                ).join("\n\n");
            }

            const recentHistory = sessionHistory.slice(-5);
            const accessToken = localStorage.getItem('google_drive_token');

            const payload = {
                prompt,
                agentId: backendAgentId,
                chaosLevel,
                combatMode,
                context: contextPayload,
                currentGraphContext, // 🟢 INJECTED EYES
                interrogationDepth: currentDepth,
                clarifications: clarificationsText,
                sessionId,
                sessionHistory: recentHistory,
                accessToken,
                folderId: EFFECTIVE_PROJECT_ID // 🟢 HARDWIRE
            };

            const result = await worldEngine(payload) as any;
            const data = result.data;

            console.log("🔍 WORLD ENGINE RESPONSE TYPE:", data.type);

            if (data.type === 'inquiry') {
                setInterrogation({
                    isOpen: true,
                    questions: data.questions || ["Please clarify your intent."],
                    depth: currentDepth,
                    history: clarificationHistory,
                    pendingPrompt: prompt
                });
                return;
            }

            // 🟢 COHERENCY CHECK (LOGGING)
            if (data.coherency_report) {
                console.log("⚠️ COHERENCY REPORT RECEIVED:", data.coherency_report);
            }

            // 🟢 NEW ARRAY HANDLING (MULTIPLE NODES)
            const createdNodes: Node[] = [];

            if (data.newNodes && Array.isArray(data.newNodes)) {
                data.newNodes.forEach((n: any) => {
                    // Extract relations relevant to this node from newRelations
                    // 🟢 RED THREAD LOGIC: Capture both OUTGOING (Source -> Target) and INCOMING (Target -> Source)
                    const myRelations = data.newRelations?.filter((r: any) =>
                        r.source === n.id || r.target === n.id
                    ).map((r: any) => {
                        const isOutgoing = r.source === n.id;
                        return {
                            targetId: isOutgoing ? r.target : r.source, // Link to the 'other' entity
                            relationType: r.label,
                            context: isOutgoing ? "Active Link" : "Passive Link" // Optional Context
                        };
                    }) || [];

                    createdNodes.push({
                        id: n.id || generateId(sessionId, n.title),
                        type: 'idea', // FORCE IDEA TYPE FOR GOLD COLOR
                        title: n.title || 'Unknown',
                        content: n.content || '',
                        agentId: activeAgent,
                        metadata: {
                            ...n.metadata,
                            pending_relations: myRelations
                        },
                        coherency_report: data.coherency_report // Attach report to the first/main node or all?
                    });
                });
            } else if (data.type !== 'inquiry') {
                // Fallback for legacy format (Single Object)
                createdNodes.push({
                    id: Date.now().toString(),
                    type: data.type || 'idea',
                    title: data.title || 'Unknown',
                    content: data.content || 'No content received.',
                    agentId: activeAgent,
                    metadata: data.metadata,
                    coherency_report: data.coherency_report || undefined
                });
            }

            console.log("FINAL GENERATED NODES:", createdNodes.length);

            setNodes(prev => [...prev, ...createdNodes]);
            setSessionHistory(prev => [...prev, { prompt, result: data }]);

            setInterrogation({
                isOpen: false,
                questions: [],
                depth: 0,
                history: [],
                pendingPrompt: ''
            });


        } catch (error) {
            console.error("NEURAL LINK FAILURE:", error);
        } finally {
            setIsLoading(false);
            setStatusMessage("ESTABLISHING NEURAL LINK...");
        }
    };

    const generateNode = async (prompt: string) => {
        runSimulation(prompt, 0, []);
    };

    const handleInterrogationSubmit = (answer: string) => {
        const newHistory = [
            ...interrogation.history,
            { questions: interrogation.questions, answer }
        ];
        setInterrogation(prev => ({ ...prev, isOpen: false }));
        runSimulation(interrogation.pendingPrompt, interrogation.depth + 1, newHistory);
    };

    // 🟢 NEXUS INTEGRATION HANDLERS

    // 1. SELECT NODE (Single Click)
    const handleNodeClick = (nodeId: string, isLocal: boolean) => {
        // Just highlight or log. We do NOT open modals on single click.
        console.log(`[WorldEngine] Selected ${isLocal ? 'Idea' : 'Canon'}:`, nodeId);
    };

    // 2. OPEN NODE (Double Click)
    const handleNodeDoubleClick = (nodeId: string, isLocal: boolean) => {
        if (isLocal) {
            setExpandedNodeId(nodeId); // Open Macro Card
            setSelectedCanonId(null);
        } else {
            // Open Canon Drawer (Lifted State)
            // Find the node in canonNodes (mapped)
            const mappedCanon = unifiedNodes.find(n => n.id === nodeId && !n.isLocal);
            if (mappedCanon) {
                setSelectedCanonId(nodeId);
                setExpandedNodeId(null);
            }
        }
    };

    // 3. PERSISTENCE (Drag End)
    const handleNodeDragEnd = async (node: VisualGraphNode) => {
        if (node.isLocal && !node.isGhost && !node.isEphemeral) {
             // True Local Idea (RAM only)
            setNodes(prev => prev.map(n =>
                n.id === node.id
                ? { ...n, fx: node.x, fy: node.y, x: node.x, y: node.y }
                : n
            ));
        } else {
            // Update Firestore for: Canon, Rich Entities, or Ephemeral Ghosts becoming Real
            if (!EFFECTIVE_PROJECT_ID) return; // 🟢 HARDWIRE

            const entityId = node.id;

            try {
                const auth = getAuth();
                const db = getFirestore();

                if (auth.currentUser) {
                    const entityRef = doc(db, "users", auth.currentUser.uid, "projects", EFFECTIVE_PROJECT_ID, "entities", entityId); // 🟢 HARDWIRE

                    // CHECK: Is this an Ephemeral Ghost? (No DB record yet)
                    // We check if it was missing from entityNodes at render time, but simpler to check the node flag
                    // Note: 'node' here comes from D3/ReactForceGraph, it wraps our data in 'entityData' usually,
                    // OR it merges properties. 'node.isEphemeral' should be preserved if we passed it.

                    // The 'node' object from the graph usually has top-level props from our data object.
                    // ⚠️ SAFETY CAST: The incoming node from graph might have extra D3 props.
                    const isEphemeral = node.isEphemeral;

                    if (isEphemeral) {
                         // 🟢 GENESIS PROTOCOL: Ghost -> Real Entity
                         // We must save the FULL payload because it doesn't exist in DB yet.
                         // ⚠️ CLEANING PROTOCOL: Strip UI flags before saving to DB
                         const payload: any = {
                            id: entityId, // Persistence ID
                            name: node.name,
                            type: node.type || 'concept',
                            projectId: EFFECTIVE_PROJECT_ID, // 🟢 HARDWIRE
                            relations: node.relations || [],
                            foundInFiles: node.foundInFiles || [],
                            meta: node.meta || {},
                            description: node.description || "Entidad materializada desde el Nexus.",
                            fx: node.x,
                            fy: node.y,
                            createdFromGhost: true
                         };

                         // Explicitly remove UI flags if they leaked into the object (though construction above prevents it)
                         // This is just double safety.

                         console.log(`[Genesis] Materializing Ghost Node: ${node.name}`);
                         await setDoc(entityRef, payload, { merge: true });

                    } else {
                        // 🟢 UPDATE PROTOCOL: Just update position
                        // This applies to Canon Shadows AND Rich Entities.
                        // We do NOT overwrite name/relations/etc.
                        console.log(`[Persistence] Updating position for: ${node.name}`);
                        await setDoc(entityRef, {
                            fx: node.x,
                            fy: node.y
                        }, { merge: true });
                    }
                }
            } catch (e) {
                console.error("Failed to save node position", e);
            }
        }
    };

    // 4. LINKING (Red Thread)
    const handleLinkCreate = (sourceId: string, targetId: string) => {
        // Find source and target
        const sourceNode = nodes.find(n => n.id === sourceId);
        // Target could be local or canon (not in 'nodes' array if canon)

        console.log(`Link Request: ${sourceId} -> ${targetId}`);

        // UX: Ask for relation type?
        // Simple prompt for now (MVP)
        const relation = prompt("Define Relation (ENEMY, ALLY, MENTOR, FAMILY, NEUTRAL, CAUSE):", "ENEMY");
        if (!relation) return;

        const relType = relation.toUpperCase();

        if (sourceNode) {
             // If source is Local Idea, store pending relation
             setNodes(prev => prev.map(n => {
                 if (n.id === sourceId) {
                     const existing = n.metadata?.pending_relations || [];
                     return {
                         ...n,
                         metadata: {
                             ...n.metadata,
                             pending_relations: [...existing, { targetId, relationType: relType }]
                         }
                     };
                 }
                 return n;
             }));
             alert(`Linked Idea to ${targetId} as ${relType}. Will persist on crystallization.`);
        } else {
            // Canon -> Canon
            // TODO: Implement immediate Firestore write for relationships
            alert("Canon-to-Canon linking not yet implemented in this phase.");
        }
    };

    // 🟢 THE DROP: AUTO-FREEZE HANDLER
    const handleAutoFreeze = (nodeId: string, x: number, y: number) => {
        console.log(`[WorldEngine] Freezing Node ${nodeId} at ${x.toFixed(0)},${y.toFixed(0)}`);
        setNodes(prev => prev.map(n =>
            n.id === nodeId
            ? { ...n, fx: x, fy: y, x, y } // Lock it down
            : n
        ));
    };

    // 🟢 HELPER: NORMALIZATION PROTOCOL
    const normalizeName = (name: string): string => {
        if (!name) return "";
        // 1. Remove Extension
        let clean = name.replace(/\.(md|txt|json)$/i, '');
        // 2. Remove Prefixes
        const prefixes = ["Ficha ", "Perfil ", "Hoja ", "Borrador ", "Personaje "];
        prefixes.forEach(p => {
            const regex = new RegExp(`^${p}`, 'i');
            clean = clean.replace(regex, '');
        });
        return clean.trim();
    };

    // 🟢 UNIFIED NODE BUILDER (THE MERGER v3 - NEXUS SUPREMACY)
    const unifiedNodes = useMemo(() => {
        const unifiedMap = new Map<string, VisualGraphNode>();
        const incomingRelations = new Map<string, number>(); // TargetID -> Count

        // STEP 0: CALCULATE INCOMING METRICS (Global Popularity)
        entityNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(rel => {
                    const count = incomingRelations.get(rel.targetId) || 0;
                    incomingRelations.set(rel.targetId, count + 1);
                });
            }
        });

        // STEP 1: NEXUS SUPREMACY (The Kings)
        // Load all AI-detected entities first. They define the structure.
        entityNodes.forEach(entity => {
            // Clone to Visual Node
            const node: VisualGraphNode = {
                ...entity,
                val: 10, // Default size
                isCanon: false // Default, will be upgraded if file found
            };

            // Size Logic based on Tier/Popularity
            const incoming = incomingRelations.get(node.id) || 0;
            if (incoming > 5) node.val = 20;

            unifiedMap.set(node.id, node);
        });

        // STEP 2: SMART FUSION (The Matching)
        // Iterate Canon Files and try to merge into Nexus Nodes.
        canonCharacters.forEach(file => {
            const rawName = file.name || "";
            const cleanName = normalizeName(rawName).toLowerCase();
            const fileId = file.id;

            // STRATEGY: Find match in Nexus
            let match: VisualGraphNode | undefined;

            // A. Try ID Match
            match = unifiedMap.get(fileId);

            // B. Try Name Match (Fuzzy)
            if (!match) {
                // Iterate map values (expensive but safe for <1000 nodes)
                for (const [key, entity] of unifiedMap.entries()) {
                    if (entity.name && normalizeName(entity.name).toLowerCase() === cleanName) {
                        match = entity;
                        break;
                    }
                }
            }

            if (match) {
                // 🟢 FUSION: UPGRADE NEXUS NODE
                match.isCanon = true;
                match.fileId = fileId;
                // Update Meta/Tier from File if available
                if (file.tier) {
                    match.meta = { ...match.meta, tier: file.tier === 'MAIN' ? 'protagonist' : 'secondary' };
                }
                // Update size
                if (match.meta?.tier === 'protagonist') match.val = 40;
                else if (match.meta?.tier === 'secondary') match.val = 25;

            } else {
                // 🟢 ORPHAN PROTOCOL: NOISE CANCELLATION
                // If NO match in Nexus, check if it is "Relevant".
                // Relevance = Is it mentioned by anyone? (Incoming Relations)
                const isReferred = incomingRelations.has(fileId);

                if (isReferred) {
                    // It is an Orphan but someone points to it (using its File ID).
                    // We allow it as a "Passive Node".
                    unifiedMap.set(fileId, {
                        id: fileId,
                        name: normalizeName(rawName), // Use clean name
                        type: 'character', // Default
                        projectId: config?.folderId || '',
                        description: file.description || "Archivo referenciado.",
                        meta: { tier: file.tier === 'MAIN' ? 'protagonist' : 'secondary' },
                        relations: [],
                        foundInFiles: [],
                        isCanon: true,
                        fileId: fileId,
                        val: file.tier === 'MAIN' ? 40 : 20
                    });
                }
                // ELSE: DISCARD (Noise)
            }
        });

        // STEP 3: GHOST EXPANSION (Level 1)
        // Iterate current map (Nexus + Relevant Orphans)
        const currentNodes = Array.from(unifiedMap.values());

        currentNodes.forEach(sourceNode => {
            if (!sourceNode.relations) return;

            sourceNode.relations.forEach(rel => {
                const targetId = rel.targetId;
                const targetName = rel.targetName;

                // Check existence
                let exists = unifiedMap.has(targetId);
                if (!exists && targetName) {
                    // Check by name
                    exists = Array.from(unifiedMap.values()).some(n => normalizeName(n.name || "") === normalizeName(targetName));
                }

                if (!exists) {
                    // 👻 CREATE GHOST
                    let ghostId = targetId;
                    if (!ghostId || ghostId.length < 5) {
                        // Fallback ID
                        ghostId = generateId(EFFECTIVE_PROJECT_ID, targetName);
                    }

                    if (!unifiedMap.has(ghostId)) {
                        const popularity = incomingRelations.get(targetId) || 0;
                        const ghostSize = popularity > 5 ? 20 : 10;

                        // ORBITAL POSITIONING
                        const angle = Math.random() * 2 * Math.PI;
                        const radius = 50 + Math.random() * 50;
                        const parentX = sourceNode.fx || sourceNode.x || 0;
                        const parentY = sourceNode.fy || sourceNode.y || 0;

                        unifiedMap.set(ghostId, {
                            id: ghostId,
                            name: targetName,
                            type: rel.targetType || 'concept',
                            projectId: EFFECTIVE_PROJECT_ID,
                            description: "Entidad inferida (Nodo Fantasma)",
                            relations: [],
                            isGhost: true,
                            isEphemeral: true,
                            val: ghostSize,
                            fx: parentX + radius * Math.cos(angle),
                            fy: parentY + radius * Math.sin(angle)
                        });
                    }
                }
            });
        });

        // STEP 4: LOCAL IDEAS (RAM)
        nodes.forEach(n => {
            unifiedMap.set(n.id, {
                id: n.id,
                name: n.title,
                type: 'idea',
                projectId: EFFECTIVE_PROJECT_ID,
                fx: n.fx,
                fy: n.fy,
                meta: { brief: n.content.substring(0, 50) },
                agentId: n.agentId,
                isLocal: true,
                val: 8,
                relations: n.metadata?.pending_relations?.map(r => ({
                    targetId: r.targetId,
                    targetName: "Unknown",
                    targetType: 'concept',
                    relation: r.relationType as any,
                    context: "Local Link",
                    sourceFileId: "session"
                })) || []
            } as VisualGraphNode);
        });

        return Array.from(unifiedMap.values());

    }, [canonCharacters, entityNodes, nodes, config]);

    // 🟢 TELEMETRY (SANITY CHECK)
    useEffect(() => {
        if (isOpen) {
            console.log(`[Nexus Fusion] Total Render: ${unifiedNodes.length} | Canon (DB): ${canonCharacters.length} | Entities (Hash): ${entityNodes.length} | Ideas (RAM): ${nodes.length}`);
        }
    }, [unifiedNodes.length, canonCharacters.length, entityNodes.length, nodes.length, isOpen]);

    // CRYSTALLIZATION
    const handleCrystallize = (node: Node) => {
        setCrystallizeModal({ isOpen: true, node, isProcessing: false });
    };

    const confirmCrystallization = async (data: { fileName: string; folderId: string; frontmatter: any }) => {
        if (!crystallizeModal.node) return;
        setCrystallizeModal(prev => ({ ...prev, isProcessing: true }));

        try {
            const functions = getFunctions();
            const crystallizeNode = httpsCallable(functions, 'crystallizeNode');
            const accessToken = localStorage.getItem('google_drive_token');

            // 🟢 FORCE HARDWIRE ID
            const targetFolderId = EFFECTIVE_PROJECT_ID; // Force target ID

            // 🟢 COHERENCY INJECTION
            let finalFrontmatter = { ...data.frontmatter };
            let finalContent = crystallizeModal.node.content;

            if (crystallizeModal.node.coherency_report) {
                // 1. Inject Frontmatter Tag
                const existingTags = finalFrontmatter.tags || [];
                finalFrontmatter.tags = [...existingTags, 'INCONSISTENCY_WARNING'];

                // 2. Inject Markdown Header
                const report = crystallizeModal.node.coherency_report;
                const warningHeader = `> ⚠️ **[${report.warning}]:** ${report.explanation}\n> *Source Conflict: ${report.file_source}*\n\n`;
                finalContent = warningHeader + finalContent;
            }

            // 🟢 INJECT POSITION DATA
            // We pass fx/fy in frontmatter so the parser/backend can (optionally) use it
            // or so we can retrieve it later if we re-parse.
            if (crystallizeModal.node.fx !== undefined) {
                finalFrontmatter.nexus = {
                    ...(finalFrontmatter.nexus || {}),
                    fx: crystallizeModal.node.fx,
                    fy: crystallizeModal.node.fy
                };
            }

            // 🟢 INJECT PENDING RELATIONS
            if (crystallizeModal.node.metadata?.pending_relations) {
                finalFrontmatter.relations = crystallizeModal.node.metadata.pending_relations;
            }

            const result = await crystallizeNode({
                accessToken,
                folderId: targetFolderId, // 🟢 HARDWIRE
                fileName: data.fileName,
                content: finalContent,
                frontmatter: finalFrontmatter
            }) as any;

            const newFileId = result.data.fileId;
            const oldNode = crystallizeModal.node;

            if (newFileId && oldNode) {
                 console.log(`💎 TRANSMUTATION: Converting ${oldNode.id} -> ${newFileId}`);

                 // 🟢 PHASE 2: PERSISTENCE (THE ANCHOR)
                 // Write the new Canon Entity to Firestore immediately to prevent "Pop"
                 const auth = getAuth();
                 const db = getFirestore();

                 if (auth.currentUser) {
                     const entityRef = doc(db, "users", auth.currentUser.uid, "projects", targetFolderId, "entities", newFileId);

                     // Convert Pending Relations to Graph Relations
                     const migratedRelations = (oldNode.metadata?.pending_relations || []).map(r => ({
                         targetId: r.targetId, // NOTE: If target was also a temp ID, this might break. But for now, we assume target is stable or we rely on their eventual crystallization.
                         targetName: "Linked Entity", // Fallback
                         targetType: 'concept',
                         relation: r.relationType,
                         context: "Crystallized Link",
                         sourceFileId: newFileId
                     }));

                     await setDoc(entityRef, {
                         id: newFileId,
                         name: oldNode.title, // Use title as label
                         type: 'canon', // 🟢 FORCE TITANIUM
                         projectId: targetFolderId,
                         description: "Memoria cristalizada.",
                         fx: oldNode.fx || oldNode.x || 0,
                         fy: oldNode.fy || oldNode.y || 0,
                         relations: migratedRelations,
                         createdFromIdea: true,
                         lastUpdated: new Date().toISOString()
                     }, { merge: true });
                 }

                 // 🟢 PHASE 3: LINK REPAIR (THE SURGERY)
                 // Update ALL local nodes that were pointing to the old ID
                 setNodes(prev => {
                     // 1. Filter out the crystallized node
                     const remaining = prev.filter(n => n.id !== oldNode.id);

                     // 2. Map over remaining nodes to fix links
                     return remaining.map(n => {
                         if (n.metadata?.pending_relations) {
                             // Check if any relation points to the old ID
                             const needsRepair = n.metadata.pending_relations.some(r => r.targetId === oldNode.id);

                             if (needsRepair) {
                                 console.log(`🔧 Repairing links in node ${n.title}`);
                                 return {
                                     ...n,
                                     metadata: {
                                         ...n.metadata,
                                         pending_relations: n.metadata.pending_relations.map(r =>
                                             r.targetId === oldNode.id
                                             ? { ...r, targetId: newFileId } // SWAP ID
                                             : r
                                         )
                                     }
                                 };
                             }
                         }
                         return n;
                     });
                 });
            } else {
                // Fallback if no ID returned (should not happen)
                setNodes(prev => prev.filter(n => n.id !== crystallizeModal.node!.id));
            }

            setCrystallizeModal({ isOpen: false, node: null, isProcessing: false });
            setExpandedNodeId(null); // Close modal if open

        } catch (e) {
            console.error("Crystallization Failed", e);
            setCrystallizeModal(prev => ({ ...prev, isProcessing: false }));
        }
    };

    // SAFETY: Warn on exit if ideas exist
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (nodes.length > 0) {
                e.preventDefault();
                e.returnValue = ''; // Chrome requires this
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [nodes]);

    if (!isOpen) return null;

    // Helper for Canon Drawer Selection
    // We use unifiedNodes to find it, so we can display details even for merged entities
    const selectedCanonNode = selectedCanonId ? unifiedNodes.find(n => n.id === selectedCanonId) : null;

    return (
        <div
            className="relative w-full h-full bg-transparent overflow-hidden font-sans text-titanium-100 flex flex-col touch-none pointer-events-none"
        >
            {/* 🟢 LOADER OVERLAY */}
            <AnimatePresence>
                {loadingCanon && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-[100] bg-titanium-950 flex flex-col items-center justify-center gap-4"
                    >
                        <Loader2 className="animate-spin text-cyan-500" size={48} />
                        <span className="text-xs font-mono tracking-widest text-titanium-400">CONNECTING TO CANON VAULT...</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* LAYER 0: NEXUS GRAPH (The Living Background) */}
            {/* 🟢 INTERACTION GATE: Wrapper ensures clicks reach the graph despite parent pointer-events-none */}
            {/* 🟢 TACTICAL SOLUTION: UNIVERSAL LOCKDOWN & CINEMATIC DIM */}
            <div className={`absolute inset-0 z-0 transition-all duration-300 ease-in-out
                ${isOverlayActive
                    ? 'pointer-events-none opacity-30 blur-sm'
                    : 'pointer-events-auto touch-auto opacity-100 blur-0'
                }`}
            >
                <NexusGraph
                    projectId={EFFECTIVE_PROJECT_ID} // 🟢 HARDWIRE
                    accessToken={localStorage.getItem('google_drive_token')}
                    onClose={() => {}} // We don't close the background
                    nodes={unifiedNodes} // 🟢 UNIFIED PROP
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeDragEnd={handleNodeDragEnd}
                    onLinkCreate={handleLinkCreate}
                    onAutoFreeze={handleAutoFreeze} // 🟢 THE DROP
                />
            </div>

            {/* LAYER 0.5: CANON DRAWER (Lifted State) */}
            <div
                className={`absolute top-0 right-0 bottom-0 w-[400px] bg-titanium-950/95 border-l border-titanium-800 shadow-2xl transform transition-transform duration-300 ease-out z-50 flex flex-col
                    ${selectedCanonNode ? 'translate-x-0' : 'translate-x-full'}
                `}
            >
                {selectedCanonNode && (
                    <div className="flex flex-col h-full pointer-events-auto">
                        <div className="p-6 border-b border-titanium-800 bg-titanium-900/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border
                                    ${selectedCanonNode.type === 'character' ? 'text-cyan-400 border-cyan-900 bg-cyan-950/30' :
                                    selectedCanonNode.type === 'location' ? 'text-purple-400 border-purple-900 bg-purple-950/30' :
                                    selectedCanonNode.type === 'event' ? 'text-red-400 border-red-900 bg-red-950/30' :
                                    'text-amber-400 border-amber-900 bg-amber-950/30'}
                                `}>
                                    {selectedCanonNode.type}
                                </span>
                                <button onClick={() => setSelectedCanonId(null)} className="text-titanium-500 hover:text-white">
                                    <X size={18} />
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-white leading-tight">{selectedCanonNode.name}</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-titanium-500 uppercase">Descripción</h4>
                                <p className="text-titanium-300 text-sm leading-relaxed">
                                    {selectedCanonNode.description || "Sin descripción registrada en el Nexus."}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* LAYER 1: HUD HEADER (AGENT SELECTOR) */}
            {/* 🟢 ZEN MODE: HIDE WHEN EXPANDED */}
            <motion.div
                className="absolute top-8 left-1/2 -translate-x-1/2 ml-12 z-50 w-fit pointer-events-auto touch-auto"
                animate={{ opacity: expandedNodeId ? 0 : 1, y: expandedNodeId ? -20 : 0, pointerEvents: expandedNodeId ? 'none' : 'auto' }}
            >
                <div className="flex items-center gap-1 p-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-2xl pointer-events-auto">
                    {Object.values(AGENTS).map((agent) => (
                        <button
                            key={agent.id}
                            onClick={() => setActiveAgent(agent.id as AgentType)}
                            className="relative px-5 py-2 rounded-full flex items-center gap-2 transition-all duration-200 group"
                        >
                            {activeAgent === agent.id && (
                                <motion.div
                                    layoutId="activeAgentPill"
                                    className={`absolute inset-0 bg-${agent.color}-500/20 border border-${agent.color}-500/50 rounded-full`}
                                    initial={false}
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <agent.icon
                                size={14}
                                className={`relative z-10 transition-colors ${activeAgent === agent.id ? `text-${agent.color}-400` : 'text-titanium-500 group-hover:text-titanium-300'}`}
                            />
                            <span className={`relative z-10 text-xs font-bold tracking-widest transition-colors ${activeAgent === agent.id ? 'text-white' : 'text-titanium-500 group-hover:text-titanium-300'}`}
                            >
                                {agent.name}
                            </span>
                        </button>
                    ))}
                </div>

                <motion.div
                    key={activeAgent}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-2 text-center text-[10px] font-mono tracking-wider text-${activeAgentConfig.color}-400/80`}
                >
                    [{activeAgentConfig.desc}]
                </motion.div>
            </motion.div>

            {/* LAYER 1: NOTIFICATIONS (TOP RIGHT) */}
            <div className="absolute top-6 right-24 z-10 flex flex-col gap-2 w-80 pointer-events-none">
                <div className="flex justify-end mb-2">
                     <button onClick={onClose} className="pointer-events-auto p-2 hover:bg-white/10 rounded-full text-titanium-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <AnimatePresence>
                    {activeAlert && (
                        <motion.div
                            key="coherency-alert"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="bg-black/90 border-l-2 border-red-500 p-4 rounded backdrop-blur-md shadow-2xl pointer-events-auto"
                        >
                            <div className="flex items-start gap-3">
                                <TriangleAlert size={20} className="text-red-500 mt-1 shrink-0 animate-pulse" />
                                <div>
                                    <div className="text-xs font-bold text-red-400 tracking-widest mb-1">{activeAlert.warning.toUpperCase()}</div>
                                    <p className="text-[11px] font-serif text-titanium-200 leading-relaxed">
                                        {activeAlert.explanation}
                                    </p>
                                    <div className="mt-2 text-[10px] font-mono text-red-500/80">
                                        SOURCE: {activeAlert.file_source}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* LAYER 1: DYNAMIC NODES & EXPANSION OVERLAY (Only for Expanded Modal now) */}
            <AnimatePresence>
                {nodes.map(node => {
                   const agent = AGENTS[node.agentId];
                   const nodeType = node.metadata?.node_type || 'default';
                   const style = CONTENT_TYPES[nodeType] || CONTENT_TYPES['default'];

                   const isExpanded = expandedNodeId === node.id;

                   if (isExpanded) {
                       // 🟢 DATAPAD: EXPANDED MODE (Macro-Card)
                       return (
                           <React.Fragment key={node.id}>
                               {/* BACKDROP */}
                               <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="fixed inset-0 bg-black/80 z-[60] backdrop-blur-sm"
                                    onClick={() => setExpandedNodeId(null)}
                               />

                               {/* EXPANDED CARD */}
                               <motion.div
                                   layoutId={`node-${node.id}`}
                                   className={`fixed inset-0 m-auto w-[60vw] h-[80vh] bg-slate-900 border rounded-xl z-[100] overflow-hidden flex flex-col shadow-2xl touch-auto pointer-events-auto ${style.border}`}
                                   transition={{ type: "spring", bounce: 0.15, duration: 0.6 }}
                               >
                                    {/* Expanded Header */}
                                    <div className="flex items-center justify-between p-6 border-b border-white/10 bg-black/20 shrink-0">
                                        <div className={`flex items-center gap-3 ${style.text}`}>
                                            <Diamond size={16} className="rotate-45" />
                                            <span className="text-sm font-bold tracking-[0.2em] uppercase">{node.metadata?.node_type || node.type}</span>
                                        </div>
                                        <button
                                            onClick={() => setExpandedNodeId(null)}
                                            className="p-2 hover:bg-white/10 rounded-full text-titanium-400 hover:text-white transition-colors"
                                        >
                                            <X size={24} />
                                        </button>
                                    </div>

                                    {/* Expanded Content */}
                                    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
                                        <div className="max-w-4xl mx-auto">
                                            <h2 className="text-3xl font-bold text-white mb-6 font-serif">{node.title}</h2>
                                            <div className="prose prose-invert prose-lg max-w-none text-titanium-200 font-serif leading-loose whitespace-pre-wrap">
                                                <MarkdownRenderer content={node.content} mode="full" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Footer */}
                                    <div className="p-4 border-t border-white/10 bg-black/40 flex justify-between items-center shrink-0">
                                        <div className="flex items-center gap-3 opacity-50">
                                            <agent.icon size={16} className={`text-${agent.color}-400`} />
                                            <span className="text-xs font-mono text-titanium-400">GENERATED BY {agent.name}</span>
                                        </div>
                                        <button
                                            onClick={() => handleCrystallize(node)}
                                            className="flex items-center gap-2 px-6 py-3 bg-titanium-800 hover:bg-cyan-900/30 border border-titanium-700 hover:border-cyan-500/50 rounded-lg transition-all group"
                                        >
                                            <span className="text-xs font-bold text-titanium-300 group-hover:text-cyan-400 tracking-wider">💎 CRISTALIZAR MEMORIA</span>
                                        </button>
                                    </div>
                               </motion.div>
                           </React.Fragment>
                       );
                   }

                   // Note: Standard Micro-Card is now rendered by NexusGraph (Canvas)
                   return null;
                })}
            </AnimatePresence>

            {/* LAYER 2: INTERROGATION MODAL */}
            <InterrogationModal
                isOpen={interrogation.isOpen}
                questions={interrogation.questions}
                history={interrogation.history}
                depth={interrogation.depth}
                isThinking={isLoading}
                onSubmit={handleInterrogationSubmit}
                onCancel={() => setInterrogation(prev => ({ ...prev, isOpen: false }))}
            />

            {/* LAYER 2.5: CRYSTALLIZE MODAL */}
            <CrystallizeModal
                isOpen={crystallizeModal.isOpen}
                onClose={() => setCrystallizeModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmCrystallization}
                node={crystallizeModal.node}
                isProcessing={crystallizeModal.isProcessing}
            />

            {/* LAYER 3: COMMAND DECK (OPERATION MONOLITH) */}
            {/* 🟢 ZEN MODE: HIDE WHEN EXPANDED */}
            <motion.div
                className="absolute bottom-12 left-1/2 -translate-x-1/2 ml-12 z-50 flex flex-col gap-0 items-center w-[600px] pointer-events-auto touch-auto"
                animate={{ opacity: expandedNodeId ? 0 : 1, y: expandedNodeId ? 20 : 0, pointerEvents: expandedNodeId ? 'none' : 'auto' }}
            >
                {/* Row 1: The Input */}
                <input
                    type="text"
                    aria-label="Input de Comando del Motor Mundial"
                    disabled={isLoading}
                    placeholder={isLoading ? statusMessage : "Initialize simulation protocol..."}
                    className={`w-full bg-black/60 border border-titanium-500/50 rounded-t-xl rounded-b-none px-6 py-4 text-titanium-100 placeholder-titanium-600 backdrop-blur-md focus:outline-none focus:ring-1 ${activeAgentConfig.styles.focusRing} transition-all font-mono text-sm shadow-2xl z-10 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isLoading) {
                            const val = e.currentTarget.value.trim();
                            if (val) {
                                generateNode(val);
                                e.currentTarget.value = '';
                            }
                        }
                    }}
                />

                {/* Row 2: The Parameters ("The Chin") */}
                <div className="w-full bg-black/80 backdrop-blur-xl border border-titanium-500/50 border-t-0 rounded-t-none rounded-b-xl px-4 py-3 flex items-center justify-between gap-4 -mt-px shadow-2xl">
                    {/* Left: Chaos Slider (65%) */}
                    <div className="w-[65%]">
                        <ChaosSlider value={chaosLevel} onChange={setChaosLevel} />
                    </div>

                    {/* Right: Status & Toggle (35%) */}
                    <div className="w-[35%] flex items-center justify-end gap-4">
                        {/* Status Indicator */}
                        <div className="flex flex-col items-end">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full animate-pulse ${combatMode ? 'bg-red-500' : 'bg-green-500'}`} />
                                <span className="text-[10px] font-bold text-titanium-400">ONLINE</span>
                            </div>
                            <span className="text-[9px] font-mono text-titanium-600">LATENCY: 12ms</span>
                        </div>

                        {/* Combat Toggle */}
                        <CombatToggle value={combatMode} onChange={setCombatMode} />
                    </div>
                </div>
            </motion.div>

            {/* 🟢 UI: REC INDICATOR */}
            <div className="absolute bottom-8 right-8 z-10 flex items-center gap-2 opacity-50 pointer-events-none">
                 <Disc className="text-red-500 animate-pulse" size={12} />
                 <span className="text-[9px] font-mono text-red-500/80 tracking-widest">REC</span>
            </div>

        </div>
    );
};

export default WorldEnginePanel;
