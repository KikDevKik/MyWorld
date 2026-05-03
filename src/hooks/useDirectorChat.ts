import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';
import { ChatMessageData } from '../types/director';
import { fileToGenerativePart } from '../services/geminiService';
import { CreativeAuditService } from '../services/CreativeAuditService';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface UseDirectorChatProps {
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    activeFileContent?: string;
    activeFileName?: string;
    isFallbackContext?: boolean;
    driftAlerts?: any;
    accessToken?: string | null; // 🟢 Added accessToken
    folderId?: string;
    userId?: string;
}

export const useDirectorChat = ({
    activeSessionId,
    onSessionSelect,
    activeFileContent,
    activeFileName,
    isFallbackContext,
    driftAlerts,
    accessToken,
    folderId,
    userId
}: UseDirectorChatProps) => {

    const [messages, setMessages] = useState<ChatMessageData[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [purgingIds, setPurgingIds] = useState<Set<string>>(new Set());
    const [rescuingIds, setRescuingIds] = useState<Set<string>>(new Set());

    const { currentLanguage } = useLanguageStore();
    const tDir = TRANSLATIONS[currentLanguage].director;

    // 🟢 OPTIMISTIC UI STORE
    // Stores messages that are being processed during session initialization
    // to prevent history re-fetch from wiping them out.
    const pendingOptimisticUpdates = useRef<ChatMessageData[]>([]);

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

                    // 🟢 MERGE PENDING OPTIMISTIC MESSAGES
                    // If we have messages that were added locally while waiting for session/history, re-inject them.
                    if (pendingOptimisticUpdates.current.length > 0) {
                        const existingIds = new Set(formatted.map(m => m.id));
                        // Deduplication by Content (Role + Text) for recent messages to catch ID shifts
                        const recentSignatures = new Set(
                            formatted.slice(-20).map(m => `${m.role}:${m.text.trim()}`)
                        );

                        const uniquePending = pendingOptimisticUpdates.current.filter(m => {
                            if (existingIds.has(m.id)) return false;
                            const signature = `${m.role}:${m.text.trim()}`;
                            return !recentSignatures.has(signature);
                        });

                        formatted.push(...uniquePending);
                    }

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
                    text: tDir.directorOnline,
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
                            text: `Se detectaron ${alerts.length} ${tDir.ecosCritical} en '${category}'.`,
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
    const handleSendMessage = async (text: string, attachment: File | null = null) => {
        if (!text.trim() && !attachment) return;

        const tempId = Date.now().toString();
        let previewUrl: string | undefined = undefined;

        if (attachment) {
            previewUrl = URL.createObjectURL(attachment);
        }

        const newUserMsg: ChatMessageData = {
            id: tempId,
            role: 'user',
            text: text,
            timestamp: Date.now(),
            type: 'text',
            attachmentPreview: previewUrl,
            attachmentType: attachment?.type.startsWith('audio') ? 'audio' : 'image'
        };

        // 🟢 OPTIMISTIC UPDATE: Show immediately
        pendingOptimisticUpdates.current.push(newUserMsg);
        setMessages(prev => [...prev, newUserMsg]);
        setIsThinking(true);

        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setTimeout(() => {
                const mockResponses = [
                    "El ritmo de la escena decae en el segundo párrafo. Sugiero cortar el diálogo interno.",
                    "La tensión visual es buena, pero el conflicto subyacente necesita más claridad.",
                    "Interesante uso de la iluminación. ¿Has considerado enfocar la cámara en sus manos?"
                ];
                const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];

                const botMsg: ChatMessageData = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    text: response,
                    timestamp: Date.now(),
                    type: 'text'
                };

                setMessages(prev => [...prev, botMsg]);
                setIsThinking(false);
                // Clear pending since we are done
                pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
            }, 1500);
            return;
        }

        try {
            // 🟢 AWAIT SESSION (Background)
            const currentSessionId = await ensureSession();
            if (!currentSessionId) {
                throw new Error("No se pudo iniciar la sesión.");
            }

            // Prepare attachment
            let mediaPart = undefined;
            if (attachment) {
                try {
                    const part = await fileToGenerativePart(attachment);
                    mediaPart = part.inlineData;
                } catch (e) {
                    console.error(e);
                    toast.error("Error procesando adjunto.");
                    setIsThinking(false);
                    return;
                }
            }

            await callFunction('addForgeMessage', { sessionId: currentSessionId, role: 'user', text: text });

            // Message is now saved, we can safely remove it from pending list eventually,
            // but keeping it until response ensures stability if history reloads again.

            // 🟢 PREPARE HISTORY CONTEXT
            // We pass the last 20 messages to give the AI conversational memory.
            const historyPayload = messages
                .filter(m => m.role !== 'system' && !m.isError) // Exclude system alerts and errors
                .slice(-20) // Limit to last 20 to save bandwidth
                .map(m => ({
                    role: m.role,
                    message: m.text
                }));

            const data = await callFunction<{ response: string }>('chatWithGem', {
                query: text,
                sessionId: currentSessionId,
                activeFileContent,
                activeFileName,
                isFallbackContext,
                mediaAttachment: mediaPart,
                history: historyPayload, // 🟢 INJECT HISTORY
                systemInstruction: `Eres El Director de MyWorld, un copiloto narrativo socrático dentro de un IDE de escritura creativa.

QUIÉN ERES:
- Eres un espejo activo, no un escritor por encargo
- Tu rol es hacerle preguntas que desbloqueen al escritor
- Hablas de escenas, personajes, motivaciones y estructura narrativa
- Tono cálido pero directo — como un editor experimentado que respeta al autor

QUIÉN NO ERES:
- NO eres director de fotografía ni hablas de "planos", "frames", "diseño sonoro" o terminología cinematográfica/audiovisual
- NO escribes escenas o diálogos para que el usuario los copie
- NO das instrucciones técnicas de cine
- NO generas contenido creativo sin que el usuario lo haya sembrado primero

TU MÉTODO:
- Si el usuario trae un problema narrativo: haz 1-3 preguntas específicas que lo ayuden a encontrar su propia respuesta
- Si el usuario pregunta algo concreto: responde concisamente y devuelve la iniciativa con una pregunta
- Si hay una alerta de Eco (Drift) en el historial: abórdala profesionalmente en términos de coherencia narrativa, no de producción audiovisual

VOCABULARIO CORRECTO: arco, motivación, tensión, ritmo, punto de giro, subtexto, personaje, escena, diálogo, conflicto, tema, voz narrativa, perspectiva
VOCABULARIO PROHIBIDO: plano, frame, encuadre, iluminación cinematográfica, diseño sonoro, corte, montaje (en sentido fílmico), cámara`

            });

            // 🟢 AUDIT: TRACK AI GENERATION
            if (folderId && userId) {
                CreativeAuditService.updateAuditStats(folderId, userId, 0, data.response.length);
            }

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
            // 🟢 CLEANUP: Remove from pending now that flow is complete
            pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
        }
    };

    // 🟢 INSPECTOR (READ ONLY)
    const handleInspector = async (fileId?: string) => {
        if (!fileId && import.meta.env.VITE_JULES_MODE !== 'true') {
             toast.error("Guarda el archivo en Drive para usar el Inspector.");
             return;
        }

        const tempId = Date.now().toString();

        // 🟢 OPTIMISTIC UPDATE: Show immediately
        const initMsg: ChatMessageData = {
            id: tempId,
            role: 'system',
            text: import.meta.env.VITE_JULES_MODE === 'true' ? `${tDir.analyzingCast} (Modo Fantasma)...` : `${tDir.analyzingCast} (Modo Lectura)...`,
            timestamp: Date.now(),
            type: 'system_alert'
        };

        pendingOptimisticUpdates.current.push(initMsg);
        setMessages(prev => [...prev, initMsg]);
        setIsThinking(true);

        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
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
                pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
            }, 2000);
            return;
        }

        try {
            const sid = await ensureSession();
            if (!sid) throw new Error("No session");

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
            // 🟢 CLEANUP
            pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
        }
    };

    // 🟢 TRIBUNAL (FALLBACK INTELLIGENCE)
    const handleTribunal = async (selectedText?: string | null) => {
        const textToAnalyze = selectedText || activeFileContent;

        if (!textToAnalyze) {
            toast.warning("No hay texto para juzgar.");
            return;
        }

        const tempId = Date.now().toString();

        // 🟢 OPTIMISTIC UPDATE
        const initMsg: ChatMessageData = {
            id: tempId,
            role: 'system',
            text: import.meta.env.VITE_JULES_MODE === 'true' ? "Convocando al Tribunal (Modo Fantasma)..." : "Convocando al Tribunal...",
            timestamp: Date.now(),
            type: 'system_alert'
        };

        pendingOptimisticUpdates.current.push(initMsg);
        setMessages(prev => [...prev, initMsg]);
        setIsThinking(true);

        // 👻 GHOST MODE: SIMULATION
        if (import.meta.env.VITE_JULES_MODE === 'true') {
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
                            text: tDir.verdict,
                            type: 'verdict_card',
                            verdictData: mockVerdict
                        };
                    }
                    return m;
                }));
                setIsThinking(false);
                pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
            }, 2000);
            return;
        }

        try {
            const sid = await ensureSession();
            if (!sid) throw new Error("No session");

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
                text: `${tDir.verdict} Emitido`,
            });

            setMessages(prev => prev.map(m => {
                if (m.id === tempId) {
                    return {
                        ...m,
                        text: tDir.verdict,
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
            // 🟢 CLEANUP
            pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
        }
    };

    // 🟢 CONTEXT SYNC (CLIENT SIDE)
    const handleContextSync = async () => {
        if (!activeFileContent) {
            toast.warning("No hay contenido para sincronizar.");
            return;
        }

        const snippet = activeFileContent.length > 500
            ? activeFileContent.slice(-500) + "..."
            : activeFileContent;

        const systemMsg = `CONTEXTO ACTUALIZADO: El usuario está trabajando en este fragmento: "${snippet}". Ajusta tus consejos a este contenido.`;

        // 🟢 OPTIMISTIC UPDATE
        const tempId = `ctx-${Date.now()}`;
        const initMsg: ChatMessageData = {
            id: tempId,
            role: 'system',
            text: `Sinapsis Completada: Contexto local actualizado (${activeFileContent.length} caracteres).`,
            type: 'system_alert',
            timestamp: Date.now()
        };

        pendingOptimisticUpdates.current.push(initMsg);
        setMessages(prev => [...prev, initMsg]);

        const sid = await ensureSession();
        if (sid) {
            callFunction('addForgeMessage', {
                sessionId: sid,
                role: 'system',
                text: systemMsg
            }).catch(e => console.error("Context Log Error", e));
        }

        // Cleanup after delay or immediately?
        // Since this is a simple fire-and-forget, we can clear it reasonably quickly or just leave it.
        // It's just a system alert.
        setTimeout(() => {
             pendingOptimisticUpdates.current = pendingOptimisticUpdates.current.filter(m => m.id !== tempId);
        }, 5000);
    };

    // 🟢 RESCUE & PURGE HANDLERS
    const handleRescue = useCallback(async (drift: any, msgId: string, category: string) => {
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
    }, []);

    const handlePurge = useCallback(async (drift: any, msgId: string) => {
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
    }, []);

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
