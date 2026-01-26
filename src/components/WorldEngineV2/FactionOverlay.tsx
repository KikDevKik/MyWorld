import React, { useMemo } from 'react';
import { polygonHull, polygonCentroid } from 'd3-polygon';
import { VisualNode } from './types';

// 🟢 HELPER: NEON COLOR GENERATOR (Hash-based)
const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // H: 0-360, S: 80-100% (Neon), L: 45-65% (Visible but not too bright)
    const h = Math.abs(hash % 360);
    const s = 80 + (Math.abs(hash) % 20);
    const l = 50 + (Math.abs(hash) % 15);
    return `hsl(${h}, ${s}%, ${l}%)`;
};

// 🟢 HELPER: GROUP NODES BY FACTION
const groupNodesByFaction = (nodes: VisualNode[]) => {
    const groups: Record<string, { id: string, name: string, points: [number, number][] }> = {};

    // 1. Identify Faction Nodes (The Anchors)
    nodes.forEach(node => {
        if (node.type === 'faction') {
            const key = node.id;
            if (!groups[key]) groups[key] = { id: key, name: node.name, points: [] };
            if (typeof node.x === 'number' && typeof node.y === 'number') {
                groups[key].points.push([node.x, node.y]);
            }
        }
    });

    // 2. Identify Members (via Relations or Meta)
    nodes.forEach(node => {
        if (typeof node.x !== 'number' || typeof node.y !== 'number') return;
        const pt: [number, number] = [node.x, node.y];

        // A) Check Relations (PART_OF -> Faction)
        if (node.relations) {
            node.relations.forEach(rel => {
                if (['PART_OF', 'MEMBER_OF', 'ALLEGIANCE', 'SERVES'].includes(rel.relation)) {
                    // Check if target is a known faction (or just group by ID)
                    // If the target is NOT in our groups yet (maybe the faction node isn't loaded?),
                    // should we create a group?
                    // The prompt implies "visualizing territories".
                    // Better to rely on explicit Faction Nodes if possible, OR just grouping by ID.
                    // Let's create the group if it doesn't exist, using the targetName as the name.
                    const targetId = rel.targetId;
                    if (!groups[targetId]) {
                        // Potential issue: We might not know the name if the node isn't loaded.
                        // But rel has targetName.
                        groups[targetId] = { id: targetId, name: rel.targetName, points: [] };
                    }
                    groups[targetId].points.push(pt);
                }
            });
        }

        // B) Check Meta Tag (legacy/simplified grouping)
        if (node.meta?.faction) {
            // This is a string name usually
            const factionName = node.meta.faction;
            // We need a stable ID. Let's hash the name or check if we have a group with this name.
            // Search existing groups by name
            let foundId = Object.keys(groups).find(k => groups[k].name === factionName);

            if (!foundId) {
                // Create pseudo-ID for string-only factions
                foundId = `meta-faction-${factionName}`;
                groups[foundId] = { id: foundId, name: factionName, points: [] };
            }
            groups[foundId].points.push(pt);
        }
    });

    return Object.values(groups).filter(g => g.points.length > 0);
};

interface FactionOverlayProps {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
}

