import './admin'; // Ensure firebase-admin is initialized
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
import { resolveVirtualPath } from "./utils/drive";
import { updateFirestoreTree } from "./utils/tree_utils";
import { ProjectConfig, FolderRole } from "./types/project";
import { getAIKey, escapeDriveQuery } from "./utils/security";
import { TitaniumFactory } from "./services/factory";
import { TitaniumEntity, EntityTrait } from "./types/ontology";
import { legacyTypeToTraits, traitsToLegacyCategory } from "./utils/legacy_adapter";
import { TitaniumGenesis } from "./services/genesis";
import matter from 'gray-matter';

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

// 🟢 TYPE MAPPING CONSTANTS
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

const TYPE_DEFAULT_NAMES: Record<string, string> = {
    'character': 'Personajes',
    'faction': 'Facciones',
    'creature': 'Bestiario',
    'object': 'Objetos',
    'location': 'Universo',
    'lore': 'Manuscrito'
};

const TRAIT_ROLE_MAP: Record<string, FolderRole> = {
    'sentient': FolderRole.ENTITY_PEOPLE,
    'locatable': FolderRole.WORLD_CORE,
    'tangible': FolderRole.ENTITY_OBJECTS,
    'temporal': FolderRole.LORE_HISTORY,
    'organized': FolderRole.ENTITY_FACTIONS,
    'abstract': FolderRole.LORE_HISTORY
};

