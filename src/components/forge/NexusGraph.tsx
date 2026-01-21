import React, { useEffect, useState, useMemo, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { X } from 'lucide-react';
import { EntityType, GraphNode } from '../../types/graph';

interface NexusGraphProps {
    projectId: string; // This is the folderId (Root)
    onClose: () => void;
    accessToken: string | null;
    nodes?: GraphNode[]; // 🟢 Unified Nodes (Canon + Ideas) - PREFERRED
    /** @deprecated Use nodes prop instead */
    localNodes?: any[];
    onNodeClick?: (nodeId: string, isLocal: boolean) => void; // Single Click (Select)
    onNodeDoubleClick?: (nodeId: string, isLocal: boolean) => void; // Double Click (Open)
    onNodeDragEnd?: (node: any) => void; // For persistence
    onLinkCreate?: (sourceId: string, targetId: string) => void; // For "Red Thread"
    onAutoFreeze?: (nodeId: string, x: number, y: number) => void; // 🟢 THE DROP: Auto-anchor logic
}

interface GraphData {
    nodes: any[];
    links: any[];
}

// 📐 SHAPE HELPERS
const drawHexagon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i;
        const angle_rad = Math.PI / 180 * angle_deg;
        const px = x + size * Math.cos(angle_rad);
        const py = y + size * Math.sin(angle_rad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
};

const drawDiamond = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
};

