import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
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
    const [detectedEntities, setDetectedEntities] = useState<any[]>([]); // Ghosts from Saga
    const [initialReport, setInitialReport] = useState<string>("");

    // UI
    const [inspectorData, setInspectorData] = useState<any | null>(null);
    const [leftPanelWidth, setLeftPanelWidth] = useState(60);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // --- 1. FETCH GLOBAL ROSTER (BACKGROUND) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser) return;
        const db = getFirestore();
        const q = query(collection(db, "users", auth.currentUser.uid, "characters"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                chars.push({ id: doc.id, ...doc.data(), status: 'EXISTING' } as Character);
            });
            setCharacters(chars);
        });
        return () => unsubscribe();
    }, []);

    // --- 2. SAGA SCAN (AUTO-MOUNT) ---
    useEffect(() => {
        const scanSaga = async () => {
            if (!saga || !accessToken) return;

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
                const files = root?.children?.filter(f => f.type === 'file' && (f.name.endsWith('.md') || f.name.endsWith('.txt') || f.mimeType.includes('document'))) || [];

                if (files.length === 0) {
                    toast.info("Saga vacía (sin archivos de texto). Iniciando modo creativo.");
                    setState('IDE');
                    setIsLoading(false);
                    return;
                }

                // B. ANALYZE BATCH (GHOST DETECTION)
                // Use a subset to avoid timeouts if too many files
                const targetFiles = files.slice(0, 10); // Limit to 10 for speed
                const fileIds = targetFiles.map(f => f.id);

                const analyzeNexusFile = httpsCallable(functions, 'analyzeNexusFile');
                const result: any = await analyzeNexusFile({
                    fileIds,
                    projectId: folderId, // Context
                    accessToken,
                    contextType: 'NARRATIVE'
                });

                let candidates = result.data.candidates || [];

                // C. RECONCILIATION (GHOSTS VS ROSTER)
                // If a candidate matches an existing character, link ID
                candidates = candidates.map((c: any) => {
                    const match = characters.find(char => char.name.toLowerCase() === c.name.toLowerCase());
                    return {
                        ...c,
                        id: match ? match.id : undefined,
                        status: match ? 'EXISTING' : 'DETECTED',
                        // UI Mapping
                        role: c.role || c.description || c.subtype || c.type,
                        relevance_score: c.confidence ? Math.round(c.confidence / 10) : 5
                    };
                });

                setDetectedEntities(candidates);
                setInitialReport(`Saga "${saga.name}" escaneada. ${candidates.length} entidades detectadas.`);
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