// 🟢 NEW: HELPER TO FIND IDEAL FOLDER
const findIdealFolder = (type: string, traits: string[] | undefined, config: ProjectConfig): string | null => {
    // 1. Try Traits (V3.0 Priority)
    if (traits && traits.length > 0) {
        // Creature Heuristic
        if (traits.includes('sentient') && traits.includes('tangible')) {
             if (config.folderMapping?.[FolderRole.ENTITY_BESTIARY]) return config.folderMapping[FolderRole.ENTITY_BESTIARY]!;
        }

        for (const trait of traits) {
            const role = TRAIT_ROLE_MAP[trait];
            if (role && config.folderMapping?.[role]) {
                return config.folderMapping[role]!;
            }
        }
    }

    const safeType = type.toLowerCase();

    // 2. Role Mapping (Precision - Legacy)
    if (TYPE_ROLE_MAP[safeType] && config.folderMapping?.[TYPE_ROLE_MAP[safeType]]) {
        return config.folderMapping[TYPE_ROLE_MAP[safeType]]!;
    }

    // 3. Name Matching (Heuristic Fallback)
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

// 🟢 JIT TAXONOMY PROVISIONER
const ensureProjectTaxonomy = async (
    nodes: any[],
    config: ProjectConfig,
    userId: string,
    projectId: string, // Actually folderId usually
    drive: any,
    db: any
): Promise<ProjectConfig> => {
    let configUpdated = false;
    const folderMapping = config.folderMapping || {};
    const canonPaths = config.canonPaths || [];

    // Identify needed roles
    const neededRoles = new Set<FolderRole>();
    const neededTypes = new Set<string>();

    nodes.forEach(n => {
        const t = (n.type || 'concept').toLowerCase();
        if (TYPE_ROLE_MAP[t]) {
            neededRoles.add(TYPE_ROLE_MAP[t]);
            neededTypes.add(t);
        }
    });

    for (const type of Array.from(neededTypes)) {
        const role = TYPE_ROLE_MAP[type];
        if (!role) continue;

        // If NOT mapped in config
        if (!folderMapping[role]) {
            logger.info(`🛠️ JIT Provisioning: Missing folder for ${type} (${role}). Hunting...`);

            let foundId: string | null = null;
            const defaultName = TYPE_DEFAULT_NAMES[type] || "Nuevos Archivos";

            // 1. Check existing Canon Paths
            const existingCanon = canonPaths.find(p =>
                p.name.toLowerCase() === defaultName.toLowerCase() ||
                p.name.toLowerCase().includes(type)
            );

            if (existingCanon) {
                foundId = existingCanon.id;
                logger.info(`   -> Found existing Canon Path: ${existingCanon.name}`);
            } else {
                // 2. Check Drive (Root Level)
                try {
                    const q = `'${escapeDriveQuery(projectId)}' in parents and name = '${escapeDriveQuery(defaultName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                    const list = await drive.files.list({ q, fields: 'files(id, name)' });
                    if (list.data.files && list.data.files.length > 0) {
                        foundId = list.data.files[0].id!;
                        logger.info(`   -> Found existing Drive Folder: ${defaultName}`);
                    } else {
                        // 3. CREATE IT
                        const newFolder = await drive.files.create({
                            requestBody: {
                                name: defaultName,
                                parents: [projectId],
                                mimeType: 'application/vnd.google-apps.folder'
                            },
                            fields: 'id, name'
                        });
                        foundId = newFolder.data.id!;
                        logger.info(`   -> CREATED Drive Folder: ${defaultName}`);
                    }
                } catch (e) {
                    logger.error(`   -> Failed to check/create folder for ${type}`, e);
                }
            }

            // 4. Update Mapping & Config
            if (foundId) {
                folderMapping[role] = foundId;
                if (!canonPaths.some(p => p.id === foundId)) {
                    canonPaths.push({ id: foundId!, name: defaultName });
                }
                configUpdated = true;
            }
        }
    }

    if (configUpdated) {
        await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
            folderMapping,
            canonPaths,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        logger.info("✅ Project Config & Taxonomy updated via JIT Provisioning.");
        return { ...config, folderMapping, canonPaths };
    }

    return config;
};

interface CrystallizeGraphRequest {
    nodes: Array<{
        id: string;
        name: string;
        type: string;
        description: string;
        [key: string]: any;
    }>;
    edges?: Array<{ source: string; target: string; label: string }>;
    folderId: string;
    subfolderName?: string;
    autoMapRole?: string;
    accessToken: string;
    chatContext?: string;
    projectId: string;
    mode?: 'RIGOR' | 'ENTROPIA' | 'FUSION';
}

export const crystallizeGraph = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
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

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
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
                // 🛡️ SECURITY: Escape query params
                const q = `'${escapeDriveQuery(folderId)}' in parents and name = '${escapeDriveQuery(subfolderName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
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

                        // 🟢 AUTO-WIRING
                        if (autoMapRole) {
                            try {
                                const folderMapping = projectConfig.folderMapping || {};
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
                                    projectConfig.folderMapping = folderMapping;
                                    projectConfig.canonPaths = canonPaths;
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

        // 🟢 JIT TAXONOMY PROVISIONING
        if (nodes.length > 0) {
            try {
                const rootId = projectConfig.folderId || folderId;
                projectConfig = await ensureProjectTaxonomy(nodes, projectConfig, userId, rootId, drive, db);
            } catch (jitErr) {
                logger.error("JIT Taxonomy Provisioning failed", jitErr);
            }
        }

        // 🟢 PRE-PROCESS RELATIONS
        const relationsMap = new Map<string, any[]>();
        if (edges && Array.isArray(edges)) {
             edges.forEach(edge => {
                 if (!relationsMap.has(edge.source)) relationsMap.set(edge.source, []);
                 const targetNode = nodes.find(n => n.id === edge.target);
                 relationsMap.get(edge.source)?.push({
                     targetId: edge.target,
                     targetName: targetNode?.name || "Unknown Entity",
                     targetType: targetNode?.type || "concept",
                     relation: edge.label || "NEUTRAL",
                     context: edge.label || "Created by Builder"
                 });
             });
        }

        let successCount = 0;
        let failCount = 0;
        const createdFiles: Array<{ id: string; name: string }> = [];
        const failedFiles: Array<{ name: string; error: string }> = [];

        // BATCH PROCESSING
        const BATCH_SIZE = 3;
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
            const batch = nodes.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (node) => {
                try {
                    // 🟢 NORMALIZE TYPE
                    const safeType = (node.type || 'concept').toLowerCase();
                    node.type = safeType;

                    // 🟢 INTELLIGENT ROUTING
                    // Derive traits if not present for folder routing
                    const derivedTraits = (node.traits && node.traits.length > 0) ? node.traits : legacyTypeToTraits(safeType);
                    const specificFolderId = findIdealFolder(safeType, derivedTraits, projectConfig) || targetFolderId;

                    // 1. GENERATE BODY CONTENT (AI)
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
                        // 🟢 ADOPTION PROTOCOL
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
                            node.id = adoptedSnap.id;
                            logger.info(`🤝 Adopted existing entity by name: ${node.name} (${node.id})`);
                        }
                    }

                    let fileId = "";
                    let adoptedFileId: string | null = null;

                    // 🟢 GLOBAL DUPLICATE CHECK (TDB_Index)
                    if (!isUpdate) {
                        try {
                            const globalQuery = await db.collection("TDB_Index").doc(userId)
                                .collection("files")
                                .where("name", "==", fileName)
                                .limit(1)
                                .get();

                            if (!globalQuery.empty) {
                                const globalData = globalQuery.docs[0].data();
                                if (globalData.driveId) {
                                    adoptedFileId = globalData.driveId;
                                    logger.info(`🌍 Global Check: Found existing file for '${node.name}' at ${adoptedFileId}. Adopting.`);
                                }
                            }
                        } catch (e) {
                             logger.warn("Global TDB_Index check failed", e);
                        }
                    }

                    const nexusId = isUpdate && existingData?.nexusId ? existingData.nexusId : crypto.createHash('sha256').update(specificFolderId + fileName).digest('hex');

                    // 🟢 PRE-CHECK: Duplicate File Name
                    if (!isUpdate && !adoptedFileId) {
                         try {
                            const duplicateCheck = await drive.files.list({
                                q: `'${escapeDriveQuery(specificFolderId)}' in parents and name = '${escapeDriveQuery(fileName)}' and trashed = false`,
                                fields: 'files(id)'
                            });
                            if (duplicateCheck.data.files && duplicateCheck.data.files.length > 0) {
                                adoptedFileId = duplicateCheck.data.files[0].id!;
                                logger.info(`⚠️ Found existing file '${fileName}' in target folder. Adopting it instead of creating duplicate.`);
                            }
                         } catch (e) { }
                    }

                    if ((isUpdate && existingData && existingData.masterFileId) || adoptedFileId) {
                         // 🟢 UPDATE EXISTING FILE (APPEND STRATEGY)
                         fileId = (isUpdate && existingData?.masterFileId) ? existingData.masterFileId : adoptedFileId!;

                         // 🟢 MOVEMENT PROTOCOL (EVOLUTION)
                         if (fileId) {
                             try {
                                const fileMeta = await drive.files.get({ fileId: fileId, fields: 'parents' });
                                const currentParents = fileMeta.data.parents || [];

                                if (!currentParents.includes(specificFolderId)) {
                                     await drive.files.update({
                                         fileId: fileId,
                                         addParents: specificFolderId,
                                         removeParents: currentParents.join(',')
                                     });
                                     logger.info(`🚚 EVOLUTION: Moved entity ${node.name} from ${currentParents} to ${specificFolderId}`);
                                     await updateFirestoreTree(userId, 'move', fileId, { parentId: specificFolderId });
                                }
                             } catch (moveErr) {
                                 logger.warn(`Failed to move entity ${node.name} during update`, moveErr);
                             }
                         }

                         // 🟢 GHOST FILE RECOVERY
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

                         // Fetch and Append (Titanium Compliant)
                         try {
                            const currentFile = await drive.files.get({ fileId: fileId, alt: 'media' });
                            let currentContent = currentFile.data as string;
                            if (typeof currentContent !== 'string') currentContent = "";

                            const parsed = matter(currentContent);
                            const currentFm = parsed.data || {};

                            const appendContent = `\n\n## 🏗️ The Builder Notes (${new Date().toLocaleDateString()})\n> ${mode} Protocol Expansion\n\n${bodyContent}`;

                            // Re-Forge through Titanium to ensure Schema/Anti-Makeup
                            const entity: TitaniumEntity = {
                                id: nexusId, // Enforce Nexus ID
                                name: currentFm.name || node.name,
                                traits: currentFm.traits || legacyTypeToTraits(currentFm.type || node.type || 'concept'),
                                attributes: {
                                    ...currentFm,
                                    _sys: {
                                        status: currentFm._sys?.status || currentFm.status || 'active',
                                        tier: currentFm._sys?.tier || 'ANCHOR',
                                        last_sync: new Date().toISOString(),
                                        schema_version: '3.0',
                                        nexus_id: nexusId
                                    }
                                },
                                bodyContent: parsed.content + appendContent
                            };

                            const newFullContent = TitaniumFactory.forge(entity);

                            await drive.files.update({
                                fileId: fileId,
                                media: {
                                    mimeType: 'text/markdown',
                                    body: newFullContent
                                }
                            });
                            logger.info(`✅ Appended content to existing file: ${fileName}`);
                         } catch (updateErr) {
                             logger.warn(`⚠️ Failed to append to existing file ${fileName}`, updateErr);
                             throw new Error("Failed to update existing file content in Drive.");
                         }

                    } else {
                        // 🟢 CREATE NEW FILE VIA TITANIUM GENESIS
                        // 3. BIRTH ENTITY
                        const genesisResult = await TitaniumGenesis.birth({
                            userId: userId,
                            name: node.name,
                            context: bodyContent,
                            targetFolderId: specificFolderId,
                            accessToken: accessToken,
                            projectId: projectId,
                            role: node.type === 'character' ? (node.description || 'Character') : node.type,
                            aiKey: getAIKey(request.data, googleApiKey.value()),
                            attributes: {
                                type: node.type,
                                tags: [node.type || 'concept']
                            }
                        });

                        fileId = genesisResult.fileId;
                    }

                    if (fileId) {
                        // 6. UPDATE ENTITIES GRAPH
                        const nodeRelations = relationsMap.get(node.id) || [];
                        let finalRelations = nodeRelations;
                        if (isUpdate && existingData && Array.isArray(existingData.relations)) {
                             const existingRels = existingData.relations;
                             const newUnique = nodeRelations.filter(nr => !existingRels.some((er: any) => er.targetId === nr.targetId));
                             finalRelations = [...existingRels, ...newUnique];
                        }

                        const finalType = (isUpdate && existingData?.type) ? existingData.type : (node.type || 'concept');
                        const finalDesc = (isUpdate && existingData?.description && existingData.description.length > 0) ? existingData.description : finalDescription;

                        await entityRef.set({
                            id: node.id,
                            name: node.name,
                            type: finalType,
                            description: finalDesc,
                            isGhost: false,
                            isAnchor: true,
                            masterFileId: fileId,
                            nexusId: nexusId,
                            relations: finalRelations,
                            lastUpdated: new Date().toISOString()
                        }, { merge: true });

                        createdFiles.push({ id: fileId, name: fileName });
                        successCount++;
                    }

                } catch (err: any) {
                    logger.error(`❌ Failed to crystallize node ${node.name}:`, err);
                    failCount++;
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
            errors: failedFiles
        };
    }
);

interface ForgeCrystallizeRequest {
    entityId: string;
    name: string;
    role?: string;
    summary?: string;
    chatNotes?: string;
    folderId: string;
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
        enforceAppCheck: false,
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

        // Construct raw body for Template
        const bodyLines = [];
        if (summary) {
            bodyLines.push(`## 📝 Resumen\n${summary}\n`);
        } else {
            bodyLines.push(`## 📝 Resumen\n> Entidad cristalizada desde la Forja de Almas.\n`);
        }

        if (chatNotes) {
            bodyLines.push(`## 🧠 Notas de la Sesión\n${chatNotes}\n`);
        }

        const rawBody = bodyLines.join("\n");

        try {
            // 🚀 TITANIUM GENESIS: BIRTH ENTITY
            const genesisResult = await TitaniumGenesis.birth({
                userId: userId,
                name: name,
                context: rawBody,
                targetFolderId: folderId,
                accessToken: accessToken,
                projectId: sagaId || 'Global',
                role: role,
                aiKey: getAIKey(request.data, googleApiKey.value()),
                inferredTraits: ['sentient'], // Force sentient for Forge entities
                attributes: attributes
            });

            // 7. UPDATE FORGE RADAR
            const radarRef = db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId);

            await radarRef.set({
                tier: 'ANCHOR',
                driveId: genesisResult.fileId,
                status: 'ANCHOR',
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            return {
                success: true,
                fileId: genesisResult.fileId,
                rosterId: genesisResult.rosterId
            };

        } catch (error: any) {
            logger.error(`💥 Crystallization Failed:`, error);
            throw new HttpsError('internal', error.message);
        }
    }
);
