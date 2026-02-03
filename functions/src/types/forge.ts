export type EntityTier = 'GHOST' | 'LIMBO' | 'ANCHOR';
export type EntityCategory = 'PERSON' | 'CREATURE' | 'FLORA';

// Estructura unificada para facilitar el renderizado
export interface SoulEntity {
  id: string;             // Hash único
  name: string;           // Ej: "Thomas"
  tier: EntityTier;       // GHOST, LIMBO, o ANCHOR
  category?: EntityCategory; // 🟢 NEW: Category
  sourceSnippet: string;  // Contexto o descripción breve
  occurrences: number;    // Relevancia
  mergeSuggestion?: string; // ID sugerido para fusión
  driveId?: string;       // Solo para ANCHOR
  role?: string;          // Added: Useful for UI
  avatar?: string;        // Added: Useful for UI (Anchors)
  tags?: string[];        // Added: Limbo traits (e.g. [Tímido, Leal])
  aliases?: string[];     // Added: Known aliases for search/linking

  // 🟢 NEW: Bestiary Specific Data
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

export interface DetectedEntity {
    name: string;
    tier: EntityTier;
    category?: EntityCategory; // 🟢 NEW
    confidence: number;
    reasoning?: string;
    sourceFileId?: string;
    sourceFileName?: string;
    saga?: string;
    foundIn?: string[]; // Snippets or File Names
    rawContent?: string; // For Limbos: First few lines or raw content for AI
    role?: string;
    avatar?: string;
}
