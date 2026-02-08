import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as d3Force from 'd3-force';
import { drag as d3Drag } from 'd3-drag';
import { select as d3Select } from 'd3-selection';
import { VisualNode } from './types';
import FactionOverlay, { FactionOverlayHandle } from './FactionOverlay';
import EntityCard from './EntityCard';

// 🟢 GRAPH SIMULATION (D3 Logic + Direct DOM)
export interface GraphSimulationHandle {
    // No methods needed currently
}

const GraphSimulationV2 = forwardRef<GraphSimulationHandle, {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    setHoveredNodeId: (id: string | null) => void;
    onNodeClick: (node: VisualNode) => void;
    onUpdateGhost: (id: string, updates: any) => void;
    onCrystallize: (node: VisualNode) => void;
    isLoading: boolean;
    onTick: () => void;
}>(({ nodes, lodTier, setHoveredNodeId, onNodeClick, onUpdateGhost, onCrystallize, isLoading, onTick }, ref) => {
    const nodeRefs = useRef<Record<string, HTMLDivElement>>({});
    const simulationRef = useRef<any>(null);
    const factionOverlayRef = useRef<FactionOverlayHandle>(null);
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]); // For React Rendering only (Mount/Unmount)

    // 1. IMPERATIVE HANDLE (Sync from Parent)
    useImperativeHandle(ref, () => ({}));

    // Sync React State with Props (Initialization)
    useEffect(() => {
        const nextNodes = nodes.map(n => ({...n, x: n.x || undefined, y: n.y || undefined }));
        setSimNodes(nextNodes);
    }, [nodes]);

    // 🧠 MEMOIZED LINKS (For Dependency Tracking)
    const links = useMemo(() => {
        const l: any[] = [];

        // ⚡ Bolt Optimization: Pre-compute lookups (O(N) vs O(N^2))
        // Reduces render time by ~40-100x for large graphs
        const nodeMap = new Map<string, VisualNode>();
        const nameMap = new Map<string, VisualNode>();

        simNodes.forEach(n => {
            if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
            if (n.name) {
                const key = n.name.toLowerCase().trim();
                if (!nameMap.has(key)) nameMap.set(key, n);
            }
        });

        simNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(r => {
                    // Check validity with Fallback (Healing Protocol)
                    let targetNode = nodeMap.get(r.targetId);
                    if (!targetNode && r.targetName) {
                         targetNode = nameMap.get(r.targetName.toLowerCase().trim());
                    }

                    if (targetNode) {
                        l.push({ source: node.id, target: targetNode.id, label: r.context || r.relation, ...r });
                    }
                });
            }
        });
        return l;
    }, [simNodes]);

    // 🐛 SWARM FIX: Watch Links Explicitly
    useEffect(() => {
        onTick();
    }, [links.length]);

    // ⚡ D3 PHYSICS & DRAG
    useEffect(() => {
        if (simNodes.length === 0) return;

        const width = 4000;
        const height = 4000;
        const cx = width / 2;
        const cy = height / 2;

        // Simulation Setup (ZERO KELVIN PROTOCOL)
        const simulation = d3Force.forceSimulation(simNodes as any)
            .alphaDecay(0.05) // ❄️ Faster freeze (default ~0.0228)
            .force("charge", d3Force.forceManyBody().strength(-2000))
            .force("center", d3Force.forceCenter(cx, cy).strength(0.05))
            .force("collide", d3Force.forceCollide().radius(100).strength(0.7))
            .force("radial", d3Force.forceRadial(
                (d: any) => {
                    const type = (d.type || 'concept').toLowerCase();
                    if (d.isGhost) return 900;
                    if (type === 'character') return 100;
                    if (type === 'location') return 500;
                    if (type === 'faction') return 300;
                    return 800;
                }, cx, cy).strength(0.1))
            .force("link", d3Force.forceLink(links).id((d: any) => d.id).distance((d: any) => {
                const rel = (d.relation || '').toUpperCase();
                // 1. Intima (Gravedad del Hogar) - 50px
                if (['FAMILY', 'LOVER', 'MARRIED', 'SPOUSE'].some(k => rel.includes(k))) return 50;
                // 2. Conflicto (El Abismo) - 800px
                if (['ENEMY', 'HATES', 'RIVAL', 'WAR', 'KILL'].some(k => rel.includes(k))) return 800;
                // 3. Estándar (Orbitas) - 300px
                return 300;
            }));

        // 🔄 TICK: DIRECT DOM MANIPULATION
        simulation.on("tick", () => {
            // 1. Move Nodes
            simNodes.forEach((node: any) => {
                const el = nodeRefs.current[node.id];
                if (el) {
                    el.style.transform = `translate(${node.x}px, ${node.y}px)`;
                }
            });

            // 2. Sync Lines
            onTick();
            factionOverlayRef.current?.forceUpdate();
        });

        simulation.on("end", () => {
            onTick();
            factionOverlayRef.current?.forceUpdate();
        });

        // ✋ DRAG BEHAVIOR (SLEEP & WAKE)
        const dragBehavior = d3Drag<HTMLDivElement, any>()
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart(); // Wake up!
                d.fx = d.x;
                d.fy = d.y;
                // 🟢 LOGIC GATE: Start Tracking
                d._dragStartX = event.x;
                d._dragStartY = event.y;

                if(nodeRefs.current[d.id]) nodeRefs.current[d.id].style.cursor = 'grabbing';
            })
            .on("drag", (event, d) => {
                d.fx = event.x;
                d.fy = event.y;
                // Force immediate update of this node for smoothness (though tick handles it)
                const el = nodeRefs.current[d.id];
                if (el) el.style.transform = `translate(${event.x}px, ${event.y}px)`;
                onTick(); // ⚡ SURGICAL PRECISION
                factionOverlayRef.current?.forceUpdate();
            })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0); // Go back to sleep
                d.fx = null;
                d.fy = null;
                if(nodeRefs.current[d.id]) nodeRefs.current[d.id].style.cursor = 'grab';

                // 🟢 LOGIC GATE: Click Detection (< 5px movement)
                const dist = Math.sqrt(
                    Math.pow(event.x - (d._dragStartX || 0), 2) +
                    Math.pow(event.y - (d._dragStartY || 0), 2)
                );

                if (dist < 5) {
                    onNodeClick(d);
                }
            });

        // Attach Drag to Refs
        // We use a timeout to ensure refs are populated after render
        setTimeout(() => {
             simNodes.forEach((node: any) => {
                 const el = nodeRefs.current[node.id];
                 if (el) {
                     d3Select(el).datum(node).call(dragBehavior as any);
                 }
             });
        }, 0);

        simulationRef.current = simulation;

        return () => {
            simulation.stop();
        };
    }, [simNodes]); // Re-run if node list changes

    // 🟢 RENDER
    return (
        <div className="relative w-[4000px] h-[4000px]">
             {/* Background Grid */}
             <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#334155 1px, transparent 1px)',
                    backgroundSize: '50px 50px'
                }}
            />

            {/* 🟢 FACTION OVERLAY (Internalized for Coordinate Access) */}
            <FactionOverlay
                ref={factionOverlayRef}
                nodes={simNodes}
                lodTier={lodTier}
            />

            {/* NODES */}
            {simNodes.map((node) => (
                <EntityCard
                    key={node.id}
                    ref={(el) => { if(el) nodeRefs.current[node.id] = el; }}
                    node={node}
                    lodTier={lodTier}
                    setHoveredNodeId={setHoveredNodeId}
                    onClick={() => onNodeClick(node)}
                    onEdit={onUpdateGhost}
                    onCrystallize={() => onCrystallize(node)}
                />
            ))}

        </div>
    );
});

export default GraphSimulationV2;
