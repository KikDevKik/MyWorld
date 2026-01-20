import React, { useEffect, useState, useMemo, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { X, Network, BookOpen, AlertTriangle } from 'lucide-react';
import { EntityType, GraphNode } from '../../types/graph';

// Simplified Node interface from WorldEnginePanel
interface LocalIdeaNode {
    id: string;
    title: string;
    type: string;
    content: string;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
    metadata?: any;
    agentId?: string;
}

interface NexusGraphProps {
    projectId: string; // This is the folderId (Root)
    onClose: () => void;
    accessToken: string | null;
    localNodes?: LocalIdeaNode[]; // "Ideas" (Micro-Cards)
    onNodeSelect?: (nodeId: string, isLocal: boolean) => void;
    onNodeDragEnd?: (node: any) => void; // For persistence
    onLinkCreate?: (sourceId: string, targetId: string) => void; // For "Red Thread"
}

interface GraphData {
    nodes: any[];
    links: any[];
}

const NexusGraph: React.FC<NexusGraphProps> = ({
    projectId,
    onClose,
    localNodes = [],
    onNodeSelect,
    onNodeDragEnd,
    onLinkCreate
}) => {
    console.log("NEXUS DEBUG: ProjectID recibido:", projectId);
    const [entities, setEntities] = useState<GraphNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const graphRef = useRef<any>(null);

    // Interaction State
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [linkDragState, setLinkDragState] = useState<{ active: boolean, source: any, currentPos: { x: number, y: number } | null }>({
        active: false, source: null, currentPos: null
    });

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
        const nodes: any[] = [];
        const links: any[] = [];
        const fileMap = new Map<string, string[]>(); // fileId -> [entityIds]
        const existingNodeIds = new Set<string>();
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
                case 'idea': return '#94a3b8'; // Slate (Ideas)
                default: return '#9ca3af'; // Gray
            }
        };

        // A. PROCESS FIRESTORE ENTITIES
        entities.forEach(entity => {
            existingNodeIds.add(entity.id);
            // Size based on appearances
            const appearanceCount = entity.foundInFiles?.length || 0;
            const val = Math.max(1, Math.min(10, Math.log2(appearanceCount + 1) * 3));

            nodes.push({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                color: getTypeColor(entity.type),
                val: val,
                entityData: entity,
                fx: entity.fx, // Spatial Persistence
                fy: entity.fy,
                isLocal: false
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

        // B. PROCESS LOCAL IDEAS (Micro-Cards)
        localNodes.forEach(idea => {
            // Avoid ID collision (though unlikely with timestamps)
            if (existingNodeIds.has(idea.id)) return;
            existingNodeIds.add(idea.id);

            nodes.push({
                id: idea.id,
                name: idea.title,
                type: 'idea',
                color: getTypeColor('idea'),
                val: 5, // Fixed size for ideas
                entityData: idea,
                fx: idea.fx, // Spatial Persistence (from Drag)
                fy: idea.fy,
                isLocal: true,
                agentId: idea.agentId
            });

            // TODO: Process local idea connections if stored in metadata
        });

        // C. PROCESS SEMANTIC RELATIONS & GHOST NODES
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
                                },
                                isLocal: false
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

        // D. BUILD EDGES (CO-OCCURRENCE) - WITH OVERRIDE
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
    }, [entities, localNodes]);

    // --- 3. INTERACTION HANDLERS (LINK DRAG) ---
    const handlePointerDown = (e: React.PointerEvent) => {
        // Right Click (2) or Shift Key
        if ((e.button === 2 || e.shiftKey) && hoveredNode && onLinkCreate) {
            e.preventDefault();
            e.stopPropagation(); // Stop pan
            setLinkDragState({
                active: true,
                source: hoveredNode,
                currentPos: { x: hoveredNode.x, y: hoveredNode.y }
            });
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (linkDragState.active && graphRef.current) {
            const coords = graphRef.current.screen2GraphCoords(e.clientX, e.clientY);
            setLinkDragState(prev => ({ ...prev, currentPos: coords }));
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (linkDragState.active) {
            if (hoveredNode && hoveredNode.id !== linkDragState.source.id && onLinkCreate) {
                // Success: Create Link
                onLinkCreate(linkDragState.source.id, hoveredNode.id);
            }
            setLinkDragState({ active: false, source: null, currentPos: null });
        }
    };

    // Disable context menu for right-drag
    const handleContextMenu = (e: React.MouseEvent) => {
        if (e.shiftKey || hoveredNode) {
            e.preventDefault();
        }
    };


    // --- GUARD CLAUSE ---
    if (!projectId) return null;

    // --- 4. RENDER GRAPH ---
    return (
        <div
            className="absolute inset-0 z-0 bg-black/90 backdrop-blur-md overflow-hidden"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={handleContextMenu}
        >
            {/* HEADER / CONTROLS - Only show close if NOT embedded (checked via localNodes presence as proxy for now, or just keep it) */}
            {/* If embedded in WorldEngine, we might hide the close button or handle it differently.
                For now, we keep it as 'onClose' is passed. */}
            <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 z-50 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-4">
                     <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-titanium-800 text-titanium-300 text-xs font-mono flex items-center gap-3">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div> CHAR</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-400 border border-slate-600 border-dashed"></div> IDEA</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]"></div> ENEMY</span>
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

                        // MICRO-CARD (IDEA) RENDER
                        if (node.type === 'idea') {
                            const size = 20 / globalScale; // Base size

                            ctx.fillStyle = 'rgba(20, 20, 20, 0.8)';
                            ctx.strokeStyle = '#94a3b8'; // Slate 400
                            ctx.lineWidth = 2 / globalScale;

                            // Draw Square
                            ctx.beginPath();
                            ctx.rect(node.x - size/2, node.y - size/2, size, size);
                            ctx.fill();
                            ctx.setLineDash([4/globalScale, 2/globalScale]); // Dashed
                            ctx.stroke();
                            ctx.setLineDash([]); // Reset

                            // Label
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#e2e8f0';
                            ctx.fillText(label, node.x, node.y + size/2 + 8/globalScale);
                            return;
                        }

                        // STANDARD NODE RENDER
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
                        if (node.isGhost) {
                            ctx.strokeStyle = node.color;
                            ctx.lineWidth = 1 / globalScale;
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                            ctx.stroke();
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

                    // Interaction Hooks
                    onNodeHover={(node) => setHoveredNode(node)}
                    onNodeClick={(node) => {
                        if (onNodeSelect) {
                            // Trigger Macro Card
                            onNodeSelect(node.id, node.isLocal);
                        } else {
                            // Fallback to internal drawer
                            setSelectedNode(node.entityData);
                            graphRef.current?.centerAt(node.x, node.y, 1000);
                            graphRef.current?.zoom(4, 2000);
                        }
                    }}
                    onNodeDragEnd={(node) => {
                        // Persistence Hook
                        node.fx = node.x;
                        node.fy = node.y;
                        if (onNodeDragEnd) onNodeDragEnd(node);
                    }}
                    onBackgroundClick={() => setSelectedNode(null)}

                    // Render Temp Link
                    onRenderFramePost={(ctx, globalScale) => {
                        if (linkDragState.active && linkDragState.source && linkDragState.currentPos) {
                            ctx.beginPath();
                            ctx.moveTo(linkDragState.source.x, linkDragState.source.y);
                            ctx.lineTo(linkDragState.currentPos.x, linkDragState.currentPos.y);
                            ctx.strokeStyle = '#ef4444'; // Red Thread
                            ctx.lineWidth = 2 / globalScale;
                            ctx.setLineDash([5/globalScale, 5/globalScale]);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        }
                    }}

                    cooldownTicks={100}
                />
            </div>

            {/* DRAWER (DETAILS PANEL) - Only if not using external select */}
            {!onNodeSelect && (
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
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-titanium-500 uppercase">Descripción</h4>
                                    <p className="text-titanium-300 text-sm leading-relaxed">
                                        {selectedNode.description || "Sin descripción registrada en el Nexus."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NexusGraph;
