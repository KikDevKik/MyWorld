export type EntityCategory = 'PERSON' | 'CREATURE' | 'FLORA' | 'LOCATION' | 'OBJECT' | 'FACTION' | 'EVENT' | 'CONCEPT';
export type EntityTier = 'MAIN' | 'SECONDARY' | 'BACKGROUND' | 'GHOST' | 'LIMBO' | 'ANCHOR' | 'SUPPORTING'; // Added SUPPORTING

export interface DetectedEntity {
    name: string;
    tier: EntityTier;
    category: EntityCategory;
    confidence: number;
    reasoning: string;
    sourceFileId: string;
    sourceFileName: string;
    saga: string;
    foundIn: string[];
    rawContent?: string;
    role?: string;
    avatar?: string;
    mergeSuggestion?: string;
}

export interface SoulEntity {
    id: string;
    name: string;
    tier: EntityTier;
    category: EntityCategory;
    role?: string;
    avatar?: string;
    driveId?: string;
    sourceSnippet: string;
    mergeSuggestion?: string;
    tags?: string[];
    occurrences: number;
    lastDetected: string;
    aliases?: string[]; // Added aliases
}

export interface ForgePayload {
    entities: SoulEntity[];
    stats: {
        totalGhosts: number;
        totalLimbos: number;
        totalAnchors: number;
    };
}
