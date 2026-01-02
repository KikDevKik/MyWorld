import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ArrowLeft, Send, Loader2, Bot, User, Hammer } from 'lucide-react';
import { toast } from 'sonner';

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
    onOpenImageGen: () => void;
}

const ForgeChat: React.FC<ForgeChatProps> = ({ sessionId, sessionName, onBack, folderId, accessToken }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // SCROLL TO BOTTOM
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // LOAD HISTORY
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoading(true);
            const functions = getFunctions();
            const getForgeHistory = httpsCallable(functions, 'getForgeHistory');

            try {
                const result = await getForgeHistory({ sessionId });
                setMessages(result.data as Message[]);
            } catch (error) {
                console.error("Error loading history:", error);
                toast.error("Error al cargar el historial.");
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
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
            // We pass the current messages + the new one as history context
            const historyContext = messages.map(m => ({ role: m.role, message: m.text }));
            historyContext.push({ role: 'user', message: userText });

            const aiResponse: any = await chatWithGem({
                query: userText,
                history: historyContext,
                systemInstruction: "You are a creative writing assistant in a persistent session. Remember previous context."
            });

            const aiText = aiResponse.data.response;

            // 4. Update UI (AI)
            const aiMsg: Message = { role: 'model', text: aiText };
            setMessages(prev => [...prev, aiMsg]);

            // 5. Save AI Message
            await addForgeMessage({ sessionId, role: 'model', text: aiText });

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
        <div className="flex flex-col h-full bg-titanium-900">
            {/* HEADER */}
            <div className="h-16 flex items-center gap-4 px-6 border-b border-titanium-700 bg-titanium-800 shrink-0">
                <button
                    onClick={onBack}
                    className="p-2 hover:bg-titanium-700 rounded-full text-titanium-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className="font-bold text-titanium-100 truncate max-w-[200px]">{sessionName}</h2>
                    <p className="text-[10px] text-titanium-400 uppercase tracking-wider">Sesión Activa</p>
                </div>
                <div className="ml-auto">
                    <button
                        onClick={handleForgeToDrive}
                        className="p-2 hover:bg-titanium-700 rounded-full text-titanium-400 hover:text-accent-DEFAULT transition-colors"
                        title="Forjar a Drive"
                    >
                        <Hammer size={20} />
                    </button>
                </div>
            </div>

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-8 text-titanium-500">
                        <Loader2 size={24} className="animate-spin" />
                    </div >
                ) : messages.length === 0 ? (
                    <div className="text-center py-8 text-titanium-500 text-sm italic">
                        La forja está en silencio. Empieza a crear.
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.role === 'model' && (
                                <div className="w-8 h-8 rounded-full bg-accent-DEFAULT/20 flex items-center justify-center shrink-0">
                                    <Bot size={14} className="text-accent-DEFAULT" />
                                </div>
                            )}

                            <div
                                className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-titanium-700 text-titanium-100 rounded-tr-none'
                                    : 'bg-titanium-800 text-titanium-200 rounded-tl-none border border-titanium-700/50'
                                    }`}
                            >
                                {msg.text}
                            </div>

                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-titanium-700 flex items-center justify-center shrink-0">
                                    <User size={14} className="text-titanium-400" />
                                </div>
                            )}
                        </div>
                    ))
                )}
                {
                    isSending && (
                        <div className="flex gap-3 justify-start">
                            <div className="w-8 h-8 rounded-full bg-accent-DEFAULT/20 flex items-center justify-center shrink-0">
                                <Bot size={14} className="text-accent-DEFAULT" />
                            </div>
                            <div className="bg-titanium-800 p-3 rounded-2xl rounded-tl-none border border-titanium-700/50 flex items-center gap-2">
                                <span className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-2 h-2 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                        </div>
                    )
                }
                <div ref={messagesEndRef} />
            </div >

            {/* INPUT */}
            < div className="p-4 border-t border-titanium-700 bg-titanium-800 shrink-0" >
                <div className="flex gap-2 relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Escribe a la Forja..."
                        className="flex-1 bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent-DEFAULT focus:ring-2 focus:ring-accent-DEFAULT transition-colors pr-12"
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        disabled={isSending}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isSending}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 rounded-lg disabled:opacity-0 disabled:pointer-events-none transition-all"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div >
        </div >
    );
};

export default ForgeChat;
