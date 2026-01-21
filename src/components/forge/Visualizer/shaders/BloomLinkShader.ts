import * as THREE from 'three';

// 🟢 BLOOM LINK SHADER
// Specifications:
// - Energy Flow Effect (Time-based offset)
// - Glow/Bloom capability
// - Additive Blending assumed in material

export const BloomLinkShader = {
    uniforms: {
        color: { value: new THREE.Color(0xffffff) },
        time: { value: 0 },
        opacity: { value: 0.5 },
        dashSize: { value: 10.0 }, // Frequency of data packets
        gapSize: { value: 5.0 },
        speed: { value: 1.0 }
    },
    vertexShader: `
        attribute float lineDistance;
        varying float vLineDistance;
        varying vec2 vUv;

        void main() {
            vUv = uv;
            // Native THREE.Line logic usually requires calculating lineDistance in JS
            // Or we use a simple UV based flow if it's a MeshLine (Tube).
            // For GL_LINES, shaders are limited.
            // Assuming we use standard geometry, we rely on position.

            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;

            // Pass world position for noise/flow if needed
            vLineDistance = position.x + position.y + position.z; // Simple pseudo-distance
        }
    `,
    fragmentShader: `
        uniform vec3 color;
        uniform float time;
        uniform float opacity;
        uniform float speed;

        varying float vLineDistance;

        void main() {
            // 1. ENERGY FLOW
            // Create a moving pattern along the line
            float flow = sin(vLineDistance * 0.5 - time * speed);
            flow = smoothstep(0.4, 0.6, flow); // Sharpen pulse

            // 2. COLOR BOOST
            vec3 finalColor = color + (vec3(1.0) * flow * 0.8); // Add white pulse

            gl_FragColor = vec4(finalColor, opacity * (0.3 + flow * 0.7));
        }
    `
};
