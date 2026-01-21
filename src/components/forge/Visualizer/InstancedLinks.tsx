import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { BloomLinkShader } from './shaders/BloomLinkShader';

interface InstancedLinksProps {
    links: any[]; // { source: {x,y}, target: {x,y} } - AFTER worker update
}

const InstancedLinks: React.FC<InstancedLinksProps> = ({ links }) => {
    const geometryRef = useRef<THREE.BufferGeometry>(null);

    // 🟢 SHADER MATERIAL
    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            ...BloomLinkShader,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: THREE.UniformsUtils.clone(BloomLinkShader.uniforms)
        });
    }, []);

    // 🟢 GEOMETRY UPDATE LOOP
    useFrame((state) => {
        if (!geometryRef.current || links.length === 0) return;

        shaderMaterial.uniforms.time.value = state.clock.elapsedTime;

        // Flatten positions: [x1, y1, z1, x2, y2, z2, ...]
        const positions = new Float32Array(links.length * 6);

        links.forEach((link, i) => {
            // Safety: Worker sends nodes with x,y.
            // If link.source is an object, use it. If ID, we can't render yet (need map).
            // D3 force replaces IDs with objects. SimulationBridge passes these objects back.

            const source = link.source;
            const target = link.target;

            if (source && target && typeof source.x === 'number' && typeof target.x === 'number') {
                const i6 = i * 6;
                positions[i6] = source.x;
                positions[i6 + 1] = source.y;
                positions[i6 + 2] = 0;

                positions[i6 + 3] = target.x;
                positions[i6 + 4] = target.y;
                positions[i6 + 5] = 0;
            }
        });

        geometryRef.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometryRef.current.attributes.position.needsUpdate = true;
    });

    return (
        <lineSegments>
            <bufferGeometry ref={geometryRef} />
            <primitive object={shaderMaterial} attach="material" />
        </lineSegments>
    );
};

export default InstancedLinks;
