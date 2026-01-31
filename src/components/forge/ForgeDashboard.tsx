import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Loader2, RefreshCw, Settings, Ghost, FileEdit, Anchor, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, DragStartEvent } from '@dnd-kit/core';

import ForgeChat from './ForgeChat';
import ForgeCard from './ForgeCard';
import { Character, DriveFile } from '../../types';
import { ForgePayload, SoulEntity } from '../../types/forge';
import { callFunction } from '../../services/api';

interface ForgeDashboardProps {
    folderId: string; // Project Root ID (for global context)
    accessToken: string | null;
    saga: DriveFile; // 🟢 Active Saga
}

type DashboardState = 'SCANNING' | 'KANBAN';

// --- DND WRAPPERS ---

function DraggableForgeCard({ entity, onAction }: { entity: SoulEntity, onAction: any }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: entity.id,
        data: { entity }
    });

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 999 : undefined,
    } : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className={isDragging ? 'opacity-30' : ''} // Ghost while dragging
        >
            <ForgeCard entity={entity} onAction={onAction} />
        </div>
    );
}

function DroppableColumn({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { columnId: id }
    });

    return (
        <div
            ref={setNodeRef}
            className={`${className} transition-all duration-300 ${isOver ? 'bg-white/5 ring-1 ring-accent-DEFAULT shadow-[0_0_15px_rgba(255,255,255,0.05)]' : ''}`}
        >
            {children}
        </div>
    );
}

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, saga }) => {
    const [state, setState] = useState<DashboardState>('SCANNING');
    const [isLoading, setIsLoading] = useState(true);
    const [sessionVersion, setSessionVersion] = useState(() => Date.now());

    // DATA
    const [characters, setCharacters] = useState<Character[]>([]);
    const [detectedEntities, setDetectedEntities] = useState<SoulEntity[]>([]);

    // UI STATE
    const [selectedEntity, setSelectedEntity] = useState<SoulEntity | null>(null);

    // OPERATIONS
    const [isSorting, setIsSorting] = useState(false);
    const [showPurgeModal, setShowPurgeModal] = useState(false);

    // DND STATE
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        })
    );

    // --- 1. FETCH SAGA ROSTER (ANCHORS) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser || !saga) return;
        const db = getFirestore();

        console.log(`[ANCHOR_DEBUG] Fetching anchors for context: ${saga.id} (${saga.name})`);

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
        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setState('KANBAN');
            setIsLoading(false);
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
                entities.push({
                    id: doc.id,
                    name: d.name,
                    tier: d.tier as 'GHOST' | 'LIMBO' | 'ANCHOR',
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
        setSelectedEntity(entity);
    };

    const handleForceAnalysis = async () => {
        setIsSorting(true);
        const toastId = toast.loading("Ejecutando Soul Sorter...");
        try {
            await callFunction<ForgePayload>('classifyEntities', { projectId: folderId, sagaId: saga.id });
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
            const data = await callFunction<any>('purgeForgeEntities');
            toast.success(`Base de datos purgada. (${data.count || 0} entidades eliminadas)`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Error al purgar la base de datos.", { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    // --- DND LOGIC ---

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const entity = active.data.current?.entity as SoulEntity;
        const sourceColumn = entity.tier; // GHOST, LIMBO, ANCHOR
        const targetColumn = over.id as string; // 'ECO' | 'LIMBO' | 'ANCHOR' (Mapped ID)

        // Mapping 'ECO' -> 'GHOST' logic for comparison
        // Actually, sourceColumn is GHOST, target is ECO.
        // Let's rely on string comparison or map it.
        // ECO column displays GHOST entities.

        // LOGIC: GHOST (ECO) -> LIMBO
        if (sourceColumn === 'GHOST' && targetColumn === 'LIMBO') {
            console.log("👻 -> 📝 INVOCATION TRIGGERED!");

            // 1. Open The Gate (Chat)
            setSelectedEntity(entity);
            toast.success(`Invocando a ${entity.name}...`);

            // 2. Optimistic Update?
            // We can locally update state, but since we are just opening the chat to "Interrogate",
            // we don't necessarily change the DB state YET. The "Invocation" is the act of talking.
            // The "Crystallization" (Save) happens later.
            // However, the user said "Mover de Eco a Limbo... es una invocación".
            // Maybe we should update the tier to LIMBO immediately in DB?
            // "Mover de Eco (Fantasma) a Limbo (Sala de Espera) no es solo un cambio de estado en la base de datos; es una invocación."
            // This implies it IS a DB change.
            // But let's stick to the prompt: "1. Encuentra la entidad. 2. ¡ABRIR LA SALA! 3. (Opcional) Optimistic UI"
            // I'll start by opening the chat. The crystallize button makes it an ANCHOR.
            // Does moving to LIMBO make it a LIMBO entity?
            // "El sistema actualiza la entidad: De ECO (sin id) a ANCHOR (con id)." -> This is Crystallization.
            // So dragging GHOST -> LIMBO simply opens the chat context?
            // "La Lógica: Mover de Eco (Fantasma) a Limbo (Sala de Espera) no es solo un cambio de estado en la base de datos; es una invocación."
            // Okay, I will just open the chat for now.
        }
    };

    // --- PREPARE COLUMNS ---

    const ghosts = detectedEntities.filter(e => e.tier === 'GHOST');
    const limbos = detectedEntities.filter(e => e.tier === 'LIMBO');

    const registeredAnchors: SoulEntity[] = characters.map(c => ({
        id: c.id,
        name: c.name,
        tier: 'ANCHOR',
        sourceSnippet: c.role || "Personaje Registrado",
        occurrences: 0,
        role: c.role,
        avatar: c.avatar
    }));

    const registeredNames = new Set(registeredAnchors.map(a => a.name.toLowerCase().trim()));
    const additionalAnchors = detectedEntities.filter(e =>
        e.tier === 'ANCHOR' && !registeredNames.has(e.name.toLowerCase().trim())
    );

    const anchors = [...registeredAnchors, ...additionalAnchors];

    // Find active entity for Overlay
    const activeEntity =
        [...ghosts, ...limbos, ...anchors].find(e => e.id === activeId);

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
        ? `forge_${saga.id}_${selectedEntity.id}`
        : `saga_${saga.id}_v${sessionVersion}`;

    return (
        <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="w-full h-full flex flex-col bg-titanium-950 overflow-hidden relative selection:bg-accent-900/30 selection:text-accent-200">

                {/* CYBER BACKGROUND PATTERN */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                     style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }}
                />

                {/* HEADER */}
                <header className="h-18 shrink-0 flex items-center justify-between px-8 border-b border-titanium-800 bg-titanium-900/80 backdrop-blur z-20">
                    <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4">
                        <h1 className="text-xl font-bold text-titanium-100 uppercase tracking-widest flex items-center gap-2">
                            Tríptico <span className="text-accent-DEFAULT">Titanium</span>
                        </h1>
                        <div className="flex items-center gap-2">
                            <span className="hidden md:inline text-titanium-700">/</span>
                            <span className="px-2 py-0.5 rounded bg-titanium-800/50 border border-titanium-700 text-[10px] text-titanium-400 font-mono tracking-wide">
                                BÓVEDA: {saga.name.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleForceAnalysis}
                            disabled={isSorting}
                            className="group p-2.5 rounded-xl bg-titanium-800/50 border border-titanium-700 hover:border-accent-DEFAULT/50 hover:bg-titanium-800 text-titanium-400 hover:text-accent-DEFAULT transition-all shadow-sm"
                            title="Re-escanear Saga"
                        >
                            <RefreshCw size={18} className={`transition-transform duration-700 ${isSorting ? "animate-spin" : "group-hover:rotate-180"}`} />
                        </button>

                        <button
                            onClick={() => setShowPurgeModal(true)}
                            disabled={isSorting}
                            className="group p-2.5 rounded-xl bg-titanium-800/50 border border-titanium-700 hover:border-red-500/50 hover:bg-titanium-800 text-titanium-400 hover:text-red-400 transition-all shadow-sm"
                            title="Purgar Base de Datos"
                        >
                            <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                        </button>
                    </div>
                </header>

                {/* KANBAN GRID */}
                <div className="flex-1 overflow-hidden p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 z-10">

                    {/* COLUMN 1: ECOS (Radar) */}
                    <DroppableColumn id="ECO" className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
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
                                    <DraggableForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                                ))
                            )}
                        </div>
                    </DroppableColumn>

                    {/* COLUMN 2: LIMBOS (Workshop) */}
                    <DroppableColumn id="LIMBO" className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
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
                                    <DraggableForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                                ))
                            )}
                        </div>
                    </DroppableColumn>

                    {/* COLUMN 3: ANCHORS (Library) */}
                    <DroppableColumn id="ANCHOR" className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
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
                                    <DraggableForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                                ))
                            )}
                        </div>
                    </DroppableColumn>

                </div>

                {/* DRAG OVERLAY */}
                <DragOverlay>
                    {activeEntity ? (
                        <div className="opacity-90 scale-105 rotate-2">
                            <ForgeCard entity={activeEntity} onAction={() => {}} />
                        </div>
                    ) : null}
                </DragOverlay>

                {/* CHAT MODAL (INTERROGATION ROOM) */}
                {selectedEntity && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={() => setSelectedEntity(null)}
                        />

                        {/* Modal Window */}
                        <div className="relative w-full max-w-5xl h-[90vh] bg-titanium-950 rounded-2xl shadow-2xl border border-titanium-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                            {/* Close Button (Floating Outside or Corner) */}
                            <div className="absolute top-4 right-4 z-[60]">
                                <button
                                    onClick={() => setSelectedEntity(null)}
                                    className="p-2 rounded-full bg-titanium-900/80 hover:bg-red-900/50 text-titanium-400 hover:text-white transition-colors backdrop-blur border border-titanium-700/50 hover:border-red-500/50"
                                    title="Cerrar Sala"
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
                    </div>
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
        </DndContext>
    );
};

export default ForgeDashboard;
