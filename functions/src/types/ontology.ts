export type EntityTrait =
    | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs, Monstruos inteligentes)
    | 'location'    // Tiene coordenadas, geografía, atmósfera (Lugares, Planetas)
    | 'artifact'    // Es un objeto, tiene peso, valor, función (Items, MacGuffins)
    | 'faction'     // Es un grupo, tiene ideología, miembros (Gremios, Cultos)
    | 'event'       // Ocurre en el tiempo (Batallas, Escenas)
    | 'creature'    // Bestiario, fauna, monstruos (con o sin agencia)
    | 'concept';    // Abstracto (Leyes mágicas, Filosofía)

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
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT' | 'GHOST';
            last_sync: string;
            schema_version: '2.0';
        };

        // Compatibility Shield
        type?: string;

        // Datos específicos de Trait (opcionales)
        [key: string]: any;
    };

    bodyContent: string; // Markdown Soberano
}
