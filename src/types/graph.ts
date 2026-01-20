
// El "Qué" o "Quién" (Unifica Characters, Locations, Objects, Events)
export type EntityType = 'character' | 'location' | 'object' | 'event' | 'faction' | 'concept';

export interface GraphNode {
  id: string;            // DETERMINISTIC ID: sha256(projectId + name_normalized)
  name: string;
  type: EntityType;      // Discriminador para la colección unificada 'entities'
  projectId: string;

  // Metadatos ligeros para visualización rápida en el Grafo
  meta: {
    avatarUrl?: string;
    brief?: string;
    tier?: 'protagonist' | 'secondary' | 'background';
    // Campos específicos por tipo pueden ir aquí o extenderse
    // locationType?: 'city' | 'region' | 'room'
  };
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
