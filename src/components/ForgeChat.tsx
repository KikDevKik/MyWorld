import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ArrowLeft, Send, Loader2, Bot, User, Hammer, RefreshCcw, Shield } from 'lucide-react';
import { toast } from 'sonner';

import ReactMarkdown from 'react-markdown'; // Use proper Markdown renderer
import MarkdownRenderer from './MarkdownRenderer';

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
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    // Removed old binary toggle state
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // SCROLL TO BOTTOM
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

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

            // Optional: If we wanted to also generate a new ID, we could call onReset(),
            // but keeping the same (now empty) session is cleaner for the "Purge" concept.

        } catch (error) {
            console.error("Error purging session:", error);
            toast.error("Fallo en el protocolo de purga.", { id: toastId });
        }
    };

    // SEND MESSAGE
    const handleSend = async () => {
        if (!input.trim() || isSending) return;

        const userText = input.trim();
        setInput('');
        setIsSending(true);

        // 1. Optimistic Update (User)
        const tempUserMsg: Message = { role: 'user', text: userText };
        setMessages(prev => [...prev, tempUserMsg]);

        const functions = getFunctions();
        const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
        const chatWithGem = httpsCallable(functions, 'chatWithGem');

        try {
            // 2. Save User Message
            await addForgeMessage({ sessionId, role: 'user', text: userText });

            // 3. Call AI (with history context)
            const historyContext = messages.map(m => ({ role: m.role, message: m.text }));
            historyContext.push({ role: 'user', message: userText });

            const TOOL_INSTRUCTION = `
[TOOL ACCESS GRANTED]: 'create_lore_file'
If the user asks to create a file, character, or document, you can invoke this tool.
TO USE IT, RETURN ONLY A JSON OBJECT:
{ "tool": "create_lore_file", "args": { "title": "...", "content": "..." } }

Rules:
- Title should be short (e.g., "Saya_Profile").
- Content must be the full text body of the file (Markdown allowed).
- DO NOT hallucinate a 'folderId'. The system will handle it.
`;

            let systemPrompt = `You are a creative writing assistant (Senior Editor).
${characterContext ? `[ACTIVE CHARACTER CONTEXT]\n${characterContext}` : ''}
${activeContextFile ? `[ACTIVE FILE CONTEXT: ${activeContextFile.name}]` : ''}
Remember previous context.
${TOOL_INSTRUCTION}`;

            const aiResponse: any = await chatWithGem({
                query: userText,
                history: historyContext,
                systemInstruction: systemPrompt,
                projectId: folderId || undefined, // 👈 STRICT ISOLATION
                activeFileName: activeContextFile?.name,
                // 🟢 PASS NEW SCOPE PARAMS
                filterScopeIds: selectedScope.id ? selectedScope.recursiveIds : undefined,
                filterScopePath: selectedScope.path, // Optimization Hint
                // Pass activeFileContent if it were available as a prop, currently empty or RAG handles it
            });

            const aiText = aiResponse.data.response;
            const sources = aiResponse.data.sources?.map((s: any) => s.fileName) || [];

            // --- TOOL DETECTION LOGIC ---
            let finalText = aiText;
            try {
                // Check if response looks like JSON
                if (aiText && aiText.trim().startsWith('{') && aiText.includes('create_lore_file')) {
                     const toolCall = JSON.parse(aiText);
                     if (toolCall.tool === 'create_lore_file' && toolCall.args) {
                         const toastId = toast.loading("🔨 Forjando documento...");

                         const forgeToolExecution = httpsCallable(functions, 'forgeToolExecution');
                         const result: any = await forgeToolExecution({
                             title: toolCall.args.title,
                             content: toolCall.args.content,
                             folderId: folderId, // Injected from prop (Tactical Assistance)
                             accessToken: accessToken
                         });

                         toast.success("Documento creado con éxito", { id: toastId });
                         finalText = `✅ **SYSTEM:** Archivo creado: [${toolCall.args.title}](${result.data.webViewLink})`;
                     }
                }
            } catch (err) {
                console.warn("Not a tool call or parse error:", err);
            }

            // 4. Update UI (AI)
            // 🛡️ NULL-OBJECT HANDLING: Prevent "Bucle de Información"
            if (finalText) {
                const aiMsg: Message = { role: 'model', text: finalText, sources };
                setMessages(prev => [...prev, aiMsg]);

                // 5. Save AI Message
                await addForgeMessage({ sessionId, role: 'model', text: finalText, sources });
            } else {
                console.warn("⚠️ AI returned empty response. Skipping save to prevent loop.");
                toast.error("La IA no devolvió contenido.");
            }

        } catch (error: any) {
            console.error("Error in chat flow:", error);

            // 🟢 UI RECOVERY (MANUAL SAVE)
            // If the backend failed entirely (e.g. timeout, network error) and didn't return the controlled error string,
            // we must manually insert the error message into the chat so the loop is closed.

            const errorText = "⚠️ Error de Conexión: La Forja de Almas no pudo procesar este fragmento de lore. Reintente en unos momentos.";

            // Update UI immediately
            const errorMsg: Message = { role: 'model', text: errorText };
            setMessages(prev => [...prev, errorMsg]);

            // Try to persist the error to DB so history is consistent
            try {
                const functions = getFunctions();
                const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
                await addForgeMessage({ sessionId, role: 'model', text: errorText });
            } catch (persistErr) {
                console.error("Failed to persist error message:", persistErr);
            }

            toast.error("Error de conexión con la Forja.");
        } finally {
            setIsSending(false);
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
                                    <MarkdownRenderer content={msg.text} />
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
                {
                    isSending && (
                        <div className="flex gap-4 justify-start max-w-3xl">
                            <div className="w-8 h-8 rounded-lg bg-titanium-800 border border-titanium-700 flex items-center justify-center shrink-0 mt-1">
                                <Bot size={16} className="text-accent-DEFAULT" />
                            </div>
                            <div className="p-4 text-titanium-500 text-xs font-mono animate-pulse">
                                THINKING...
                            </div>
                        </div>
                    )
                }
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
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            disabled={isSending}
                            autoFocus
                            spellCheck={false}
                            autoComplete="off"
                        />
                        <button
                            onClick={handleSend}
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
