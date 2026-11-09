import { Language } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

export const getLocalizedFolderName = (name: string, language: Language): string => {
    if (!name) return name;

    const normalized = name.toUpperCase().trim();
    // Safety check in case translations for a language are incomplete
    const t = TRANSLATIONS[language]?.folderNames;

    if (!t) return name;

    switch (normalized) {
        case 'UNIVERSO': return t.universe || name;
        case 'PERSONAJES': return t.characters || name;
        case 'BESTIARIO': return t.bestiary || name;
        case 'MANUSCRITO': return t.manuscript || name;
        case 'EXTRAS': return t.extras || name;
        case 'RECURSOS': return t.resources || name;
        case 'OBJETOS': return (t as any).objects || name;
        // Nov 2026: en la interfaz, sin «.md» ni guiones bajos («Libro_01» → «Libro 01»).
        default: return name.replace(/\.md$/i, '').replace(/_/g, ' ');
    }
};
