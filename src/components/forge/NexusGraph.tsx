import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { GraphNode } from '../../types/graph';
import GraphCanvas from './Visualizer/GraphCanvas';
import { ingestNodeMetadata } from '../../utils/graphIngest';

// 🟢 NEW ARCHITECTURE: 3D REPLACEMENT
// This component now acts as the wrapper/controller for the 3D Graph.

interface NexusGraphProps {
    projectId: string;
    onClose: () => void;
    accessToken: string | null;
    nodes?: GraphNode[];
    // Deprecated props (kept for interface compatibility but ignored or mapped)
    localNodes?: any[];
    onNodeClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDoubleClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDragEnd?: (node: any) => void;
    onLinkCreate?: (sourceId: string, targetId: string) => void;
    onAutoFreeze?: (nodeId: string, x: number, y: number) => void;
}

const NexusGraph: React.FC<NexusGraphProps> = ({
    nodes: propNodes,
    onNodeClick,
    onClose
}) => {

    // 🟢 DATA TRANSFORMATION & INGESTION (PATCH)
    // Map GraphNodes to Visualizer format
    // We handle "Shadow Index" logic here or inside GraphCanvas
    const { visualNodes, visualLinks } = useMemo(() => {
        if (!propNodes) return { visualNodes: [], visualLinks: [] };

        const nodesMap = new Map();
        const links: any[] = [];
        const existingIds = new Set(propNodes.map(n => n.id));

        // 1. Process Real Nodes
        propNodes.forEach(n => {
            const meta = ingestNodeMetadata(n);
            const node = {
                id: n.id,
                name: n.name,
                type: n.type,
                val: (n as any).val || 10,
                x: n.fx || (Math.random() * 200 - 100),
                y: n.fy || (Math.random() * 200 - 100),
                meta: { ...((n as any).meta || {}), ...meta },
                groupId: meta.groupId // 🟢 PHYSICS
            };
            nodesMap.set(n.id, node);
        });

        // 2. Process Relations & Generate Ghosts
        propNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach(rel => {
                    const targetId = rel.targetId;

                    // GHOST CHECK
                    if (!existingIds.has(targetId) && !nodesMap.has(targetId)) {
                        // Create Ghost Node
                        const ghostMeta = ingestNodeMetadata({}, "RONIN"); // Ghost defaults to Ronin or we could try to infer
                        nodesMap.set(targetId, {
                            id: targetId,
                            name: rel.targetName || "Unknown",
                            type: rel.targetType || 'concept',
                            val: 5, // Smaller
                            x: (nodesMap.get(node.id)?.x || 0) + 50, // Spawn nearby
                            y: (nodesMap.get(node.id)?.y || 0) + 50,
                            meta: { ...ghostMeta, tier: 'background' },
                            groupId: ghostMeta.groupId,
                            isGhost: true
                        });
                    }

                    // Create Link
                    links.push({
                        source: node.id,
                        target: targetId,
                        value: 1
                    });
                });
            }
        });

        return {
            visualNodes: Array.from(nodesMap.values()),
            visualLinks: links
        };
    }, [propNodes]);

    // 🟢 INTERACTION HANDLER
    const handleNodeClick = (nodeId: string) => {
        // Retrieve full node data
        const node = propNodes?.find(n => n.id === nodeId);
        // Ghosts might not be in propNodes.
        // We still trigger click. WorldEnginePanel needs to handle "Phantom" clicks or we ignore them?
        // Current WorldEnginePanel logic: "handleNodeClick" just logs.
        // "handleNodeDoubleClick" opens Modal.

        // If node exists in props, it's real. If not, it's a ghost (or we check our visualNodes map).
        const visualNode = visualNodes.find(n => n.id === nodeId);
        const isLocal = (node as any)?.isLocal || false;

        if (onNodeClick) {
            onNodeClick(nodeId, isLocal);
        }
    };

    return (
        <div className="absolute inset-0 z-0 bg-black overflow-hidden">
            {/* CONTROLS OVERLAY */}
            <div className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 z-50 pointer-events-none">
                <div className="pointer-events-auto">
                     <span className="text-xs font-mono text-cyan-500 bg-black/50 px-3 py-1 rounded border border-cyan-900">
                        NEXUS OS v2.0 // 3D KERNEL ACTIVE
                     </span>
                </div>
                <button
                    onClick={onClose}
                    className="pointer-events-auto p-3 bg-titanium-900 hover:bg-titanium-800 text-titanium-400 hover:text-white rounded-full transition-all border border-titanium-700 hover:border-white/20 shadow-lg"
                >
                    <X size={24} />
                </button>
            </div>

            {/* 3D CANVAS */}
            <GraphCanvas
                nodes={visualNodes}
                links={visualLinks}
                onNodeClick={handleNodeClick}
            />
        </div>
    );
};

export default NexusGraph;
