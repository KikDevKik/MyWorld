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
import { updateFirestoreTree } from "./utils/tree_utils";
import { ProjectConfig, FolderRole } from "./types/project";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// Internal helper to get config
async function getProjectConfigLocal(userId: string): Promise<ProjectConfig> {
  const db = getFirestore();
  const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

  const defaultConfig: ProjectConfig = {
    canonPaths: [],
    primaryCanonPathId: null,
    resourcePaths: [],
    activeBookContext: ""
  };

  if (!doc.exists) {
    return defaultConfig;
  }
  return { ...defaultConfig, ...doc.data() };
}

// 🟢 NEW: HELPER TO FIND IDEAL FOLDER
const findIdealFolder = (type: string, config: ProjectConfig): string | null => {
    const safeType = type.toLowerCase();

    // 1. Role Mapping (Precision)
    const TYPE_ROLE_MAP: Record<string, FolderRole> = {
        'character': FolderRole.ENTITY_PEOPLE,
        'person': FolderRole.ENTITY_PEOPLE,
        'creature': FolderRole.ENTITY_BESTIARY,
        'beast': FolderRole.ENTITY_BESTIARY,
        'faction': FolderRole.ENTITY_FACTIONS,
        'group': FolderRole.ENTITY_FACTIONS,
        'organization': FolderRole.ENTITY_FACTIONS,
        'object': FolderRole.ENTITY_OBJECTS,
        'item': FolderRole.ENTITY_OBJECTS,
        'location': FolderRole.WORLD_CORE,
        'place': FolderRole.WORLD_CORE,
        'lore': FolderRole.LORE_HISTORY
    };

    // Check if role is mapped in config
    if (TYPE_ROLE_MAP[safeType] && config.folderMapping?.[TYPE_ROLE_MAP[safeType]]) {
        return config.folderMapping[TYPE_ROLE_MAP[safeType]]!;
    }

    // 2. Name Matching (Heuristic Fallback)
    const TERMS: Record<string, string[]> = {
        'character': ['personajes', 'characters', 'gente', 'npcs', 'roster'],
        'faction': ['facciones', 'factions', 'grupos', 'groups', 'organizations'],
        'creature': ['bestiario', 'bestiary', 'criaturas', 'monstruos'],
        'location': ['universo', 'universe', 'lugares', 'mundo', 'world', 'geography'],
        'object': ['objetos', 'objects', 'items', 'artefactos', 'artifacts'],
        'lore': ['manuscrito', 'manuscripts', 'lore', 'historia', 'history']
    };

    const targetTerms = TERMS[safeType] || [];
    if (config.canonPaths && targetTerms.length > 0) {
        const found = config.canonPaths.find(p => {
            const lowerName = p.name.toLowerCase();
            return targetTerms.some(t => lowerName === t || lowerName.includes(t));
        });
        if (found) return found.id;
    }

    return null;
};

interface CrystallizeGraphRequest {
    nodes: Array<{
        id: string;
        name: string;
        type: string;
        description: string;
        [key: string]: any;
    }>;
    edges?: Array<{ source: string; target: string; label: string }>; // 🟢 NEW: Edges Support
    folderId: string;
    subfolderName?: string; // Optional subfolder creation
    autoMapRole?: string; // 🟢 NEW: Auto-Wiring Request
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

