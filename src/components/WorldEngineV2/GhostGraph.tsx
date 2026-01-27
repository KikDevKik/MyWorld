import React, { useEffect, useRef, useState } from 'react';
import * as d3Force from 'd3-force';
import { VisualNode, VisualEdge } from './types';
import EntityCard from './EntityCard';

interface GhostGraphProps {
    nodes: VisualNode[];
    edges: VisualEdge[];
}

const GhostGraph: React.FC<GhostGraphProps> = ({ nodes, edges }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]);
    const [simEdges, setSimEdges] = useState<VisualEdge[]>([]);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // 1. Sync Nodes & Edges & Initialize Positions
    useEffect(() => {
        // Simple merge strategy: If node exists in current simNodes, keep its x/y
        // Otherwise initialize near center.
        const mergedNodes = nodes.map(n => {
            const existing = simNodes.find(sn => sn.id === n.id);
            return {
                ...n,
                x: existing?.x || n.x || dimensions.width / 2 + (Math.random() - 0.5) * 50,
                y: existing?.y || n.y || dimensions.height / 2 + (Math.random() - 0.5) * 50
            };
        });

        const mergedEdges = edges.map(e => ({ ...e }));

        setSimNodes(mergedNodes);
        setSimEdges(mergedEdges);
    }, [nodes, edges, dimensions.width, dimensions.height]); // Depend on width/height specifically to avoid loop if object ref changes

    // 2. Measure Container
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // 3. D3 Simulation
    useEffect(() => {
        if (simNodes.length === 0 || dimensions.width === 0) return;

        const simulation = d3Force.forceSimulation(simNodes as any)
            .alphaDecay(0.05)
            .force("charge", d3Force.forceManyBody().strength(-300))
            .force("center", d3Force.forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.1))
            .force("collide", d3Force.forceCollide().radius(60).strength(0.8))
            .force("link", d3Force.forceLink(simEdges as any)
                .id((d: any) => d.id)
                .distance(200)
                .strength(0.5)
            );

        simulation.on("tick", () => {
             // Node Updates
             simNodes.forEach((node: any) => {
                 const el = document.getElementById(`ghost-${node.id}`);
                 if (el) {
                     el.style.transform = `translate(${node.x - 60}px, ${node.y - 30}px)`;
                 }
             });

             // Edge Updates
             simEdges.forEach((edge: any) => {
                // D3 replaces source/target string IDs with actual node objects
                const source = edge.source as any;
                const target = edge.target as any;

                const el = document.getElementById(`link-${source.id}-${target.id}`);
                if (el) {
                    el.setAttribute("x1", source.x);
                    el.setAttribute("y1", source.y);
                    el.setAttribute("x2", target.x);
                    el.setAttribute("y2", target.y);
                }
             });
        });

        return () => { simulation.stop(); };
    }, [simNodes, simEdges, dimensions]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden bg-black/20 rounded-xl flex items-center justify-center"
        >
            {/* Grid Background */}
            <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
                style={{
                    opacity: nodes.length === 0 ? 0.05 : 0.1,
                    backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)',
                    backgroundSize: '30px 30px'
                }}
            />

            {/* Zero State UI */}
            {nodes.length === 0 && (
                <div className="z-10 flex flex-col items-center justify-center pointer-events-none select-none">
                    <div className="font-mono text-cyan-500/50 text-xs tracking-[0.3em] animate-pulse">
                        AWAITING NEURAL INPUT...
                    </div>
                    {/* Optional Scanline or decorative element */}
                    <div className="mt-2 w-16 h-[1px] bg-cyan-500/20" />
                </div>
            )}

            {/* SVG Layer for Edges (Below nodes) */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                {simEdges.map((edge: any) => {
                    // Safety check if D3 hasn't processed it yet or if source/target are strings
                    const sId = typeof edge.source === 'object' ? edge.source.id : edge.source;
                    const tId = typeof edge.target === 'object' ? edge.target.id : edge.target;
                    return (
                        <line
                            key={`link-${sId}-${tId}`}
                            id={`link-${sId}-${tId}`}
                            stroke="rgba(6,182,212,0.3)" // Cyan-500/30
                            strokeWidth="1.5"
                        />
                    );
                })}
            </svg>

            {/* Nodes */}
            {simNodes.map(node => (
                <div
                    key={node.id}
                    id={`ghost-${node.id}`}
                    className="absolute top-0 left-0 will-change-transform z-10"
                >
                    <EntityCard
                        node={node}
                        lodTier="MICRO"
                        setHoveredNodeId={() => {}}
                        onClick={() => {}}
                        variant={node.isAnchor ? 'anchor' : 'performance'}
                    />
                </div>
            ))}
        </div>
    );
};

export default GhostGraph;
