import './admin'; // Ensure firebase-admin is initialized
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey } from "./utils/security";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";

// --- RE-EXPORTS (Modular Architecture) ---

export { exchangeAuthCode, refreshDriveToken, revokeDriveAccess } from './auth';
export { auditContent, purgeEcho, scanProjectDrift, rescueEcho } from './guardian';
export { scribeCreateFile, integrateNarrative, scribePatchFile, transformToGuide, syncSmart } from './scribe';
export {
    discoverFolderRoles,
    createTitaniumStructure,
    renameDriveFolder,
    trashDriveItems,
    getBatchDriveMetadata,
    getFileSystemNodes
} from './folder_manager';
export { nukeProject, purgeForgeDatabase } from './nuke';
export {
    scanVaultHealth,
    purgeArtifacts,
    purgeEmptySessions,
    purgeForgeEntities,
    relinkAnchor
} from './janitor';
export { classifyResource } from './laboratory';
export { acquireLock, releaseLock, checkIndexStatus } from './librarian';
export { crystallizeGraph, crystallizeForgeEntity } from './crystallization';
export { generateAuditPDF, generateCertificate } from './audit';
export { analyzeStyleDNA } from './analyst';
export { generateSpeech, analyzeScene } from './tts';

// --- CORE HANDLERS (Bridge) ---

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_FILE_SAVE_BYTES = 5 * 1024 * 1024;

/**
 * PHASE 6.2: MATERIALIZATION (AI TOOLS)
 * Crea un archivo físico a petición de la IA.
 */
