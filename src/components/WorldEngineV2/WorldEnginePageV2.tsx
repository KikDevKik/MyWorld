import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent, ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import {
    Plus,
    Loader2,
    Globe,
    Eye,
    EyeOff
} from 'lucide-react';
import { toast } from 'sonner';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { callFunction } from '../../services/api';
import { EntityService } from '../../services/EntityService';
import { GraphNode, EntityType } from '../../types/graph';
import CrystallizeModal from '../ui/CrystallizeModal';
import { VisualNode, AnalysisCandidate, RealityMode } from './types';
import LinksOverlayV2, { LinksOverlayHandle } from './LinksOverlayV2';
import GraphSimulationV2, { GraphSimulationHandle } from './GraphSimulationV2';
import NexusTribunalModal from './NexusTribunalModal';
import { NodeDetailsSidebar } from './NodeDetailsSidebar';
import { NodeEditModal } from './NodeEditModal';
import { CommandBar } from './CommandBar';
import { scanProjectFiles } from './utils/NexusScanner';
import TheBuilder from './TheBuilder';
import { CreativeAuditService } from '../../services/CreativeAuditService';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

// 🟢 CONFIGURATION
const PENDING_KEY = 'nexus_pending_crystallization';
const DRAFTS_KEY = 'nexus_drafts_v1';
const IS_GHOST_MODE = import.meta.env.VITE_JULES_MODE === 'true';

// 🟢 HELPER: ID GENERATION (DETERMINISTIC)
// Phase 2.5 Upgrade: Removed Randomness to allow pre-linking
const generateId = (projectId: string, name: string, type: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Deterministic Hash (DJB2 variant)
    let hash = 5381;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) + hash) + name.charCodeAt(i); /* hash * 33 + c */
    }
    const shortHash = Math.abs(hash).toString(36).substring(0, 6);

    // Use substring of project ID for compactness
    const cleanProject = projectId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    return `${cleanProject}-${slug}-${shortHash}`;
};

interface PendingCrystallization {
    node: VisualNode;
    targetData: {
        fileName: string;
        folderId: string;
        frontmatter: any;
    };
    timestamp: number;
}

