import React, { useState, useEffect, useRef } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { X, Send, Hammer, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { toast } from 'sonner';
import GhostGraph from './GhostGraph';
import { VisualNode, VisualEdge, RealityMode } from './types';
import { GraphNode } from '../../types/graph';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { generateId } from "../../utils/sha256";
import InternalFolderSelector from '../InternalFolderSelector';
import { callFunction } from '../../services/api';
import ChatInput from '../ui/ChatInput';
import { fileToGenerativePart } from '../../services/geminiService';

interface TheBuilderProps {
    isOpen: boolean;
    onClose: () => void;
    initialPrompt: string;
    initialMode: RealityMode;
    accessToken?: string | null;
    onRefreshTokens?: () => Promise<string | null>;
    existingNodes?: GraphNode[];
}

interface BuilderMessage {
    role: 'user' | 'system';
    content: string;
    attachmentPreview?: string;
    attachmentType?: 'image' | 'audio';
}

const MODES: { id: RealityMode; label: string }[] = [
    { id: 'RIGOR', label: 'RIGOR' },
    { id: 'FUSION', label: 'FUSIÓN' },
    { id: 'ENTROPIA', label: 'ENTROPÍA' },
];

// 🟢 SMART SORT HELPER
const findBestFolderForType = (type: string, tree: any[]): { id: string, name: string } | null => {
    const TERMS: Record<string, string[]> = {
        'character': ['characters', 'personajes', 'cast', 'npc', 'roster', 'gente', 'people'],
        'location': ['locations', 'lugares', 'ubicaciones', 'places', 'world', 'mundo', 'geography', 'geografia'],
        'object': ['objects', 'objetos', 'items', 'artifacts', 'artefactos', 'tech', 'tecnologia'],
        'faction': ['factions', 'facciones', 'groups', 'grupos', 'organizations', 'sociedad'],
        'lore': ['lore', 'history', 'historia', 'myths', 'mitos', 'timeline', 'cronologia']
    };

    const targetTerms = TERMS[type.toLowerCase()] || [];

    // Recursive Search
    for (const node of tree) {
        if (node.mimeType === 'application/vnd.google-apps.folder') {
            const lowerName = node.name.toLowerCase();
            // Exact or Partial match
            if (targetTerms.some(t => lowerName === t || lowerName.includes(t))) {
                return { id: node.id, name: node.name };
            }
            if (node.children) {
                const found = findBestFolderForType(type, node.children);
                if (found) return found;
            }
        }
    }
    return null;
};

const TheBuilder: React.FC<TheBuilderProps> = ({ isOpen, onClose, initialPrompt, initialMode, accessToken, onRefreshTokens, existingNodes = [] }) => {
    const { config, refreshConfig, fileTree } = useProjectConfig();
    const projectId = config?.folderId || "unknown_project";

    const [mode, setMode] = useState<RealityMode>(initialMode);
    const [messages, setMessages] = useState<BuilderMessage[]>([]);
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
        }
    }, [isOpen, initialPrompt]);

    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    const handleSend = async (text: string, attachment: File | null = null) => {
        if (!text.trim() && !attachment) return;

        // 🟢 PREPARE ATTACHMENT
        let mediaAttachment = undefined;
        let previewUrl = undefined;
        if (attachment) {
             previewUrl = URL.createObjectURL(attachment);
             try {
                 const part = await fileToGenerativePart(attachment);
                 mediaAttachment = part.inlineData;
             } catch (e) {
                 toast.error("Error al procesar el adjunto.");
                 return;
             }
        }

        // 1. Add User Message
        const newMessages: BuilderMessage[] = [...messages, {
            role: 'user' as const,
            content: text,
            attachmentPreview: previewUrl,
            attachmentType: attachment?.type.startsWith('audio') ? 'audio' : 'image'
        }];
        setMessages(newMessages);
        setIsTyping(true);

        try {
            // 2. Prepare Auth & URL
            const auth = getAuth();
            let token = await auth.currentUser?.getIdToken();

            // 🟢 GHOST MODE FALLBACK (Use prop if available)
            if (!token && accessToken) {
                token = accessToken;
            }

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
                    mediaAttachment: mediaAttachment
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

                            // 🟢 ID RESOLVER (Name/ID -> Final ID)
                            const idResolver = new Map<string, string>();

                            // 1. Register Existing Ghost Nodes
                            // Note: ghostNodes closure might be stale if multiple updates happen, but usually acceptable for this flow.
                            ghostNodes.forEach(n => {
                                idResolver.set(n.id, n.id);
                                if (n.name) idResolver.set(n.name, n.id); // Name fallback
                                if (n.name) idResolver.set(n.name.toLowerCase(), n.id);
                            });

                            let processedNodes: VisualNode[] = [];

                            if (Array.isArray(payload.nodes)) {
                                processedNodes = payload.nodes.map((n: any) => {
                                    // Deterministic ID Calculation
                                    const id = n.id || generateId(projectId, n.name, n.type);

                                    // Register mapping
                                    idResolver.set(id, id);
                                    if (n.name) idResolver.set(n.name, id);
                                    if (n.name) idResolver.set(n.name.toLowerCase(), id);
                                    // Map original ID if provided by AI
                                    if (n.id) idResolver.set(n.id, id);

                                    return {
                                        ...n,
                                        id: id,
                                        type: (n.type || 'concept').toLowerCase(), // 🟢 STRICT LOWERCASE
                                        isGhost: true,
                                        isAnchor: !!n.isAnchor,
                                        x: n.fx, // Use fixed pos if provided (Anchor)
                                        y: n.fy
                                    };
                                });

                                // 🟢 CONTRADICTION CHECK
                                processedNodes.forEach(newNode => {
                                    // Check DB + Current Draft
                                    const existing = existingNodes.find(en => en.id === newNode.id) || ghostNodes.find(gn => gn.id === newNode.id);

                                    if (existing) {
                                        // Simple length/content heuristic
                                        const descA = existing.description || "";
                                        const descB = newNode.description || "";
                                        // If description changed by > 20% length or is completely different
                                        if (descB && descA && descB !== descA && Math.abs(descA.length - descB.length) > 5) {
                                             toast.warning(`⚠️ Possible Contradiction: '${newNode.name}' differs from Reality.`);
                                        }
                                    }
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
                                const validEdges: VisualEdge[] = [];

                                payload.edges.forEach((edge: any) => {
                                    const sId = idResolver.get(edge.source) || idResolver.get(edge.source.toLowerCase());
                                    const tId = idResolver.get(edge.target) || idResolver.get(edge.target.toLowerCase());

                                    if (sId && tId) {
                                        validEdges.push({
                                            ...edge,
                                            source: sId,
                                            target: tId
                                        });
                                    } else {
                                        console.warn(`⚠️ Dropping invalid edge: ${edge.source} -> ${edge.target} (Node not found)`);
                                    }
                                });

                                setGhostEdges(prev => {
                                    const combined = [...prev, ...validEdges];
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

    const handleMaterializeClick = async () => {
        if (ghostNodes.length === 0) {
            toast.error("No ghosts to materialize.");
            return;
        }

        if (projectId === "unknown_project") {
            toast.error("Error crítico: Proyecto no identificado. Recarga la página.");
            return;
        }

        // 🟢 AUTH CHECK BEFORE OPENING MODAL
        if (!accessToken && onRefreshTokens) {
            const toastId = toast.loading("Refrescando credenciales de seguridad...");
            const newToken = await onRefreshTokens();
            toast.dismiss(toastId);
            if (!newToken) {
                toast.error("No se pudo autenticar con Google Drive. Por favor recarga.");
                return;
            }
        } else if (!accessToken) {
             toast.error("Sesión de Drive caducada. Por favor recarga la página.");
             return;
        }

        setShowFolderSelector(true);
    };

    const handleFolderSelected = async (folder: { id: string; name: string }) => {
        setShowFolderSelector(false);
        setIsMaterializing(true);

        try {
            // 🟢 USE PASSED TOKEN
            let token = accessToken;
            if (!token && onRefreshTokens) {
                 token = await onRefreshTokens();
            }
            if (!token) throw new Error("Google Drive Access Token missing. Please refresh session.");

            // Collect Chat Context for AI Synthesis
            const chatContext = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

            let targetFolderId = folder.id;
            let subfolderName = undefined;

            let autoMapRole: string | undefined = undefined;

            if (folder.id === 'DEFAULT_INBOX') {
                targetFolderId = config?.folderId || ""; // Root Project Folder
                subfolderName = "Inbox";

                // 🟢 SMART SORT PROTOCOL
                if (ghostNodes.length > 0) {
                    // Determine Dominant Type (Voting) - Prioritize Anchors
                    const typeCounts: Record<string, number> = {};
                    ghostNodes.forEach(n => {
                        let t = (n.type || 'unknown').toLowerCase();
                        // Normalization
                        if (t === 'person') t = 'character';
                        if (t === 'group') t = 'faction';

                        // Weight Anchors higher
                        const weight = n.isAnchor ? 5 : 1;
                        typeCounts[t] = (typeCounts[t] || 0) + weight;
                    });

                    const bestType = Object.keys(typeCounts).reduce((a, b) => typeCounts[a] > typeCounts[b] ? a : b);
                    console.log(`[TheBuilder] Smart Sort analyzing for type: ${bestType} (Candidates: ${Object.keys(typeCounts).length})`);

                    // Try to find folder in existing tree
                    const smartFolder = fileTree ? findBestFolderForType(bestType, fileTree) : null;

                    if (smartFolder) {
                        targetFolderId = smartFolder.id;
                        subfolderName = undefined; // 🟢 FIX: Use existing folder directly, do NOT make subfolder
                        toast.success(`📂 Auto-archivado en carpeta existente: '${smartFolder.name}'`);
                    } else {
                        // 🟢 AUTO-PROVISIONING PROTOCOL
                        // If no folder exists, we setup defaults and request auto-mapping
                        const TYPE_TO_ROLE: Record<string, string> = {
                            'faction': 'ROLE_ENTITY_FACTIONS',
                            'group': 'ROLE_ENTITY_FACTIONS',
                            'character': 'ROLE_ENTITY_PEOPLE',
                            'person': 'ROLE_ENTITY_PEOPLE',
                            'creature': 'ROLE_ENTITY_BESTIARY',
                            'location': 'ROLE_WORLD_CORE', // Usually World Core or Universe
                            'object': 'ROLE_ENTITY_OBJECTS',
                            'item': 'ROLE_ENTITY_OBJECTS'
                        };

                        const TYPE_TO_NAME: Record<string, string> = {
                            'faction': 'Facciones',
                            'group': 'Facciones',
                            'character': 'Personajes',
                            'creature': 'Bestiario',
                            'location': 'Universo',
                            'object': 'Objetos'
                        };

                        if (TYPE_TO_ROLE[bestType]) {
                            autoMapRole = TYPE_TO_ROLE[bestType];
                            subfolderName = TYPE_TO_NAME[bestType] || "Nuevos Archivos";
                            // targetFolderId remains Root (or config.folderId)
                            toast.info(`📂 Auto-Wiring: Creating '${subfolderName}' for ${bestType}s.`);
                            console.log(`[TheBuilder] Auto-Provisioning Folder: ${subfolderName} for role ${autoMapRole}`);
                        } else {
                            console.log("[TheBuilder] No smart folder match found, defaulting to Inbox.");
                        }
                    }
                }
            }

            if (!targetFolderId) throw new Error("Target folder not determined.");

            const data = await callFunction<any>('crystallizeGraph', {
                nodes: ghostNodes,
                edges: ghostEdges, // 🟢 PASS EDGES
                folderId: targetFolderId,
                subfolderName,
                autoMapRole, // 🟢 PASS AUTO-MAP FLAG
                accessToken: token,
                chatContext,
                projectId,
                mode // 🟢 PASS MODE
            });

            // 🟢 HANDLE RESULTS & ERRORS
            // If data.success is true, OR if we have created items despite errors (Partial Success)
            if (data.success || (data.created > 0)) {
                const createdCount = data.created || 0;
                const failedCount = data.failed || 0;

                if (createdCount > 0) {
                    toast.success(`✨ Reality Forged: ${createdCount} Entities Created.`);
                    setGhostNodes([]);
                    setGhostEdges([]);

                    let msg = `✅ SYSTEM: Materialization Complete. ${createdCount} files created in ${subfolderName || folder.name}.`;
                    if (failedCount > 0) msg += `\n⚠️ ${failedCount} files failed to forge.`;

                    setMessages(prev => [...prev, { role: 'system', content: msg }]);

                    // 🟢 FORCE FILE TREE REFRESH
                    setTimeout(() => {
                        refreshConfig(); // Trigger context update to fetch new files immediately
                    }, 1500);
                }

                // SHOW FAILURES
                if (data.errors && data.errors.length > 0) {
                    data.errors.forEach((err: any) => {
                         toast.error(`Error en '${err.name}': ${err.error}`, { duration: 5000 });
                    });
                }

                if (createdCount === 0 && failedCount > 0) {
                     throw new Error("All entities failed to materialize. Check error messages.");
                }

            } else {
                // If explicit failure
                if (data.errors && data.errors.length > 0) {
                     data.errors.forEach((err: any) => {
                         toast.error(`Error en '${err.name}': ${err.error}`, { duration: 5000 });
                    });
                    throw new Error(`Materialization Failed: ${data.errors[0].error}`);
                }
                throw new Error("Forge reported critical failure.");
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
                                    <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                        {/* 🟢 ATTACHMENT PREVIEW */}
                                        {msg.attachmentPreview && (
                                            <div className="mb-1 rounded-lg overflow-hidden border border-white/10 max-w-[80%]">
                                                {msg.attachmentType === 'audio' ? (
                                                    <audio controls src={msg.attachmentPreview} className="w-full" />
                                                ) : (
                                                    <img src={msg.attachmentPreview} alt="Attachment" className="max-w-full h-auto object-cover" />
                                                )}
                                            </div>
                                        )}

                                        <div className={`
                                            max-w-[80%] p-3 rounded-lg border
                                            ${msg.role === 'user'
                                                ? 'bg-cyan-950/30 border-cyan-500/30 text-cyan-100 rounded-br-none'
                                                : 'bg-zinc-900/50 border-white/10 text-slate-300 rounded-bl-none'}
                                        `}>
                                            <div className="prose prose-invert prose-sm max-w-none break-words">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
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
                                <ChatInput
                                    onSend={handleSend}
                                    placeholder="Describe your architecture..."
                                    disabled={isTyping}
                                    isLoading={isTyping}
                                    textAreaClassName="bg-transparent text-sm text-white focus:outline-none"
                                    className="border border-white/10 rounded-lg bg-transparent"
                                />
                             </div>
                        </Panel>

                        {/* RESIZER */}
                        <PanelResizeHandle aria-label="Redimensionar paneles" className="w-1 bg-yellow-500/50 hover:bg-yellow-400 transition-colors cursor-col-resize z-50 flex items-center justify-center group">
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
