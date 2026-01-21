import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// 🟢 "VOID" ATMOSPHERE
// Floating dust particles to give depth to the black void.

const Background: React.FC = () => {
    const pointsRef = useRef<THREE.Points>(null);

    const particlesCount = 2000;

    const positions = useMemo(() => {
        const arr = new Float32Array(particlesCount * 3);
        for(let i=0; i<particlesCount; i++) {
            // Spread wide
            arr[i*3] = (Math.random() - 0.5) * 5000;
            arr[i*3+1] = (Math.random() - 0.5) * 5000;
            arr[i*3+2] = (Math.random() - 0.5) * 2000 - 1000; // Background depth
        }
        return arr;
    }, []);

    useFrame((state) => {
        if (pointsRef.current) {
            // Slow rotation
            pointsRef.current.rotation.z = state.clock.elapsedTime * 0.02;
        }
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particlesCount}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={2}
                color="#555555"
                transparent
                opacity={0.4}
                sizeAttenuation
            />
        </points>
    );
};

export default Background;
