import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';

// Types
type RealityMode = 'RIGOR' | 'FUSION' | 'ENTROPIA';

const MODES: { id: RealityMode; label: string }[] = [
    { id: 'RIGOR', label: 'RIGOR' },
    { id: 'FUSION', label: 'FUSIÓN' },
    { id: 'ENTROPIA', label: 'ENTROPÍA' },
];

interface CommandBarProps {
    onClearAll?: () => void;
    onCommit?: (text: string) => void;
}

export const CommandBar: React.FC<CommandBarProps> = ({ onClearAll, onCommit }) => {
    const [mode, setMode] = useState<RealityMode>('FUSION');
    const [focused, setFocused] = useState(false);
    const [input, setInput] = useState("");

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (input.trim() && onCommit) {
                onCommit(input);
                setInput("");
            }
        }
    };

    return (
        <div className="flex gap-4 items-end pointer-events-auto">

            {/* NUCLEAR BUTTON (Left Side) */}
            {onClearAll && (
                <button
                    onClick={onClearAll}
                    className="mb-2 p-3 rounded-full bg-red-950/20 border border-red-500/20 text-red-700 hover:bg-red-900/40 hover:text-red-400 hover:border-red-500/50 transition-all shadow-lg hover:shadow-red-900/20 group"
                    title="ELIMINAR TODO"
                >
                    <Trash2 size={20} className="group-hover:scale-110 transition-transform" />
                </button>
            )}

            <div className="flex flex-col items-center w-[600px] max-w-[80vw] filter drop-shadow-2xl">
                {/* COMPONENT A: INPUT */}
                <div className={`relative w-full transition-all duration-300 z-20 ${focused ? 'scale-[1.02]' : 'scale-100'}`}>
                    {/* Background */}
                    <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-xl rounded-t-xl border border-b-0 border-white/10" />

                    {/* Dynamic Glow based on Mode */}
                     <div className={`absolute inset-0 rounded-t-xl transition-all duration-500 opacity-0 ${focused ? 'opacity-100' : ''} ${
                         mode === 'RIGOR' ? 'shadow-[0_-10px_40px_-10px_rgba(56,189,248,0.3)]' :
                         mode === 'ENTROPIA' ? 'shadow-[0_-10px_40px_-10px_rgba(167,139,250,0.3)]' :
                         'shadow-[0_-10px_40px_-10px_rgba(255,255,255,0.1)]'
                     }`} />

                    <input
                        type="text"
                        aria-label="Comando para el motor"
                        placeholder="¿Qué quieres crear o consultar?"
                        className={`relative w-full bg-transparent px-6 py-4 text-lg font-light placeholder-slate-600 outline-none rounded-t-xl text-center font-mono transition-colors duration-300 ${
                            mode === 'RIGOR' ? 'text-sky-100 selection:bg-sky-500/30' :
                            mode === 'ENTROPIA' ? 'text-violet-100 selection:bg-violet-500/30' :
                            'text-slate-200 selection:bg-slate-500/30'
                        }`}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                </div>

                {/* COMPONENT B: REALITY SLIDER */}
                <div
                    className="relative w-full h-12 bg-[#0a0a0a] border border-t-0 border-white/10 rounded-b-xl flex items-center p-1 z-10"
                    role="radiogroup"
                    aria-label="Modo de Realidad"
                >

                    {/* Background Track (Clickable Areas) */}
                    <div className="absolute inset-1 grid grid-cols-3 z-20">
                        {MODES.map((m) => (
                            <div
                                key={m.id}
                                role="radio"
                                aria-checked={mode === m.id}
                                aria-label={`Modo ${m.label}`}
                                tabIndex={0}
                                onClick={() => setMode(m.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setMode(m.id);
                                    }
                                }}
                                className="flex items-center justify-center cursor-pointer group outline-none focus-visible:bg-white/5 rounded"
                            >
                                <span className={`text-[10px] font-bold tracking-[0.2em] transition-colors duration-300 ${
                                    mode === m.id
                                        ? (mode === 'RIGOR' ? 'text-sky-300' : mode === 'ENTROPIA' ? 'text-violet-300' : 'text-slate-200')
                                        : 'text-slate-700 group-hover:text-slate-500'
                                }`}>
                                    {m.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Sliding Knob (The Physical "Clack") */}
                    <motion.div
                        className="absolute top-1 bottom-1 w-[calc(33.33%-6px)] rounded-lg border border-white/5 z-10 overflow-hidden"
                        animate={{
                            left: mode === 'RIGOR' ? '4px' : mode === 'FUSION' ? 'calc(33.33% + 2px)' : 'calc(66.66% + 0px)',
                        }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                        {/* Inner Glass/Gradient */}
                        <div className={`w-full h-full backdrop-blur-md transition-colors duration-500 ${
                             mode === 'RIGOR' ? 'bg-sky-900/20 shadow-[inset_0_0_10px_rgba(56,189,248,0.2)]' :
                             mode === 'FUSION' ? 'bg-slate-800/40 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]' :
                             mode === 'ENTROPIA' ? 'bg-violet-900/20 shadow-[inset_0_0_10px_rgba(139,92,246,0.2)]' : ''
                        }`} />

                        {/* Bottom Indicator Bar */}
                        <div className={`absolute bottom-0 left-1/4 right-1/4 h-[2px] rounded-t-full transition-colors duration-300 ${
                             mode === 'RIGOR' ? 'bg-sky-500' :
                             mode === 'FUSION' ? 'bg-slate-500' :
                             mode === 'ENTROPIA' ? 'bg-violet-500' : ''
                        }`} />
                    </motion.div>

                </div>
            </div>

            {/* PLACEHOLDER RIGHT (Balance) */}
             <div className="w-[50px]" />
        </div>
    );
};
