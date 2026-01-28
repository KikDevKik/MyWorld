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
    const [detectedEntities, setDetectedEntities] = useState<any[]>([]); // Ghosts from Saga
    const [initialReport, setInitialReport] = useState<string>("");

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

    // --- 2. SAGA SCAN (AUTO-MOUNT) ---
    useEffect(() => {
        const scanSaga = async () => {
            if (!saga || !accessToken) return;

            // 🟢 GHOST MODE BYPASS
            if (import.meta.env.VITE_JULES_MODE === 'true') {
                console.log("👻 GHOST MODE: Bypassing Saga Scan");
                setInitialReport("Modo Fantasma Activado. Escaneo simulado.");
                setState('IDE');
                return;
            }

            setState('SCANNING');
            setIsLoading(true);

            try {
                const functions = getFunctions();

                // A. LIST FILES
                const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
                const listResult: any = await getDriveFiles({
                    folderIds: [saga.id], // Scan inside the Saga folder
                    accessToken,
                    recursive: false // Just the immediate files (fichas/docs)
                });

                const root = (listResult.data as DriveFile[])[0];
                const files = root?.children?.filter(f =>
                    f.type === 'file' &&
                    (f.name.endsWith('.md') || f.name.endsWith('.txt') || f.mimeType.includes('document')) &&
                    !f.name.toLowerCase().includes('personajes') // 🟢 Exclude "Personajes Saga X" lists
                ) || [];

                if (files.length === 0) {
                    toast.info("Saga vacía (sin archivos de texto). Iniciando modo creativo.");
                    setState('IDE');
                    setIsLoading(false);
                    return;
                }

                // B. ANALYZE BATCH (GHOST DETECTION)
                // 🟢 REFACTOR: Sequential Processing to prevent 'deadline-exceeded'
                const targetFiles = files.slice(0, 10); // Limit to 10 for speed
                let candidates: any[] = [];
                const BATCH_SIZE = 1; // Strict sequential to avoid global timeout

                // 🟢 SWITCH TO DEDICATED FORGE ANALYZER
                const analyzeForgeBatch = httpsCallable(functions, 'analyzeForgeBatch', { timeout: 540000 }); // 9 mins

                for (let i = 0; i < targetFiles.length; i += BATCH_SIZE) {
                    const batch = targetFiles.slice(i, i + BATCH_SIZE);
                    const fileIds = batch.map(f => f.id);

                    // Update UI Progress
                    setInitialReport(`Analizando archivo ${i + 1} de ${targetFiles.length}: "${batch[0].name}"...`);

                    try {
                        const result: any = await analyzeForgeBatch({
                            fileIds,
                            projectId: folderId, // Context
                            accessToken,
                            contextType: 'NARRATIVE'
                        });

                        if (result.data.candidates) {
                            // 🟢 CLIENT-SIDE DEDUPLICATION
                            // Merge new candidates into the growing list
                            const newCandidates = result.data.candidates;
                            const mergedMap = new Map();

                            // 1. Load existing into Map
                            candidates.forEach(c => mergedMap.set(c.name.toLowerCase().trim(), c));

                            // 2. Merge new ones
                            newCandidates.forEach((nc: any) => {
                                const key = nc.name.toLowerCase().trim();
                                if (mergedMap.has(key)) {
                                    // Merge Logic
                                    const existing = mergedMap.get(key);

                                    // Combine descriptions if different
                                    if (nc.description && !existing.description.includes(nc.description)) {
                                        existing.description = `${existing.description}\n\n[Alternative Source]: ${nc.description}`;
                                    }

                                    // Combine FoundInFiles
                                    if (nc.foundInFiles) {
                                        existing.foundInFiles = [...(existing.foundInFiles || []), ...nc.foundInFiles];
                                    }

                                    // Keep existing metadata usually, or update confidence if higher?
                                    // Let's keep existing to avoid overwriting stable data, but append context.
                                } else {
                                    mergedMap.set(key, nc);
                                }
                            });

                            candidates = Array.from(mergedMap.values());
                        }
                    } catch (err) {
                        console.error(`Failed to analyze batch starting at ${i}:`, err);
                        // Continue to next batch instead of crashing
                    }
                }

                // C. RECONCILIATION (GHOSTS VS ROSTER)
                const processedCandidates = [];
                const db = getFirestore();
                const auth = getAuth();

                // Identify candidates NOT in local roster
                const potentialExternal = [];

                // 🟢 FILTER: STRICTLY CHARACTERS
                // The Soul Forge is for Characters only. Ignore Locations, Objects, Concepts, etc.
                const characterCandidates = candidates.filter(c => c.type === 'CHARACTER');

                for (const c of characterCandidates) {
                    // Use Ref to avoid stale closure if characters loaded while analyzing
                    const localMatch = charactersRef.current.find(char => char.name.toLowerCase() === c.name.toLowerCase());

                    if (localMatch) {
                        processedCandidates.push({
                            ...c,
                            id: localMatch.id,
                            status: 'EXISTING',
                            role: c.role || c.description || c.subtype || c.type,
                            relevance_score: c.confidence ? Math.round(c.confidence / 10) : 5
                        });
                    } else {
                        potentialExternal.push(c);
                    }
                }

                // D. GLOBAL CHECK (EXTERNAL vs GHOST)
                if (potentialExternal.length > 0 && auth.currentUser) {
                    const namesToCheck = potentialExternal.map(c => c.name);
                    // Firestore 'in' limit is 10 (or 30 depending on version), but usually safe for batch of 10 files
                    // We split into chunks if needed, but for now assuming small batches
                    try {
                        const globalQ = query(
                            collection(db, "users", auth.currentUser.uid, "characters"),
                            where("name", "in", namesToCheck.slice(0, 30))
                        );
                        const globalSnapshot = await getDocs(globalQ);

                        const globalMatches = new Map();
                        globalSnapshot.forEach(doc => {
                            globalMatches.set(doc.data().name.toLowerCase(), doc.data());
                        });

                        potentialExternal.forEach(c => {
                            const externalMatch = globalMatches.get(c.name.toLowerCase());
                            if (externalMatch) {
                                processedCandidates.push({
                                    ...c,
                                    id: externalMatch.id, // Or undefined if we want to force re-linking? Better to link.
                                    status: 'EXTERNAL', // 🟢 New Status
                                    role: `Existente en otra Saga`, // UI hint
                                    relevance_score: c.confidence ? Math.round(c.confidence / 10) : 5,
                                    originalContext: externalMatch.sourceContext // Save logic for UI
                                });
                            } else {
                                processedCandidates.push({
                                    ...c,
                                    status: 'DETECTED',
                                    role: c.role || c.description || c.subtype || c.type,
                                    relevance_score: c.confidence ? Math.round(c.confidence / 10) : 5
                                });
                            }
                        });

                    } catch (err) {
                        console.warn("Global check failed, defaulting to DETECTED", err);
                        // Fallback: mark all as DETECTED
                        potentialExternal.forEach(c => processedCandidates.push({
                            ...c, status: 'DETECTED', role: c.role, relevance_score: 5
                        }));
                    }
                } else {
                    // No potential external or no user?
                    potentialExternal.forEach(c => processedCandidates.push({
                        ...c, status: 'DETECTED', role: c.role, relevance_score: 5
                    }));
                }

                setDetectedEntities(processedCandidates);
                setInitialReport(`Saga "${saga.name}" escaneada. ${processedCandidates.length} entidades procesadas.`);
                setState('IDE');

            } catch (error) {
                console.error("Saga Scan Failed:", error);
                toast.error("Error escaneando la Saga. Entrando en modo manual.");
                setState('IDE');
            } finally {
                setIsLoading(false);
            }
        };

        scanSaga();
    }, [saga.id, accessToken]); // Depend on Saga ID change

    const handleRefresh = () => {
        // Re-trigger effect by forcing a re-mount or logic?
        // Actually, cleaner to extract the async function, but for now user can just re-select saga.
        toast.info("Para refrescar, vuelve al Hub y selecciona la saga de nuevo.");
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
                    isLoading={false}
                    onRefresh={handleRefresh}
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
