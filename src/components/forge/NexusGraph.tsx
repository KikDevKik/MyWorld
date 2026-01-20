import React, { useEffect, useState, useMemo, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { X, Network, BookOpen, AlertTriangle } from 'lucide-react';
import { EntityType, GraphNode } from '../../types/graph';

interface NexusGraphProps {
    projectId: string; // This is the folderId (Root)
    onClose: () => void;
    accessToken: string | null;
}

interface GraphData {
    nodes: any[];
    links: any[];
}

const NexusGraph: React.FC<NexusGraphProps> = ({ projectId, onClose }) => {
    console.log("NEXUS DEBUG: ProjectID recibido:", projectId);
    const [entities, setEntities] = useState<GraphNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const graphRef = useRef<any>(null);

    // --- 1. DATA FETCHING ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser || !projectId) {
            setLoading(false);
            return;
        }

        const db = getFirestore();
        // PATH: users/{uid}/projects/{projectId}/entities
        const entitiesRef = collection(db, "users", auth.currentUser.uid, "projects", projectId, "entities");

        const unsubscribe = onSnapshot(query(entitiesRef), (snapshot) => {
            const loadedEntities: GraphNode[] = [];
            snapshot.forEach((doc) => {
                loadedEntities.push(doc.data() as GraphNode);
            });
            setEntities(loadedEntities);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [projectId]);

    // --- 2. GRAPH DATA PROCESSING (MEMOIZED) ---
    const graphData = useMemo<GraphData>(() => {
        if (entities.length === 0) return { nodes: [], links: [] };

        const nodes: any[] = [];
        const links: any[] = [];
        const fileMap = new Map<string, string[]>(); // fileId -> [entityIds]
        const existingNodeIds = new Set(entities.map(e => e.id));
        const semanticPairs = new Set<string>(); // "idA-idB" (sorted) to track semantic overrides

        // HELPER: Color Coding
        const getTypeColor = (type: EntityType) => {
            switch (type) {
                case 'character': return '#06b6d4'; // Cyan
                case 'location': return '#a855f7'; // Violet
                case 'object': return '#f59e0b'; // Amber
                case 'event': return '#ef4444'; // Crimson
                case 'faction': return '#10b981'; // Emerald
                case 'concept': return '#ec4899'; // Pink
                default: return '#9ca3af'; // Gray
            }
        };

        // A. BUILD REAL NODES & INDEX FILES
        entities.forEach(entity => {
            // Size based on appearances
            const appearanceCount = entity.foundInFiles?.length || 0;
            const val = Math.max(1, Math.min(10, Math.log2(appearanceCount + 1) * 3));

            nodes.push({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                color: getTypeColor(entity.type),
                val: val,
                entityData: entity
            });

            // Index Files for Co-occurrence
            if (entity.foundInFiles) {
                entity.foundInFiles.forEach(file => {
                    if (!fileMap.has(file.fileId)) {
                        fileMap.set(file.fileId, []);
                    }
                    fileMap.get(file.fileId)?.push(entity.id);
                });
            }
        });

        // B. PROCESS SEMANTIC RELATIONS & GHOST NODES
        entities.forEach(entity => {
            if (entity.relations && Array.isArray(entity.relations)) {
                entity.relations.forEach(rel => {
                    const targetId = rel.targetId;

                    // 1. Ghost Node Generation
                    if (!existingNodeIds.has(targetId)) {
                        // Check if already added as ghost in this pass
                        if (!nodes.find(n => n.id === targetId)) {
                            nodes.push({
                                id: targetId,
                                name: rel.targetName || "Unknown",
                                type: rel.targetType || 'concept',
                                color: getTypeColor(rel.targetType),
                                val: 1, // Small size for ghosts
                                isGhost: true, // Marker for visual style
                                entityData: {
                                    id: targetId,
                                    name: rel.targetName,
                                    type: rel.targetType,
                                    description: "Entidad inferida (Nodo Fantasma)",
                                    isGhost: true
                                }
                            });
                        }
                    }

                    // 2. Semantic Link Generation
                    let linkColor = '#9ca3af'; // Gray default
                    switch (rel.relation) {
                        case 'ENEMY': linkColor = '#ef4444'; break; // Red
                        case 'ALLY': linkColor = '#22c55e'; break; // Green
                        case 'MENTOR': linkColor = '#3b82f6'; break; // Blue
                        case 'FAMILY': linkColor = '#10b981'; break; // Emerald/Green variant
                        case 'NEUTRAL': linkColor = '#6b7280'; break; // Gray
                    }

                    links.push({
                        source: entity.id,
                        target: targetId,
                        color: linkColor,
                        width: 2, // Thicker than co-occurrence
                        label: `${rel.relation}: ${rel.context}`, // Tooltip
                        isSemantic: true
                    });

                    // Track semantic pair to override co-occurrence
                    const pairKey = [entity.id, targetId].sort().join('::');
                    semanticPairs.add(pairKey);
                });
            }
        });

        // C. BUILD EDGES (CO-OCCURRENCE) - WITH OVERRIDE
        const linkMap = new Map<string, number>();

        fileMap.forEach((entityIds) => {
            if (entityIds.length < 2) return;
            for (let i = 0; i < entityIds.length; i++) {
                for (let j = i + 1; j < entityIds.length; j++) {
                    const idA = entityIds[i];
                    const idB = entityIds[j];
                    const key = [idA, idB].sort().join('::');

                    // Skip if Semantic Link exists
                    if (semanticPairs.has(key)) continue;

                    linkMap.set(key, (linkMap.get(key) || 0) + 1);
                }
            }
        });

        linkMap.forEach((weight, key) => {
            const [source, target] = key.split('::');
            let width = 0.5;
            let linkColor = '#374151'; // Faint gray

            if (weight >= 5) { width = 1; linkColor = '#4b5563'; }
            if (weight >= 10) { width = 2; linkColor = '#6b7280'; }

            links.push({
                source,
                target,
                width,
                color: linkColor,
                opacity: 0.2, // Visual differentiation
                isSemantic: false
            });
        });

        return { nodes, links };
    }, [entities]);

    // --- GUARD CLAUSE ---
    if (!projectId) return null;

    // --- 3. ZERO STATE ---
    if (!loading && entities.length === 0) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-3 bg-titanium-800/50 hover:bg-red-500/20 text-titanium-400 hover:text-red-400 rounded-full transition-all border border-titanium-700 hover:border-red-500/50 z-50"
                >
                    <X size={32} />
                </button>

                <div className="text-center max-w-lg p-8 border border-titanium-800 rounded-3xl bg-titanium-900/50">
                    <div className="w-20 h-20 mx-auto bg-titanium-950 rounded-full flex items-center justify-center border border-titanium-800 mb-6 text-titanium-600">
                        <Network size={40} />
                    </div>
                    <h2 className="text-3xl font-bold text-titanium-100 mb-4 tracking-tight">Universo no Cartografiado</h2>
                    <p className="text-titanium-400 text-lg mb-8">
                        No se detectaron entidades en el sistema Nexus.
                        <br/><span className="text-sm opacity-70 mt-2 block">Ejecuta "NEXUS SYNC" en La Forja para escanear tus archivos y visualizar la red.</span>
                    </p>
                </div>
            </div>
        );
    }

    // --- 4. RENDER GRAPH ---
    return (
        <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-md animate-fade-in overflow-hidden">
            {/* HEADER / CONTROLS */}
            <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 z-50 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-4">
                     <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-titanium-800 text-titanium-300 text-xs font-mono flex items-center gap-3">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div> CHAR</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></div> LOC</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div> OBJ</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div> ENEMY</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div> ALLY</span>
                     </div>
                </div>

                <button
                    onClick={onClose}
                    className="pointer-events-auto p-3 bg-titanium-900 hover:bg-titanium-800 text-titanium-400 hover:text-white rounded-full transition-all border border-titanium-700 hover:border-white/20 shadow-lg"
                >
                    <X size={24} />
                </button>
            </div>

            {/* GRAPH CANVAS */}
            <div className="w-full h-full cursor-move">
                <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeLabel="name"
                    nodeColor="color"
                    nodeRelSize={6}

                    // Link Styling
                    linkColor="color"
                    linkWidth="width"
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0.2}
                    linkLabel="label" // Shows "ENEMY: Stabbed..." on hover

                    // Node Styling
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.name;
                        const fontSize = 12/globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;
                        const textWidth = ctx.measureText(label).width;
                        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

                        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                        if (node.isGhost) {
                            ctx.strokeStyle = node.color;
                            ctx.lineWidth = 1 / globalScale;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                            ctx.stroke();
                            // Dotted effect simulation (canvas primitive) not easy, sticking to outline
                        } else {
                            ctx.fillStyle = node.color;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                            ctx.fill();
                        }

                        // Text
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = node.color;
                        ctx.fillText(label, node.x, node.y + 8);
                    }}

                    backgroundColor="rgba(0,0,0,0)"
                    onNodeClick={(node) => {
                        setSelectedNode(node.entityData);
                        graphRef.current?.centerAt(node.x, node.y, 1000);
                        graphRef.current?.zoom(4, 2000);
                    }}
                    onBackgroundClick={() => setSelectedNode(null)}
                    cooldownTicks={100}
                />
            </div>

            {/* DRAWER (DETAILS PANEL) */}
            <div
                className={`absolute top-0 right-0 bottom-0 w-[400px] bg-titanium-950/95 border-l border-titanium-800 shadow-2xl transform transition-transform duration-300 ease-out z-50 flex flex-col
                    ${selectedNode ? 'translate-x-0' : 'translate-x-full'}
                `}
            >
                {selectedNode && (
                    <div className="flex flex-col h-full">
                        {/* Drawer Header */}
                        <div className="p-6 border-b border-titanium-800 bg-titanium-900/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded border
                                    ${selectedNode.type === 'character' ? 'text-cyan-400 border-cyan-900 bg-cyan-950/30' :
                                      selectedNode.type === 'location' ? 'text-purple-400 border-purple-900 bg-purple-950/30' :
                                      selectedNode.type === 'event' ? 'text-red-400 border-red-900 bg-red-950/30' :
                                      'text-amber-400 border-amber-900 bg-amber-950/30'}
                                `}>
                                    {selectedNode.type}
                                </span>
                                <button onClick={() => setSelectedNode(null)} className="text-titanium-500 hover:text-white">
                                    <X size={18} />
                                </button>
                            </div>
                            <h2 className="text-2xl font-bold text-white leading-tight">{selectedNode.name}</h2>
                        </div>

                        {/* Drawer Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Description */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-bold text-titanium-500 uppercase">Descripción</h4>
                                <p className="text-titanium-300 text-sm leading-relaxed">
                                    {selectedNode.description || "Sin descripción registrada en el Nexus."}
                                </p>
                            </div>

                            {/* Appearances */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-titanium-500 uppercase flex items-center gap-2">
                                    <BookOpen size={12} />
                                    Apariciones ({selectedNode.foundInFiles?.length || 0})
                                </h4>
                                <div className="space-y-1">
                                    {selectedNode.foundInFiles?.slice(0, 20).map((file, idx) => (
                                        <div key={`${file.fileId}-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-titanium-900/50 border border-titanium-800/50 hover:border-titanium-700 transition-colors group cursor-default">
                                            <div className="w-1 h-8 bg-titanium-800 group-hover:bg-accent-DEFAULT transition-colors rounded-full" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-titanium-200 truncate">{file.fileName}</p>
                                                <p className="text-[10px] text-titanium-500">{new Date(file.lastSeen).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {(selectedNode.foundInFiles?.length || 0) > 20 && (
                                        <p className="text-xs text-center text-titanium-600 pt-2 italic">
                                            + {(selectedNode.foundInFiles?.length || 0) - 20} más...
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Drawer Footer */}
                         <div className="p-4 border-t border-titanium-800 bg-titanium-900/30 text-[10px] text-center text-titanium-600 font-mono">
                            ID: {selectedNode.id.substring(0, 8)}...
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NexusGraph;
