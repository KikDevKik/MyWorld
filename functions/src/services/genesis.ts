import '../admin'; // Ensure firebase-admin is initialized
import * as logger from "firebase-functions/logger";
import * as crypto from 'crypto';
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI, TaskType } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";
import { TitaniumEntity, EntityTrait } from "../types/ontology";
import { TitaniumFactory } from "./factory";
import { ingestFile } from "../ingestion";
import { GeminiEmbedder } from "../utils/vector_utils";
import { updateFirestoreTree } from "../utils/tree_utils";
import { smartGenerateContent } from "../utils/smart_generate";
import { parseSecureJSON } from "../utils/json";
import { legacyTypeToTraits } from "../utils/legacy_adapter";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

/**
 * 🌌 TITANIUM GENESIS (The Single Source of Creation)
 * Abstracts the birth of an entity across all tools (Scribe, Crystal, Forge).
 * Enforces V3.0 Ontology and handles Drive/Firestore lifecycle.
 */
export class TitaniumGenesis {

    /**
     * Births a new entity into existence.
     * 1. Infer Traits (if needed)
     * 2. Construct TitaniumEntity
     * 3. Forge Content (Factory)
     * 4. Create Drive File
     * 5. Index (Firestore)
     */
    static async birth(payload: {
        userId: string;
        name: string;
        context: string; // The "DNA" source (Chat, Graph Node, etc.)
        targetFolderId: string;
        accessToken: string;
        projectId: string; // The "Saga" or Root Folder ID

        // Optional Overrides
        inferredTraits?: EntityTrait[];
        role?: string;
        summary?: string;
        filenameOverride?: string;
        attributes?: Record<string, any>;

        // AI Config
        aiKey: string;
    }): Promise<{
        fileId: string;
        nexusId: string;
        webViewLink: string;
        rosterId: string;
    }> {
        const { userId, name, context, targetFolderId, accessToken, projectId, aiKey } = payload;
        const db = getFirestore();

        // 1. TRAIT INFERENCE (If not provided)
        let traits = payload.inferredTraits;

        if (!traits || traits.length === 0) {
            try {
                // If we have a legacy type in attributes, use adapter
                if (payload.attributes?.type) {
                    traits = legacyTypeToTraits(payload.attributes.type);
                } else {
                    // AI Inference
                    const genAI = new GoogleGenerativeAI(aiKey);
                    const prompt = `
                        TASK: Classify the Entity based on the name and context.
                        NAME: "${name}"
                        CONTEXT: "${context.substring(0, 1000)}"

                        TRAITS (Select all that apply):
                        - 'sentient': Has agency/dialogue (Character, AI).
                        - 'tangible': Physical object/being.
                        - 'locatable': Can be visited (Place).
                        - 'temporal': Event/Scene.
                        - 'organized': Group/Faction.
                        - 'abstract': Concept/Lore.

                        OUTPUT JSON: { "traits": ["trait1", "trait2"] }
                    `;

                    const result = await smartGenerateContent(genAI, prompt, {
                        useFlash: true,
                        jsonMode: true,
                        temperature: 0.2,
                        contextLabel: "GenesisInference"
                    });

                    if (result.text) {
                        const parsed = parseSecureJSON(result.text, "GenesisInference");
                        if (parsed.traits && Array.isArray(parsed.traits)) {
                            traits = parsed.traits;
                        }
                    }
                }
            } catch (e) {
                logger.warn("⚠️ Genesis Inference Failed, defaulting to Abstract:", e);
                traits = ['abstract'];
            }
        }

        // Fallback
        if (!traits || traits.length === 0) traits = ['abstract'];

        // 2. CONSTRUCT TITANIUM ENTITY
        const safeName = name.replace(/[^a-zA-Z0-9À-ÿ\s\-_]/g, '').trim();
        const fileName = payload.filenameOverride || `${safeName}.md`;

        // Deterministic ID (Nexus Link)
        const nexusId = crypto.createHash('sha256').update(targetFolderId + fileName).digest('hex');

        // Construct Body
        const bodyContent = payload.context.startsWith('#')
            ? payload.context // Already formatted?
            : `## 📝 Descripción\n${payload.summary || payload.context}\n`;

        const entity: TitaniumEntity = {
            id: nexusId,
            name: name,
            traits: traits,
            attributes: {
                role: payload.role,
                project_id: projectId,
                tags: payload.attributes?.tags || [],
                aliases: payload.attributes?.aliases || [],
                // Spread other custom attributes
                ...payload.attributes,

                // System Block
                _sys: {
                    status: 'active',
                    tier: 'ANCHOR',
                    last_sync: new Date().toISOString(),
                    schema_version: '3.0',
                    nexus_id: nexusId
                }
            },
            bodyContent: bodyContent
        };

        // 3. FORGE CONTENT (Factory)
        const finalContent = TitaniumFactory.forge(entity);

        // 4. CREATE DRIVE FILE
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const drive = google.drive({ version: "v3", auth });

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

        const newFileId = file.data.id;
        if (!newFileId) throw new Error("Drive Creation Failed");

        logger.info(`✅ [GENESIS] Created File: ${fileName} (${newFileId})`);

        // 5. PERSISTENCE & INDEXING

        // A. Firestore Tree (Navigation)
        await updateFirestoreTree(userId, 'add', newFileId, {
            parentId: targetFolderId,
            newNode: {
                id: newFileId,
                name: fileName,
                mimeType: 'text/markdown',
                driveId: newFileId,
                type: 'file'
            }
        });

        // B. TDB_Index (Search/Smart Sync)
        await db.collection("TDB_Index").doc(userId).collection("files").doc(nexusId).set({
            name: fileName,
            path: fileName, // Virtual path relative to parent
            driveId: newFileId,
            lastIndexed: new Date().toISOString(),
            contentHash: crypto.createHash('sha256').update(finalContent).digest('hex'),
            category: 'canon',
            isGhost: false,
            smartTags: ['CREATED_BY_TITANIUM']
        }, { merge: true });

        // C. RAG Ingestion (Async/Fire & Forget)
        try {
            const embeddingsModel = new GeminiEmbedder({
                apiKey: aiKey,
                model: "gemini-embedding-001",
                taskType: TaskType.RETRIEVAL_DOCUMENT,
            });

            await ingestFile(
                db,
                userId,
                projectId,
                {
                    id: newFileId,
                    name: fileName,
                    path: fileName,
                    saga: 'Global',
                    parentId: targetFolderId,
                    category: 'canon'
                },
                finalContent,
                embeddingsModel
            );
            logger.info(`🧠 [GENESIS] Auto-indexed ${fileName}`);
        } catch (idxErr) {
            logger.warn(`⚠️ [GENESIS] Auto-index failed for ${fileName}:`, idxErr);
        }

        // D. Roster Entry (If Sentient)
        const rosterId = safeName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        if (traits.includes('sentient')) {
            const rosterRef = db.collection("users").doc(userId).collection("characters").doc(rosterId);
            await rosterRef.set({
                id: rosterId,
                name: name,
                role: payload.role || "Personaje",
                tier: 'MAIN',
                status: 'EXISTING',
                sourceType: 'MASTER',
                sourceContext: 'Global',
                masterFileId: newFileId,
                lastUpdated: new Date().toISOString(),
                isAIEnriched: true,
                nexusId: nexusId
            }, { merge: true });
        }

        return {
            fileId: newFileId,
            nexusId: nexusId,
            webViewLink: file.data.webViewLink || "",
            rosterId: rosterId
        };
    }
}
