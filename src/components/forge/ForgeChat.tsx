import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getApp } from 'firebase/app';
import { Send, Loader2, Bot, User, Hammer, RefreshCcw, Shield, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import MarkdownRenderer from '../ui/MarkdownRenderer';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { SoulEntity } from '../../types/forge';

interface Message {
    id?: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
    sources?: string[];
    hidden?: boolean; // 🟢 Control UI visibility
}

interface ForgeChatProps {
    sessionId: string;
    sessionName: string;
    onBack: () => void; // Kept for compatibility, though maybe unused in split view
    folderId: string;
    accessToken: string | null;
    characterContext?: string;

    // 🟢 HOT-SWAPPING PROPS
    activeEntity: SoulEntity | null;
    selectedScope: { id: string | null; name: string; recursiveIds: string[]; path?: string };

    // Legacy props kept just in case, but intended to be unused
    activeContextFile?: { id: string, name: string, content: string };
    onReset?: () => void;
}

type ThinkingState = 'IDLE' | 'THINKING' | 'CONSULTING_ARCHIVES' | 'ERROR' | 'ANALYZING';

const ForgeChat: React.FC<ForgeChatProps> = ({
    sessionId,
    sessionName,
    onBack,
    folderId,
    accessToken,
    characterContext,
    activeEntity,
    selectedScope,
    activeContextFile
}) => {
    const { setTechnicalError } = useProjectConfig();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false); // Initial load
    const [isSending, setIsSending] = useState(false);

    // 🟢 STREAMING STATE
    const [thinkingState, setThinkingState] = useState<ThinkingState>('IDLE');
    const [streamStatus, setStreamStatus] = useState<string>('');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const activeEntityRef = useRef<string | null>(null); // To track changes

    // SCROLL TO BOTTOM
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, thinkingState]);

    // --- 1. SESSION MANAGEMENT (Load History) ---
    useEffect(() => {
        let ignore = false;

        const loadHistory = async () => {
            // If we just swapped entities, we might want to skip loading old history
            // because we are about to wipe it. But for "refresh" persistence, we load it.
            // If activeEntity just changed, the separate useEffect will handle the wipe.

            setIsLoading(true);
            const functions = getFunctions();
            const getForgeHistory = httpsCallable(functions, 'getForgeHistory');

            try {
                const result: any = await getForgeHistory({ sessionId });
                if (!ignore) {
                    const loaded = result.data as Message[];
                    setMessages(loaded);
                }
            } catch (error) {
                console.warn("History load failed:", error);
            } finally {
                if (!ignore) setIsLoading(false);
            }
        };

        if (sessionId) {
            loadHistory();
        }

        return () => { ignore = true; };
    }, [sessionId]);

    // --- 2. CORE SEND LOGIC ---
    const executeStreamConnection = async (text: string, options: { hidden: boolean }) => {
        if (isSending) return;

        setIsSending(true);
        // If hidden (Injection), set state to ANALYZING to show special loader
        setThinkingState(options.hidden ? 'ANALYZING' : 'THINKING');
        setStreamStatus(options.hidden ? `Analizando expediente de ${activeEntity?.name}...` : 'Pensando...');

        // 1. Optimistic Update & Local State
        const tempUserMsg: Message = {
            role: 'user',
            text: text,
            hidden: options.hidden
        };

        // We add it to local state so it is sent as history context in the stream request
        setMessages(prev => [...prev, tempUserMsg]);

        // 2. Persist User Message (ONLY IF NOT HIDDEN)
        // Hidden messages are ephemeral context for the AI, not chat log material.
        const functions = getFunctions();
        const addForgeMessage = httpsCallable(functions, 'addForgeMessage');

        if (!options.hidden) {
            addForgeMessage({ sessionId, role: 'user', text: text }).catch(e =>
                console.error("Failed to save user message", e)
            );
        }

        // 3. Prepare History (Filter out purely local/failed messages if needed, but here we just map)
        // Note: The `messages` state used here is the PREVIOUS state + the new temp msg.
        // But `messages` in closure is stale? No, we use Functional Update for setMessages,
        // but for `historyContext` we need the latest.
        // Actually, we can just use `messages` (current render) + `tempUserMsg`.
        let historyContext = [...messages, tempUserMsg].map(m => ({
            role: m.role,
            message: m.text
        }));

        // 4. Stream Setup
        const app = getApp();
        const projectId = app.options.projectId;
        const region = 'us-central1';
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        let functionUrl = `https://${region}-${projectId}.cloudfunctions.net/forgeChatStream`;
        if (isLocal) {
            functionUrl = `http://127.0.0.1:5001/${projectId}/${region}/forgeChatStream`;
        }

        try {
            const auth = getAuth();
            const idToken = await auth.currentUser?.getIdToken();

            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    query: text,
                    history: historyContext,
                    folderId: folderId,
                    filterScopePath: selectedScope.path,
                    activeFileName: activeContextFile?.name
                })
            });

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            if (!response.body) throw new Error("No response body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // Add placeholder for AI response
            const aiMsgId = `ai-${Date.now()}`;
            setMessages(prev => [...prev, { role: 'model', text: '', id: aiMsgId, sources: [] }]);

            let accumulatedText = "";
            let accumulatedSources: string[] = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);

                        if (data.type === 'text') {
                            accumulatedText += data.content;
                            setMessages(prev => prev.map(m =>
                                m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                            ));
                            setThinkingState('IDLE');
                        } else if (data.type === 'tool_start') {
                            // If we were ANALYZING, switch to CONSULTING to show progress
                            setThinkingState('CONSULTING_ARCHIVES');
                            if (data.tool === 'consult_archives') {
                                setStreamStatus(`Consultando Archivos: "${data.query}"...`);
                            }
                        } else if (data.type === 'tool_end') {
                            setThinkingState('IDLE');
                            if (data.sources) {
                                accumulatedSources = [...accumulatedSources, ...data.sources];
                                accumulatedSources = Array.from(new Set(accumulatedSources));
                                setMessages(prev => prev.map(m =>
                                    m.id === aiMsgId ? { ...m, sources: accumulatedSources } : m
                                ));
                            }
                        }
                    } catch (err) { /* JSON Parse Error (Partial chunk) */ }
                }
            }

            // 5. Persist AI Response (Always)
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
            toast.error("Error de conexión con la Forja.");
            const errorText = "⚠️ Error de Conexión.";
            setMessages(prev => [...prev, { role: 'model', text: errorText }]);
        } finally {
            setIsSending(false);
            setThinkingState('IDLE');
        }
    };

    // --- 3. HOT-SWAPPING LOGIC (The "Vitamin") ---
    useEffect(() => {
        // If no entity or if it's the same entity ID we already processed (to avoid double-firing on rerenders), skip.
        // BUT: sessionId usually changes when entity changes (controlled by Parent).
        // Let's rely on activeEntityRef to track "Did I already initialize this entity?"

        if (!activeEntity) return;
        if (activeEntity.id === activeEntityRef.current) return;

        console.log(`[FORGE_CHAT] Hot-Swapping to: ${activeEntity.name} (${activeEntity.tier})`);

        // A. RESET
        activeEntityRef.current = activeEntity.id;
        setMessages([]); // Wipe Amnesia
        setIsLoading(false); // Stop loading spinner if history was fetching

        // B. CONSTRUCT PROMPT (THE BRAIN)
        const commonFooter = `
IMPORTANT: You are acting as an expert narrative analyst.
MANDATORY: You MUST use the 'consult_archives' tool with the query "${activeEntity.name}" to retrieve the full context from the TDB Index before answering. Do not rely solely on the provided snippet.
        `;

        let systemPrompt = "";

        if (activeEntity.tier === 'GHOST') {
            systemPrompt = `
[MODO: DETECTIVE NARRATIVO]
OBJETIVO: Extrapolar la identidad de una entidad detectada.

DATOS:
- Nombre: ${activeEntity.name}
- Contexto Detectado: "${activeEntity.sourceSnippet}"
- Ocurrencias: ${activeEntity.occurrences}

INSTRUCCIÓN:
Analiza el snippet y lo que encuentres en los archivos. ¿Quién es este personaje? ¿Qué papel juega?
Empieza con: "He rastreado a ${activeEntity.name}..." y termina con una pregunta clave sobre su futuro.
            `;
        } else if (activeEntity.tier === 'LIMBO') {
            systemPrompt = `
[MODO: EDITOR / CO-AUTOR]
OBJETIVO: Convertir un borrador en un personaje sólido.

DATOS:
- Nombre: ${activeEntity.name}
- Notas Crudas: "${activeEntity.sourceSnippet}"
- Rasgos: ${activeEntity.tags?.join(', ') || "No definidos"}

INSTRUCCIÓN:
Estas son mis notas desordenadas. Organízalas mentalmente (usando los archivos) y preséntame un resumen profesional.
Propón 3 arquetipos posibles para este personaje.
            `;
        } else {
            // ANCHOR
            systemPrompt = `
[MODO: PSICÓLOGO DE PERSONAJES]
OBJETIVO: Profundizar en la psique de un personaje existente.

DATOS:
- Nombre: ${activeEntity.name}
- Rol: ${activeEntity.role || "No definido"}
- Descripción/Snippet: "${activeEntity.sourceSnippet}"

INSTRUCCIÓN:
Ya conocemos a ${activeEntity.name}. No me des un resumen básico.
Busca en los archivos sus interacciones más recientes o traumas.
Hazme una pregunta provocadora sobre su motivación oculta.
            `;
        }

        // C. INJECT
        executeStreamConnection(`${systemPrompt}\n${commonFooter}`, { hidden: true });

    }, [activeEntity]); // Dependency on activeEntity object


    // --- HANDLERS ---
    const handleUserSend = () => {
        if (!input.trim()) return;
        const text = input.trim();
        setInput('');
        executeStreamConnection(text, { hidden: false });
    };

    const handlePurgeSession = async () => {
        if (!window.confirm("¿Borrar chat actual?")) return;
        setMessages([]);
        const functions = getFunctions();
        const clearSessionMessages = httpsCallable(functions, 'clearSessionMessages');
        await clearSessionMessages({ sessionId });
    };

    const handleForgeToDrive = async () => {
        if (!folderId || !accessToken) {
            toast.error("Sin conexión a Drive.");
            return;
        }
        const toastId = toast.loading("Forjando archivo...");
        const functions = getFunctions();
        const forgeToDrive = httpsCallable(functions, 'forgeToDrive');
        try {
            const result: any = await forgeToDrive({ sessionId, folderId, accessToken });
            toast.success(`Archivo creado: ${result.data.fileName}`, { id: toastId });
        } catch (error) {
            toast.error("Error al forjar.", { id: toastId });
        }
    };

    return (
        <div className="flex flex-col h-full bg-titanium-950">
            {/* HEADER */}
            <div className="h-16 flex items-center gap-4 px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div>
                    <h2 className="font-bold text-titanium-100 truncate max-w-[300px]">{sessionName}</h2>
                    <p className="text-[10px] text-titanium-400 uppercase tracking-wider flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${activeEntity ? 'bg-accent-DEFAULT' : 'bg-green-500'}`}></span>
                        {activeEntity ? `Enfoque: ${activeEntity.tier}` : 'Sesión Activa'}
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                    <button onClick={handlePurgeSession} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-red-400">
                        <RefreshCcw size={20} />
                    </button>
                    <button onClick={handleForgeToDrive} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-accent-DEFAULT">
                        <Hammer size={20} />
                    </button>
                </div>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {isLoading && messages.length === 0 ? (
                    <div className="flex justify-center py-8 text-titanium-500">
                        <Loader2 size={24} className="animate-spin" />
                    </div>
                ) : messages.filter(m => !m.hidden).length === 0 && thinkingState === 'IDLE' ? (
                    <div className="text-center py-20 text-titanium-600">
                        <Bot size={48} className="mx-auto mb-4 opacity-20" />
                        <p className="text-sm font-medium">Esperando órdenes...</p>
                    </div>
                ) : (
                    messages.filter(m => !m.hidden).map((msg, idx) => (
                        <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start max-w-3xl'}`}>
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                    <Bot size={16} className="text-accent-DEFAULT" />
                                </div>
                            )}

                            <div className={`flex-1 flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <div className={`p-4 rounded-xl text-sm leading-relaxed shadow-sm overflow-hidden break-words whitespace-pre-wrap ${msg.role === 'user'
                                        ? 'bg-titanium-800 text-titanium-100 border border-titanium-700'
                                        : 'bg-transparent text-titanium-300 w-full'
                                        }`}>
                                    <MarkdownRenderer content={msg.text} mode="full" />
                                </div>

                                {msg.role === 'model' && msg.sources && msg.sources.length > 0 && (
                                    <div className="flex flex-wrap gap-2 px-1">
                                        {msg.sources.map((src, i) => (
                                            <div key={i} className="text-[10px] font-mono text-titanium-500 bg-titanium-900 border border-titanium-800 px-2 py-0.5 rounded flex items-center gap-1 opacity-70">
                                                <span>📄</span>
                                                <span className="truncate max-w-[200px]">{src}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}

                {/* THINKING INDICATOR */}
                {thinkingState !== 'IDLE' && (
                    <div className="flex gap-4 justify-start max-w-3xl">
                        <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                            <Bot size={16} className="text-accent-DEFAULT" />
                        </div>
                        <div className={`p-4 rounded-xl border text-xs font-mono flex items-center gap-3 animate-pulse ${
                            thinkingState === 'ANALYZING'
                                ? 'bg-accent-900/10 border-accent-500/20 text-accent-300'
                                : 'bg-titanium-900/50 border-cyan-500/20 text-cyan-300'
                        }`}>
                            {thinkingState === 'CONSULTING_ARCHIVES' ? (
                                <>
                                    <Sparkles size={14} className="animate-spin-slow" />
                                    <span>{streamStatus}</span>
                                </>
                            ) : thinkingState === 'ANALYZING' ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
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
            </div>

            {/* INPUT AREA */}
            <div className="p-4 border-t border-titanium-800 bg-titanium-900 shrink-0 z-50">
                <div className="max-w-4xl mx-auto flex flex-col gap-3">
                    <div className="flex items-center gap-2 px-1">
                         <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                selectedScope.id
                                ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-300'
                                : 'bg-titanium-800 border-titanium-700 text-titanium-500'
                            }`}>
                            <Shield size={12} />
                            <span>Scope: {selectedScope.name}</span>
                         </div>
                    </div>

                    <div className="flex gap-2 relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={activeEntity ? `Hablar con ${activeEntity.name}...` : "Escribe a la Forja..."}
                            className={`flex-1 placeholder-titanium-400 border rounded-xl px-4 py-4 text-sm focus:outline-none transition-all shadow-inner bg-zinc-900 text-zinc-200 ${
                                selectedScope.id
                                ? 'border-cyan-900/50 focus:border-cyan-500'
                                : 'border-titanium-700 focus:border-accent-DEFAULT'
                            }`}
                            onKeyDown={(e) => e.key === 'Enter' && handleUserSend()}
                            disabled={isSending || thinkingState === 'ANALYZING'}
                            autoFocus
                        />
                        <button
                            onClick={handleUserSend}
                            disabled={!input.trim() || isSending}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-lg transition-all ${
                                selectedScope.id ? 'bg-cyan-600 hover:bg-cyan-500 text-white' : 'bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950'
                            }`}
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ForgeChat;
