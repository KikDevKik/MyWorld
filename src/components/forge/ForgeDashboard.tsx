import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, RefreshCw, Settings, Ghost, FileEdit, Anchor, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import ForgeChat from './ForgeChat';
import ForgeCard from './ForgeCard';
import { Character, DriveFile } from '../../types';
import { ForgePayload, SoulEntity } from '../../types/forge';

interface ForgeDashboardProps {
    folderId: string; // Project Root ID (for global context)
    accessToken: string | null;
    saga: DriveFile; // 🟢 Active Saga
}

type DashboardState = 'SCANNING' | 'KANBAN';

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, saga }) => {
    const [state, setState] = useState<DashboardState>('SCANNING');
    const [isLoading, setIsLoading] = useState(true);
    const [sessionVersion, setSessionVersion] = useState(() => Date.now());

    // DATA
    const [characters, setCharacters] = useState<Character[]>([]);
    const [detectedEntities, setDetectedEntities] = useState<SoulEntity[]>([]);

    // UI STATE
    const [selectedEntity, setSelectedEntity] = useState<SoulEntity | null>(null);

    // Removed old legacy state (hiddenContext, initialReport) as ForgeChat now handles "The Brain"

    // OPERATIONS
    const [isSorting, setIsSorting] = useState(false);
    const [showPurgeModal, setShowPurgeModal] = useState(false);

    // --- 1. FETCH SAGA ROSTER (ANCHORS) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser || !saga) return;
        const db = getFirestore();

        // 🟢 DEBUG: Log Saga ID for context matching
        console.log(`[ANCHOR_DEBUG] Fetching anchors for context: ${saga.id} (${saga.name})`);

        // SCOPED QUERY: Only characters belonging to this folder (Saga)
        const q = query(
            collection(db, "users", auth.currentUser.uid, "characters"),
            where("sourceContext", "==", saga.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                chars.push({ id: doc.id, ...d, status: 'EXISTING' } as Character);
            });
            setCharacters(chars);
        }, (error) => {
            console.error("Error fetching characters:", error);
        });
        return () => unsubscribe();
    }, [saga.id]);

    // --- 2. SOUL SORTER LISTENER (GHOSTS & LIMBOS) ---
    useEffect(() => {
        // 🟢 GHOST MODE BYPASS
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setState('KANBAN');
            setIsLoading(false);
            // Mock Data for Verification
            setDetectedEntities([
                { id: 'g1', name: 'Sombra del Pasillo', tier: 'GHOST', sourceSnippet: '...una figura alta se desvaneció...', occurrences: 3 },
                { id: 'l1', name: 'Borrador Capitán', tier: 'LIMBO', sourceSnippet: 'Idea: Capitán retirado, cinico.', occurrences: 1, tags: ['Militar', 'Cínico'] }
            ]);
            return;
        }

        const auth = getAuth();
        if (!auth.currentUser || !saga) return;
        const db = getFirestore();

        const q = query(
            collection(db, "users", auth.currentUser.uid, "forge_detected_entities"),
            where("saga", "==", saga.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const entities: SoulEntity[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                // Ensure we respect the tier from backend
                entities.push({
                    id: doc.id,
                    name: d.name,
                    tier: d.tier as 'GHOST' | 'LIMBO' | 'ANCHOR', // Trust backend
                    sourceSnippet: d.sourceSnippet || (d.foundIn || []).join('\n'),
                    occurrences: d.occurrences || d.confidence || 0,
                    tags: d.tags,
                    role: d.reasoning,
                    mergeSuggestion: d.mergeSuggestion
                });
            });

            setDetectedEntities(entities);
            setState('KANBAN');
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [saga.id]);

    // --- ACTIONS ---

    const handleEntityAction = (entity: SoulEntity) => {
        // Simple Set - ForgeChat handles the "Hot-Swap" logic internally via useEffect([activeEntity])
        setSelectedEntity(entity);
    };

    const handleForceAnalysis = async () => {
        setIsSorting(true);
        const toastId = toast.loading("Ejecutando Soul Sorter...");
        try {
            const functions = getFunctions();
            const classifyEntities = httpsCallable<any, ForgePayload>(functions, 'classifyEntities');
            await classifyEntities({ projectId: folderId, sagaId: saga.id });
            toast.success("Análisis completado.", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Error al analizar la saga.", { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    const handlePurgeDatabase = async () => {
        setIsSorting(true);
        setShowPurgeModal(false);
        const toastId = toast.loading("Purgando base de datos...");
        try {
            const functions = getFunctions();
            const purgeForgeEntities = httpsCallable(functions, 'purgeForgeEntities');
            const res = await purgeForgeEntities();
            const data = res.data as any;
            toast.success(`Base de datos purgada. (${data.count || 0} entidades eliminadas)`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Error al purgar la base de datos.", { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    // --- PREPARE COLUMNS ---

    // Col 1: Ghosts
    const ghosts = detectedEntities.filter(e => e.tier === 'GHOST');

    // Col 2: Limbos
    const limbos = detectedEntities.filter(e => e.tier === 'LIMBO');

    // Col 3: Anchors (FUSION: Registered + Detected)
    const registeredAnchors: SoulEntity[] = characters.map(c => ({
        id: c.id,
        name: c.name,
        tier: 'ANCHOR',
        sourceSnippet: c.role || "Personaje Registrado",
        occurrences: 0,
        role: c.role,
        avatar: c.avatar
    }));

    // Filter detected anchors that are NOT already in registered list (Fusion)
    const registeredNames = new Set(registeredAnchors.map(a => a.name.toLowerCase().trim()));
    const additionalAnchors = detectedEntities.filter(e =>
        e.tier === 'ANCHOR' && !registeredNames.has(e.name.toLowerCase().trim())
    );

    const anchors = [...registeredAnchors, ...additionalAnchors];

    if (state === 'SCANNING') {
        return (
             <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-100 animate-fade-in">
                <Loader2 size={48} className="animate-spin text-accent-DEFAULT mb-4" />
                <h2 className="text-xl font-bold">Invocando Saga...</h2>
            </div>
        );
    }

    // Dynamic Session ID for Chat
    const chatSessionId = selectedEntity
        ? `forge_${saga.id}_${selectedEntity.id}` // Entity Context
        : `saga_${saga.id}_v${sessionVersion}`;   // General Context (Fallback)

    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 overflow-hidden relative">

            {/* HEADER */}
            <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900/50 backdrop-blur">
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-bold text-titanium-100 uppercase tracking-widest">
                        Tríptico <span className="text-accent-DEFAULT">Titanium</span>
                    </h1>
                    <span className="px-2 py-0.5 rounded bg-titanium-800 text-[10px] text-titanium-400 font-mono">
                        Bóveda: {saga.name}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleForceAnalysis}
                        disabled={isSorting}
                        className="p-2 rounded-full hover:bg-titanium-800 text-titanium-400 hover:text-accent-DEFAULT transition-colors"
                        title="Re-escanear Saga"
                    >
                        <RefreshCw size={18} className={isSorting ? "animate-spin" : ""} />
                    </button>

                    <button
                        onClick={() => setShowPurgeModal(true)}
                        disabled={isSorting}
                        className="p-2 rounded-full hover:bg-titanium-800 text-titanium-400 hover:text-red-400 transition-colors"
                        title="Purgar Base de Datos (Limpieza Total)"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </header>

            {/* KANBAN GRID */}
            <div className="flex-1 overflow-hidden p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* COLUMN 1: ECOS (Radar) */}
                <div className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
                    <div className="p-4 flex items-center gap-2 border-b border-titanium-800/50">
                        <Ghost size={16} className="text-cyan-500" />
                        <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-wider">Ecos (Radar)</h2>
                        <span className="ml-auto text-xs font-mono text-titanium-600">{ghosts.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {ghosts.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                <Ghost size={32} className="mb-2" />
                                <p className="text-sm">El radar está en silencio.<br/>Escribe más historia.</p>
                            </div>
                        ) : (
                            ghosts.map(e => (
                                <ForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                            ))
                        )}
                    </div>
                </div>

                {/* COLUMN 2: LIMBOS (Workshop) */}
                <div className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
                    <div className="p-4 flex items-center gap-2 border-b border-titanium-800/50">
                        <FileEdit size={16} className="text-amber-500" />
                        <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider">Limbos (Taller)</h2>
                        <span className="ml-auto text-xs font-mono text-titanium-600">{limbos.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                         {limbos.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                <FileEdit size={32} className="mb-2" />
                                <p className="text-sm">La mesa de trabajo está limpia.</p>
                            </div>
                        ) : (
                            limbos.map(e => (
                                <ForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                            ))
                        )}
                    </div>
                </div>

                {/* COLUMN 3: ANCHORS (Library) */}
                <div className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
                    <div className="p-4 flex items-center gap-2 border-b border-titanium-800/50">
                        <Anchor size={16} className="text-emerald-500" />
                        <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">Anclas (Bóveda)</h2>
                        <span className="ml-auto text-xs font-mono text-titanium-600">{anchors.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                         {anchors.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                <Anchor size={32} className="mb-2" />
                                <p className="text-sm">La bóveda está vacía.<br/>Cristaliza alguna alma.</p>
                            </div>
                        ) : (
                            anchors.map(e => (
                                <ForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                            ))
                        )}
                    </div>
                </div>

            </div>

            {/* CHAT SLIDE-OVER */}
            <div
                className={`absolute inset-y-0 right-0 w-[500px] bg-titanium-950 shadow-2xl border-l border-titanium-800 transform transition-transform duration-300 z-50 ${
                    selectedEntity ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {selectedEntity && (
                    <div className="h-full flex flex-col">
                        {/* Close Handler Overlay */}
                        <div className="absolute top-4 left-4 z-50">
                            <button
                                onClick={() => setSelectedEntity(null)}
                                className="p-2 rounded-full bg-titanium-900/80 hover:bg-titanium-800 text-titanium-400 hover:text-white transition-colors backdrop-blur"
                            >
                                <span className="sr-only">Cerrar Chat</span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <ForgeChat
                            key={chatSessionId} // Force re-mount on entity switch for guaranteed reset
                            sessionId={chatSessionId}
                            sessionName={selectedEntity.name}
                            onBack={() => setSelectedEntity(null)}
                            folderId={folderId}
                            accessToken={accessToken}
                            activeEntity={selectedEntity} // 🟢 Pass the entity for Hot-Swapping
                            selectedScope={{
                                id: saga.id,
                                name: saga.name,
                                recursiveIds: [saga.id],
                                path: (saga as any).path
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Backdrop for Chat */}
            {selectedEntity && (
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm z-40"
                    onClick={() => setSelectedEntity(null)}
                />
            )}

            {/* PURGE CONFIRMATION MODAL */}
            {showPurgeModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md bg-titanium-900 border border-red-900/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden">

                        <div className="absolute top-0 right-0 p-8 -mr-4 -mt-4 opacity-5">
                            <Trash2 size={120} className="text-red-600" />
                        </div>

                        <div className="flex flex-col gap-4 relative z-10">
                            <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center text-red-500 mb-2">
                                <AlertTriangle size={24} />
                            </div>

                            <h3 className="text-xl font-bold text-white">¿Purgar Base de Datos?</h3>

                            <div className="text-titanium-300 text-sm leading-relaxed space-y-3">
                                <p>
                                    Estás a punto de eliminar <strong>TODAS las entidades detectadas (Fantasmas y Limbos)</strong> de la Forja.
                                </p>
                                <div className="p-3 bg-red-900/10 border border-red-900/20 rounded-lg text-red-200/80 text-xs">
                                    <strong>Nota:</strong> Los Personajes (Anclas) guardados en Drive NO se borrarán. Esta acción solo limpia el "Radar" de la IA.
                                </div>
                                <p className="opacity-70">
                                    Úsalo si ves duplicados o datos antiguos que ya no son relevantes.
                                </p>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setShowPurgeModal(false)}
                                    className="flex-1 py-3 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 font-bold rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handlePurgeDatabase}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-red-900/20"
                                >
                                    PURGAR TODO
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ForgeDashboard;
