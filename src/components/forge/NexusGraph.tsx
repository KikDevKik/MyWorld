import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { GraphNode, NodeRelation } from '../../types/graph';
import { ingestNodeMetadata } from '../../utils/graphIngest';
import { Loader2 } from 'lucide-react';

interface NexusGraphProps {
    projectId: string;
    onClose: () => void;
    accessToken: string | null;
    nodes?: GraphNode[];
    onNodeClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDoubleClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDragEnd?: (node: any) => void;
    onLinkCreate?: (sourceId: string, targetId: string) => void;
    onAutoFreeze?: (nodeId: string, x: number, y: number) => void;
}

// 🎨 PALETA DE COLORES (Estricta - Fuente 133)
const COLORS = {
    HERO: '#ddbf61',    // Protagonistas (Oro)
    FAMILY: '#ddbf61',  // Familia (Oro Titán)
    ALLY: '#00fff7',    // Aliados/Objetos (Cian Eléctrico)
    ENEMY: '#ff153f',   // Amenazas (Rojo Neón)
    LOCATION: '#7c8090', // Ubicaciones (Gris Acero)
    OBJECT: '#a855f7',  // Objetos (Violeta)
    CONCEPT: '#ffffff', // Conceptos (Blanco Translúcido)
    VOID: '#141413',    // Fondo
    NEUTRAL: '#555555'  // Default
};

