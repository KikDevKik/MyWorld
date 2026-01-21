import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import PhysicsWorker from './physics.worker?worker'; // Vite Worker Import
import InstancedNodes from './InstancedNodes';
import InstancedLinks from './InstancedLinks'; // 🟢 NEW
import Background from './Background';

interface GraphCanvasProps {
    nodes: any[];
    links: any[];
    onNodeClick: (nodeId: string) => void;
}

// 🟢 WORKER BRIDGE
const SimulationBridge: React.FC<{
    nodes: any[];
    links: any[];
    onUpdate: (nodes: any[], links: any[]) => void;
}> = ({ nodes, links, onUpdate }) => {
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        workerRef.current = new PhysicsWorker();

        workerRef.current.onmessage = (e) => {
            if (e.data.type === 'TICK') {
                const { nodes: workerNodes, links: workerLinks } = e.data.payload;
                onUpdate(workerNodes, workerLinks);
            }
        };

        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    useEffect(() => {
        if (workerRef.current && nodes.length > 0) {
            workerRef.current.postMessage({
                type: 'INIT',
                payload: { nodes, links }
            });
        }
    }, [nodes.length, links.length]);

    return null;
};

const GraphCanvas: React.FC<GraphCanvasProps> = ({ nodes: initialNodes, links: initialLinks, onNodeClick }) => {
    const [animatedNodes, setAnimatedNodes] = useState(initialNodes);
    const [animatedLinks, setAnimatedLinks] = useState(initialLinks);

    return (
        <div className="w-full h-full bg-[#141413]">
            <SimulationBridge
                nodes={initialNodes}
                links={initialLinks}
                onUpdate={(n, l) => {
                    setAnimatedNodes(n);
                    setAnimatedLinks(l);
                }}
            />

            <Canvas
                camera={{ position: [0, 0, 1000], fov: 60, near: 1, far: 10000 }}
                gl={{ alpha: false, antialias: true }}
                dpr={[1, 2]}
            >
                <color attach="background" args={['#141413']} />
                <Background />
                <ambientLight intensity={0.5} />
                <pointLight position={[100, 100, 100]} intensity={1} />

                {/* 🟢 RENDER LINKS */}
                <InstancedLinks links={animatedLinks} />

                {/* 🟢 RENDER NODES */}
                <InstancedNodes
                    nodes={animatedNodes}
                    onNodeClick={onNodeClick}
                />

                <OrbitControls
                    enableDamping
                    dampingFactor={0.1}
                    rotateSpeed={0.5}
                    minDistance={100}
                    maxDistance={5000}
                />
            </Canvas>
        </div>
    );
};

export default GraphCanvas;
