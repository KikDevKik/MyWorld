import { useState, useCallback, useRef, useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useArquitectoStore } from '../stores/useArquitectoStore';
import { callFunction } from '../services/api';
import { toast } from 'sonner';
import { useProjectConfig } from '../contexts/ProjectConfigContext';

export interface PendingItem {
    code: string;
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    relatedFiles?: string[];
    category: 'continuidad' | 'worldbuilding' | 'personaje' | 'cronologia' | 'estructura';
}

export interface ArquitectoMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp: number;
    mode?: string;
}

interface UseArquitectoProps {
    accessToken: string | null;
    folderId: string;
}

export const useArquitecto = ({ accessToken, folderId }: UseArquitectoProps) => {
    const { config, updateConfig } = useProjectConfig();
    const [messages, setMessages] = useState<ArquitectoMessage[]>([]);
    const [pendingItems, setPendingItems] = useState<PendingItem[]>(() => useArquitectoStore.getState().arquitectoPendingItems || []);
    const [projectSummary, setProjectSummary] = useState<string>(() => useArquitectoStore.getState().arquitectoSummary || config?.arquitectoSummary || '');
    const {
        arquitectoSessionId: sessionId,
        setArquitectoSessionId: setSessionId,
        arquitectoHasInitialized: hasInitialized,
        setArquitectoHasInitialized: setHasInitialized
    } = useArquitectoStore();
    const [isInitializing, setIsInitializing] = useState(false);
    const [isThinking, setIsThinking] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);

    // Ghost mode simulation
    const isGhostMode = import.meta.env.VITE_JULES_MODE === 'true';

    // 🟢 Fix A: Restauración al montar (Persistencia)
    useEffect(() => {
        const cachedItems = useArquitectoStore.getState().arquitectoPendingItems;
        const cachedSummary = useArquitectoStore.getState().arquitectoSummary || config?.arquitectoSummary;

        if (cachedItems && cachedItems.length > 0) {
            setPendingItems(cachedItems);
            // Mensaje provisional — se reemplaza con historial real en initialize()
            setMessages([{
                id: 'cache-restored',
                role: 'assistant',
                text: '📋 Análisis restaurado. Cargando historial...',
                timestamp: Date.now()
            }]);
        }
        if (cachedSummary) {
            setProjectSummary(cachedSummary);
        }
    }, []); // 👈 Solo al montar el hook

    const initialize = useCallback(async () => {
        if (hasInitialized || isInitializing) return;
        if (!accessToken) {
            toast.error("Conecta Google Drive primero.");
            return;
        }

        setIsInitializing(true);

        const lastAnalysis = config?.lastArquitectoAnalysis;
        const lastUpdate = config?.lastSignificantUpdate;
        const cachedItems = config?.arquitectoCachedPendingItems || [];

        // 🟢 RESTAURACIÓN INMEDIATA (Síncrona para el UI)
        if (lastAnalysis || cachedItems.length > 0) {
            setPendingItems(cachedItems);
            useArquitectoStore.getState().setArquitectoPendingItems(cachedItems);
            useLayoutStore.getState().setArquitectoWidgetVisible(true);
            setProjectSummary(config?.arquitectoSummary || '');
            setLastAnalyzedAt(lastAnalysis);
            setHasInitialized(true);

            // 🔍 Búsqueda de sesión en segundo plano para habilitar chat/re-analyze
            callFunction<any[]>('getForgeSessions', { type: 'arquitecto' })
                .then(async sessions => {
                    let resolvedSessionId: string | null = null;
                    if (sessions && sessions.length > 0) {
                        resolvedSessionId = sessions[0].id;
                        setSessionId(resolvedSessionId);
                    }

                    // 🟢 Bug 2 Fix: Cargar historial real de Firestore
                    const sidForHistory = resolvedSessionId || useArquitectoStore.getState().arquitectoSessionId;
                    if (sidForHistory) {
                        try {
                            const history = await callFunction<any[]>('getForgeHistory', { sessionId: sidForHistory });
                            if (history && history.length > 0) {
                                const mapped: ArquitectoMessage[] = history.map((m: any) => ({
                                    id: m.id,
                                    role: m.role as ArquitectoMessage['role'],
                                    text: m.text || '',
                                    timestamp: m.timestamp?.toMillis ? m.timestamp.toMillis() : (m.timestamp || Date.now()),
                                    mode: m.mode
                                }));
                                setMessages(mapped);
                                return; // Historial cargado — no poner mensaje de sistema
                            }
                        } catch (err) {
                            console.warn('[Arquitecto] Error cargando historial:', err);
                        }
                    }

                    // Fallback: sin historial, poner mensaje de restauración estático
                    const isOutdated = lastUpdate && lastAnalysis ? lastUpdate > lastAnalysis : false;
                    setMessages([{
                        id: 'restored',
                        role: 'assistant',
                        text: isOutdated
                            ? '📋 Análisis previo restaurado. He detectado cambios recientes en el proyecto, te sugiero re-analizar.'
                            : '📋 Análisis restaurado. No hubo cambios desde el último análisis.',
                        timestamp: Date.now()
                    }]);
                })
                .catch(err => console.warn("Error background session fetch:", err))
                .finally(() => setIsInitializing(false));

            return;
        }

        // Ghost Mode
        if (isGhostMode) {
            setTimeout(() => {
                const mockPending: PendingItem[] = [
                    {
                        code: 'ERR-001',
                        severity: 'critical',
                        title: 'Contradicción en la cronología del Domo',
                        description: 'El archivo "Era del Odio.md" establece que el Domo fue creado hace 400 años, pero "Contexto Zoorians.md" menciona 350 años.',
                        relatedFiles: ['Era del Odio.md', 'Contexto Zoorians.md'],
                        category: 'cronologia'
                    },
                    {
                        code: 'WRN-001',
                        severity: 'warning',
                        title: 'Motivación de Daniel sin documentar',
                        description: 'Daniel busca redención pero no hay archivo que establezca qué crimen cometió específicamente.',
                        relatedFiles: ['Daniel.md'],
                        category: 'personaje'
                    },
                    {
                        code: 'SUG-001',
                        severity: 'suggestion',
                        title: 'Definir el nombre de la Era Actual',
                        description: 'La era post-GardenFlowers no tiene nombre definido. Un nombre reforzaría la identidad temática de la saga.',
                        category: 'worldbuilding'
                    }
                ];
                const mockSession = `ghost-session-${Date.now()}`;
                const mockMessage = "El Arquitecto en línea. He analizado tu proyecto y encontré 1 problema crítico y 2 advertencias. ¿Quieres que empecemos por las contradicciones de cronología o prefieres trabajar el arco de algún personaje específico?";
                const now = new Date().toISOString();

                // 🟢 PERSISTENCIA GHOST: Guardar en Firestore para que el caché funcione al recargar
                updateConfig({
                    ...config,
                    lastArquitectoAnalysis: now,
                    arquitectoCachedPendingItems: mockPending
                } as any);

                setSessionId(mockSession);
                setPendingItems(mockPending);
                useArquitectoStore.getState().setArquitectoPendingItems(mockPending);
                useLayoutStore.getState().setArquitectoWidgetVisible(true);
                setProjectSummary("Proyecto con worldbuilding sólido pero con algunas inconsistencias cronológicas y personajes con motivaciones poco documentadas.");
                useArquitectoStore.getState().setArquitectoSummary("Proyecto con worldbuilding sólido pero con algunas inconsistencias cronológicas y personajes con motivaciones poco documentadas.");
                setMessages([{
                    id: 'init',
                    role: 'assistant',
                    text: mockMessage,
                    timestamp: Date.now()
                }]);
                setHasInitialized(true);
                setIsInitializing(false);
                setLastAnalyzedAt(now);
            }, 2000);
            return;
        }

        try {
            const data = await callFunction<any>('arquitectoInitialize', { accessToken });

            if (!data) throw new Error("Sin respuesta del servidor.");

            setSessionId(data.sessionId);
            setPendingItems(data.pendingItems || []);
            useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems || []);
            useLayoutStore.getState().setArquitectoWidgetVisible(true);
            setProjectSummary(data.projectSummary || '');
            useArquitectoStore.getState().setArquitectoSummary(data.projectSummary || '');
            setLastAnalyzedAt(data.lastAnalyzedAt);
            setMessages([{
                id: 'init',
                role: 'assistant',
                text: data.initialMessage,
                timestamp: Date.now()
            }]);
            setHasInitialized(true);

        } catch (error) {
            console.error("Arquitecto init error:", error);
            toast.error("El Arquitecto no pudo inicializarse.");
        } finally {
            setIsInitializing(false);
        }
    }, [accessToken, hasInitialized, isInitializing, isGhostMode]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isThinking) return;
        if (!sessionId) {
            toast.error("Sesión no iniciada.");
            return;
        }

        const userMsg: ArquitectoMessage = {
            id: Date.now().toString(),
            role: 'user',
            text,
            timestamp: Date.now()
        };

        setMessages(prev => [...prev, userMsg]);
        setIsThinking(true);

        // Ghost Mode
        if (isGhostMode) {
            setTimeout(() => {
                const mockResponses = [
                    "Buena pregunta. Antes de responder necesito entender mejor el contexto: ¿en qué libro de la saga ocurre esto específicamente?",
                    "Eso tiene implicaciones interesantes en el Efecto Dominó. Si el Domo se debilita, ¿qué consecuencia inmediata tendría para los Errantes que ya existen?",
                    "El arco de ese personaje tiene un hueco en la motivación. Te pregunto: ¿qué pierde este personaje si fracasa en su objetivo?"
                ];
                const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    text: response,
                    timestamp: Date.now(),
                    mode: 'general'
                }]);
                setIsThinking(false);
            }, 1500);
            return;
        }

        let currentSessionId = sessionId;

        // Si no hay sessionId, intentamos buscarla o inicializar
        if (!currentSessionId) {
            try {
                const sessions = await callFunction<any[]>('getForgeSessions', { type: 'arquitecto' });
                if (sessions && sessions.length > 0) {
                    currentSessionId = sessions[0].id;
                    setSessionId(currentSessionId);
                } else {
                    toast.error("Sesión no encontrada. Re-analiza el proyecto.");
                    setIsThinking(false);
                    return;
                }
            } catch (e) {
                toast.error("Error al recuperar la sesión.");
                setIsThinking(false);
                return;
            }
        }

        try {
            const historyPayload = messages
                .filter(m => m.role !== 'system')
                .slice(-10)
                .map(m => ({ role: m.role, message: m.text }));

            const data = await callFunction<any>('arquitectoChat', {
                query: text,
                sessionId,
                history: historyPayload,
                pendingItems,
                accessToken
            });

            if (!data) throw new Error("Sin respuesta.");

            const assistantMsg: ArquitectoMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: data.response,
                timestamp: Date.now(),
                mode: data.suggestedMode
            };

            setMessages(prev => [...prev, assistantMsg]);

            // 🟢 Bug 2 Fix: Persistir ambos mensajes en Firestore
            if (currentSessionId) {
                callFunction('addForgeMessage', { sessionId: currentSessionId, role: 'user', text }).catch(() => { });
                callFunction('addForgeMessage', { sessionId: currentSessionId, role: 'assistant', text: data.response }).catch(() => { });
            }

        } catch (error) {
            console.error("Arquitecto chat error:", error);
            toast.error("Error al comunicarse con El Arquitecto.");
        } finally {
            setIsThinking(false);
        }
    }, [sessionId, messages, pendingItems, accessToken, isThinking, isGhostMode]);

    const reAnalyze = useCallback(async () => {
        if (isAnalyzing) return;
        if (!accessToken) return;

        setIsAnalyzing(true);
        toast.loading("El Arquitecto está re-analizando el proyecto...", { id: 'arquitecto-analyze' });

        let currentSessionId = sessionId;

        try {
            // Si no hay sessionId, intentamos buscarla o crear una nueva via initialize
            if (!currentSessionId) {
                const sessions = await callFunction<any[]>('getForgeSessions', { type: 'arquitecto' });
                if (sessions && sessions.length > 0) {
                    currentSessionId = sessions[0].id;
                    setSessionId(currentSessionId);
                } else {
                    // Si realmente no hay sesión, llamamos a la función de inicialización del backend
                    const initData = await callFunction<any>('arquitectoInitialize', { accessToken });
                    currentSessionId = initData.sessionId;
                    setSessionId(currentSessionId);
                }
            }

            const data = await callFunction<any>('arquitectoAnalyze', {
                sessionId: currentSessionId,
                accessToken
            });

            if (!data) throw new Error("Sin respuesta.");

            setPendingItems(data.pendingItems || []);
            useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems || []);
            useLayoutStore.getState().setArquitectoWidgetVisible(true);
            setProjectSummary(data.projectSummary || '');
            useArquitectoStore.getState().setArquitectoSummary(data.projectSummary || '');
            setLastAnalyzedAt(data.analyzedAt);

            toast.success("Análisis actualizado.", { id: 'arquitecto-analyze' });

            // Mensaje de sistema en el chat
            setMessages(prev => [...prev, {
                id: `reanalyze-${Date.now()}`,
                role: 'system',
                text: `Análisis actualizado: ${data.pendingItems?.length || 0} pendientes encontrados.`,
                timestamp: Date.now()
            }]);

        } catch (error) {
            toast.error("Error al re-analizar.", { id: 'arquitecto-analyze' });
        } finally {
            setIsAnalyzing(false);
        }
    }, [sessionId, accessToken, isAnalyzing]);
    const isOutdated = config?.lastSignificantUpdate && lastAnalyzedAt
        ? config.lastSignificantUpdate > lastAnalyzedAt
        : false;

    return {
        messages,
        pendingItems,
        projectSummary,
        sessionId,
        isInitializing,
        isThinking,
        isAnalyzing,
        lastAnalyzedAt,
        hasInitialized,
        isOutdated,
        initialize,
        sendMessage,
        reAnalyze
    };
};
