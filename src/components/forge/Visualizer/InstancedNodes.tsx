import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { HolographicNodeShader } from './shaders/HolographicNodeShader';

interface InstancedNodesProps {
    nodes: any[]; // The Worker Nodes (with x, y)
    onNodeClick?: (nodeId: string) => void;
    hoveredNodeId?: string | null;
}

const InstancedNodes: React.FC<InstancedNodesProps> = ({ nodes, onNodeClick, hoveredNodeId }) => {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { camera, raycaster, pointer } = useThree();

    // 🟢 SHADER MATERIAL
    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            ...HolographicNodeShader,
            transparent: true,
            depthWrite: false, // For transparency sorting (simple)
            blending: THREE.AdditiveBlending,
            uniforms: THREE.UniformsUtils.clone(HolographicNodeShader.uniforms)
        });
    }, []);

    // 🟢 GEOMETRY (Sphere)
    const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 32), []);

    // 🟢 DUMMY OBJECT FOR MATRIX CALCULATION
    const dummy = useMemo(() => new THREE.Object3D(), []);

    // 🟢 COLOR PALETTE (The "Echo" Theme)
    const colorPalette = useMemo(() => ({
        protagonist: new THREE.Color('#ddbf61'), // Gold
        secondary: new THREE.Color('#00fff7'),   // Cyan
        enemy: new THREE.Color('#ff153f'),       // Red Glitch
        default: new THREE.Color('#718096')      // Gray
    }), []);

    // UPDATE MESH WHEN NODES MOVE
    // We expect 'nodes' to update every frame/tick via parent state or direct ref injection.
    // However, React props update might be too slow for 60fps physics if passed directly.
    // Strategy: Parent uses 'useFrame' to update the mesh, OR we do it here if nodes are stable refs.
    // For now, let's assume 'nodes' prop is fresh.

    useFrame((state) => {
        if (!meshRef.current || nodes.length === 0) return;

        shaderMaterial.uniforms.time.value = state.clock.elapsedTime;

        nodes.forEach((node, i) => {
            const size = node.val || 10;
            const x = node.x || 0;
            const y = node.y || 0;
            const z = 0; // 2D Plane

            dummy.position.set(x, y, z);
            dummy.scale.set(size, size, size);
            dummy.updateMatrix();

            meshRef.current!.setMatrixAt(i, dummy.matrix);

            // COLOR LOGIC
            let color = colorPalette.default;
            if (node.type === 'character') {
                 if (node.meta?.tier === 'protagonist') color = colorPalette.protagonist;
                 else color = colorPalette.secondary;
            } else if (node.type === 'event') {
                color = colorPalette.enemy; // Just for testing
            }

            // Hover Effect
            if (hoveredNodeId === node.id) {
                 // We can't change uniform per instance easily in basic ShaderMaterial without Attributes.
                 // We could use setColorAt if we used MeshStandardMaterial.
                 // For ShaderMaterial, we need an attribute 'aColor'.
                 // TODO: Implement InstanceColorAttribute.
            }

            meshRef.current!.setColorAt(i, color);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    // 🟢 RAYCASTING (Interaction)
    // We handle clicks in parent usually, or use 'onClick' from R3F if it supports Instance.
    // R3F's <instancedMesh> supports onClick with (e.instanceId).

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, shaderMaterial, 1000]} // Max 1000 for now
            count={nodes.length}
            onClick={(e) => {
                e.stopPropagation();
                const instanceId = e.instanceId;
                if (instanceId !== undefined && nodes[instanceId]) {
                    onNodeClick?.(nodes[instanceId].id);
                }
            }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'default'; }}
        />
    );
};

export default InstancedNodes;