const NexusGraph: React.FC<NexusGraphProps> = ({
    nodes: propNodes,
    onNodeClick,
    onNodeDoubleClick,
    onNodeDragEnd,
    onAutoFreeze
}) => {
    const fgRef = useRef<ForceGraphMethods>();
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
    const [isEngineStopped, setIsEngineStopped] = useState(false);

    // 🟢 DATA PREP: Unifica Nodos, Fantasmas y Facciones
    useEffect(() => {
        if (!propNodes) return;

        const nodesMap = new Map<string, any>();
        const links: any[] = [];
        const groups = new Map<string, any[]>();

        // 1. Process Real Nodes
        propNodes.forEach(n => {
            const meta = ingestNodeMetadata(n);
            const node = {
                ...n,
                val: (n as any).val || 10,
                x: (n as any).fx || (n as any).x || undefined,
                y: (n as any).fy || (n as any).y || undefined,
                fx: (n as any).fx,
                fy: (n as any).fy,
                meta: { ...((n as any).meta || {}), ...meta },
                groupId: meta.groupId,
                isLocal: (n as any).isLocal,
                isGhost: (n as any).isGhost
            };
            nodesMap.set(n.id, node);

            // Grouping
            if (meta.groupId && meta.groupId !== 'RONIN') {
                if (!groups.has(meta.groupId)) groups.set(meta.groupId, []);
                groups.get(meta.groupId)?.push(node);
            }
        });

        // 2. Process Relations (Generates Links & Ghosts if missing)
        propNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach((rel: NodeRelation) => {
                    const targetId = rel.targetId;

                    // Ghost Check (Double safety, though WorldEngine usually handles it)
                    if (!nodesMap.has(targetId)) {
                        const ghostType = rel.targetType || 'concept';
                        nodesMap.set(targetId, {
                            id: targetId,
                            name: rel.targetName || "Unknown",
                            type: ghostType,
                            val: 5,
                            meta: { tier: 'background', faction: 'RONIN' },
                            isGhost: true
                        });
                    }

                    links.push({
                        source: node.id,
                        target: targetId,
                        type: rel.relation,
                        value: 1
                    });
                });
            }
        });

        // 3. Faction Super-Nodes
        groups.forEach((members, groupId) => {
             const existingLeader = members.find(m => m.name === groupId || m.id === groupId);
             if (!existingLeader) {
                 const factionId = `faction_${groupId}`;
                 if (!nodesMap.has(factionId)) {
                     nodesMap.set(factionId, {
                         id: factionId,
                         name: groupId,
                         type: 'faction',
                         val: 40,
                         meta: { tier: 'protagonist', faction: groupId },
                         isGhost: true,
                         isFaction: true
                     });
                 }
                 // Gravity Links
                 members.forEach(m => {
                     links.push({
                         source: m.id,
                         target: factionId,
                         type: 'PART_OF',
                         isGravity: true
                     });
                 });
             }
        });

        setGraphData({
            nodes: Array.from(nodesMap.values()),
            links: links
        });

    }, [propNodes]);

    // 🟢 RENDERIZADO "NEÓN GHOST" (Canvas API)
    const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const isSelected = node.id === selectedNodeId;
        const isHover = node.id === hoverNodeId;
        const isHero = node.meta?.tier === 'protagonist';
        const hasWarning = node.coherency_report; // Drift Detection

        // 1. DETERMINE COLOR & SHAPE
        let color = COLORS.ALLY;
        let shape = 'circle';

        if (hasWarning) {
            color = COLORS.ENEMY; // Red Alert
        } else if (node.type === 'character') {
            color = isHero ? COLORS.HERO : '#888888';
            shape = 'circle';
        } else if (node.type === 'location') {
            color = COLORS.LOCATION;
            shape = 'triangle';
        } else if (node.type === 'object') {
            color = COLORS.ALLY;
            shape = 'square';
        } else if (node.type === 'faction') {
            color = COLORS.HERO;
            shape = 'circle';
        } else if (node.type === 'enemy' || node.relation === 'ENEMY') {
            color = COLORS.ENEMY;
            shape = 'circle'; // Irregular handled via stroke
        } else if (node.type === 'concept' || node.type === 'idea') {
            color = COLORS.CONCEPT;
            shape = 'diamond';
        }

        // Pulse Animation for Heroes/Selected
        const pulse = (isHero || isSelected) ? (Math.sin(Date.now() / 500) * 2) : 0;
        const baseSize = node.val ? node.val / 2 : 4;
        const size = baseSize + pulse;

        // 2. GLOW (The Neon Trick)
        ctx.shadowBlur = (isSelected || isHover) ? 30 : 15;
        if (node.type === 'faction') ctx.shadowBlur = 40;
        ctx.shadowColor = color;

        // 3. DRAW SHAPE (Ghost Mode)
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = (isSelected || isHover) ? 2 : 1.5;

        // Ghost Transparency
        ctx.globalAlpha = 0.2; // Fill Opacity
        ctx.beginPath();

        if (shape === 'circle') {
            ctx.arc(node.x, node.y, size, 0, 2 * Math.PI, false);
        } else if (shape === 'square') {
            ctx.rect(node.x - size, node.y - size, size * 2, size * 2);
        } else if (shape === 'triangle') {
            ctx.moveTo(node.x, node.y - size);
            ctx.lineTo(node.x + size, node.y + size);
            ctx.lineTo(node.x - size, node.y + size);
            ctx.closePath();
        } else if (shape === 'diamond') {
            ctx.moveTo(node.x, node.y - size);
            ctx.lineTo(node.x + size, node.y);
            ctx.lineTo(node.x, node.y + size);
            ctx.lineTo(node.x - size, node.y);
            ctx.closePath();
        }

        ctx.fill(); // Fill with low opacity

        ctx.globalAlpha = 1.0; // Stroke Opacity
        ctx.stroke(); // Solid Border

        // 4. RADIAL HUD (Selection)
        if (isSelected) {
            ctx.shadowBlur = 0; // Reset blur for HUD lines
            ctx.save();
            ctx.translate(node.x, node.y);

            // Rotating Ring
            ctx.rotate(Date.now() / 1000);
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = COLORS.ALLY;
            ctx.arc(0, 0, size * 2, 0, 2 * Math.PI);
            ctx.stroke();

            // Satellites
            for(let i=0; i<3; i++) {
                const angle = (Math.PI * 2 / 3) * i;
                const sx = Math.cos(angle) * (size * 2);
                const sy = Math.sin(angle) * (size * 2);
                ctx.beginPath();
                ctx.fillStyle = COLORS.HERO;
                ctx.arc(sx, sy, 2, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.restore();
            ctx.setLineDash([]); // Reset
        }

        // 5. LOD & LABELS
        const showLabel = (globalScale > 2.5) || isHover || isSelected || (node.type === 'faction') || (node.meta?.tier === 'protagonist');

        if (showLabel) {
            const fontSize = globalScale < 1.5 ? 4 : 12 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hasWarning ? '#ff0000' : 'white';
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'black';

            let label = node.name;
            if (hasWarning) label += " ⚠️";

            ctx.fillText(label, node.x, node.y + size + 4);
        }

        // Reset Context
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

    }, [selectedNodeId, hoverNodeId]);

    // 🟢 CLICK HANDLER
    const handleNodeClick = useCallback((node: any) => {
        // 1. Camera
        fgRef.current?.centerAt(node.x, node.y, 1000);
        fgRef.current?.zoom(4, 2000);

        // 2. System
        setSelectedNodeId(node.id);
        if (onNodeClick) onNodeClick(node.id, node.isLocal);
    }, [onNodeClick]);

    // 🟢 PHYSICS ENGINE (D3 Standard)
    useEffect(() => {
        if (!fgRef.current) return;

        // Custom Forces
        fgRef.current.d3Force('charge')?.strength(-600); // Expansive
        fgRef.current.d3Force('link')?.distance((link: any) => {
             // Semantic Distance
             if (link.type === 'FAMILY' || link.type === 'LOVER') return 20;
             if (link.type === 'ENEMY' || link.type === 'HATES') return 150; // Tension
             return 50;
        });

    }, [graphData]); // Re-run when data changes

    return (
        <div className="relative w-full h-full bg-[#141413]">
             {/* PANTALLA DE CARGA (Overlay) */}
             {(!graphData.nodes.length || !isEngineStopped) && (
                 <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141413]/90 backdrop-blur-sm pointer-events-none transition-opacity duration-1000"
                      style={{ opacity: isEngineStopped ? 0 : 1 }}>
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin h-8 w-8 text-[#00fff7]" />
                        <span className="text-xs font-mono tracking-widest animate-pulse text-[#ddbf61]">
                            TACTICAL GRAPH V2 // CALIBRATING...
                        </span>
                    </div>
                 </div>
            )}

            <ForceGraph2D
                ref={fgRef}
                graphData={graphData}
                backgroundColor="rgba(0,0,0,0)" // Transparent for Void Container
                nodeCanvasObject={nodeCanvasObject}

                // 🟢 VISUAL RESTORATION: DYNAMIC LINK COLORS
                linkColor={(link: any) => {
                    const type = link.type?.toUpperCase() || 'NEUTRAL';
                    // @ts-ignore - Dynamic key access
                    return COLORS[type] || COLORS.NEUTRAL;
                }}
                linkWidth={2}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}

                onNodeClick={handleNodeClick}
                onNodeHover={(node: any) => setHoverNodeId(node ? node.id : null)}
                onNodeDragEnd={(node: any) => {
                    node.fx = node.x;
                    node.fy = node.y;
                    if (onNodeDragEnd) onNodeDragEnd(node);
                    if (onAutoFreeze) onAutoFreeze(node.id, node.x, node.y);
                }}

                // PHYSICS CONFIG
                cooldownTicks={100}
                onEngineStop={() => setIsEngineStopped(true)}

                // RENDERING OPTIMIZATIONS
                enableNodeDrag={true}
                enableZoomInteraction={true}
                minZoom={0.5}
                maxZoom={10}
            />
        </div>
    );
};

export default NexusGraph;
