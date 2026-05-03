export type ToolAccentColor = 'violet' | 'cyan' | 'amber' | 'emerald' | 'zinc';

export interface ToolWelcomeConfig {
    toolName: string;
    tagline: string;
    description: string;
    tips: string[];
    accentColor: ToolAccentColor;
    icon: string;
}

export const getToolWelcomes = (t: any): Record<string, ToolWelcomeConfig> => ({
    arquitecto: {
        toolName: t?.architect?.toolName || 'El Arquitecto',
        tagline: t?.architect?.subtitle || 'Tu consejero socrático de worldbuilding',
        description: t?.architect?.description || 'El Arquitecto analiza tu mundo narrativo, detecta inconsistencias y te hace preguntas que profundizan tu historia. Al final genera un Roadmap de misiones de escritura.',
        tips: [
            t?.architect?.bullet1 || 'Cuéntale sobre tu historia con tus propias palabras',
            t?.architect?.bullet2 || 'Cada sesión termina con un Roadmap Final que puedes cristalizar',
            t?.architect?.bullet3 || 'Funciona mejor cuando tienes al menos una premisa definida',
        ],
        accentColor: 'violet',
        icon: '🏛️',
    },
    forja: {
        toolName: t?.forge?.toolName || 'La Forja de Almas',
        tagline: t?.forge?.tagline || 'Crystalliza tus personajes',
        description: t?.forge?.description || 'La Forja extrae y profundiza las entidades de tu mundo: personajes, lugares, objetos y conceptos. Cada entidad cristalizada alimenta el contexto de todas las demás herramientas.',
        tips: [
            t?.forge?.bullet1 || 'Empieza con tu protagonista principal',
            t?.forge?.bullet2 || 'Las entidades cristalizadas aparecen en el Nexus automáticamente',
            t?.forge?.bullet3 || 'Puedes editar cualquier ficha después de cristalizarla',
        ],
        accentColor: 'amber',
        icon: '⚗️',
    },
    nexus: {
        toolName: t?.nexus?.toolName || 'El Nexus',
        tagline: t?.nexus?.tagline || 'El mapa de relaciones de tu mundo',
        description: t?.nexus?.description || 'El Nexus visualiza las conexiones entre todas las entidades de tu historia. Detecta relaciones ocultas y te ayuda a entender la red de tu mundo narrativo.',
        tips: [
            t?.nexus?.bullet1 || 'Requiere que La Forja haya cristalizado entidades primero',
            t?.nexus?.bullet2 || 'Puedes crear conexiones manualmente con The Builder',
            t?.nexus?.bullet3 || 'Usa el grafo para encontrar personajes aislados o sin conflicto',
        ],
        accentColor: 'cyan',
        icon: '🕸️',
    },
    editor: {
        toolName: t?.editor?.toolName || 'El Editor',
        tagline: t?.editor?.tagline || 'Donde la historia toma forma',
        description: t?.editor?.description || 'El editor híbrido donde escribes tu manuscrito. Tiene acceso directo a todos tus archivos de Drive, sincronización automática y herramientas de escritura integradas.',
        tips: [
            t?.editor?.bullet1 || 'Los archivos se guardan automáticamente en tu Google Drive',
            t?.editor?.bullet2 || 'Abre cualquier archivo del MANUSCRITO desde el sidebar',
            t?.editor?.bullet3 || 'Las Misiones del Roadmap Final aparecerán en el panel lateral (próximamente)',
        ],
        accentColor: 'zinc',
        icon: '📝',
    },
});
