import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as crypto from 'crypto';
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { TEMP_PRECISION } from "./ai_config";
import { resolveVirtualPath } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";
import { updateFirestoreTree } from "./utils/tree_utils";
import { ingestFile } from "./ingestion";
import { GeminiEmbedder } from "./utils/vector_utils";
import { smartGenerateContent } from "./utils/smart_generate";
import { getAIKey } from "./utils/security";
import { TitaniumFactory } from "./services/factory";
import { TitaniumEntity, EntityTrait } from "./types/ontology";
import { ProjectConfig } from "./types/project";
import { legacyTypeToTraits } from "./utils/legacy_adapter";
import matter from 'gray-matter';
import { marked } from 'marked';

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_AI_INPUT_CHARS = 100000;

async function _getProjectConfigInternal(userId: string): Promise<ProjectConfig> {
    const db = getFirestore();
    const doc = await db.collection("users").doc(userId).collection("profile").doc("project_config").get();

    const defaultConfig: ProjectConfig = {
        canonPaths: [],
        primaryCanonPathId: null,
        resourcePaths: [],
        activeBookContext: ""
    };

    if (!doc.exists) return defaultConfig;

    const data = doc.data() || {};
    // Normalize 'narrative_style' to 'styleIdentity'
    if (!data.styleIdentity && data.narrative_style) {
        data.styleIdentity = data.narrative_style;
    }

    return { ...defaultConfig, ...data };
}

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
    synthesize?: boolean; // 🟢 If true, convert chatContent into rich MD body
}

interface ScribePatchRequest {
    fileId: string;
    patchContent: string;
    accessToken: string;
    instructions?: string;
}

