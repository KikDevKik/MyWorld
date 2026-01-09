import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    LayoutTemplate,
    Sparkles,
    TriangleAlert,
    X,
    Zap,
    Disc,
    Diamond
} from 'lucide-react';
import { GemId } from '../types';
import { useProjectConfig } from '../components/ProjectConfigContext';
import InterrogationModal from './InterrogationModal';
import CrystallizeModal from './CrystallizeModal';

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
    x?: number; // Position X (percentage)
    y?: number; // Position Y (percentage)
    metadata?: {
        suggested_filename?: string;
        suggested_folder_category?: string;
        node_type?: string;
        related_node_ids?: string[];
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

    return (
        <div className="flex items-center gap-4 select-none w-full">
            <span className="text-xs font-bold text-titanium-400 tracking-widest min-w-[50px]">RIGOR</span>

            <div
                ref={trackRef}
                className="relative flex-1 h-4 bg-slate-800 rounded-full cursor-pointer touch-none group border border-slate-700 overflow-hidden"
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

            // STANDARD NODE (SUCCESS)
            const newNode: Node = {
                id: Date.now().toString(),
                type: data.type || 'idea',
                title: data.title || 'Unknown',
                content: data.content || 'No content received.',
                agentId: activeAgent,
                x: Math.random() * 60 + 20,
                y: Math.random() * 60 + 20,
                metadata: data.metadata
            };
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

            await crystallizeNode({
                accessToken,
                folderId: data.folderId,
                fileName: data.fileName,
                content: finalContent,
                frontmatter: finalFrontmatter
            });

            // Success Animation or Notification here
            // Removing node from canvas after crystallization? Or keep it? keeping it for now.

            setCrystallizeModal({ isOpen: false, node: null, isProcessing: false });

        } catch (e) {
            console.error("Crystallization Failed", e);
            setCrystallizeModal(prev => ({ ...prev, isProcessing: false }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="relative w-full h-full bg-titanium-950 overflow-hidden font-sans text-titanium-100 flex flex-col">

            {/* LAYER 0: INFINITE GRID */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div
                    className="absolute inset-0 opacity-20 transition-all duration-700"
                    style={{
                        backgroundImage: `radial-gradient(${combatMode ? '#7f1d1d' : '#334155'} 1px, transparent 1px)`,
                        backgroundSize: '24px 24px'
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-titanium-950 via-transparent to-titanium-950 opacity-80" />
            </div>

            {/* LAYER 0.5: SVG CONNECTIONS */}
            <svg className="absolute inset-0 w-full h-full z-0 pointer-events-none overflow-visible">
                {nodes.map((node) => {
                    if (!node.metadata?.related_node_ids) return null;

                    return node.metadata.related_node_ids.map((relId, idx) => {
                        // Try to find target by ID or Title (fuzzy match for AI suggestions)
                        const target = nodes.find(n => n.id === relId || n.title.toLowerCase() === relId.toLowerCase());

                        if (!target || !node.x || !node.y || !target.x || !target.y) return null;

                        // Center offsets (Cards are roughly 18rem wide => ~12-15% of screen width)
                        const x1 = node.x + 8;
                        const y1 = node.y + 10;
                        const x2 = target.x + 8;
                        const y2 = target.y + 10;

                        // Determine style based on node type
                        const isConflict = node.metadata?.node_type === 'conflict' || target.metadata?.node_type === 'conflict';

                        return (
                            <line
                                key={`${node.id}-${target.id}-${idx}`}
                                x1={`${x1}%`}
                                y1={`${y1}%`}
                                x2={`${x2}%`}
                                y2={`${y2}%`}
                                stroke={isConflict ? "#ef4444" : "#94a3b8"}
                                strokeWidth="2"
                                strokeDasharray={isConflict ? "5,5" : "none"}
                                opacity="0.3"
                            />
                        );
                    });
                })}
            </svg>


            {/* LAYER 1: HUD HEADER (AGENT SELECTOR) */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 ml-12 z-50 w-fit">
                <div className="flex items-center gap-1 p-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
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
                            <span className={`relative z-10 text-xs font-bold tracking-widest transition-colors ${activeAgent === agent.id ? 'text-white' : 'text-titanium-500 group-hover:text-titanium-300'}`}>
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
            </div>

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

            {/* LAYER 1: DYNAMIC NODES */}
            <AnimatePresence>
                {nodes.map(node => {
                   const agent = AGENTS[node.agentId];
                   const nodeType = node.metadata?.node_type || 'default';
                   const style = CONTENT_TYPES[nodeType] || CONTENT_TYPES['default'];

                   return (
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.5 }}
                        className={`absolute w-72 p-0 bg-black/80 border rounded-lg backdrop-blur-sm z-0 ${style.border} ${style.shadow}`}
                        style={{
                            top: `${node.y}%`,
                            left: `${node.x}%`
                        }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-3 border-b border-white/10">
                            <div className={`flex items-center gap-2 ${style.text}`}>
                                <Diamond size={12} className="rotate-45" />
                                <span className="text-[10px] font-bold tracking-widest uppercase">{node.metadata?.node_type || node.type}</span>
                            </div>
                            <div className="opacity-50">
                                <agent.icon size={12} className={`text-${agent.color}-400`} />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4">
                             <div className="text-sm font-bold text-white mb-2">{node.title}</div>
                             <p className="text-xs text-titanium-300 font-serif leading-relaxed line-clamp-6">{node.content}</p>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-2 border-t border-white/10 bg-black/40 flex justify-end">
                            <button
                                onClick={() => handleCrystallize(node)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded hover:bg-white/10 transition-colors group"
                            >
                                <span className="text-[10px] font-bold text-titanium-400 group-hover:text-cyan-400 transition-colors">💎 CRISTALIZAR</span>
                            </button>
                        </div>

                    </motion.div>
                   );
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
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 ml-12 z-50 flex flex-col gap-0 items-center w-[600px]">
                {/* Row 1: The Input */}
                <input
                    type="text"
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
            </div>

            {/* 🟢 UI: REC INDICATOR */}
            <div className="absolute bottom-8 right-8 z-10 flex items-center gap-2 opacity-50 pointer-events-none">
                 <Disc className="text-red-500 animate-pulse" size={12} />
                 <span className="text-[9px] font-mono text-red-500/80 tracking-widest">REC</span>
            </div>

        </div>
    );
};

export default WorldEnginePanel;
