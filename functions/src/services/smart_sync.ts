import '../admin'; // Ensure firebase-admin is initialized
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

    /**
     * 🟢 BLOCKQUOTE PARSER (Metadata V3)
     * Scans the Markdown body for the FIRST blockquote ( > ... )
     * and extracts `**Key**: Value` pairs.
     * This blockquote is the SOURCE OF TRUTH for user-editable metadata.
     */
    static parseBlockquoteMetadata(body: string): Record<string, any> {
        try {
            const tokens = marked.lexer(body);
            const kvPairs: Record<string, any> = {};
            let name: string | undefined;

            // 1. Extract Name (First H1)
            for (const token of tokens) {
                if (token.type === 'heading' && token.depth === 1 && !name) {
                    name = token.text.trim();
                    break;
                }
            }

            // 2. Find the Metadata Block (First Blockquote)
            let metadataBlockToken = null;
            for (const token of tokens) {
                if (token.type === 'blockquote') {
                    metadataBlockToken = token;
                    break; // Only parse the FIRST blockquote as metadata
                }
            }

            if (metadataBlockToken && metadataBlockToken.text) {
                const lines = metadataBlockToken.text.split('\n');
                // Regex for **Key**: Value
                // Supports **Role**: Value or **Role:** Value
                const kvRegex = /^\s*\*\*([a-zA-Z0-9\sÁÉÍÓÚÑáéíóúñ]+)\*\*:\s*(.+)$/;

                for (const line of lines) {
                    const cleanLine = line.trim();
                    const match = cleanLine.match(kvRegex);
                    if (match) {
                        const key = match[1].toLowerCase().trim();
                        const value = match[2].trim();

                        if (['alias', 'aliases', 'apodos'].includes(key)) {
                            kvPairs.aliases = value.split(/[,;]/).map(s => s.trim());
                        } else if (['tags', 'etiquetas'].includes(key)) {
                            kvPairs.tags = value.split(/[,;]/).map(s => s.trim().replace(/^#/, ''));
                        } else if (['role', 'rol', 'cargo'].includes(key)) {
                            kvPairs.role = value;
                        } else {
                            // Dynamic attributes
                            const safeKey = key.replace(/[^a-z0-9_]/g, '');
                            if (safeKey.length > 0) kvPairs[safeKey] = value;
                        }
                    }
                }
            }

            return { name, ...kvPairs };

        } catch (e) {
            logger.warn("⚠️ Metadata Block Parsing Failed:", e);
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

            let storedHash = null;
            if (!indexQuery.empty) {
                const indexDoc = indexQuery.docs[0];
                storedHash = indexDoc.data().contentHash;

                if (storedHash === incomingHash) {
                     logger.info(`🛡️ [GUARDIAN HASH] Content unchanged (${incomingHash}). Skipping reconciliation.`);
                     return newContent; // Return as-is
                }
            }

            // B. PARSE NEW CONTENT
            const parsedNew = matter(newContent);
            const newFm = parsedNew.data;
            const newBody = parsedNew.content;

            // C. EXTRACT METADATA FROM BODY (The Human Interface)
            const extractedMeta = SmartSyncService.parseBlockquoteMetadata(newBody);
            let attributes = { ...newFm };
            let hasChanges = false;

            // D. DELTA LOGIC (Bi-Directional Sync)
            // 1. Body -> YAML: Update YAML if Body metadata block has newer/different values
            Object.keys(extractedMeta).forEach(key => {
                const bodyVal = extractedMeta[key];
                const fmVal = newFm[key];

                if (bodyVal !== undefined && JSON.stringify(bodyVal) !== JSON.stringify(fmVal)) {
                     attributes[key] = bodyVal;
                     hasChanges = true;
                     logger.info(`   -> Sync: Updated YAML '${key}' from Body Blockquote.`);
                }
            });

            // 2. YAML -> Body: If YAML changed (e.g. by AI or code), it will be reflected in the Body by TitaniumFactory.forge
            // But we must preserve the REST of the attributes that are NOT in the body block.

            // E. TITANIUM FACTORY FORGE
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
                attributes._sys.nexus_id = nexusId;
                attributes._sys.last_sync = new Date().toISOString();
            }

            const entity: TitaniumEntity = {
                id: nexusId,
                name: attributes.name || "Unknown",
                // If traits are in YAML, use them. Else infer from legacy type.
                traits: attributes.traits || legacyTypeToTraits(attributes.type || 'concept'),
                attributes: attributes as any,
                bodyContent: newBody
            };

            // 🟢 TITANIUM 3.0 FORGE
            const forgedContent = TitaniumFactory.forge(entity);

            // F. UPDATE HASH (Pre-Cache Truth)
            // We update TDB_Index immediately to prevent race conditions with Soul Sorter
            if (!indexQuery.empty) {
                const indexDoc = indexQuery.docs[0];
                const newHash = crypto.createHash('sha256').update(forgedContent).digest('hex');
                await indexDoc.ref.update({
                    contentHash: newHash,
                    lastUpdated: new Date().toISOString()
                });
            }

            return forgedContent;

        } catch (syncErr) {
            logger.warn(`⚠️ [SMART-SYNC] Failed to reconcile:`, syncErr);
            return newContent; // Fallback to raw content if sync fails
        }
    }
}