export const FactionOverlay: React.FC<FactionOverlayProps> = ({ nodes, lodTier }) => {
    // 🧠 MEMOIZE CALCULATIONS (Expensive Geometry)
    const territories = useMemo(() => {
        const groups = groupNodesByFaction(nodes);

        return groups.map(group => {
            const { points, name } = group;

            // 1. Calculate Hull
            // d3.polygonHull requires >= 3 points.
            // If < 3, we simulate a circle.
            let pathData = "";
            let centroid: [number, number] = [0, 0];
            const color = stringToColor(name);

            if (points.length >= 3) {
                const hull = polygonHull(points);
                if (hull) {
                    // Smooth curve or straight lines? Hull returns points.
                    // "L" is linear. for smooth, we'd need a curve interpolator,
                    // but convex hulls are usually polygons.
                    pathData = `M ${hull.map(p => p.join(",")).join(" L ")} Z`;
                    centroid = polygonCentroid(hull);
                }
            } else if (points.length > 0) {
                // 1 or 2 points -> Draw a circle around average
                const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
                const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
                centroid = [cx, cy];
                // Radius: if 2 points, half distance + padding. If 1 point, fixed padding.
                const r = points.length === 2
                    ? Math.sqrt(Math.pow(points[0][0] - points[1][0], 2) + Math.pow(points[0][1] - points[1][1], 2)) / 2 + 50
                    : 150; // Default radius for single node faction

                // Draw Circle Path
                pathData = `M ${cx}, ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
            }

            // Expand Hull (Padding)?
            // A convex hull is "tight". To make it a "Territory", usually we want some padding.
            // SVG stroke-width can fake padding, or we can scale the polygon.
            // For now, large stroke width (e.g., 50px) with rounded joins is the easiest "padding".

            return {
                id: group.id,
                name,
                pathData,
                centroid,
                color,
                memberCount: points.length
            };
        });
    }, [nodes]); // Re-calc when nodes move (on every tick? No, nodes prop changes on tick? NO.)
    // ⚠️ CRITICAL: `nodes` prop in Parent changes on every D3 tick?
    // In `WorldEnginePageV2`, `unifiedNodes` is memoized based on `dbNodes` and `ghostNodes`.
    // It does NOT change on every tick. The D3 simulation mutates `x` and `y` directly on the objects.
    // However, React won't re-render unless state changes.
    // `FactionOverlay` needs to re-render to follow the nodes!
    //
    // SOLUTION: `LinksOverlayV2` uses `useXarrow()` or `forceUpdate`.
    // Here, we need to force re-render or accept that territories only update when the simulation "settles" or when we explicitly trigger it.
    // BUT: The prompt wants it to look like a map.
    // If I just pass `nodes`, it won't animate smoothly because `nodes` array reference doesn't change on tick.
    // I should probably forward a `tick` prop or similar to force update, OR just let it be static/laggy during drag?
    //
    // BETTER APPROACH: Use a ref and direct DOM manipulation for performance?
    // OR: Just accept it updates when `nodes` changes (add/remove) or on drag end?
    //
    // Actually, `GraphSimulationV2` modifies the `x,y` properties IN PLACE on the `nodes` objects.
    // If `FactionOverlay` is a pure component, it won't see changes.
    // I should implement a `forceUpdate` mechanism similar to LinksOverlay.

    return <FactionOverlayRenderer territories={territories} lodTier={lodTier} />;
};

// Separated Renderer to handle the "Tick" updates if we decide to implement that.
// For now, we'll let it be reactive to `nodes` which might not update on every tick.
// Wait, `WorldEnginePageV2` passes `unifiedNodes`.
// `GraphSimulationV2` mutates them.
// `LinksOverlayV2` has `forceUpdate`.
// I should allow `FactionOverlay` to update frequently.
//
// Let's rely on the parent `WorldEnginePageV2` which calls `linksOverlayRef.current?.forceUpdate()`.
// I should expose a handle here too.

export interface FactionOverlayHandle {
    forceUpdate: () => void;
}

export const FactionOverlayWithRef = React.forwardRef<FactionOverlayHandle, FactionOverlayProps>((props, ref) => {
    const [tick, setTick] = React.useState(0);

    React.useImperativeHandle(ref, () => ({
        forceUpdate: () => setTick(t => t + 1)
    }));

    return <FactionOverlay {...props} />;
});

const FactionOverlayRenderer: React.FC<{ territories: any[], lodTier: 'MACRO' | 'MESO' | 'MICRO' }> = ({ territories, lodTier }) => {
    const isMacro = lodTier === 'MACRO';

    // Opacity Logic
    // Macro: 1.0 (Full visibility)
    // Meso/Micro: 0.15 (Subtle background)
    const overlayOpacity = isMacro ? 1.0 : 0.2;
    const labelOpacity = isMacro ? 1.0 : 0.0;

    return (
        <svg
            className="absolute inset-0 w-[4000px] h-[4000px] overflow-visible pointer-events-none"
            style={{ zIndex: 0 }}
        >
            <defs>
                {/* Optional: Glow Filters */}
                <filter id="glow-blur" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="50" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>

            {territories.map(t => (
                <g key={t.id} className="transition-opacity duration-700" style={{ opacity: overlayOpacity }}>
                    {/* The Hull */}
                    <path
                        d={t.pathData}
                        fill={t.color}
                        fillOpacity={0.1} // Very low opacity fill
                        stroke={t.color}
                        strokeWidth={40} // Thick stroke to simulate padding/territory border
                        strokeLinejoin="round"
                        strokeOpacity={0.15}
                        style={{ filter: 'url(#glow-blur)' }}
                    />

                    {/* The Label */}
                    <text
                        x={t.centroid[0]}
                        y={t.centroid[1]}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={t.color}
                        style={{
                            fontFamily: 'monospace',
                            fontSize: '120px', // GIANT
                            fontWeight: 'bold',
                            letterSpacing: '0.2em',
                            opacity: labelOpacity, // Only visible in MACRO
                            textShadow: `0 0 20px ${t.color}`,
                            pointerEvents: 'none',
                            transition: 'opacity 0.5s ease-in-out'
                        }}
                    >
                        {t.name.toUpperCase()}
                    </text>
                </g>
            ))}
        </svg>
    );
};

export default FactionOverlayWithRef;
