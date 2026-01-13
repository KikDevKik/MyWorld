import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ArrowLeft, Send, Loader2, Bot, User, Hammer, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';

import ReactMarkdown from 'react-markdown'; // Use proper Markdown renderer
import MarkdownRenderer from './MarkdownRenderer';

interface Message {
    id?: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
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
    onReset
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
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
                // Pass activeFileContent if it were available as a prop, currently empty or RAG handles it
            });

            const aiText = aiResponse.data.response;

            // --- TOOL DETECTION LOGIC ---
            let finalText = aiText;
            try {
                // Check if response looks like JSON
                if (aiText.trim().startsWith('{') && aiText.includes('create_lore_file')) {
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
            const aiMsg: Message = { role: 'model', text: finalText };
            setMessages(prev => [...prev, aiMsg]);

            // 5. Save AI Message
            await addForgeMessage({ sessionId, role: 'model', text: finalText });

        } catch (error) {
            console.error("Error in chat flow:", error);
            toast.error("Error al procesar el mensaje.");
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
                    {onReset && (
                        <button
                            onClick={onReset}
                            className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                            title="Nueva Sesión (Limpiar Chat)"
                        >
                            <RefreshCcw size={20} />
                        </button>
                    )}
                    <button
                        onClick={handleForgeToDrive}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-accent-DEFAULT transition-colors"
                        title="Forjar a Drive"
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

                            <div
                                className={`flex-1 p-4 rounded-xl text-sm leading-relaxed shadow-sm overflow-hidden break-words whitespace-pre-wrap ${msg.role === 'user'
                                    ? 'bg-titanium-800 text-titanium-100 border border-titanium-700 rounded-tr-sm max-w-[80%]'
                                    : 'bg-transparent text-titanium-300 rounded-tl-sm' // Minimalist for AI
                                    }`}
                                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                            >
                                <MarkdownRenderer content={msg.text} />
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
            <div className="p-4 border-t border-titanium-800 bg-titanium-900 shrink-0">
                <div className="max-w-4xl mx-auto flex gap-2 relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe a la Forja..."
                        className="flex-1 bg-slate-900 text-white placeholder-slate-400 border border-slate-700 rounded-xl px-4 py-4 text-sm focus:outline-none focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT transition-all shadow-inner"
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={isSending}
                        autoFocus
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 rounded-lg disabled:opacity-0 disabled:pointer-events-none transition-all shadow-lg hover:shadow-accent-DEFAULT/20"
                    >
                        <Send size={18} />
                    </button>
                </div>
                <div className="text-center mt-2">
                     <span className="text-[10px] text-titanium-600">
                        AI Mode: <span className="text-accent-DEFAULT font-bold">GEMINI 3 PRO</span> (Deep Reasoning Active)
                     </span>
                </div>
            </div >
        </div >
    );
};

export default ForgeChat;
