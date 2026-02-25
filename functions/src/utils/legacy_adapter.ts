import { EntityTrait } from '../types/ontology';

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 2)
 * This adapter maps the new Functional Ontology (Traits) back to the legacy 'type' string.
 * It is required until 'soul_sorter' and 'forge_scan' are fully refactored.
 */
export function traitsToLegacyType(traits: EntityTrait[]): string {
    // 🟢 HEURISTIC: Creatures are both Sentient (Agency) and Tangible (Beast/Monster)
    // Characters are primarily Sentient (Agency).
    if (traits.includes('sentient') && traits.includes('tangible')) return 'creature';

    if (traits.includes('sentient')) return 'character';
    if (traits.includes('organized')) return 'faction';
    if (traits.includes('locatable')) return 'location';
    if (traits.includes('tangible')) return 'object'; // or artifact
    if (traits.includes('temporal')) return 'event';
    return 'concept'; // Default Fallback
}

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 2)
 * Maps traits to the old Firestore collection categories (PERSON, LOCATION, etc.)
 * Used by 'syncCharacterManifest' and 'ingestFile'.
 */
export function traitsToLegacyCategory(traits: EntityTrait[]): string {
    if (traits.includes('sentient') && traits.includes('tangible')) return 'BESTIARY'; // Heuristic
    if (traits.includes('sentient')) return 'PERSON';
    if (traits.includes('organized')) return 'FACTION';
    if (traits.includes('locatable')) return 'LOCATION';
    if (traits.includes('tangible')) return 'ITEM';
    return 'UNKNOWN';
}

/**
 * @deprecated - MIGRATION SHIELD (TITANIUM PHASE 2)
 * Reverse mapping for Entry Points (Scribe/Builder) that still receive legacy strings.
 */
export function legacyTypeToTraits(type: string): EntityTrait[] {
    const t = type.toLowerCase().trim();
    if (['character', 'person', 'sentient', 'npc'].includes(t)) return ['sentient'];
    if (['location', 'place', 'world'].includes(t)) return ['locatable'];
    if (['object', 'item', 'artifact'].includes(t)) return ['tangible'];

    // Creatures are physical and have agency
    if (['creature', 'beast', 'monster'].includes(t)) return ['tangible', 'sentient'];

    if (['faction', 'group', 'organization'].includes(t)) return ['organized'];
    if (['event', 'scene', 'chapter'].includes(t)) return ['temporal'];
    return ['abstract'];
}
