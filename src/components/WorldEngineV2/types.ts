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
    isAnchor?: boolean; // 🟢 NEW: True = Existing Context (Holographic Reference)
}

export interface VisualEdge {
    source: string | VisualNode; // D3 replaces string with Node object
    target: string | VisualNode;
    label?: string;
}

// 🟢 ANALYSIS TYPES (Phase 2.1 - The Tribunal)
export type AnalysisAmbiguityType = 'CONFLICT' | 'NEW' | 'ITEM_LORE' | 'DUPLICATE';

export type AnalysisAction = 'MERGE' | 'CREATE' | 'CONVERT_TYPE' | 'IGNORE';

export interface AnalysisCandidate {
    id: string; // Temporary ID for the candidates
    name: string;
    text_preview?: string; // Legacy: First snippet
    ambiguityType: AnalysisAmbiguityType;
    suggestedAction: AnalysisAction;
    category: 'ENTITY' | 'ITEM' | 'CONCEPT' | 'EVENT';
    type?: string; // Backend provided type (e.g. 'character')
    subtype?: string; // Specific subtype (e.g. 'City', 'Weapon')

    // Logic
    mergeWithId?: string; // If 'MERGE', who is the parent?
    mergeTargetName?: string; // 🟢 NEW: Friendly name for display
    confidence: number; // 0-100
    reasoning: string; // AI Explanation

    // Staging / Edited Data
    aliases?: string[];
    description?: string; // User-edited or Staged description (Overrides reasoning)
    isStaged?: boolean; // UI Flag for Super-Card (Gold Border)

    // Evidence Layer (Phase 2.2)
    foundInFiles: Array<{
        fileName: string;
        contextSnippet: string;
        fileId?: string; // 🟢 NEW: Back-mapped from Scan
        fileLastModified?: string; // 🟢 NEW: Back-mapped from Scan
    }>;

    // 🟢 NEW: Relation Extraction (Phase 2.4 - The Web)
    relations?: Array<{
        target: string;
        type: string;
        context: string;
        targetId?: string; // 🟢 FIX: Added targetId as optional
    }>;

    // Explicitly NO coordinates (fx, fy) - Simulation handles that later
}

// 🟢 REALITY MODES (Phase 3 - The Builder)
export type RealityMode = 'RIGOR' | 'FUSION' | 'ENTROPIA';
