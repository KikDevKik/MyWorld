import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, updateDoc, collection, onSnapshot, query } from 'firebase/firestore';
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
import { GraphNode } from '../types/graph';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import InterrogationModal from './ui/InterrogationModal';
import CrystallizeModal from './ui/CrystallizeModal';
import MarkdownRenderer from './ui/MarkdownRenderer';
import NexusGraph from './forge/NexusGraph';

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
    const [canonNodes, setCanonNodes] = useState<GraphNode[]>([]);
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

    // 🟢 PHASE 4.3: SESSION STATE
    const [sessionId] = useState(() => `sess_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`);
    const [sessionHistory, setSessionHistory] = useState<SessionItem[]>([]);

    // CONTEXT
    const { config } = useProjectConfig();

    const activeAgentConfig = AGENTS[activeAgent];

    // 🟢 COHERENCY MONITOR
    const latestNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;
    const activeAlert = latestNode?.coherency_report;

    // --- 0. DATA SUBSCRIPTION (LIFTED STATE) ---
    useEffect(() => {
        if (!isOpen) return;

        const folderId = config?.folderId || config?.characterVaultId;
        const auth = getAuth();

        if (!folderId || !auth.currentUser) {
            setLoadingCanon(false);
            return;
        }

        setLoadingCanon(true);
        const db = getFirestore();
        const entitiesRef = collection(db, "users", auth.currentUser.uid, "projects", folderId, "entities");

        const unsubscribe = onSnapshot(query(entitiesRef), (snapshot) => {
            const loadedEntities: GraphNode[] = [];
            snapshot.forEach((doc) => {
                loadedEntities.push(doc.data() as GraphNode);
            });
            setCanonNodes(loadedEntities);
            setLoadingCanon(false);
        }, (error) => {
            console.error("Failed to subscribe to Canon:", error);
            setLoadingCanon(false);
        });

        return () => unsubscribe();
    }, [isOpen, config?.folderId, config?.characterVaultId]);

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
                interrogationDepth: currentDepth,
                clarifications: clarificationsText,
                sessionId,
                sessionHistory: recentHistory,
                accessToken,
                folderId: config?.folderId
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

            // STANDARD NODE (SUCCESS)
            // Note: New nodes start without position (NexusGraph will assign center/force)
            const newNode: Node = {
                id: Date.now().toString(),
                type: data.type || 'idea',
                title: data.title || 'Unknown',
                content: data.content || 'No content received.',
                agentId: activeAgent,
                metadata: data.metadata,
                coherency_report: data.coherency_report || undefined // 👈 Fixed Mapping with Safety Gate
            };

            // 🟢 IRON GUARDIAN DEBUGGING
            console.log("FINAL NODE OBJECT:", newNode);

            setNodes(prev => [...prev, newNode]);
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
            // Find the node in canonNodes
            const canonNode = canonNodes.find(n => n.id === nodeId);
            if (canonNode) {
                setSelectedCanonId(nodeId);
                setExpandedNodeId(null);
            }
        }
    };

    // 3. PERSISTENCE (Drag End)
    const handleNodeDragEnd = async (node: any) => {
        if (node.isLocal) {
            // Update local state so it doesn't snap back
            setNodes(prev => prev.map(n =>
                n.id === node.id
                ? { ...n, fx: node.x, fy: node.y, x: node.x, y: node.y }
                : n
            ));
        } else {
            // Update Firestore for Canon Nodes
            if (!config?.folderId) return;

            const entityId = node.id;
            try {
                const auth = getAuth();
                const db = getFirestore();

                if (auth.currentUser) {
                    const entityRef = doc(db, "users", auth.currentUser.uid, "projects", config.folderId, "entities", entityId);
                    await updateDoc(entityRef, {
                        fx: node.x,
                        fy: node.y
                    });
                    console.log(`Saved position for ${node.name}: ${node.x}, ${node.y}`);
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
            // Source is Canon. Target might be anything.
            // If Source is Canon, we should ideally write to Firestore immediately as per prompt.
            // But we need to check if Target is Idea.
            const targetIsIdea = nodes.find(n => n.id === targetId);

            if (targetIsIdea) {
                alert("Cannot link Canon Source to Temporary Idea yet. Please crystallize the Idea first.");
            } else {
                // Canon -> Canon
                // TODO: Implement immediate Firestore write for relationships
                alert("Canon-to-Canon linking not yet implemented in this phase.");
            }
        }
    };

    // 🟢 UNIFIED NODE BUILDER
    const unifiedNodes = useMemo(() => {
        // 1. Map Local Ideas to GraphNode format
        const mappedIdeas: GraphNode[] = nodes.map(n => ({
            id: n.id,
            name: n.title,
            type: 'idea', // Ensure it's typed as idea
            projectId: config?.folderId || '',
            fx: n.fx,
            fy: n.fy,
            // Carry metadata in a way NexusGraph understands (it checks .type for color/shape)
            meta: { brief: n.content.substring(0, 50) },
            agentId: n.agentId // Custom field we added to GraphNode/entityData handling in Nexus
        } as any)); // Force cast if strict typing complains about extra props, but GraphNode allows extras? Check Nexus usage.

        return [...canonNodes, ...mappedIdeas];
    }, [canonNodes, nodes, config]);

    // 🟢 TELEMETRY (SANITY CHECK)
    useEffect(() => {
        if (isOpen) {
            console.log(`[Nexus Fusion] Total Render: ${unifiedNodes.length} | Canon (DB): ${canonNodes.length} | Ideas (RAM): ${nodes.length}`);
        }
    }, [unifiedNodes.length, canonNodes.length, nodes.length, isOpen]);

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
                folderId: data.folderId,
                fileName: data.fileName,
                content: finalContent,
                frontmatter: finalFrontmatter
            }) as any;

            // Note: The backend creates the file. The listener in NexusGraph updates the graph.
            // However, we need to ensure the position persists.
            // If the backend doesn't write to Firestore 'entities' with fx/fy immediately,
            // the new node will pop to 0,0.
            // We might need to manually update the entity position once it appears?
            // Or assume the backend handles 'nexus' frontmatter to entity mapping.
            // (Assuming backend handles it for now, else we'd need a post-hook).

            // Remove from local nodes (Transmutation)
            setNodes(prev => prev.filter(n => n.id !== crystallizeModal.node!.id));

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
    const selectedCanonNode = selectedCanonId ? canonNodes.find(n => n.id === selectedCanonId) : null;

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
            <div className="absolute inset-0 z-0 pointer-events-auto touch-auto">
                <NexusGraph
                    projectId={config?.folderId || ''}
                    accessToken={localStorage.getItem('google_drive_token')}
                    onClose={() => {}} // We don't close the background
                    nodes={unifiedNodes} // 🟢 UNIFIED PROP
                    onNodeClick={handleNodeClick}
                    onNodeDoubleClick={handleNodeDoubleClick}
                    onNodeDragEnd={handleNodeDragEnd}
                    onLinkCreate={handleLinkCreate}
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
