import { EntityCategory } from './core';

export type EntityTier = 'GHOST' | 'LIMBO' | 'ANCHOR';
export type { EntityCategory }; // Re-export for convenience

// Estructura unificada para facilitar el renderizado
export interface SoulEntity {
  id: string;             // Hash único
  name: string;           // Ej: "Thomas"
  tier: EntityTier;       // GHOST, LIMBO, o ANCHOR
  category?: EntityCategory; // 🟢 NEW: Category field
  sourceSnippet: string;  // Contexto o descripción breve (Ghost Snippet / Limbo Preview)
  occurrences: number;    // Relevancia
  mergeSuggestion?: string; // ID sugerido para fusión
  driveId?: string;       // Solo para ANCHOR
  role?: string;          // Added: Useful for UI
  avatar?: string;        // Added: Useful for UI (Anchors)
  tags?: string[];        // Added: Limbo traits (e.g. [Tímido, Leal])
  aliases?: string[];     // Added: Known aliases for search/linking

  // 🟢 NEW: Bestiary Specific Data (Optional)
  bestiaryMetadata?: {
    type?: string; // Fauna, Flora, Monstruo...
    habitat?: string;
    dangerLevel?: string;
    diet?: string;
  };
}

export interface ForgePayload {
  entities: SoulEntity[]; // Array único ordenado por relevancia
  stats: {
    totalGhosts: number;
    totalLimbos: number;
    totalAnchors: number;
  };
}
