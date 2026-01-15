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
            TASK: Analyze the text and extract:
            1. Verifiable facts about entities (Characters, Locations).
            2. "WORLD LAWS" or "ENVIRONMENTAL FACTS" (e.g., Magic systems, Physical limitations, Time rules, Geography distances).

            OUTPUT SCHEMA (JSON):
            {
              "extracted_facts": [
                {
                  "entity": "Name",
                  "fact": "Specific claim (e.g. 'is dead', 'lives in X')",
                  "category": "character" | "location" | "object",
                  "confidence": 0.0-1.0,
                  "is_new_info": boolean
                }
              ],
              "extracted_laws": [
                {
                  "category": "geography" | "chronology" | "system_rules",
                  "law": "The extracted rule (e.g., 'Magic requires blood', 'Distance to X is 500km')",
                  "confidence": 0.0-1.0
                }
              ]
            }

            TEXT:
            "${content.substring(0, 30000)}"
        `;

        const extractionResult = await extractorModel.generateContent(extractionPrompt);
        const extractedData = parseSecureJSON(extractionResult.response.text(), "FactExtractor");

        const facts = extractedData.extracted_facts || [];
        const laws = extractedData.extracted_laws || [];

        if (facts.length === 0 && laws.length === 0) {
            logger.warn("No facts or laws extracted.");
            return { success: true, facts: [], conflicts: [], law_violations: [] };
        }

        const conflicts: any[] = [];
        const verifiedFacts: any[] = [];
        const lawViolations: any[] = [];

        // 3. COLLISION DETECTION (Vector + Logic)
        const embeddingModel = genAI.getGenerativeModel({
            model: "text-embedding-004",
        });

        // 4. AUDIT LOOP (ENTITIES)
        const factsToAudit = facts.filter((f: any) => f.confidence > 0.7).slice(0, 3);
        const verifierModel = genAI.getGenerativeModel({
             model: "gemini-2.0-flash-exp",
             generationConfig: { responseMimeType: "application/json" }
        });

        for (const item of factsToAudit) {
            // A. Vector Search (Native SDK)
            const embeddingResult = await embeddingModel.embedContent(`${item.entity}: ${item.fact}`);
            const queryVector = embeddingResult.embedding.values;

            let vectorQuery = db.collectionGroup("chunks").where("userId", "==", userId);

            // 🟢 ISOLATION STRATEGY
            if (projectId && projectId !== 'global') {
                 vectorQuery = vectorQuery.where("path", ">=", "").where("path", "<=", "\uf8ff");
            } else {
                 vectorQuery = vectorQuery.where("path", ">=", "").where("path", "<=", "\uf8ff");
            }

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

            const contextChunks = snapshot.docs.map(d => ({
                text: d.data().text,
                source: d.data().fileName
            }));

            // B. Friction Check
            const frictionPrompt = `
                ACT AS: Logic Auditor.
                TASK: Detect CONTRADICTIONS between the CLAIM and the EVIDENCE.

                CLAIM: "${item.fact}" (Entity: ${item.entity})

                EVIDENCE FROM DATABASE:
                ${contextChunks.map(c => `- [${c.source}]: ${c.text.substring(0, 300)}...`).join('\n')}

                INSTRUCTIONS:
                - "Dead" vs "Alive" is a CONTRADICTION.
                - "Location A" vs "Location B" is a CONTRADICTION.
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

        // 5. REALITY FILTER (WORLD LAWS) - TRIGGER 2
        // Audit top 3 laws to save time
        const lawsToAudit = laws.filter((l: any) => l.confidence > 0.7).slice(0, 3);

        for (const item of lawsToAudit) {
            // A. Vector Search (Lore Focused)
            const embeddingResult = await embeddingModel.embedContent(`${item.category}: ${item.law}`);
            const queryVector = embeddingResult.embedding.values;

            // Same Global/Scoped Strategy
            let vectorQuery = db.collectionGroup("chunks").where("userId", "==", userId)
                .where("path", ">=", "").where("path", "<=", "\uf8ff");

            const nearestQuery = vectorQuery.findNearest({
                    queryVector: queryVector,
                    limit: 5, // Fetch more for laws to find the "Lore" file
                    distanceMeasure: 'COSINE',
                    vectorField: 'embedding'
            });

            const snapshot = await nearestQuery.get();
            if (snapshot.empty) continue;

            // B. Smart Filtering (Priority for Worldbuilding/Lore)
            const contextChunks = snapshot.docs.map(d => {
                const data = d.data();
                const path = data.path || "";
                const isPriority = /Worldbuilding|Lore|Canon|Reglas|System/i.test(path);
                return {
                    text: data.text,
                    source: data.fileName,
                    isPriority
                };
            });

            // C. Reality Check Prompt
            const realityPrompt = `
                ACT AS: The Reality Filter (World Logic Guardian).
                TASK: Verify if the "ASSERTION" violates the "ESTABLISHED RULES" from the database.

                ASSERTION (Text): "${item.law}" (Category: ${item.category})

                ESTABLISHED RULES (Database):
                ${contextChunks.map(c => `- [${c.source}] ${c.isPriority ? '(⚠️ PRIORITY CANON)' : ''}: ${c.text.substring(0, 400)}...`).join('\n')}

                LOGIC:
                1. If a chunk is marked (⚠️ PRIORITY CANON), it overrides everything else.
                2. GEOGRAPHY: Check distances, locations, travel times.
                3. CHRONOLOGY: Check dates, ages, event order.
                4. SYSTEM: Check magic rules, power limits, physics.

                OUTPUT JSON:
                {
                    "trigger": "WORLD_LAW_VIOLATION",
                    "severity": "CRITICAL" | "WARNING" | "NONE",
                    "conflict": {
                        "category": "${item.category}",
                        "assertion": "${item.law}",
                        "canonical_rule": "The exact rule found in database (if any)",
                        "source_node": "Filename of the rule source",
                        "explanation": "Why this breaks the world logic."
                    }
                }
            `;

            const realityResult = await verifierModel.generateContent(realityPrompt);
            const realityAnalysis = parseSecureJSON(realityResult.response.text(), "RealityFilter");

            if (realityAnalysis.severity === "CRITICAL" || realityAnalysis.severity === "WARNING") {
                lawViolations.push(realityAnalysis);
            }
        }

        logger.info(`🛡️ Guardian Scan Complete. Facts: ${facts.length}, Conflicts: ${conflicts.length}, Laws: ${laws.length}, Violations: ${lawViolations.length}`);

        return {
            success: true,
            facts: verifiedFacts,
            conflicts: conflicts,
            world_law_violations: lawViolations
        };

    } catch (e: any) {
        logger.error("Audit Error:", e);
        throw new HttpsError("internal", e.message);
    }
  }
);
