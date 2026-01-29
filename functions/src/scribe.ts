import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as crypto from 'crypto';
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { generateAnchorContent, AnchorTemplateData } from "./templates/forge";
import { resolveVirtualPath } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface ScribeRequest {
    entityId: string; // The Concept ID (Slug)
    entityData: {
        name: string;
        type?: string;
        role?: string;
        aliases?: string[];
        tags?: string[];
        summary?: string;
    };
    chatContent: string;
    folderId: string;
    accessToken: string;
    sagaId?: string;
}

interface ScribePatchRequest {
    fileId: string;
    patchContent: string;
    accessToken: string;
    instructions?: string;
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
        // Clean name for filesystem
        const safeName = entityData.name.replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').trim();
        const fileName = `${safeName}.md`;

        logger.info(`✍️ SCRIBE: Forging file for ${safeName} (${entityId})`);

        try {
            // 🟢 INTELLIGENT INFERENCE (If type is generic/missing)
            if ((!entityData.type || entityData.type === 'concept') && chatContent) {
                try {
                    logger.info(`🧠 SCRIBE INFERENCE: Detecting type for ${entityData.name}`);
                    const genAI = new GoogleGenerativeAI(googleApiKey.value());
                    const model = genAI.getGenerativeModel({
                        model: MODEL_LOW_COST,
                        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                    });

                    const inferencePrompt = `
                    TASK: Classify the Entity described in the text.
                    ENTITY NAME: "${entityData.name}"
                    CONTEXT: "${chatContent.substring(0, 5000)}"

                    VALID TYPES:
                    - 'character': Person, AI, sentient being.
                    - 'location': Place, city, planet, building.
                    - 'faction': Group, organization, guild.
                    - 'object': Item, weapon, artifact.
                    - 'event': Historical event, scene.
                    - 'lore': History, myth, legend.
                    - 'concept': Magic system, law, philosophy.

                    OUTPUT JSON:
                    {
                      "type": "character" | "location" | "faction" | "object" | "event" | "lore" | "concept",
                      "role": "Short 3-5 word role description (e.g. 'Main Protagonist', 'Ancient Sword')"
                    }
                    `;

                    const result = await model.generateContent(inferencePrompt);
                    const inference = parseSecureJSON(result.response.text(), "ScribeInference");

                    if (inference.type) {
                        entityData.type = inference.type;
                        logger.info(`   -> Inferred Type: ${inference.type}`);
                    }
                    if (inference.role && (!entityData.role || entityData.role === 'Unknown')) {
                        entityData.role = inference.role;
                        logger.info(`   -> Inferred Role: ${inference.role}`);
                    }

                } catch (e) {
                    logger.warn("⚠️ Scribe Inference Failed:", e);
                    // Fallback to defaults
                }
            }

            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 2. NEXUS IDENTITY PROTOCOL (Trace Path)
            logger.info("   -> Tracing lineage...");
            const folderPath = await resolveVirtualPath(drive, folderId);
            const fullVirtualPath = `${folderPath}/${fileName}`;

            // Generate Deterministic ID
            const nexusId = crypto.createHash('sha256').update(fullVirtualPath).digest('hex');
            logger.info(`   -> Deterministic Nexus ID: ${nexusId}`);

            // 3. GENERATE CONTENT (Unified Template Engine)
            // Auto-link logic could go here if needed, but keeping it simple for now.

            const templateData: AnchorTemplateData = {
                id: nexusId, // 🟢 NEXUS COMPLIANT
                name: entityData.name,
                type: (entityData.type as any) || 'character',
                role: entityData.role || 'Unknown',
                description: chatContent || entityData.summary || "Generado por El Escriba.",
                aliases: entityData.aliases || [],
                tags: entityData.tags || ['tdb/entity'],
                project_id: sagaId, // Optional context
                status: 'active'
            };

            const fullContent = generateAnchorContent(templateData);

            // 4. SAVE TO DRIVE
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

            logger.info(`   ✅ File created in Drive: ${newFileId}`);

            // 5. UPDATE FIRESTORE (The Registry)

            // A. Pre-Inject TDB_Index (Prevent Phantom Nodes)
            await db.collection("TDB_Index").doc(userId).collection("files").doc(nexusId).set({
                name: fileName,
                path: fullVirtualPath,
                driveId: newFileId,
                lastIndexed: new Date().toISOString(),
                contentHash: crypto.createHash('sha256').update(fullContent).digest('hex'),
                category: 'canon',
                isGhost: false,
                smartTags: ['CREATED_BY_SCRIBE']
            });

            // B. Update Source (Radar) - Using the Concept ID (entityId/slug)
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId).set({
                tier: 'ANCHOR',
                status: 'ANCHOR',
                driveId: newFileId,
                driveLink: file.data.webViewLink,
                lastSynced: FieldValue.serverTimestamp()
            }, { merge: true });

