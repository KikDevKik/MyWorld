export type EntityTrait =
    | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs, Monstruos inteligentes)
    | 'locatable'   // Tiene coordenadas, geografía, atmósfera (Lugares, Planetas)
    | 'tangible'    // Es un objeto físico, tiene peso, valor (Items, Artefactos, Bestias simples)
    | 'temporal'    // Ocurre en el tiempo (Eventos, Escenas, Capítulos)
    | 'organized'   // Es un grupo, tiene ideología, miembros (Gremios, Cultos, Facciones)
    | 'abstract';   // Conceptos (Leyes mágicas, Filosofía, Lore puro)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista del Path)
    name: string;        // Nombre Canónico (Debe coincidir con H1)

    // 🚀 EL NÚCLEO: Define qué PUEDE hacer la entidad
    traits: EntityTrait[];

    // 🟢 DYNAMIC ATTRIBUTES (Only if valuable)
    attributes: {
        role?: string;       // Descripción corta (ej. "Capitán de la Guardia")
        aliases?: string[];  // Para búsqueda difusa
        tags?: string[];     // Taxonomía flexible

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys?: {
            status: 'active' | 'archived' | 'ghost';
            tier: 'ANCHOR' | 'DRAFT'; // Removed GHOST from here as it is a status
            last_sync: string;
            schema_version: '3.0';
            legacy_type?: string; // Compatibility Shield
            nexus_id?: string;    // 🟢 NEW: Explicit Nexus ID storage
        };

        // Compatibility Shield (Deprecated but kept for transition)
        type?: string;

        // Datos específicos de Trait (opcionales)
        [key: string]: any;
    };

    bodyContent: string; // Markdown Soberano
}
