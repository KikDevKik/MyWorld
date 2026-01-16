import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, Bot, Loader2, RefreshCw } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

interface DirectorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    pendingMessage: string | null;
    onClearPendingMessage: () => void;
    activeFileContent?: string;
    activeFileName?: string;
    isFallbackContext?: boolean;
    folderId?: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp: any;
    isError?: boolean;
}

const DirectorPanel: React.FC<DirectorPanelProps & { accessToken?: string | null }> = ({
    isOpen,
    onClose,
    activeSessionId,
    onSessionSelect,
    pendingMessage,
    onClearPendingMessage,
    activeFileContent,
    activeFileName,
    isFallbackContext,
    folderId,
    accessToken
}) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const functions = getFunctions();
    const getForgeHistory = httpsCallable(functions, 'getForgeHistory');
    const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
    const createForgeSession = httpsCallable(functions, 'createForgeSession');
    // We use chatWithGem for AI response (since Director is effectively a specialized chat)
    const chatWithGem = httpsCallable(functions, 'chatWithGem');

    // 🟢 LOAD HISTORY
    useEffect(() => {
        if (!isOpen) return;

        const loadHistory = async () => {
            if (activeSessionId) {
                setIsLoadingHistory(true);
                try {
                    const result = await getForgeHistory({ sessionId: activeSessionId });
                    const history = result.data as any[];
                    // Map backend history to UI format
                    const formatted: Message[] = history.map(h => ({
                        id: h.id || Math.random().toString(),
                        role: h.role === 'ia' ? 'assistant' : (h.role === 'user' ? 'user' : 'system'),
                        text: h.text,
                        timestamp: h.timestamp
                    }));
                    setMessages(formatted);
                } catch (error) {
                    console.error("Failed to load history:", error);
                    toast.error("Error cargando historial.");
                } finally {
                    setIsLoadingHistory(false);
                }
            } else {
                // No session? Create one or show intro
                setMessages([{
                    id: 'intro',
                    role: 'assistant',
                    text: 'Director de Escena en línea. ¿En qué puedo ayudarte con la estructura o el tono de la escena actual?',
                    timestamp: Date.now()
                }]);
            }
        };

        loadHistory();
    }, [isOpen, activeSessionId]);

    // 🟢 HANDLE PENDING MESSAGE (HANDOFF)
    useEffect(() => {
        if (pendingMessage && isOpen) {
            handleSendMessage(pendingMessage);
            onClearPendingMessage();
        }
    }, [pendingMessage, isOpen]);

    // 🟢 AUTO-SCROLL
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isThinking, isLoadingHistory]);

    // 🟢 INIT SESSION (IF NEEDED)
    const ensureSession = async (): Promise<string | null> => {
        if (activeSessionId) return activeSessionId;

        try {
            const result = await createForgeSession({ name: `Director ${new Date().toLocaleDateString()}`, type: 'director' });
            const data = result.data as { sessionId: string };
            onSessionSelect(data.sessionId);
            return data.sessionId;
        } catch (error) {
            console.error("Failed to create session:", error);
            toast.error("Error iniciando sesión del Director.");
            return null;
        }
    };

    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        const currentSessionId = await ensureSession();
        if (!currentSessionId) return;

        // Optimistic Update
        const tempId = Date.now().toString();
        const newUserMsg: Message = {
            id: tempId,
            role: 'user',
            text: text,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, newUserMsg]);
        setInputValue('');
        setIsThinking(true);

        try {
            // 1. Save User Message
            await addForgeMessage({
                sessionId: currentSessionId,
                role: 'user',
                text: text
            });

            // 2. Call AI (Director Persona)
            const result = await chatWithGem({
                query: text,
                sessionId: currentSessionId,
                activeFileContent, // Context
                activeFileName,
                isFallbackContext,
                systemInstruction: "ACT AS: Director of Photography and Narrative Structure. Focus on pacing, tone, and visual composition. Keep responses concise and actionable."
            });

            const data = result.data as { response: string };

            // 3. Save AI Response
            await addForgeMessage({
                sessionId: currentSessionId,
                role: 'ia', // Backend uses 'ia' or 'assistant'
                text: data.response
            });

            // 4. Update UI
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: data.response,
                timestamp: Date.now()
            }]);

        } catch (error) {
            console.error("Director Error:", error);
            toast.error("Error del Director.");
            setMessages(prev => [...prev, {
                id: 'err-' + Date.now(),
                role: 'system',
                text: 'Error de conexión con el Director.',
                timestamp: Date.now(),
                isError: true
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed right-4 top-20 bottom-4 w-96 bg-titanium-950/95 backdrop-blur-xl border border-titanium-800 rounded-xl shadow-2xl flex flex-col overflow-hidden z-50 animate-in slide-in-from-right duration-300">
            {/* HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-sm font-bold uppercase tracking-widest text-titanium-100">Director</h2>
                </div>
                <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                    <X size={16} />
                </button>
            </div>

            {/* MESSAGES AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoadingHistory ? (
                    <div className="flex justify-center items-center h-full text-titanium-500">
                        <Loader2 className="animate-spin" />
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                            <div className={`
                                w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                ${msg.role === 'user' ? 'bg-cyan-900/50 text-cyan-400' :
                                  msg.role === 'system' ? 'bg-red-900/50 text-red-400' : 'bg-emerald-900/50 text-emerald-400'}
                            `}>
                                {msg.role === 'user' ? <User size={14} /> : msg.role === 'system' ? <X size={14} /> : <Bot size={14} />}
                            </div>
                            <div className={`
                                p-3 rounded-xl text-sm max-w-[85%] leading-relaxed
                                ${msg.role === 'user'
                                    ? 'bg-cyan-950/30 border border-cyan-900/50 text-cyan-100'
                                    : msg.role === 'system'
                                      ? 'bg-red-950/30 border border-red-900/50 text-red-200'
                                      : 'bg-titanium-900/50 border border-titanium-800 text-titanium-200'}
                            `}>
                                {msg.text}
                            </div>
                        </div>
                    ))
                )}

                {isThinking && (
                    <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center shrink-0">
                             <Loader2 size={14} className="animate-spin text-emerald-400" />
                        </div>
                        <div className="bg-titanium-900/50 border border-titanium-800 rounded-xl p-3 text-xs text-titanium-500 italic">
                            Analizando estructura...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* INPUT AREA */}
            <div className="p-4 border-t border-titanium-800 bg-titanium-900/30">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSendMessage(inputValue);
                    }}
                    className="flex gap-2"
                >
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Escribe al director..."
                        className="flex-1 bg-titanium-950 border border-titanium-800 rounded-lg px-4 py-2 text-sm text-titanium-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                        autoFocus
                    />
                    <button
                        type="submit"
                        disabled={!inputValue.trim() || isThinking}
                        className="bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800 text-emerald-400 p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DirectorPanel;
