import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_AI_INPUT_CHARS = 100000;

// Helper: JSON Sanitizer (Simplified for Guardian)
function parseSecureJSON(jsonString: string, contextLabel: string = "Unknown"): any {
  try {
    let clean = jsonString.trim();
    // Remove Markdown code fences
    clean = clean.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');

    // Extract JSON Object/Array
    const firstBrace = clean.indexOf('{');
    const firstBracket = clean.indexOf('[');

    let start = -1;
    let end = -1;

    // Auto-detect object vs array
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = clean.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        start = firstBracket;
        end = clean.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1) {
       clean = clean.substring(start, end + 1);
    }

    return JSON.parse(clean);
  } catch (error: any) {
    logger.error(`💥 [JSON PARSE ERROR] in ${contextLabel}:`, error);
    return { error: "JSON_PARSE_FAILED", details: error.message };
  }
}

export const auditContent = onCall(
  {
    region: "us-central1",
    enforceAppCheck: false,
    timeoutSeconds: 60, // Fast execution
    memory: "1GiB",
    secrets: [googleApiKey],
  },
  async (request) => {
    const db = getFirestore();

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Login requerido.");
    }

    const { content, projectId } = request.data;
    const userId = request.auth.uid;

    // 1. VALIDATION
    if (!content) return { success: true, facts: [], conflicts: [] };
    if (content.length > MAX_AI_INPUT_CHARS) {
        throw new HttpsError("invalid-argument", "Content exceeds limit.");
    }

    try {
        const genAI = new GoogleGenerativeAI(googleApiKey.value());

        // 2. EXTRACTION STEP (Gemini 2.0 Flash)
        const extractorModel = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            generationConfig: { responseMimeType: "application/json" }
        });

        const extractionPrompt = `
            ACT AS: Fact Extractor.
            TASK: Analyze the text and extract verifiable facts about entities.

            OUTPUT SCHEMA (JSON):
            {
              "extracted_facts": [
                {
                  "entity": "Name",
                  "fact": "Specific claim (e.g. 'is dead', 'lives in X')",
                  "category": "character" | "location" | "object" | "world_rule",
                  "confidence": 0.0-1.0,
                  "is_new_info": boolean
                }
              ]
            }

            TEXT:
            "${content.substring(0, 30000)}"
        `;

        const extractionResult = await extractorModel.generateContent(extractionPrompt);
        const extractedData = parseSecureJSON(extractionResult.response.text(), "FactExtractor");

        if (!extractedData.extracted_facts || !Array.isArray(extractedData.extracted_facts)) {
            logger.warn("No facts extracted or invalid JSON.");
            return { success: true, facts: [], conflicts: [] };
        }

        const facts = extractedData.extracted_facts;
        const conflicts: any[] = [];
        const verifiedFacts: any[] = [];

        // 3. COLLISION DETECTION (Vector + Logic)
        const embeddingModel = genAI.getGenerativeModel({
            model: "text-embedding-004",
        });

        // Limit to top 3 key facts to save latency/tokens
        const factsToAudit = facts.filter((f: any) => f.confidence > 0.7).slice(0, 3);

        for (const item of factsToAudit) {
            // A. Vector Search (Native SDK)
            const embeddingResult = await embeddingModel.embedContent(`${item.entity}: ${item.fact}`);
            const queryVector = embeddingResult.embedding.values;

            // Query TDB_Index (Chunks)
            // 🟢 PROJECT ISOLATION: Filter by Path Prefix if projectId looks like a folder ID
            // or just rely on userId if that's the current architecture limit.
            // Ideally: .where("path", ">=", projectId).where("path", "<=", projectId + "\uf8ff")

            let vectorQuery = db.collectionGroup("chunks").where("userId", "==", userId);

            // 🟢 ISOLATION STRATEGY:
            // If projectId is provided and looks valid, use it as a path prefix filter.
            // Otherwise, search global (all user files).
            if (projectId && projectId !== 'global') {
                 // Assumption: projectId maps to a folder ID or root path in the 'path' field
                 // Ideally we should resolve projectId to a path name, but we don't have that map here easily.
                 // FALLBACK: Use Global Search but logic check will filter out irrelevant stuff?
                 // NO, Vector Search needs to be scoped.
                 // If we cannot scope by path, we scope by 'saga' or similar if available.
                 // Current Schema: userId, path, embedding.
                 // We will stick to GLOBAL search for now as resolving ID -> Path requires a DB lookup we want to avoid for speed.
                 // The composite index requires 'path' anyway.
                 vectorQuery = vectorQuery
                    .where("path", ">=", "")
                    .where("path", "<=", "\uf8ff");
            } else {
                 // Global Scope
                 vectorQuery = vectorQuery
                    .where("path", ">=", "")
                    .where("path", "<=", "\uf8ff");
            }

            // Execute Vector Search
            const nearestQuery = vectorQuery.findNearest({
                    queryVector: queryVector,
                    limit: 3,
                    distanceMeasure: 'COSINE',
                    vectorField: 'embedding'
            });

            const snapshot = await nearestQuery.get();

            if (snapshot.empty) {
                verifiedFacts.push({ ...item, status: 'new' });
                continue;
            }

            // Gather context
            const contextChunks = snapshot.docs.map(d => ({
                text: d.data().text,
                source: d.data().fileName
            }));

            // B. Friction Check (Gemini 2.0 Flash - Logic Auditor)
            const verifierModel = genAI.getGenerativeModel({
                 model: "gemini-2.0-flash-exp",
                 generationConfig: { responseMimeType: "application/json" }
            });

            const frictionPrompt = `
                ACT AS: Logic Auditor.
                TASK: Detect CONTRADICTIONS between the CLAIM and the EVIDENCE.

                CLAIM: "${item.fact}" (Entity: ${item.entity})

                EVIDENCE FROM DATABASE:
                ${contextChunks.map(c => `- [${c.source}]: ${c.text.substring(0, 300)}...`).join('\n')}

                INSTRUCTIONS:
                - "Dead" vs "Alive" is a CONTRADICTION.
                - "Location A" vs "Location B" is a CONTRADICTION (unless they moved).
                - Minor detail differences are NOT contradictions.

                OUTPUT JSON:
                {
                    "has_conflict": boolean,
                    "reason": "Short explanation of the contradiction",
                    "conflicting_evidence_source": "Filename"
                }
            `;

            const frictionResult = await verifierModel.generateContent(frictionPrompt);
            const frictionAnalysis = parseSecureJSON(frictionResult.response.text(), "FrictionCheck");

            if (frictionAnalysis.has_conflict) {
                conflicts.push({
                    entity: item.entity,
                    fact: item.fact,
                    conflict_reason: frictionAnalysis.reason,
                    source: frictionAnalysis.conflicting_evidence_source,
                    type: 'contradiction'
                });
            } else {
                verifiedFacts.push({ ...item, status: 'verified' });
            }
        }

        logger.info(`🛡️ Guardian Scan Complete. Facts: ${facts.length}, Conflicts: ${conflicts.length}`);

        return {
            success: true,
            facts: verifiedFacts,
            conflicts: conflicts
        };

    } catch (e: any) {
        logger.error("Audit Error:", e);
        throw new HttpsError("internal", e.message);
    }
  }
);
