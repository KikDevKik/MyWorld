import React, { forwardRef, useImperativeHandle, useMemo } from 'react';
import Xarrow, { Xwrapper, useXarrow } from 'react-xarrows';
import { VisualNode } from './types';

// 🟢 DUPLICATED STYLES FOR SAFETY
const RELATION_COLORS: Record<string, string> = {
    ENEMY: '#ef4444', // Red-500
    RIVAL: '#ef4444',
    HATE: '#ef4444',
    ALLY: '#06b6d4', // Cyan-500
    FRIEND: '#06b6d4',
    LOVE: '#ec4899', // Pink-500
    FAMILY: '#eab308', // Yellow-500
    BLOOD: '#eab308',
    MAGIC: '#a855f7', // Purple-500
    MYSTIC: '#a855f7',
    DEFAULT: '#64748b' // Slate-500
};

const getRelationColor = (type: string) => {
    if (!type) return RELATION_COLORS.DEFAULT;
    const key = type.toUpperCase();
    if (key.includes('ENEMY') || key.includes('WAR') || key.includes('KILL') || key.includes('HATE') || key.includes('ODIA') || key.includes('TRAICIÓN') || key.includes('RIVAL') || key.includes('MUERTE')) return RELATION_COLORS.ENEMY;
    if (key.includes('ALLY') || key.includes('FRIEND') || key.includes('TRADE') || key.includes('LOVE')) return RELATION_COLORS.ALLY;
    if (key.includes('FAMILY') || key.includes('SPOUSE') || key.includes('BLOOD') || key.includes('SIB')) return RELATION_COLORS.FAMILY;
    if (key.includes('MAGIC') || key.includes('SPELL') || key.includes('CURSE')) return RELATION_COLORS.MAGIC;
    return RELATION_COLORS.DEFAULT;
};

// 🟢 LINKS OVERLAY (Static Layer - "The Divorce")
export interface LinksOverlayHandle {
    forceUpdate: () => void;
}

const LinksOverlayV2 = forwardRef<LinksOverlayHandle, {
    nodes: VisualNode[];
    lodTier: 'MACRO' | 'MESO' | 'MICRO';
    hoveredNodeId: string | null;
    hoveredLineId: string | null;
    setHoveredLineId: (id: string | null) => void;
}>(({ nodes, lodTier, hoveredNodeId, hoveredLineId, setHoveredLineId }, ref) => {
    const updateXarrow = useXarrow();

    useImperativeHandle(ref, () => ({
        forceUpdate: () => updateXarrow()
    }));

    // ⚡ Bolt Optimization: Pre-compute lookups to avoid O(N^2) in render loop
    const { nodeMap, nameMap } = useMemo(() => {
        const nMap = new Map<string, VisualNode>();
        const nmMap = new Map<string, VisualNode>();
        nodes.forEach(n => {
            nMap.set(n.id, n);
            if (n.name) nmMap.set(n.name.toLowerCase().trim(), n);
        });
        return { nodeMap: nMap, nameMap: nmMap };
    }, [nodes]);

    if (lodTier === 'MACRO') return null;

    return (
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <Xwrapper>
                {nodes.map((node) => {
                    if (!node.relations) return null;
                    return node.relations.map((rel, idx) => {
                        // Check validity with Fallback (Healing Protocol)
                        let targetNode = nodeMap.get(rel.targetId);
                        if (!targetNode && rel.targetName) {
                             targetNode = nameMap.get(rel.targetName.toLowerCase().trim());
                        }

                        if (!targetNode) return null;

                        const actualTargetId = targetNode.id;
                        const lineId = `${node.id}-${actualTargetId}-${idx}`;

                        const isFocused = hoveredNodeId === node.id || hoveredNodeId === actualTargetId || hoveredLineId === lineId;
                        const relColor = getRelationColor(rel.relation);
                        const labelText = rel.context
                            ? (rel.context.length > 30 ? rel.context.substring(0, 27) + "..." : rel.context)
                            : rel.relation;

                        return (
                            <Xarrow
                                key={lineId}
                                start={node.id}
                                end={actualTargetId}
                                startAnchor="middle"
                                endAnchor="middle"
                                color={relColor}
                                strokeWidth={1.5}
                                headSize={3}
                                curveness={0.3}
                                path="smooth"
                                zIndex={0}
                                animateDrawing={false}
                                passProps={{
                                    onMouseEnter: () => setHoveredLineId(lineId),
                                    onMouseLeave: () => setHoveredLineId(null),
                                    style: { cursor: 'pointer', pointerEvents: 'auto' }
                                }}
                                labels={{
                                    middle: (
                                        <div
                                            className={`
                                                bg-black/90 backdrop-blur text-[9px] px-2 py-0.5 rounded-full border max-w-[200px] truncate cursor-help transition-all duration-300
                                                ${isFocused ? 'opacity-100 scale-100 z-50' : 'opacity-0 scale-90 -z-10'}
                                            `}
                                            style={{
                                                borderColor: relColor,
                                                color: relColor,
                                                boxShadow: `0 0 5px ${relColor}20`,
                                                pointerEvents: 'auto'
                                            }}
                                            title={`${rel.relation}: ${rel.context || 'Sin contexto'}`}
                                        >
                                            {labelText}
                                        </div>
                                    )
                                }}
                            />
                        );
                    });
                })}
            </Xwrapper>
        </div>
    );
});

export default LinksOverlayV2;
