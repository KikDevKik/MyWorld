import { EntityTrait } from '../types/ontology';

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 1)
 * This adapter maps the new Functional Ontology (Traits) back to the legacy 'type' string.
 * It is required until 'soul_sorter' and 'forge_scan' are fully refactored.
 */
export function traitsToLegacyType(traits: EntityTrait[]): string {
    if (traits.includes('sentient')) return 'character';
    if (traits.includes('creature')) return 'creature'; // or 'beast' depending on usage
    if (traits.includes('faction')) return 'faction';
    if (traits.includes('location')) return 'location';
    if (traits.includes('artifact')) return 'object';
    if (traits.includes('event')) return 'event';
    return 'concept'; // Default Fallback
}

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 1)
 * Maps traits to the old Firestore collection categories (PERSON, LOCATION, etc.)
 * Used by 'syncCharacterManifest' and 'ingestFile'.
 */
export function traitsToLegacyCategory(traits: EntityTrait[]): string {
    if (traits.includes('sentient')) return 'PERSON';
    if (traits.includes('creature')) return 'BESTIARY'; // approximate
    if (traits.includes('faction')) return 'FACTION'; // approximate
    if (traits.includes('location')) return 'LOCATION';
    if (traits.includes('artifact')) return 'ITEM';
    return 'UNKNOWN';
}

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 1)
 * Reverse mapping for Entry Points (Scribe/Builder) that still receive legacy strings.
 */
export function legacyTypeToTraits(type: string): EntityTrait[] {
    const t = type.toLowerCase().trim();
    if (['character', 'person', 'sentient', 'npc'].includes(t)) return ['sentient'];
    if (['location', 'place', 'world'].includes(t)) return ['location'];
    if (['object', 'item', 'artifact'].includes(t)) return ['artifact'];
    if (['creature', 'beast', 'monster'].includes(t)) return ['creature', 'sentient']; // Often beasts have agency
    if (['faction', 'group', 'organization'].includes(t)) return ['faction'];
    if (['event', 'scene'].includes(t)) return ['event'];
    return ['concept'];
}
