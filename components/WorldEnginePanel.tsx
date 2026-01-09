import React, { useState, useRef, useEffect } from 'react';
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
        <div className="space-y-2 select-none">
            <div className="flex justify-between text-xs font-bold text-titanium-400">
                <span className="tracking-widest">RIGOR</span>
                <span className="font-mono text-white">{value.toFixed(2)}</span>
                <span className="tracking-widest">ENTROPÍA</span>
            </div>

            <div
                ref={trackRef}
                className="relative h-6 bg-slate-800 rounded-lg cursor-pointer touch-none group border border-slate-700 overflow-hidden"
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
                    className="absolute top-1 bottom-1 w-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] z-10"
                    style={{ left: `calc(${value * 100}% - 4px)` }}
                    animate={{ scale: isDragging ? 1.1 : 1 }}
                    whileHover={{ scale: 1.1, boxShadow: "0 0 15px rgba(255,255,255,1)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />

                {/* Grid Lines Overlay */}
                <div className="absolute inset-0 opacity-20 pointer-events-none flex justify-between px-1">
                    {[...Array(9)].map((_, i) => (
                        <div key={i} className="w-[1px] h-full bg-slate-500" />
                    ))}
                </div>
            </div>
        </div>
    );
};

const CombatToggle: React.FC<{ value: boolean; onChange: (val: boolean) => void }> = ({ value, onChange }) => {
    return (
        <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-2">
                <Zap size={16} className={value ? 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'text-titanium-500'} />
                <span className={`text-sm font-bold transition-colors ${value ? 'text-red-100' : 'text-titanium-300'}`}>
                    PROTOCOLO DE CONFLICTO
                </span>
            </div>

            <button
                onClick={() => onChange(!value)}
                className={`relative w-12 h-6 rounded-full transition-all duration-300 border ${
                    value
                        ? 'bg-red-600 border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.6)]'
                        : 'bg-slate-700 border-slate-600'
                }`}
            >
                <motion.div
                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                    animate={{ left: value ? '28px' : '4px' }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
            </button>
        </div>
    );
};

const WorldEnginePanel: React.FC<WorldEnginePanelProps> = ({
    isOpen,
    onClose,
    activeGemId
}) => {
    // UI STATE
    const [activeAgent, setActiveAgent] = useState<AgentType>('architect');
    const [chaosLevel, setChaosLevel] = useState<number>(0.3); // Default 0.3
    const [combatMode, setCombatMode] = useState<boolean>(false);

    // MOCK NOTIFICATIONS
    const [notifications] = useState([
        { id: 1, type: 'alert', text: 'ANOMALY DETECTED: Timeline Divergence' }
    ]);

    const activeAgentConfig = AGENTS[activeAgent];

    if (!isOpen) return null;

    return (
        <div className="fixed top-0 bottom-0 right-16 w-[600px] bg-titanium-950 border-l border-titanium-700 flex flex-col shadow-2xl z-40 overflow-hidden font-sans text-titanium-100">

            {/* --- HEADER --- */}
            <div className="p-4 border-b border-titanium-800 flex items-center justify-between bg-titanium-900/50 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <Activity className={`text-${activeAgentConfig.color}-500 animate-pulse`} size={20} />
                    <span className="font-bold tracking-widest text-sm text-titanium-200">
                        PERFORADOR DE MUNDOS <span className="text-titanium-500">// V3.0</span>
                    </span>
                </div>
                <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* --- TRINITY SWITCH (AGENT SELECTOR) --- */}
            <div className="p-6 pb-2">
                <div className="flex bg-titanium-900/50 p-1 rounded-xl border border-titanium-800 relative">
                    {/* Animated Background Highlight */}
                    <motion.div
                        layoutId="activeAgentHighlight"
                        className={`absolute inset-y-1 rounded-lg bg-${activeAgentConfig.color}-500/10 border border-${activeAgentConfig.color}-500/30`}
                        initial={false}
                        animate={{
                            left: activeAgent === 'architect' ? '4px' : activeAgent === 'oracle' ? '33.33%' : '66.66%',
                            width: '32.5%', // Approx 1/3 minus padding
                            x: activeAgent === 'architect' ? 0 : activeAgent === 'oracle' ? 4 : 8
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />

                    {Object.values(AGENTS).map((agent) => (
                        <button
                            key={agent.id}
                            onClick={() => setActiveAgent(agent.id as AgentType)}
                            className={`flex-1 flex flex-col items-center justify-center py-3 px-2 z-10 transition-colors duration-200 group relative ${
                                activeAgent === agent.id ? 'text-white' : 'text-titanium-500 hover:text-titanium-300'
                            }`}
                        >
                            <agent.icon
                                size={20}
                                className={`mb-1 transition-transform group-hover:scale-110 ${activeAgent === agent.id ? `text-${agent.color}-400` : ''}`}
                            />
                            <span className="text-[10px] font-bold tracking-wider">{agent.role}</span>
                        </button>
                    ))}
                </div>

                {/* Agent Description */}
                <motion.div
                    key={activeAgent}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-3 text-xs text-center text-${activeAgentConfig.color}-400/80 font-mono`}
                >
                    [{activeAgentConfig.desc}]
                </motion.div>
            </div>

            {/* --- NODE CANVAS (MAIN STAGE) --- */}
            <div className={`flex-1 relative bg-titanium-950 overflow-hidden m-4 border rounded-lg transition-all duration-500 ${
                combatMode
                    ? 'border-red-900/30 shadow-[inset_0_0_20px_rgba(220,38,38,0.2)]'
                    : 'border-titanium-800'
            }`}>
                {/* Grid Background */}
                <div className="absolute inset-0 opacity-10"
                     style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                </div>

                {/* Empty State / System Status */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <motion.div
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 3, repeat: Infinity }}
                        className={`font-mono text-sm tracking-[0.2em] transition-colors duration-300 ${
                            combatMode ? 'text-red-500' : `text-${activeAgentConfig.color}-500`
                        }`}
                    >
                        {combatMode ? 'PROTOCOL ENGAGED' : 'SYSTEM ONLINE'}
                    </motion.div>
                    <div className="text-titanium-600 text-xs mt-2">WAITING FOR INPUT...</div>
                </div>

                {/* Auditor HUD (Notifications) */}
                <div className="absolute top-4 right-4 flex flex-col gap-2 w-64 pointer-events-none">
                    <AnimatePresence>
                        {notifications.map(notif => (
                            <motion.div
                                key={notif.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="bg-titanium-900/90 border-l-2 border-red-500 p-3 rounded shadow-lg backdrop-blur-sm"
                            >
                                <div className="flex items-start gap-2">
                                    <TriangleAlert size={14} className="text-red-500 mt-0.5" />
                                    <span className="text-xs font-mono text-red-200">{notif.text}</span>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>

            {/* --- SYNTHESIZER (CONTROL PANEL) --- */}
            <div className="p-6 bg-titanium-900 border-t border-titanium-800 space-y-6 relative z-10">
                <ChaosSlider value={chaosLevel} onChange={setChaosLevel} />
                <CombatToggle value={combatMode} onChange={setCombatMode} />
            </div>
        </div>
    );
};

export default WorldEnginePanel;