        const { nodes, edges, folderId, subfolderName, autoMapRole, accessToken, chatContext, projectId, mode = 'FUSION' } = request.data as CrystallizeGraphRequest;

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            throw new HttpsError("invalid-argument", "No nodes provided to crystallize.");
        }
        if (!folderId) throw new HttpsError("invalid-argument", "Target folder ID is required.");
        if (!accessToken) throw new HttpsError("unauthenticated", "Google Access Token is required.");

        const userId = request.auth.uid;

        // 🟢 LOAD CONFIG (Mutable)
        let projectConfig = await getProjectConfigLocal(userId);

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

                        // 🟢 AUTO-WIRING: If requested and new folder created, update Project Config
                        if (autoMapRole) {
                            try {
                                const folderMapping = projectConfig.folderMapping || {};

                                // Only update if not already mapped
                                if (!folderMapping[autoMapRole as any]) {
                                    folderMapping[autoMapRole as any] = targetFolderId;

                                    const canonPaths = projectConfig.canonPaths || [];
                                    if (!canonPaths.some(p => p.id === targetFolderId)) {
                                        canonPaths.push({ id: targetFolderId, name: subfolderName });
                                    }

                                    await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                                        folderMapping,
                                        canonPaths,
                                        updatedAt: new Date().toISOString()
                                    }, { merge: true });

                                    // 🟢 UPDATE LOCAL CONFIG STATE
                                    projectConfig.folderMapping = folderMapping;
                                    projectConfig.canonPaths = canonPaths;

                                    logger.info(`🔗 Auto-Wired folder ${subfolderName} to role ${autoMapRole}`);
                                }
                            } catch (configErr) {
                                logger.error("Failed to auto-wire folder to project config:", configErr);
                            }
                        }
                    }
                }
            } catch (folderErr) {
                logger.warn(`Failed to resolve subfolder ${subfolderName}, falling back to parent.`, folderErr);
            }
        }

        // 🟢 1. TRACE PATH ONCE (For Nexus Protocol - Default)
        let virtualPathRoot = "";
        try {
            virtualPathRoot = await resolveVirtualPath(drive, targetFolderId);
        } catch (e) {
            logger.warn("Failed to resolve virtual path for graph crystallization.", e);
            virtualPathRoot = "Unknown_Graph_Path";
        }

        // 🟢 PRE-PROCESS RELATIONS (Edges)
        const relationsMap = new Map<string, any[]>();
        if (edges && Array.isArray(edges)) {
             edges.forEach(edge => {
                 if (!relationsMap.has(edge.source)) relationsMap.set(edge.source, []);

                 // Lookup target in 'nodes' (New) or pass through ID (Existing)
                 const targetNode = nodes.find(n => n.id === edge.target);

                 relationsMap.get(edge.source)?.push({
                     targetId: edge.target,
                     targetName: targetNode?.name || "Unknown Entity",
                     targetType: targetNode?.type || "concept",
                     relation: edge.label || "NEUTRAL",
                     context: edge.label || "Created by Builder" // 🟢 USE EDGE LABEL AS CONTEXT
                 });
             });
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
                    // 🟢 NORMALIZE TYPE
                    const safeType = (node.type || 'concept').toLowerCase();
                    node.type = safeType;

                    // 🟢 INTELLIGENT ROUTING
                    // Determine where THIS specific node belongs.
                    // Fallback to targetFolderId (which might be the Auto-Provisioned one)
                    const specificFolderId = findIdealFolder(safeType, projectConfig) || targetFolderId;

                    // Resolve Virtual Path for specific folder if different (Optional for pure tracing but good for DB)
                    let specificVirtualPath = virtualPathRoot;
                    if (specificFolderId !== targetFolderId) {
                         try { specificVirtualPath = await resolveVirtualPath(drive, specificFolderId); } catch(e) {}
                    }

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

                    // 🟢 SAFETY NET: Infer description if missing
                    let finalDescription = node.description;
                    if (!finalDescription || finalDescription.trim() === "") {
                         // Extract first paragraph or summary from generated body
                         const firstPara = bodyContent.split('\n').find(l => l.length > 50 && !l.startsWith('#')) || "Entity forged by The Builder.";
                         finalDescription = firstPara.substring(0, 200) + (firstPara.length > 200 ? "..." : "");
                    }

                    // 2. NEXUS IDENTITY & FILE NAME
                    const cleanName = node.name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
                    const fileName = `${cleanName}.md`;

                    // 🟢 CHECK EXISTING ENTITY (Firestore)
                    const entityRef = db.collection("users").doc(userId)
                        .collection("projects").doc(projectId)
                        .collection("entities").doc(node.id);

                    const entitySnap = await entityRef.get();
                    let isUpdate = false;
                    let existingData: any = null;

                    if (entitySnap.exists) {
                        isUpdate = true;
                        existingData = entitySnap.data();
                    } else {
                        // 🟢 ADOPTION PROTOCOL: Fallback search by Name (Prevent Duplicates)
                        const fallbackQuery = await db.collection("users").doc(userId)
                            .collection("projects").doc(projectId)
                            .collection("entities")
                            .where("name", "==", node.name)
                            .limit(1)
                            .get();

                        if (!fallbackQuery.empty) {
                            const adoptedSnap = fallbackQuery.docs[0];
                            isUpdate = true;
                            existingData = adoptedSnap.data();
                            node.id = adoptedSnap.id; // Correct the ID
                            logger.info(`🤝 Adopted existing entity by name: ${node.name} (${node.id})`);
                        }
                    }

                    let fileId = "";
                    let adoptedFileId: string | null = null;

                    // 🟢 GLOBAL DUPLICATE CHECK (TDB_Index)
                    // If not found in Entities, check if the FILE exists anywhere in the project to prevent duplicates.
                    if (!isUpdate) {
                        try {
                            const globalQuery = await db.collection("TDB_Index").doc(userId)
                                .collection("files")
                                .where("name", "==", fileName)
                                .limit(1)
                                .get();

                            if (!globalQuery.empty) {
                                const globalData = globalQuery.docs[0].data();
                                // Verify it's not a ghost? Or adopt ghosts too? Adopt ghosts.
                                if (globalData.driveId) {
                                    adoptedFileId = globalData.driveId;
                                    logger.info(`🌍 Global Check: Found existing file for '${node.name}' at ${adoptedFileId}. Adopting.`);
                                }
                            }
                        } catch (e) {
                             logger.warn("Global TDB_Index check failed", e);
                        }
                    }

                    const fullVirtualPath = `${specificVirtualPath}/${fileName}`;
                    const nexusId = isUpdate && existingData?.nexusId ? existingData.nexusId : crypto.createHash('sha256').update(fullVirtualPath).digest('hex');

                    // 🟢 PRE-CHECK: Duplicate File Name in Target Folder (Safety Net - Last Resort)
                    if (!isUpdate && !adoptedFileId) {
                         try {
                            const duplicateCheck = await drive.files.list({
                                q: `'${specificFolderId}' in parents and name = '${fileName}' and trashed = false`,
                                fields: 'files(id)'
                            });
                            if (duplicateCheck.data.files && duplicateCheck.data.files.length > 0) {
                                adoptedFileId = duplicateCheck.data.files[0].id!;
                                logger.info(`⚠️ Found existing file '${fileName}' in target folder. Adopting it instead of creating duplicate.`);
                            }
                         } catch (e) {
                             // Ignore check failure, proceed to create
                         }
                    }

                    if ((isUpdate && existingData && existingData.masterFileId) || adoptedFileId) {
                         // 🟢 UPDATE EXISTING FILE (APPEND STRATEGY)
                         // Use masterFileId if available, otherwise adoptedFileId from Drive
                         fileId = (isUpdate && existingData?.masterFileId) ? existingData.masterFileId : adoptedFileId!;

                         // 🟢 MOVEMENT PROTOCOL (EVOLUTION)
                         // Run this for BOTH Updates AND Adoptions
                         if (fileId) {
                             try {
                                const fileMeta = await drive.files.get({ fileId: fileId, fields: 'parents' });
                                const currentParents = fileMeta.data.parents || [];

                                // If not in the ideal folder, MOVE IT.
                                if (!currentParents.includes(specificFolderId)) {
                                     await drive.files.update({
                                         fileId: fileId,
                                         addParents: specificFolderId,
                                         removeParents: currentParents.join(',')
                                     });
                                     logger.info(`🚚 EVOLUTION: Moved entity ${node.name} from ${currentParents} to ${specificFolderId}`);

                                     // 🟢 SYNC TREE (Fix UI Desync)
                                     await updateFirestoreTree(userId, 'move', fileId, {
                                         parentId: specificFolderId
                                     });
                                }
                             } catch (moveErr) {
                                 logger.warn(`Failed to move entity ${node.name} during update`, moveErr);
                             }
                         }

                         // 🟢 GHOST FILE RECOVERY (Fix Visibility)
                         if (adoptedFileId && !isUpdate) {
                             await updateFirestoreTree(userId, 'add', adoptedFileId, {
                                parentId: specificFolderId,
                                newNode: {
                                    id: nexusId,
                                    name: fileName,
                                    mimeType: 'text/markdown',
                                    driveId: adoptedFileId,
                                    type: 'file'
                                }
                             });
                         }

                         // Fetch current content
                         try {
                            const currentFile = await drive.files.get({ fileId: fileId, alt: 'media' });
                            let currentContent = currentFile.data as string;

                            // Check if valid content
                            if (typeof currentContent !== 'string') currentContent = "";

                            const appendContent = `\n\n## 🏗️ The Builder Notes (${new Date().toLocaleDateString()})\n> ${mode} Protocol Expansion\n\n${bodyContent}`;
                            const newFullContent = currentContent + appendContent;

                            await drive.files.update({
                                fileId: fileId,
                                media: {
                                    mimeType: 'text/markdown',
                                    body: newFullContent
                                }
                            });
                            logger.info(`✅ Appended content to existing file: ${fileName}`);
                         } catch (updateErr) {
                             logger.warn(`⚠️ Failed to append to existing file ${fileName}, trying to create new version but keeping ID if possible? No, falling back to overwrite if critical.`, updateErr);
                             // If fetch fails, we might not be able to append.
                             // However, usually we should respect the existing file.
                             // Let's assume if this fails, we treat it as an error or just proceed updating metadata.
                             throw new Error("Failed to update existing file content in Drive.");
                         }

                    } else {
                        // 🟢 CREATE NEW FILE
                        // 3. CONSTRUCT CONTENT (Unified Template)
                        const finalContent = generateAnchorContent({
                            id: nexusId, // Deterministic ID
                            name: node.name,
                            type: (node.type as any) || 'concept',
                            role: node.type === 'character' ? (node.description || 'Character') : node.type,
                            project_id: projectId,
                            tags: [node.type || 'concept'], // 🟢 Fix Undefined Tag
                            rawBodyContent: bodyContent // 🟢 Injected Body
                        });

                        // 4. SAVE TO DRIVE
                        const file = await drive.files.create({
                            requestBody: {
                            name: fileName,
                            parents: [specificFolderId],
                            mimeType: 'text/markdown'
                        },
                        media: {
                            mimeType: 'text/markdown',
                            body: finalContent
                        },
                        fields: 'id, name, webViewLink'
                        });

                        if (!file.data.id) throw new Error("Drive File Creation Failed");
                        fileId = file.data.id;

                        // 🟢 UPDATE TREE INDEX (Only for new files)
                        await updateFirestoreTree(userId, 'add', fileId, {
                            parentId: specificFolderId,
                            newNode: {
                                id: nexusId, // Use nexusId as ID in tree usually.
                                name: fileName,
                                mimeType: 'text/markdown',
                                driveId: fileId,
                                type: 'file'
                            }
                        });
                    }

                    if (fileId) {
                        // 5. PRE-INJECT TDB_INDEX (Prevent Phantom Nodes)
                        // Always update TDB Index for safety
                        await db.collection("TDB_Index").doc(userId).collection("files").doc(nexusId).set({
                            name: fileName,
                            path: fullVirtualPath,
                            driveId: fileId,
                            lastIndexed: new Date().toISOString(),
                            contentHash: crypto.createHash('sha256').update(nexusId).digest('hex'), // Simplify hash update
                            category: 'canon',
                            isGhost: false,
                            smartTags: ['CREATED_BY_BUILDER']
                        }, { merge: true });

                        // 6. UPDATE ENTITIES GRAPH (Promote from Ghost or Merge)

                        const nodeRelations = relationsMap.get(node.id) || [];

                        // Merge Relations Strategy
                        let finalRelations = nodeRelations;
                        if (isUpdate && existingData && Array.isArray(existingData.relations)) {
                             const existingRels = existingData.relations;
                             // Filter out new ones that already exist (by targetId)
                             const newUnique = nodeRelations.filter(nr => !existingRels.some((er: any) => er.targetId === nr.targetId));
                             finalRelations = [...existingRels, ...newUnique];
                        }

                        // PRESERVE TYPE if Existing
                        const finalType = (isUpdate && existingData?.type) ? existingData.type : (node.type || 'concept');
                        const finalDesc = (isUpdate && existingData?.description && existingData.description.length > 0) ? existingData.description : finalDescription;

                        await entityRef.set({
                            id: node.id,
                            name: node.name,
                            type: finalType, // 🟢 PRESERVE TYPE
                            description: finalDesc,
                            isGhost: false,
                            isAnchor: true,
                            masterFileId: fileId,
                            nexusId: nexusId, // Link to Deterministic ID
                            relations: finalRelations, // 🟢 MERGED RELATIONS
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
