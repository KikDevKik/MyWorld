import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as crypto from 'crypto';
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE } from "./ai_config";
import { generateAnchorContent, AnchorTemplateData } from "./templates/forge";
import { resolveVirtualPath } from "./utils/drive";
import { parseSecureJSON } from "./utils/json";
import { updateFirestoreTree } from "./utils/tree_utils";
import { ingestFile } from "./ingestion";
import { GeminiEmbedder } from "./utils/vector_utils";

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
            let finalBodyContent: string | undefined = undefined;

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

            // 🟢 SYNTHESIS MODE (The "Idea Laboratory" Request)
            if (request.data.synthesize && chatContent) {
                try {
                    logger.info(`🧪 SCRIBE SYNTHESIS: Converting chat to Markdown for ${entityData.name}`);
                    const genAI = new GoogleGenerativeAI(googleApiKey.value());
                    const model = genAI.getGenerativeModel({
                        model: MODEL_LOW_COST,
                        safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                        generationConfig: { temperature: 0.5 }
                    });

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

                    const result = await model.generateContent(synthesisPrompt);
                    let synthesis = result.response.text();

                    // Cleanup fences
                    if (synthesis.startsWith('```markdown')) synthesis = synthesis.replace(/^```markdown\n/, '').replace(/\n```$/, '');
                    if (synthesis.startsWith('```')) synthesis = synthesis.replace(/^```\n/, '').replace(/\n```$/, '');

                    finalBodyContent = synthesis;

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
                status: 'active',
                rawBodyContent: finalBodyContent // 🟢 Inject Synthesized Body if available
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

            // A. FIRE & FORGET VECTORIZATION (Server-Side Trigger) ⚡
            // We await it to ensure consistency per "Titanium" contract (Stability > Speed)
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
                // Ingest sets basic fields. We add specific Scribe tags here.
                await db.collection("TDB_Index").doc(userId).collection("files").doc(newFileId).update({
                    smartTags: FieldValue.arrayUnion('CREATED_BY_SCRIBE'),
                    nexusId: nexusId // Link back to determinism
                });

                logger.info(`   🧠 [SCRIBE] Vectorized & Indexed: ${fileName}`);

            } catch (ingestErr) {
                logger.error("   🔥 [SCRIBE] Ingestion Failed:", ingestErr);
                // We don't fail the request, but we log critically.
            }

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
 * THE WEAVER (El Tejedor)
 * Integrates a raw chat suggestion into the narrative flow seamlessly.
 */
export const integrateNarrative = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
        memory: "1GiB",
        timeoutSeconds: 60,
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        const { suggestion, precedingContext, followingContext, userStyle } = request.data;

        if (!suggestion) {
            throw new HttpsError("invalid-argument", "Missing suggestion text.");
        }

        try {
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST, // Flash is fast and sufficient for rewriting
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: { temperature: 0.7 } // Creative but grounded
            });

            // 🟢 CONSTRUCT PROMPT
            const prompt = `
            ACT AS: Expert Ghostwriter & Narrative Editor.
            TASK: Transform the "SUGGESTION" into seamless narrative prose that fits the "CONTEXT".

            INPUT DATA:
            - CONTEXT (Preceding): "...${(precedingContext || '').slice(-2000)}..."
            - CONTEXT (Following): "...${(followingContext || '').slice(0, 500)}..."
            - USER STYLE: ${userStyle || 'Neutral/Standard'}
            - SUGGESTION (Raw Idea): "${suggestion}"

            INSTRUCTIONS:
            1. **Rewrite** the SUGGESTION into high-quality prose.
            2. **Match the Tone** of the Preceding Context (First/Third person, Tense, Vocabulary).
            3. **Remove Meta-Talk**: Strip out phrases like "Option 1:", "Sure, here is...", "I suggest...", or quotes around the whole block unless it's dialogue.
            4. **Seamless Flow**: The output should start naturally where the Preceding Context ends.
            5. **Do not repeat** the Preceding Context. Only output the NEW text to be inserted.
            6. **Strict Output**: Return ONLY the narrative text. No markdown fences. No "Here is the rewritten text".

            OUTPUT:
            `;

            const result = await model.generateContent(prompt);
            let integratedText = result.response.text().trim();

            // Cleanup fences if any
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

            // Note: get with alt='media' returns body. Metadata requires separate call or fields on get (but alt=media overrides fields?).
            // The googleapis typings are tricky. Usually need two calls for metadata + content if alt=media.
            // But let's assume we get body. We need name/parent for Ingest.

            const metaRes = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, parents'
            });
            const fileName = metaRes.data.name || "Unknown.md";
            const parentId = metaRes.data.parents?.[0];

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

            // 🟢 4. AUTO-INDEX (FIRE & FORGET)
            // Fix: Resolve Project Root ID
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
                    projectRootId || parentId || "unknown_project", // Correctly resolved root
                    {
                        id: fileId,
                        name: fileName,
                        path: fileName, // Simplified path
                        saga: 'Global',
                        parentId: parentId,
                        category: 'canon' // Patched files are usually canon
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
        enforceAppCheck: true,
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
            const genAI = new GoogleGenerativeAI(googleApiKey.value());
            const model = genAI.getGenerativeModel({
                model: MODEL_LOW_COST,
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
                generationConfig: { temperature: 0.7 }
            });

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

            const result = await model.generateContent(prompt);
            let guideText = result.response.text().trim();

            return { success: true, text: guideText };

        } catch (error: any) {
            logger.error("🔥 Error del Guionista (Transform):", error);
            throw new HttpsError("internal", error.message || "Fallo al transformar texto en guía.");
        }
    }
);
