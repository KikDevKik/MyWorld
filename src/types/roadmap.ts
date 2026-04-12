export interface PendingItem {
    code: string;
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    relatedFiles?: string[];
    category: 'continuidad' | 'worldbuilding' | 'personaje' | 'cronologia' | 'estructura';
    
    // ★ NUEVOS — del AI Studio
    layer?: 'MACRO' | 'MESO' | 'MICRO';     // Capa de la disonancia
    resolved?: boolean;                       // Estado de resolución
    resolutionText?: string;                  // Texto de resolución acordada
    resolvedAt?: string;                      // ISO timestamp de resolución
    autoResolvedBy?: string;                  // ID del PendingItem que lo resolvió (Ripple Effect)
}

export type ArquitectoFocusMode = 'TRIAGE' | 'MACRO' | 'MESO' | 'MICRO';
export type ArquitectoSeverityMode = 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';

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
