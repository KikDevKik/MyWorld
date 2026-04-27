/**
 * ============================================================
 *  UNIFIED KNOWLEDGE GRAPH — Entity-Component-System (ECS)
 *  Contrato de Datos Maestro para la colección WorldEntities
 *  Ruta Firestore: users/{userId}/WorldEntities/{entityId}
 * ============================================================
 */

// ── PRIMITIVOS ────────────────────────────────────────────────────────────────

/** Categoría ontológica de la entidad. */
export type EntityCategory =
    | 'PERSON'
    | 'CREATURE'
    | 'LOCATION'
    | 'OBJECT'
    | 'FLORA'
    | 'FACTION'
    | 'CONCEPT'
    | 'EVENT'
    | 'RESOURCE';

/**
 * Tier de canonicidad.
 * ANCHOR  = Canon confirmado (tiene DriveFile propio)
 * LIMBO   = Apuntes / dudas / en revisión
 * GHOST   = Solo detectado por scanner; sin ficha propia aún
 */
export type EntityTier = 'ANCHOR' | 'LIMBO' | 'GHOST';

/** Estado operativo del registro. */
export type EntityStatus = 'active' | 'archived' | 'conflict';

/** Modo de síntesis del Nexus Builder. */
export type SynthesisMode = 'RIGOR' | 'FUSION' | 'ENTROPIA';

// ── MÓDULOS ───────────────────────────────────────────────────────────────────

/**
 * 🟠 FORGE & MUSA — Identidad y resumen.
 * El contenido crudo vive en Drive; este módulo sólo guarda metadatos.
 */
export interface ForgeModule {
    /** Resumen de 2 párrafos generado al indexar. */
    summary?: string;
    /** Nombres alternativos reconocidos por el Parser. */
    aliases?: string[];
    /** Etiquetas manuales del autor. */
    tags?: string[];
    /** Smart-tags inyectados por La Musa (ej. 'LORE', 'VISUAL'). */
    smartTags?: string[];

    // ═══ NUEVOS CAMPOS SPRINT 6.0 ═══

    /**
     * Variables psicológicas estructuradas.
     * Solo se pueblan para entidades PERSON y CREATURE.
     * Todos los campos son opcionales para no romper entidades existentes.
     * Fuente: Truby 22 Steps + McKee Character Psychology
     */
    psychology?: {
        goal?: string;      // Objetivo consciente: "vengar la muerte del padre"
        fear?: string;      // Miedo central: "perder el control sobre los demás"
        flaw?: string;      // Defecto moral: "orgullo que ciega su empatía"
        lie?: string;       // La Mentira que Cree: "el fin justifica los medios"
        wound?: string;     // Herida del pasado (Ghost): "abandono en la infancia"
        need?: string;      // Lo que realmente necesita: "aprender a confiar"
        mbti?: string;      // Opcional: perfil tipológico para coherencia de voz
    };

    /**
     * Estado físico persistente del personaje.
     * Implementa la "Autopsia Biomecánica" del manifiesto.
     * Elimina el Plot Armor: las heridas son nodos restrictivos permanentes.
     */
    physicalState?: {
        injuries?: Array<{
            id: string;              // UUID para referenciar en auditorías
            description: string;     // "Corte profundo en muslo izquierdo"
            chapterIntroduced: string; // "Capítulo 2, escena del callejón"
            mechanicalImpact: string;  // "Reduce velocidad de movimiento, limita sigilo"
            isResolved: boolean;
            resolvedAt?: string;
        }>;
        currentStatus?: 'healthy' | 'injured' | 'critical' | 'deceased';
    };
}

/** Relación dirigida entre entidades dentro del grafo. */
export interface EntityRelation {
    targetId: string;
    relationType: string; // e.g. 'ENEMY', 'ALLY', 'FAMILY'
    context?: string;
}

/**
 * 🔵 NEXUS & BUILDER — Topología y relaciones.
 */
export interface NexusBuilderMetadata {
    synthesisMode?: SynthesisMode;
    isCrystallized?: boolean;
}

export interface NexusModule {
    relations?: EntityRelation[];
    builderMetadata?: NexusBuilderMetadata;
}

/**
 * 🟣 GUARDIAN — Rastreo y perfilado de presencia.
 */
export interface GuardianModule {
    /** Número de menciones detectadas en el corpus. */
    occurrences?: number;
    /** driveFileId del primer documento donde apareció. */
    firstMentionedIn?: string;
    /** Hash o resumen del centroide de personalidad (para drift detection). */
    personalityCentroid?: string;
    /** Score de desviación respecto al centroide (0 = sin drift). */
    driftScore?: number;
    /** Flag manual: requiere revisión editorial. */
    needsReview?: boolean;
}

/** Veredictos individuales del panel del Tribunal. */
export interface TribunalVerdicts {
    architect?: string;
    bard?: string;
    hater?: string;
}

/**
 * 🔴 TRIBUNAL & DIRECTOR — Veredictos persistentes.
 * Corrección de fuga de datos: este módulo persiste los resultados del Tribunal.
 */
export interface JudgementModule {
    lastInspectorReport?: string;
    tribunalVerdicts?: TribunalVerdicts;
    /** ISO-8601 timestamp del último juicio. */
    lastJudgedAt?: string;
}

// ── CONTENEDOR DE MÓDULOS ─────────────────────────────────────────────────────

/**
 * Todos los módulos son opcionales.
 * Un GHOST recién detectado no tendrá forge/nexus/guardian/judgement.
 */
export interface EntityModules {
    forge?: ForgeModule;
    nexus?: NexusModule;
    guardian?: GuardianModule;
    judgement?: JudgementModule;
}

// ── ENTIDAD RAÍZ ──────────────────────────────────────────────────────────────

/**
 * WorldEntity — Documento Firestore.
 * Colección: users/{userId}/WorldEntities/{entityId}
 *
 * El documento actúa como ÍNDICE y MAPA DE METADATOS.
 * El contenido crudo (texto completo) se lee de Drive bajo demanda via driveFileId.
 */
export interface WorldEntity {
    /** UUID único del documento (coincide con el ID del doc Firestore). */
    id: string;

    /** ID del proyecto/carpeta Drive al que pertenece la entidad. */
    projectId: string;

    /** ID del archivo en Google Drive. Permite fetch del contenido crudo on-demand. */
    driveFileId?: string;

    // ── CORE (La Verdad Absoluta) ──────────────────────────────────────────────
    name: string;
    category: EntityCategory;
    tier: EntityTier;
    status: EntityStatus;

    // ── MÓDULOS ECS (opcionales) ───────────────────────────────────────────────
    modules?: EntityModules;

    // ── TIMESTAMPS ────────────────────────────────────────────────────────────
    createdAt: string; // ISO-8601
    updatedAt: string; // ISO-8601
}
