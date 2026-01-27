import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_LOW_COST, TEMP_PRECISION } from "./ai_config";
import { parseSecureJSON } from "./utils/json";

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

        const { nodes, folderId, subfolderName, accessToken, chatContext, projectId } = request.data as CrystallizeGraphRequest;

        if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
            throw new HttpsError("invalid-argument", "No nodes provided to crystallize.");
        }
        if (!folderId) throw new HttpsError("invalid-argument", "Target folder ID is required.");
        if (!accessToken) throw new HttpsError("unauthenticated", "Google Access Token is required.");

        const userId = request.auth.uid;
        const genAI = new GoogleGenerativeAI(googleApiKey.value());
        const model = genAI.getGenerativeModel({
            model: MODEL_LOW_COST,
            generationConfig: {
                temperature: TEMP_PRECISION,
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

        let successCount = 0;
        let failCount = 0;
        const createdFiles: Array<{ id: string; name: string }> = [];

        // BATCH PROCESSING (3 at a time)
        const BATCH_SIZE = 3;
        for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
            const batch = nodes.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (node) => {
                try {
                    // 1. GENERATE CONTENT (AI)
                    const prompt = `
                        ACT AS: Expert Lore Writer & Archivist.
                        TASK: Create a comprehensive Markdown file for the entity "${node.name}" (${node.type}).

                        CONTEXT FROM BUILDER SESSION:
                        ${chatContext || "No specific session context provided."}

                        ENTITY DATA:
                        Name: ${node.name}
                        Type: ${node.type}
                        Description: ${node.description}

                        INSTRUCTIONS:
                        1. Synthesize the session context and entity data into a rich, structured document.
                        2. Use Markdown headers (#, ##).
                        3. Include sections appropriate for the type (e.g., Appearance, Personality, History for Characters; Geography, History for Locations).
                        4. DO NOT include the Frontmatter (YAML) in the output text, I will add it programmatically. Just the body content.
                        5. The tone should be encyclopedic yet evocative.
                    `;

                    const aiRes = await model.generateContent(prompt);
                    const bodyContent = aiRes.response.text();

                    // 2. CONSTRUCT FRONTMATTER
                    const frontmatter = [
                        "---",
                        `uuid: "${node.id}"`,
                        `type: "${node.type}"`,
                        `project_id: "${projectId}"`,
                        `created_at: "${new Date().toISOString()}"`,
                        `tags: [${node.type}]`,
                        "---"
                    ].join("\n");

                    const finalContent = `${frontmatter}\n\n${bodyContent}`;

                    // 3. SAVE TO DRIVE
                    const fileName = `${node.name.replace(/[^a-zA-Z0-9_\-\s]/g, '')}.md`;
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
                        // 4. UPDATE FIRESTORE (Promote from Ghost)
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
                            masterFileId: file.data.id,
                            lastUpdated: new Date().toISOString()
                        }, { merge: true });

                        createdFiles.push({ id: file.data.id, name: fileName });
                        successCount++;
                    }

                } catch (err: any) {
                    logger.error(`❌ Failed to crystallize node ${node.name}:`, err);
                    failCount++;
                }
            }));
        }

        return {
            success: true,
            created: successCount,
            failed: failCount,
            files: createdFiles
        };
    }
);
