import React, { useEffect, useState, useMemo, useRef } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
// @ts-ignore
import SpriteText from 'three-spritetext';
// @ts-ignore
import { MeshLine, MeshLineMaterial } from 'meshline';
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';

import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { X } from 'lucide-react';
import { EntityType, GraphNode } from '../../types/graph';
import { NEXUS_COLORS, createHoloMaterial, GEOMETRY_CACHE } from './NexusShaders';

interface NexusGraphProps {
    projectId: string; // This is the folderId (Root)
    onClose: () => void;
    accessToken: string | null;
    nodes?: GraphNode[]; // 🟢 Unified Nodes
    localNodes?: any[];
    onNodeClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDoubleClick?: (nodeId: string, isLocal: boolean) => void;
    onNodeDragEnd?: (node: any) => void;
    onLinkCreate?: (sourceId: string, targetId: string) => void;
    onAutoFreeze?: (nodeId: string, x: number, y: number) => void;
}

interface GraphData {
    nodes: any[];
    links: any[];
    neighbors: Map<string, Set<string>>;
    factions: Map<string, any>;
}

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

    // 🟢 FOCUS & ZOOM STATE
    const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState<number>(1); // 0.1 to 5+

    const graphRef = useRef<any>(null);
    const clickTimeoutRef = useRef<any>(null);
    const frozenNodesRef = useRef<Record<string, { x: number; y: number }>>({});
    const hasRenderedRef = useRef(false);

    // Interaction State
    const [hoveredNode, setHoveredNode] = useState<any>(null);
    const [hoveredLink, setHoveredLink] = useState<any>(null);
    const [linkDragState, setLinkDragState] = useState<{ active: boolean, source: any, currentPos: { x: number, y: number } | null }>({
        active: false, source: null, currentPos: null
    });

    // --- 1. DATA FETCHING ---
    useEffect(() => {
        if (propNodes) {
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
        const neighbors = new Map<string, Set<string>>();
        const existingNodeIds = new Set<string>();
        const linkDirectionMap = new Map<string, boolean>();
        const factions = new Map<string, any>(); // group -> centroid node

        const sourceNodes: GraphNode[] = propNodes || entities;
        const legacyIdeas = propNodes ? [] : localNodes;

        // 🟢 HELPERS
        const getColorByType = (type: string, isGlitchy: boolean = false): THREE.Color => {
             if (isGlitchy) return NEXUS_COLORS.ENEMY;
             switch (type) {
                case 'character': return NEXUS_COLORS.ALLY;
                case 'location': return NEXUS_COLORS.HERO; // Reusing Hero Gold for Locations/Anchors? No, Locations are anchors. Wait, instructions: Héroes/Anclas = Gold. Locations usually are anchors.
                // Let's stick to user pallette mapping:
                // Hero/Anchor: Gold. Data/Ally: Cyan. Enemy: Red.
                // We map types to these roles.
                // Character -> Cyan (Ally) or Gold (Protagonist) or Red (Enemy)
                // Let's rely on meta tier/faction.
                case 'object': return new THREE.Color('#f59e0b'); // Amber
                case 'event': return NEXUS_COLORS.ENEMY; // Red for events (Conflict?)
                case 'faction': return NEXUS_COLORS.HERO; // Gold
                case 'concept': return NEXUS_COLORS.CONCEPT;
                case 'idea': return NEXUS_COLORS.HERO;
                default: return new THREE.Color('#9ca3af');
            }
        };

        // A. PROCESS NODES
        sourceNodes.forEach(entity => {
            if (existingNodeIds.has(entity.id)) return;
            existingNodeIds.add(entity.id);

            const isIdea = entity.type === 'idea';
            const frozen = frozenNodesRef.current[entity.id];

            // Faction Grouping Logic
            const faction = (entity as any).meta?.faction || 'Neutral';
            if (!factions.has(faction)) {
                 factions.set(faction, { id: `faction_${faction}`, count: 0 });
            }
            factions.get(faction).count++;

            const isEnemy = entity.relations?.some(r => r.relation === 'ENEMY') || false;

            nodes.push({
                id: entity.id,
                name: entity.name,
                type: entity.type,
                colorObj: getColorByType(entity.type, isEnemy),
                val: (entity as any).val || 5,
                entityData: entity,
                fx: entity.fx ?? frozen?.x,
                fy: entity.fy ?? frozen?.y,
                // fz: entity.fz, // 3D support
                isLocal: isIdea,
                group: faction
            });
        });

        // B. PROCESS LEGACY IDEAS
        legacyIdeas.forEach(idea => {
            if (existingNodeIds.has(idea.id)) return;
            existingNodeIds.add(idea.id);
            nodes.push({
                id: idea.id,
                name: idea.title,
                type: 'idea',
                colorObj: NEXUS_COLORS.HERO,
                val: 5,
                entityData: idea,
                fx: idea.fx,
                fy: idea.fy,
                isLocal: true,
                group: 'Idea'
            });
        });

        // C. GHOST FACTION NODES (SUPER NODES)
        factions.forEach((val, key) => {
            if (key === 'Neutral' || key === 'Idea') return; // Skip generic groups
            const factionId = val.id;
            if (!existingNodeIds.has(factionId)) {
                nodes.push({
                    id: factionId,
                    name: key,
                    type: 'faction', // Special type
                    colorObj: NEXUS_COLORS.HERO,
                    val: 20 + val.count, // Massive
                    isGhost: true,
                    entityData: { id: factionId, name: key, type: 'faction' },
                    isSuperNode: true
                });
                existingNodeIds.add(factionId);
            }
        });

        // D. LINKS
        sourceNodes.forEach(entity => {
             if (entity.relations) {
                 entity.relations.forEach(rel => {
                     const targetId = rel.targetId;
                     if (!existingNodeIds.has(targetId)) return; // Skip if target missing (Ghost logic handled elsewhere/simplified)

                     let dist = 100;
                     if (rel.relation === 'ENEMY') dist = 300;
                     if (rel.relation === 'FAMILY') dist = 50;

                     links.push({
                         source: entity.id,
                         target: targetId,
                         label: rel.relation,
                         distance: dist,
                         color: rel.relation === 'ENEMY' ? NEXUS_COLORS.ENEMY : NEXUS_COLORS.ALLY
                     });

                     if (!neighbors.has(entity.id)) neighbors.set(entity.id, new Set());
                     neighbors.get(entity.id)?.add(targetId);
                     neighbors.get(targetId)?.add(entity.id);
                 });
             }
        });

        // E. FACTION LINKS (Virtual Gravity)
        nodes.forEach(node => {
            if (node.isSuperNode) return;
            if (node.group && node.group !== 'Neutral' && node.group !== 'Idea') {
                const factionId = `faction_${node.group}`;
                if (existingNodeIds.has(factionId)) {
                    links.push({
                         source: node.id,
                         target: factionId,
                         distance: 150, // Orbit distance
                         isFactionLink: true,
                         color: new THREE.Color('#333333'),
                         opacity: 0.1
                    });
                }
            }
        });

        return { nodes, links, neighbors, factions };
    }, [entities, localNodes, propNodes]);

    // --- 3. OBJECT FACTORIES ---

    // NODE OBJECT
    const nodeThreeObject = (node: any) => {
        // LOD Logic: If Macro Zoom (<0.4x), hide standard nodes, show only SuperNodes
        // Note: We can't easily switch object based on zoom in this callback without re-graphing.
        // Instead, we handle visibility in useFrame or update via ref.
        // For now, return the full mesh.

        let geometry;
        switch (node.type) {
            case 'character': geometry = GEOMETRY_CACHE.SPHERE; break;
            case 'location': geometry = GEOMETRY_CACHE.OCTAHEDRON; break;
            case 'object': geometry = GEOMETRY_CACHE.BOX; break;
            case 'concept': geometry = GEOMETRY_CACHE.ICOSAHEDRON; break;
            case 'faction': geometry = GEOMETRY_CACHE.SPHERE; break;
            default: geometry = GEOMETRY_CACHE.SPHERE;
        }

        const isEnemy = node.entityData?.relations?.some((r: any) => r.relation === 'ENEMY');
        // If supernode, huge
        const scale = node.isSuperNode ? 4 : (node.val * 0.5);

        const material = createHoloMaterial(node.colorObj || NEXUS_COLORS.ALLY, isEnemy);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.set(scale, scale, scale);

        // Label (SpriteText) - MICRO LEVEL ONLY (>1.5x)
        const label: any = new SpriteText(node.name);
        label.color = node.colorObj ? '#' + node.colorObj.getHexString() : '#ffffff';
        label.textHeight = 2; // Relative size
        label.position.set(0, scale + 2, 0);
        // label.visible = false; // Managed by LOD loop
        mesh.add(label);

        // Metadata for LOD loop
        mesh.userData = { isNode: true, type: node.type, labelObj: label };

        return mesh;
    };

    // LINK OBJECT (MESHLINE)
    const linkThreeObject = (link: any) => {
        // MeshLine requires geometry to be updated every frame for animation if we animate vertices.
        // If just flow texture, we can animate texture offset.
        // Simple Tube for now as MeshLine in React loop needs strict handling.
        // Wait, user demanded MeshLine.
        // We will return a Mesh that holds the MeshLine.

        // Color
        const color = link.color || NEXUS_COLORS.ALLY;

        // Note: react-force-graph handles the position of the object (source-target).
        // But for MeshLine/Tube, we usually need points.
        // The library passes the object a 'link' data, but positioning is usually line-based.
        // Actually, ForceGraph3D uses native Three Line by default.
        // If we provide an object, it places it... wait.
        // The library documentation says: "linkThreeObject: object to render for the link".
        // It DOES NOT automatically stretch it. We must use linkPositionUpdate.

        // Create a MeshLine with 2 points (placeholder)
        const points = [new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)];
        const line = new MeshLine();
        line.setPoints(points);

        const material = new MeshLineMaterial({
            color: color,
            lineWidth: 0.5, // Thickness
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
            dashArray: 0.1, // Flow effect
            dashOffset: 0,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(line, material);
        mesh.userData = { isLink: true, meshLine: line, material: material };
        return mesh;
    };

    const linkPositionUpdate = (obj: any, coords: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } }) => {
        const { start, end } = coords;
        if (obj.userData.meshLine) {
             const points = [
                 new THREE.Vector3(start.x, start.y, start.z),
                 new THREE.Vector3(end.x, end.y, end.z)
             ];
             obj.userData.meshLine.setPoints(points);
             // Animate flow
             obj.userData.material.dashOffset -= 0.005;
        }
    };

    // --- 4. EFFECTS & LOGIC ---
    useEffect(() => {
        if (!graphRef.current) return;

        // 🟢 UNREAL BLOOM
        const composer = graphRef.current.postProcessingComposer();
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, // Strength
            0.4, // Radius
            0.85 // Threshold
        );
        composer.addPass(bloomPass);

        // 🟢 ANIMATION LOOP (SHADER TIME & FLOW)
        const scene = graphRef.current.scene();
        let frameId: number;

        const animate = () => {
            const time = performance.now() * 0.001;

            // 1. Traverse Nodes -> Update Shader Time
            scene.traverse((obj: any) => {
                // Nodes with Custom Shader
                if (obj.userData?.isNode && obj.material && obj.material.uniforms) {
                    obj.material.uniforms.time.value = time;
                }

                // Links with MeshLine -> Update Flow
                if (obj.userData?.isLink) {
                    // MeshLine material dashOffset
                    if (obj.userData.material && obj.userData.material.dashOffset !== undefined) {
                        obj.userData.material.dashOffset -= 0.005; // Flow speed
                    }
                }
            });

            frameId = requestAnimationFrame(animate);
        };

        animate();

        // 🟢 LOD LOOP (ZOOM LISTENER via CONTROLS)
        const controls = graphRef.current.controls();
        if (controls) {
            controls.addEventListener('change', () => {
                // Approximate zoom from camera distance to target
                // ForceGraph3D controls target is usually 0,0,0 or center of graph.
                const camera = graphRef.current.camera();
                const dist = camera.position.distanceTo(controls.target);

                // Mapping Distance to Zoom Level (Reverse logic: High dist = Low Zoom)
                // Let's normalize: Dist 1000 ~ Zoom 0.1. Dist 50 ~ Zoom 2.0.
                let currentZoom = 1;
                if (dist > 800) currentZoom = 0.3; // MACRO
                else if (dist < 200) currentZoom = 2.0; // MICRO
                else currentZoom = 1.0; // MESO

                setZoomLevel(currentZoom);

                // Apply Visibility
                const scene = graphRef.current.scene();
                scene.traverse((obj: any) => {
                    if (obj.userData?.isNode) {
                        const isSuper = obj.userData.type === 'faction';

                        if (currentZoom < 0.4) {
                            // MACRO: Hide normal nodes, show Super
                            obj.visible = isSuper;
                        } else {
                            // MESO/MICRO: Show all
                            obj.visible = true;
                            // Label visibility
                            if (obj.userData.labelObj) {
                                obj.userData.labelObj.visible = currentZoom > 1.5 || (focusedNodeId === obj.userData.id);
                            }
                        }
                    }
                });
            });
        }

        return () => {
            cancelAnimationFrame(frameId);
        };
    }, [graphRef.current]);

    // --- RENDER ---
    return (
        <div className="absolute inset-0 z-0 bg-black">
             {/* 3D GRAPH */}
             <ForceGraph3D
                ref={graphRef}
                graphData={graphData}

                nodeThreeObject={nodeThreeObject}

                linkThreeObject={linkThreeObject}
                linkPositionUpdate={linkPositionUpdate}

                showNavInfo={false}
                backgroundColor={NEXUS_COLORS.VOID.getStyle()} // Black Matte

                onNodeClick={(node: any) => {
                    setFocusedNodeId(node.id);
                    if (onNodeClick) onNodeClick(node.id, node.isLocal);
                    // Fly to
                    graphRef.current?.cameraPosition(
                        { x: node.x, y: node.y, z: node.z + 100 }, // Pos
                        node, // Target
                        2000  // ms
                    );
                }}
                onBackgroundClick={() => setFocusedNodeId(null)}

                // Physics
                // d3Force is not a prop in react-force-graph-3d, handled via ref in useEffect
             />

             {/* HUD OVERLAY (2D HTML ON TOP) */}
             <div className="absolute top-4 left-4 pointer-events-none">
                 <div className="text-xs font-mono text-cyan-500 bg-black/50 p-2 border border-cyan-900/30 backdrop-blur-md">
                    ZOOM LEVEL: {zoomLevel.toFixed(2)} | NODES: {graphData.nodes.length}
                 </div>
             </div>

             {/* CLOSE BUTTON */}
             <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-red-900/20 hover:bg-red-900/50 text-red-500 rounded-full border border-red-900 transition-all z-50"
            >
                <X size={20} />
            </button>
        </div>
    );
};

export default NexusGraph;