const WorldEnginePageV2: React.FC<{
    isOpen?: boolean,
    onClose?: () => void,
    activeGemId?: string,
    accessToken?: string | null,
    onRefreshTokens?: () => Promise<string | null>
}> = ({ isOpen = true, accessToken, onRefreshTokens }) => {
    // REFS
    const graphRef = useRef<GraphSimulationHandle>(null);
    const linksOverlayRef = useRef<LinksOverlayHandle>(null);
    const transformRef = useRef<ReactZoomPanPinchRef>(null); // 🟢 ZOOM REF

    // CONTEXT
    const { config, user, fileTree } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tNexus = t.nexus;

    // STATE: DATA
    const [dbNodes, setDbNodes] = useState<GraphNode[]>([]);
    const [ghostNodes, setGhostNodes] = useState<VisualNode[]>([]);
    const [pendingNodes, setPendingNodes] = useState<PendingCrystallization[]>([]);
    const [candidates, setCandidates] = useState<AnalysisCandidate[]>([]);
    const [ignoredTerms, setIgnoredTerms] = useState<string[]>([]); // 🟢 BLACKLIST STATE
    const [realityMode, setRealityMode] = useState<RealityMode>('FUSION');

    // STATE: UI
    const [loading, setLoading] = useState(true);
    const [lodTier, setLodTier] = useState<'MACRO' | 'MESO' | 'MICRO'>('MESO');
    const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredLineId, setHoveredLineId] = useState<string | null>(null);
    const [crystallizeModal, setCrystallizeModal] = useState<{ isOpen: boolean, node: VisualNode | null }>({ isOpen: false, node: null });
    const [isCrystallizing, setIsCrystallizing] = useState(false);

    // STATE: CAMERA FOCUS
    const [lastApprovedIds, setLastApprovedIds] = useState<string[]>([]);

    // STATE: CONFIRMATION MODALS
    const [isClearAllOpen, setIsClearAllOpen] = useState(false);

    // STATE: THE BUILDER
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);
    const [builderInitialPrompt, setBuilderInitialPrompt] = useState("");
    const [showUI, setShowUI] = useState(true);

    // ⚖️ AUDIT: THE DIRECTION (Reality Mode)
    const handleModeChange = (newMode: RealityMode) => {
        setRealityMode(newMode);
        if (user && config?.folderId) {
            CreativeAuditService.logCreativeEvent({
                projectId: config.folderId,
                userId: user.uid,
                component: 'CommandBar',
                actionType: 'CURATION',
                description: 'Director changed Reality Mode',
                payload: { newMode }
            });
        }
    };

    // STATE: NEXUS TRIBUNAL (Scanning)
    const [isScanning, setIsScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState('');
    const [showTribunal, setShowTribunal] = useState(false);

    // 🟢 DATA SUBSCRIPTION (Nodes)
    useEffect(() => {
        if (!user || !config?.folderId) {
            setLoading(false);
            return;
        }
        const unsubscribe = EntityService.subscribeToAllEntities(
            user.uid,
            config.folderId,
            (entities) => {
                setDbNodes(entities as any[]); // Temporary cast to match GraphNode interface
                setLoading(false);
            },
            (error) => {
                console.error("Subscription Error:", error);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [user, config?.folderId]);

    // 🟢 DATA SUBSCRIPTION (Blacklist)
    useEffect(() => {
        if (!user || !config?.folderId) return;
        const unsubscribe = EntityService.subscribeToProjectSettings(
            user.uid,
            config.folderId,
            (settings) => {
                setIgnoredTerms(settings?.ignoredTerms || []);
            },
            (error) => console.error("Settings Error:", error)
        );
        return () => unsubscribe();
    }, [user, config?.folderId]);

    // 🟢 UNIFIED NODES
    const unifiedNodes = useMemo(() => {
        const combined: VisualNode[] = [];
        dbNodes.forEach(n => combined.push({ ...n }));
        ghostNodes.forEach(g => combined.push({ ...g }));
        return combined;
    }, [dbNodes, ghostNodes]);

    // 🟢 CAMERA FOCUS EFFECT (Stabilized)
    const focusedIdsRef = useRef(new Set<string>());
    useEffect(() => {
        if (lastApprovedIds.length === 0 || !transformRef.current) return;

        // Filter out what we already focused to avoid loops
        const pendingFocus = lastApprovedIds.filter(id => !focusedIdsRef.current.has(id));
        if (pendingFocus.length === 0) {
            setLastApprovedIds([]); // All were already handled or invalid
            return;
        }

        const targets = unifiedNodes.filter(n => pendingFocus.includes(n.id) && typeof n.x === 'number' && typeof n.y === 'number');

        if (targets.length > 0) {
            // Calculate Centroid
            const sumX = targets.reduce((acc, n) => acc + (n.x || 0), 0);
            const sumY = targets.reduce((acc, n) => acc + (n.y || 0), 0);
            const cx = sumX / targets.length;
            const cy = sumY / targets.length;

            const viewportW = window.innerWidth;
            const viewportH = window.innerHeight;

            const targetScale = 1.2;
            const tx = (viewportW / 2) - (cx * targetScale);
            const ty = (viewportH / 2) - (cy * targetScale);

            console.log(`🎥 [Camera] Focusing on ${targets.length} new nodes at (${cx.toFixed(0)}, ${cy.toFixed(0)})`);

            transformRef.current.setTransform(tx, ty, targetScale, 1000, "easeOut");

            // Mark as focused and clear trigger
            targets.forEach(t => focusedIdsRef.current.add(t.id));
            setLastApprovedIds([]);
        }
    }, [lastApprovedIds, unifiedNodes]);

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
    const handleNexusClick = async () => {
        if (isScanning || showTribunal) return;

        // Guard: Check Prerequisites
        if (!fileTree || !config?.canonPaths || !config?.folderId) {
            toast.error(t.nexus?.incompleteConfig || "⚠️ Configuración incompleta. Verifica 'Carpetas Canon'.");
            return;
        }

        if (!accessToken) {
            toast.error(t.common?.sessionExpired || "Sesión de Drive no válida. Recarga la página.");
            return;
        }

        setIsScanning(true);
        setCandidates([]);
        setScanStatus(t.nexus?.initializingProtocol || "INICIALIZANDO PROTOCOLO TITANIUM...");

        try {
            // EXECUTE HYBRID SCAN
            // Note: ignoredTerms is now fetched via subscription and available in state
            const results = await scanProjectFiles(
                config.folderId, // 🟢 NEW: Project Context
                accessToken, // 🟢 NEW: Auth Token (Secure)
                fileTree,
                config.canonPaths,
                unifiedNodes, // 🟢 FIX: Check against ALL nodes (including Ghosts)
                (status, progress, total) => {
                    // Update UI with granular progress
                    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
                    setScanStatus(`${status.toUpperCase()} [${pct}%]`);
                },
                ignoredTerms, // 🟢 PASSING BLACKLIST
                t // 🟢 PASSING TRANSLATIONS
            );

            setCandidates(results);

            // Success Sequence
            setScanStatus(tNexus.analysisComplete || "ANÁLISIS COMPLETADO");
            setTimeout(() => {
                setIsScanning(false);
                setScanStatus("");
                setShowTribunal(true);
            }, 800);

        } catch (error: any) {
            console.error(`[Nexus Scan] Failed: ${error instanceof Error ? error.message : String(error)}`);
            setScanStatus("ERROR EN ESCANEO");
            toast.error(`${t.common.error}: ${error instanceof Error ? error.message : String(error)}`);
            setTimeout(() => setIsScanning(false), 2000);
        }
    };

    const handleUpdateGhost = (nodeId: string, updates: any) => {
        setGhostNodes(prev => prev.map(g => g.id === nodeId ? { ...g, ...updates } : g));
    };

    const handleSaveNode = async (nodeId: string, updates: any) => {
        // 1. Check if Ghost
        const isGhost = ghostNodes.some(g => g.id === nodeId);
        if (isGhost) {
            handleUpdateGhost(nodeId, updates);
            setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
            toast.success(t.common?.draftUpdated || "Borrador actualizado locally.");
            return;
        }

        // 2. Update DB
        if (!user || !config?.folderId) return;

        try {
             await EntityService.updateEntity(user.uid, nodeId, updates);
             toast.success(t.common?.nodeUpdated || "Nodo actualizado en Base de Datos.");
             setSelectedNode(prev => prev ? { ...prev, ...updates } : null);
        } catch (e: any) {
             console.error(`[Save Node] Failed: ${e instanceof Error ? e.message : String(e)}`);
             toast.error(`${t.common?.saveError || "Error guardando cambios"}: ` + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleDeleteNode = async (nodeId: string) => {
        // 1. Check if Ghost
        const isGhost = ghostNodes.some(g => g.id === nodeId);
        if (isGhost) {
            setGhostNodes(prev => prev.filter(g => g.id !== nodeId));
            setSelectedNode(null);
            toast.success(t.common?.draftDeleted || "Borrador eliminado.");
            return;
        }

        // 2. Delete DB
        if (!user || !config?.folderId) return;

        try {
             // Optimistic Update
             setDbNodes(prev => prev.filter(n => n.id !== nodeId));

             await EntityService.deleteEntity(user.uid, nodeId);
             toast.success(t.common?.nodeDeleted || "Nodo eliminado permanentemente.");
             setSelectedNode(null);
        } catch (e: any) {
             console.error(`[Delete Node] Failed: ${e instanceof Error ? e.message : String(e)}`);
             toast.error(`${t.common?.deleteError || "Error eliminando"}: ` + (e instanceof Error ? e.message : String(e)));
        }
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

        try {
            const token = accessToken;
            if (!token) throw new Error("Falta Token de Sesión.");
            await callFunction('crystallizeNode', {
                accessToken: token,
                folderId: data.folderId,
                fileName: data.fileName,
                content: (targetNode as any).content || `# ${targetNode.name}\n\n*Creado via NexusCanvas*`,
                frontmatter: data.frontmatter
            });
            setGhostNodes(prev => prev.filter(g => g.id !== targetNode.id));
            removeFromLifeboat(targetNode.id);
            toast.success(`💎 ${data.fileName} ${t.common?.crystallized || "cristalizado"}.`);

            // ⚖️ AUDIT: THE BIRTH
            if (user && config?.folderId) {
                CreativeAuditService.logCreativeEvent({
                    projectId: config.folderId,
                    userId: user.uid,
                    component: 'WorldEnginePageV2',
                    actionType: 'STRUCTURE',
                    description: `User materialized entity: ${data.fileName}`,
                    payload: {
                        entityId: targetNode.id,
                        nodeType: targetNode.type,
                        fileName: data.fileName
                    }
                });
            }

            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } catch (error: any) {
            console.error(`[Crystallize] Failed: ${error instanceof Error ? error.message : String(error)}`);
            toast.error(error instanceof Error ? error.message : String(error));
            saveToLifeboat(targetNode, data);
            if (!overrideNode) setCrystallizeModal({ isOpen: false, node: null });
        } finally {
            setIsCrystallizing(false);
        }
    };

    const handleClearAll = async () => {
        // if (!confirm("⚠️ ¿ELIMINAR TODO? Esto borrará todos los nodos de la base de datos y la vista local.")) return;
        setIsClearAllOpen(false); // Close modal

        setGhostNodes([]);
        setDbNodes([]); // Force clear local state immediately to prevent ghosts
        localStorage.removeItem('nexus_drafts_v1');
        if (user && config?.folderId) {
             try {
                 await EntityService.deleteAllProjectEntities(user.uid, config.folderId);
                 toast.success("🗑️ Todo eliminado (Local + DB).");
             } catch (e: any) {
                 toast.error("Error borrando DB: " + e.message);
             }
        } else {
             toast.success("🗑️ Vista local limpia.");
        }
    };

    // 🟢 HELPER: Resolve ID or Name to Real ID
    // UPDATED Phase 2.5: Case Insensitive + Staged/Ghost Awareness
    const resolveNodeId = async (nameOrId: string, projectId: string, userId: string): Promise<string | null> => {
        const normalized = nameOrId.toLowerCase().trim();

        // 0. Check Staged/Candidates (Priority: Memory)
        const stagedMatch = candidates.find(c => c.name.toLowerCase().trim() === normalized);
        if (stagedMatch) return stagedMatch.id;

        // 0.5 Check Ghost Nodes (Priority: Local Drafts)
        const ghostMatch = ghostNodes.find(g => g.name.toLowerCase().trim() === normalized);
        if (ghostMatch) return ghostMatch.id;

        // 0.7 Check dbNodes (Priority: Loaded DB)
        const dbMatch = dbNodes.find(n => n.name.toLowerCase().trim() === normalized);
        if (dbMatch) return dbMatch.id;

        // 1. Check if valid ID (Firestore Direct) - Fallback
        try {
            const entity = await EntityService.getEntity(userId, nameOrId);
            if (entity) return nameOrId;
        } catch (e) {}

        // 2. Fallback: Query by Name (Firestore Query)
        // Only if local check failed (case sensitivity might fail here)
        try {
            const entity = await EntityService.findEntityByName(userId, projectId, nameOrId);
            if (entity) return entity.id;
        } catch (e) {}

        return null;
    };

    // 🟢 TRIBUNAL UPDATE (Phase 3: Manual Fixes)
    const handleUpdateCandidate = (id: string, updates: Partial<AnalysisCandidate>) => {
        setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    // 🟢 TRIBUNAL ACTIONS (Phase 2.4/2.5)
    // Updated signature to handle specific REJECT variants
    const handleTribunalAction = async (action: 'APPROVE' | 'REJECT_SOFT' | 'REJECT_HARD', candidate: AnalysisCandidate) => {
        if (!user || !config?.folderId) {
            toast.error("Error de sesión.");
            return;
        }
        const projectId = config.folderId;

        // 1. REJECT: Protocolo de Rencor (Blacklist) or Soft Skip
        if (action === 'REJECT_SOFT') {
             setCandidates(prev => prev.filter(c => c.id !== candidate.id));
             return;
        }

        if (action === 'REJECT_HARD') {
            try {
                const currentSettings = await EntityService.getProjectSettings(user.uid, projectId) || {};
                const ignoredTerms = currentSettings.ignoredTerms || [];
                if (!ignoredTerms.includes(candidate.name.toLowerCase())) {
                    await EntityService.updateProjectSettings(user.uid, projectId, {
                        ignoredTerms: [...ignoredTerms, candidate.name.toLowerCase()]
                    });
                }
                toast.info(`Descartado y Silenciado: ${candidate.name}`);
            } catch (e) {
                console.warn(`[Blacklist] Update Failed: ${e instanceof Error ? e.message : String(e)}`);
                toast.info(t.nexus?.candidateDiscarded || "Candidato Descartado");
            }

            setCandidates(prev => prev.filter(c => c.id !== candidate.id));
            return;
        }

        // 2. APPROVE: DB Operations
        if (action === 'APPROVE') {
            console.log(`[Tribunal] Approving Candidate: ${candidate.name} (Action: ${candidate.suggestedAction})`);

            try {
                let targetId = ""; // 🟢 TRACKING TARGET ID

                // CASE A: MERGE
                if (candidate.suggestedAction === 'MERGE') {
                     if (!candidate.mergeWithId) {
                         console.error(`[Tribunal] Merge failed: Missing mergeWithId for ${candidate.name}`);
                         toast.error("Error: No se identificó con quién fusionar.");
                         return;
                     }

                     console.log(`[Tribunal] Attempting MERGE with target ID: ${candidate.mergeWithId}`);

                     // 🟢 FIX V3: SMART ID RESOLUTION (Fallback Protocol)
                     let realTargetId = candidate.mergeWithId;
                     let docSnap = await EntityService.getEntity(user.uid, realTargetId);

                     // Fallback: If ID is actually a Name?
                     if (!docSnap) {
                         console.warn(`[Tribunal] Target ID ${realTargetId} not found. Attempting resolution by name...`);
                         const resolvedId = await resolveNodeId(realTargetId, projectId, user.uid);

                         if (resolvedId) {
                             realTargetId = resolvedId;
                             docSnap = await EntityService.getEntity(user.uid, realTargetId);
                             console.info(`[Tribunal] Resolved "${candidate.mergeWithId}" to ID: ${realTargetId}`);
                         } else {
                             console.error(`[Tribunal] Resolution failed for "${candidate.mergeWithId}".`);
                             toast.error(`Error Crítico: El nodo destino "${candidate.mergeWithId}" no existe ni se pudo resolver.`);
                             return;
                         }
                     }

                     targetId = realTargetId;

                     // Prepare Updates (Aliases + Description if edited + Relations)
                     // 🟢 Relations Merging (With Smart ID Resolution)
                     const newRelations = await Promise.all((candidate.relations || []).map(async r => {
                         const resolvedId = await resolveNodeId(r.target, projectId, user.uid);
                         return {
                             targetId: resolvedId || generateId(projectId, r.target, 'concept'), // Fallback to prediction
                             targetName: r.target,
                             targetType: 'concept' as EntityType,
                             relation: r.type as any,
                             context: r.context,
                             sourceFileId: 'nexus-scan-merge'
                         };
                     }));

                     const existingData = docSnap as any;
                     const existingRelations = existingData?.relations || [];

                     // Simple Merge: Filter out duplicates based on targetId + relation
                     const mergedRelations = [...existingRelations];
                     newRelations.forEach(newRel => {
                         const exists = existingRelations.some((ex: any) => ex.targetId === newRel.targetId && ex.relation === newRel.relation);
                         if (!exists) mergedRelations.push(newRel);
                     });

                     // 🟢 MERGE EVIDENCE (With Timestamps)
                     const existingEvidence = existingData?.foundInFiles || [];
                     const newEvidence = candidate.foundInFiles?.map(f => {
                         const ev: any = {
                             fileId: f.fileId || 'nexus-scan',
                             fileName: f.fileName,
                             lastSeen: new Date().toISOString()
                         };
                         // Prevent undefined
                         if (f.fileLastModified) ev.fileLastModified = f.fileLastModified;
                         return ev;
                     }) || [];

                     const mergedEvidence = [...existingEvidence];
                     newEvidence.forEach(ne => {
                         // If fileId is missing (legacy), try to match by name, otherwise append
                         const idx = mergedEvidence.findIndex((e: any) =>
                            (ne.fileId && e.fileId === ne.fileId) || (!ne.fileId && e.fileName === ne.fileName)
                         );
                         if (idx >= 0) {
                             mergedEvidence[idx] = ne; // Update timestamp/version
                         } else {
                             mergedEvidence.push(ne);
                         }
                     });
                     
                     const newAliases = Array.from(new Set([...(existingData?.aliases || []), ...(candidate.aliases || [candidate.name])]));

                     const updates: any = {
                         aliases: newAliases,
                         relations: mergedRelations,
                         foundInFiles: mergedEvidence
                     };

                     // If description was explicitly edited/staged, update it too
                     if (candidate.description && candidate.description !== candidate.reasoning) {
                         updates.description = candidate.description;
                     }

                     await EntityService.updateEntity(user.uid, realTargetId, updates);
                     toast.success(`Fusión Completada: ${candidate.name} -> ID: ${realTargetId.substring(0,6)}...`);
                }
                // CASE B: CREATE / CONVERT
                else {
                     // We need 'type' which comes from backend but might be missing in strict interface
                     const rawCandidate = candidate as any;
                     const typeRaw = rawCandidate.type || 'concept';
                     const type = typeRaw.toLowerCase();

                     // Generate Deterministic ID
                     const newNodeId = generateId(projectId, candidate.name, type);
                     targetId = newNodeId;

                     // 🟢 MAP RELATIONS (With Smart ID Resolution)
                     const mappedRelations = await Promise.all((candidate.relations || []).map(async r => {
                         const resolvedId = await resolveNodeId(r.target, projectId, user.uid);
                         return {
                             targetId: resolvedId || generateId(projectId, r.target, 'concept'),
                             targetName: r.target,
                             targetType: 'concept' as EntityType,
                             relation: r.type as any,
                             context: r.context || "",
                             sourceFileId: 'nexus-scan'
                         };
                     }));

                     const newNode: GraphNode = {
                         id: newNodeId,
                         name: candidate.name,
                         type: type as EntityType,
                         projectId: projectId,
                         description: candidate.description || candidate.reasoning || "Imported via Nexus Tribunal",
                         aliases: candidate.aliases || [],
                         relations: mappedRelations, // 🟢 INJECTED
                         // Map evidence
                         foundInFiles: candidate.foundInFiles?.map(f => {
                             const ev: any = {
                                 fileId: f.fileId || 'nexus-scan',
                                 fileName: f.fileName,
                                 lastSeen: new Date().toISOString()
                             };
                             // Prevent undefined
                             if (f.fileLastModified) ev.fileLastModified = f.fileLastModified;
                             return ev;
                         }) || [],
                         meta: {},
                         // STRICT: No Coordinates (Let Physics decide)
                     };

                     // 🟢 CONDITIONAL FIELDS (Prevent Undefined)
                     if ((candidate as any).subtype) {
                         newNode.subtype = (candidate as any).subtype;
                     }

                     await EntityService.saveEntity(user.uid, newNodeId, newNode);
                     toast.success(`Nodo Creado: ${candidate.name}`);
                }

                // Update UI: Remove processed candidate
                setCandidates(prev => prev.filter(c => c.id !== candidate.id));

                // 🟢 TRIGGER CAMERA FOCUS
                if (targetId) {
                    setLastApprovedIds(prev => [...prev, targetId]);
                }

            } catch (e: any) {
                console.error(`[Tribunal Action] Failed: ${e instanceof Error ? e.message : String(e)}`);
                toast.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
    };

    // 🟢 TRIBUNAL BATCH MERGE ("The Unifier" - STAGING PHASE)
    const handleBatchMerge = async (winner: AnalysisCandidate, losers: AnalysisCandidate[]) => {
        // 1. Create Staged Super-Card (In-Memory Only)
        // Combine Descriptions
        let combinedDesc = winner.description || winner.reasoning || "";

        losers.forEach(loser => {
            const loserDesc = loser.description || loser.reasoning || "Sin descripción";
            combinedDesc += `\n\n--- Info de: ${loser.name} ---\n${loserDesc}`;
        });

        // Combine Aliases (Current + Loser Names)
        const currentAliases = winner.aliases || [];
        const loserNames = losers.map(l => l.name);
        const newAliases = Array.from(new Set([...currentAliases, ...loserNames]));

        // 🟢 COMBINE RELATIONS
        const winnerRelations = winner.relations || [];
        const loserRelations = losers.flatMap(l => l.relations || []);
        const allRelations = [...winnerRelations, ...loserRelations];
        // Deduplicate relations
        const uniqueRelations = allRelations.filter((rel, index, self) =>
            index === self.findIndex((t) => (
                t.target === rel.target && t.type === rel.type
            ))
        );

        // Create the Staged Candidate
        // 🟢 SANITIZATION: Explicitly pick fields to avoid circular refs
        const stagedCandidate: AnalysisCandidate = {
            id: winner.id,
            name: winner.name,
            ambiguityType: winner.ambiguityType,
            suggestedAction: winner.suggestedAction,
            category: winner.category,
            type: winner.type,
            subtype: winner.subtype,
            confidence: winner.confidence,
            reasoning: winner.reasoning,
            foundInFiles: winner.foundInFiles ? [...winner.foundInFiles] : [],
            mergeWithId: winner.mergeWithId,

            // Merged Fields
            description: combinedDesc,
            aliases: newAliases,
            relations: uniqueRelations, // 🟢 NEW
            isStaged: true,
        };

        // 2. Update UI State (Remove Losers, Replace Winner with Staged)
        const loserIds = new Set(losers.map(l => l.id));
        setCandidates(prev => {
            const filtered = prev.filter(c => !loserIds.has(c.id));
            return filtered.map(c => c.id === winner.id ? stagedCandidate : c);
        });

        toast.info("Fusión en fase de preparación. Revisa y aprueba la Super-Tarjeta.");
    };

    // 🟢 TRIBUNAL EDIT (Phase 2.4)
    const handleTribunalEdit = async (originalCandidate: AnalysisCandidate, newValues: { name: string, type: string, subtype: string, description?: string }) => {
         if (!user || !config?.folderId) return;
         const projectId = config.folderId;

         try {
             const type = newValues.type.toLowerCase();

             // 1. Generate NEW ID (Regenerate based on new name)
             const newNodeId = generateId(projectId, newValues.name, type);

             // 2. Check Collision
             const snap = await EntityService.getEntity(user.uid, newNodeId);
             if (snap) {
                 toast.error(`¡Error! Ya existe un nodo con ID similar para '${newValues.name}'. Fusiónalo manualmente.`);
                 return;
             }

             // 3. Save
             // 🟢 Relations Mapping (Smart)
             const mappedRelations = await Promise.all((originalCandidate.relations || []).map(async r => {
                 const resolvedId = await resolveNodeId(r.target, projectId, user.uid);
                 return {
                     targetId: resolvedId || generateId(projectId, r.target, 'concept'),
                     targetName: r.target,
                     targetType: 'concept' as EntityType,
                     relation: r.type as any,
                     context: r.context || "",
                     sourceFileId: 'nexus-scan'
                 };
             }));

             const newNode: GraphNode = {
                 id: newNodeId,
                 name: newValues.name,
                 type: type as EntityType,
                 projectId: projectId,
                 description: newValues.description || originalCandidate.description || originalCandidate.reasoning || "Edited & Approved via Nexus Tribunal",
                 aliases: originalCandidate.aliases || [],
                 relations: mappedRelations,
                 foundInFiles: originalCandidate.foundInFiles?.map(f => {
                     const ev: any = {
                         fileId: f.fileId || 'nexus-scan',
                         fileName: f.fileName,
                         lastSeen: new Date().toISOString()
                     };
                     if (f.fileLastModified) ev.fileLastModified = f.fileLastModified;
                     return ev;
                 }) || [],
                 meta: {},
             };

             if (newValues.subtype) {
                 newNode.subtype = newValues.subtype;
             }

             await EntityService.saveEntity(user.uid, newNodeId, newNode);
             toast.success(`Nodo Corregido y Creado: ${newValues.name}`);

             // 4. Remove Original
             setCandidates(prev => prev.filter(c => c.id !== originalCandidate.id));

             // 🟢 TRIGGER FOCUS
             setLastApprovedIds(prev => [...prev, newNodeId]);

         } catch (e: any) {
             toast.error(`Error al editar: ${e.message}`);
         }
    };

    // 🟢 RESTORE IGNORED (Phase 2.5)
    const handleRestoreIgnored = async (term: string) => {
        if (!user || !config?.folderId) return;
        try {
            const currentSettings = await EntityService.getProjectSettings(user.uid, config.folderId) || {};
            const ignoredTerms = currentSettings.ignoredTerms || [];
            await EntityService.updateProjectSettings(user.uid, config.folderId, {
                ignoredTerms: ignoredTerms.filter((t: string) => t !== term)
            });
            toast.success(`Restaurado: ${term}`);
        } catch (e: any) {
            toast.error("Error al restaurar: " + e.message);
        }
    };

    const handleBuilderTrigger = (text: string) => {
        setBuilderInitialPrompt(text);
        setIsBuilderOpen(true);
    };

    return (
        <div className="relative w-full h-full bg-[#141413] overflow-hidden font-sans text-white select-none">
             {/* WARMUP LOADER */}
             <AnimatePresence>
                {loading && (
                    <motion.div exit={{ opacity: 0 }} className="absolute inset-0 bg-[#141413] z-[100] flex items-center justify-center pointer-events-none">
                         <div className="text-cyan-500 font-mono tracking-widest animate-pulse">
                             {TRANSLATIONS[currentLanguage].nexus.loading || "INICIANDO MOTOR V2..."}
                         </div>
                    </motion.div>
                )}
             </AnimatePresence>

             {/* CANVAS WRAPPER */}
             <TransformWrapper
                ref={transformRef}
                initialScale={0.4}
                minScale={0.1}
                maxScale={3}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
                panning={{ activationKeys: ["Shift"], excluded: ["nodrag"] }}
                onPanning={() => linksOverlayRef.current?.forceUpdate()}
                onZoom={() => linksOverlayRef.current?.forceUpdate()}
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
                                onNodeClick={(n) => setSelectedNode(n)}
                                onUpdateGhost={handleUpdateGhost}
                                onCrystallize={(n) => setCrystallizeModal({ isOpen: true, node: n })}
                                isLoading={loading}
                                onTick={() => {
                                    linksOverlayRef.current?.forceUpdate();
                                }}
                            />
                        </TransformComponent>

                        {/* 🟢 ZOOM CONTROLS */}
                        {showUI && (
                            <div className="absolute bottom-8 right-8 flex flex-col gap-2 pointer-events-auto z-50">
                                <button onClick={() => zoomIn()} aria-label={tNexus.zoomIn || "Acercar vista"} className="p-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-colors text-slate-300 hover:text-white"><Plus size={20} /></button>
                                <button onClick={() => zoomOut()} aria-label={tNexus.zoomOut || "Alejar vista"} className="p-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-colors text-slate-300 hover:text-white flex items-center justify-center"><div className="w-4 h-[2px] bg-current" /></button>
                            </div>
                        )}
                    </>
                )}
             </TransformWrapper>

             <div className="absolute top-8 left-8 pointer-events-auto z-50">
                 <button
                    onClick={() => setShowUI(!showUI)}
                    aria-label={showUI ? (t.nexus?.hideUI || "Ocultar Interfaz") : (t.nexus?.showUI || "Mostrar Interfaz")}
                    className="p-3 bg-slate-900/80 backdrop-blur border border-slate-700/50 rounded-xl hover:border-cyan-500/50 transition-colors text-slate-300 hover:text-white"
                 >
                     {showUI ? <EyeOff size={20} /> : <Eye size={20} />}
                 </button>
             </div>

             {/* 🟢 NEXUS BUTTON (The Eye - Top Center) */}
             {showUI && (
                 <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                     <button
                        onClick={handleNexusClick}
                        disabled={isScanning}
                        aria-label={isScanning ? (t.nexus?.scanning || "Escaneando Nexus...") : (t.nexus?.startScan || "Iniciar Escaneo Nexus")}
                        className={`
                            group relative flex items-center justify-center px-8 py-4
                            bg-cyan-950/20 backdrop-blur-xl border border-cyan-500/30 rounded-full
                            transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.1)]
                            ${isScanning ? 'w-[400px] cursor-wait border-cyan-500/80 bg-cyan-950/50' : 'hover:bg-cyan-900/30 hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.3)]'}
                        `}
                     >
                         {isScanning ? (
                             <div className="flex items-center gap-3">
                                 <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
                                 <span className="font-mono text-xs font-bold text-cyan-300 tracking-widest animate-pulse">{scanStatus}</span>
                             </div>
                         ) : (
                             <>
                                <Globe className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
                                <span className="ml-3 font-mono font-bold text-cyan-300 tracking-[0.2em] group-hover:text-cyan-100 transition-colors">{tNexus.toolName?.toUpperCase() || 'NEXUS'}</span>
                             </>
                         )}
                     </button>
                 </div>
             )}

             {/* 🟢 COMMAND BAR (The Mouth - Bottom Center) */}
             {showUI && (
                 <div className="absolute bottom-12 left-1/2 -translate-x-1/2 pointer-events-auto z-50">
                    <CommandBar
                        onClearAll={() => setIsClearAllOpen(true)}
                        onCommit={handleBuilderTrigger}
                        mode={realityMode}
                        onModeChange={handleModeChange}
                    />
                 </div>
             )}

             {/* THE BUILDER */}
             <TheBuilder
                isOpen={isBuilderOpen}
                onClose={() => setIsBuilderOpen(false)}
                initialPrompt={builderInitialPrompt}
                initialMode={realityMode}
                accessToken={accessToken}
                onRefreshTokens={onRefreshTokens}
                existingNodes={dbNodes}
             />

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

             {/* TRIBUNAL MODAL */}
             <AnimatePresence>
                 {showTribunal && (
                     <NexusTribunalModal
                        isOpen={showTribunal}
                        onClose={() => setShowTribunal(false)}
                        candidates={candidates}
                        onAction={handleTribunalAction}
                        onEditApprove={handleTribunalEdit}
                        onBatchMerge={handleBatchMerge} // 🟢 NEW PROP
                        ignoredTerms={ignoredTerms}
                        onRestoreIgnored={handleRestoreIgnored}
                        existingNodes={unifiedNodes} // 🟢 V3 FIX
                        onUpdateCandidate={handleUpdateCandidate} // 🟢 V3 FIX
                     />
                 )}
             </AnimatePresence>

             {/* 🟢 SIDEBAR & EDIT MODAL */}
             <NodeDetailsSidebar
                node={selectedNode}
                isOpen={!!selectedNode}
                onClose={() => setSelectedNode(null)}
                onEdit={() => setIsEditModalOpen(true)}
             />

             <NodeEditModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                node={selectedNode}
                onSave={handleSaveNode}
                onDelete={handleDeleteNode}
             />

             {/* CONFIRMATION MODAL (NUCLEAR) */}
             {isClearAllOpen && (
                 <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-sm">
                     <div className="w-[400px] bg-red-950/20 border border-red-500 rounded-xl p-6 text-center shadow-[0_0_50px_rgba(220,38,38,0.2)]">
                         <h2 className="text-xl font-bold text-red-500 mb-4 tracking-widest">
                             {t.common?.dangerZone || "⚠️ ZONA DE PELIGRO"}
                         </h2>
                         <p className="text-sm text-red-200 mb-6 leading-relaxed">
                             {t.nexus?.incinerationWarning || "Estás a punto de ejecutar el Protocolo de Incineración. Esto eliminará PERMANENTEMENTE todos los nodos y conexiones de este proyecto. No hay vuelta atrás."}
                         </p>
                         <div className="flex gap-4 justify-center">
                             <button
                                 onClick={() => setIsClearAllOpen(false)}
                                 className="px-4 py-2 rounded text-sm font-bold text-slate-400 hover:text-white transition-colors"
                             >
                                 {t.common?.cancel?.toUpperCase() || "CANCELAR"}
                             </button>
                             <button
                                 onClick={handleClearAll}
                                 className="px-6 py-2 rounded bg-red-600 hover:bg-red-500 text-white text-sm font-bold shadow-lg transition-all"
                             >
                                 {t.common?.confirmDestruction || "CONFIRMAR DESTRUCCIÓN"}
                             </button>
                         </div>
                     </div>
                 </div>
             )}
        </div>
    );
};

export default WorldEnginePageV2;
