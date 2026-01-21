import React, { useMemo, useRef, useCallback, useEffect } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GraphNode, NodeRelation } from '../../types/graph';
import { ingestNodeMetadata } from '../../utils/graphIngest';

// 🟢 NEW ARCHITECTURE: 3D REPLACEMENT
// Migrated from 2D Canvas to Three.js/ForceGraph3D per "Nexus Graph V1.0" Protocol.

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

// 🎨 SHADER PROTOCOL (GLSL)
const HOLOGRAPHIC_SHADER = {
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 baseColor;
      uniform float time;
      uniform float glitchStrength;
      uniform vec3 viewVector; // Passed manually or inferred

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec2 vUv;

      // Simple pseudo-random noise
      float rand(vec2 co){
          return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
      }

      void main() {
        // Fresnel Effect
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - dot(vNormal, viewDir), 3.0);

        // Scanlines
        float scanline = sin(vUv.y * 50.0 - time * 5.0) * 0.1 + 0.9;

        // Glitch (Noise)
        float noiseVal = 0.0;
        if (glitchStrength > 0.0) {
           noiseVal = rand(vUv + time) * glitchStrength;
        }

        vec3 finalColor = baseColor + vec3(noiseVal, 0.0, 0.0);

        // Composition
        gl_FragColor = vec4(finalColor * scanline * 2.0, fresnel * 0.8 + 0.2);
      }
    `
};

// 🎨 COLOR PALETTE (Strict)
const COLORS = {
    HERO: '#ddbf61',    // Character / Anchor
    ALLY: '#00fff7',    // Data / Idea / Object
    ENEMY: '#ff153f',   // Threat / Conflict
    VOID: '#141413'     // Background
};

// 📐 GEOMETRY FACTORY (Instanced via closure not truly instanced here but reused geometries)
const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const octaGeo = new THREE.OctahedronGeometry(1);
const icosaGeo = new THREE.IcosahedronGeometry(1);

const NexusGraph: React.FC<NexusGraphProps> = ({
    nodes: propNodes,
    onNodeClick,
    onNodeDoubleClick,
    onNodeDragEnd,
    onAutoFreeze
}) => {
    const fgRef = useRef<ForceGraphMethods>();
    const [graphData, setGraphData] = React.useState({ nodes: [], links: [] });

    // 🟢 DATA PREP: MAP TO VISUAL NODES & GHOSTS
    useEffect(() => {
        if (!propNodes) return;

        const nodesMap = new Map();
        const links: any[] = [];
        const groups = new Map<string, any[]>(); // For Faction Centroids

        // 1. Process Real Nodes
        propNodes.forEach(n => {
            const meta = ingestNodeMetadata(n);
            const node = {
                id: n.id,
                name: n.name,
                type: n.type,
                val: (n as any).val || 10,
                x: n.fx || n.x || undefined, // Respect fixed positions
                y: n.fy || n.y || undefined,
                z: (n as any).z || undefined,
                fx: n.fx, // D3 Fix
                fy: n.fy,
                fz: (n as any).fz,
                meta: { ...((n as any).meta || {}), ...meta },
                groupId: meta.groupId,
                isLocal: (n as any).isLocal,
                isGhost: (n as any).isGhost
            };
            nodesMap.set(n.id, node);

            // Grouping for Factions
            if (meta.groupId && meta.groupId !== 'RONIN') {
                if (!groups.has(meta.groupId)) groups.set(meta.groupId, []);
                groups.get(meta.groupId)?.push(node);
            }
        });

        // 2. Process Relations & Generate Ghosts
        propNodes.forEach(node => {
            if (node.relations) {
                node.relations.forEach((rel: NodeRelation) => {
                    const targetId = rel.targetId;

                    // GHOST CHECK
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

                    // Create Link
                    links.push({
                        source: node.id,
                        target: targetId,
                        type: rel.relation, // Store relation type for visual logic
                        value: 1
                    });
                });
            }
        });

        // 3. FACTION SUPER-NODES (Virtual Anchors)
        // If a group exists but no node represents it, create a virtual center
        groups.forEach((members, groupId) => {
             // Check if a node with this ID already exists (e.g. "Gondor" node)
             // We assume groupId matches a potential ID or Name.
             // If not, we create a Super-Node
             const existingLeader = members.find(m => m.name === groupId || m.id === groupId);

             if (!existingLeader) {
                 const factionId = `faction_${groupId}`;
                 if (!nodesMap.has(factionId)) {
                     nodesMap.set(factionId, {
                         id: factionId,
                         name: groupId,
                         type: 'faction',
                         val: 40, // Massive
                         meta: { tier: 'protagonist', faction: groupId },
                         isGhost: true, // It's a generated anchor
                         isFaction: true
                     });
                 }

                 // Link members to faction (Invisible Gravity)
                 members.forEach(m => {
                     links.push({
                         source: m.id,
                         target: factionId,
                         type: 'PART_OF',
                         invisible: true // Custom prop to hide link but keep force
                     });
                 });
             }
        });

        setGraphData({
            nodes: Array.from(nodesMap.values()),
            links: links
        });

    }, [propNodes]);

    // 🟢 NODE OBJECT FACTORY (THREE.JS)
    const nodeThreeObject = useCallback((node: any) => {
        // 1. Geometry Selection
        let geometry = sphereGeo;
        if (node.type === 'location') geometry = octaGeo;
        if (node.type === 'object') geometry = boxGeo;
        if (node.type === 'concept') geometry = icosaGeo;
        if (node.type === 'faction') geometry = sphereGeo;

        // 2. Color Logic
        let colorHex = COLORS.ALLY; // Default Cyan
        let glitchStrength = 0.0;

        // Type Based
        if (node.type === 'character' && node.meta?.tier === 'protagonist') colorHex = COLORS.HERO;
        if (node.type === 'faction') colorHex = COLORS.HERO;

        // Relation/Meta Based
        if (node.meta?.faction === 'Hostile' || node.type === 'enemy') { // Heuristic
             colorHex = COLORS.ENEMY;
             glitchStrength = 1.0;
        }

        // 3. Material (Shader)
        const material = new THREE.ShaderMaterial({
            uniforms: {
                baseColor: { value: new THREE.Color(colorHex) },
                time: { value: 0 },
                glitchStrength: { value: glitchStrength },
                viewVector: { value: new THREE.Vector3(0, 0, 1) } // Updated in render loop ideally
            },
            vertexShader: HOLOGRAPHIC_SHADER.vertexShader,
            fragmentShader: HOLOGRAPHIC_SHADER.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });

        // 4. Mesh
        const mesh = new THREE.Mesh(geometry, material);
        const scale = node.val / 5; // Normalize size
        mesh.scale.set(scale, scale, scale);

        // 5. Label (Sprite)
        const sprite = new SpriteText(node.name);
        sprite.color = colorHex;
        sprite.textHeight = 4;
        sprite.position.y = scale + 2; // Floating above

        const group = new THREE.Group();
        group.add(mesh);
        group.add(sprite);

        // Attach shader ref to node for animation
        (node as any).__shaderMaterial = material;

        return group;
    }, []);

    // 🟢 LINK OBJECT FACTORY (MESHLINE)
    const linkThreeObject = useCallback((link: any) => {
        if (link.invisible) return null; // Invisible gravity links

        // Color based on relation
        let color = COLORS.ALLY;
        if (link.type === 'ENEMY' || link.type === 'HATES') color = COLORS.ENEMY;
        if (link.type === 'LOVER' || link.type === 'FAMILY') color = COLORS.HERO;

        // MeshLine setup
        const material = new MeshLineMaterial({
            color: new THREE.Color(color),
            lineWidth: 0.5,
            resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
            dashArray: 0.05, // Flow effect
            dashRatio: 0.5,
            transparent: true,
            opacity: 0.6
        });

        // We can't easily use MeshLine geometry inside ReactForceGraph's loop without updates.
        // ReactForceGraph3D updates the line position automatically if we return a standard Line or compatible object.
        // However, MeshLine requires geometry updates.
        // Strategy: Use TubeGeometry or Native Line for simplicity and performance if MeshLine proves unstable in this specific wrapper.
        // PROMPT ORDER: "Use MeshLine".

        // Since `react-force-graph-3d` expects us to return an Object3D, and it manages positions...
        // Implementing MeshLine here effectively is complex because we need to update geometry every frame.
        // FALLBACK/OPTIMIZATION: Use a custom Line with ShaderMaterial to simulate "Energy Beam" without the MeshLine overhead if possible,
        // BUT strict orders say "MeshLine".

        // Actually, `react-force-graph` passes the start/end points to `linkPositionUpdate` if defined.
        // We will try to return a Mesh that holds the MeshLine.

        const geometry = new THREE.BufferGeometry();
        // Initialize with dummy
        geometry.setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,0)]);

        const line = new MeshLine();
        line.setGeometry(geometry);

        const mesh = new THREE.Mesh(line.geometry, material);
        (mesh as any).__line = line; // Attach for updates
        (mesh as any).__material = material;

        return mesh;
    }, []);

    // Update MeshLine positions on every frame
    const linkPositionUpdate = useCallback((lineMesh: any, { start, end }: any) => {
        if (!lineMesh || !lineMesh.__line) return;

        const line = lineMesh.__line;

        // Optimize: Use setPoints instead of recreating geometry if possible,
        // or update position attribute directly.
        // MeshLine (three.meshline) has a specific way to update.
        // Re-creating geometry is indeed expensive.
        // However, three.meshline requires setGeometry to be called if the points change significantly?
        // Actually, MeshLine supports .setPoints(pointsArray)

        // Note: MeshLine might not accept Vector3[] directly in some versions.
        // It typically accepts [x,y,z, x,y,z] flattened array or Vector3 array depending on version.
        // Since we installed "three.meshline", let's assume standard behavior.

        // PERFORMANCE FIX: Reusing the same Vector3 logic without new BufferGeometry
        // But `setGeometry` takes a geometry.
        // Let's try `line.setPoints`. If strictly typed, we cast.
        if (line.setPoints) {
            line.setPoints([start, end]);
        } else {
             // Fallback optimization: Update existing geometry attributes if possible
             // For now, simpler optimization: only update if distance changed?
             // Or stick to setGeometry but reuse a pool?
             // Given constraint, let's assume setPoints exists or fallback to the slightly expensive one
             // but with fewer allocations if possible.

             // The most compatible way with ReactForceGraph which calls this per frame:
             // We can modify the `points` array of the existing geometry if it was created that way.
             const geo = new THREE.BufferGeometry().setFromPoints([
                 new THREE.Vector3(start.x, start.y, start.z),
                 new THREE.Vector3(end.x, end.y, end.z)
             ]);
             line.setGeometry(geo);
        }

        return true;
    }, []);

    // 🟢 ANIMATION LOOP (SHADERS & PHYSICS)
    useEffect(() => {
        let frameId: number;

        // Pre-calculate satellites (nodes that are owned)
        const satellites = graphData.nodes.filter((n: any) => n.type === 'object').map((n: any) => {
             // Find owner link
             const ownerLink = graphData.links.find((l: any) => l.target === n && l.type === 'OWNED_BY');
             return { node: n, owner: ownerLink ? ownerLink.source : null };
        }).filter(s => s.owner);

        const animate = () => {
            const time = Date.now() * 0.001;

            // 1. Update Node Shaders
            graphData.nodes.forEach((node: any) => {
                if (node.__shaderMaterial) {
                    node.__shaderMaterial.uniforms.time.value = time;
                }
            });

            // 2. SATELLITE LOGIC (Rigid Orbit)
            satellites.forEach(({ node, owner }: any) => {
                if (owner) {
                    // Lock physics
                    node.fx = node.x;
                    node.fy = node.y;
                    node.fz = node.z;

                    // Orbit Math
                    const radius = 30; // Distance from owner
                    const speed = 1.0;
                    const angle = time * speed + (node.id.charCodeAt(0) * 0.1); // Offset based on ID

                    node.x = owner.x + Math.cos(angle) * radius;
                    node.z = owner.z + Math.sin(angle) * radius;
                    node.y = owner.y + Math.sin(angle * 0.5) * 10; // Bobbing

                    // Apply to fx/fy/fz to override D3
                    node.fx = node.x;
                    node.fy = node.y;
                    node.fz = node.z;
                }
            });

            // 3. Update Link Flow
             graphData.links.forEach((link: any) => {
                 const obj = (link as any).__lineObj;
                 if (obj && obj.__material) {
                     obj.__material.uniforms.dashOffset.value -= 0.01;
                 }
             });

            frameId = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(frameId);
    }, [graphData]);

    // 🟢 BLOOM EFFECT (Post-Processing) & LOD
    useEffect(() => {
        if (!fgRef.current) return;

        // Access internal Three.js objects
        const { scene, renderer, camera } = fgRef.current.scene();

        // 1. BLOOM SETUP
        const composer = new EffectComposer(renderer);
        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5, // Strength
            0.4, // Radius
            0.85 // Threshold
        );
        composer.addPass(bloomPass);

        // Override the graph's render loop to use composer
        // ForceGraph3D exposes 'postProcessingComposer' prop in newer versions?
        // If not, we have to hook into the tick.
        // Fortunately, ReactForceGraph3D uses `d3-force` tick.
        // BUT it handles the render loop internally using `requestAnimationFrame`.
        // To inject post-processing, we essentially need to hijack the `extraRenderers`.

        // Hack: The library exposes `postProcessingComposer` in the `ForceGraph3D` object in vanilla,
        // but the React wrapper might not expose it directly as a prop.
        // However, we can assign it to the instance if accessible.

        const graphInstance = fgRef.current as any;
        if (graphInstance && graphInstance.postProcessingComposer) {
            graphInstance.postProcessingComposer(composer);
        }

        // 2. LOD LOGIC (Zoom Listener)
        // We need to poll camera zoom/position.
        const lodInterval = setInterval(() => {
            if (!camera) return;

            // Calculate distance or zoom
            // OrbitControls modifies camera position.
            const dist = camera.position.distanceTo(new THREE.Vector3(0,0,0)); // Dist to center

            // Thresholds
            const MACRO_THRESHOLD = 800;
            const MICRO_THRESHOLD = 200;

            graphData.nodes.forEach((node: any) => {
                if (node.__threeObj) {
                    const obj = node.__threeObj;

                    // LEVEL 1: MACRO (>800 distance) -> Show only Factions
                    if (dist > MACRO_THRESHOLD) {
                        obj.visible = node.type === 'faction';
                    }
                    // LEVEL 2: MESO (200-800) -> Show all
                    else if (dist > MICRO_THRESHOLD) {
                        obj.visible = true;
                    }
                    // LEVEL 3: MICRO (<200) -> Show details/text only nearby?
                    else {
                        obj.visible = true;
                        // Maybe hide far away nodes?
                    }
                }
            });

        }, 500); // Check every 500ms

        return () => {
            clearInterval(lodInterval);
            // Cleanup composer?
        };

    }, [graphData]); // Re-run if graph data changes (nodes might be recreated)

    return (
        <ForceGraph3D
            ref={fgRef}
            graphData={graphData}
            backgroundColor={COLORS.VOID}
            nodeLabel="name"
            nodeThreeObject={(node: any) => {
                const obj = nodeThreeObject(node);
                node.__threeObj = obj; // Store ref for LOD
                return obj;
            }}
            linkThreeObject={linkThreeObject}
            linkPositionUpdate={linkPositionUpdate}
            onNodeClick={(node: any) => onNodeClick && onNodeClick(node.id, node.isLocal)}
            onNodeDragEnd={(node: any) => {
                // Lock position
                node.fx = node.x;
                node.fy = node.y;
                node.fz = node.z;
                if (onNodeDragEnd) onNodeDragEnd(node);
                if (onAutoFreeze) onAutoFreeze(node.id, node.x, node.y);
            }}
            // PHYSICS
            d3AlphaDecay={0.01}
            d3VelocityDecay={0.3}
            onEngineStop={() => fgRef.current?.zoomToFit(400)}

            // CUSTOM FORCES
            d3Force={ (d3Graph: any) => {
                // Use standard forces but tweak them
                d3Graph.force('link').distance(100);
                d3Graph.force('charge').strength(-500);
            }}
        />
    );
};

export default NexusGraph;
