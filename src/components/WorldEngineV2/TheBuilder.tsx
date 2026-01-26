import React, { useState, useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { X, Send } from 'lucide-react';
import GhostGraph from './GhostGraph';
import { VisualNode } from './types';

// DUMMY DATA FOR PREVIEW
const DUMMY_NODES: VisualNode[] = [
    { id: '1', name: 'Neo-Tokyo', type: 'location', x: 0, y: 0, description: 'A cyberpunk metropolis.', projectId: 'dummy', meta: {} },
    { id: '2', name: 'Akira', type: 'character', x: 100, y: 100, description: 'The awakening.', projectId: 'dummy', meta: {} },
    { id: '3', name: 'Kaneda', type: 'character', x: -100, y: 50, description: 'Bike gang leader.', projectId: 'dummy', meta: {} },
    { id: '4', name: 'Psychic Blast', type: 'event', x: 0, y: -100, description: 'Explosion.', projectId: 'dummy', meta: {} },
];

interface TheBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    initialPrompt: string;
}

type RealityMode = 'RIGOR' | 'FUSION' | 'ENTROPIA';

const MODES: { id: RealityMode; label: string }[] = [
    { id: 'RIGOR', label: 'RIGOR' },
    { id: 'FUSION', label: 'FUSIÓN' },
    { id: 'ENTROPIA', label: 'ENTROPÍA' },
];

const TheBuilder: React.FC<TheBuilderProps> = ({ isOpen, onClose, initialPrompt }) => {
    const [mode, setMode] = useState<RealityMode>('FUSION');
    const [messages, setMessages] = useState<{role: 'user' | 'system', content: string}[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);

    useEffect(() => {
        if (isOpen && initialPrompt) {
            setMessages([{ role: 'user', content: initialPrompt }]);
            setIsTyping(true);
            // Simulate typing delay
            setTimeout(() => {
                setMessages(prev => [...prev, { role: 'system', content: `Analizando solicitud: "${initialPrompt}"...\nGenerando esquema preliminar.` }]);
                setIsTyping(false);
            }, 1500);
        } else {
            // Reset when closed
            setMessages([]);
            setInput("");
        }
    }, [isOpen, initialPrompt]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
             {/* THE BOX */}
            <div className="w-[95vw] h-[90vh] bg-[#0a0a0a] border border-white/10 rounded-2xl flex flex-col shadow-2xl overflow-hidden relative animate-in zoom-in-95 duration-300">

                {/* HEADER (The Blue Line context) */}
                <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-black/50 select-none">
                     <div className="flex items-center gap-4">
                        <div className="w-3 h-3 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
                        <span className="font-mono text-sm font-bold text-cyan-500 tracking-widest">THE BUILDER</span>
                     </div>

                     {/* REALITY TUNER */}
                     <div className="flex bg-white/5 rounded-lg p-1 gap-1">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setMode(m.id)}
                                className={`
                                    px-3 py-1 rounded text-[10px] font-bold tracking-wider transition-all
                                    ${mode === m.id
                                        ? (mode === 'RIGOR' ? 'bg-sky-500/20 text-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.2)]' : mode === 'ENTROPIA' ? 'bg-violet-500/20 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]' : 'bg-slate-500/20 text-slate-300 shadow-[0_0_10px_rgba(255,255,255,0.1)]')
                                        : 'text-slate-600 hover:text-slate-400'}
                                `}
                            >
                                {m.label}
                            </button>
                        ))}
                     </div>

                     <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white transition-colors"
                        aria-label="Close Builder"
                    >
                        <X size={20} />
                     </button>
                </div>

                {/* SPLIT CONTENT */}
                <div className="flex-1 flex overflow-hidden">
                    <PanelGroup orientation="horizontal">
                        {/* LEFT: CHAT */}
                        <Panel defaultSize={40} minSize={20} className="flex flex-col bg-black/20">
                             <div className="flex-1 p-6 overflow-y-auto space-y-4 font-mono text-sm custom-scrollbar">
                                {messages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`
                                            max-w-[80%] p-3 rounded-lg border
                                            ${msg.role === 'user'
                                                ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-100 rounded-br-none'
                                                : 'bg-zinc-900/50 border-white/10 text-slate-300 rounded-bl-none'}
                                        `}>
                                            {msg.content}
                                        </div>
                                    </div>
                                ))}
                                {isTyping && (
                                    <div className="flex justify-start">
                                        <div className="flex gap-1 items-center p-3 text-cyan-500">
                                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}/>
                                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}/>
                                            <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}/>
                                        </div>
                                    </div>
                                )}
                             </div>

                             {/* CHAT INPUT */}
                             <div className="p-4 border-t border-white/10 bg-black/40">
                                 <div className="flex gap-2">
                                     <textarea
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder="Describe your architecture..."
                                        className="flex-1 bg-transparent border border-white/10 rounded-lg p-3 text-sm text-white focus:border-cyan-500 outline-none resize-none h-20 custom-scrollbar"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if(input.trim()) {
                                                    setMessages(prev => [...prev, {role: 'user', content: input}]);
                                                    setInput("");
                                                }
                                            }
                                        }}
                                     />
                                     <button
                                        onClick={() => {
                                            if(input.trim()) {
                                                setMessages(prev => [...prev, {role: 'user', content: input}]);
                                                setInput("");
                                            }
                                        }}
                                        className="w-20 bg-cyan-900/20 border border-cyan-500/30 rounded-lg flex items-center justify-center hover:bg-cyan-900/40 text-cyan-400 transition-colors"
                                     >
                                        <Send size={20} />
                                     </button>
                                 </div>
                             </div>
                        </Panel>

                        {/* RESIZER (The Yellow Line) */}
                        <PanelResizeHandle className="w-1 bg-yellow-500/50 hover:bg-yellow-400 transition-colors cursor-col-resize z-50 flex items-center justify-center group">
                            <div className="w-4 h-8 bg-yellow-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(234,179,8,0.5)] group-hover:scale-110 transition-transform">
                                <div className="w-0.5 h-4 bg-black/50" />
                            </div>
                        </PanelResizeHandle>

                        {/* RIGHT: GHOST GRAPH */}
                        <Panel className="bg-gradient-to-br from-slate-900 to-black relative">
                            <div className="absolute inset-0 p-4">
                                <GhostGraph nodes={DUMMY_NODES} />

                                {/* Overlay Stats or Controls */}
                                <div className="absolute top-4 right-4 flex flex-col items-end pointer-events-none">
                                    <div className="text-[10px] font-mono text-cyan-500/50 uppercase tracking-widest mb-1">Preview Mode</div>
                                    <div className="flex gap-2">
                                        <div className="px-2 py-1 bg-black/60 backdrop-blur rounded border border-white/10 text-xs text-slate-400 font-mono">
                                            {DUMMY_NODES.length} Nodes
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Panel>
                    </PanelGroup>
                </div>
            </div>
        </div>
    );
};

export default TheBuilder;