const NexusGraph: React.FC<NexusGraphProps> = ({
    projectId,
    onClose,
    nodes: propNodes,
    localNodes = [],
    onNodeClick,
    onNodeDoubleClick,
    onNodeDragEnd,
    onLinkCreate
}) => {
    const [entities, setEntities] = useState<GraphNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
    const graphRef = useRef<any>(null);
    const clickTimeoutRef = useRef<any>(null);
    const frozenNodesRef = useRef<Record<string, { x: number; y: number }>>({}); // 🟢 MEDUSA: Anchor Storage

    // Interaction State
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [linkDragState, setLinkDragState] = useState<{ active: boolean, source: any, currentPos: { x: number, y: number } | null }>({
        active: false, source: null, currentPos: null
    });

    // --- 1. DATA FETCHING (CONDITIONAL) ---
    // Only fetch if propNodes is NOT provided (Backward Compatibility / Fallback)
    useEffect(() => {
        console.log("NexusGraph Mounting...");
        if (propNodes) {
            console.log("Nodes received:", propNodes.length);
            setLoading(false);
            return;
        }

        const auth = getAuth();
        if (!auth.currentUser || !projectId) {
            setLoading(false);
            return;
        }

        const db = getFirestore();
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
    }, [projectId, propNodes]);

    // --- 2. GRAPH DATA PROCESSING (MEMOIZED) ---
    const graphData = useMemo<GraphData>(() => {
        const nodes: any[] = [];
        const links: any[] = [];
        const fileMap = new Map<string, string[]>(); // fileId -> [entityIds]
        const existingNodeIds = new Set<string>();
        const semanticPairs = new Set<string>(); // "idA-idB" (sorted) to track semantic overrides

        // DETERMINE SOURCE: Props vs Internal State
        // If propNodes is present, we assume it contains EVERYTHING (Canon + Ideas)
        // If not, we use internal `entities` + legacy `localNodes`
        const sourceNodes: GraphNode[] = propNodes || entities;
        const legacyIdeas = propNodes ? [] : localNodes;

        // HELPER: Color Coding
        const getTypeColor = (type: EntityType) => {
            switch (type) {
                case 'character': return '#06b6d4'; // Cyan
                case 'location': return '#a855f7'; // Violet
                case 'object': return '#f59e0b'; // Amber
                case 'event': return '#ef4444'; // Crimson
                case 'faction': return '#10b981'; // Emerald
                case 'concept': return '#ec4899'; // Pink
                case 'idea': return '#FFD700'; // 🟢 GOLD (Ideas) - "The Golden Snitch"
                default: return '#9ca3af'; // Gray
            }
        };

        // A. PROCESS NODES
        sourceNodes.forEach(entity => {
            if (existingNodeIds.has(entity.id)) return;
            existingNodeIds.add(entity.id);

            const isIdea = entity.type === 'idea';
            const isConcept = entity.type === 'concept';

            // Size based on injected 'val' (Tier) or fallback to appearances
            const appearanceCount = entity.foundInFiles?.length || 0;
            const val = (entity as any).val || ((isIdea || isConcept) ? 5 : Math.max(1, Math.min(10, Math.log2(appearanceCount + 1) * 3)));

            // 🟢 MEDUSA: Selective Anchoring logic
            // DB Persistence (Top Priority) > Local Freeze (Medium) > Floating (New)
            const frozen = frozenNodesRef.current[entity.id];
            const finalFx = entity.fx ?? frozen?.x;
            const finalFy = entity.fy ?? frozen?.y;

            nodes.push({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                color: getTypeColor(entity.type),
                val: val,
                entityData: entity,
                fx: finalFx, // Medusa: Persistence
                fy: finalFy,
                isLocal: isIdea, // Use type to distinguish
                agentId: (entity as any).agentId, // Carry over agentId if present
                isCanon: (entity as any).isCanon, // 🟢 STRICT FLAG
                fileId: (entity as any).fileId
            });

            // Index Files for Co-occurrence (only for Canon usually, but safely check)
            if (entity.foundInFiles) {
                entity.foundInFiles.forEach(file => {
                    if (!fileMap.has(file.fileId)) {
                        fileMap.set(file.fileId, []);
                    }
                    fileMap.get(file.fileId)?.push(entity.id);
                });
            }
        });

        // B. PROCESS LEGACY LOCAL IDEAS (If applicable)
        legacyIdeas.forEach(idea => {
            if (existingNodeIds.has(idea.id)) return;
            existingNodeIds.add(idea.id);

            nodes.push({
                id: idea.id,
                name: idea.title,
                type: 'idea',
                color: getTypeColor('idea'),
                val: 5,
                entityData: idea,
                fx: idea.fx,
                fy: idea.fy,
                isLocal: true,
                agentId: idea.agentId
            });
        });

        // C. PROCESS SEMANTIC RELATIONS & GHOST NODES
        sourceNodes.forEach(entity => {
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
                                    isGhost: true,
                                    meta: { tier: 'background' } // Implicit ghost tier
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
                        case 'CAUSE': linkColor = '#eab308'; break; // Yellow
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
    }, [entities, localNodes, propNodes]);

    // --- 3. INTERACTION HANDLERS ---

    // 🟢 MEDUSA: Force Configuration
    useEffect(() => {
        if (graphRef.current) {
            // "Anti-Clumping" - Increase repulsion
            graphRef.current.d3Force('charge').strength(-800);
        }
    }, [graphData]);

    // 🟢 THE DROP: AUTO-FREEZE PROTOCOL (4000ms)
    // Watches for NEW ideas that are not yet anchored (fx undefined).
    const processedFreezes = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!onAutoFreeze) return;

        graphData.nodes.forEach(node => {
            // CONDITIONS: Idea, Local, No Anchor, Not already processed
            if (
                node.type === 'idea' &&
                node.isLocal &&
                (node.fx === undefined || node.fx === null) &&
                !processedFreezes.current.has(node.id)
            ) {
                // MARK AS PROCESSING
                processedFreezes.current.add(node.id);
                console.log(`[The Drop] Timer started for: ${node.name} (${node.id})`);

                setTimeout(() => {
                    // RETRIEVE LIVE POSITION
                    // We must ask the graph engine for the *current* simulation node object
                    // because React state 'node' is stale (snapshot at render time).
                    if (graphRef.current) {
                        const internalData = graphRef.current.graphData();
                        const liveNode = internalData.nodes.find((n: any) => n.id === node.id);

                        if (liveNode && liveNode.x !== undefined && liveNode.y !== undefined) {
                            console.log(`[The Drop] Anchoring ${node.name} at [${liveNode.x.toFixed(0)}, ${liveNode.y.toFixed(0)}]`);
                            onAutoFreeze(node.id, liveNode.x, liveNode.y);
                        }
                    }
                }, 4000); // 4 Seconds Drop
            }
        });
    }, [graphData.nodes, onAutoFreeze]);

    // 🟢 MEDUSA: The Anchor
    const handleEngineStop = () => {
        // Freeze all nodes in their current position to prevent "Breathing"
        if (!graphRef.current) return;

        const currentData = graphRef.current.graphData();
        currentData.nodes.forEach((node: any) => {
            // If not already hard-anchored (DB), soft-anchor it now
            if (node.fx === undefined && node.x !== undefined) {
                node.fx = node.x;
                node.fy = node.y;
                frozenNodesRef.current[node.id] = { x: node.x, y: node.y };
            }
        });
    };

    // CLICK HANDLER (Single vs Double)
    const handleNodeClick = (node: any) => {
        if (clickTimeoutRef.current) {
            // DOUBLE CLICK DETECTED
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;

            if (onNodeDoubleClick) {
                onNodeDoubleClick(node.id, node.isLocal);
            } else {
                // Default: Open Internal Drawer
                setSelectedNode(node.entityData);
                graphRef.current?.centerAt(node.x, node.y, 1000);
                graphRef.current?.zoom(4, 2000);
            }
        } else {
            // SINGLE CLICK INITIATED
            clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                // Executed only if second click didn't happen
                if (onNodeClick) {
                    onNodeClick(node.id, node.isLocal);
                }
            }, 300); // 300ms window
        }
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        // Right Click (2) or Shift Key for Link Dragging
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
            className="absolute inset-0 z-0 bg-black/90 backdrop-blur-md overflow-hidden pointer-events-auto touch-auto"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onContextMenu={handleContextMenu}
        >
            {/* HEADER / CONTROLS */}
            <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 z-50 pointer-events-none">
                <div className="pointer-events-auto flex items-center gap-4">
                     <div className="px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-titanium-800 text-titanium-300 text-xs font-mono flex items-center gap-3">
                        <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]"></div> CHAR</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 border border-purple-500 bg-purple-500/20"></div> CONCEPT</span>
                        <span className="flex items-center gap-1"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-b-[6px] border-b-amber-500 border-r-[4px] border-r-transparent"></div> LOC</span>
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
                    linkLabel="label"

                    // Node Styling
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.name;
                        const fontSize = 12/globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;
                        ctx.lineWidth = 1.5 / globalScale;

                        // 1. CONCEPTS / IDEAS -> SQUARE
                        if (node.type === 'idea' || node.type === 'concept') {
                            const size = 20 / globalScale;

                            ctx.fillStyle = node.type === 'concept' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(20, 20, 20, 0.8)'; // Purple vs Slate
                            ctx.strokeStyle = node.color; // From helper

                            // Draw Square
                            ctx.beginPath();
                            ctx.rect(node.x - size/2, node.y - size/2, size, size);
                            ctx.fill();

                            // Dashed if it's a detected entity or local idea
                            if (node.isLocal || node.entityData?.meta?.tier === 'background' || node.isGhost) {
                                ctx.setLineDash([4/globalScale, 2/globalScale]);
                            } else {
                                ctx.setLineDash([]);
                            }

                            ctx.stroke();
                            ctx.setLineDash([]); // Reset

                            // Label
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#e2e8f0';
                            ctx.fillText(label, node.x, node.y + size/2 + 8/globalScale);
                            return;
                        }

                        // 2. LOCATIONS -> HEXAGON or TRIANGLE
                        if (node.type === 'location') {
                            const size = 8 / globalScale; // Radius
                            ctx.fillStyle = 'rgba(168, 85, 247, 0.1)'; // Faint Violet
                            ctx.strokeStyle = node.color;

                            drawHexagon(ctx, node.x, node.y, size);
                            ctx.fill();

                            if (node.entityData?.meta?.tier === 'background' || node.isGhost) {
                                ctx.setLineDash([4/globalScale, 2/globalScale]);
                            }
                            ctx.stroke();
                            ctx.setLineDash([]);

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = node.color;
                            ctx.fillText(label, node.x, node.y + size + 8/globalScale);
                            return;
                        }

                        // 3. OBJECTS -> DIAMOND
                        if (node.type === 'object') {
                            const size = 8 / globalScale;
                            ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
                            ctx.strokeStyle = node.color;

                            drawDiamond(ctx, node.x, node.y, size);
                            ctx.fill();

                            if (node.entityData?.meta?.tier === 'background' || node.isGhost) {
                                ctx.setLineDash([4/globalScale, 2/globalScale]);
                            }
                            ctx.stroke();
                            ctx.setLineDash([]);

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = node.color;
                            ctx.fillText(label, node.x, node.y + size + 8/globalScale);
                            return;
                        }

                        // 4. CHARACTERS (DEFAULT) -> CIRCLE
                        ctx.fillStyle = 'rgba(6, 182, 212, 0.1)'; // Cyan tint

                        // 🟢 VISUAL STATUS: CANON (SOLID) vs GHOST (DASHED)
                        if (node.isCanon) {
                             // SOLID BORDER (HAS FILE)
                            ctx.strokeStyle = node.color;
                            ctx.lineWidth = 1.5 / globalScale;
                            ctx.setLineDash([]);

                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                            ctx.fill();
                            ctx.stroke();
                        } else {
                            // GHOST / NEXUS ONLY (DASHED)
                            ctx.strokeStyle = node.color;
                            ctx.lineWidth = 1 / globalScale;
                            ctx.setLineDash([4/globalScale, 2/globalScale]);

                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                            ctx.stroke();
                            ctx.setLineDash([]);
                        }

                        // Text
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = node.color;
                        ctx.fillText(label, node.x, node.y + 8);
                    }}

                    // Interaction Hooks
                    onNodeHover={(node) => setHoveredNode(node)}
                    onNodeClick={handleNodeClick}
                    onNodeDragEnd={(node) => {
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

                    cooldownTicks={1000} // Medusa: Pre-warming (was 200)
                    d3VelocityDecay={0.9} // Medusa: High Friction (was 0.6)
                    d3AlphaDecay={0.2} // Medusa: Rapid Cooling (was 0.05)
                    onEngineStop={handleEngineStop} // Medusa: Anchor
                />
            </div>

            {/* DRAWER (DETAILS PANEL) - Only if internal drawer is active */}
            {/* Logic: If onNodeSelect (single click) AND onNodeDoubleClick (double click) are provided,
                we might NOT want the internal drawer at all.
                However, for backward compat or manual mode, we show it if selectedNode is set.
                selectedNode is set in handleNodeClick -> default double click behavior.
            */}
            {selectedNode && (
                <div
                    className={`absolute top-0 right-0 bottom-0 w-[400px] bg-titanium-950/95 border-l border-titanium-800 shadow-2xl transform transition-transform duration-300 ease-out z-50 flex flex-col translate-x-0`}
                >
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
                </div>
            )}
        </div>
    );
};

export default NexusGraph;
