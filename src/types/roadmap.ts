export interface PendingItem {
    code: string;
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    relatedFiles?: string[];
    category: 'continuidad' | 'worldbuilding' | 'personaje' | 'cronologia' | 'estructura';
}

export type CardStatus = 'locked' | 'active' | 'completed';

export interface RoadmapCard {
    id: string;
    title: string;
    description: string;
    status: CardStatus;
    order: number;
    phase: 'fundacion' | 'conflicto' | 'desarrollo' | 'climax' | 'resolucion' | string;
    missions: PendingItem[];
    dominoLinks: string[];
    impactScore: number;
    createdAt: string;
    updatedAt: string;
}

export interface RoadmapImpact {
    hasImpact: boolean;
    affectedCardIds: string[];
    impactDescription: string;
}
