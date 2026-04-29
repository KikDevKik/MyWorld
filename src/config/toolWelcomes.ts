export type ToolAccentColor = 'violet' | 'cyan' | 'amber' | 'emerald' | 'zinc';

export interface ToolWelcomeConfig {
    toolName: string;
    tagline: string;
    description: string;
    tips: string[];
    accentColor: ToolAccentColor;
    icon: string;
}

export const TOOL_WELCOMES: Record<string, ToolWelcomeConfig> = {
    arquitecto: {
        toolName: 'El Arquitecto',
        tagline: 'Tu consejero socrático de worldbuilding',
        description: 'El Arquitecto analiza tu mundo narrativo, detecta inconsistencias y te hace preguntas que profundizan tu historia. Al final genera un Roadmap de misiones de escritura.',
        tips: [
            'Cuéntale sobre tu historia con tus propias palabras',
            'Cada sesión termina con un Roadmap Final que puedes cristalizar',
            'Funciona mejor cuando tienes al menos una premisa definida',
        ],
        accentColor: 'violet',
        icon: '🏛️',
    },
    forja: {
        toolName: 'La Forja de Almas',
        tagline: 'Crystalliza tus personajes',
        description: 'La Forja extrae y profundiza las entidades de tu mundo: personajes, lugares, objetos y conceptos. Cada entidad cristalizada alimenta el contexto de todas las demás herramientas.',
        tips: [
            'Empieza con tu protagonista principal',
            'Las entidades cristalizadas aparecen en el Nexus automáticamente',
            'Puedes editar cualquier ficha después de cristalizarla',
        ],
        accentColor: 'amber',
        icon: '⚗️',
    },
    nexus: {
        toolName: 'El Nexus',
        tagline: 'El mapa de relaciones de tu mundo',
        description: 'El Nexus visualiza las conexiones entre todas las entidades de tu historia. Detecta relaciones ocultas y te ayuda a entender la red de tu mundo narrativo.',
        tips: [
            'Requiere que La Forja haya cristalizado entidades primero',
            'Puedes crear conexiones manualmente con The Builder',
            'Usa el grafo para encontrar personajes aislados o sin conflicto',
        ],
        accentColor: 'cyan',
        icon: '🕸️',
    },
    editor: {
        toolName: 'El Editor',
        tagline: 'Donde la historia toma forma',
        description: 'El editor híbrido donde escribes tu manuscrito. Tiene acceso directo a todos tus archivos de Drive, sincronización automática y herramientas de escritura integradas.',
        tips: [
            'Los archivos se guardan automáticamente en tu Google Drive',
            'Abre cualquier archivo del MANUSCRITO desde el sidebar',
            'Las Misiones del Roadmap Final aparecerán en el panel lateral (próximamente)',
        ],
        accentColor: 'zinc',
        icon: '📝',
    },
};
