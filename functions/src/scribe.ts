import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";

interface ScribeRequest {
    entityId: string;
    entityData: {
        name: string;
        type?: string;
        role?: string;
        aliases?: string[];
        tags?: string[];
        summary?: string; // For the blockquote
    };
    chatContent: string; // The "Perfil Psicológico"
    folderId: string;
    accessToken: string;
    sagaId?: string;
}

/**
 * THE SCRIBE (El Escriba)
 * Tallas la piedra con el conocimiento extraído, generando archivos .md perfectos para Obsidian/Nexus.
 */
export const scribeCreateFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        memory: "1GiB",
        timeoutSeconds: 120, // Drive IO + Firestore
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { entityId, entityData, chatContent, folderId, accessToken, sagaId } = request.data as ScribeRequest;

        // 1. VALIDATION
        if (!entityId || !entityData?.name || !folderId || !accessToken) {
            throw new HttpsError("invalid-argument", "Missing required fields (entityId, name, folderId, accessToken).");
        }

        const userId = request.auth.uid;
        const now = new Date().toISOString();
        const safeName = entityData.name.replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').trim();

        logger.info(`✍️ SCRIBE: Forging file for ${safeName} (${entityId})`);

        try {
            // 2. AUTO-LINKING INTELLIGENCE (Link existing anchors)
            let processedContent = chatContent || "Sin notas de sesión.";

            try {
                // Fetch Roster (Lightweight) - Only names
                const charsSnap = await db.collection("users").doc(userId).collection("characters").select("name").get();
                const knownNames = new Set<string>();

                charsSnap.forEach(doc => {
                    const n = doc.data().name;
                    if (n && n.toLowerCase() !== safeName.toLowerCase()) { // Don't self-link
                        knownNames.add(n);
                    }
                });

                // Simple Regex Replacement (Naive but effective for MVP)
                // Avoids linking inside existing links [[...]] or markdown links [...]
                // Strategy: Split by links, process text parts.
                // For simplicity/robustness in V1, we'll use a careful regex.
                // Matches exact words, case-insensitive logic but preserving case?
                // User asked for [[Name]]. Obsidian is usually case-insensitive but display text matters.
                // We will match the Name exactly as stored in DB or strict match in text?
                // Let's iterate names and replace found occurrences.

                // Sort by length desc to handle "Iron Man" before "Iron"
                const sortedNames = Array.from(knownNames).sort((a, b) => b.length - a.length);

                for (const name of sortedNames) {
                    if (name.length < 3) continue; // Skip short names to avoid noise

                    // Regex: Word boundary, name (case insensitive), word boundary.
                    // Negative lookahead/behind to avoid existing brackets is complex in JS regex without extensive logic.
                    // We'll trust the user isn't spamming links yet or use a simple heuristic.
                    // Heuristic: If we find the name and it's NOT surrounded by [[ ]], link it.

                    const regex = new RegExp(`(?<!\\[\\[)\\b(${escapeRegExp(name)})\\b(?!\\]\\])`, 'gi');
                    processedContent = processedContent.replace(regex, '[[$1]]');
                }

            } catch (linkError) {
                logger.warn("⚠️ Scribe Auto-Linker failed (non-blocking):", linkError);
            }

            // 3. GENERATE CONTENT (ANATOMY OF THE PERFECT FILE)

            // Frontmatter
            const frontmatter = [
                "---",
                `id: "${entityId}"`, // Persistent ID
                `type: "${entityData.type || 'character'}"`,
                `role: "${entityData.role || 'Unknown'}"`,
                `status: "ANCHOR"`,
                `aliases: ${JSON.stringify(entityData.aliases || [])}`,
                `created_at: "${now.split('T')[0]}"`,
                `tags:`,
                ...(entityData.tags || ['tdb/entity']).map(t => `  - ${t}`),
                "---"
            ].join("\n");

            // Body
            const fileBody = [
                `# ${entityData.name}`,
                "",
                entityData.summary ? `> *${entityData.summary.replace(/\n/g, ' ')}*` : "> *Entidad registrada por La Forja.*",
                "",
                "## 🧠 Perfil Psicológico",
                processedContent,
                ""
            ].join("\n");

            const fullContent = `${frontmatter}\n\n${fileBody}`;

            // 4. SAVE TO DRIVE (The Stone Tablet)
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            const fileName = `${safeName}.md`;

            const file = await drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [folderId],
                    mimeType: 'text/markdown'
                },
                media: {
                    mimeType: 'text/markdown',
                    body: fullContent
                },
                fields: 'id, name, webViewLink'
            });

            const newFileId = file.data.id;
            if (!newFileId) throw new Error("Drive failed to return ID.");

            logger.info(`   ✅ File created: ${newFileId}`);

            // 5. UPDATE FIRESTORE (The Registry)

            // A. Update Source (Radar)
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId).set({
                tier: 'ANCHOR',
                status: 'ANCHOR',
                driveId: newFileId,
                driveLink: file.data.webViewLink,
                lastSynced: FieldValue.serverTimestamp()
            }, { merge: true });

            // B. Update/Create Roster (The Character Sheet)
            const rosterId = safeName.toLowerCase().replace(/[^a-z0-9]/g, '-'); // Slug
            const rosterRef = db.collection("users").doc(userId).collection("characters").doc(rosterId);

            await rosterRef.set({
                id: rosterId,
                name: entityData.name,
                role: entityData.role || "Nuevo Personaje",
                tier: 'MAIN',
                status: 'EXISTING',
                sourceType: 'MASTER',
                sourceContext: sagaId || 'GLOBAL',
                masterFileId: newFileId,
                lastUpdated: now,
                isAIEnriched: true,
                tags: entityData.tags || [],
                aliases: entityData.aliases || []
            }, { merge: true });

            return {
                success: true,
                driveId: newFileId,
                rosterId: rosterId,
                message: "El Escriba ha documentado la entidad."
            };

        } catch (error: any) {
            logger.error("🔥 Error del Escriba:", error);
            throw new HttpsError("internal", error.message || "El Escriba falló al tallar la piedra.");
        }
    }
);

// Helper for Regex safety
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
