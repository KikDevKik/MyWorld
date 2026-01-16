import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as crypto from 'crypto';

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

    const { content, projectId, fileId } = request.data;
    const userId = request.auth.uid;

    // 🟢 [TITAN SAFEGUARD] - SYSTEM ERROR HANDLER WRAPPER
    try {
        // 1. VALIDATION
        if (!content) return { success: true, facts: [], conflicts: [], personality_drift: [], resonance_matches: [], structure_analysis: {} };
        if (!projectId) {
            logger.warn("⚠️ [GUARDIAN] No Project ID provided. Audit scope might be ambiguous.");
        }
        if (content.length > MAX_AI_INPUT_CHARS) {
            throw new HttpsError("invalid-argument", "Content exceeds limit.");
        }

        // 2. HASH CHECK (OPTIMIZATION)
        let currentHash = '';
        if (fileId) {
            currentHash = crypto.createHash('sha256').update(content).digest('hex');
            const auditRef = db.collection("users").doc(userId).collection("audit_cache").doc(fileId);
            const auditDoc = await auditRef.get();

            if (auditDoc.exists && auditDoc.data()?.hash === currentHash) {
                logger.info(`⏩ [GUARDIAN] Hash Match for ${fileId}. Skipping Audit.`);
                return { success: true, status: 'skipped_unchanged', facts: [], conflicts: [] };
            }
        }

        const genAI = new GoogleGenerativeAI(googleApiKey.value());

        // 3. EXTRACTION STEP (Gemini 2.0 Flash)
        const extractorModel = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 🟢 RESONANCE ENGINE (Integrated into Audit for Mission 1)
        // We now ask the extractor to ALSO look for Plot Seeds and Structure to avoid a separate call.
        const extractionPrompt = `
            ACT AS: Fact Extractor, Psychological Profiler & Literary Analyst (The Resonator).
            TASK: Analyze the text and extract:
            1. Verifiable facts about entities (Characters, Locations).
            2. "WORLD LAWS" (Magic, Physics, Chronology).
            3. "CHARACTER BEHAVIOR": For named characters, extract Tone, Emotional State, and Key Actions.
            4. "RESONANCE": Identify if the draft feels like a Setup, Midpoint, or Climax (Structure).

            OUTPUT SCHEMA (JSON):
            {
              "extracted_facts": [
                {
                  "entity": "Name",
                  "fact": "Specific claim (e.g. 'is dead')",
                  "category": "character" | "location" | "object",
                  "confidence": 0.0-1.0
                }
              ],
              "extracted_laws": [
                {
                  "category": "geography" | "chronology" | "system_rules",
                  "law": "Rule description",
                  "confidence": 0.0-1.0
                }
              ],
              "character_behaviors": [
                {
                  "character": "Name",
                  "tone": "Sarcastic, Fearful, etc.",
                  "action": "Description of action",
                  "dialogue_sample": "Quote"
                }
              ],
              "structure_analysis": {
                 "detected_phase": "SETUP" | "INCITING_INCIDENT" | "RISING_ACTION" | "MIDPOINT" | "CRISIS" | "CLIMAX" | "RESOLUTION",
                 "confidence": 0.0-1.0,
                 "advice": "Brief structural advice."
              }
            }

            TEXT:
            "${content.substring(0, 30000)}"
        `;

        const extractionResult = await extractorModel.generateContent(extractionPrompt);
        const rawModelOutput = extractionResult.response.text();
        const extractedData = parseSecureJSON(rawModelOutput, "FactExtractor");

        if (extractedData.error) {
             logger.error(`💥 [GUARDIAN PARSE ERROR] Raw Output:`, rawModelOutput);
             return {
                 success: false,
                 status: 'parse_error',
                 message: 'Error analizando respuesta de IA.',
                 raw_debug: rawModelOutput.substring(0, 1000)
             };
        }

        const facts = extractedData.extracted_facts || [];
        const laws = extractedData.extracted_laws || [];
        const behaviors = extractedData.character_behaviors || [];
        const structure = extractedData.structure_analysis || {};

        const conflicts: any[] = [];
        const verifiedFacts: any[] = [];
        const lawViolations: any[] = [];
        const personalityDrifts: any[] = [];
        let resonanceMatches: any[] = []; // 🟢 RESONANCE ARRAY

        // 4. SETUP MODELS
        const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
        const verifierModel = genAI.getGenerativeModel({
             model: "gemini-2.0-flash-exp",
             generationConfig: { responseMimeType: "application/json" }
        });

        // --- RESONANCE CHECK (PRE-TRIGGER 4 LOGIC MOVED HERE) ---
        // We perform a light vector search to find "Plot Seeds" or "Vibe Seeds"
        try {
            const embeddingResult = await embeddingModel.embedContent(content.substring(0, 10000));
            const queryVector = embeddingResult.embedding.values;

            // 🟢 COMPOSITE INDEX TRIGGER: .where("projectId", "==", projectId)
            // This query structure forces the need for the Composite Index:
            // userId (ASC) + projectId (ASC) + path (ASC) + embedding (VECTOR)
            let vectorQuery = db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .where("projectId", "==", projectId); // 👈 SCOPE FILTER

             // Global Range for Composite Index
            vectorQuery = vectorQuery.where("path", ">=", "").where("path", "<=", "\uf8ff");

            const nearestQuery = vectorQuery.findNearest({
                queryVector: queryVector,
                limit: 5,
                distanceMeasure: 'COSINE',
                vectorField: 'embedding'
            });

            const snapshot = await nearestQuery.get();
            const relevantChunks = snapshot.docs.map(d => ({
                source: d.data().fileName,
                text: d.data().text,
                path: d.data().path || ""
            }));

            // If we have relevant chunks, ask the Verifier to classify them as Resonance
            // 🟢 CRITICAL FIX: Ensure verifierModel is available here. It was defined above.
            if (relevantChunks.length > 0) {
                 const resonancePrompt = `
                    ACT AS: The Resonator.
                    TASK: Identify if the DRAFT connects to any MEMORY SEEDS (Chunks).
                    DRAFT: "${content.substring(0, 5000)}..."
                    SEEDS: ${JSON.stringify(relevantChunks)}

                    OUTPUT JSON:
                    {
                        "matches": [
                            {
                                "source_file": "Name of the chunk file",
                                "type": "PLOT_SEED" | "VIBE_SEED" | "LORE_SEED",
                                "crumb_text": "Short poetic summary (e.g. 'Echoes of the ancient war')",
                                "similarity_score": 0.0-1.0
                            }
                        ]
                    }
                 `;
                 const resResult = await verifierModel.generateContent(resonancePrompt);
                 const resAnalysis = parseSecureJSON(resResult.response.text(), "ResonanceCheck");
                 resonanceMatches = resAnalysis.matches || [];
            }

        } catch (resError) {
            logger.warn("Resonance Check Failed inside Audit:", resError);
        }

        // [RE-IMPLEMENTING T1: FACTS]
        const factsToAudit = facts.filter((f: any) => f.confidence > 0.7).slice(0, 3);
        for (const item of factsToAudit) {
            const embeddingResult = await embeddingModel.embedContent(`${item.entity}: ${item.fact}`);
            const queryVector = embeddingResult.embedding.values;

            let vectorQuery = db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .where("projectId", "==", projectId); // 👈 SCOPE FILTER

            vectorQuery = vectorQuery.where("path", ">=", "").where("path", "<=", "\uf8ff");

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

            const frictionPrompt = `
                ACT AS: Logic Auditor.
                TASK: Detect CONTRADICTIONS between CLAIM and EVIDENCE.
                CLAIM: "${item.fact}" (Entity: ${item.entity})
                EVIDENCE: ${JSON.stringify(contextChunks)}
                OUTPUT JSON: { "has_conflict": boolean, "reason": "string", "conflicting_evidence_source": "string" }
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

        // [RE-IMPLEMENTING T2: LAWS]
        const lawsToAudit = laws.filter((l: any) => l.confidence > 0.7).slice(0, 2);
        for (const item of lawsToAudit) {
             const embeddingResult = await embeddingModel.embedContent(`${item.category}: ${item.law}`);
             const queryVector = embeddingResult.embedding.values;

             const nearestQuery = db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .where("projectId", "==", projectId) // 👈 SCOPE FILTER
                .where("path", ">=", "").where("path", "<=", "\uf8ff")
                .findNearest({
                    queryVector: queryVector,
                    limit: 5,
                    distanceMeasure: 'COSINE',
                    vectorField: 'embedding'
                });

            const snapshot = await nearestQuery.get();
            if (snapshot.empty) continue;

            const contextChunks = snapshot.docs.map(d => ({
                text: d.data().text,
                source: d.data().fileName,
                isPriority: /Worldbuilding|Lore|Canon|Reglas|System/i.test(d.data().path || "")
            }));

            const realityPrompt = `
                ACT AS: Reality Filter.
                TASK: Verify if ASSERTION violates RULES.
                ASSERTION: "${item.law}"
                RULES: ${JSON.stringify(contextChunks)}
                OUTPUT JSON: { "trigger": "WORLD_LAW_VIOLATION", "severity": "CRITICAL" | "WARNING" | "NONE", "conflict": { "explanation": "string", "canonical_rule": "string", "source_node": "string" } }
            `;

            const realityResult = await verifierModel.generateContent(realityPrompt);
            const realityAnalysis = parseSecureJSON(realityResult.response.text(), "RealityFilter");

            if (realityAnalysis.severity === "CRITICAL" || realityAnalysis.severity === "WARNING") {
                lawViolations.push(realityAnalysis);
            }
        }

        // ==================================================================================
        // TRIGGER 3: "THE HATER" (PERSONALITY DRIFT)
        // ==================================================================================

        const behaviorsToAudit = behaviors.slice(0, 3);

        for (const behavior of behaviorsToAudit) {
            const charName = behavior.character;
            const slug = charName.toLowerCase().replace(/\s+/g, '-');

            let forgeProfile = "";
            let charDocRef = db.collection("users").doc(userId).collection("characters").doc(slug);
            let charDoc = await charDocRef.get();

            if (!charDoc.exists) {
                const charsSnap = await db.collection("users").doc(userId).collection("characters")
                    .where("name", "==", charName).limit(1).get();
                if (!charsSnap.empty) {
                    charDoc = charsSnap.docs[0];
                    charDocRef = charDoc.ref;
                }
            }

            if (charDoc.exists) {
                const data = charDoc.data();
                if (data?.personality && data?.evolution) {
                    forgeProfile = `PERSONALITY: ${data.personality}\nEVOLUTION ARC: ${data.evolution}`;
                } else if (data?.bio || data?.description) {
                     const profilePrompt = `
                        EXTRACT PERSONALITY & EVOLUTION from this bio:
                        "${data.bio || data.description}"
                        OUTPUT FORMAT: "Personality: ... Evolution: ..."
                     `;
                     const profileRes = await verifierModel.generateContent(profilePrompt);
                     const derived = profileRes.response.text();
                     forgeProfile = derived;

                     charDocRef.set({
                         personality: derived,
                         lastAnalyzed: new Date().toISOString()
                     }, { merge: true }).catch(e => logger.warn("Failed to save derived profile", e));
                }
            } else {
                continue;
            }

            let historyChunksText = "";
            try {
                let chunksQuery = db.collectionGroup("chunks")
                    .where("userId", "==", userId)
                    .where("projectId", "==", projectId); // 👈 SCOPE FILTER

                chunksQuery = chunksQuery
                    .where("path", ">=", "")
                    .where("path", "<=", "\uf8ff");

                // Note: Index dependency for sort by timestamp. We use simple fetch here.
                 const recentChunksSnap = await chunksQuery.limit(20).get();

                const relevantChunks = recentChunksSnap.docs
                    .filter(d => d.data().text.includes(charName))
                    .slice(0, 5)
                    .map(d => `[${d.data().fileName}]: ${d.data().text.substring(0, 300)}...`)
                    .join("\n");

                historyChunksText = relevantChunks;
            } catch (e) {
                logger.warn("Failed to fetch recent history chunks", e);
            }

            const haterPrompt = `
                ACT AS: "El Hater" (Ruthless Literary Critic).
                TONE: Cynical, Technical, Unforgiving.
                TASK: Check CHARACTER BEHAVIOR consistency.

                CHARACTER: ${charName}

                1. [HARD CANON]: ${forgeProfile.substring(0, 3000)}
                2. [RECENT HISTORY]: ${historyChunksText.substring(0, 5000)}
                3. [CURRENT BEHAVIOR]: Action: "${behavior.action}", Tone: "${behavior.tone}", Dialogue: "${behavior.dialogue_sample}"

                LOGIC:
                - If Behavior matches Forge -> CONSISTENT.
                - If contradicts Forge BUT matches History -> EVOLVED.
                - If contradicts BOTH -> TRAITOR (OOC).

                OUTPUT JSON:
                {
                    "trigger": "PERSONALITY_DRIFT",
                    "status": "CONSISTENT" | "EVOLVED" | "TRAITOR",
                    "severity": "CRITICAL" | "WARNING" | "INFO",
                    "hater_comment": "Sarcastic critique.",
                    "detected_behavior": "Short summary.",
                    "canonical_psychology": "What they should be.",
                    "friccion_score": 0.0-1.0
                }
            `;

            const haterResult = await verifierModel.generateContent(haterPrompt);
            const haterAnalysis = parseSecureJSON(haterResult.response.text(), "HaterAudit");

            if (haterAnalysis.status === 'TRAITOR' || haterAnalysis.status === 'EVOLVED') {
                personalityDrifts.push({
                    character: charName,
                    ...haterAnalysis
                });
            }
        }

        // 5. UPDATE CACHE
        if (fileId) {
            await db.collection("users").doc(userId).collection("audit_cache").doc(fileId).set({
                hash: currentHash,
                timestamp: new Date().toISOString(),
            });
        }

        logger.info(`🛡️ Guardian Scan Complete. Facts: ${facts.length}, Drifts: ${personalityDrifts.length}, Resonance: ${resonanceMatches.length}`);

        return {
            success: true,
            facts: verifiedFacts,
            conflicts: conflicts,
            world_law_violations: lawViolations,
            personality_drift: personalityDrifts,
            resonance_matches: resonanceMatches, // 🟢 RETURN RESONANCE
            structure_analysis: structure // 🟢 RETURN STRUCTURE
        };

    } catch (e: any) {
        logger.error("Audit Error (Captured by Titan Protocol):", e);
        return {
            success: false,
            status: 'system_calibration',
            message: 'Sistema en Calibración'
        };
    }
  }
);
