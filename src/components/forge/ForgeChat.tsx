import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth'; // 🟢 For ID Token
import { getApp } from 'firebase/app'; // 🟢 For Project ID
import { ArrowLeft, Send, Loader2, Bot, User, Hammer, RefreshCcw, Shield, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import ReactMarkdown from 'react-markdown'; // Use proper Markdown renderer
import MarkdownRenderer from '../ui/MarkdownRenderer';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";

interface Message {
    id?: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
    sources?: string[]; // 🟢 Persistent Sources
}

interface ForgeChatProps {
    sessionId: string;
    sessionName: string;
    onBack: () => void;
    folderId: string;
    accessToken: string | null;
    characterContext?: string;

    // NEW PROPS
    activeContextFile?: { id: string, name: string, content: string };
    initialReport?: string;
    onReset?: () => void;
    // 🟢 NEW SCOPE PROP
    selectedScope: { id: string | null; name: string; recursiveIds: string[]; path?: string };
}

type ThinkingState = 'IDLE' | 'THINKING' | 'CONSULTING_ARCHIVES' | 'ERROR';

const ForgeChat: React.FC<ForgeChatProps> = ({
    sessionId,
    sessionName,
    onBack,
    folderId,
    accessToken,
    characterContext,
    activeContextFile,
    initialReport,
    onReset,
    selectedScope
}) => {
    const { setTechnicalError } = useProjectConfig(); // 👈 CONSUME CONTEXT
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);

    // 🟢 STREAMING STATE
    const [thinkingState, setThinkingState] = useState<ThinkingState>('IDLE');
    const [streamStatus, setStreamStatus] = useState<string>('');
    const currentStreamResponseRef = useRef<string>("");

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // SCROLL TO BOTTOM
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, thinkingState]);

    // LOAD HISTORY & INJECT INITIAL REPORT
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoading(true);
            const functions = getFunctions();
            const getForgeHistory = httpsCallable(functions, 'getForgeHistory');

            try {
                const result: any = await getForgeHistory({ sessionId });
                let loadedMessages = result.data as Message[];

                // INJECTION LOGIC: If history is empty AND we have an initial report, inject it.
                if (loadedMessages.length === 0 && initialReport && !initializedRef.current) {
                    const reportMsg: Message = {
                        role: 'model',
                        text: initialReport,
                        timestamp: new Date().toISOString()
                    };

                    // Optimistic add locally
                    loadedMessages = [reportMsg];

                    // Async save to backend
                    const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
                    addForgeMessage({
                        sessionId,
                        role: 'model',
                        text: initialReport
                    }).catch(console.error);

                    initializedRef.current = true;
                }

                setMessages(loadedMessages);
            } catch (error) {
                console.error("Error loading history:", error);
                toast.error("Error al cargar el historial.");
            } finally {
                setIsLoading(false);
            }
        };

        if (sessionId) {
            loadHistory();
        }
    }, [sessionId]);

    // 🟢 HANDLE PURGE (DESTRUCTIVE RESET)
    const handlePurgeSession = async () => {
        if (!sessionId) return;

        // Confirmation dialog to prevent accidental wipes
        if (!window.confirm("⚠️ PROTOCOLO DE PURGA: ¿Confirmar eliminación total de la memoria de esta sesión? Esto es irreversible.")) {
            return;
        }

        const toastId = toast.loading("Purgando memoria de sesión...");
        try {
            const functions = getFunctions();
            const clearSessionMessages = httpsCallable(functions, 'clearSessionMessages');

            await clearSessionMessages({ sessionId });

            // Clear local state immediately
            setMessages([]);

            toast.success("Memoria purgada. Tabula Rasa.", { id: toastId });

        } catch (error) {
            console.error("Error purging session:", error);
            toast.error("Fallo en el protocolo de purga.", { id: toastId });
        }
    };

    // 🟢 STREAMING SEND
    const handleStreamSend = async () => {
        if (!input.trim() || isSending) return;

        const userText = input.trim();
        setInput('');
        setIsSending(true);
        setThinkingState('THINKING');
        setStreamStatus('Pensando...');
        currentStreamResponseRef.current = "";

        // 1. Optimistic Update (User)
        const tempUserMsg: Message = { role: 'user', text: userText };
        setMessages(prev => [...prev, tempUserMsg]);

        // 2. Persist User Message
        const functions = getFunctions();
        const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
        try {
            await addForgeMessage({ sessionId, role: 'user', text: userText });
        } catch (e) {
            console.error("Failed to save user message", e);
        }

        // 3. Prepare History
        const historyContext = messages.map(m => ({ role: m.role, message: m.text }));
        // Note: We don't push the new userText to historyContext here because
        // the backend usually expects the new query separately, or we append it.
        // The backend logic I wrote expects `history` AND `query`.

        // 4. Construct URL
        const app = getApp();
        const projectId = app.options.projectId;
        const region = 'us-central1'; // Hardcoded or config
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        let functionUrl = `https://${region}-${projectId}.cloudfunctions.net/forgeChatStream`;
        if (isLocal) {
            functionUrl = `http://127.0.0.1:5001/${projectId}/${region}/forgeChatStream`;
        }

        // 🟢 STREAM READER LOGIC
        try {
            // 🟢 SECURITY FIX: Use Firebase ID Token, NOT Drive Access Token
            const auth = getAuth();
            const idToken = await auth.currentUser?.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    query: userText,
                    history: historyContext,
                    folderId: folderId, // Project Scope
                    filterScopePath: selectedScope.path,
                    activeFileName: activeContextFile?.name
                })
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            // Add placeholder for AI response
            const aiMsgId = `temp-ai-${Date.now()}`;
            setMessages(prev => [...prev, { role: 'model', text: '', id: aiMsgId, sources: [] }]);

            let accumulatedText = "";
            let accumulatedSources: string[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Process all complete lines
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'text') {
                            accumulatedText += data.content;
                            // Update UI
                            setMessages(prev => prev.map(m =>
                                m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                            ));
                            setThinkingState('IDLE'); // If streaming text, we are "talking"
                        } else if (data.type === 'tool_start') {
                            setThinkingState('CONSULTING_ARCHIVES');
                            if (data.tool === 'consult_archives') {
                                setStreamStatus(`Consultando Archivos: "${data.query}"...`);
                            }
                        } else if (data.type === 'tool_end') {
                            setThinkingState('IDLE'); // Back to generating
                            if (data.sources) {
                                accumulatedSources = [...accumulatedSources, ...data.sources];
                                // De-duplicate
                                accumulatedSources = Array.from(new Set(accumulatedSources));
                                setMessages(prev => prev.map(m =>
                                    m.id === aiMsgId ? { ...m, sources: accumulatedSources } : m
                                ));
                            }
                        } else if (data.type === 'error') {
                            console.error("Stream Error:", data.message);
                            toast.error(data.message);
                        }
                    } catch (err) {
                        console.warn("Error parsing stream chunk", err);
                    }
                }
            }

            // 5. Final Save (Persist AI Response)
            if (accumulatedText) {
                await addForgeMessage({
                    sessionId,
                    role: 'model',
                    text: accumulatedText,
                    sources: accumulatedSources
                });
            }

        } catch (error: any) {
            console.error("Stream failed:", error);
            setThinkingState('ERROR');
            toast.error("Error en la conexión con el Oráculo.");

            // Add error message
            const errorText = "⚠️ Error de Conexión: La Forja de Almas no pudo procesar este fragmento.";
            setMessages(prev => [...prev, { role: 'model', text: errorText }]);
            await addForgeMessage({ sessionId, role: 'model', text: errorText });

        } finally {
            setIsSending(false);
            setThinkingState('IDLE');
        }
    };

    // FORGE TO DRIVE
    const handleForgeToDrive = async () => {
        if (!folderId || !accessToken) {
            toast.error("No hay conexión con Drive.");
            return;
        }

        const toastId = toast.loading("Forjando archivo...");
        const functions = getFunctions();
        const forgeToDrive = httpsCallable(functions, 'forgeToDrive');

        try {
            const result: any = await forgeToDrive({ sessionId, folderId, accessToken });
            toast.success(`¡Archivo ${result.data.fileName} creado en Drive!`, { id: toastId });
        } catch (error) {
            console.error("Error forging to drive:", error);
            toast.error("Error al forjar el archivo.", { id: toastId });
        }
    };

    return (
        <div className="flex flex-col h-full bg-titanium-950">
            {/* HEADER */}
            <div className="h-16 flex items-center gap-4 px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                {/* BACK BUTTON REMOVED AS IT IS SPLIT VIEW NOW - OR KEPT IF NEEDED */}
                {/*
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                */}
                <div>
                    <h2 className="font-bold text-titanium-100 truncate max-w-[300px]">{sessionName}</h2>
                    <p className="text-[10px] text-titanium-400 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        Sesión Activa
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={handlePurgeSession}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-red-400 transition-colors"
                        title="Purgar Memoria de Sesión (Irreversible)"
                        aria-label="Purgar Memoria"
                    >
                        <RefreshCcw size={20} />
                    </button>
                    <button
                        onClick={handleForgeToDrive}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-accent-DEFAULT transition-colors"
                        title="Forjar a Drive"
                        aria-label="Forjar a Drive"
                    >
                        <Hammer size={20} />
                    </button>
                </div>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {isLoading ? (
                    <div className="flex justify-center py-8 text-titanium-500">
                        <Loader2 size={24} className="animate-spin" />
                    </div >
                ) : messages.length === 0 ? (
                    <div className="text-center py-20 text-titanium-600">
                        <Bot size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm font-medium">Esperando órdenes, Comandante.</p>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start max-w-3xl'}`}
                        >
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                    <Bot size={16} className="text-accent-DEFAULT" />
                                </div>
                            )}

                            <div className={`flex-1 flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div
                                    className={`p-4 rounded-xl text-sm leading-relaxed shadow-sm overflow-hidden break-words whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-tr-sm'
                                        : 'bg-transparent text-titanium-300 rounded-tl-sm w-full'
                                        }`}
                                    style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                                >
                                    <MarkdownRenderer content={msg.text} mode="full" />
                                </div>

                                {/* 🟢 SOURCES DISPLAY */}
                                {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                                    <div className="flex flex-wrap gap-2 animate-fade-in px-1">
                                        {msg.sources.map((src, i) => (
                                            <div key={i} className="text-[10px] font-mono text-titanium-500 bg-titanium-900 border border-titanium-800 px-2 py-0.5 rounded flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity">
                                                <span>📄</span>
                                                <span className="truncate max-w-[200px]">{src}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                    <User size={16} className="text-titanium-400" />
                                </div>
                            )}
                        </div>
                    ))
                )}

                {/* 🟢 THINKING STATE INDICATOR */}
                {(isSending || thinkingState !== 'IDLE') && (
                    <div className="flex gap-4 justify-start max-w-3xl">
                        <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                            <Bot size={16} className="text-accent-DEFAULT" />
                        </div>
                        <div className="p-4 rounded-xl bg-titanium-900/50 border border-cyan-500/20 text-cyan-300 text-xs font-mono flex items-center gap-3 animate-pulse">
                            {thinkingState === 'CONSULTING_ARCHIVES' ? (
                                <>
                                    <Sparkles size={14} className="animate-spin-slow" />
                                    <span>{streamStatus}</span>
                                </>
                            ) : (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    <span>THINKING...</span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div >

            {/* INPUT */}
            <div className="p-4 border-t border-titanium-800 bg-titanium-900 shrink-0 z-50 relative">
                <div className="max-w-4xl mx-auto flex flex-col gap-3">

                    {/* 🟢 SCOPE INDICATOR (READ ONLY) */}
                    <div className="flex items-center gap-2 px-1">
                         <div
                            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border ${
                                selectedScope.id
                                ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                                : 'bg-titanium-800 border-titanium-700 text-titanium-500'
                            }`}
                         >
                            <Shield size={12} className={selectedScope.id ? "fill-cyan-500/20" : ""} />
                            <span>Scope: {selectedScope.name}</span>
                         </div>
                    </div>

                    <div className="flex gap-2 relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={selectedScope.id ? `Consultando ${selectedScope.name}...` : "Escribe a la Forja..."}
                            aria-label="Mensaje"
                            style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}
                            className={`flex-1 placeholder-titanium-400 border rounded-xl px-4 py-4 text-sm focus:outline-none transition-all shadow-inner ${
                                selectedScope.id
                                ? 'border-cyan-900/50 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                                : 'border-titanium-700 focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT'
                            }`}
                            onKeyDown={(e) => e.key === 'Enter' && handleStreamSend()}
                            disabled={isSending}
                            autoFocus
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <button
                            onClick={handleStreamSend}
                            disabled={!input.trim() || isSending}
                            aria-label="Enviar mensaje"
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-lg disabled:opacity-0 disabled:pointer-events-none transition-all shadow-lg ${
                                selectedScope.id
                                ? 'bg-cyan-600 hover:bg-cyan-500 text-white hover:shadow-cyan-500/20'
                                : 'bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 hover:shadow-accent-DEFAULT/20'
                            }`}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div >
        </div >
    );
};

export default ForgeChat;
