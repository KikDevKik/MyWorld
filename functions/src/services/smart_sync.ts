import * as logger from "firebase-functions/logger";
import matter from 'gray-matter';
import { marked } from 'marked';
import * as crypto from 'crypto';
import { getFirestore } from "firebase-admin/firestore";
import { TitaniumFactory } from "./factory";
import { TitaniumEntity } from "../types/ontology";
import { legacyTypeToTraits } from "../utils/legacy_adapter";

/**
 * 🧠 SMART SYNC SERVICE (Middleware 3.0)
 * Centralizes the reconciliation logic between Markdown Body and YAML Frontmatter.
 * Ensures "Bi-Directional Integrity" and protects Sovereign Areas.
 */
export class SmartSyncService {

    // 🛡️ SOVEREIGN AREAS PROTECTION
    static protectSovereignAreas(content: string): { protectedContent: string, map: Map<string, string> } {
        const map = new Map<string, string>();
        let counter = 0;

        // Regex for <!-- SOVEREIGN START --> ... <!-- SOVEREIGN END -->
        // Case insensitive, allowing multiline
        const protectedContent = content.replace(
            /<!--\s*SOVEREIGN START\s*-->([\s\S]*?)<!--\s*SOVEREIGN END\s*-->/gi,
            (match) => {
                const placeholder = `{{SOVEREIGN_BLOCK_${counter++}}}`;
                map.set(placeholder, match);
                return placeholder;
            }
        );

        return { protectedContent, map };
    }

    static restoreSovereignAreas(content: string, map: Map<string, string>): string {
        let restored = content;
        map.forEach((originalBlock, placeholder) => {
            restored = restored.replace(placeholder, originalBlock);
        });
        return restored;
    }

    // 🟢 HELPER: AST Metadata Extraction (Deep Sync)
    static extractMetadataFromBody(body: string): Record<string, any> {
        try {
            const tokens = marked.lexer(body);
            let name: string | undefined;
            let role: string | undefined;

            // 1. Structural Extraction (H1, Blockquote)
            for (const token of tokens) {
                // Extract Name (First H1)
                if (token.type === 'heading' && token.depth === 1 && !name) {
                    name = token.text.trim();
                }

                // Extract Role (First Blockquote with Emphasis)
                if (token.type === 'blockquote' && !role) {
                    if (token.tokens) {
                        for (const subToken of token.tokens) {
                            if (subToken.type === 'paragraph' && subToken.tokens) {
                                for (const inline of subToken.tokens) {
                                    if (inline.type === 'em') {
                                        role = inline.text.trim();
                                        break;
                                    }
                                }
                            }
                            if (role) break;
                        }
                    }
                }

                if (name && role) break;
            }

            // 2. Key-Value Extraction (Deep Sync)
            const kvPairs: Record<string, any> = {};
            const lines = body.split('\n');
            // Regex for **Key**: Value (ignoring list markers, supports Spanish accents)
            const kvRegex = /^[\-\*\s]*\*\*([a-zA-Z0-9\sÁÉÍÓÚÑáéíóúñ]+)\*\*:\s*(.+)$/;

            for (const line of lines) {
                const match = line.match(kvRegex);
                if (match) {
                    const key = match[1].toLowerCase().trim();
                    const value = match[2].trim();

                    // Map common keys to schema
                    if (['alias', 'aliases', 'apodos'].includes(key)) {
                        kvPairs.aliases = value.split(/[,;]/).map(s => s.trim());
                    } else if (['tags', 'etiquetas'].includes(key)) {
                        kvPairs.tags = value.split(/[,;]/).map(s => s.trim());
                    } else if (['role', 'rol', 'cargo'].includes(key)) {
                        if (!role) role = value; // Override if not found in blockquote
                        kvPairs.role = value;
                    } else {
                        // Dynamic attributes (Generic)
                        // Only allow alphanumeric keys to prevent injection
                        const safeKey = key.replace(/[^a-z0-9_]/g, '');
                        if (safeKey.length > 0) kvPairs[safeKey] = value;
                    }
                }
            }

            return { name, role, ...kvPairs };
        } catch (e) {
            logger.warn("⚠️ AST Extraction Failed:", e);
            return {};
        }
    }

