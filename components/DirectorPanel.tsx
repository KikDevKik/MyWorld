import React, { useState, useEffect, useRef } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { X, Plus, Clapperboard, Send, Loader2, MessageSquare, Trash2, Bot, User, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ForgeSession, GemId } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { GEMS } from '../constants';

interface DirectorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (sessionId: string | null) => void;
    pendingMessage?: string | null;
    onClearPendingMessage?: () => void;
    activeFileContent?: string;
    activeFileName?: string;
    folderId?: string; // 👈 Project ID for Isolation
    isFallbackContext?: boolean; // 👈 Context Fallback
}

interface Message {
    id?: string;
    role: 'user' | 'model';
    text: string;
    timestamp?: string;
}

const DirectorPanel: React.FC<DirectorPanelProps> = ({
    isOpen,
    onClose,
    activeSessionId,
    onSessionSelect,
    pendingMessage,
    onClearPendingMessage,
    activeFileContent,
    activeFileName,
    folderId,
    isFallbackContext
}) => {
    const [sessions, setSessions] = useState<ForgeSession[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [isSending, setIsSending] = useState(false);

    // ERROR STATES
    const [sessionError, setSessionError] = useState(false);
    const [historyError, setHistoryError] = useState(false);
    const [historyRetryTrigger, setHistoryRetryTrigger] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // HELPER: SAFE DATE FORMATTER
    const formatSessionDate = (dateString: string | undefined): string => {
        if (!dateString) return "Reciente";
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return "Reciente";
        return date.toLocaleDateString();
    };

    // 1. FETCH SESSIONS (Director Type)
    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        setSessionError(false);
        const functions = getFunctions();
        const getForgeSessions = httpsCallable(functions, 'getForgeSessions');
        try {
            const result = await getForgeSessions({ type: 'director' });
            setSessions(result.data as ForgeSession[]);
        } catch (error) {
            console.error("Error fetching director sessions:", error);
            setSessionError(true);
            toast.error("Error al cargar historial.");
        } finally {
            setIsLoadingSessions(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchSessions();
    }, [isOpen]);

    // 2. LOAD ACTIVE SESSION HISTORY
    useEffect(() => {
        if (!activeSessionId) {
            setMessages([]);
            setHistoryError(false);
            return;
        }

        const loadHistory = async () => {
            setIsLoadingHistory(true);
            setHistoryError(false);
            const functions = getFunctions();
            const getForgeHistory = httpsCallable(functions, 'getForgeHistory');
            try {
                const result = await getForgeHistory({ sessionId: activeSessionId });
                setMessages(result.data as Message[]);
            } catch (error) {
                console.error("Error loading history:", error);
                setHistoryError(true);
                toast.error("Error al cargar mensajes.");
            } finally {
                setIsLoadingHistory(false);
            }
        };
        loadHistory();
    }, [activeSessionId, historyRetryTrigger]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // 3. CREATE NEW SESSION
    const handleCreateSession = async () => {
        const functions = getFunctions();
        const createForgeSession = httpsCallable(functions, 'createForgeSession');
        const name = `Sesión Director ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

        try {
            const result = await createForgeSession({ name, type: 'director' });
            // 🟢 SAFE MAPPING (For fallback)
            const data = result.data as any;
            const newSession: ForgeSession = {
                id: data.id || data.sessionId, // Check both for compatibility
                name: data.name,
                type: data.type || 'director',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: data.updatedAt || new Date().toISOString()
            };

            if (!newSession.id) throw new Error("Backend returned no ID");

            setSessions(prev => [newSession, ...prev]);
            onSessionSelect(newSession.id);
            return newSession.id;
        } catch (error) {
            console.error("Error creating session:", error);
            toast.error("Error al iniciar sesión.");
            return null;
        }
    };

    // 4. DELETE SESSION
    const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!sessionId) {
            toast.error("Error: Sesión inválida.");
            // Clean up invalid session from UI
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            return;
        }

        if (!confirm("¿Borrar historial?")) return;

        const functions = getFunctions();
        const deleteForgeSession = httpsCallable(functions, 'deleteForgeSession');

        try {
            await deleteForgeSession({ sessionId });
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (activeSessionId === sessionId) onSessionSelect(null);
            toast.success("Eliminado.");
        } catch (error) {
            console.error("Error deleting session:", error);
            toast.error("Error al borrar.");
        }
    };

    // 🟢 6. HANDOFF LISTENER
    useEffect(() => {
        if (isOpen && pendingMessage && !isSending) {
            handleSendMessage(pendingMessage);
            if (onClearPendingMessage) onClearPendingMessage();
        }
    }, [isOpen, pendingMessage]);

    // 5. SEND MESSAGE
    const handleSendMessage = async (overrideText?: string) => {
        const text = overrideText || inputValue.trim();
        if (!text || isSending) return;

        setInputValue('');
        setIsSending(true);

        // A. Ensure session exists
        let targetSessionId = activeSessionId;
        if (!targetSessionId) {
            targetSessionId = await handleCreateSession();
            if (!targetSessionId) {
                setIsSending(false);
                toast.error("No se pudo crear la sesión.");
                return;
            }
        }

        // Optimistic UI
        setMessages(prev => [...prev, { role: 'user', text }]);

        const functions = getFunctions();
        const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
        const chatWithGem = httpsCallable(functions, 'chatWithGem', { timeout: 540000 }); // 👈 9 minute timeout

        try {
            // Save User Msg
            await addForgeMessage({ sessionId: targetSessionId, role: 'user', text });

            // Call AI
            // Construct context from recent messages
            const historyContext = messages.map(m => ({ role: m.role, message: m.text }));
            historyContext.push({ role: 'user', message: text });

            // Use 'director' gem config
            const directorGem = GEMS['director'];

            const aiResponse: any = await chatWithGem({
                query: text,
                history: historyContext,
                systemInstruction: directorGem.systemInstruction,
                activeFileContent: activeFileContent || "", // 🟢 PASS ACTIVE CONTENT
                activeFileName: "", // 🟢 BLIND DIRECTOR: Force Global Search (No Exclusion)
                projectId: folderId || undefined, // 👈 STRICT ISOLATION
                isFallbackContext: isFallbackContext // 👈 Pass Flag
            });

            let aiText = aiResponse.data.response;
            const sources = aiResponse.data.sources;

            // 🟢 APPEND SOURCES (NUEVO FORMATO HÍBRIDO)
            let citations = [];
            if (activeFileName) {
                const label = isFallbackContext ? "**Contexto de Fondo:**" : "**Editando:**";
                citations.push(`> 🟢 ${label} ${activeFileName}`);
            }
            if (sources && sources.length > 0) {
                const sourceList = sources.map((s: any) => s.fileName).join(', ');
                citations.push(`> 📚 **Memoria:** ${sourceList}`);
            }

            if (citations.length > 0) {
                aiText += `\n\n---\n${citations.join('\n')}`;
            }

            // Update UI & Save
            setMessages(prev => [...prev, { role: 'model', text: aiText }]);
            await addForgeMessage({ sessionId: targetSessionId, role: 'model', text: aiText });

            // Refresh sessions list order (update updatedAt)
            fetchSessions();

        } catch (error) {
            console.error("Chat error:", error);
            toast.error("Error de conexión con el Director.");
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    return (
        <div
            className={`fixed top-0 bottom-0 right-16 z-[100] bg-[#0a0a0a] shadow-2xl transition-transform duration-300 border-l border-titanium-800 flex flex-col w-[90vw] md:w-[60vw] min-w-[320px] md:min-w-[800px] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            {/* HEADER */}
            <div className="h-14 border-b border-titanium-800 flex items-center justify-between px-4 bg-titanium-900 shrink-0">
                <div className="flex items-center gap-3 text-titanium-100">
                    <Clapperboard size={20} className="text-accent-DEFAULT" />
                    <span className="font-bold tracking-wide">Director de Escena</span>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-titanium-800 rounded-lg text-titanium-400 hover:text-white transition-colors">
                    <X size={20} />
                </button>
            </div>

            {/* MAIN CONTENT GRID */}
            <div className="flex-1 flex min-h-0">

                {/* LEFT COL: HISTORY (30%) */}
                <div className="w-[30%] border-r border-titanium-800 flex flex-col bg-titanium-900/50">
                    <div className="p-3 border-b border-titanium-800 shrink-0">
                        <button
                            onClick={() => { handleCreateSession(); }}
                            className="w-full flex items-center justify-center gap-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 py-2 rounded-lg text-xs font-bold transition-colors border border-titanium-700"
                        >
                            <Plus size={14} />
                            <span>Nuevo Chat</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-hide">
                        {isLoadingSessions ? (
                            <div className="flex justify-center p-4"><Loader2 className="animate-spin text-titanium-600" size={16} /></div>
                        ) : sessionError ? (
                            <div className="flex flex-col items-center justify-center p-6 gap-2 text-titanium-600">
                                <span className="text-xs">Error al cargar</span>
                                <button
                                    onClick={fetchSessions}
                                    className="p-2 hover:bg-titanium-800 rounded-full hover:text-titanium-200 transition-colors"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        ) : sessions.length === 0 ? (
                            <div className="text-center p-4 text-xs text-titanium-600">Sin historial</div>
                        ) : (
                            sessions.map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => onSessionSelect(session.id)}
                                    className={`group relative p-3 rounded-lg cursor-pointer transition-all border ${activeSessionId === session.id ? 'bg-titanium-800 border-titanium-700 text-titanium-100' : 'hover:bg-titanium-800/50 border-transparent text-titanium-400'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <MessageSquare size={12} className={activeSessionId === session.id ? 'text-accent-DEFAULT' : 'text-titanium-600'} />
                                        <span className="text-xs font-medium truncate w-24 block">{session.name}</span>
                                    </div>
                                    <span className="text-[10px] text-titanium-600 block">
                                        {formatSessionDate(session.updatedAt)}
                                    </span>

                                    <button
                                        onClick={(e) => handleDeleteSession(session.id, e)}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 text-titanium-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* RIGHT COL: CHAT (70%) */}
                <div className="flex-1 flex flex-col bg-titanium-950 min-w-0">

                    {/* MESSAGES AREA */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">
                        {!activeSessionId ? (
                            <div className="h-full flex flex-col items-center justify-center text-titanium-600 space-y-4 opacity-50">
                                <Clapperboard size={48} />
                                <p className="text-sm">Selecciona o crea una sesión</p>
                            </div>
                        ) : isLoadingHistory ? (
                            <div className="flex justify-center p-10"><Loader2 className="animate-spin text-accent-DEFAULT" /></div>
                        ) : historyError ? (
                            <div className="h-full flex flex-col items-center justify-center text-titanium-600 space-y-4">
                                <p className="text-sm">Error al cargar historial</p>
                                <button
                                    onClick={() => setHistoryRetryTrigger(prev => prev + 1)}
                                    className="flex items-center gap-2 px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 rounded-lg text-xs font-bold transition-colors border border-titanium-700"
                                >
                                    <RefreshCw size={14} />
                                    <span>Reintentar</span>
                                </button>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="text-center p-10 text-titanium-600 text-sm">
                                La escena está vacía. Da tus instrucciones, Director.
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'model' && (
                                        <div className="w-8 h-8 rounded-full bg-accent-DEFAULT/10 flex items-center justify-center shrink-0 border border-accent-DEFAULT/20">
                                            <Bot size={14} className="text-accent-DEFAULT" />
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                            ? 'bg-titanium-800 text-titanium-100 rounded-br-none border border-titanium-700'
                                            : 'bg-titanium-900 text-titanium-200 rounded-bl-none border border-titanium-800'
                                        }`}
                                    >
                                        <div className="prose prose-invert prose-sm max-w-none">
                                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-titanium-800 flex items-center justify-center shrink-0 border border-titanium-700">
                                            <User size={14} className="text-titanium-400" />
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                        {isSending && (
                             <div className="flex gap-3 justify-start">
                                <div className="w-8 h-8 rounded-full bg-accent-DEFAULT/10 flex items-center justify-center shrink-0 border border-accent-DEFAULT/20">
                                    <Bot size={14} className="text-accent-DEFAULT" />
                                </div>
                                <div className="bg-titanium-900 px-4 py-3 rounded-2xl rounded-bl-none border border-titanium-800 flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-titanium-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* INPUT AREA */}
                    <div className="p-4 border-t border-titanium-800 bg-titanium-900/30">
                        <div className="relative">
                            <textarea
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={activeSessionId ? "Escribe al Director..." : "Escribe para iniciar..."}
                                className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT transition-all resize-none h-[52px] max-h-[150px] overflow-y-auto scrollbar-hide"
                                disabled={isSending}
                            />
                            <button
                                onClick={() => handleSendMessage()}
                                disabled={!inputValue.trim() || isSending}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-titanium-800 text-titanium-400 rounded-lg hover:bg-accent-DEFAULT hover:text-titanium-950 disabled:opacity-50 disabled:hover:bg-titanium-800 disabled:hover:text-titanium-400 transition-all"
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default DirectorPanel;
