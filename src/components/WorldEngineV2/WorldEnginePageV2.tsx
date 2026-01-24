import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
    Plus,
    Loader2,
    Bug,
    Trash2,
    Globe
} from 'lucide-react';
import { getFirestore, collection, onSnapshot, getDocs, writeBatch } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { GraphNode, EntityType } from '../../types/graph';
import CrystallizeModal from '../ui/CrystallizeModal';
import { VisualNode } from './types';
import LinksOverlayV2, { LinksOverlayHandle } from './LinksOverlayV2';
import GraphSimulationV2, { GraphSimulationHandle } from './GraphSimulationV2';
import { CommandBar } from './CommandBar';

// 🟢 CONFIGURATION
const PENDING_KEY = 'nexus_pending_crystallization';
const DRAFTS_KEY = 'nexus_drafts_v1';
const IS_GHOST_MODE = import.meta.env.VITE_JULES_MODE === 'true';

interface PendingCrystallization {
    node: VisualNode;
    targetData: {
        fileName: string;
        folderId: string;
        frontmatter: any;
    };
    timestamp: number;
}

const WorldEnginePageV2: React.FC<{ isOpen?: boolean, onClose?: () => void, activeGemId?: string }> = ({ isOpen = true }) => {
    // REFS
    const graphRef = useRef<GraphSimulationHandle>(null);
    const linksOverlayRef = useRef<LinksOverlayHandle>(null);

    // CONTEXT
    const { config, user } = useProjectConfig();

    // STATE: DATA
    const [dbNodes, setDbNodes] = useState<GraphNode[]>([]);
    const [ghostNodes, setGhostNodes] = useState<VisualNode[]>([]);
    const [pendingNodes, setPendingNodes] = useState<PendingCrystallization[]>([]);

    // STATE: UI
    const [loading, setLoading] = useState(true);
    const [lodTier, setLodTier] = useState<'MACRO' | 'MESO' | 'MICRO'>('MESO');
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // 🟢 DATA SUBSCRIPTION (Mirrors V1)
    useEffect(() => {
        if (!user || !config?.folderId) {
            setLoading(false);
            return;
        }
        const db = getFirestore();
        const entitiesRef = collection(db, "users", user.uid, "projects", config.folderId, "entities");
        const unsubscribe = onSnapshot(entitiesRef, (snapshot) => {
            const loaded: GraphNode[] = [];
            snapshot.forEach(doc => loaded.push(doc.data() as GraphNode));
            setDbNodes(loaded);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, config?.folderId]);

    // 🟢 UNIFIED NODES
    const unifiedNodes = useMemo(() => {
        const combined: VisualNode[] = [];
        dbNodes.forEach(n => combined.push({ ...n }));
        ghostNodes.forEach(g => combined.push({ ...g }));
        return combined;
    }, [dbNodes, ghostNodes]);

    // 🟢 PERSISTENCE LOGIC (Lifeboat & Drafts)
    useEffect(() => {
        const savedRescue = localStorage.getItem(PENDING_KEY);
        let initialGhosts: VisualNode[] = [];
        if (savedRescue) {
            try {
                const parsed = JSON.parse(savedRescue) as PendingCrystallization[];
                setPendingNodes(parsed);
                initialGhosts = parsed.map(p => ({ ...p.node, isGhost: true, isRescue: true }));
            } catch (e) {}
        }
        const savedDrafts = localStorage.getItem(DRAFTS_KEY);
        if (savedDrafts) {
            try {
                const parsedDrafts = JSON.parse(savedDrafts) as VisualNode[];
                const rescueIds = new Set(initialGhosts.map(n => n.id));
                const uniqueDrafts = parsedDrafts.filter(d => !rescueIds.has(d.id));
                initialGhosts = [...initialGhosts, ...uniqueDrafts];
            } catch (e) {}
        }
        if (initialGhosts.length > 0) setGhostNodes(prev => [...prev, ...initialGhosts]);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (ghostNodes.length > 0) localStorage.setItem(DRAFTS_KEY, JSON.stringify(ghostNodes));
            else if (localStorage.getItem(DRAFTS_KEY)) localStorage.removeItem(DRAFTS_KEY);
        }, 1000);
        return () => clearTimeout(timer);
    }, [ghostNodes]);

    // 🟢 HANDLERS (Replicated)
    const handleUpdateGhost = (nodeId: string, updates: any) => {
        setGhostNodes(prev => prev.map(g => g.id === nodeId ? { ...g, ...updates } : g));
    };

    const saveToLifeboat = (node: VisualNode, targetData: any) => {
        const newItem: PendingCrystallization = { node, targetData, timestamp: Date.now() };
        setPendingNodes(prev => {
            const next = [...prev, newItem];
            localStorage.setItem(PENDING_KEY, JSON.stringify(next));
            return next;
        });
        setGhostNodes(prev => prev.map(g => g.id === node.id ? { ...g, isRescue: true } : g));
        toast.warning("⚠️ Guardado fallido. Nodo asegurado en Boya Local.");
    };

    const removeFromLifeboat = (nodeId: string) => {
        setPendingNodes(prev => {
            const next = prev.filter(p => p.node.id !== nodeId);
            localStorage.setItem(PENDING_KEY, JSON.stringify(next));
            return next;
        });
    };

    const handleCrystallizeConfirm = async (data: any, overrideNode?: VisualNode) => {
        const targetNode = overrideNode || crystallizeModal.node;
        if (!targetNode) return;
        setIsCrystallizing(true);
        const functions = getFunctions();
        const crystallizeNodeFn = httpsCallable(functions, 'crystallizeNode');
        try {
            const token = localStorage.getItem('google_drive_token');
            if (!token) throw new Error("Falta Token.");
            await crystallizeNodeFn({
                accessToken: token,
                folderId: data.folderId,
                fileName: data.fileName,
                content: targetNode.content || `# ${targetNode.name}\n\n*Creado via NexusCanvas*`,
                frontmatter: data.frontmatter
            });
            setGhostNodes(prev => prev.filter(g => g.id !== targetNode.id));
            removeFromLifeboat(targetNode.id);
            toast.success(`💎 ${data.fileName} cristalizado.`);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } catch (error: any) {
            console.error(error);
            toast.error(error.message);
            saveToLifeboat(targetNode, data);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } finally {
            setIsCrystallizing(false);
        }
    };

    // 🟢 DEBUG ARTIFACTS
    const spawnDebugNodes = (count: number = 50) => {
         const newGhosts: VisualNode[] = [];
         for (let i = 0; i < count; i++) {
            const id = `debug-${Date.now()}-${i}`;
            const r = Math.random();
            let type: EntityType = r < 0.5 ? 'character' : (r < 0.8 ? 'enemy' as any : 'location');
            newGhosts.push({
                id,
                name: `DEBUG ${i}`,
                type,
                description: "Test node",
                projectId: config?.folderId || 'debug',
                isGhost: true,
                x: 2000 + (Math.random()-0.5)*1000,
                y: 2000 + (Math.random()-0.5)*1000,
                relations: i > 0 ? [{
                    targetId: `debug-${Date.now()}-${i-1}`,
                    relation: 'FRIEND',
                    context: 'Swarm Link',
                    targetName: 'Prev',
                    targetType: 'character',
                    sourceFileId: 'debug'
                }] : [],
                meta: {}
            });
         }
         // Post-link fixup not needed if we accept imperfect initial links for debug
         setGhostNodes(prev => [...prev, ...newGhosts]);
         toast.success(`🪲 +${count} Nodos`);
    };

    const handleClearAll = async () => {
        if (!confirm("⚠️ ¿ELIMINAR TODO? Esto borrará todos los nodos de la base de datos y la vista local.")) return;
        setGhostNodes([]);
        setDbNodes([]); // Force clear local state immediately to prevent ghosts
        localStorage.removeItem('nexus_drafts_v1');
        if (user && config?.folderId) {
             const db = getFirestore();
             const entitiesRef = collection(db, "users", user.uid, "projects", config.folderId, "entities");
             try {
                 const snapshot = await getDocs(entitiesRef);
                 const batch = writeBatch(db);
                 snapshot.docs.forEach((doc) => {
                     batch.delete(doc.ref);
                 });
                 await batch.commit();
                 toast.success("🗑️ Todo eliminado (Local + DB).");
             } catch (e: any) {
                 toast.error("Error borrando DB: " + e.message);
             }
        } else {
             toast.success("🗑️ Vista local limpia.");
        }
    };

    return (
        <div className="relative w-full h-full bg-[#141413] overflow-hidden font-sans text-white select-none">
             {/* WARMUP LOADER */}
             <AnimatePresence>
                {loading && (
                    <motion.div exit={{ opacity: 0 }} className="absolute inset-0 bg-[#141413] z-[100] flex items-center justify-center pointer-events-none">
                         <div className="text-cyan-500 font-mono tracking-widest animate-pulse">INICIANDO MOTOR V2...</div>
                    </motion.div>
                )}
             </AnimatePresence>

             {/* CANVAS WRAPPER */}
             <TransformWrapper
                initialScale={0.8}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ activationKeys: ["Shift"], excluded: ["nodrag"] }}
                onPanning={() => linksOverlayRef.current?.forceUpdate()}
                onZooming={() => linksOverlayRef.current?.forceUpdate()}
                onTransformed={(ref) => {
                    linksOverlayRef.current?.forceUpdate();
                    const s = ref.state.scale;
                    if (s < 0.6) setLodTier('MACRO');
                    else if (s > 2.0) setLodTier('MICRO');
                    else setLodTier('MESO');
                }}
             >
                {({ zoomIn, zoomOut }) => (
                    <>
                        {/* 🟢 LINKS LAYER (OUTSIDE TRANSFORM) */}
                        <LinksOverlayV2
                            ref={linksOverlayRef}
                            nodes={unifiedNodes}
                            lodTier={lodTier}
                            hoveredNodeId={hoveredNodeId}
                            hoveredLineId={hoveredLineId}
                            setHoveredLineId={setHoveredLineId}
                        />

                        {/* 🟢 NODES LAYER (INSIDE TRANSFORM) */}
                        <TransformComponent
                            wrapperClass="!w-full !h-full"
                            contentClass="!w-full !h-full !z-10 relative !pointer-events-none"
                        >
                            <GraphSimulationV2
                                ref={graphRef}
                                nodes={unifiedNodes}
                                lodTier={lodTier}
                                setHoveredNodeId={setHoveredNodeId}
                                onNodeClick={(n) => console.log("Node Clicked:", n.name)}
                                onUpdateGhost={handleUpdateGhost}
                                onCrystallize={(n) => setCrystallizeModal({ isOpen: true, node: n })}
                                isLoading={loading}
                                onTick={() => linksOverlayRef.current?.forceUpdate()}
                            />
                        </TransformComponent>

                        {/* 🟢 ZOOM CONTROLS */}
                        <div className="absolute bottom-8 right-8 flex flex-col gap-2 pointer-events-auto z-50">
                             <button onClick={() => zoomIn()} className="p-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-colors text-slate-300 hover:text-white"><Plus size={20} /></button>
                             <button onClick={() => zoomOut()} className="p-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-colors text-slate-300 hover:text-white flex items-center justify-center"><div className="w-4 h-[2px] bg-current" /></button>
                        </div>
                    </>
                )}
             </TransformWrapper>

             {/* 🟢 NEXUS BUTTON (The Eye - Top Center) */}
             <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                 <button className="group relative flex items-center justify-center px-8 py-4 bg-cyan-950/20 backdrop-blur-xl border border-cyan-500/30 rounded-full hover:bg-cyan-900/30 hover:border-cyan-400/50 transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.3)]">
                     <Globe className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
                     <span className="ml-3 font-mono font-bold text-cyan-300 tracking-[0.2em] group-hover:text-cyan-100 transition-colors">NEXUS</span>
                 </button>
             </div>

             {/* 🟢 COMMAND BAR (The Mouth - Bottom Center) */}
             <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                <CommandBar />
             </div>

             {/* 🟢 DEBUG ARTIFACTS (Ghost Mode Only) */}
             {IS_GHOST_MODE && (
                 <div className="absolute top-8 right-8 flex flex-col gap-2 pointer-events-auto z-50">
                     <button
                        onClick={() => spawnDebugNodes(50)}
                        className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-900/40 hover:text-red-200 hover:border-red-400 transition-all"
                        title="Swarm Generator"
                     >
                        <Bug size={20} />
                     </button>
                     <button
                        onClick={handleClearAll}
                        className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-900/40 hover:text-red-200 hover:border-red-400 transition-all"
                        title="Nuclear Trash"
                     >
                        <Trash2 size={20} />
                     </button>
                 </div>
             )}

             {/* MODAL */}
             <AnimatePresence>
                {crystallizeModal.isOpen && (
                    <CrystallizeModal
                        isOpen={crystallizeModal.isOpen}
                        onClose={() => setCrystallizeModal({ isOpen: false, node: null })}
                        node={crystallizeModal.node ? {
                            title: crystallizeModal.node.name,
                            content: "",
                            metadata: { node_type: crystallizeModal.node.type, suggested_folder_category: 'Personajes' }
                        } : null}
                        onConfirm={handleCrystallizeConfirm}
                        isProcessing={isCrystallizing}
                    />
                )}
             </AnimatePresence>
        </div>
    );
};

export default WorldEnginePageV2;
