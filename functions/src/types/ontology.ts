export type EntityTrait =
    | 'sentient'    // Capaz de diálogo/voluntad (Personaje, IA, Deidad)
    | 'tangible'    // Tiene masa física (Objeto, Personaje, Lugar)
    | 'locatable'   // Tiene coordenadas/dirección (Lugar, Planeta)
    | 'temporal'    // Ocurre en el tiempo (Evento, Escena)
    | 'organized'   // Grupo de entidades (Facción, Gremio)
    | 'abstract';   // Concepto puro (Ley, Magia, Lore)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista)
    name: string;        // Nombre Canónico
    traits: EntityTrait[]; // 🚀 EL NÚCLEO: Define qué PUEDE hacer la entidad

    attributes: {
        // Metadatos Flexibles (No esquemáticos)
        role?: string;      // Rol Narrativo (ej. "Antagonista")
        aliases?: string[]; // Búsqueda difusa
        tags?: string[];    // Taxonomía flexible

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived' | 'ghost';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string;
            schema_version: '3.0';
            nexus_id: string;
            legacy_type?: string; // 🛡️ Compatibility Shield (Temporary)
        };

        // Extensible
        [key: string]: any;
    };

    bodyContent: string; // Markdown Soberano
}
