export const BACKEND_TRANSLATIONS: Record<string, any> = {
    es: {
        folders: {
            canon: 'CANON',
            resources: 'RECURSOS',
            characters: 'PERSONAJES',
            locations: 'LUGARES',
            rules: 'REGLAS',
            references: 'REFERENCIAS',
            inspiration: 'INSPIRACIÓN',
        },
        pdf: {
            certificateTitle: 'CERTIFICADO DE AUTORÍA',
            auditSubtitle: 'REGISTRO OFICIAL DE AUDITORÍA',
            projectId: 'ID del Proyecto:',
            authorId: 'ID del Autor:',
            dateGenerated: 'Fecha de Generación:',
            metricsTitle: 'MÉTRICAS DE ACTIVIDAD CREATIVA',
            totalActs: 'Actos Totales',
            humanInjections: 'Inyecciones (Humano)',
            curation: 'Curaduría',
            structure: 'Estructura',
            research: 'Investigación',
            auditTrailTitle: 'HISTORIAL DE AUDITORÍA (INMUTABLE)',
            footer: 'Verificado por Titanium Creative Audit Service',
            humanInput: 'ENTRADA HUMANA'
        }
    },
    en: {
        folders: {
            canon: 'CANON',
            resources: 'RESOURCES',
            characters: 'CHARACTERS',
            locations: 'LOCATIONS',
            rules: 'RULES',
            references: 'REFERENCES',
            inspiration: 'INSPIRATION',
        },
        pdf: {
            certificateTitle: 'CERTIFICATE OF AUTHORSHIP',
            auditSubtitle: 'OFFICIAL AUDIT RECORD',
            projectId: 'Project ID:',
            authorId: 'Author ID:',
            dateGenerated: 'Date Generated:',
            metricsTitle: 'CREATIVE ACTIVITY METRICS',
            totalActs: 'Total Acts',
            humanInjections: 'Injections (Human)',
            curation: 'Curation',
            structure: 'Structure',
            research: 'Research',
            auditTrailTitle: 'AUDIT TRAIL (IMMUTABLE)',
            footer: 'Verified by Titanium Creative Audit Service',
            humanInput: 'HUMAN INPUT'
        }
    }
};

export const getTranslation = (lang: string = 'es', category: string, key: string): string => {
    const l = BACKEND_TRANSLATIONS[lang] ? lang : 'es';
    return BACKEND_TRANSLATIONS[l]?.[category]?.[key] || key.toUpperCase();
};