export const forgeToolExecution = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        secrets: [googleApiKey],
        memory: "1GiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");

        const { title, content, folderId, accessToken } = request.data;
        if (!title || !content || !folderId) {
            throw new HttpsError("invalid-argument", "Faltan argumentos (title, content, folderId).");
        }

        if (typeof content === 'string' && content.length > MAX_FILE_SAVE_BYTES) {
            throw new HttpsError("resource-exhausted", `Content exceeds limit of ${MAX_FILE_SAVE_BYTES / 1024 / 1024}MB.`);
        }

        if (!accessToken) throw new HttpsError("unauthenticated", "Falta accessToken.");

        const userId = request.auth.uid;

        logger.info(`🔨 TOOL EXECUTION: Creating file '${title}' in ${folderId}`);

        try {
            const genesisResult = await TitaniumGenesis.birth({
                userId: userId,
                name: title,
                context: content,
                targetFolderId: folderId,
                accessToken: accessToken,
                projectId: folderId,
                aiKey: getAIKey(request.data, googleApiKey.value()),
                role: "Tool Generated",
            });

            logger.info(`   ✅ Materialización exitosa: ${genesisResult.fileId}`);

            return {
                success: true,
                fileId: genesisResult.fileId,
                webViewLink: genesisResult.webViewLink,
                message: `Archivo '${title}' forjado con éxito.`
            };

        } catch (error: any) {
            logger.error("Forge Tool Execution Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * SAVE DRIVE FILE (Auto-Save Bridge)
 * Directly updates a file in Google Drive.
 */
export const saveDriveFile = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { fileId, content, accessToken } = request.data;
        if (!fileId || !content || !accessToken) throw new HttpsError("invalid-argument", "Missing params.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: 'text/markdown',
                    body: content
                }
            });

            logger.info(`💾 [SAVE] File updated: ${fileId}`);
            return { success: true };
        } catch (error: any) {
            logger.error("Save Drive File Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * GET DRIVE FILE CONTENT
 * Simple bridge to fetch content for the frontend.
 */
export const getDriveFileContent = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { fileId, accessToken } = request.data;
        if (!fileId || !accessToken) throw new HttpsError("invalid-argument", "Missing params.");

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            const { _getDriveFileContentInternal } = await import('./utils/drive');
            const content = await _getDriveFileContentInternal(drive, fileId);

            const meta = await drive.files.get({ fileId: fileId, fields: "name" });

            return { success: true, content: content, name: meta.data.name };
        } catch (error: any) {
            logger.error("Get Drive File Content Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * GET DRIVE FILES
 * Lists files across one or more folders.
 * Accepts: { folderIds: string[], accessToken, recursive?, persist? }
 */
export const getDriveFiles = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 120,
        memory: "512MiB",
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        // 🟢 Support both legacy { folderId } and new { folderIds[] }
        const { folderId, folderIds, accessToken, recursive } = request.data;
        const targetIds: string[] = folderIds?.length > 0
            ? folderIds
            : folderId ? [folderId] : [];

        if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken.");
        if (targetIds.length === 0) {
            // Empty list is valid (e.g., clearing configuration)
            return { success: true, files: [] };
        }

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // Fetch contents of all requested folders in parallel
            const results = await Promise.all(
                targetIds.map(async (id) => {
                    const res = await drive.files.list({
                        q: `'${id}' in parents and trashed = false`,
                        fields: "files(id, name, mimeType, webViewLink)",
                        spaces: 'drive',
                        pageSize: 1000,
                    });
                    return {
                        id,
                        children: res.data.files || []
                    };
                })
            );

            // Return flat list or structured list depending on number of folders
            if (targetIds.length === 1) {
                return { success: true, files: results[0].children };
            }
            // Multi-folder: return as array of { id, children[] }
            return { success: true, files: results };

        } catch (error: any) {
            logger.error("Get Drive Files Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * SAVE PROJECT CONFIG
 * Persists project-specific settings to Firestore.
 */
export const saveProjectConfig = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("profile").doc("project_config").set({
                ...request.data,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            return { success: true };
        } catch (error: any) {
            logger.error("Save Project Config Failed:", error);
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * FORGE MESSAGE MANAGEMENT
 */
export const addForgeMessage = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId, role, text } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
            await sessionRef.collection("messages").add({
                role,
                text,
                timestamp: FieldValue.serverTimestamp()
            });

            // Update session heartbeat
            await sessionRef.set({ lastActivity: FieldValue.serverTimestamp() }, { merge: true });

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

export const clearSessionMessages = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            const messagesRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).collection("messages");
            const snapshot = await messagesRef.get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

export const deleteForgeSession = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { sessionId } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).delete();
            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * UPDATE FORGE CHARACTER
 */
export const updateForgeCharacter = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { characterId, data } = request.data;
        const userId = request.auth.uid;
        const db = getFirestore();

        try {
            await db.collection("users").doc(userId).collection("forge_detected_entities").doc(characterId).set({
                ...data,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            return { success: true };
        } catch (error: any) {
            throw new HttpsError('internal', error.message);
        }
    }
);

/**
 * INDEX TDB (Stub for Indexing)
 * In a real scenario, this would trigger the full ingestion of a folder.
 */
export const indexTDB = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        memory: "1GiB",
        timeoutSeconds: 300,
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        logger.info("🧠 [INDEX TDB] Indexing requested. (Logic should be implemented in a dedicated service)");

        // Return dummy success to unblock UI
        return { success: true, message: "Indexing protocol initiated (Simulation)." };
    }
);

/**
 * SUMMON THE TRIBUNAL
 * Three ruthless AI judges evaluate a piece of writing and issue a verdict.
 * Modes:
 *   - Manual: { text: string, context?: string }
 *   - File:   { fileId: string, accessToken: string, context?: string }
 * Returns: { architect, bard, hater } each with { verdict, critique, score }
 */
export const summonTheTribunal = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 540,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");

        let { text, context, fileId, accessToken } = request.data;

        // Resolve text from Drive file if fileId provided
        if (fileId && accessToken && !text) {
            try {
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: accessToken });
                const drive = google.drive({ version: "v3", auth });
                text = await _getDriveFileContentInternal(drive, fileId);
            } catch (e: any) {
                logger.error("[TRIBUNAL] Failed to read Drive file:", e);
                throw new HttpsError("internal", "No se pudo leer el archivo de Drive.");
            }
        }

        if (!text || text.trim().length < 10) {
            throw new HttpsError("invalid-argument", "El texto para juzgar es demasiado corto.");
        }

        const MAX_CHARS = 50000;
        const safeText = text.substring(0, MAX_CHARS);
        const safeContext = (context || "").substring(0, 5000);

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        const JUDGE_PROMPT = (role: string, persona: string, focus: string) => `
ACT AS: ${persona}
YOU ARE ONE OF THREE JUDGES ON THE LITERARY TRIBUNAL.
ROLE: ${role}

CONTEXT (provided by the author):
"${safeContext || 'No additional context provided.'}"

TEXT TO JUDGE:
"""${safeText}"""

YOUR FOCUS: ${focus}

INSTRUCTIONS:
- Be direct, specific, and ruthless but fair.
- Quote specific lines when praising or criticizing.
- Detect the language of the text and respond in THE SAME LANGUAGE.
- Do NOT be generic. Every comment must be about THIS specific text.

OUTPUT JSON:
{
  "verdict": "One powerful sentence — your headline verdict.",
  "critique": "3-5 sentences of detailed analysis. Quote specific lines.",
  "score": 7
}
`;

        try {
            const [architectResult, bardResult, haterResult] = await Promise.all([
                smartGenerateContent(genAI, JUDGE_PROMPT(
                    'THE ARCHITECT',
                    'The Architect — Master of Structure & Logic',
                    'Narrative structure, plot coherence, pacing, and logical consistency. Find plot holes and structural weaknesses.'
                ), { useFlash: false, jsonMode: true, temperature: 0.4, contextLabel: 'TribunalArchitect' }),

                smartGenerateContent(genAI, JUDGE_PROMPT(
                    'THE BARD',
                    'The Bard — Lover of Voice, Prose & Emotion',
                    'Prose quality, voice, emotional resonance, imagery, and dialogue authenticity. Find what sings and what falls flat.'
                ), { useFlash: false, jsonMode: true, temperature: 0.6, contextLabel: 'TribunalBard' }),

                smartGenerateContent(genAI, JUDGE_PROMPT(
                    'EL HATER',
                    'El Hater — Ruthless Devil\'s Advocate',
                    'Everything that is weak, clichéd, confusing, or forgettable. Be specific and unforgiving. Find what would make a reader stop reading.'
                ), { useFlash: false, jsonMode: true, temperature: 0.8, contextLabel: 'TribunalHater' }),
            ]);

            const parseJudge = (result: any, fallbackName: string) => {
                if (result.error || !result.text) {
                    return { verdict: 'El Juez se negó a hablar.', critique: result.error || 'Sin respuesta.', score: 5 };
                }
                const parsed = parseSecureJSON(result.text, fallbackName);
                if (parsed.error) {
                    return { verdict: 'Error al parsear veredicto.', critique: result.text?.substring(0, 500) || '', score: 5 };
                }
                return {
                    verdict: parsed.verdict || '',
                    critique: parsed.critique || '',
                    score: Math.max(0, Math.min(10, parseInt(parsed.score) || 5))
                };
            };

            return {
                architect: parseJudge(architectResult, 'TribunalArchitect'),
                bard: parseJudge(bardResult, 'TribunalBard'),
                hater: parseJudge(haterResult, 'TribunalHater'),
            };

        } catch (error: any) {
            logger.error("[TRIBUNAL] Session failed:", error);
            throw new HttpsError("internal", error.message || "El Tribunal colapsó.");
        }
    }
);
