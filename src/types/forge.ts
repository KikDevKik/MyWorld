export type EntityTier = 'GHOST' | 'LIMBO' | 'ANCHOR';

// Estructura unificada para facilitar el renderizado
export interface SoulEntity {
  id: string;             // Hash único
  name: string;           // Ej: "Thomas"
  tier: EntityTier;       // GHOST, LIMBO, o ANCHOR
  sourceSnippet: string;  // Contexto o descripción breve (Ghost Snippet / Limbo Preview)
  occurrences: number;    // Relevancia
  mergeSuggestion?: string; // ID sugerido para fusión
  driveId?: string;       // Solo para ANCHOR
  role?: string;          // Added: Useful for UI
  avatar?: string;        // Added: Useful for UI (Anchors)
  tags?: string[];        // Added: Limbo traits (e.g. [Tímido, Leal])
}

export interface ForgePayload {
  entities: SoulEntity[]; // Array único ordenado por relevancia
  stats: {
    totalGhosts: number;
    totalLimbos: number;
    totalAnchors: number;
  };
}
