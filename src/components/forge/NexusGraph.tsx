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
    neighbors: Map<string, Set<string>>;
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
    onLinkCreate,
    onAutoFreeze
}) => {
    const [entities, setEntities] = useState<GraphNode[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

    // 🟢 FOCUS MODE STATE
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

    const graphRef = useRef<any>(null);
    const clickTimeoutRef = useRef<any>(null);
    const frozenNodesRef = useRef<Record<string, { x: number; y: number }>>({}); // 🟢 MEDUSA: Anchor Storage
    const hasRenderedRef = useRef(false); // 🟢 RASTREO DE INICIALIZACIÓN

    // Interaction State
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [hoveredLink, setHoveredLink] = useState<any>(null); // 🟢 HOVER STATE FOR LINKS
    const [linkDragState, setLinkDragState] = useState<{ active: boolean, source: any, currentPos: { x: number, y: number } | null }>({
        active: false, source: null, currentPos: null
    });

    // --- 1. DATA FETCHING (CONDITIONAL) ---
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
        const neighbors = new Map<string, Set<string>>(); // For Focus Mode
        const fileMap = new Map<string, string[]>(); // fileId -> [entityIds]
        const existingNodeIds = new Set<string>();
        const semanticPairs = new Set<string>(); // "idA-idB" (sorted) to track semantic overrides
        const linkDirectionMap = new Map<string, boolean>(); // "idA->idB" -> exists

        // DETERMINE SOURCE: Props vs Internal State
        const sourceNodes: GraphNode[] = propNodes || entities;
        const legacyIdeas = propNodes ? [] : localNodes;

        // 🟢 COLOR CODING: SMART PALETTE
        const getNodeColor = (node: GraphNode) => {
            // 1. FACTION OVERRIDE (Meta)
            // TODO: Ensure 'faction' is correctly propagated in GraphNode interface or check loosely
            const meta = (node as any).meta || {};
            if (meta.faction) {
                // If we had a faction-to-color map, we'd use it here.
                // For now, we fall back to Type unless specific factions are hardcoded.
                // Assuming no hardcoded faction colors yet, proceeding to Type Logic.
            }

            // 2. TYPE FALLBACK
            switch (node.type) {
                case 'character': return '#06b6d4'; // Cyan Neon
                case 'location': return '#10b981'; // Emerald Green
                case 'object': return '#f59e0b'; // Amber/Gold
                case 'event': return '#ef4444'; // Red/Magenta
                case 'faction': return '#8b5cf6'; // Violet
                case 'concept': return '#ec4899'; // Pink
                case 'idea': return '#FFD700'; // GOLD
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
            const frozen = frozenNodesRef.current[entity.id];
            let finalFx = entity.fx ?? frozen?.x;
            let finalFy = entity.fy ?? frozen?.y;

            if (finalFx !== undefined) {
                if (typeof finalFx !== 'number' || isNaN(finalFx)) finalFx = 0;
            }
            if (finalFy !== undefined) {
                if (typeof finalFy !== 'number' || isNaN(finalFy)) finalFy = 0;
            }

            nodes.push({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                color: getNodeColor(entity),
                val: val,
                entityData: entity,
                fx: finalFx,
                fy: finalFy,
                isLocal: isIdea,
                agentId: (entity as any).agentId,
                isCanon: (entity as any).isCanon,
                fileId: (entity as any).fileId
            });

            // Index Files
            if (entity.foundInFiles) {
                entity.foundInFiles.forEach(file => {
                    if (!fileMap.has(file.fileId)) {
                        fileMap.set(file.fileId, []);
                    }
                    fileMap.get(file.fileId)?.push(entity.id);
                });
            }
        });

        // B. PROCESS LEGACY LOCAL IDEAS
        legacyIdeas.forEach(idea => {
            if (existingNodeIds.has(idea.id)) return;
            existingNodeIds.add(idea.id);

            nodes.push({
                id: idea.id,
                name: idea.title,
                type: 'idea',
                color: getNodeColor(idea),
                val: 5,
                entityData: idea,
                fx: idea.fx,
                fy: idea.fy,
                isLocal: true,
                agentId: idea.agentId
            });
        });

        // C. PRE-PROCESS RELATIONS FOR BIDIRECTIONAL CHECK
        sourceNodes.forEach(entity => {
            if (entity.relations && Array.isArray(entity.relations)) {
                entity.relations.forEach(rel => {
                   linkDirectionMap.set(`${entity.id}->${rel.targetId}`, true);
                });
            }
        });

        // D. PROCESS SEMANTIC RELATIONS & GHOST NODES
        sourceNodes.forEach(entity => {
            if (entity.relations && Array.isArray(entity.relations)) {
                entity.relations.forEach(rel => {
                    const targetId = rel.targetId;

                    // 1. Ghost Node Generation
                    if (!existingNodeIds.has(targetId)) {
                        if (!nodes.find(n => n.id === targetId)) {
                            nodes.push({
                                id: targetId,
                                name: rel.targetName || "Unknown",
                                type: rel.targetType || 'concept',
                                color: getNodeColor({ type: rel.targetType || 'concept' } as GraphNode),
                                val: 1,
                                isGhost: true,
                                entityData: {
                                    id: targetId,
                                    name: rel.targetName,
                                    type: rel.targetType,
                                    description: "Entidad inferida (Nodo Fantasma)",
                                    isGhost: true,
                                    meta: { tier: 'background' }
                                },
                                isLocal: false
                            });
                        }
                    }

                    // 2. Semantic Link Generation
                    let linkDist = 100; // Default Medium

                    // 🟢 FORCE TUNING: SEMANTIC DISTANCE
                    switch (rel.relation) {
                        // CLOSE (Strong)
                        case 'FAMILY':
                        case 'LOVER':
                        case 'PART_OF':
                            linkDist = 50;
                            break;
                        // MEDIUM (Standard)
                        case 'FRIEND':
                        case 'KNOWS':
                        case 'TALKS_TO':
                        case 'ALLY':
                        case 'MENTOR':
                            linkDist = 120;
                            break;
                        // FAR (Weak/Repelled)
                        case 'ENEMY':
                        case 'HATES':
                            linkDist = 300;
                            break;
                        case 'LOCATED_IN':
                            linkDist = 180; // Orbit
                            break;
                        case 'NEUTRAL':
                        default:
                            linkDist = 120;
                            break;
                    }

                    // 🟢 CURVATURE LOGIC: CHECK RECIPROCITY
                    const isBidirectional = linkDirectionMap.has(`${targetId}->${entity.id}`);
                    const curvature = isBidirectional ? 0.2 : 0;

                    // 🟢 LABEL LOGIC: TRUNCATE CONTEXT
                    const labelText = rel.context
                        ? (rel.context.length > 30 ? rel.context.substring(0, 30) + '...' : rel.context)
                        : rel.relation;

                    links.push({
                        source: entity.id,
                        target: targetId,
                        // Color is now dynamic via linkColor prop, not static here
                        width: 2,
                        label: labelText,
                        isSemantic: true,
                        distance: linkDist,
                        curvature: curvature
                    });

                    // Track Semantic Override
                    const pairKey = [entity.id, targetId].sort().join('::');
                    semanticPairs.add(pairKey);

                    // Track Neighbors for Focus Mode
                    if (!neighbors.has(entity.id)) neighbors.set(entity.id, new Set());
                    if (!neighbors.has(targetId)) neighbors.set(targetId, new Set());
                    neighbors.get(entity.id)?.add(targetId);
                    neighbors.get(targetId)?.add(entity.id);
                });
            }
        });

        // E. PROCESS CO-OCCURRENCE EDGES (With Override)
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
            // Co-occurrence still uses static/neutral colors for now unless we want to inherit?
            // User requested "Restaurar riqueza visual SIN romper las líneas" specifically for Order 1 (Inheritance).
            // Co-occurrence links don't have a clear "Source" (they are bidirectional by nature).
            // So we keep them neutral/grey.
            let linkColor = '#374151';

            if (weight >= 5) { width = 1; linkColor = '#4b5563'; }
            if (weight >= 10) { width = 2; linkColor = '#6b7280'; }

            links.push({
                source,
                target,
                width,
                color: linkColor, // Fallback color if we don't apply inheritance here
                opacity: 0.2,
                isSemantic: false,
                distance: 150, // Standard loose distance for co-occurrence
                curvature: 0,
                label: '' // No label for co-occurrence
            });

            // Track Neighbors
            if (!neighbors.has(source)) neighbors.set(source, new Set());
            if (!neighbors.has(target)) neighbors.set(target, new Set());
            neighbors.get(source)?.add(target);
            neighbors.get(target)?.add(source);
        });

        return { nodes, links, neighbors };
    }, [entities, localNodes, propNodes]);

    // --- 3. INTERACTION HANDLERS ---

    // 🟢 MEDUSA: Force Configuration
    useEffect(() => {
        if (graphRef.current) {
            // 🟢 PHYSICS CALIBRATION: NUCLEAR REPULSION
            graphRef.current.d3Force('charge').strength(-1500);

            // 🟢 PHYSICS CALIBRATION: DYNAMIC LINKS
            graphRef.current.d3Force('link').distance((link: any) => link.distance || 100);
        }
    }, [graphData]);

    // 🟢 THE DROP: AUTO-FREEZE PROTOCOL
    const processedFreezes = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!onAutoFreeze) return;

        graphData.nodes.forEach(node => {
            if (
                node.type === 'idea' &&
                node.isLocal &&
                (node.fx === undefined || node.fx === null) &&
                !processedFreezes.current.has(node.id)
            ) {
                processedFreezes.current.add(node.id);
                setTimeout(() => {
                    if (graphRef.current) {
                        const internalData = graphRef.current?.graphData?.();
                        if (!internalData) return;

                        const liveNode = internalData.nodes.find((n: any) => n.id === node.id);

                        if (liveNode && liveNode.x !== undefined && liveNode.y !== undefined) {
                            if (onAutoFreeze && typeof onAutoFreeze === 'function') {
                                onAutoFreeze(node.id, liveNode.x, liveNode.y);
                            }
                        }
                    }
                }, 4000);
            }
        });
    }, [graphData.nodes, onAutoFreeze]);

    const handleEngineStop = () => {
        hasRenderedRef.current = true;
        const nodes = graphData.nodes;
        if (!nodes) return;

        nodes.forEach((node: any) => {
            if (node.x && node.y) {
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
                setSelectedNode(node.entityData);
                graphRef.current?.centerAt(node.x, node.y, 1000);
                graphRef.current?.zoom(4, 2000);
            }
        } else {
            // SINGLE CLICK INITIATED
            clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                // 🟢 FOCUS MODE TOGGLE
                // If clicking same node, keep it focused. If different, switch.
                // Wait... requirement says: 1 Click = Focus Mode.
                setFocusedNodeId(node.id);

                if (onNodeClick) {
                    onNodeClick(node.id, node.isLocal);
                }
            }, 300);
        }
    };

    const handleBackgroundClick = () => {
        setSelectedNode(null);
        setFocusedNodeId(null); // 🟢 RESET FOCUS
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if ((e.button === 2 || e.shiftKey) && hoveredNode && onLinkCreate) {
            e.preventDefault();
            e.stopPropagation();
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

    if (!projectId) return null;

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
                        <span className="flex items-center gap-1"><div className="w-2 h-2 border border-emerald-500 bg-emerald-500/20"></div> LOC</span>
                        <span className="flex items-center gap-1"><div className="w-0 h-0 border-l-[4px] border-l-transparent border-b-[6px] border-b-amber-500 border-r-[4px] border-r-transparent"></div> OBJ</span>
                        <span className="flex items-center gap-1"><div className="w-2 h-2 border border-red-500 bg-red-500/20"></div> EVT</span>
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
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature="curvature"
                    // linkLabel="label" // 🔴 DISABLED NATIVE LABEL in favor of Custom Hybrid Rendering

                    // 🟢 PARTICLES (FLOW)
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkDirectionalParticleSpeed={0.005}

                    // 🟢 LINK COLOR (FOCUS MODE AWARE + INHERITANCE)
                    linkColor={(link: any) => {
                        // 1. FOCUS MODE CHECK
                        if (focusedNodeId) {
                            const sourceId = link.source.id || link.source;
                            const targetId = link.target.id || link.target;
                            const isConnected = sourceId === focusedNodeId || targetId === focusedNodeId;

                            if (isConnected) {
                                // Active: Inherit Source Color
                                return (link.source && typeof link.source === 'object' && link.source.color)
                                    ? link.source.color
                                    : '#ffffff';
                            } else {
                                // Ghost: Dark Grey Transparent
                                return 'rgba(26, 26, 26, 0.1)';
                            }
                        }

                        // 2. DEFAULT MODE (INHERITANCE)
                        if (link.isSemantic) {
                            return (link.source && typeof link.source === 'object' && link.source.color)
                                ? link.source.color
                                : '#525252';
                        }

                        // Co-occurrence (Grey)
                        return '#525252';
                    }}

                    // 🟢 LINK WIDTH (FOCUS MODE AWARE)
                    linkWidth={(link: any) => {
                         if (focusedNodeId) {
                            const sourceId = link.source.id || link.source;
                            const targetId = link.target.id || link.target;
                            const isConnected = sourceId === focusedNodeId || targetId === focusedNodeId;
                            return isConnected ? 3 : 1;
                        }
                        return 2; // Default Base Width
                    }}

                    // 🟢 HYBRID RENDERING (LABELS)
                    linkCanvasObjectMode={() => 'after'}
                    linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                        // Visibility Check: Hover OR Focus OR Zoom > 1.5
                        const isHovered = hoveredLink === link;
                        const isFocused = focusedNodeId && (link.source.id === focusedNodeId || link.target.id === focusedNodeId);
                        const isZoomed = globalScale > 1.5;

                        if (isHovered || isFocused || isZoomed) {
                            const label = link.label;
                            if (!label) return;

                            // Calculate Midpoint
                            // Safety: Ensure source/target are objects (resolved)
                            if (typeof link.source !== 'object' || typeof link.target !== 'object') return;

                            const start = link.source;
                            const end = link.target;

                            const midX = (start.x + end.x) / 2;
                            const midY = (start.y + end.y) / 2;

                            // Draw Label
                            const fontSize = 10 / globalScale; // Scaled font for readability at any zoom
                            ctx.font = `600 ${fontSize}px Sans-Serif`;
                            const textMetrics = ctx.measureText(label);
                            const textWidth = textMetrics.width;
                            const padding = 4 / globalScale;
                            const bWidth = textWidth + padding * 2;
                            const bHeight = fontSize + padding * 2;

                            // Background (Semi-transparent Black)
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                            ctx.fillRect(midX - bWidth / 2, midY - bHeight / 2, bWidth, bHeight);

                            // Text (Titanium White/Grey)
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#e5e7eb';
                            ctx.fillText(label, midX, midY);
                        }
                    }}

                    // Node Styling
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        // 🟢 FOCUS MODE LOGIC
                        let globalAlpha = 1;
                        if (focusedNodeId) {
                            const isFocused = node.id === focusedNodeId;
                            const isNeighbor = graphData.neighbors.get(focusedNodeId)?.has(node.id);
                            if (isFocused || isNeighbor) {
                                globalAlpha = 1;
                            } else {
                                globalAlpha = 0.15; // Ghosted
                            }
                        }
                        ctx.globalAlpha = globalAlpha;

                        const label = node.name;
                        const fontSize = 12/globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;
                        ctx.lineWidth = 1.5 / globalScale;

                        // 1. CONCEPTS / IDEAS -> SQUARE
                        if (node.type === 'idea' || node.type === 'concept') {
                            const size = 20 / globalScale;
                            ctx.fillStyle = node.type === 'concept' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(20, 20, 20, 0.8)';
                            ctx.strokeStyle = node.color;

                            ctx.beginPath();
                            ctx.rect(node.x - size/2, node.y - size/2, size, size);
                            ctx.fill();

                            if (node.isLocal || node.entityData?.meta?.tier === 'background' || node.isGhost) {
                                ctx.setLineDash([4/globalScale, 2/globalScale]);
                            } else {
                                ctx.setLineDash([]);
                            }
                            ctx.stroke();
                            ctx.setLineDash([]);

                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = '#e2e8f0';
                            ctx.fillText(label, node.x, node.y + size/2 + 8/globalScale);
                        }
                        // 2. LOCATIONS -> HEXAGON
                        else if (node.type === 'location') {
                            const size = 8 / globalScale;
                            ctx.fillStyle = 'rgba(168, 85, 247, 0.1)';
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
                        }
                        // 3. OBJECTS -> DIAMOND
                        else if (node.type === 'object') {
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
                        }
                        // 4. CHARACTERS (DEFAULT) -> CIRCLE
                        else {
                            ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
                            if (node.isCanon) {
                                ctx.strokeStyle = node.color;
                                ctx.lineWidth = 1.5 / globalScale;
                                ctx.setLineDash([]);
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                                ctx.fill();
                                ctx.stroke();
                            } else {
                                ctx.strokeStyle = node.color;
                                ctx.lineWidth = 1 / globalScale;
                                ctx.setLineDash([4/globalScale, 2/globalScale]);
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
                                ctx.stroke();
                                ctx.setLineDash([]);
                            }
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillStyle = node.color;
                            ctx.fillText(label, node.x, node.y + 8);
                        }
                    }}

                    // Interaction Hooks
                    onNodeHover={(node) => setHoveredNode(node)}
                    onLinkHover={(link) => setHoveredLink(link)} // 🟢 LINK HOVER HOOK
                    onNodeClick={handleNodeClick}
                    onNodeDragEnd={(node) => {
                        node.fx = node.x;
                        node.fy = node.y;
                        if (onNodeDragEnd) onNodeDragEnd(node);
                    }}
                    onBackgroundClick={handleBackgroundClick}

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

                    cooldownTicks={hasRenderedRef.current ? 0 : 1000} // 🟢 REALITY ANCHOR: Zero Cooldown if already born
                    d3VelocityDecay={0.9} // Medusa: High Friction
                    d3AlphaDecay={0.2} // Medusa: Rapid Cooling
                    onEngineStop={handleEngineStop} // Medusa: Anchor
                />
            </div>

            {/* DRAWER (DETAILS PANEL) */}
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
                                    selectedNode.type === 'location' ? 'text-emerald-400 border-emerald-900 bg-emerald-950/30' :
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