// 🟢 HELPER: AST Metadata Extraction
function extractMetadataFromBody(body: string): { name?: string, role?: string } {
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
 * THE SCRIBE (El Escriba)
 * Tallas la piedra con el conocimiento extraído, generando archivos .md perfectos para Obsidian/Nexus.
 */
export const scribeCreateFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
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
            let finalBodyContent: string | undefined = undefined;

            // 🟢 INTELLIGENT INFERENCE (If type is generic/missing)
            if ((!entityData.type || entityData.type === 'concept') && chatContent) {
                try {
                    logger.info(`🧠 SCRIBE INFERENCE: Detecting type for ${entityData.name}`);
                    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

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

                    const result = await smartGenerateContent(genAI, inferencePrompt, {
                        useFlash: true, // Inference is simple
                        jsonMode: true,
                        temperature: 0.2,
                        contextLabel: "ScribeInference"
                    });

                    if (result.text) {
                        const inference = parseSecureJSON(result.text, "ScribeInference");
                        if (inference.type) {
                            entityData.type = inference.type;
                            logger.info(`   -> Inferred Type: ${inference.type}`);
                        }
                        if (inference.role && (!entityData.role || entityData.role === 'Unknown')) {
                            entityData.role = inference.role;
                            logger.info(`   -> Inferred Role: ${inference.role}`);
                        }
                    }

                } catch (e) {
                    logger.warn("⚠️ Scribe Inference Failed:", e);
                    // Fallback to defaults
                }
            }

            // 🟢 SYNTHESIS MODE (The "Idea Laboratory" Request)
            if (request.data.synthesize && chatContent) {
                try {
                    logger.info(`🧪 SCRIBE SYNTHESIS: Converting chat to Markdown for ${entityData.name}`);
                    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

                    const synthesisPrompt = `
                    TASK: Create a rich Markdown document based on the following BRAINSTORMING SESSION.
                    SUBJECT: "${entityData.name}"
                    TYPE: "${entityData.type || 'Concept'}"

                    INSTRUCTIONS:
                    1. Analyze the conversation history (CHAT CONTENT).
                    2. Extract all key ideas, details, sensory descriptions, and emotional beats discussed.
                    3. Organize them into a beautiful, structured Markdown body (Use H2 ##, H3 ###, Lists, Blockquotes).
                    4. SECTIONS TO INCLUDE (Adjust based on type):
                       - Core Concept / Hook
                       - Sensory Details / Atmosphere
                       - Narrative Potential / Use Cases
                       - Key Questions Raised
                    5. TONE: Professional, evocative, inspiring (like a high-quality wiki entry or design document).
                    6. DO NOT include the raw chat log. Synthesize it.
                    7. DO NOT include Frontmatter (it is added automatically).

                    CHAT CONTENT:
                    "${chatContent.substring(0, 10000)}"

                    OUTPUT:
                    `;

                    const result = await smartGenerateContent(genAI, synthesisPrompt, {
                        useFlash: true, // Synthesis is fine with Flash, fallback to Pro if blocked
                        temperature: 0.5,
                        contextLabel: "ScribeSynthesis"
                    });

                    let synthesis = result.text || "";

                    // Cleanup fences
                    if (synthesis.startsWith('```markdown')) synthesis = synthesis.replace(/^```markdown\n/, '').replace(/\n```$/, '');
                    if (synthesis.startsWith('```')) synthesis = synthesis.replace(/^```\n/, '').replace(/\n```$/, '');

                    if (synthesis) finalBodyContent = synthesis;

                } catch (e) {
                    logger.warn("⚠️ Scribe Synthesis Failed:", e);
                    // Fallback to default
                }
            }

            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 2. NEXUS IDENTITY PROTOCOL (Trace Path)
            logger.info("   -> Tracing lineage...");
            const folderPath = await resolveVirtualPath(drive, folderId);
            const fullVirtualPath = `${folderPath}/${fileName}`;

            // Generate Deterministic ID (Only for Nexus Link, not used as Doc ID anymore)
            const nexusId = crypto.createHash('sha256').update(fullVirtualPath).digest('hex');
            logger.info(`   -> Deterministic Nexus ID: ${nexusId}`);

            // 3. TITANIUM FORGE (Unified Factory)
            // Map legacy type string to traits
            const traits = legacyTypeToTraits(entityData.type || 'concept');

            // Default body content if synthesis failed or wasn't requested
            const defaultBody = [
                `# ${entityData.name}`,
                "",
                `> *${(entityData.role || "Entidad Registrada").replace(/\n/g, ' ')}*`,
                "",
                "## 📝 Descripción",
                chatContent || entityData.summary || "Generado por El Escriba.",
                "",
                "## 🧠 Notas",
                "",
                "## 🔗 Relaciones",
                "- ",
                ""
            ].join("\n");

            const entity: TitaniumEntity = {
                id: nexusId, // Nexus Link
                name: entityData.name,
                traits: traits,
                attributes: {
                    role: entityData.role,
                    aliases: entityData.aliases,
                    tags: entityData.tags || ['tdb/entity'],
                    project_id: sagaId,
                    status: 'active',
                    tier: 'ANCHOR'
                },
                bodyContent: finalBodyContent || defaultBody
            };

            const fullContent = TitaniumFactory.forge(entity);

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

            // A. FIRE & FORGET VECTORIZATION (Server-Side Trigger) ⚡
            try {
                const embeddingsModel = new GeminiEmbedder({
                    apiKey: googleApiKey.value(),
                    model: "gemini-embedding-001",
                    taskType: TaskType.RETRIEVAL_DOCUMENT,
                });

                await ingestFile(
                    db,
                    userId,
                    folderId, // Scope anchor
                    {
                        id: newFileId, // Drive ID (The King)
                        name: fileName,
                        path: fullVirtualPath,
                        saga: sagaId || 'Global',
                        parentId: folderId,
                        category: 'canon'
                    },
                    fullContent,
                    embeddingsModel
                );

                // 🟢 METADATA ENRICHMENT (Post-Ingest)
                await db.collection("TDB_Index").doc(userId).collection("files").doc(newFileId).update({
                    smartTags: FieldValue.arrayUnion('CREATED_BY_SCRIBE'),
                    nexusId: nexusId
                });

                logger.info(`   🧠 [SCRIBE] Vectorized & Indexed: ${fileName}`);

            } catch (ingestErr) {
                logger.error("   🔥 [SCRIBE] Ingestion Failed:", ingestErr);
            }

            // B. Update Source (Radar)
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId).set({
                tier: 'ANCHOR',
                status: 'ANCHOR',
                driveId: newFileId,
                driveLink: file.data.webViewLink,
                lastSynced: FieldValue.serverTimestamp()
            }, { merge: true });

            // C. Update/Create Roster (The Character Sheet)
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
                nexusId: nexusId
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
 * THE WEAVER (El Tejedor)
 * Integrates a raw chat suggestion into the narrative flow seamlessly.
 */
