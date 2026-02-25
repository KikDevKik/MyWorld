import * as logger from "firebase-functions/logger";
import matter from 'gray-matter';
import { marked } from 'marked';
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

    // 🟢 HELPER: AST Metadata Extraction
    static extractMetadataFromBody(body: string): { name?: string, role?: string } {
        try {
            const tokens = marked.lexer(body);
            let name: string | undefined;
            let role: string | undefined;

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
            return { name, role };
        } catch (e) {
            logger.warn("⚠️ AST Extraction Failed:", e);
            return {};
        }
    }

    /**
     * Reconciles differences between the Original Content and the New Content (Draft).
     * @param fileId - The ID of the file (Nexus ID).
     * @param originalContent - The raw content before edit (for baseline comparison).
     * @param newContent - The raw content after AI/User edit.
     * @returns The final, crystallized Titanium content.
     */
    static reconcile(fileId: string, originalContent: string, newContent: string): string {
        try {
            const parsedNew = matter(newContent);
            const parsedOriginal = matter(originalContent);

            const newFm = parsedNew.data;
            const oldFm = parsedOriginal.data;
            const newBody = parsedNew.content;

            // A. DEBOUNCE CHECK
            // Check both Legacy and New _sys location
            const lastSyncStr = newFm._sys?.last_sync || newFm.last_titanium_sync;
            const lastSync = lastSyncStr ? new Date(lastSyncStr).getTime() : 0;
            const now = Date.now();
            const timeDiff = now - lastSync;

            if (timeDiff < 5000) {
                 logger.info(`⏳ [SMART-SYNC] Skipping reconciliation (Debounce: ${timeDiff}ms)`);
                 return newContent; // Return as-is if debounced
            }

            // B. AST EXTRACTION
            const { name: extractedName, role: extractedRole } = SmartSyncService.extractMetadataFromBody(newBody);
            let attributes = { ...newFm };
            let hasChanges = false;

            // C. DELTA LOGIC
            // Check if AI modified FM explicitly (comparing critical fields)
            const fmNameChanged = newFm.name !== oldFm.name;
            const fmRoleChanged = newFm.role !== oldFm.role;

            if (fmNameChanged || fmRoleChanged) {
                logger.info("⚡ [SMART-SYNC] Explicit Frontmatter change detected. Respecting change.");
                hasChanges = true;
                // We use the NEW FM values as truth.
            } else {
                // AI preserved FM (as instructed). Check if Body changed significantly to warrant sync.
                if (extractedName && extractedName !== newFm.name) {
                    attributes.name = extractedName;
                    hasChanges = true;
                    logger.info(`   -> Reconciling Name from Body: ${newFm.name} => ${extractedName}`);
                }
                if (extractedRole && extractedRole !== newFm.role) {
                    attributes.role = extractedRole;
                    hasChanges = true;
                    logger.info(`   -> Reconciling Role from Body: ${newFm.role} => ${extractedRole}`);
                }
            }

            // D. TITANIUM FACTORY FORGE
            // We always run it through factory to ensure schema & anti-makeup
            // Note: If no changes, we still might want to run it to ensure V3 schema if old file?
            // Yes, enforce V3.

            logger.info(`🔄 [METADATA RECONCILIATION] Re-Forging via TitaniumFactory for ${fileId}`);

            const entity: TitaniumEntity = {
                id: attributes.id || fileId, // Use attributes.id if present (legacy) or fileId (new)
                name: attributes.name || "Unknown",
                traits: attributes.traits || legacyTypeToTraits(attributes.type || 'concept'),
                attributes: attributes, // Factory will prune ghost data and handle _sys
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
