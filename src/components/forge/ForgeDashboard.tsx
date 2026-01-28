import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import ForgeContextDock from './ForgeContextDock';
import CharacterInspector from './CharacterInspector';
import ForgeChat from './ForgeChat';
import { Character, DriveFile } from '../../types';
import { ForgePayload, SoulEntity } from '../../types/forge';
import { DetectedEntity } from './ForgeContextDock';

interface ForgeDashboardProps {
    folderId: string; // Project Root ID (for global context)
    accessToken: string | null;
    saga: DriveFile; // 🟢 Active Saga (The Hub Selection)
}

type DashboardState = 'SCANNING' | 'IDE';

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, saga }) => {
    const [state, setState] = useState<DashboardState>('SCANNING');
    const [isLoading, setIsLoading] = useState(true);
    const [sessionVersion, setSessionVersion] = useState(() => Date.now());

    // DATA
    const [characters, setCharacters] = useState<Character[]>([]); // Global Roster
    const charactersRef = useRef<Character[]>([]); // Ref for async access
    const [detectedEntities, setDetectedEntities] = useState<DetectedEntity[]>([]); // Ghosts from Saga
    const [initialReport, setInitialReport] = useState<string>("");
    const [isSorting, setIsSorting] = useState(false);

    // UI
    const [inspectorData, setInspectorData] = useState<any | null>(null);
    const [leftPanelWidth, setLeftPanelWidth] = useState(60);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- 1. FETCH SAGA ROSTER (SCOPED) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser || !saga) return;
        const db = getFirestore();
        // 🟢 SCOPED QUERY: Only characters belonging to this folder (Saga)
        const q = query(
            collection(db, "users", auth.currentUser.uid, "characters"),
            where("sourceContext", "==", saga.id)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                chars.push({ id: doc.id, ...doc.data(), status: 'EXISTING' } as Character);
            });
            setCharacters(chars);
            charactersRef.current = chars; // Keep ref in sync immediately
        });
        return () => unsubscribe();
    }, [saga.id]); // Re-subscribe if Saga changes

    // --- 2. SOUL SORTER LISTENER (INSTANT LOAD) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser || !saga) return;
        const db = getFirestore();

        // 🟢 GHOST MODE BYPASS
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setInitialReport("Modo Fantasma Activado. Escaneo simulado.");
            setState('IDE');
            setIsLoading(false);
            return;
        }

        // Subscribe to Detected Entities (Soul Sorter Results)
        const q = query(
            collection(db, "users", auth.currentUser.uid, "forge_detected_entities"),
            where("saga", "==", saga.id) // Filter by scope
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const entities: any[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                entities.push({
                    ...d,
                    id: doc.id,
                    // Map Backend Tiers to UI Status
                    status: d.tier === 'ANCHOR' ? 'EXISTING' : 'DETECTED', // ANCHORs behave like existing
                    role: d.reasoning || "Detectado por Soul Sorter",
                    description: (d.foundIn || []).join('\n'),
                    relevance_score: d.confidence ? Math.round(d.confidence / 10) : 5
                });
            });

            // 🟢 RECONCILIATION (Client-Side Shield)
            // Filter out entities that are ALREADY in the Roster to avoid duplicates
            // But we can only do this reliably if `characters` is loaded.
            // For now, let's just set them. The ContextDock can handle duplicates or we filter there?
            // Better to filter here if possible, but charactersRef might be empty on first render.
            // We'll trust the Soul Sorter Tiers:
            // ANCHOR = Likely a Sheet. LIMBO/GHOST = Likely Candidate.

            setDetectedEntities(entities);

            // If we have data, we are ready instantly
            if (entities.length > 0) {
                setState('IDE');
                setIsLoading(false);
                setInitialReport(`Carga Instantánea: ${entities.length} entidades recuperadas.`);
            } else {
                // If empty, we wait a bit or just show IDE.
                // We show IDE so user can click "Scan".
                setState('IDE');
                setIsLoading(false);
                setInitialReport("No se detectaron entidades. Ejecuta el Escáner.");
            }
        });

        return () => unsubscribe();
    }, [saga.id]);

    // --- 3. TRIGGER SOUL SORTER (MANUAL REFRESH) ---
    const handleForceAnalysis = async () => {
        setIsSorting(true);
        const toastId = toast.loading("Ejecutando Soul Sorter...");

        try {
            const functions = getFunctions();
            const classifyEntities = httpsCallable<any, ForgePayload>(functions, 'classifyEntities');

            const result = await classifyEntities({
                projectId: folderId,
                sagaId: saga.id
            });

            const payload = result.data;
            console.log('Soul Sorter Raw Response:', payload);

            if (!payload || !payload.entities || payload.entities.length === 0) {
                 toast.info("Nexus no detectó entidades nuevas en el Canon.", { id: toastId });
            } else {
                 toast.success(`Análisis completado. Detectados: ${payload.stats.totalGhosts} Ghosts, ${payload.stats.totalLimbos} Limbos.`, { id: toastId });

                 // 🟢 MAPEO TEMPORAL (Instant UI Feedback)
                 const anchors = payload.entities.filter(e => e.tier === 'ANCHOR');
                 const detected = payload.entities.filter(e => e.tier !== 'ANCHOR');

                 // 1. ANCHORS -> CHARACTERS LIST
                 if (anchors.length > 0) {
                    setCharacters(prev => {
                        const newChars = [...prev];
                        anchors.forEach(a => {
                            if (!newChars.find(c => c.name === a.name)) {
                                newChars.push({
                                    id: a.id, // Use Hash as ID
                                    name: a.name,
                                    role: a.role,
                                    avatar: a.avatar,
                                    tier: 'MAIN', // Default to MAIN for found anchors? Or SUPPORTING?
                                    status: 'EXISTING',
                                    sourceContext: saga.id,
                                    masterFileId: a.driveId,
                                    lastUpdated: new Date().toISOString()
                                } as Character);
                            }
                        });
                        return newChars;
                    });
                 }

                 // 2. OTHERS -> DETECTED LIST
                 // Map SoulEntity -> DetectedEntity
                 const detectedMapped: DetectedEntity[] = detected.map(d => ({
                     id: d.id,
                     name: d.name,
                     role: d.role || "Entidad Detectada",
                     relevance_score: Math.min(10, Math.ceil(d.occurrences / 2)),
                     status: 'DETECTED',
                     suggested_action: d.mergeSuggestion ? 'Merge' : 'None',
                     description: d.sourceSnippet
                 }));
                 setDetectedEntities(detectedMapped);
            }

        } catch (error) {
            console.error("Soul Sorter Error:", error);
            toast.error("Error al analizar la saga.", { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    const handleResetSession = () => setSessionVersion(prev => prev + 1);

    // RESIZE LOGIC
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
            if (newWidth > 95) setLeftPanelWidth(100);
            else if (newWidth < 20) setLeftPanelWidth(20);
            else setLeftPanelWidth(newWidth);
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // RENDER
    if (state === 'SCANNING') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-100 space-y-4 animate-fade-in">
                <Loader2 size={48} className="animate-spin text-accent-DEFAULT" />
                <h2 className="text-2xl font-bold">Invocando Saga...</h2>
                <p className="text-titanium-400">Escaneando archivos en {saga.name}</p>
                <p className="text-xs text-titanium-600">Detectando fantasmas y sincronizando el Canon.</p>
                {/* 🟢 PROGRESS BAR OR FILE INFO? */}
                <p className="text-xs text-titanium-500 font-mono mt-2">{initialReport}</p>
            </div>
        );
    }

    // SCOPE OBJECT FOR CHAT
    // We construct the scope based on the active Saga
    const sagaScope = {
        id: saga.id,
        name: saga.name,
        path: (saga as any).path || saga.name, // Use path if available for RAG
        recursiveIds: [saga.id] // Base ID
    };

    return (
        <div ref={containerRef} className="w-full h-full flex bg-titanium-950 overflow-hidden relative">
            {/* LEFT PANEL: CHAT / EDITOR */}
            <div style={{ width: `${leftPanelWidth}%` }} className="h-full flex flex-col relative transition-all duration-75 ease-out">
                <ForgeChat
                    sessionId={`saga_${saga.id}_v${sessionVersion}`}
                    sessionName={`Saga: ${saga.name}`}
                    onBack={() => {}} // No back button inside chat anymore
                    folderId={folderId}
                    accessToken={accessToken}
                    selectedScope={sagaScope} // 🟢 Pass Saga Scope
                    activeContextFile={undefined} // No specific file open initially
                    initialReport={initialReport}
                    onReset={handleResetSession}
                />
            </div>

            {/* RESIZER */}
            <div
                className={`w-1 h-full cursor-col-resize hover:bg-accent-DEFAULT transition-colors z-50 flex-shrink-0 ${isDragging ? 'bg-accent-DEFAULT' : 'bg-titanium-800'}`}
                onMouseDown={(e) => { setIsDragging(true); e.preventDefault(); }}
            />

            {/* RIGHT PANEL: CONTEXT DOCK */}
            <div style={{ width: `${100 - leftPanelWidth}%` }} className={`h-full flex flex-col ${leftPanelWidth === 100 ? 'hidden' : ''}`}>
                <ForgeContextDock
                    characters={characters}
                    detectedEntities={detectedEntities}
                    onCharacterSelect={setInspectorData}
                    isLoading={isSorting}
                    onRefresh={handleForceAnalysis}
                />
            </div>

            {/* INSPECTOR */}
            {inspectorData && (
                <CharacterInspector
                    data={inspectorData}
                    onClose={() => setInspectorData(null)}
                    onMaterialize={(char) => {
                        setDetectedEntities(prev => prev.map(e => e.name === char.name ? { ...e, status: 'EXISTING' } : e));
                    }}
                    folderId={saga.id} // Create files in the Saga folder by default
                    accessToken={accessToken}
                />
            )}
        </div>
    );
};

export default ForgeDashboard;
