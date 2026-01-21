// 🟢 PHYSICS WORKER (D3-Force in a Box)
// Runs off the main thread to prevent UI freezing.

import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';

// TYPES
interface WorkerNode extends SimulationNodeDatum {
    id: string;
    fx?: number | null;
    fy?: number | null;
    val?: number; // Radius/Mass
    groupId?: string; // Faction
    x?: number;
    y?: number;
}

interface WorkerLink extends SimulationLinkDatum<WorkerNode> {
    source: string | WorkerNode;
    target: string | WorkerNode;
    value?: number; // Strength
}

// STATE
let simulation: any;
let nodes: WorkerNode[] = [];
let links: WorkerLink[] = [];

// CONFIG
const CHARGE_STRENGTH = -800;
const DISTANCE_MAX = 2000;
const LINK_DISTANCE = 100;
const CLUSTER_STRENGTH = 0.5; // Strength of pull towards group center

// COMMUNICATION
self.onmessage = (event) => {
    const { type, payload } = event.data;

    switch (type) {
        case 'INIT':
            initSimulation(payload.nodes, payload.links);
            break;
        case 'UPDATE_DATA':
            updateData(payload.nodes, payload.links);
            break;
        case 'PAUSE':
            if (simulation) simulation.stop();
            break;
        case 'RESUME':
            if (simulation) simulation.restart();
            break;
        case 'DISPOSE':
            if (simulation) simulation.stop();
            simulation = null;
            break;
    }
};

// 🟢 CUSTOM FORCE: CLUSTER (SOLAR SYSTEM)
// Pulls nodes towards the centroid of their groupId.
function forceCluster(nodes: WorkerNode[]) {
    const strength = CLUSTER_STRENGTH;
    let nodesByGroup: Record<string, WorkerNode[]> = {};
    let groupCenters: Record<string, {x: number, y: number}> = {};

    // 1. Group Nodes
    nodes.forEach(n => {
        const gid = n.groupId || "RONIN";
        if (!nodesByGroup[gid]) nodesByGroup[gid] = [];
        nodesByGroup[gid].push(n);
    });

    return (alpha: number) => {
        // 2. Calculate Centers (or use fixed suns if we had them)
        // For now, dynamic centroid.
        Object.entries(nodesByGroup).forEach(([gid, groupMembers]) => {
             let sx = 0, sy = 0;
             groupMembers.forEach(n => {
                 sx += n.x || 0;
                 sy += n.y || 0;
             });
             groupCenters[gid] = { x: sx / groupMembers.length, y: sy / groupMembers.length };
        });

        // 3. Apply Velocity
        nodes.forEach(n => {
            const gid = n.groupId || "RONIN";
            const center = groupCenters[gid];
            if (center) {
                const k = strength * alpha;
                // Move towards center
                // Note: SimulationNodeDatum has vx, vy
                (n as any).vx += (center.x - (n.x || 0)) * k;
                (n as any).vy += (center.y - (n.y || 0)) * k;
            }
        });
    };
}

const initSimulation = (initialNodes: WorkerNode[], initialLinks: WorkerLink[]) => {
    nodes = initialNodes.map(n => ({ ...n })); // Clone
    links = initialLinks.map(l => ({ ...l })); // Clone

    const clusterForce = forceCluster(nodes);

    simulation = forceSimulation(nodes)
        .force('charge', forceManyBody().strength(CHARGE_STRENGTH).distanceMax(DISTANCE_MAX))
        .force('link', forceLink(links).id((d: any) => d.id).distance(LINK_DISTANCE))
        .force('center', forceCenter(0, 0))
        .force('collide', forceCollide().radius((d: any) => (d.val || 10) + 5).iterations(2)) // Prevent overlap
        .force('cluster', clusterForce) // 🟢 APPLY SOLAR PHYSICS
        .stop();

    runLoop();
};

const updateData = (newNodes: WorkerNode[], newLinks: WorkerLink[]) => {
    if (simulation) simulation.stop();
    initSimulation(newNodes, newLinks);
};

const runLoop = () => {
    if (!simulation) return;

    simulation.tick();

    // SEND FULL STATE BACK
    // We send 'nodes' and 'links' so the main thread has resolved references (source/target objects)
    // Optimization: Structure for Transferable if needed, but structuredClone is fast enough for <1000 items.

    // Minimal Link Data: We need updated x,y from source/target
    // D3 modifies the link objects in-place to reference nodes.
    // So 'links' array now contains { source: NodeObject, target: NodeObject }
    // We can just send 'links' back.

    self.postMessage({
        type: 'TICK',
        payload: { nodes, links }
    });

    requestAnimationFrame(runLoop);
};
