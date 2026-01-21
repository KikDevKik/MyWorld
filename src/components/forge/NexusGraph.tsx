import React, { useMemo, useRef, useCallback, useEffect, useState } from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import SpriteText from 'three-spritetext';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GraphNode, NodeRelation } from '../../types/graph';
import { ingestNodeMetadata } from '../../utils/graphIngest';
import { Loader2 } from 'lucide-react';

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
    HERO: '#ddbf61',    // Character / Anchor (Oro Metálico)
    ALLY: '#00fff7',    // Data / Idea / Object (Cian Eléctrico)
    ENEMY: '#ff153f',   // Threat / Conflict (Rojo Neón)
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
    const [isReady, setIsReady] = useState(false);
    const [isEngineStopped, setIsEngineStopped] = useState(false);

    // 🟢 LOAD VERIFICATION
    useEffect(() => {
        // Force a small delay or check for window to ensure we are client-side and ready
        if (typeof window !== 'undefined') {
            setIsReady(true);
        }
    }, []);

    // 🟢 DATA PREP: MAP TO VISUAL NODES & GHOSTS
    useEffect(() => {
        if (!propNodes) return;

        // TS Fix: Supply iterable or ignore if strictly typed
        const nodesMap = new Map<string, any>([]);
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
                x: (n as any).fx || (n as any).x || undefined, // Respect fixed positions
                y: (n as any).fy || (n as any).y || undefined,
                z: (n as any).z || undefined,
                fx: (n as any).fx, // D3 Fix
                fy: (n as any).fy,
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
        let geometry: THREE.BufferGeometry = sphereGeo;
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
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        // 🛡️ ESCUDO DE INICIALIZACIÓN (Fix NaN Definitivo)
        // If data is missing (initial tick), use Zero Vector to prevent MeshLine from calculating NaN sphere.
        const sourcePos = (link.source && typeof link.source.x === 'number') ? link.source : new THREE.Vector3(0, 0, 0);
        const targetPos = (link.target && typeof link.target.x === 'number') ? link.target : new THREE.Vector3(0, 0, 0);

        const geometry = new THREE.BufferGeometry().setFromPoints([sourcePos, targetPos]);

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

        // 🛡️ GUARDIA DE EXISTENCIA ESTRICTO (Ghost Coordinate Patch)
        // Ensure strictly valid numbers before passing to MeshLine
        const isValid = (
            typeof start.x === 'number' && !isNaN(start.x) &&
            typeof start.y === 'number' && !isNaN(start.y) &&
            typeof start.z === 'number' && !isNaN(start.z) &&
            typeof end.x === 'number' && !isNaN(end.x) &&
            typeof end.y === 'number' && !isNaN(end.y) &&
            typeof end.z === 'number' && !isNaN(end.z)
        );

        if (!isValid) {
            lineMesh.visible = false;
            // Fallback to prevent internal crashes if it tries to render anyway
            return true;
        }

        lineMesh.visible = true;
        const line = lineMesh.__line;

        // Update Geometry
        // MeshLine requires us to update the points.
        if (line.setPoints) {
            line.setPoints([start, end]);
        } else {
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

        const animate = () => {
            const time = Date.now() * 0.001;

            // 1. Update Node Shaders
            graphData.nodes.forEach((node: any) => {
                if (node.__shaderMaterial) {
                    node.__shaderMaterial.uniforms.time.value = time;
                }
            });

            // 2. SATELLITE LOGIC REMOVED (Stasis Protocol)
            // Nodes must remain static after layout.

            // 3. Update Link Flow
             graphData.links.forEach((link: any) => {
                 // Try to access the line object if attached by library or manually
                 // Note: react-force-graph doesn't auto-attach to link data usually.
                 // This part might be legacy or depend on specific library behavior.
                 // We leave it as "best effort" for visual flow.
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
        const scene = fgRef.current.scene();
        const camera = fgRef.current.camera();
        const renderer = fgRef.current.renderer();

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

        const graphInstance = fgRef.current as any;
        if (graphInstance && graphInstance.postProcessingComposer) {
            graphInstance.postProcessingComposer(composer);
        }

        // 2. LOD LOGIC (Zoom Listener)
        const lodInterval = setInterval(() => {
            if (!camera) return;
            const dist = camera.position.distanceTo(new THREE.Vector3(0,0,0));
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
                    // LEVEL 3: MICRO (<200) -> Show details/text only nearby
                    else {
                        obj.visible = true;
                    }
                }
            });

        }, 500);

        return () => {
            clearInterval(lodInterval);
        };

    }, [graphData]);

    // 🟢 RENDER
    return (
        <div className="relative w-full h-full bg-[#141413]">
            {/* PANTALLA DE CARGA (Overlay) */}
            {(!isReady || !isEngineStopped) && (
                 <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#141413]/90 backdrop-blur-sm transition-opacity duration-1000">
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin h-12 w-12 text-[#00fff7]" />
                        <span className="text-lg font-mono tracking-widest animate-pulse text-[#ddbf61]">
                            {isReady ? "ESTABILIZANDO NÚCLEO HOLOGRÁFICO..." : "INICIALIZANDO HOLODECK..."}
                        </span>
                    </div>
                 </div>
            )}

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
                    node.fx = node.x;
                    node.fy = node.y;
                    node.fz = node.z;
                    if (onNodeDragEnd) onNodeDragEnd(node);
                    if (onAutoFreeze) onAutoFreeze(node.id, node.x, node.y);
                }}

                // PHYSICS (STASIS PROTOCOL)
                cooldownTicks={100} // Stop after 100 ticks
                cooldownTime={2000} // Stop after 2 seconds
                onEngineStop={() => {
                    console.log('Physics Frozen');
                    setIsEngineStopped(true);
                    fgRef.current?.zoomToFit(400);
                }}

                d3AlphaDecay={0.01}
                d3VelocityDecay={0.3}

                // CUSTOM FORCES
                // @ts-ignore
                d3Force={ (d3Graph: any) => {
                    d3Graph.force('link').distance(100);
                    d3Graph.force('charge').strength(-500);
                }}
            />
        </div>
    );
};

export default NexusGraph;
