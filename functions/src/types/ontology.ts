export type EntityTrait =
    | 'sentient'
    | 'location'
    | 'artifact'
    | 'concept'
    | 'event'
    | 'creature'
    | 'faction';

export interface TitaniumEntity {
    id: string;          // Nexus ID (Deterministic)
    name: string;        // Canonical Name

    // 🟢 THE CORE: FUNCTIONAL TRAITS
    // Replaces static 'type'. Defines capability.
    traits: EntityTrait[];

    // 🟢 DYNAMIC ATTRIBUTES (Only if valuable)
    attributes: {
        role?: string;       // "Protagonista", "Capital", "Espada Mágica"
        aliases?: string[];  // "The Chosen One"
        tags?: string[];
        project_id?: string;
        avatar?: string;
        // Metadatos de Sistema (Ocultos al AI en RAG, visibles para el Sistema)
        _sys?: {
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string;
        };
        [key: string]: any;
    };

    bodyContent: string; // The Sovereign Markdown Body
}
