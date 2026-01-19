import React, { useState, useEffect, useRef } from 'react';
import { X, Send, User, Bot, Loader2, RefreshCw, AlertTriangle, ShieldAlert, History, Archive, LayoutTemplate, Zap, Search, BrainCircuit, ChevronRight } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { useLayoutStore } from '../stores/useLayoutStore';
import { SessionManagerModal } from './SessionManagerModal';

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
    driftAlerts?: any; // 🟢 Updated Prop: Grouped Object { identity: [], geography: [], ... }
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp: any;
    isError?: boolean;
    isDriftAlert?: boolean; // 🟢 Flag for Drift UI
    driftData?: any;
    driftCategory?: string; // 🟢 Store category for display
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
    accessToken,
    driftAlerts
}) => {
    // 🟢 GLOBAL STORE
    const { isArsenalWide, toggleArsenalWidth } = useLayoutStore();

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [purgingIds, setPurgingIds] = useState<Set<string>>(new Set()); // 🟢 Purge State
    const [rescuingIds, setRescuingIds] = useState<Set<string>>(new Set()); // 🟢 Rescue State

    // 🟢 NEW STATES (Director V2)
    const [isSessionManagerOpen, setIsSessionManagerOpen] = useState(false);
    const [driftScore, setDriftScore] = useState(100);

    const functions = getFunctions();
    const getForgeHistory = httpsCallable(functions, 'getForgeHistory');
    const addForgeMessage = httpsCallable(functions, 'addForgeMessage');
    const createForgeSession = httpsCallable(functions, 'createForgeSession');
    const chatWithGem = httpsCallable(functions, 'chatWithGem');
    const purgeEcho = httpsCallable(functions, 'purgeEcho');
    const rescueEcho = httpsCallable(functions, 'rescueEcho'); // 🟢 Rescue Function
    const forgeAnalyzer = httpsCallable(functions, 'forgeAnalyzer');

    // 🟢 CALCULATE DRIFT SCORE (Director V2)
    useEffect(() => {
        if (!driftAlerts) {
            setDriftScore(100);
            return;
        }

        let penalty = 0;
        Object.values(driftAlerts).forEach((alerts: any) => {
            if (Array.isArray(alerts)) {
                alerts.forEach((alert: any) => {
                    if (alert.severity === 'critical' || alert.drift_score > 0.7) {
                        penalty += 20;
                    } else {
                        penalty += 5;
                    }
                });
            }
        });

        setDriftScore(Math.max(0, 100 - penalty));
    }, [driftAlerts]);

    // 🟢 INJECT DRIFT ALERTS (The Bridge)
    useEffect(() => {
        if (driftAlerts && Object.keys(driftAlerts).length > 0) {
            const newAlertMessages: Message[] = [];

            // Flatten grouped alerts into messages
            // Categories: identity, geography, continuity, uncategorized
            Object.entries(driftAlerts).forEach(([category, alerts]) => {
                if (Array.isArray(alerts) && alerts.length > 0) {

                    // Create a Summary Card first? Or individual cards?
                    // User asked for: "Director will show: 'Se detectaron 12 Ecos Críticos en 'Personajes'. ¿Desea revisarlos?'"
                    // But also "Group Echoes".
                    // The simplest approach is to render individual cards for the *top* alerts, as scanProjectDrift limits to 20.
                    // Or render a "Group Card" that expands?
                    // Given current UI structure (chat stream), individual cards for critical items is better,
                    // maybe grouped visually if possible, but let's stick to simple cards for now.
                    // Actually, let's create ONE summary card per category if count > 1.

                    if (alerts.length > 1) {
                         newAlertMessages.push({
                            id: `drift-group-${category}-${Date.now()}`,
                            role: 'system',
                            text: `Se detectaron ${alerts.length} Ecos Críticos en '${category}'.`,
                            timestamp: Date.now(),
                            isDriftAlert: true,
                            driftCategory: category,
                            driftData: {
                                isGroup: true,
                                count: alerts.length,
                                items: alerts, // Pass all items in this group
                                category: category
                            }
                        });
                    } else {
                        // Single item
                        alerts.forEach((alert: any, idx: number) => {
                             newAlertMessages.push({
                                id: `drift-${category}-${Date.now()}-${idx}`,
                                role: 'system',
                                text: "DRIFT DETECTED",
                                timestamp: Date.now(),
                                isDriftAlert: true,
                                driftCategory: category,
                                driftData: alert
                            });
                        });
                    }
                }
            });

            // Only add if we have something
            if (newAlertMessages.length > 0) {
                setMessages(prev => {
                     // Filter out existing drift alerts to prevent dupes on re-render?
                     // Or assume parent only sends non-null driftAlerts once.
                     // A simple de-dupe check:
                     const existingIds = new Set(prev.map(m => m.id));
                     const uniqueNew = newAlertMessages.filter(m => !existingIds.has(m.id));
                     return [...prev, ...uniqueNew];
                });
            }
        }
    }, [driftAlerts]);

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

    // 🟢 QUICK ACTION: RECALL CONTEXT
    const handleRecallContext = async () => {
        if (!activeFileContent) {
            toast.warning("No hay archivo activo para recordar.");
            return;
        }

        const sid = await ensureSession();
        if (!sid) return;

        const systemMsg = `[SYSTEM UPDATE] Contexto Refrescado. Archivo Activo: ${activeFileName}. Snippet: ${activeFileContent.substring(0, 300)}...`;

        // Optimistic UI
        setMessages(prev => [...prev, {
            id: `sys-${Date.now()}`,
            role: 'system',
            text: "🧠 Contexto inmediato actualizado.",
            timestamp: Date.now()
        }]);

        // Silent Backend Update
        try {
             await addForgeMessage({
                sessionId: sid,
                role: 'system', // Backend uses 'system' for invisible prompts? Or 'user'? Let's use 'system' context injection.
                text: systemMsg
            });
            toast.success("Memoria de corto plazo actualizada.");
        } catch (e) {
            console.error(e);
        }
    };

    // 🟢 QUICK ACTION: ANALYZE SCENE
    const handleAnalyzeScene = async () => {
        if (!activeFileContent) {
             toast.warning("Abre una escena para analizar.");
             return;
        }

        // Only works if file is saved in Drive (needs fileId).
        // We have 'activeFileContent' passed from Editor, but 'fileId' might be needed.
        // Actually, 'forgeAnalyzer' takes 'fileId'.
        // Does DirectorPanel know 'currentFileId'?
        // It receives 'folderId', 'activeFileName', 'activeFileContent'.
        // It doesn't seem to receive 'activeFileId' explicitly in props!
        // Wait, 'DirectorPanelProps' has 'activeFileContent' and 'activeFileName'.
        // It does NOT have 'activeFileId'.

        // WORKAROUND: We can't use forgeAnalyzer on *unsaved* content easily unless we change the cloud function.
        // Or we pass the fileId prop.
        // Assuming user saves. But I can't call forgeAnalyzer without fileId.

        // Alternative: Ask the Director (Chat) to analyze the *text* provided in context.
        handleSendMessage("🔍 Analiza la escena actual (Contexto Activo). Identifica tono, ritmo y conflictos latentes.");
    };

    const handlePurge = async (drift: any, msgId: string) => {
        if (!drift?.chunkPath) {
             toast.error("Error: No se puede purgar (Falta Path).");
             return;
        }

        if(!confirm("¿CONFIRMAS LA PURGA? Esto eliminará el fragmento del índice vectorial (Nivel 1). El archivo original en Drive NO será tocado.")) {
            return;
        }

        const toastId = toast.loading("Purgando eco...");
        setPurgingIds(prev => new Set(prev).add(msgId));

        try {
             await purgeEcho({ chunkPath: drift.chunkPath });
             toast.success("Eco purgado correctamente.", { id: toastId });

             // Update UI to show "PURGED" status
             setMessages(prev => prev.map(m => {
                 if (m.id === msgId) {
                     return { ...m, text: "Eco eliminado del Canon.", isDriftAlert: false, role: 'system' };
                 }
                 return m;
             }));

        } catch (e: any) {
             console.error("Purge Failed:", e);
             toast.error(`Error purgando: ${e.message}`, { id: toastId });
        } finally {
             setPurgingIds(prev => {
                 const next = new Set(prev);
                 next.delete(msgId);
                 return next;
             });
        }
    };

    const handleRescue = async (drift: any, msgId: string, category: string = 'General') => {
        if (!drift?.chunkPath) {
            toast.error("Error: No se puede rescatar (Falta Path).");
            return;
        }

        const toastId = toast.loading("Rescatando eco...");
        setRescuingIds(prev => new Set(prev).add(msgId));

        try {
            // 🟢 CALL BACKEND RESCUE
            const result = await rescueEcho({ chunkPath: drift.chunkPath, driftCategory: category });
            const data = (result.data as any);

            toast.success("Eco rescatado. Archivo marcado como 'En Conflicto'.", { id: toastId });

            // Update UI to show WARNING status instead of alert
            setMessages(prev => prev.map(m => {
                if (m.id === msgId) {
                    return {
                        ...m,
                        text: `⚠️ ${data.meta?.warning_code || 'ADVERTENCIA'}: Fragmento rescatado pero inestable.`,
                        isDriftAlert: false,
                        role: 'system' // Demote to system message
                    };
                }
                return m;
            }));

            // Optionally inject the author instruction as a new message from 'assistant'
            if (data.meta?.author_instruction) {
                setMessages(prev => [...prev, {
                    id: `warn-${Date.now()}`,
                    role: 'assistant',
                    text: `⚠️ Nota del Arquitecto: ${data.meta.author_instruction}`,
                    timestamp: Date.now()
                }]);
            }

        } catch (e: any) {
            console.error("Rescue Failed:", e);
            toast.error(`Error rescatando: ${e.message}`, { id: toastId });
        } finally {
            setRescuingIds(prev => {
                const next = new Set(prev);
                next.delete(msgId);
                return next;
            });
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
                systemInstruction: "ACT AS: Director of Photography and Narrative Structure. Focus on pacing, tone, and visual composition. Keep responses concise and actionable. If you see a Drift Alert in history, address it professionally."
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

    const getDriftColor = () => {
        if (driftScore >= 80) return "text-emerald-500";
        if (driftScore >= 50) return "text-amber-500";
        return "text-red-500";
    };

    return (
        <div className="w-full h-full bg-titanium-950/95 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 relative">

            {/* 🟢 SESSION MANAGER MODAL */}
            <SessionManagerModal
                isOpen={isSessionManagerOpen}
                onClose={() => setIsSessionManagerOpen(false)}
                activeSessionId={activeSessionId}
                onSessionSelect={onSessionSelect}
            />

            {/* HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-3">
                    {/* Status Ring */}
                    <div className="relative w-8 h-8 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className="text-titanium-800" />
                            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" fill="transparent" className={getDriftColor()} strokeDasharray={88} strokeDashoffset={88 - (88 * driftScore) / 100} />
                        </svg>
                        <span className={`absolute text-[9px] font-bold ${getDriftColor()}`}>{Math.round(driftScore)}</span>
                    </div>

                    <div>
                         <h2 className="text-sm font-bold uppercase tracking-widest text-titanium-100 leading-none">Director</h2>
                         <div className="text-[9px] text-titanium-500 uppercase tracking-wider mt-0.5">
                             {activeSessionId ? 'Sesión Activa' : 'Standby'}
                         </div>
                    </div>
                </div>

                <div className="flex gap-1">
                    {/* HISTORY BUTTON */}
                    <button
                        onClick={() => setIsSessionManagerOpen(true)}
                        className="p-1.5 text-titanium-300 hover:text-cyan-400 transition-colors rounded hover:bg-titanium-800"
                        title="Archivos de Sesión"
                    >
                        <Archive size={16} />
                    </button>

                    {/* WIDE MODE TOGGLE */}
                    <button
                        onClick={toggleArsenalWidth}
                        className={`p-1.5 transition-colors rounded hover:bg-titanium-800 ${isArsenalWide ? 'text-cyan-400' : 'text-titanium-400 hover:text-white'}`}
                        title="Modo Estratega (Expandir)"
                    >
                        <LayoutTemplate size={16} />
                    </button>

                    <button
                        onClick={onClose}
                        className="p-1.5 text-titanium-400 hover:text-red-400 transition-colors rounded hover:bg-titanium-800 ml-2"
                        aria-label="Close Director"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* MESSAGES AREA */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {isLoadingHistory ? (
                    <div className="flex justify-center items-center h-full text-titanium-500">
                        <Loader2 className="animate-spin" />
                    </div>
                ) : (
                    messages.map((msg) => {
                        // 🟢 RENDER DRIFT ALERT CARD (SINGLE OR GROUP)
                        if (msg.isDriftAlert && msg.driftData) {

                            // A) GROUP CARD
                            if (msg.driftData.isGroup) {
                                return (
                                    <div key={msg.id} className="mx-auto w-[95%] bg-amber-950/20 border border-amber-500/50 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
                                        <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold text-xs uppercase">
                                            <AlertTriangle size={14} />
                                            <span>Grupo de Conflicto: {msg.driftData.category}</span>
                                            <span className="ml-auto bg-amber-900/50 px-1.5 py-0.5 rounded text-[10px] text-white">
                                                {msg.driftData.count} Ecos
                                            </span>
                                        </div>
                                        <p className="text-titanium-300 text-xs mb-3">
                                            {msg.text}
                                        </p>
                                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                            {msg.driftData.items.map((item: any, subIdx: number) => (
                                                <div key={subIdx} className="bg-titanium-900/50 p-2 rounded border border-titanium-800/50">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="text-[10px] text-red-400 font-mono font-bold">Drift: {item.drift_score.toFixed(2)}</span>
                                                        <span className="text-[10px] text-titanium-500 truncate max-w-[100px]">{item.fileName}</span>
                                                    </div>
                                                    <p className="text-[10px] text-titanium-400 italic mb-2 line-clamp-2">"{item.snippet}"</p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleRescue(item, `${msg.id}-${subIdx}`, msg.driftData.category)}
                                                            disabled={rescuingIds.has(`${msg.id}-${subIdx}`)}
                                                            className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                                        >
                                                            {rescuingIds.has(`${msg.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Rescatar"}
                                                        </button>
                                                        <button
                                                            onClick={() => handlePurge(item, `${msg.id}-${subIdx}`)}
                                                            disabled={purgingIds.has(`${msg.id}-${subIdx}`)}
                                                            className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                                        >
                                                            {purgingIds.has(`${msg.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Purgar"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }

                            // B) SINGLE CARD
                            const isPurging = purgingIds.has(msg.id);
                            const isRescuing = rescuingIds.has(msg.id);

                            return (
                                <div key={msg.id} className="mx-auto w-[90%] bg-red-950/20 border border-red-500/50 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex items-center gap-2 mb-2 text-red-400 font-bold text-xs uppercase">
                                        <ShieldAlert size={14} className="animate-pulse" />
                                        <span>Eco Crítico: {msg.driftCategory || 'General'}</span>
                                        <span className="ml-auto bg-red-900/50 px-1.5 py-0.5 rounded text-[10px] text-white">
                                            Drift: {msg.driftData.drift_score?.toFixed(2) || '?.??'}
                                        </span>
                                    </div>

                                    <p className="text-titanium-300 text-xs italic mb-3 border-l-2 border-red-800 pl-2 line-clamp-3">
                                        "{msg.driftData.snippet || msg.driftData.reason || '...'}"
                                    </p>

                                    {msg.driftData.fileName && (
                                        <div className="text-[10px] text-titanium-500 font-mono mb-3 truncate">
                                            Archivo: {msg.driftData.fileName}
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRescue(msg.driftData, msg.id, msg.driftCategory)}
                                            disabled={isRescuing}
                                            className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                        >
                                            {isRescuing ? <Loader2 size={10} className="animate-spin" /> : "Rescatar"}
                                        </button>
                                        <button
                                            onClick={() => handlePurge(msg.driftData, msg.id)}
                                            disabled={isPurging}
                                            className="flex-1 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                        >
                                            {isPurging ? <Loader2 size={10} className="animate-spin" /> : <AlertTriangle size={10} />}
                                            Purgar Eco
                                        </button>
                                    </div>
                                </div>
                            );
                        }

                        // STANDARD MESSAGE
                        return (
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
                    );})
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
            <div className="pt-4 px-4 pb-10 border-t border-titanium-800 bg-titanium-900/30 flex flex-col gap-3">

                {/* 🟢 QUICK ACTIONS BAR */}
                <div className="flex gap-2 mb-3">
                    <button
                        onClick={handleAnalyzeScene}
                        disabled={isThinking}
                        className="flex-1 bg-titanium-800/50 hover:bg-titanium-800 text-titanium-300 py-1.5 px-3 rounded text-[10px] uppercase font-bold border border-titanium-700/50 hover:border-cyan-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        <Search size={12} /> Analizar Escena
                    </button>
                    <button
                        onClick={handleRecallContext}
                        disabled={isThinking}
                        className="flex-1 bg-titanium-800/50 hover:bg-titanium-800 text-titanium-300 py-1.5 px-3 rounded text-[10px] uppercase font-bold border border-titanium-700/50 hover:border-emerald-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        <BrainCircuit size={12} /> Recordar Contexto
                    </button>
                </div>

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
                        className="bg-emerald-900/30 hover:bg-emerald-900/50 border border-emerald-800 text-emerald-400 p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                        aria-label="Send message"
                    >
                        <Send size={16} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DirectorPanel;
