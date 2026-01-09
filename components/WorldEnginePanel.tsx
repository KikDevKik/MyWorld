import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutTemplate,
    Sparkles,
    TriangleAlert,
    X,
    Zap,
    Activity
} from 'lucide-react';
import { GemId } from '../types';

interface WorldEnginePanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeGemId: GemId | null;
}

type AgentType = 'architect' | 'oracle' | 'advocate';

const AGENTS = {
    architect: {
        id: 'architect',
        name: 'EL ARQUITECTO',
        role: 'ESTRUCTURA',
        icon: LayoutTemplate,
        color: 'cyan',
        colorHex: '#06b6d4', // cyan-500
        desc: 'Diseño lógico y coherencia estructural.'
    },
    oracle: {
        id: 'oracle',
        name: 'EL ORÁCULO',
        role: 'CAOS',
        icon: Sparkles,
        color: 'purple',
        colorHex: '#a855f7', // purple-500
        desc: 'Creatividad desenfrenada y alucinación controlada.'
    },
    advocate: {
        id: 'advocate',
        name: 'ABOGADO DEL DIABLO',
        role: 'CRÍTICA',
        icon: TriangleAlert,
        color: 'red',
        colorHex: '#ef4444', // red-500
        desc: 'Detección de riesgos y agujeros de guion.'
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

    // MOCK NOTIFICATIONS
    const [notifications] = useState([
        { id: 1, type: 'alert', text: 'ANOMALY DETECTED: Timeline Divergence' }
    ]);

    const activeAgentConfig = AGENTS[activeAgent];

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
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50">
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
            <div className="absolute top-6 right-6 z-10 flex flex-col gap-2 w-72 pointer-events-none">
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

            {/* LAYER 1: GHOST NODES */}
            <AnimatePresence>
                {/* Node A: The Architect */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="absolute top-[20%] left-[15%] w-64 p-4 bg-black/60 border border-cyan-500/30 rounded-lg backdrop-blur-sm shadow-[0_0_30px_rgba(6,182,212,0.1)] z-0"
                >
                    <div className="flex items-center gap-2 mb-2 text-cyan-400">
                        <LayoutTemplate size={14} />
                        <span className="text-xs font-bold tracking-widest">STRUCTURE IDEA</span>
                    </div>
                    <p className="text-sm text-titanium-300 font-serif leading-relaxed">Three-Act Setup</p>
                </motion.div>

                {/* Node B: The Oracle */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="absolute top-[60%] right-[20%] w-64 p-4 bg-black/60 border border-purple-500/30 rounded-lg backdrop-blur-sm shadow-[0_0_30px_rgba(168,85,247,0.1)] z-0"
                >
                    <div className="flex items-center gap-2 mb-2 text-purple-400">
                        <Sparkles size={14} />
                        <span className="text-xs font-bold tracking-widest">CHAOS SPARK</span>
                    </div>
                    <p className="text-sm text-titanium-300 font-serif leading-relaxed">Dragon made of glass</p>
                </motion.div>
            </AnimatePresence>

            {/* LAYER 2: COMMAND DECK (OPERATION MONOLITH) */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex flex-col w-[600px]">
                {/* Row 1: The Input */}
                <input
                    type="text"
                    placeholder="Initialize simulation protocol..."
                    className="w-full bg-black/60 border border-titanium-500/50 rounded-t-xl rounded-b-sm px-6 py-4 text-titanium-100 placeholder-titanium-600 backdrop-blur-md focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-mono text-sm shadow-2xl z-10"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            console.log('INPUT NEXUS COMMAND:', e.currentTarget.value);
                            e.currentTarget.value = '';
                        }
                    }}
                />

                {/* Row 2: The Parameters ("The Chin") */}
                <div className="w-full bg-black/80 backdrop-blur-xl border border-titanium-500/50 border-t-0 rounded-b-xl px-4 py-3 flex items-center justify-between gap-4 -mt-px shadow-2xl">
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
