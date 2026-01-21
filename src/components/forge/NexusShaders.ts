import * as THREE from 'three';

// --- PALETTE (STRICT) ---
export const NEXUS_COLORS = {
    HERO: new THREE.Color('#ddbf61'),   // Gold
    ALLY: new THREE.Color('#00fff7'),   // Cyan
    ENEMY: new THREE.Color('#ff153f'),  // Red Neon
    VOID: new THREE.Color('#141413'),   // Black Matte
    CONCEPT: new THREE.Color('#ec4899') // Pink (Extra)
};

// --- VERTEX SHADER ---
const vertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
varying vec3 vViewPosition;

void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vUv = uv;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;

    gl_Position = projectionMatrix * mvPosition;
}
`;

// --- FRAGMENT SHADER (HOLOGRAPHIC) ---
const fragmentShader = `
uniform float time;
uniform vec3 baseColor;
uniform float glitchStrength;
uniform float opacity;
// uniform sampler2D noiseMap; // REMOVED - Procedural Noise

varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
varying vec3 vViewPosition;

// Simple Pseudo-Random Noise
float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    // 1. Fresnel Effect (Glowing Edges)
    vec3 viewVector = normalize(vViewPosition);
    vec3 normal = normalize(vNormal);
    float fresnel = pow(1.0 - dot(normal, viewVector), 3.0);

    // 2. Scanline Effect (Sci-Fi Bands)
    float scanline = sin(vUv.y * 50.0 - time * 5.0) * 0.1 + 0.9;

    // 3. Glitch Effect (Procedural)
    vec3 finalColor = baseColor;
    if (glitchStrength > 0.0) {
        float noiseVal = rand(vUv + time * 2.0); // Animate noise
        if (noiseVal > 0.8) {
            // Shift red channel slightly
             finalColor.r += glitchStrength * 0.5;
        }
    }

    // 4. Composition
    // Additive blending logic: Base + Fresnel
    vec3 glow = finalColor * scanline * 1.5; // Boost brightness for Bloom
    glow += finalColor * fresnel * 2.0;

    gl_FragColor = vec4(glow, opacity * (0.6 + fresnel * 0.4)); // Center is semi-transparent
}
`;

// --- MATERIAL FACTORY ---
export const createHoloMaterial = (color: THREE.Color, isGlitchy: boolean = false) => {
    return new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            baseColor: { value: color },
            glitchStrength: { value: isGlitchy ? 1.0 : 0.0 },
            opacity: { value: 0.9 }
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        side: THREE.FrontSide, // Optimize
        blending: THREE.AdditiveBlending, // Glow effect
        depthWrite: false // For transparency handling
    });
};

// --- GEOMETRY CACHE ---
// Reuse geometries to save memory
export const GEOMETRY_CACHE = {
    SPHERE: new THREE.SphereGeometry(1, 32, 32),
    OCTAHEDRON: new THREE.OctahedronGeometry(1, 0),
    BOX: new THREE.BoxGeometry(1, 1, 1),
    ICOSAHEDRON: new THREE.IcosahedronGeometry(1, 0),
};
