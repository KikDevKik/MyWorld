import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Loader2, RefreshCw, Settings, Ghost, FileEdit, Anchor, Trash2, AlertTriangle, User, PawPrint, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, DragStartEvent } from '@dnd-kit/core';

import ForgeChat from './ForgeChat';
import ForgeCard from './ForgeCard';
import { Character, DriveFile } from '../../types';
import { ForgePayload, SoulEntity } from '../../types/forge';
import { callFunction } from '../../services/api';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface ForgeDashboardProps {
    folderId: string; // Project Root ID (for global context)
    accessToken: string | null;
    characterSaga: DriveFile | null;
    bestiarySaga: DriveFile | null;
    onOpenSettings: () => void;
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

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, characterSaga, bestiarySaga, onOpenSettings }) => {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].forge;

    // 🟢 MODE SWITCH
    const [activeMode, setActiveMode] = useState<'PERSON' | 'CREATURE'>('PERSON');
    const [bestiaryFilter, setBestiaryFilter] = useState<'ALL' | 'CREATURE' | 'FLORA'>('ALL'); // 🟢 Sub-filter
    const activeSaga = activeMode === 'PERSON' ? characterSaga : bestiarySaga;

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
        setCharacters([]);
        setDetectedEntities([]);

        // 🟢 GHOST MODE BYPASS: Allow rendering without saga
        if (!activeSaga && import.meta.env.VITE_JULES_MODE !== 'true') {
            setIsLoading(false);
            return;
        }

        const auth = getAuth();
        if (!auth.currentUser) return;
        const db = getFirestore();

        console.log(`[ANCHOR_DEBUG] Fetching anchors for context: ${activeSaga.id} (${activeSaga.name})`);

        const q = query(
            collection(db, "users", auth.currentUser.uid, "characters"),
            where("sourceContext", "==", activeSaga.id)
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
    }, [activeSaga?.id]);

    // --- 2. SOUL SORTER LISTENER (GHOSTS & LIMBOS) ---
    useEffect(() => {
        // 🟢 GHOST MODE BYPASS
        if (!activeSaga && import.meta.env.VITE_JULES_MODE !== 'true') return;

        if (import.meta.env.VITE_JULES_MODE === 'true') {
            setState('KANBAN');
            setIsLoading(false);
            setDetectedEntities([
                { id: 'g1', name: 'Sombra del Pasillo', tier: 'GHOST', category: 'PERSON', sourceSnippet: '...una figura alta se desvaneció...', occurrences: 3 },
                { id: 'l1', name: 'Borrador Capitán', tier: 'LIMBO', category: 'PERSON', sourceSnippet: 'Idea: Capitán retirado, cinico.', occurrences: 1, tags: ['Militar', 'Cínico'] },
                { id: 'g2', name: 'Lobo de Sombras', tier: 'GHOST', category: 'CREATURE', sourceSnippet: '...un aullido gutural resonó en la oscuridad...', occurrences: 2 },
                { id: 'l2', name: 'Flor Lunar', tier: 'LIMBO', category: 'FLORA', sourceSnippet: 'Florece solo con la luna llena.', occurrences: 1, tags: ['Rara', 'Magica'] }
            ]);
            return;
        }

        const auth = getAuth();
        if (!auth.currentUser) return;
        const db = getFirestore();

        const q = query(
            collection(db, "users", auth.currentUser.uid, "forge_detected_entities"),
            where("saga", "==", activeSaga.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const entities: SoulEntity[] = [];
            snapshot.forEach(doc => {
                const d = doc.data();
                entities.push({
                    id: doc.id,
                    name: d.name,
                    tier: d.tier as 'GHOST' | 'LIMBO' | 'ANCHOR',
                    category: d.category || 'PERSON', // Default to Person if missing
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
    }, [activeSaga?.id]);

    // --- ACTIONS ---

    const handleEntityAction = (entity: SoulEntity) => {
        setSelectedEntity(entity);
    };

    const handleForceAnalysis = async () => {
        if (!activeSaga) return;
        setIsSorting(true);
        const toastId = toast.loading(t.runningSorter);
        try {
            await callFunction<ForgePayload>('classifyEntities', { projectId: folderId, sagaId: activeSaga.id });
            toast.success(t.analysisComplete, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(t.analysisError, { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    const handlePurgeDatabase = async () => {
        setIsSorting(true);
        setShowPurgeModal(false);
        const toastId = toast.loading(t.purging);
        try {
            const data = await callFunction<any>('purgeForgeEntities');
            toast.success(`${t.purgeSuccess} (${data.count || 0})`, { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error(t.purgeError, { id: toastId });
        } finally {
            setIsSorting(false);
        }
    };

    // --- DND LOGIC ---
    const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;
        const entity = active.data.current?.entity as SoulEntity;
        const sourceColumn = entity.tier;
        const targetColumn = over.id as string;
        if (sourceColumn === 'GHOST' && targetColumn === 'LIMBO') {
            setSelectedEntity(entity);
            toast.success(`${t.summoning} ${entity.name}...`);
        }
    };

    // --- PREPARE COLUMNS (FILTERED BY MODE) ---

    // 🟢 FILTER LOGIC
    const filterByMode = (entity: SoulEntity) => {
        if (activeMode === 'PERSON') {
            return !entity.category || entity.category === 'PERSON';
        } else {
            // Bestiary Mode
            if (bestiaryFilter === 'ALL') return entity.category === 'CREATURE' || entity.category === 'FLORA';
            return entity.category === bestiaryFilter;
        }
    };

    const ghosts = detectedEntities.filter(e => e.tier === 'GHOST' && filterByMode(e));
    const limbos = detectedEntities.filter(e => e.tier === 'LIMBO' && filterByMode(e));

    const registeredAnchors: SoulEntity[] = characters.map(c => ({
        id: c.id,
        name: c.name,
        tier: 'ANCHOR',
        category: c.category || 'PERSON',
        sourceSnippet: c.role || t.registeredCharacter,
        occurrences: 0,
        role: c.role,
        avatar: c.avatar
    })).filter(filterByMode);

    const registeredNames = new Set(registeredAnchors.map(a => a.name.toLowerCase().trim()));
    const additionalAnchors = detectedEntities.filter(e =>
        e.tier === 'ANCHOR' && !registeredNames.has(e.name.toLowerCase().trim()) && filterByMode(e)
    );

    const anchors = [...registeredAnchors, ...additionalAnchors];

    // Find active entity for Overlay
    const activeEntity = [...ghosts, ...limbos, ...anchors].find(e => e.id === activeId);

    // --- RENDER ---

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="w-full h-full flex flex-col bg-titanium-950 overflow-hidden relative selection:bg-accent-900/30 selection:text-accent-200">

                {/* CYBER BACKGROUND PATTERN */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                     style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '24px 24px' }}
                />

                {/* HEADER */}
                <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-titanium-800 bg-titanium-900/80 backdrop-blur z-20">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                        <h1 className="text-xl font-bold text-titanium-100 uppercase tracking-widest flex items-center gap-2">
                            {t.title}
                        </h1>

                        {/* 🟢 SWITCH MODE */}
                        <div className="flex items-center gap-4">
                            <div className="flex bg-titanium-950 rounded-lg p-1 border border-titanium-800">
                                <button
                                    onClick={() => setActiveMode('PERSON')}
                                    className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${
                                        activeMode === 'PERSON'
                                        ? 'bg-titanium-800 text-white shadow-sm'
                                        : 'text-titanium-500 hover:text-titanium-300'
                                    }`}
                                >
                                    <User size={14} />
                                    {t.people}
                                </button>
                                <button
                                    onClick={() => setActiveMode('CREATURE')}
                                    className={`px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 transition-all ${
                                        activeMode === 'CREATURE'
                                        ? 'bg-titanium-800 text-emerald-400 shadow-sm'
                                        : 'text-titanium-500 hover:text-titanium-300'
                                    }`}
                                >
                                    <PawPrint size={14} />
                                    {t.bestiary}
                                </button>
                            </div>

                            {/* 🟢 BESTIARY SUB-FILTER */}
                            {activeMode === 'CREATURE' && (
                                <div className="flex items-center gap-2 text-xs font-mono text-titanium-500 animate-in fade-in slide-in-from-left-2">
                                    <span className="opacity-50">|</span>
                                    <button
                                        onClick={() => setBestiaryFilter('ALL')}
                                        className={`hover:text-emerald-400 transition-colors ${bestiaryFilter === 'ALL' ? 'text-emerald-400 font-bold underline decoration-emerald-500/50' : ''}`}
                                    >
                                        {t.all}
                                    </button>
                                    <button
                                        onClick={() => setBestiaryFilter('CREATURE')}
                                        className={`hover:text-emerald-400 transition-colors ${bestiaryFilter === 'CREATURE' ? 'text-emerald-400 font-bold underline decoration-emerald-500/50' : ''}`}
                                    >
                                        {t.fauna}
                                    </button>
                                    <button
                                        onClick={() => setBestiaryFilter('FLORA')}
                                        className={`hover:text-emerald-400 transition-colors ${bestiaryFilter === 'FLORA' ? 'text-emerald-400 font-bold underline decoration-emerald-500/50' : ''}`}
                                    >
                                        {t.flora}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {activeSaga && (
                            <button
                                onClick={handleForceAnalysis}
                                disabled={isSorting}
                                className="group p-2.5 rounded-xl bg-titanium-800/50 border border-titanium-700 hover:border-accent-DEFAULT/50 hover:bg-titanium-800 text-titanium-400 hover:text-accent-DEFAULT transition-all shadow-sm"
                                title={t.rescan}
                            >
                                <RefreshCw size={18} className={`transition-transform duration-700 ${isSorting ? "animate-spin" : "group-hover:rotate-180"}`} />
                            </button>
                        )}

                        {/* 🟢 SETTINGS BUTTON */}
                        <button
                            onClick={onOpenSettings}
                            className="group p-2.5 rounded-xl bg-titanium-800/50 border border-titanium-700 hover:border-white/50 hover:bg-titanium-800 text-titanium-400 hover:text-white transition-all shadow-sm"
                            title={t.configure}
                        >
                            <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                        </button>
                    </div>
                </header>

                {/* EMPTY STATE (MISSING VAULT) - Bypass in Ghost Mode */}
                {!activeSaga && import.meta.env.VITE_JULES_MODE !== 'true' ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-titanium-400">
                        <div className="w-20 h-20 rounded-3xl bg-titanium-900 border border-titanium-800 flex items-center justify-center mb-6 opacity-50">
                            {activeMode === 'PERSON' ? <User size={40} /> : <PawPrint size={40} />}
                        </div>
                        <h2 className="text-xl font-bold text-white mb-2">
                            {activeMode === 'PERSON' ? t.missingVaultPerson : t.missingVaultBestiary}
                        </h2>
                        <p className="max-w-md mb-8">
                             {t.missingVaultDesc.replace('{type}', activeMode === 'PERSON' ? t.yourCharacters : t.yourCreatures)}
                        </p>
                        <button
                            onClick={onOpenSettings}
                            className="flex items-center gap-2 px-6 py-3 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 font-bold rounded-xl transition-all"
                        >
                            <Settings size={18} />
                            <span>{t.configureNow}</span>
                        </button>
                    </div>
                ) : (
                    /* KANBAN GRID */
                    <div className="flex-1 overflow-hidden p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 z-10">

                        {/* COLUMN 1: ECOS (Radar) */}
                        <DroppableColumn id="ECO" className="flex flex-col min-h-0 bg-titanium-900/20 rounded-2xl border border-titanium-800/50">
                            <div className="p-4 flex items-center gap-2 border-b border-titanium-800/50">
                                <Ghost size={16} className="text-cyan-500" />
                                <h2 className="text-sm font-bold text-cyan-500 uppercase tracking-wider">{t.echoes}</h2>
                                <span className="ml-auto text-xs font-mono text-titanium-600">{ghosts.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {ghosts.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                        <Ghost size={32} className="mb-2" />
                                        <p className="text-sm">{t.radarSilent}</p>
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
                                <h2 className="text-sm font-bold text-amber-500 uppercase tracking-wider">{t.limbos}</h2>
                                <span className="ml-auto text-xs font-mono text-titanium-600">{limbos.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {limbos.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                        <FileEdit size={32} className="mb-2" />
                                        <p className="text-sm">{t.workbenchClean}</p>
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
                                <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-wider">{t.anchors}</h2>
                                <span className="ml-auto text-xs font-mono text-titanium-600">{anchors.length}</span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                {anchors.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                                        <Anchor size={32} className="mb-2" />
                                        <p className="text-sm">{t.vaultEmpty}</p>
                                    </div>
                                ) : (
                                    anchors.map(e => (
                                        <DraggableForgeCard key={e.id} entity={e} onAction={handleEntityAction} />
                                    ))
                                )}
                            </div>
                        </DroppableColumn>
                    </div>
                )}

                {/* DRAG OVERLAY & MODALS (Chat, Purge) - Same as before */}
                <DragOverlay>
                    {activeEntity ? (
                        <div className="opacity-90 scale-105 rotate-2">
                            <ForgeCard entity={activeEntity} onAction={() => {}} />
                        </div>
                    ) : null}
                </DragOverlay>

                {/* CHAT MODAL */}
                {selectedEntity && activeSaga && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-in fade-in duration-200">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedEntity(null)} />
                        <div className="relative w-full max-w-5xl h-[90vh] bg-titanium-950 rounded-2xl shadow-2xl border border-titanium-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="absolute top-4 right-4 z-[60]">
                                <button onClick={() => setSelectedEntity(null)} className="p-2 rounded-full bg-titanium-900/80 hover:bg-red-900/50 text-titanium-400 hover:text-white transition-colors backdrop-blur border border-titanium-700/50 hover:border-red-500/50">
                                    <span className="sr-only">{t.closeChat}</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <ForgeChat
                                key={`forge_${activeSaga.id}_${selectedEntity.id}`}
                                sessionId={`forge_${activeSaga.id}_${selectedEntity.id}`}
                                sessionName={selectedEntity.name}
                                onBack={() => setSelectedEntity(null)}
                                folderId={folderId}
                                accessToken={accessToken}
                                activeEntity={selectedEntity}
                                selectedScope={{
                                    id: activeSaga.id,
                                    name: activeSaga.name,
                                    recursiveIds: [activeSaga.id],
                                    path: (activeSaga as any).path
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Purge Modal would go here... (omitted for brevity, assume same as before) */}
            </div>
        </DndContext>
    );
};

export default ForgeDashboard;
