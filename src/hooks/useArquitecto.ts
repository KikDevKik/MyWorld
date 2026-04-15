import { useState, useCallback, useRef, useEffect } from 'react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useArquitectoStore } from '../stores/useArquitectoStore';
import { callFunction } from '../services/api';
import { toast } from 'sonner';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { PendingItem, RoadmapCard, RoadmapImpact } from '../types/roadmap';
import { getFirestore, collection, query, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

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

    // ── Sprint 4.1: Nuevos estados reactivos ──
    const [roadmapCards, setRoadmapCards] = useState<RoadmapCard[]>([]);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);
    const [pendingDominoImpact, setPendingDominoImpact] = useState<RoadmapImpact | null>(null);
    const [isRecalculating, setIsRecalculating] = useState(false);

    // Sprint 5.4: Objetivo Actual (Foco)
    const [currentObjective, setCurrentObjective] = useState<string | null>(null);

    // ★ NUEVOS estados — Sprint 6.0 (Motor Socrático)
    const [lastDetectedIntent, setLastDetectedIntent] = useState<'DEBATE' | 'RESOLUCION' | 'REFUTACION' | 'CONSULTA' | null>(null);
    const [pendingDrivePatches, setPendingDrivePatches] = useState<Array<{
        documentName: string;
        driveFileId: string | null;
        newRuleStatement: string;
    }>>([]);
    const [focusMode, setFocusMode] = useState<'TRIAGE' | 'MACRO' | 'MESO' | 'MICRO'>('TRIAGE');
    const [severityMode, setSeverityMode] = useState<'HIGH' | 'MEDIUM' | 'LOW' | 'ALL'>('ALL');
    const [implementationGoal, setImplementationGoal] = useState<string>('');

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

    // Sprint 6.4: Sesión existente para WelcomeState
    const [existingSession, setExistingSession] = useState<{
        id: string;
        name: string;
        lastUpdatedAt: string;
        resolvedCount: number;
        pendingCount: number;
    } | null>(null);

    // Ghost mode simulation
    const isGhostMode = import.meta.env.VITE_JULES_MODE === 'true';

    // Sprint 6.4: Detectar sesión existente al montar (solo una vez)
    useEffect(() => {
        if (isGhostMode) return;
        callFunction<any[]>('getForgeSessions', { type: 'arquitecto' })
            .then((sessions) => {
                if (!sessions || sessions.length === 0) {
                    setExistingSession(null);
                    return;
                }
                // Filtrar sesiones archivadas en el cliente
                const activeSessions = sessions.filter((s: any) => s.status !== 'archived');
                if (activeSessions.length === 0) {
                    setExistingSession(null);
                    return;
                }
                const latest = activeSessions[0];
                const daysSince = (Date.now() - new Date(latest.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
                if (daysSince > 30) {
                    setExistingSession(null);
                    return;
                }
                const items: any[] = latest.pendingItems || [];
                setExistingSession({
                    id: latest.id,
                    name: latest.name || latest.projectName || 'Sesión anterior',
                    lastUpdatedAt: latest.updatedAt,
                    resolvedCount: items.filter((i: any) => i.resolved === true).length,
                    pendingCount: items.filter((i: any) => !i.resolved).length,
                });
            })
            .catch(() => setExistingSession(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Sprint 4.1 & 5.4: onSnapshot al Roadmap activo y su Objetivo ──
    // Se activa cuando hay sessionId y lo desuscribe al cambiar sesión o desmontar.
    useEffect(() => {
        if (!sessionId || isGhostMode) return;

        const auth = getAuth();
        const userId = auth.currentUser?.uid;
        if (!userId) return;

        const db = getFirestore();
        
        // Documento raíz de la sesión para pendingItems
        const sessionDocRef = doc(db, 'users', userId, 'forge_sessions', sessionId);
        
        // Documento de roadmap y tarjetas
        const roadmapDocRef = doc(
            db,
            'users', userId,
            'forge_sessions', sessionId,
            'architect', 'roadmap'
        );

        const cardsRef = collection(roadmapDocRef, 'cards');
        const cardsQuery = query(cardsRef, orderBy('order', 'asc'));

        // 1. Snapshot para pendingItems (Session)
        const unsubscribeSession = onSnapshot(
            sessionDocRef,
            (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.pendingItems) {
                        setPendingItems(data.pendingItems);
                        useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems);
                    }
                    if (data.pendingDrivePatches !== undefined) {
                        setPendingDrivePatches(data.pendingDrivePatches || []);
                    }
                }
            },
            (err) => {
                console.warn('[Arquitecto] onSnapshot session/pendingItems falló:', err.message);
            }
        );

        // 2. Snapshot para Roadmap Cards
        const unsubscribeCards = onSnapshot(
            cardsQuery,
            (snap) => {
                const cards = snap.docs.map(d => d.data() as RoadmapCard);
                setRoadmapCards(cards);
            },
            (err) => {
                console.warn('[Arquitecto] onSnapshot roadmap/cards falló:', err.message);
            }
        );

        // 3. Snapshot para Objetivo actual
        const unsubscribeObjective = onSnapshot(
            roadmapDocRef,
            (snap) => {
                if (snap.exists()) {
                    setCurrentObjective(snap.data().objective || null);
                } else {
                    setCurrentObjective(null);
                }
            },
            (err) => {
                console.warn('[Arquitecto] onSnapshot roadmap doc falló:', err.message);
            }
        );

        return () => {
            unsubscribeSession();
            unsubscribeCards();
            unsubscribeObjective();
        };
    }, [sessionId, isGhostMode]);

    const initialize = useCallback(async (options?: {
        implementationGoal?: string;
        culturalDocument?: {
            fileName: string;
            fileData: string;
            mimeType: string;
        } | null;
        forcedFocusMode?: ArquitectoFocusMode;
        forcedSeverityMode?: ArquitectoSeverityMode;
    }) => {
        if (hasInitialized || isInitializing || !folderId) return;
        if (!accessToken) {
            toast.error("Conecta Google Drive primero.");
            return;
        }

        setIsInitializing(true);

        // ═══ VERIFICACIÓN DE SESIÓN EXISTENTE ═══
        // Antes de llamar al backend, verificar si hay una sesión reciente
        try {
            const sessions = await callFunction<any[]>('getForgeSessions', { type: 'arquitecto' });
            
            if (sessions && sessions.length > 0) {
                const latestSession = sessions[0]; // Ya ordenadas por updatedAt desc
                const sessionUpdateTimestamp = new Date(latestSession.updatedAt).getTime();
                const hoursElapsed = (Date.now() - sessionUpdateTimestamp) / (1000 * 60 * 60);
                
                // Si la sesión tiene menos de 24 horas, restaurar sin re-analizar
                if (hoursElapsed < 24 && latestSession.pendingItems?.length > 0) {
                    console.log("🔄 [ARQUITECTO] Restaurando sesión existente...");
                    
                    setSessionId(latestSession.id);
                    setPendingItems(latestSession.pendingItems || []);
                    useArquitectoStore.getState().setArquitectoPendingItems(latestSession.pendingItems || []);
                    useLayoutStore.getState().setArquitectoWidgetVisible(true);
                    setProjectSummary(latestSession.projectSummary || '');
                    setLastAnalyzedAt(latestSession.lastAnalyzedAt);
                    
                    // Verificar si hay cambios recientes en el proyecto
                    const lastAnalysis = latestSession.lastAnalyzedAt;
                    const lastUpdate = config?.lastSignificantUpdate;
                    const isOutdated = lastUpdate && lastAnalysis ? lastUpdate > lastAnalysis : false;
                    
                    const restorationMessage = isOutdated
                        ? "He restaurado el análisis anterior. Detecto cambios recientes en tu proyecto. ¿Quieres que re-analice o continuamos desde donde lo dejamos?"
                        : "Análisis restaurado. Continuamos donde lo dejamos. " + 
                          (latestSession.snapshot?.lastCriticalAlert?.socraticQuestion || 
                           "¿En qué aspecto del proyecto trabajamos hoy?");
                    
                    setMessages([{
                        id: 'restored-' + Date.now(),
                        role: 'assistant',
                        text: restorationMessage,
                        timestamp: Date.now()
                    }]);
                    
                    setHasInitialized(true);
                    setIsInitializing(false);
                    return;
                }
            }
        } catch (e) {
            console.warn("[ARQUITECTO] No se pudo verificar sesiones existentes:", e);
            // Continuar con inicialización normal
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
            const data = await callFunction<any>('arquitectoInitialize', { 
                accessToken,
                projectId: folderId,
                focusMode: options?.forcedFocusMode || focusMode,
                severityMode: options?.forcedSeverityMode || severityMode,
                implementationGoal: options?.implementationGoal || implementationGoal,
                culturalDocument: options?.culturalDocument || null
            });

            if (!data) throw new Error("Sin respuesta del servidor.");

            // setMessages PRIMERO para que hasInitialized=true lo encuentre poblado
            if (data.initialMessage) {
                setMessages([{
                    id: 'init-' + Date.now(),
                    role: 'assistant',
                    text: data.initialMessage,
                    timestamp: Date.now()
                }]);
            }

            setSessionId(data.sessionId);
            setPendingItems(data.pendingItems || []);
            useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems || []);
            useLayoutStore.getState().setArquitectoWidgetVisible(true);
            setProjectSummary(data.projectSummary || '');
            useArquitectoStore.getState().setArquitectoSummary(data.projectSummary || '');
            setLastAnalyzedAt(data.lastAnalyzedAt);

            // Sprint 2: roadmapCards ya disponibles desde el backend
            if (data.roadmapCards && data.roadmapCards.length > 0) {
                setRoadmapCards(data.roadmapCards);
            }

            setHasInitialized(true); // SIEMPRE AL FINAL

        } catch (error) {
            console.error("Arquitecto init error:", error);
            setHasInitialized(true); // 🟢 CORTOCIRCUITO: Evita bucle infinito en error
            toast.error("El Arquitecto no pudo inicializarse.");
        } finally {
            setIsInitializing(false);
        }
    }, [accessToken, hasInitialized, isInitializing, isGhostMode, folderId, config, updateConfig, setSessionId, setPendingItems, setProjectSummary, setLastAnalyzedAt, setMessages, setRoadmapCards, focusMode, severityMode, implementationGoal]);

    const resumeSession = useCallback(async () => {
        if (!existingSession) return;
        setSessionId(existingSession.id);
        setHasInitialized(true);
    }, [existingSession, setSessionId, setHasInitialized]);

    const discardSession = useCallback(async () => {
        if (!existingSession) return;
        try {
            const { getFirestore: getFS, doc: fsDoc, setDoc: fsSetDoc } = await import('firebase/firestore');
            const { getAuth: getA } = await import('firebase/auth');
            const db = getFS();
            const userId = getA().currentUser?.uid;
            if (!userId) return;
            await fsSetDoc(
                fsDoc(db, 'users', userId, 'forge_sessions', existingSession.id),
                { status: 'archived', archivedAt: new Date().toISOString() },
                { merge: true }
            );
        } catch (e) {
            console.warn('[Arquitecto] No se pudo archivar la sesión:', e);
        }
        // Reset completo del estado local (setSessionId(null) desuscribe el onSnapshot)
        setExistingSession(null);
        setMessages([]);
        setPendingItems([]);
        setPendingDrivePatches([]);
        setRoadmapCards([]);
        setSessionId(null);
        setHasInitialized(false);
        setProjectSummary('');
        setLastAnalyzedAt(null);
        setCurrentObjective(null);
        setReadinessResult(null);
        useArquitectoStore.getState().clearArquitectoData();
    }, [existingSession, setSessionId, setHasInitialized]);

    const reinitialize = useCallback(async () => {
        // Reset completo del estado local y del store global
        useArquitectoStore.getState().clearArquitectoData();
        setMessages([]);
        setPendingItems([]);
        setPendingDrivePatches([]);
        setRoadmapCards([]);
        setSessionId(null);
        setHasInitialized(false);
        setProjectSummary('');
        setLastAnalyzedAt(null);
        setCurrentObjective(null);

        // Lanzar inicialización fresca
        await initialize();
    }, [initialize]);

    const sendMessage = useCallback(async (text: string, attachment?: { fileName: string; fileData: string; mimeType: string }) => {
        if ((!text.trim() && !attachment) || isThinking) return;
        if (!sessionId) {
            toast.error("Sesión no iniciada.");
            return;
        }

        const userMsg: ArquitectoMessage = {
            id: Date.now().toString(),
            role: 'user',
            text: text || `[Adjunto: ${attachment?.fileName}]`,
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
                projectId: folderId,
                history: historyPayload,
                pendingItems,
                accessToken,
                objective: currentObjective,
                attachment
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

            if (data?.detectedIntent) {
                setLastDetectedIntent(data.detectedIntent);
            }
            if (data?.hadResolution) {
                toast.success('✅ Contradicción resuelta. Efecto Dominó calculado.', {
                    icon: '🌊',
                    duration: 4000
                });
            }

            // ── Sprint 4.1: Interceptar roadmapImpact del backend ──
            if (data.roadmapImpact?.hasImpact === true) {
                setPendingDominoImpact(data.roadmapImpact as RoadmapImpact);
            }

        } catch (error) {
            console.error("Arquitecto chat error:", error);
            toast.error("Error al comunicarse con El Arquitecto.");
        } finally {
            setIsThinking(false);
        }
    }, [sessionId, messages, pendingItems, accessToken, isThinking, isGhostMode]);

    // ── Sprint 4.1: Confirmar impacto → reescribir tarjetas vía backend ──
    const confirmDominoImpact = useCallback(async () => {
        if (!pendingDominoImpact || !sessionId) return;
        if (pendingDominoImpact.affectedCardIds.length === 0) {
            setPendingDominoImpact(null);
            return;
        }

        setIsRecalculating(true);
        const lastUserMessage = messages.filter(m => m.role === 'user').at(-1)?.text ?? '';

        try {
            const data = await callFunction<any>('arquitectoRecalculateCards', {
                sessionId,
                affectedCardIds: pendingDominoImpact.affectedCardIds,
                userMessage: lastUserMessage,
            });

            if (data?.updatedCards) {
                // El onSnapshot actualizará roadmapCards automáticamente desde Firestore.
                // Solo necesitamos limpiar el estado de impacto pendiente.
                toast.success(`🗺️ ${data.updatedCards.length} tarjeta(s) del Roadmap actualizadas.`);
            }
        } catch (error) {
            console.error("RecalculateCards error:", error);
            toast.error("No se pudo recalcular el Roadmap.");
        } finally {
            setIsRecalculating(false);
            setPendingDominoImpact(null);
        }
    }, [pendingDominoImpact, sessionId, messages]);

    // ── Sprint 4.1: Descartar impacto sin recalcular ──
    const dismissDominoImpact = useCallback(() => {
        setPendingDominoImpact(null);
    }, []);

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
                    const initData = await callFunction<any>('arquitectoInitialize', { 
                        accessToken,
                        projectId: folderId
                    });
                    currentSessionId = initData.sessionId;
                    setSessionId(currentSessionId);
                }
            }

            const data = await callFunction<any>('arquitectoAnalyze', {
                sessionId: currentSessionId,
                projectId: folderId,
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

    // ── Sprint 5.5: Guardián del Roadmap Unificado ──
    const [isCrystallizing, setIsCrystallizing] = useState(false);
    const [isAuditing, setIsAuditing] = useState(false);
    const [readinessResult, setReadinessResult] = useState<{
        isReady: boolean;
        missingElements: string[];
        warningMessage: string;
    } | null>(null);

    const generateRoadmap = useCallback(async () => {
        if (!sessionId) { toast.error('Sesión faltante.'); return; }
        setIsCrystallizing(true);
        let toastId = toast.loading('Generando el Roadmap Atómico...', { id: 'cristalizar' });

        try {
            let hasMorePhases = true;
            let currentPhase = null;
            let isContinuation = false;

            while (hasMorePhases) {
                if (currentPhase) {
                    toast.loading(`Generando fase: ${currentPhase}...`, { id: toastId });
                }

                const data = await callFunction<any>('arquitectoGenerateRoadmap', {
                    sessionId,
                    projectId: config?.folderId,
                    objective: currentObjective,
                    isContinuation,
                    currentPhase
                });

                if (!data.ready) {
                    // Pre-flight fallido
                    setReadinessResult({
                        isReady: false,
                        missingElements: ['Interacciones insuficientes'],
                        warningMessage: 'Necesitamos conversar un poco más (al menos 3 interacciones) antes de poder cristalizar un Roadmap preciso. ¡Explícame más sobre tu idea!'
                    });
                    toast.dismiss(toastId);
                    return;
                }

                if (data?.pendingItems) {
                    setPendingItems(data.pendingItems);
                    useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems);
                }

                hasMorePhases = !!data.hasMorePhases;
                currentPhase = data.nextPhaseToGenerate;
                isContinuation = true;
            }

            // roadmapCards llega via onSnapshot automáticamente desde Firestore
            setReadinessResult(null);
            toast.success('✨ Roadmap cristalizado con éxito.', { id: toastId });
        } catch (e) {
            toast.error('Error al cristalizar el Roadmap.', { id: toastId });
        } finally {
            setIsCrystallizing(false);
        }
    }, [sessionId, config?.folderId, currentObjective]);

    const isOutdated = config?.lastSignificantUpdate && lastAnalyzedAt
        ? config.lastSignificantUpdate > lastAnalyzedAt
        : false;

        const resolveItem = useCallback(async (
        itemCode: string,
        resolutionText: string,
        skipRipple = false
    ) => {
        if (!sessionId) return;
        try {
            const data = await callFunction<any>('arquitectoResolvePendingItem', {
                sessionId,
                itemCode,
                resolutionText,
                skipRipple
            });
            if (data?.pendingItems) {
                setPendingItems(data.pendingItems);
                useArquitectoStore.getState().setArquitectoPendingItems(data.pendingItems);
            }
            toast.success('Item resuelto.');
        } catch (e) {
            toast.error('Error al resolver el item.');
        }
    }, [sessionId]);

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
        // Sprint 4.1
        roadmapCards,
        activeCardId,
        setActiveCardId,
        pendingDominoImpact,
        isRecalculating,
        confirmDominoImpact,
        dismissDominoImpact,
        initialize,
        sendMessage,
        reAnalyze,
        // Sprint 5.2: Guardián del Roadmap
        isCrystallizing,
        isAuditing,
        readinessResult,
        setReadinessResult,
        generateRoadmap,
        // Sprint 5.4: Estado del objetivo narrativo actual
        currentObjective,
        setCurrentObjective,
        lastDetectedIntent,
        pendingDrivePatches,
        focusMode,
        setFocusMode,
        severityMode,
        setSeverityMode,
        implementationGoal,
        setImplementationGoal,
        resolveItem,
        reinitialize,
        existingSession,
        resumeSession,
        discardSession,
    };
};
