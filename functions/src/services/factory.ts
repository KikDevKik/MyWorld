import * as yaml from 'js-yaml';
import { TitaniumEntity, EntityTrait } from '../types/ontology';
import { traitsToLegacyType } from '../utils/legacy_adapter';

/**
 * 🏭 TITANIUM FACTORY (La Fundición Única)
 * Single Source of Truth for file generation.
 * Enforces the "Functional Ontology" while maintaining backward compatibility.
 */
export class TitaniumFactory {

    /**
     * ANTI-MAKEUP POLICY (Protocolo de Limpieza)
     * Removes "Ghost Data" that consumes tokens without adding value.
     */
    private static pruneGhostMetadata(attributes: any): any {
        const clean = { ...attributes };
        const norm = (v: any) => typeof v === 'string' ? v.toLowerCase().trim() : String(v);

        // 1. Prune Age (Ruido puro)
        if (clean.age && ['unknown', 'desconocida', 'desconocido'].includes(norm(clean.age))) {
            delete clean.age;
        }

        // 2. Prune Status (Default is always active)
        if (clean.status && ['active'].includes(norm(clean.status))) {
            delete clean.status;
        }

        // 3. Prune Role (If unknown)
        if (clean.role && ['unknown', 'desconocido'].includes(norm(clean.role))) {
            delete clean.role;
        }

        // 4. Prune Tier (Default is ANCHOR)
        if (clean.tier && ['anchor'].includes(norm(clean.tier))) {
            delete clean.tier;
        }

        return clean;
    }

    /**
     * Forges a Unified Titanium File (Markdown + YAML).
     * Automatically applies the "Legacy Adapter" and "Anti-Makeup" policies.
     */
    static forge(entity: TitaniumEntity): string {
        const now = new Date().toISOString();

        // 1. LEGACY ADAPTER: Map Traits to Old 'Type'
        const legacyType = traitsToLegacyType(entity.traits);

        // 2. PREPARE ATTRIBUTES (Merge & Override)
        // We start with the entity's dynamic attributes, then overlay the Sovereign Fields.
        const rawAttributes = {
            ...entity.attributes,
            id: entity.id,         // Nexus ID (Critical for Linking)
            name: entity.name,     // Canonical Name
            type: legacyType,      // 🛡️ COMPATIBILITY SHIELD
            traits: entity.traits, // 🚀 TITANIUM NATIVE
            // Timestamps
            created_at: entity.attributes.created_at || now,
            last_updated: now,
            last_titanium_sync: now // 🛡️ SMART-SYNC DEBOUNCE
        };

        // 3. APPLY ANTI-MAKEUP (Pruning)
        const finalAttributes = TitaniumFactory.pruneGhostMetadata(rawAttributes);

        // 4. CLEANUP UNDEFINED/NULL (Final Sanity Check)
        Object.keys(finalAttributes).forEach(key => {
            if (finalAttributes[key] === undefined || finalAttributes[key] === null) {
                delete finalAttributes[key];
            }
        });

        // 5. GENERATE YAML
        // schema: JSON_SCHEMA ensures compatibility with most parsers
        const yamlBlock = yaml.dump(finalAttributes, { lineWidth: -1, schema: yaml.JSON_SCHEMA }).trim();

        // 6. ASSEMBLE
        return `---\n${yamlBlock}\n---\n\n${entity.bodyContent}`;
    }
}
