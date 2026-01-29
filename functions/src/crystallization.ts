import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import * as crypto from 'crypto';
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { parseSecureJSON } from "./utils/json";
import { generateAnchorContent, AnchorTemplateData } from "./templates/forge";
import { resolveVirtualPath } from "./utils/drive";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

interface CrystallizeGraphRequest {
    nodes: Array<{
        id: string;
        name: string;
        type: string;
        description: string;
        [key: string]: any;
    }>;
    folderId: string;
    subfolderName?: string; // Optional subfolder creation
    accessToken: string;
    chatContext?: string; // The conversation history
    projectId: string;
    mode?: 'RIGOR' | 'ENTROPIA' | 'FUSION'; // 🟢 NEW
}

export const crystallizeGraph = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        timeoutSeconds: 540, // 9 minutes for batch processing
        secrets: [googleApiKey],
        memory: "1GiB",
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { nodes, folderId, subfolderName, accessToken, chatContext, projectId, mode = 'FUSION' } = request.data as CrystallizeGraphRequest;

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            throw new HttpsError("invalid-argument", "No nodes provided to crystallize.");
        }
        if (!folderId) throw new HttpsError("invalid-argument", "Target folder ID is required.");
        if (!accessToken) throw new HttpsError("unauthenticated", "Google Access Token is required.");

        const userId = request.auth.uid;
        const genAI = new GoogleGenerativeAI(googleApiKey.value());
        const model = genAI.getGenerativeModel({
            model: MODEL_LOW_COST,
            safetySettings: SAFETY_SETTINGS_PERMISSIVE,
            generationConfig: {
                temperature: mode === 'RIGOR' ? 0.3 : mode === 'ENTROPIA' ? 0.9 : 0.6,
            } as any
        });

        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

        // 🟢 RESOLVE TARGET FOLDER (Subfolder Logic)
        let targetFolderId = folderId;
        if (subfolderName) {
            try {
                const q = `'${folderId}' in parents and name = '${subfolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                const list = await drive.files.list({ q, fields: 'files(id)' });

                if (list.data.files && list.data.files.length > 0) {
                    targetFolderId = list.data.files[0].id!;
                } else {
                    const newFolder = await drive.files.create({
                        requestBody: {
                            name: subfolderName,
                            parents: [folderId],
                            mimeType: 'application/vnd.google-apps.folder'
                        },
                        fields: 'id'
                    });
                    if (newFolder.data.id) {
                        targetFolderId = newFolder.data.id;
                    }
                }
            } catch (folderErr) {
                logger.warn(`Failed to resolve subfolder ${subfolderName}, falling back to parent.`, folderErr);
            }
        }

        // 🟢 1. TRACE PATH ONCE (For Nexus Protocol)
        let virtualPathRoot = "";
        try {
            virtualPathRoot = await resolveVirtualPath(drive, targetFolderId);
        } catch (e) {
            logger.warn("Failed to resolve virtual path for graph crystallization.", e);
            virtualPathRoot = "Unknown_Graph_Path";
        }

        let successCount = 0;
        let failCount = 0;
        const createdFiles: Array<{ id: string; name: string }> = [];
        const failedFiles: Array<{ name: string; error: string }> = []; // 🟢 NEW

        // BATCH PROCESSING (3 at a time)
        const BATCH_SIZE = 3;
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
            const batch = nodes.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (node) => {
                try {
                    // 1. GENERATE CONTENT (AI) WITH MODE LOGIC
                    const prompt = `
                        ACT AS: Expert Lore Writer & Archivist.
                        TASK: Create a comprehensive Markdown file for the entity "${node.name}" (${node.type}).

                        CONTEXT FROM BUILDER SESSION:
                        ${chatContext || "No specific session context provided."}

                        ENTITY DATA:
                        Name: ${node.name}
                        Type: ${node.type}
                        Description: ${node.description}

                        === ANALYSIS PROTOCOL (CRITICAL) ===
                        1. **FACTION AMBIGUITY CHECK:**
                           - If type is 'faction' or 'group', ANALYZE the description/context.
                           - Is this a MILITARY/POLITICAL faction (e.g., Army, Rebels, Cult)? -> Tone: Serious, Tactical, Political.
                           - Is this a SOCIAL GROUP/CLUB (e.g., Music Club, Study Group, Band)? -> Tone: Slice of Life, Informal, Personal.
                           - **Correction:** If the type 'faction' feels wrong for a small group, you may suggest a subtype in your analysis, but write the content matching the TRUE nature of the group.

                        === MODE: ${mode} ===
                        ${mode === 'RIGOR'
                            ? "- STRICT ADHERENCE to facts. DO NOT invent plots not present in context.\n- Logical consistency is paramount.\n- If details are missing, state them as 'Unknown' rather than fabricating."
                            : mode === 'ENTROPIA'
                                ? "- HIGH CREATIVITY allowed. Extrapolate bold theories.\n- Push the boundaries of the genre.\n- Focus on dramatic potential and secrets."
                                : "- BALANCE (FUSION): Combine logical grounding with creative expansion.\n- Fill gaps with plausible lore that fits the tone.\n- Maintain narrative cohesion."
                        }

                        INSTRUCTIONS:
                        1. Synthesize the session context and entity data into a rich, structured document.
                        2. Use Markdown headers (#, ##).
                        3. Include sections appropriate for the type (e.g., Appearance, Personality, History for Characters; Geography, History for Locations).
                        4. DO NOT include the Frontmatter (YAML) in the output text, I will add it programmatically. Just the body content.
                        5. The tone should be encyclopedic yet evocative.
                    `;

                    const aiRes = await model.generateContent(prompt);
                    const bodyContent = aiRes.response.text();

                    // 2. NEXUS IDENTITY
                    const cleanName = node.name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
                    const fileName = `${cleanName}.md`;
                    const fullVirtualPath = `${virtualPathRoot}/${fileName}`;
                    const nexusId = crypto.createHash('sha256').update(fullVirtualPath).digest('hex');

                    // 3. CONSTRUCT CONTENT (Unified Template)
                    const finalContent = generateAnchorContent({
                        id: nexusId, // Deterministic ID
                        name: node.name,
                        type: (node.type as any) || 'concept',
                        role: node.type === 'character' ? (node.description || 'Character') : node.type,
                        project_id: projectId,
                        tags: [node.type],
                        rawBodyContent: bodyContent // 🟢 Injected Body
                    });

                    // 4. SAVE TO DRIVE
                    const file = await drive.files.create({
                        requestBody: {
                            name: fileName,
                            parents: [targetFolderId],
                            mimeType: 'text/markdown'
                        },
                        media: {
                            mimeType: 'text/markdown',
                            body: finalContent
                        },
                        fields: 'id, name, webViewLink'
                    });

                    if (file.data.id) {
                        const fileId = file.data.id;

                        // 5. PRE-INJECT TDB_INDEX (Prevent Phantom Nodes)
                        await db.collection("TDB_Index").doc(userId).collection("files").doc(nexusId).set({
                            name: fileName,
                            path: fullVirtualPath,
                            driveId: fileId,
                            lastIndexed: new Date().toISOString(),
                            contentHash: crypto.createHash('sha256').update(finalContent).digest('hex'),
                            category: 'canon',
                            isGhost: false,
                            smartTags: ['CREATED_BY_BUILDER']
                        });

                        // 6. UPDATE ENTITIES GRAPH (Promote from Ghost)
                        const entityRef = db.collection("users").doc(userId)
                            .collection("projects").doc(projectId)
                            .collection("entities").doc(node.id);

                        await entityRef.set({
                            id: node.id,
                            name: node.name,
                            type: node.type,
                            description: node.description,
                            isGhost: false,
                            isAnchor: true,
                            masterFileId: fileId,
                            nexusId: nexusId, // Link to Deterministic ID
                            lastUpdated: new Date().toISOString()
                        }, { merge: true });

                        createdFiles.push({ id: fileId, name: fileName });
                        successCount++;
                    }

                } catch (err: any) {
                    logger.error(`❌ Failed to crystallize node ${node.name}:`, err);
                    failCount++;
                    // 🟢 CAPTURE SPECIFIC ERROR
                    let errMsg = err.message || "Unknown Error";
                    if (err.code === 403 || (err.errors && err.errors[0]?.reason === 'insufficientPermissions')) {
                        errMsg = "Permiso Denegado (Google Drive). Revisa tus credenciales.";
                    }
                    failedFiles.push({ name: node.name, error: errMsg });
                }
            }));
        }

        return {
            success: successCount > 0,
            created: successCount,
            failed: failCount,
            files: createdFiles,
            errors: failedFiles // 🟢 RETURN ERRORS
        };
    }
);

interface ForgeCrystallizeRequest {
    entityId: string;
    name: string;
    role?: string;
    summary?: string;
    chatNotes?: string; // Optional raw notes
    folderId: string; // Vault Root
    accessToken: string;
    attributes?: Record<string, any>;
    sagaId?: string;
}

/**
 * THE FORGE CRYSTALLIZER (La Materialización)
 * Promotes a Soul Forge entity (Ghost/Limbo) to a full Anchor in Drive + DB.
 */
export const crystallizeForgeEntity = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        secrets: [googleApiKey],
        memory: "1GiB",
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { entityId, name, role, summary, chatNotes, folderId, accessToken, attributes, sagaId } = request.data as ForgeCrystallizeRequest;

        if (!entityId || !name || !folderId || !accessToken) {
            throw new HttpsError("invalid-argument", "Missing required fields.");
        }

        const userId = request.auth.uid;
        logger.info(`💎 CRYSTALLIZING FORGE ENTITY: ${name} (${entityId})`);

        // 1. PREPARE CONTENT
        const safeName = name.replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').trim();
        const fileName = `${safeName}.md`;

        // Construct raw body for Template
        const bodyLines = [];
        if (summary) {
            bodyLines.push(`## 📝 Resumen\n${summary}\n`);
        } else {
            bodyLines.push(`## 📝 Resumen\n> Entidad cristalizada desde la Forja de Almas.\n`);
        }

        if (attributes && Object.keys(attributes).length > 0) {
            // Add other traits if passed
        }

        if (chatNotes) {
            bodyLines.push(`## 🧠 Notas de la Sesión\n${chatNotes}\n`);
        }

        const rawBody = bodyLines.join("\n");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 2. NEXUS IDENTITY
            logger.info("   -> Tracing lineage...");
            const folderPath = await resolveVirtualPath(drive, folderId);
            const fullVirtualPath = `${folderPath}/${fileName}`;
            const nexusId = crypto.createHash('sha256').update(fullVirtualPath).digest('hex');

            // 3. GENERATE CONTENT (Unified Template)
            const finalContent = generateAnchorContent({
                id: nexusId,
                name: safeName,
                type: 'character', // Default for Forge
                role: role || 'Unknown',
                tags: attributes?.tags,
                avatar: attributes?.avatar,
                rawBodyContent: rawBody,
                project_id: sagaId
            });

            // 4. SAVE TO DRIVE
            const file = await drive.files.create({
                requestBody: {
                    name: fileName,
                    parents: [folderId], // Root of Vault
                    mimeType: 'text/markdown'
                },
                media: {
                    mimeType: 'text/markdown',
                    body: finalContent
                },
                fields: 'id, name, webViewLink'
            });

            const newFileId = file.data.id;
            if (!newFileId) throw new Error("Failed to get Drive File ID");

            logger.info(`   ✅ File Forged: ${newFileId}`);

            // 5. PRE-INJECT TDB_INDEX
            await db.collection("TDB_Index").doc(userId).collection("files").doc(nexusId).set({
                name: fileName,
                path: fullVirtualPath,
                driveId: newFileId,
                lastIndexed: new Date().toISOString(),
                contentHash: crypto.createHash('sha256').update(finalContent).digest('hex'),
                category: 'canon',
                isGhost: false,
                smartTags: ['CREATED_BY_FORGE']
            });

            // 6. CREATE ROSTER ENTRY (The Promotion)
            const rosterId = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
            const charRef = db.collection("users").doc(userId).collection("characters").doc(rosterId);

            await charRef.set({
                id: rosterId,
                name: name,
                role: role || "Nuevo Personaje",
                tier: 'MAIN', // Promoted!
                status: 'EXISTING',
                sourceType: 'MASTER',
                sourceContext: sagaId || 'GLOBAL',
                masterFileId: newFileId,
                lastUpdated: new Date().toISOString(),
                isAIEnriched: true,
                avatar: attributes?.avatar || null,
                nexusId: nexusId
            }, { merge: true });

            // 7. UPDATE FORGE RADAR (The Cleanup)
            const radarRef = db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId);

            await radarRef.set({
                tier: 'ANCHOR', // 🟢 VISUAL SHIFT
                driveId: newFileId,
                status: 'ANCHOR', // Consistency
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            return {
                success: true,
                fileId: newFileId,
                rosterId: rosterId
            };

        } catch (error: any) {
            logger.error(`💥 Crystallization Failed:`, error);
            throw new HttpsError('internal', error.message);
        }
    }
);
