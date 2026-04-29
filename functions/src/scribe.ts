import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { resolveVirtualPath } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";
import { smartGenerateContent } from "./utils/smart_generate";
import { getAIKey, escapePromptVariable, getTier } from "./utils/security";
import { TitaniumGenesis } from "./services/genesis";
import { ProjectConfig } from "./types/project";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { SmartSyncService } from "./services/smart_sync";
import { GeminiEmbedder } from "./utils/vector_utils";
import { TaskType } from "@google/generative-ai";
import { ingestFile } from "./ingestion";
import { google } from "googleapis";
import { TEMP_PRECISION } from "./ai_config";

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
        logger.info(`✍️ SCRIBE: Forging file for ${entityData.name} (${entityId})`);

        try {
            let finalBodyContent: string | undefined = undefined;

            // 🟢 INTELLIGENT INFERENCE (If type is generic/missing)
            if ((!entityData.type || entityData.type === 'concept') && chatContent) {
                try {
                    logger.info(`🧠 SCRIBE INFERENCE: Detecting type for ${entityData.name}`);
                    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
                    const tier = getTier(request.data);

                    const inferencePrompt = `
                    TASK: Extrae componentes para una 'WorldEntity' descrita en el texto.
                    ENTITY NAME: "${escapePromptVariable(entityData.name)}"
                    CONTEXT: "${escapePromptVariable(chatContent.substring(0, 5000))}"

                    REGLAS STRICTAS:
                    - NO devuelvas "tipos" monolíticos (ej. character, location).
                    - Devuelve ÚNICAMENTE un JSON con los siguientes módulos de datos:
                    
                    OUTPUT JSON FORMAT:
                    {
                      "forge": {
                         "tags": ["Array de tags de 1 palabra para la Forja"],
                         "summary": "Resumen de 1-2 oraciones del rol de la entidad"
                      },
                      "nexus": {
                         "relations": [
                             { "targetId": "Nombre de otra entidad", "relationType": "ALLY | ENEMY | FAMILY | NEUTRAL", "context": "Por qué están relacionados" }
                         ]
                      }
                    }
                    `;

                    const result = await smartGenerateContent(genAI, inferencePrompt, {
                        _tier: tier, taskType: 'high_volume',
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
                    const tier = getTier(request.data);

                    const synthesisPrompt = `
                    TASK: Create a rich Markdown document based on the following BRAINSTORMING SESSION.
                    SUBJECT: "${escapePromptVariable(entityData.name)}"
                    TYPE: "${escapePromptVariable(entityData.type || 'Concept')}"

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
                    "${escapePromptVariable(chatContent.substring(0, 10000))}"

                    OUTPUT:
                    `;

                    const result = await smartGenerateContent(genAI, synthesisPrompt, {
                        _tier: tier, taskType: 'standard',
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

            const bodyToUse = finalBodyContent || defaultBody;

            // 🚀 TITANIUM GENESIS: BIRTH ENTITY
            const genesisResult = await TitaniumGenesis.birth({
                userId: userId,
                name: entityData.name,
                context: bodyToUse,
                targetFolderId: folderId,
                accessToken: accessToken,
                projectId: sagaId || 'Global',
                role: entityData.role,
                aiKey: getAIKey(request.data, googleApiKey.value()),
                attributes: {
                    type: entityData.type, // Legacy support
                    aliases: entityData.aliases,
                    tags: entityData.tags
                }
            });

            // Update Source (Radar)
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(entityId).set({
                tier: 'ANCHOR',
                status: 'ANCHOR',
                driveId: genesisResult.fileId,
                driveLink: genesisResult.webViewLink,
                lastSynced: FieldValue.serverTimestamp()
            }, { merge: true });

            return {
                success: true,
                driveId: genesisResult.fileId,
                rosterId: genesisResult.rosterId,
                nexusId: genesisResult.nexusId,
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
PROJECT NAME: "${escapePromptVariable(projectConfig.projectName || 'Untitled Project')}"
DETECTED STYLE DNA: "${escapePromptVariable(projectConfig.styleIdentity || 'Standard Narrative')}"
GENRE INSTRUCTION: Adopt the vocabulary, pacing, and atmosphere of this style.
========================================
`;

            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const tier = getTier(request.data);

            // 🟢 CONSTRUCT PROMPT
            const prompt = `
            ACT AS: Expert Ghostwriter & Narrative Editor.
            TASK: Transform the "SUGGESTION" into seamless narrative prose that fits the "CONTEXT".

            ${projectIdentityContext}

            INPUT DATA:
            - CONTEXT (Preceding): "...${escapePromptVariable((precedingContext || '').slice(-2000))}..."
            - CONTEXT (Following): "...${escapePromptVariable((followingContext || '').slice(0, 500))}..."
            - USER STYLE PREFERENCE: "${escapePromptVariable(userStyle || 'Neutral/Standard')}"
            - SUGGESTION (Raw Idea): "${escapePromptVariable(suggestion)}"

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
                _tier: tier, taskType: 'standard',
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

            let originalContent = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data);

            // 🛡️ SOVEREIGN AREAS PROTECTION (Via Middleware)
            // Mask protected areas before AI touches it
            const { protectedContent, map: sovereignMap } = SmartSyncService.protectSovereignAreas(originalContent);

            // Use protected content for AI Context
            const contextForAI = protectedContent;

            // 2. AI MERGE
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const tier = getTier(request.data);

            const prompt = `
            ACT AS: Expert Markdown Editor & Archivist.
            TASK: Integrate the "New Patch" into the "Existing File" intelligently.

            INSTRUCTIONS:
            "${escapePromptVariable(instructions || "Find the most relevant section for this new information and append it. If no relevant section exists, create a new H2 header.")}"

            RULES:
            1. PRESERVE Frontmatter (--- ... ---) exactly as is.
            2. PRESERVE existing content. Only append or insert. Do not delete.
            3. PRESERVE Sovereign Blocks ({{SOVEREIGN_BLOCK_X}}) exactly as is.
            4. OUTPUT the FULL, VALID Markdown file content.
            5. Do NOT wrap output in \`\`\`markdown code blocks. Return RAW text.

            EXISTING FILE:
            "${escapePromptVariable(contextForAI)}"

            NEW PATCH:
            "${escapePromptVariable(patchContent)}"
            `;

            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier, taskType: 'standard',
                temperature: TEMP_PRECISION,
                contextLabel: "ScribePatch"
            });

            let newContent = result.text || "";

            if (!newContent) throw new Error(result.error || "Empty Patch Result");

            if (newContent.startsWith('```markdown')) newContent = newContent.replace(/^```markdown\n/, '').replace(/\n```$/, '');
            if (newContent.startsWith('```')) newContent = newContent.replace(/^```\n/, '').replace(/\n```$/, '');

            // 🛡️ RESTORE SOVEREIGN AREAS (Via Middleware)
            newContent = SmartSyncService.restoreSovereignAreas(newContent, sovereignMap);

            // 🟢 SMART-SYNC DELTA VALIDATOR (Middleware 3.0)
            // Reconcile and Enforce Schema
            const finalContent = await SmartSyncService.reconcile(userId, fileId, originalContent, newContent);

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
                        path: fileName, // Use simpler path for ingestion re-indexing
                        saga: 'Global',
                        parentId: parentId,
                        category: 'canon'
                    },
                    finalContent,
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
            const tier = getTier(request.data);

            const prompt = `
            ACT AS: Expert Writing Coach & Outliner.
            TASK: Transform the following NARRATIVE SCENE into a set of INSTRUCTIONS (Beats/Guide) for the author to write it themselves.

            OBJECTIVE:
            - The author does NOT want the AI to write the scene.
            - The author wants a STEP-BY-STEP GUIDE on what to write.
            - Summarize the key actions, dialogue ideas, and emotional beats from the text.
            - Format each point as a directive (e.g., "(Here describe X...)", "(Make the character feel Y...)").

            PERSPECTIVE CONTEXT: "${escapePromptVariable(perspective || 'Unknown')}"

            INPUT NARRATIVE:
            "${escapePromptVariable(text)}"

            OUTPUT FORMAT:
            - A list of short, parenthetical instructions.
            - Example:
              (Describe the cold wind hitting their face.)
              (Have them notice the strange mark on the door.)
              (Dialogue: They argue about the map.)

            STRICT OUTPUT: Return ONLY the list of instructions. No intro/outro.
            `;

            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier, taskType: 'standard',
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

/**
 * SMART SYNC (Sincronización Inteligente)
 * Scans the Google Drive folder for external changes (added/deleted files)
 * and updates the local TDB_Index.
 */
export const syncSmart = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 120,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { accessToken } = request.data;
        if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken");

        const userId = request.auth.uid;
        logger.info(`🔄 SMART SYNC: Initiated for user ${userId}`);

        try {
            // TODO: Extract actual Drive traversal and delta calculation logic here
            // For now, return a successful dummy response to unblock the frontend's initialization
            // The frontend expects: { added: number, deleted: number, success: boolean }

            return {
                success: true,
                added: 0,
                deleted: 0
            };

        } catch (error: any) {
            logger.error("🔥 Smart Sync Failed:", error);
            throw new HttpsError("internal", error.message || "Smart Sync failed.");
        }
    }
);
