import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    LayoutTemplate,
    Sparkles,
    TriangleAlert,
    X,
    Zap,
    Activity
} from 'lucide-react';
import { GemId } from '../types';
import { useProjectConfig } from '../components/ProjectConfigContext';

interface WorldEnginePanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeGemId: GemId | null;
}

type AgentType = 'architect' | 'oracle' | 'advocate';

interface Node {
    id: string;
    type: string;
    title: string;
    content: string;
    agentId: AgentType;
    x?: number; // Position X (percentage)
    y?: number; // Position Y (percentage)
}

const AGENTS = {
    architect: {
        id: 'architect',
        name: 'EL ARQUITECTO',
        role: 'ESTRUCTURA',
        icon: LayoutTemplate,
        color: 'cyan',
        colorHex: '#06b6d4', // cyan-500
        desc: 'Diseño lógico y coherencia estructural.',
        styles: {
            border: 'border-cyan-500/30',
            text: 'text-cyan-400',
            shadow: 'shadow-[0_0_30px_rgba(6,182,212,0.1)]',
            focusRing: 'focus:border-cyan-500 focus:ring-cyan-500'
        }
    },
    oracle: {
        id: 'oracle',
        name: 'EL ORÁCULO',
        role: 'CAOS',
        icon: Sparkles,
        color: 'purple',
        colorHex: '#a855f7', // purple-500
        desc: 'Creatividad desenfrenada y alucinación controlada.',
        styles: {
            border: 'border-purple-500/30',
            text: 'text-purple-400',
            shadow: 'shadow-[0_0_30px_rgba(168,85,247,0.1)]',
            focusRing: 'focus:border-purple-500 focus:ring-purple-500'
        }
    },
    advocate: {
        id: 'advocate',
        name: 'ABOGADO DEL DIABLO',
        role: 'CRÍTICA',
        icon: TriangleAlert,
        color: 'red',
        colorHex: '#ef4444', // red-500
        desc: 'Detección de riesgos y agujeros de guion.',
        styles: {
            border: 'border-red-500/30',
            text: 'text-red-400',
            shadow: 'shadow-[0_0_30px_rgba(239,68,68,0.1)]',
            focusRing: 'focus:border-red-500 focus:ring-red-500'
        }
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
                {/* Dynamic Gradient Bar */}
                <div
                    className={`absolute top-0 left-0 bottom-0 bg-gradient-to-r ${getChaosColor(value)} transition-all duration-100 ease-out`}
                    style={{ width: `${value * 100}%` }}
                />

                {/* Vertical Pill Thumb */}
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-3 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10"
                    style={{ left: `calc(${value * 100}% - 6px)` }}
                    animate={{ scale: isDragging ? 1.2 : 1 }}
                    whileHover={{ scale: 1.2 }}
                />

                 {/* Value Readout Overlay */}
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

    // CONTEXT
    const { config } = useProjectConfig();

    // MOCK NOTIFICATIONS
    const [notifications] = useState([
        { id: 1, type: 'alert', text: 'ANOMALY DETECTED: Timeline Divergence' }
    ]);

    const activeAgentConfig = AGENTS[activeAgent];

    // --- HARVESTER (FRONTEND LOGIC) ---
    const harvestWorldContext = async (): Promise<{ canon_dump: string; timeline_dump: string }> => {
        if (!config) return { canon_dump: "", timeline_dump: "" };

        const functions = getFunctions();
        const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
        const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');

        let canonText = "";
        let timelineText = "";

        // HELPER: Fetch content from a list of files
        const fetchContent = async (fileList: any[]): Promise<string> => {
            let combined = "";
            for (const file of fileList) {
                if (file.mimeType === 'application/vnd.google-apps.folder') continue;

                try {
                    // Get Access Token (assuming it's stored in localStorage as per memory)
                    const token = localStorage.getItem('google_drive_token');
                    if (!token) continue;

                    const res = await getDriveFileContent({ fileId: file.id, accessToken: token }) as any;
                    combined += `\n\n--- FILE: ${file.name} ---\n${res.data.content}`;
                } catch (e) {
                    console.warn(`Failed to read ${file.name}`, e);
                }
            }
            return combined;
        };

        // 1. HARVEST CANON
        if (config.canonPaths && config.canonPaths.length > 0) {
            setStatusMessage("ALIGNING WITH CANON PROTOCOLS...");
            const token = localStorage.getItem('google_drive_token');
            if (token) {
                try {
                     // Get File List
                     const folderIds = config.canonPaths.map(p => p.id);
                     const res = await getDriveFiles({ folderIds, accessToken: token, recursive: true }) as any;
                     const files = res.data.filter((f: any) => f.name.endsWith('.md') || f.name.endsWith('.txt'));

                     // Get Content
                     canonText = await fetchContent(files);
                } catch (e) {
                    console.error("Canon Harvest Failed", e);
                }
            }
        }

        // 2. HARVEST TIMELINE
        if (config.chronologyPath) {
             setStatusMessage("SYNCHRONIZING TIMELINE EVENTS...");
             const token = localStorage.getItem('google_drive_token');
             if (token) {
                 try {
                     const res = await getDriveFiles({ folderId: config.chronologyPath.id, accessToken: token, recursive: true }) as any;
                     const files = res.data.filter((f: any) => f.name.endsWith('.md') || f.name.endsWith('.txt'));
                     timelineText = await fetchContent(files);
                 } catch (e) {
                     console.error("Timeline Harvest Failed", e);
                 }
             }
        }

        return { canon_dump: canonText, timeline_dump: timelineText };
    };

    // --- NEURAL LINK (BACKEND CONNECTION) ---
    const generateNode = async (prompt: string) => {
        setIsLoading(true);
        setStatusMessage("INITIALIZING HARVESTER...");

        const functions = getFunctions();
        const worldEngine = httpsCallable(functions, 'worldEngine', { timeout: 1800000 }); // 30 Minutes

        // MAP AGENT ID
        let backendAgentId = 'ARCHITECT';
        if (activeAgent === 'oracle') backendAgentId = 'ORACLE';
        if (activeAgent === 'advocate') backendAgentId = 'DEVIL_ADVOCATE';

        try {
            // STEP 1: DEEP HARVEST
            const contextPayload = await harvestWorldContext();

            setStatusMessage("DEEP REASONING IN PROGRESS... DO NOT REFRESH.");

            const payload = {
                prompt,
                agentId: backendAgentId,
                chaosLevel,
                combatMode,
                context: contextPayload
            };

            const result = await worldEngine(payload) as any;
            const data = result.data;

            // CREATE DYNAMIC NODE
            const newNode: Node = {
                id: Date.now().toString(),
                type: data.type || 'idea',
                title: data.title || 'Unknown',
                content: data.content || 'No content received.',
                agentId: activeAgent,
                x: Math.random() * 60 + 20, // Random pos 20-80%
                y: Math.random() * 60 + 20
            };

            setNodes(prev => [...prev, newNode]);

        } catch (error) {
            console.error("NEURAL LINK FAILURE:", error);
            // Optionally add error notification here
        } finally {
            setIsLoading(false);
            setStatusMessage("ESTABLISHING NEURAL LINK...");
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

                {/* Agent Description (Subtext) */}
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
            <div className="absolute top-6 right-24 z-10 flex flex-col gap-2 w-72 pointer-events-none">
                <div className="flex justify-end mb-2">
                     <button onClick={onClose} className="pointer-events-auto p-2 hover:bg-white/10 rounded-full text-titanium-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>
                <AnimatePresence>
                    {notifications.map(notif => (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="bg-black/80 border-l-2 border-red-500 p-3 rounded backdrop-blur-sm shadow-lg pointer-events-auto"
                        >
                            <div className="flex items-start gap-3">
                                <TriangleAlert size={16} className="text-red-500 mt-0.5 shrink-0" />
                                <div>
                                    <div className="text-xs font-bold text-red-200">SYSTEM ALERT</div>
                                    <span className="text-[10px] font-mono text-titanium-400">{notif.text}</span>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* LAYER 1: DYNAMIC NODES */}
            <AnimatePresence>
                {nodes.map(node => {
                   const agent = AGENTS[node.agentId];
                   return (
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.5 }}
                        className={`absolute w-64 p-4 bg-black/60 border rounded-lg backdrop-blur-sm z-0 ${agent.styles.border} ${agent.styles.shadow}`}
                        style={{
                            top: `${node.y}%`,
                            left: `${node.x}%`
                        }}
                    >
                        <div className={`flex items-center gap-2 mb-2 ${agent.styles.text}`}>
                            <agent.icon size={14} />
                            <span className="text-xs font-bold tracking-widest uppercase">{node.type}</span>
                        </div>
                        <div className="text-xs font-bold text-white mb-1">{node.title}</div>
                        <p className="text-sm text-titanium-300 font-serif leading-relaxed">{node.content}</p>
                    </motion.div>
                   );
                })}
            </AnimatePresence>

            {/* LAYER 2: COMMAND DECK (OPERATION MONOLITH) */}
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

        </div>
    );
};

export default WorldEnginePanel;
