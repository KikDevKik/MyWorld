import { GraphNode } from '../../types/graph';

// 🟢 VISUAL TYPES (Replicated from V1)
export interface VisualNode extends GraphNode {
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    // UI Flags
    isGhost?: boolean; // True = Local Draft (Idea)
    isRescue?: boolean; // True = Failed Save (Lifeboat)
}
