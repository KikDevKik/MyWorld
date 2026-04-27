import { EntityCategory, EntityTier } from "../types/forge";

export type GraphNode = {
    id: string;
    name: string;
    type: string;
    description: string;
    projectId: string;
    x?: number;
    y?: number;
    relations?: any[];
    meta?: any;
    isGhost?: boolean;
    traits?: string[]; // 🟢 V3.0 Traits
    foundInFiles?: any[];
    aliases?: string[];
    subtype?: string;
};

export type EntityType = 'character' | 'location' | 'object' | 'event' | 'faction' | 'concept' | 'idea' | 'creature' | 'race';

export interface Character {
    id: string;
    name: string;
    role: string;
    tier: EntityTier;
    status: 'EXISTING' | 'DETECTED';
    sourceType: 'MASTER' | 'LOCAL';
    sourceContext: string;
    masterFileId?: string;
    lastUpdated: string;
    isAIEnriched?: boolean;
    avatar?: string;
    description?: string;
    bio?: string;
    personality?: string;
    evolution?: string;
    tags?: string[];
    aliases?: string[];
    category?: EntityCategory;
    isGhost?: boolean;
    saga?: string;
    contextualAnalysis?: string;
    lastAnalyzed?: string;
    snippets?: any[];
}
