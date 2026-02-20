import React, { useEffect, useRef, useState } from 'react';
import * as d3Force from 'd3-force';
import { VisualNode, VisualEdge } from './types';
import EntityCard from './EntityCard';

// optimization: stable callback for memoized children
const NO_OP = () => {};

interface GhostGraphProps {
    nodes: VisualNode[];
    edges: VisualEdge[];
}

const GhostGraph: React.FC<GhostGraphProps> = ({ nodes, edges }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]);
    const [simEdges, setSimEdges] = useState<VisualEdge[]>([]);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // Cache Refs for Performance (Avoid O(N) DOM lookups in tick)
    const nodeEls = useRef<Map<string, HTMLElement | null>>(new Map());
    const edgeEls = useRef<Map<string, SVGLineElement | null>>(new Map());

    // 1. Sync Nodes & Edges & Initialize Positions (Optimized O(N))
    useEffect(() => {
        // Use functional update to access latest simNodes without dependency cycle
        setSimNodes(prevSimNodes => {
            // Create O(1) lookup map for existing positions to avoid O(N^2) complexity
            const existingMap = new Map(prevSimNodes.map(n => [n.id, n]));

            return nodes.map(n => {
                const existing = existingMap.get(n.id);
                return {
                    ...n,
                    x: existing?.x || n.x || dimensions.width / 2 + (Math.random() - 0.5) * 50,
                    y: existing?.y || n.y || dimensions.height / 2 + (Math.random() - 0.5) * 50
                };
            });
        });

        setSimEdges(edges.map(e => ({ ...e })));
    }, [nodes, edges, dimensions.width, dimensions.height]);

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

        // Populate Cache
        simNodes.forEach(n => {
             // We can check if it's already there? No, always refresh ref in case of remount
             // Actually, useEffect runs after commit, so elements exist.
             const el = document.getElementById(`ghost-${n.id}`);
             if (el) nodeEls.current.set(n.id, el);
        });

        simEdges.forEach((e: any) => {
             // For edges, D3 might not have processed source/target into objects yet if we just created simEdges
             // But here we are passing simEdges to forceLink.
             // Wait, forceLink MODIFIES the edge objects in place (replacing string IDs with objects).
             // We need to be careful about the key generation.
             // Before simulation starts, source/target are strings (from our copy).
             const sId = typeof e.source === 'object' ? e.source.id : e.source;
             const tId = typeof e.target === 'object' ? e.target.id : e.target;
             const key = `link-${sId}-${tId}`;
             const el = document.getElementById(key);
             if (el) edgeEls.current.set(key, el as SVGLineElement);
        });

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
                 const el = nodeEls.current.get(node.id);
                 if (el) {
                     el.style.transform = `translate(${node.x - 60}px, ${node.y - 30}px)`;
                 }
             });

             // Edge Updates
             simEdges.forEach((edge: any) => {
                // D3 replaces source/target string IDs with actual node objects
                const source = edge.source as any;
                const target = edge.target as any;

                // We construct key based on IDs
                const key = `link-${source.id}-${target.id}`;
                const el = edgeEls.current.get(key);

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
                        setHoveredNodeId={NO_OP}
                        onClick={NO_OP}
                        variant={node.isAnchor ? 'anchor' : 'performance'}
                    />
                </div>
            ))}
        </div>
    );
};

export default GhostGraph;
