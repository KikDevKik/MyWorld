
// El "Qué" o "Quién" (Unifica Characters, Locations, Objects, Events)
export type EntityType = 'character' | 'location' | 'object' | 'event' | 'faction' | 'concept' | 'idea';

export interface NodeRelation {
  targetId: string;
  targetName: string;
  targetType: EntityType; // Vital for Ghost Nodes
  relation: 'ENEMY' | 'ALLY' | 'MENTOR' | 'FAMILY' | 'NEUTRAL' | 'LOVER' | 'PART_OF' | 'FRIEND' | 'KNOWS' | 'TALKS_TO' | 'HATES' | 'LOCATED_IN' | 'CAUSE' | 'OWNED_BY';
  context: string; // The "Why" (snippet)
  sourceFileId: string; // For updates/overwrites
}

export interface GraphNode {
  id: string;            // DETERMINISTIC ID: sha256(projectId + name_normalized)
  name: string;
  label?: string;        // Mapped from name for UI/DB compatibility
  type: EntityType;      // Discriminador para la colección unificada 'entities'
  projectId: string;

  // Campos opcionales para IA y Bloqueo Manual
  description?: string;
  aliases?: string[];
  locked?: boolean;      // True = Un humano ha verificado esto. La IA no debe sobrescribir description/type.

  relations?: NodeRelation[];

  // Evidencia de origen (Unión de todos los archivos donde aparece)
  foundInFiles?: Array<{
    fileId: string;
    fileName: string;
    lastSeen: string; // ISO Timestamp
  }>;

  // Metadatos ligeros para visualización rápida en el Grafo
  meta: {
    avatarUrl?: string;
    brief?: string;
    tier?: 'protagonist' | 'secondary' | 'background';
    faction?: string;
    // Campos específicos por tipo pueden ir aquí o extenderse
    // locationType?: 'city' | 'region' | 'room'
  };

  // Posición Espacial Persistente (Tablero de Detectives)
  fx?: number; // Fixed X (si existe, anula la simulación física en este eje)
  fy?: number; // Fixed Y
}

// La Conexión ("El Tejido") - Append-Only Strategy (Historial Completo)
export interface GraphEdge {
  id: string;            // UUID único por evento de relación
  sourceId: string;      // ID del Nodo Origen (ej. "Alice")
  targetId: string;      // ID del Nodo Destino (ej. "Bob")
  relationType: string;  // El predicado (ej. "LOVES", "KILLED", "MEMBER_OF")

  // Propiedades Temporales y de Contexto (Crítico para Mundos Entrelazados)
  context: {
    fileId: string;      // En qué archivo se detectó esta relación
    chapterId?: string;
    snippet?: string;    // El texto exacto que prueba la relación ("Alice besó a Bob")
    confidence: number;  // 0.0 a 1.0 (Qué tan segura está la IA)
  };

  // Cronología (Append-Only: No se sobrescribe, se crea nuevo documento para cambio de estado)
  temporal: {
    startYear?: number;  // Año absoluto de inicio
    endYear?: number;    // Año absoluto de fin (null si sigue activa)

    // CAMPOS DE HISTORIAL APPEND-ONLY
    validFrom: string;   // Timestamp ISO o ID de Capítulo donde esto se vuelve verdad
    validUntil?: string | null; // Timestamp/Capítulo donde esto deja de ser verdad (Null = Actual)
    status: 'active' | 'historic'; // Facilita queries rápidas del estado actual
  };
}
