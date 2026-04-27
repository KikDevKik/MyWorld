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

// ⚡ Bolt Optimization: Define Group Structure Interface
interface FactionGroup {
    id: string;
    name: string;
    members: VisualNode[]; // Hold references to mutable nodes
    isAnchor: boolean;
    color: string; // Calculated once
}

// 🟢 HELPER: GROUP NODES BY FACTION (Structural - O(N*R))
// This runs only when graph topology changes (nodes added/removed/edited)
const getFactionGroups = (nodes: VisualNode[]): FactionGroup[] => {
    // Map of GroupID -> Group Data
    // We strictly follow "One Man, One Empire" policy.
    const groups: Record<string, FactionGroup> = {};

    nodes.forEach(node => {
        let groupId: string | null = null;
        let groupName = "";
        let isAnchor = false;

        // 1. IS FACTION ANCHOR? (Highest Priority)
        if (node.type === 'faction') {
            groupId = node.id;
            groupName = node.name;
            isAnchor = true;
        }
        // 2. BELONGS TO FACTION via RELATION? (Explicit ID)
        else if (node.relations) {
            // Prioritize PART_OF / MEMBER_OF
            const factionRel = node.relations.find(r =>
                ['PART_OF', 'MEMBER_OF', 'ALLEGIANCE', 'SERVES'].includes(r.relation)
            );
            if (factionRel) {
                groupId = factionRel.targetId;
                groupName = factionRel.targetName;
            }
        }

        // 3. BELONGS TO FACTION via META? (Fallback for Single-Member/Legacy)
        if (!groupId && (node.meta?.faction || node.meta?.group)) {
             const rawName = node.meta.faction || node.meta.group;
             // Create a consistent ID for string-based factions
             // We use a prefix to distinguish from potential real IDs, though conflict is rare
             groupId = `meta-${rawName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
             groupName = rawName;
        }

        // 4. ADD TO GROUP
        if (groupId) {
             if (!groups[groupId]) {
                 groups[groupId] = {
                     id: groupId,
                     name: groupName,
                     members: [],
                     isAnchor: false,
                     color: stringToColor(groupName) // Calculate color ONCE
                 };
             }

             // Update name logic:
             // If this node is the Anchor, it Authoritatively sets the name.
             // If we only had inferred names before, update it.
             if (isAnchor) {
                 groups[groupId].name = groupName;
                 groups[groupId].isAnchor = true;
                 // Recalculate color if name changed (rare but possible)
                 groups[groupId].color = stringToColor(groupName);
             } else if (!groups[groupId].name && groupName) {
                 // If we didn't have a name (e.g. created by ID only?), set it.
                 groups[groupId].name = groupName;
                 groups[groupId].color = stringToColor(groupName);
             }

             groups[groupId].members.push(node);
        }
    });

    return Object.values(groups).filter(g => g.members.length > 0);
};

// 🟢 HELPER: CALCULATE GEOMETRY (Dynamic - O(G*M))
// This runs every animation frame using updated node positions
const calculateTerritories = (groups: FactionGroup[]) => {
    return groups.map(group => {
        const { members, name, color, id, isAnchor } = group;

        // Extract valid points from current node positions
        const points: [number, number][] = [];
        members.forEach(n => {
            if (typeof n.x === 'number' && typeof n.y === 'number') {
                points.push([n.x, n.y]);
            }
        });

        let pathData = "";
        let centroid: [number, number] = [0, 0];
        let isSingle = false;

        // 1. Calculate Hull
        // d3.polygonHull requires >= 3 points.
        if (points.length >= 3) {
            const hull = polygonHull(points);
            if (hull) {
                pathData = `M ${hull.map(p => p.join(",")).join(" L ")} Z`;
                centroid = polygonCentroid(hull);
            }
        } else if (points.length > 0) {
            // 1 or 2 points -> Draw a circle/stadium fallback
            const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
            const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
            centroid = [cx, cy];

            // Radius Logic
            isSingle = points.length === 1;
            const r = points.length === 2
                ? Math.sqrt(Math.pow(points[0][0] - points[1][0], 2) + Math.pow(points[0][1] - points[1][1], 2)) / 2 + 80
                : 150; // "Generous Fixed Radius" for Lone Wolf (150px)

            // Draw Circle Path
            pathData = `M ${cx}, ${cy} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`;
        }

        return {
            id,
            name,
            pathData,
            centroid,
            color,
            memberCount: points.length,
            isSingle // Flag for Debug Rendering
        };
    });
};

interface FactionOverlayProps {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    tick?: number;
}

export const FactionOverlay: React.FC<FactionOverlayProps> = ({ nodes, lodTier, tick }) => {
    // ⚡ Bolt Optimization: Memoize Structure (Expensive O(N*R)) separate from Geometry (Fast O(G*M))

    // 1. Group Membership (Stable across animation frames)
    const factionGroups = useMemo(() => {
        return getFactionGroups(nodes);
    }, [nodes]); // Re-runs only when graph topology changes

    // 2. Geometry Calculation (Dynamic per tick)
    const territories = useMemo(() => {
        return calculateTerritories(factionGroups);
    }, [factionGroups, tick]); // Re-runs on tick, but uses pre-calculated groups

    return <FactionOverlayRenderer territories={territories} lodTier={lodTier} />;
};

// Expose handle for parent to force update (since nodes might mutate in place)
export interface FactionOverlayHandle {
    forceUpdate: () => void;
}

export const FactionOverlayWithRef = React.forwardRef<FactionOverlayHandle, FactionOverlayProps>((props, ref) => {
    const [tick, setTick] = React.useState(0);

    React.useImperativeHandle(ref, () => ({
        forceUpdate: () => setTick(t => t + 1)
    }));

    return <FactionOverlay {...props} tick={tick} />;
});

const FactionOverlayRenderer: React.FC<{ territories: any[], lodTier: 'MACRO' | 'MESO' | 'MICRO' }> = ({ territories, lodTier }) => {
    const isMacro = lodTier === 'MACRO';

    // Opacity Logic
    const overlayOpacity = isMacro ? 1.0 : 0.2;
    const labelOpacity = isMacro ? 1.0 : 0.0;

    return (
        <svg
            width="4000"
            height="4000"
            className="overflow-visible"
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                pointerEvents: 'none',
                zIndex: 0
            }}
        >
            <defs>
                {/* Glow Filter */}
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
                    {/* The Territory Body */}
                    <path
                        d={t.pathData}
                        fill={t.color}
                        fillOpacity={0.1}
                        // 🟢 DEBUG: Single-Member Factions get Cyan Border
                        stroke={t.isSingle ? 'cyan' : t.color}
                        strokeWidth={t.isSingle ? 5 : 40}
                        strokeLinejoin="round"
                        strokeOpacity={t.isSingle ? 1 : 0.15}
                        style={{ filter: 'url(#glow-blur)' }}
                    />

                    {/* The Giant Label */}
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
                            opacity: labelOpacity,
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