export const integrateNarrative = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "1GiB",
        timeoutSeconds: 60,
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { suggestion, precedingContext, followingContext, userStyle } = request.data;

        // 🛡️ SECURITY: INPUT LIMITS
        if (suggestion && suggestion.length > MAX_AI_INPUT_CHARS) {
            throw new HttpsError("resource-exhausted", "Suggestion exceeds max input limit.");
        }

        if (!suggestion) {
            throw new HttpsError("invalid-argument", "Missing suggestion text.");
        }

        try {
            const userId = request.auth.uid;
            // 🟢 GENRE AWARENESS (Project Config)
            const projectConfig = await _getProjectConfigInternal(userId);

            const projectIdentityContext = `
=== PROJECT IDENTITY (GENRE & STYLE) ===
PROJECT NAME: ${projectConfig.projectName || 'Untitled Project'}
DETECTED STYLE DNA: ${projectConfig.styleIdentity || 'Standard Narrative'}
GENRE INSTRUCTION: Adopt the vocabulary, pacing, and atmosphere of this style.
========================================
`;

            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

            // 🟢 CONSTRUCT PROMPT
            const prompt = `
            ACT AS: Expert Ghostwriter & Narrative Editor.
            TASK: Transform the "SUGGESTION" into seamless narrative prose that fits the "CONTEXT".

            ${projectIdentityContext}

            INPUT DATA:
            - CONTEXT (Preceding): "...${(precedingContext || '').slice(-2000)}..."
            - CONTEXT (Following): "...${(followingContext || '').slice(0, 500)}..."
            - USER STYLE PREFERENCE: ${userStyle || 'Neutral/Standard'}
            - SUGGESTION (Raw Idea): "${suggestion}"

            INSTRUCTIONS:
            1. **Rewrite** the SUGGESTION into high-quality prose.
            2. **Match the Tone** of the Preceding Context AND the Project Style (Style DNA).
            3. **Remove Meta-Talk**: Strip out phrases like "Option 1:", "Sure, here is...", "I suggest...", or quotes around the whole block unless it's dialogue.
            4. **Seamless Flow**: The output should start naturally where the Preceding Context ends.
            5. **Do not repeat** the Preceding Context. Only output the NEW text to be inserted.
            6. **Strict Output**: Return ONLY the narrative text. No markdown fences. No "Here is the rewritten text".

            OUTPUT:
            `;

            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: true, // Flash is great for rewriting
                temperature: 0.7,
                contextLabel: "IntegrateNarrative"
            });

            let integratedText = (result.text || "").trim();

            if (integratedText.startsWith('```')) {
                integratedText = integratedText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
            }

            return { success: true, text: integratedText };

        } catch (error: any) {
            logger.error("🔥 Error del Tejedor (Integrate):", error);
            throw new HttpsError("internal", error.message || "Fallo al integrar narrativa.");
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
        enforceAppCheck: false,
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

        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. FETCH ORIGINAL CONTENT
            const getRes = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, parents',
                alt: 'media'
            });

            const metaRes = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, parents'
            });
            const fileName = metaRes.data.name || "Unknown.md";
            const parentId = metaRes.data.parents?.[0];

            const originalContent = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data);

            // 2. AI MERGE
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

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

            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: true,
                temperature: TEMP_PRECISION,
                contextLabel: "ScribePatch"
            });

            let newContent = result.text || "";

            if (!newContent) throw new Error(result.error || "Empty Patch Result");

            if (newContent.startsWith('```markdown')) newContent = newContent.replace(/^```markdown\n/, '').replace(/\n```$/, '');
            if (newContent.startsWith('```')) newContent = newContent.replace(/^```\n/, '').replace(/\n```$/, '');

            // 🟢 SMART-SYNC DELTA VALIDATOR (Middleware 3.0)
            // Logic: Compare Original vs New.
            // If Frontmatter changed -> Trust AI/User.
            // If Frontmatter UNCHANGED -> Check Body AST and sync to Frontmatter.

            let finalContent = newContent;
            try {
                const parsedNew = matter(newContent);
                const parsedOriginal = matter(originalContent);

                const newFm = parsedNew.data;
                const oldFm = parsedOriginal.data;
                const newBody = parsedNew.content;

                // A. DEBOUNCE CHECK
                const lastSync = newFm.last_titanium_sync ? new Date(newFm.last_titanium_sync).getTime() : 0;
                const now = Date.now();
                const timeDiff = now - lastSync;

                if (timeDiff < 5000) {
                     logger.info(`⏳ [SMART-SYNC] Skipping reconciliation (Debounce: ${timeDiff}ms)`);
                } else {
                    // B. AST EXTRACTION
                    const { name: extractedName, role: extractedRole } = extractMetadataFromBody(newBody);
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
                    if (hasChanges || !newFm.last_titanium_sync) {
                        logger.info(`🔄 [METADATA RECONCILIATION] Re-Forging via TitaniumFactory for ${fileId}`);

                        const entity: TitaniumEntity = {
                            id: attributes.id || fileId,
                            name: attributes.name || "Unknown",
                            traits: attributes.traits || legacyTypeToTraits(attributes.type || 'concept'),
                            attributes: attributes, // Factory will prune ghost data
                            bodyContent: newBody
                        };

                        finalContent = TitaniumFactory.forge(entity);
                    }
                }

            } catch (syncErr) {
                logger.warn(`⚠️ [SMART-SYNC] Failed to reconcile:`, syncErr);
                // Fallback to AI content
            }

            // 3. UPDATE FILE
            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'text/markdown',
                    body: finalContent
                }
            });

            // 4. AUTO-INDEX (FIRE & FORGET)
            const configRef = db.collection("users").doc(userId).collection("profile").doc("project_config");
            const configSnap = await configRef.get();
            const projectRootId = configSnap.exists ? configSnap.data()?.folderId : null;

            try {
                const embeddingsModel = new GeminiEmbedder({
                    apiKey: googleApiKey.value(),
                    model: "gemini-embedding-001",
                    taskType: TaskType.RETRIEVAL_DOCUMENT,
                });

                await ingestFile(
                    db,
                    userId,
                    projectRootId || parentId || "unknown_project",
                    {
                        id: fileId,
                        name: fileName,
                        path: fileName,
                        saga: 'Global',
                        parentId: parentId,
                        category: 'canon'
                    },
                    newContent,
                    embeddingsModel
                );
                logger.info(`   🧠 [SCRIBE] Re-indexed patched file: ${fileName}`);
            } catch (idxErr) {
                logger.warn("   ⚠️ [SCRIBE] Indexing failed after patch:", idxErr);
            }

            return { success: true, message: "Archivo actualizado (Cristalizado)." };

        } catch (error: any) {
            logger.error("🔥 Error del Restaurador (Patch):", error);
            throw new HttpsError("internal", error.message || "Fallo al actualizar el archivo.");
        }
    }
);

