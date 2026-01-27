import React, { useState, useEffect, useRef } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { X, Send, Hammer, Loader2 } from 'lucide-react';
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import GhostGraph from './GhostGraph';
import { VisualNode, VisualEdge, RealityMode } from './types';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { generateId } from "../../utils/sha256";
import InternalFolderSelector from '../InternalFolderSelector';

interface TheBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    initialPrompt: string;
    initialMode: RealityMode;
}

const MODES: { id: RealityMode; label: string }[] = [
    { id: 'RIGOR', label: 'RIGOR' },
    { id: 'FUSION', label: 'FUSIÓN' },
    { id: 'ENTROPIA', label: 'ENTROPÍA' },
];

const TheBuilder: React.FC<TheBuilderProps> = ({ isOpen, onClose, initialPrompt, initialMode }) => {
    const { config } = useProjectConfig();
    const projectId = config?.folderId || "unknown_project";

    const [mode, setMode] = useState<RealityMode>(initialMode);
    const [messages, setMessages] = useState<{role: 'user' | 'system', content: string}[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [ghostNodes, setGhostNodes] = useState<VisualNode[]>([]);
    const [ghostEdges, setGhostEdges] = useState<VisualEdge[]>([]);

    // Materialization State
    const [showFolderSelector, setShowFolderSelector] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Sync mode when reopened or changed externally
    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
        }
    }, [isOpen, initialMode]);

    // Initial Trigger
    useEffect(() => {
        if (isOpen) {
            if (initialPrompt) {
                handleSend(initialPrompt);
            } else {
                setMessages([]);
                setIsTyping(false);
                setGhostNodes([]);
                setGhostEdges([]);
            }
            setInput("");
        }
    }, [isOpen, initialPrompt]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = async (text: string) => {
        if (!text.trim()) return;

        // 1. Add User Message
        const newMessages = [...messages, { role: 'user' as const, content: text }];
        setMessages(newMessages);
        setInput("");
        setIsTyping(true);

        try {
            // 2. Prepare Auth & URL
            const auth = getAuth();
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error("No auth token");

            const app = getApp();
            const gProjectId = app.options.projectId;
            const region = 'us-central1';
            const baseUrl = import.meta.env.DEV
                ? `http://127.0.0.1:5001/${gProjectId}/${region}/builderStream`
                : `https://${region}-${gProjectId}.cloudfunctions.net/builderStream`;

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    prompt: text,
                    projectId: projectId,
                    mode: mode,
                    // Pass current graph context if needed? For now, we rely on backend tool.
                })
            });

            if (!response.ok) throw new Error(response.statusText);
            if (!response.body) throw new Error("No response body");

            // 3. Stream Reader
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let systemMessageContent = "";
            let isFirstChunk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(l => l.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'text') {
                            systemMessageContent += data.content;
                            setMessages(prev => {
                                // Update last message if system, else append
                                const last = prev[prev.length - 1];
                                if (last && last.role === 'system') {
                                    return [...prev.slice(0, -1), { role: 'system', content: systemMessageContent }];
                                } else {
                                    return [...prev, { role: 'system', content: systemMessageContent }];
                                }
                            });
                        }
                        else if (data.type === 'data') {
                            // 4. Final Payload (Graph Updates)
                            const payload = data.payload; // { nodes: [], edges: [] }

                            if (Array.isArray(payload.nodes)) {
                                const processedNodes = payload.nodes.map((n: any) => {
                                    // Deterministic ID Calculation
                                    const id = n.id || generateId(projectId, n.name, n.type);
                                    return {
                                        ...n,
                                        id: id,
                                        isGhost: true,
                                        isAnchor: !!n.isAnchor,
                                        x: n.fx, // Use fixed pos if provided (Anchor)
                                        y: n.fy
                                    };
                                });

                                // Merge with existing ghost nodes
                                setGhostNodes(prev => {
                                    const combined = [...prev, ...processedNodes];
                                    // Deduplicate by ID
                                    const unique = new Map();
                                    combined.forEach(node => unique.set(node.id, node));
                                    return Array.from(unique.values());
                                });
                            }

                            if (Array.isArray(payload.edges)) {
                                setGhostEdges(prev => {
                                    const combined = [...prev, ...payload.edges];
                                    // Deduplicate by source-target key
                                    const unique = new Map();
                                    combined.forEach(edge => {
                                        const key = `${edge.source}-${edge.target}`;
                                        unique.set(key, edge);
                                    });
                                    return Array.from(unique.values());
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("Stream parse error:", e);
                    }
                }
            }

        } catch (error: any) {
            setMessages(prev => [...prev, { role: 'system', content: `Error: ${error.message}` }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleMaterializeClick = () => {
        if (ghostNodes.length === 0) {
            toast.error("No ghosts to materialize.");
            return;
        }
        setShowFolderSelector(true);
    };

    const handleFolderSelected = async (folder: { id: string; name: string }) => {
        setShowFolderSelector(false);
        setIsMaterializing(true);

        try {
            const functions = getFunctions();
            const crystallizeGraphFn = httpsCallable(functions, 'crystallizeGraph');
            const token = localStorage.getItem('google_drive_token');

            if (!token) throw new Error("Google Drive Access Token missing. Please refresh session.");

            // Collect Chat Context for AI Synthesis
            const chatContext = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

            let targetFolderId = folder.id;
            let subfolderName = undefined;

            if (folder.id === 'DEFAULT_INBOX') {
                targetFolderId = config?.folderId || ""; // Root Project Folder
                subfolderName = "Inbox";
            }

            if (!targetFolderId) throw new Error("Target folder not determined.");

            const result: any = await crystallizeGraphFn({
                nodes: ghostNodes,
                folderId: targetFolderId,
                subfolderName,
                accessToken: token,
                chatContext,
                projectId
            });

            if (result.data.success) {
                toast.success(`✨ Reality Forged: ${result.data.created} Entities Created.`);
                setGhostNodes([]);
                setGhostEdges([]);
                setMessages(prev => [...prev, { role: 'system', content: `✅ SYSTEM: Materialization Complete. ${result.data.created} files created in ${subfolderName || folder.name}.` }]);
            } else {
                throw new Error("Partial failure reported by Forge.");
            }

        } catch (e: any) {
            console.error("Materialization Error:", e);
            toast.error(`Materialization Failed: ${e.message}`);
        } finally {
            setIsMaterializing(false);
        }
    };

    // Border Color Logic
    const getBorderColor = () => {
        switch (mode) {
            case 'RIGOR': return 'border-cyan-500/50 shadow-[0_0_50px_rgba(6,182,212,0.1)]';
            case 'ENTROPIA': return 'border-violet-500/50 shadow-[0_0_50px_rgba(139,92,246,0.1)]';
            default: return 'border-white/10 shadow-2xl';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
             {/* THE BOX */}
            <div className={`w-[95vw] h-[90vh] bg-[#0a0a0a] border rounded-2xl flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-300 transition-colors duration-500 ${getBorderColor()}`}>

                {/* HEADER */}
                <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-black/50 select-none">
                     <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.5)] ${mode === 'RIGOR' ? 'bg-cyan-500 shadow-cyan-500/50' : mode === 'ENTROPIA' ? 'bg-violet-500 shadow-violet-500/50' : 'bg-slate-400'}`} />
                        <span className={`font-mono text-sm font-bold tracking-widest ${mode === 'RIGOR' ? 'text-cyan-500' : mode === 'ENTROPIA' ? 'text-violet-500' : 'text-slate-400'}`}>THE BUILDER</span>
                     </div>

                     {/* CENTER ACTIONS */}
                     <div className="flex items-center gap-4">
                         {/* MATERIALIZE BUTTON */}
                         <button
                            onClick={handleMaterializeClick}
                            disabled={isMaterializing || ghostNodes.length === 0}
                            className={`
                                flex items-center gap-2 px-4 py-1.5 rounded-lg border transition-all font-bold text-xs tracking-wider
                                ${isMaterializing
                                    ? 'bg-amber-900/20 border-amber-500/50 text-amber-500 cursor-wait'
                                    : ghostNodes.length > 0
                                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                                        : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed opacity-50'
                                }
                            `}
                         >
                             {isMaterializing ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />}
                             {isMaterializing ? "FORGING..." : "MATERIALIZE"}
                         </button>

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
                <div className="flex-1 flex overflow-hidden relative">
                    {/* @ts-ignore */}
                    <PanelGroup direction="horizontal">
                        {/* LEFT: CHAT */}
                        <Panel defaultSize={40} minSize={30} className="flex flex-col bg-black/20">
                             <div className="flex-1 p-6 overflow-y-auto space-y-4 font-mono text-sm custom-scrollbar">
                                {messages.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`
                                            max-w-[80%] p-3 rounded-lg border whitespace-pre-wrap
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
                                <div ref={messagesEndRef} />
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
                                                if(input.trim()) handleSend(input);
                                            }
                                        }}
                                     />
                                     <button
                                        onClick={() => handleSend(input)}
                                        className="w-20 bg-cyan-900/20 border border-cyan-500/30 rounded-lg flex items-center justify-center hover:bg-cyan-900/40 text-cyan-400 transition-colors"
                                     >
                                        <Send size={20} />
                                     </button>
                                 </div>
                             </div>
                        </Panel>

                        {/* RESIZER */}
                        <PanelResizeHandle className="w-1 bg-yellow-500/50 hover:bg-yellow-400 transition-colors cursor-col-resize z-50 flex items-center justify-center group">
                            <div className="w-4 h-8 bg-yellow-500 rounded-full flex items-center justify-center shadow-[0_0_10px_rgba(234,179,8,0.5)] group-hover:scale-110 transition-transform">
                                <div className="w-0.5 h-4 bg-black/50" />
                            </div>
                        </PanelResizeHandle>

                        {/* RIGHT: GHOST GRAPH */}
                        <Panel defaultSize={60} className="bg-gradient-to-br from-slate-900 to-black relative">
                            <div className="absolute inset-0 p-4">
                                <GhostGraph nodes={ghostNodes} edges={ghostEdges} />

                                {/* Overlay Stats */}
                                <div className="absolute top-4 right-4 flex flex-col items-end pointer-events-none">
                                    <div className="text-[10px] font-mono text-cyan-500/50 uppercase tracking-widest mb-1">Preview Mode</div>
                                    <div className="flex gap-2">
                                        <div className="px-2 py-1 bg-black/60 backdrop-blur rounded border border-white/10 text-xs text-slate-400 font-mono">
                                            {ghostNodes.length} Nodes
                                        </div>
                                        <div className="px-2 py-1 bg-black/60 backdrop-blur rounded border border-white/10 text-xs text-slate-400 font-mono">
                                            {ghostEdges.length} Edges
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Panel>
                    </PanelGroup>

                    {/* FOLDER SELECTOR MODAL */}
                    {showFolderSelector && (
                        <InternalFolderSelector
                            onFolderSelected={handleFolderSelected}
                            onCancel={() => setShowFolderSelector(false)}
                            currentFolderId={null}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default TheBuilder;
