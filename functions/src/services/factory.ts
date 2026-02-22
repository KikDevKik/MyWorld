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

        // 2. Prune Status (Moved to _sys, delete from root if present)
        if (clean.status) delete clean.status;

        // 3. Prune Role (If unknown)
        if (clean.role && ['unknown', 'desconocido', 'entidad registrada'].includes(norm(clean.role))) {
            delete clean.role;
        }

        // 4. Prune Tier (Moved to _sys, delete from root if present)
        if (clean.tier) delete clean.tier;

        // 5. Prune Legacy Timestamps (Moved to _sys)
        if (clean.last_titanium_sync) delete clean.last_titanium_sync;
        if (clean.last_updated) delete clean.last_updated;
        if (clean.created_at) delete clean.created_at;

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

        // Extract system fields from input or defaults
        const sysStatus = entity.attributes._sys?.status || entity.attributes.status || 'active';
        const sysTier = entity.attributes._sys?.tier || entity.attributes.tier || 'ANCHOR';
        const sysLastSync = entity.attributes._sys?.last_sync || now;

        const rawAttributes = {
            ...entity.attributes,
            id: entity.id,         // Nexus ID (Critical for Linking)
            name: entity.name,     // Canonical Name
            type: legacyType,      // 🛡️ COMPATIBILITY SHIELD
            traits: entity.traits, // 🚀 TITANIUM NATIVE

            // 🟢 SYSTEM METADATA (Hidden in RAG, Visible for System)
            _sys: {
                status: sysStatus,
                tier: sysTier,
                last_sync: sysLastSync
            }
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