            // C. Update/Create Roster (The Character Sheet)
            // Slugify logic consistent with previous code
            const rosterId = safeName.toLowerCase().replace(/[^a-z0-9]/g, '-');
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
                lastUpdated: new Date().toISOString(),
                isAIEnriched: true,
                tags: entityData.tags || [],
                aliases: entityData.aliases || [],
                nexusId: nexusId // 🟢 Link to TDB Index
            }, { merge: true });

            return {
                success: true,
                driveId: newFileId,
                rosterId: rosterId,
                nexusId: nexusId,
                message: "El Escriba ha documentado la entidad."
            };

        } catch (error: any) {
            logger.error("🔥 Error del Escriba:", error);
            throw new HttpsError("internal", error.message || "El Escriba falló al tallar la piedra.");
        }
    }
);

/**
 * THE SMART PATCH (El Restaurador)
 * Intelligent merging of new insights into existing records.
 */
export const scribePatchFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        memory: "1GiB",
        timeoutSeconds: 60, // Drive IO + AI + Drive IO
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { fileId, patchContent, accessToken, instructions } = request.data as ScribePatchRequest;

        if (!fileId || !patchContent || !accessToken) {
            throw new HttpsError("invalid-argument", "Missing required fields.");
        }

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. FETCH ORIGINAL CONTENT
            const getRes = await drive.files.get({
                fileId: fileId,
                alt: 'media'
            });
            const originalContent = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data);

            // 2. AI MERGE
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST, // Flash is fine for merging
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: { temperature: TEMP_PRECISION }
            });

            const prompt = `
            ACT AS: Expert Markdown Editor & Archivist.
            TASK: Integrate the "New Patch" into the "Existing File" intelligently.

            INSTRUCTIONS:
            ${instructions || "Find the most relevant section for this new information and append it. If no relevant section exists, create a new H2 header."}

            RULES:
            1. PRESERVE Frontmatter (--- ... ---) exactly as is.
            2. PRESERVE existing content. Only append or insert. Do not delete.
            3. OUTPUT the FULL, VALID Markdown file content.
            4. Do NOT wrap output in \`\`\`markdown code blocks. Return RAW text.

            EXISTING FILE:
            ${originalContent}

            NEW PATCH:
            ${patchContent}
            `;

            const result = await model.generateContent(prompt);
            let newContent = result.response.text();

            // Cleanup potential markdown fences if model ignores rule 4
            if (newContent.startsWith('```markdown')) newContent = newContent.replace(/^```markdown\n/, '').replace(/\n```$/, '');
            if (newContent.startsWith('```')) newContent = newContent.replace(/^```\n/, '').replace(/\n```$/, '');

            // 3. UPDATE FILE
            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'text/markdown',
                    body: newContent
                }
            });

            return { success: true, message: "Archivo actualizado (Cristalizado)." };

        } catch (error: any) {
            logger.error("🔥 Error del Restaurador (Patch):", error);
            throw new HttpsError("internal", error.message || "Fallo al actualizar el archivo.");
        }
    }
);
