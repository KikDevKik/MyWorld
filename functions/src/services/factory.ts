import * as yaml from 'js-yaml';

export type TitaniumTrait = 'sentient' | 'location' | 'artifact' | 'concept' | 'event' | 'creature';

export interface TitaniumEntity {
    id: string;
    name: string;
    traits: TitaniumTrait[];
    attributes: Record<string, any>;
    bodyContent: string;
    projectId?: string;
}

/**
 * 🏭 TITANIUM FACTORY (La Fundición Única)
 * Single Source of Truth for file generation.
 * Enforces the "Functional Ontology" while maintaining backward compatibility.
 */
export class TitaniumFactory {

    /**
     * Forges a Unified Titanium File (Markdown + YAML).
     * Automatically applies the "Legacy Adapter" to ensure compatibility with Soul Sorter.
     */
    static forge(entity: TitaniumEntity): string {
        const now = new Date().toISOString();

        // 1. LEGACY ADAPTER: Map Traits to Old 'Type'
        // This ensures 'analyzeForgeBatch' and 'soul_sorter' still see what they expect.
        let legacyType = 'concept';
        if (entity.traits.includes('sentient')) legacyType = 'character';
        else if (entity.traits.includes('creature')) legacyType = 'creature';
        else if (entity.traits.includes('location')) legacyType = 'location';
        else if (entity.traits.includes('artifact')) legacyType = 'object';
        else if (entity.traits.includes('event')) legacyType = 'event';

        // 2. CONSTRUCT FRONTMATTER
        // We flatten attributes into the root for compatibility, but also keep 'traits'.
        // Priority: Explicit attributes override automatic defaults.
        const frontmatter: any = {
            id: entity.id,
            name: entity.name,
            type: legacyType, // 🛡️ COMPATIBILITY SHIELD
            traits: entity.traits, // 🚀 TITANIUM NATIVE
            tier: 'ANCHOR', // Default to Anchor for forged files
            status: 'active', // Default
            created_at: now,
            last_updated: now,
            last_titanium_sync: now, // 🛡️ SMART-SYNC DEBOUNCE
            ...entity.attributes // 🛡️ FLATTENED ATTRIBUTES (e.g. role, age)
        };

        // Ensure critical legacy fields exist if missing
        if (!frontmatter.role && legacyType === 'character') frontmatter.role = "Unknown";
        if (entity.projectId) frontmatter.project_id = entity.projectId;

        // 3. CLEANUP UNDEFINED
        Object.keys(frontmatter).forEach(key => {
            if (frontmatter[key] === undefined || frontmatter[key] === null) {
                delete frontmatter[key];
            }
        });

        // 4. GENERATE MARKDOWN
        // Use js-yaml for safe dumping
        const yamlBlock = yaml.dump(frontmatter, { lineWidth: -1 }).trim();

        // 5. ASSEMBLE
        return `---\n${yamlBlock}\n---\n\n${entity.bodyContent}`;
    }
}
