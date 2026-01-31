import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';
import { ChatMessageData } from '../components/director/chat/ChatMessage';

interface UseDirectorChatProps {
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    activeFileContent?: string;
    activeFileName?: string;
    isFallbackContext?: boolean;
    driftAlerts?: any;
    accessToken?: string | null; // 🟢 Added accessToken
}

export const useDirectorChat = ({
    activeSessionId,
    onSessionSelect,
    activeFileContent,
    activeFileName,
    isFallbackContext,
    driftAlerts,
    accessToken
}: UseDirectorChatProps) => {

    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [purgingIds, setPurgingIds] = useState<Set<string>>(new Set());
    const [rescuingIds, setRescuingIds] = useState<Set<string>>(new Set());

    // 🟢 INIT SESSION HELPER
    const ensureSession = useCallback(async (): Promise<string | null> => {
        if (activeSessionId) return activeSessionId;

        try {
            const data = await callFunction<{ sessionId: string }>('createForgeSession', { name: `Director ${new Date().toLocaleDateString()}`, type: 'director' });
            onSessionSelect(data.sessionId);
            return data.sessionId;
        } catch (error) {
            console.error("Failed to create session:", error);
            // toast.error("Error iniciando sesión del Director."); // Handled by api.ts for known errors
            return null;
        }
    }, [activeSessionId, onSessionSelect]);

    // 🟢 LOAD HISTORY
    useEffect(() => {
        const loadHistory = async () => {
            if (activeSessionId) {
                setIsLoadingHistory(true);
                try {
                    const history = await callFunction<any[]>('getForgeHistory', { sessionId: activeSessionId });

                    const formatted: ChatMessageData[] = history.map(h => {
                         let type: ChatMessageData['type'] = 'text';
                         if (h.isInspectorReport) type = 'analysis_card';
                         else if (h.isDriftAlert) type = 'text'; // Fallback drift logic handles UI via legacy flags

                         return {
                            id: h.id || Math.random().toString(),
                            role: h.role === 'ia' ? 'assistant' : (h.role === 'user' ? 'user' : 'system'),
                            text: h.text,
                            timestamp: h.timestamp,
                            type: type,
                            // Legacy flags
                            isInspectorReport: h.isInspectorReport,
                            inspectorData: h.inspectorData,
                            isDriftAlert: h.isDriftAlert,
                            driftData: h.driftData,
                            driftCategory: h.driftCategory
                        };
                    });
                    setMessages(formatted);
                } catch (error) {
                    console.error("Failed to load history:", error);
                    toast.error("Error cargando historial.");
                } finally {
                    setIsLoadingHistory(false);
                }
            } else {
                setMessages([{
                    id: 'intro',
                    role: 'assistant',
                    text: 'Director de Escena en línea. ¿En qué puedo ayudarte con la estructura o el tono de la escena actual?',
                    timestamp: Date.now(),
                    type: 'text'
                }]);
            }
        };
        loadHistory();
    }, [activeSessionId]);

    // 🟢 INJECT DRIFT ALERTS
    useEffect(() => {
        if (driftAlerts && Object.keys(driftAlerts).length > 0) {
            const newAlertMessages: ChatMessageData[] = [];

            Object.entries(driftAlerts).forEach(([category, alerts]: [string, any]) => {
                if (Array.isArray(alerts) && alerts.length > 0) {
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
                                items: alerts,
                                category: category
                            },
                            type: 'text'
                        });
                    } else {
                        alerts.forEach((alert: any, idx: number) => {
                             newAlertMessages.push({
                                id: `drift-${category}-${Date.now()}-${idx}`,
                                role: 'system',
                                text: "DRIFT DETECTED",
                                timestamp: Date.now(),
                                isDriftAlert: true,
                                driftCategory: category,
                                driftData: alert,
                                type: 'text'
                            });
                        });
                    }
                }
            });

            if (newAlertMessages.length > 0) {
                setMessages(prev => {
                     const existingIds = new Set(prev.map(m => m.id));
                     const uniqueNew = newAlertMessages.filter(m => !existingIds.has(m.id));
                     return [...prev, ...uniqueNew];
                });
            }
        }
    }, [driftAlerts]);

    // 🟢 SEND MESSAGE
    const handleSendMessage = async (text: string) => {
        if (!text.trim()) return;

        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            const tempId = Date.now().toString();
            setMessages(prev => [...prev, {
                id: tempId,
                role: 'user',
                text: text,
                timestamp: Date.now(),
                type: 'text'
            }]);

            setIsThinking(true);
            setTimeout(() => {
                const mockResponses = [
                    "El ritmo de la escena decae en el segundo párrafo. Sugiero cortar el diálogo interno.",
                    "La tensión visual es buena, pero el conflicto subyacente necesita más claridad.",
                    "Interesante uso de la iluminación. ¿Has considerado enfocar la cámara en sus manos?"
                ];
                const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];

                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    text: response,
                    timestamp: Date.now(),
                    type: 'text'
                }]);
                setIsThinking(false);
            }, 1500);
            return;
        }

        const currentSessionId = await ensureSession();
        if (!currentSessionId) return;

        const tempId = Date.now().toString();
        const newUserMsg: ChatMessageData = {
            id: tempId,
            role: 'user',
            text: text,
            timestamp: Date.now(),
            type: 'text'
        };

        setMessages(prev => [...prev, newUserMsg]);
        setIsThinking(true);

        try {
            await callFunction('addForgeMessage', { sessionId: currentSessionId, role: 'user', text: text });

            const data = await callFunction<{ response: string }>('chatWithGem', {
                query: text,
                sessionId: currentSessionId,
                activeFileContent,
                activeFileName,
                isFallbackContext,
                systemInstruction: "ACT AS: Director of Photography and Narrative Structure. Focus on pacing, tone, and visual composition. Keep responses concise and actionable. If you see a Drift Alert in history, address it professionally."
            });

            await callFunction('addForgeMessage', { sessionId: currentSessionId, role: 'ia', text: data.response });

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: data.response,
                timestamp: Date.now(),
                type: 'text'
            }]);

        } catch (error: any) {
            console.error("Director Error:", error);
            if (!error.message?.includes('INVALID_CUSTOM_KEY')) {
                toast.error("Error del Director.");
            }
            setMessages(prev => [...prev, {
                id: 'err-' + Date.now(),
                role: 'system',
                text: 'Error de conexión con el Director.',
                timestamp: Date.now(),
                isError: true,
                type: 'text'
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    // 🟢 INSPECTOR (READ ONLY)
    const handleInspector = async (fileId?: string) => {
        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setIsThinking(true);
            const tempId = Date.now().toString();
            setMessages(prev => [...prev, {
                id: tempId,
                role: 'system',
                text: "Analizando Elenco (Modo Fantasma)...",
                timestamp: Date.now(),
                type: 'system_alert'
            }]);

            setTimeout(() => {
                const mockReport = {
                    characters: [
                        { name: "Capitán Vega", role: "Protagonista", archetype: "Líder Cansado" },
                        { name: "IA Madre", role: "Soporte", archetype: "Observador Pasivo" },
                        { name: "Teniente Ruiz", role: "Secundario", archetype: "Heraldo de Malas Noticias" }
                    ],
                    pacing: "Rápido",
                    tone: "Tenso/Misterioso"
                };

                setMessages(prev => prev.map(m => {
                    if (m.id === tempId) {
                        return {
                            ...m,
                            text: "Reporte de Inspector Generado",
                            type: 'analysis_card',
                            inspectorData: mockReport
                        };
                    }
                    return m;
                }));
                setIsThinking(false);
            }, 2000);
            return;
        }

        if (!fileId) {
             toast.error("Guarda el archivo en Drive para usar el Inspector.");
             return;
        }

        const sid = await ensureSession();
        if (!sid) return;

        setIsThinking(true);
        const tempId = Date.now().toString();

        setMessages(prev => [...prev, {
            id: tempId,
            role: 'system',
            text: "Analizando Elenco (Modo Lectura)...",
            timestamp: Date.now(),
            type: 'system_alert'
        }]);

        try {
            await callFunction('addForgeMessage', { sessionId: sid, role: 'user', text: "[ACTION: INSPECTOR INVOKED]" });

            // Call Backend
            const data = await callFunction<any>('forgeAnalyzer', {
                 fileId: fileId,
                 accessToken: accessToken // Passed from props
            });

            // Save implicit history?
             await callFunction('addForgeMessage', {
                sessionId: sid,
                role: 'system',
                text: "Reporte de Inspector Generado (Visualizado en UI)",
            });

            setMessages(prev => prev.map(m => {
                if (m.id === tempId) {
                    return {
                        ...m,
                        text: "Reporte de Inspector Generado",
                        type: 'analysis_card',
                        inspectorData: data
                    };
                }
                return m;
            }));

        } catch (e: any) {
            console.error("Inspector Error", e);
            toast.error(`Fallo del Inspector: ${e.message}`);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setIsThinking(false);
        }
    };

    // 🟢 TRIBUNAL (FALLBACK INTELLIGENCE)
    const handleTribunal = async (selectedText?: string | null) => {
        const textToAnalyze = selectedText || activeFileContent;

        if (!textToAnalyze) {
            toast.warning("No hay texto para juzgar.");
            return;
        }

        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setIsThinking(true);
            const tempId = Date.now().toString();
            setMessages(prev => [...prev, {
                id: tempId,
                role: 'system',
                text: "Convocando al Tribunal (Modo Fantasma)...",
                timestamp: Date.now(),
                type: 'system_alert'
            }]);

            setTimeout(() => {
                const mockVerdict = {
                    verdict: "Aprobado con Reservas",
                    score: 85,
                    critique: "El diálogo es funcional pero carece de subtexto. La acción es clara.",
                    suggestions: ["Añadir pausas", "Romper el ritmo"]
                };

                setMessages(prev => prev.map(m => {
                    if (m.id === tempId) {
                        return {
                            ...m,
                            text: "Veredicto del Tribunal",
                            type: 'verdict_card',
                            verdictData: mockVerdict
                        };
                    }
                    return m;
                }));
                setIsThinking(false);
            }, 2000);
            return;
        }

        const sid = await ensureSession();
        if (!sid) return;

        setIsThinking(true);
        const tempId = Date.now().toString();

        setMessages(prev => [...prev, {
            id: tempId,
            role: 'system',
            text: "Convocando al Tribunal...",
            timestamp: Date.now(),
            type: 'system_alert'
        }]);

        try {
            await callFunction('addForgeMessage', { sessionId: sid, role: 'user', text: "[ACTION: TRIBUNAL SUMMONED]" });

            // Smart Slicing (Max 3000 chars if full content)
            let finalPayload = textToAnalyze;
            if (!selectedText && textToAnalyze.length > 3000) {
                finalPayload = textToAnalyze.slice(-3000);
            }

            const verdictData = await callFunction<any>('summonTheTribunal', {
                text: finalPayload,
                context: "Director Panel Quick Judgment"
            });

            await callFunction('addForgeMessage', {
                sessionId: sid,
                role: 'system',
                text: "Veredicto del Tribunal Emitido",
            });

            setMessages(prev => prev.map(m => {
                if (m.id === tempId) {
                    return {
                        ...m,
                        text: "Veredicto del Tribunal",
                        type: 'verdict_card',
                        verdictData: verdictData
                    };
                }
                return m;
            }));

        } catch (e) {
            console.error(e);
            toast.error("El Tribunal está en receso (Error).");
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setIsThinking(false);
        }
    };

    // 🟢 CONTEXT SYNC (CLIENT SIDE)
    const handleContextSync = async () => {
        if (!activeFileContent) {
            toast.warning("No hay contenido para sincronizar.");
            return;
        }

        const sid = await ensureSession();

        const snippet = activeFileContent.length > 500
            ? activeFileContent.slice(-500) + "..."
            : activeFileContent;

        const systemMsg = `CONTEXTO ACTUALIZADO: El usuario está trabajando en este fragmento: "${snippet}". Ajusta tus consejos a este contenido.`;

        setMessages(prev => [...prev, {
            id: `ctx-${Date.now()}`,
            role: 'system',
            text: `Sinapsis Completada: Contexto local actualizado (${activeFileContent.length} caracteres).`,
            type: 'system_alert',
            timestamp: Date.now()
        }]);

        if (sid) {
            callFunction('addForgeMessage', {
                sessionId: sid,
                role: 'system',
                text: systemMsg
            }).catch(e => console.error("Context Log Error", e));
        }
    };

    // 🟢 RESCUE & PURGE HANDLERS
    const handleRescue = async (drift: any, msgId: string, category: string) => {
        if (!drift?.chunkPath) {
            toast.error("Error: No se puede rescatar (Falta Path).");
            return;
        }

        const toastId = toast.loading("Rescatando eco...");
        setRescuingIds(prev => new Set(prev).add(msgId));

        try {
            const data = await callFunction<any>('rescueEcho', { chunkPath: drift.chunkPath, driftCategory: category });

            toast.success("Eco rescatado.", { id: toastId });

            setMessages(prev => prev.map(m => {
                if (m.id === msgId) {
                    return {
                        ...m,
                        text: `⚠️ ${data.meta?.warning_code || 'ADVERTENCIA'}: Fragmento rescatado pero inestable.`,
                        type: 'system_alert',
                        isDriftAlert: false
                    };
                }
                return m;
            }));

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

    const handlePurge = async (drift: any, msgId: string) => {
        if (!drift?.chunkPath) return;

        if(!confirm("¿CONFIRMAS LA PURGA?")) return;

        const toastId = toast.loading("Purgando eco...");
        setPurgingIds(prev => new Set(prev).add(msgId));

        try {
             await callFunction('purgeEcho', { chunkPath: drift.chunkPath });
             toast.success("Eco purgado.", { id: toastId });

             setMessages(prev => prev.map(m => {
                 if (m.id === msgId) {
                     return { ...m, text: "Eco eliminado del Canon.", type: 'system_alert', isDriftAlert: false };
                 }
                 return m;
             }));

        } catch (e: any) {
             toast.error(`Error purgando: ${e.message}`, { id: toastId });
        } finally {
             setPurgingIds(prev => {
                 const next = new Set(prev);
                 next.delete(msgId);
                 return next;
             });
        }
    };

    return {
        messages,
        isThinking,
        isLoadingHistory,
        rescuingIds,
        purgingIds,
        handleSendMessage,
        handleInspector,
        handleTribunal,
        handleContextSync,
        handleRescue,
        handlePurge
    };
};
