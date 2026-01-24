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

// 🟢 ANALYSIS TYPES (Phase 2.1 - The Tribunal)
export type AnalysisAmbiguityType = 'CONFLICT' | 'NEW' | 'ITEM_LORE';

export type AnalysisAction = 'MERGE' | 'CREATE' | 'CONVERT_TYPE' | 'IGNORE';

export interface AnalysisCandidate {
    id: string; // Temporary ID for the candidates
    name: string;
    text_preview: string; // Snippet of text where found
    ambiguityType: AnalysisAmbiguityType;
    suggestedAction: AnalysisAction;
    category: 'ENTITY' | 'ITEM' | 'CONCEPT' | 'EVENT';

    // Logic
    mergeWithId?: string; // If 'MERGE', who is the parent?
    confidence: number; // 0-100
    reasoning: string; // AI Explanation

    // Explicitly NO coordinates (fx, fy) - Simulation handles that later
}