    /**
     * Reconciles differences between the Original Content and the New Content (Draft).
     * 🟢 GUARDIAN HASH: Checks Firestore before applying changes to prevent Echo Loops.
     * @param userId - The User ID (for TDB_Index lookup).
     * @param fileId - The Drive ID of the file.
     * @param originalContent - The raw content before edit.
     * @param newContent - The raw content after AI/User edit.
     */
    static async reconcile(userId: string, fileId: string, originalContent: string, newContent: string): Promise<string> {
        const db = getFirestore();
        try {
            // A. GUARDIAN HASH CHECK (Echo Shield)
            const incomingHash = crypto.createHash('sha256').update(newContent).digest('hex');

            // Query TDB_Index by driveId to find the current hash
            const indexQuery = await db.collection("TDB_Index").doc(userId).collection("files")
                .where("driveId", "==", fileId).limit(1).get();

            if (!indexQuery.empty) {
                const indexDoc = indexQuery.docs[0];
                const storedHash = indexDoc.data().contentHash;

                if (storedHash === incomingHash) {
                     logger.info(`🛡️ [GUARDIAN HASH] Content unchanged (${incomingHash}). Skipping reconciliation.`);
                     return newContent; // Return as-is, caller should ideally abort upload if identical
                }
            }

            const parsedNew = matter(newContent);

            // Use original Frontmatter as base if new parsing fails or is empty?
            // Usually matter returns empty object if no FM.
            const newFm = parsedNew.data;
            const newBody = parsedNew.content;

            // B. AST EXTRACTION (Deep Sync)
            const extractedMeta = SmartSyncService.extractMetadataFromBody(newBody);
            let attributes = { ...newFm };
            let hasChanges = false;

            // C. DELTA LOGIC (Text Sovereignty)
            // If Text defines a value, it overrides FM unless FM was explicitly changed by AI (which we assume happens in newFm).
            // Actually, we treat Text as the Source of Truth for these fields during reconciliation.

            Object.keys(extractedMeta).forEach(key => {
                const bodyVal = extractedMeta[key];
                const fmVal = newFm[key];

                // If Body has value and it differs from FM
                if (bodyVal !== undefined && JSON.stringify(bodyVal) !== JSON.stringify(fmVal)) {
                     attributes[key] = bodyVal;
                     hasChanges = true;
                     logger.info(`   -> Deep Sync: Updated ${key} from Body: ${JSON.stringify(bodyVal)}`);
                }
            });

            // D. TITANIUM FACTORY FORGE
            logger.info(`🔄 [METADATA RECONCILIATION] Re-Forging via TitaniumFactory for ${fileId}`);

            const nexusId = attributes.nexus_id || attributes._sys?.nexus_id || crypto.createHash('sha256').update(fileId).digest('hex');

            // Ensure _sys exists for strict typing
            if (!attributes._sys) {
                attributes._sys = {
                    status: 'active',
                    tier: 'ANCHOR',
                    last_sync: new Date().toISOString(),
                    schema_version: '3.0',
                    nexus_id: nexusId
                };
            } else {
                attributes._sys.nexus_id = nexusId; // Ensure ID consistency
            }

            const entity: TitaniumEntity = {
                id: nexusId,
                name: attributes.name || "Unknown",
                traits: attributes.traits || legacyTypeToTraits(attributes.type || 'concept'),
                attributes: attributes as any, // Cast to allow dynamic fields while satisfying interface
                bodyContent: newBody
            };

            // 🟢 TITANIUM 3.0 FORGE
            return TitaniumFactory.forge(entity);

        } catch (syncErr) {
            logger.warn(`⚠️ [SMART-SYNC] Failed to reconcile:`, syncErr);
            return newContent; // Fallback to AI content
        }
    }
}
