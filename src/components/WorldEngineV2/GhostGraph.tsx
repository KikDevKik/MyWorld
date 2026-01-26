import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3Force from 'd3-force';
import { VisualNode } from './types';
import EntityCard from './EntityCard';

interface GhostGraphProps {
    nodes: VisualNode[];
}

const GhostGraph: React.FC<GhostGraphProps> = ({ nodes }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [simNodes, setSimNodes] = useState<VisualNode[]>([]);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    // 1. Sync Nodes & Initialize Positions
    useEffect(() => {
        // Clone nodes to avoid mutating props, and initialize near center if no coords
        const initializedNodes = nodes.map(n => ({
            ...n,
            x: n.x || dimensions.width / 2 + (Math.random() - 0.5) * 50,
            y: n.y || dimensions.height / 2 + (Math.random() - 0.5) * 50
        }));
        setSimNodes(initializedNodes);
    }, [nodes, dimensions]);

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
            .force("collide", d3Force.forceCollide().radius(60).strength(0.8));
            // Link force omitted for skeleton phase as requested

        simulation.on("tick", () => {
             simNodes.forEach((node: any) => {
                 const el = document.getElementById(`ghost-${node.id}`);
                 if (el) {
                     // Center the node (assuming ~120px width / 60px height)
                     // EntityCard is absolute, top-left based.
                     // Simulation gives center coordinates.
                     el.style.transform = `translate(${node.x - 60}px, ${node.y - 30}px)`;
                 }
             });
        });

        return () => { simulation.stop(); };
    }, [simNodes, dimensions]);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-hidden bg-black/20 rounded-xl"
        >
            {/* Grid Background */}
            <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                    backgroundImage: 'radial-gradient(#38bdf8 1px, transparent 1px)',
                    backgroundSize: '30px 30px'
                }}
            />

            {/* Nodes */}
            {simNodes.map(node => (
                <div
                    key={node.id}
                    id={`ghost-${node.id}`}
                    className="absolute top-0 left-0 will-change-transform"
                >
                    <EntityCard
                        node={node}
                        lodTier="MICRO"
                        setHoveredNodeId={() => {}}
                        onClick={() => {}}
                        variant="hologram"
                    />
                </div>
            ))}
        </div>
    );
};

export default GhostGraph;
