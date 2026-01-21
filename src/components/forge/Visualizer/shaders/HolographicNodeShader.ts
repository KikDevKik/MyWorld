import * as THREE from 'three';

// 🟢 HOLOGRAPHIC NODE SHADER
// Specifications:
// - Spherical Geometry
// - Fresnel Effect (Rim Lighting) for depth
// - Scanlines (Horizontal transparency strips) for "Hologram" feel
// - Semi-transparent center

export const HolographicNodeShader = {
    uniforms: {
        color: { value: new THREE.Color(0x00ffff) },
        time: { value: 0 },
        opacity: { value: 0.8 },
        rimPower: { value: 2.5 }, // Controls how sharp the rim is
        scanlineScale: { value: 50.0 }
    },
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
        uniform vec3 color;
        uniform float time;
        uniform float opacity;
        uniform float rimPower;
        uniform float scanlineScale;

        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;

        void main() {
            // 1. FRESNEL (Rim Light)
            vec3 viewDir = normalize(vViewPosition);
            vec3 normal = normalize(vNormal);
            float fresnel = 1.0 - dot(viewDir, normal);
            fresnel = pow(fresnel, rimPower);

            // 2. SCANLINES
            float scanline = sin((vUv.y * scanlineScale) - (time * 2.0));
            // Map -1..1 to 0.5..1.0 (subtle)
            scanline = smoothstep(0.0, 1.0, scanline) * 0.3 + 0.7;

            // 3. COMPOSE
            vec3 finalColor = color * fresnel * 2.0; // Boost brightness at rim
            finalColor += color * 0.2; // Base ambient fill

            float alpha = (fresnel + 0.1) * opacity * scanline;

            // Core transparency
            // If facing directly, dot product is 1, fresnel is 0.
            // We want edges opaque, center transparent.

            gl_FragColor = vec4(finalColor, alpha);
        }
    `
};