/**
 * THE GUIDE (El Guionista)
 * Transforms narrative text into a structured writing prompt/guide for the user.
 */
export const transformToGuide = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "1GiB",
        timeoutSeconds: 60,
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { text, perspective } = request.data;

        if (!text) {
            throw new HttpsError("invalid-argument", "Missing text to transform.");
        }

        try {
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

            const prompt = `
            ACT AS: Expert Writing Coach & Outliner.
            TASK: Transform the following NARRATIVE SCENE into a set of INSTRUCTIONS (Beats/Guide) for the author to write it themselves.

            OBJECTIVE:
            - The author does NOT want the AI to write the scene.
            - The author wants a STEP-BY-STEP GUIDE on what to write.
            - Summarize the key actions, dialogue ideas, and emotional beats from the text.
            - Format each point as a directive (e.g., "(Here describe X...)", "(Make the character feel Y...)").

            PERSPECTIVE CONTEXT: ${perspective || 'Unknown'}

            INPUT NARRATIVE:
            "${text}"

            OUTPUT FORMAT:
            - A list of short, parenthetical instructions.
            - Example:
              (Describe the cold wind hitting their face.)
              (Have them notice the strange mark on the door.)
              (Dialogue: They argue about the map.)

            STRICT OUTPUT: Return ONLY the list of instructions. No intro/outro.
            `;

            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: true, // Flash is great for rewriting
                temperature: 0.7,
                contextLabel: "TransformGuide"
            });

            let guideText = (result.text || "").trim();

            return { success: true, text: guideText };

        } catch (error: any) {
            logger.error("🔥 Error del Guionista (Transform):", error);
            throw new HttpsError("internal", error.message || "Fallo al transformar texto en guía.");
        }
    }
);
