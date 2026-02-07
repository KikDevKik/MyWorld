import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as crypto from 'crypto';
import { cosineSimilarity } from "./similarity";
import { TEMP_CREATIVE, TEMP_PRECISION } from "./ai_config";
import { getAIKey } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const MAX_AI_INPUT_CHARS = 100000;
const MAX_SCAN_LIMIT = 10000; // 🛡️ SENTINEL: Optimized for Multigenerational Sagas (Node.js Gen2)

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
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 540, // 🛡️ SENTINEL: Extended for Deep Analysis (God Mode)
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

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        // 3. EXTRACTION STEP (Smart Fallback: Try Flash First)
        // 🟢 RESONANCE ENGINE (Integrated into Audit for Mission 1)
        const extractionPrompt = `
            ACT AS: Fact Extractor, Psychological Profiler & Literary Analyst (The Resonator).
            CONTEXT: You are an objective literary analysis tool for a fictional manuscript. Your purpose is data extraction and structural analysis only.

            TASK: Analyze the provided fictional text and extract:
            1. Verifiable facts about entities (Characters, Locations). **Pay special attention to SURPRISING CLAIMS, DEVIATIONS, or contradicting statements.**
            2. "WORLD LAWS" (Magic, Physics, Chronology).
            3. "CHARACTER BEHAVIOR": For named characters, extract Tone, Emotional State, and Key Actions.
            4. "RESONANCE": Identify if the draft feels like a Setup, Midpoint, or Climax (Structure).

            LANGUAGE INSTRUCTION:
            Detect the language of the provided TEXT.
            The output values (facts, laws, behaviors, advice) MUST BE in the SAME LANGUAGE as the TEXT.
            The JSON keys must remain in English.

            OUTPUT SCHEMA (JSON):
            {
              "detected_language": "Spanish" | "English" | "French" | "etc",
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

        const safeExtraction = await smartGenerateContent(genAI, extractionPrompt, {
            useFlash: true, // ⚡ Try Flash First
            jsonMode: true,
            temperature: TEMP_PRECISION,
            contextLabel: "FactExtractor"
        });

        if (safeExtraction.error === 'CONTENT_BLOCKED' || safeExtraction.error === 'SILENT_BLOCK') {
             // SmartGenerate handles retry, so if we are here, BOTH failed.
             return { success: false, status: 'content_blocked', message: 'Contenido bloqueado por filtros de seguridad de IA.' };
        } else if (safeExtraction.error || !safeExtraction.text) {
             return { success: false, status: 'ai_error', message: safeExtraction.details || 'Error generando análisis.' };
        }

        const rawModelOutput = safeExtraction.text!;
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
        const detectedLanguage = extractedData.detected_language || "English";

        const conflicts: any[] = [];
        const verifiedFacts: any[] = [];
        const lawViolations: any[] = [];
        const personalityDrifts: any[] = [];
        let resonanceMatches: any[] = []; // 🟢 RESONANCE ARRAY

        // 4. SETUP MODELS
        const embeddingModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });

        // 🟢 PRE-CALCULATE QUERY VECTOR (For Drift & Resonance)
        let queryVector: number[] = [];
        try {
            const embeddingResult = await embeddingModel.embedContent(content.substring(0, 10000));
            queryVector = embeddingResult.embedding.values;
        } catch (e) {
            logger.error("💥 Critical Embedding Failure. Aborting Audit.", e);
            // We cannot proceed without vector
            return { success: false, status: 'ai_error', message: 'Fallo al vectorizar contenido.' };
        }

        // 🟢 PARALLEL EXECUTION: DRIFT, RESONANCE, FACTS, LAWS, BEHAVIOR
        // We launch all independent checks simultaneously.

        // Prepare subsets
        const factsToAudit = facts.filter((f: any) => f.confidence > 0.5).slice(0, 10);
        const lawsToAudit = laws.filter((l: any) => l.confidence > 0.5).slice(0, 5);
        const behaviorsToAudit = behaviors.slice(0, 3);

        const [
            driftResult,
            resonanceResult,
            factsResults,
            lawsResults,
            personalityResults
        ] = await Promise.all([

            // 1. DRIFT CHECK
            (async () => {
                let driftScore = 0.0;
                let driftStatus = 'STABLE';
                try {
                    const centroidDoc = await db.collection("TDB_Index").doc(userId).collection("stats").doc("centroid").get();
                    if (centroidDoc.exists && centroidDoc.data()?.vector) {
                        const centroidVector = centroidDoc.data()?.vector;
                        const similarity = cosineSimilarity(queryVector, centroidVector);
                        driftScore = 1.0 - similarity;
                        if (driftScore > 0.6) driftStatus = 'CRITICAL_INCOHERENCE';
                        else if (driftScore > 0.4) driftStatus = 'DRIFTING';
                        logger.info(`⚓ [SENTINEL] Drift Analysis: ${driftScore.toFixed(2)} (${driftStatus})`);
                    } else {
                        logger.info("⚓ [SENTINEL] No Centroid found. Skipping Drift Calculation.");
                    }
                } catch (e) {
                    logger.warn("Drift Calc Error:", e);
                }
                return { driftScore, driftStatus };
            })(),

            // 2. RESONANCE CHECK
            (async () => {
                let matches: any[] = [];
                try {
                    let vectorQuery = db.collectionGroup("chunks")
                        .where("userId", "==", userId)
                        .where("projectId", "==", projectId)
                        .where("path", ">=", "").where("path", "<=", "\uf8ff");

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

                    if (relevantChunks.length > 0) {
                        const resonancePrompt = `
                            ACT AS: The Resonator.
                            TASK: Identify if the DRAFT connects to any MEMORY SEEDS (Chunks).
                            DRAFT: "${content.substring(0, 5000)}..."
                            SEEDS: ${JSON.stringify(relevantChunks)}

                            INSTRUCTION: Output the analysis in ${detectedLanguage}.
                            OUTPUT JSON: { "matches": [{ "source_file": "string", "type": "PLOT_SEED"|"VIBE_SEED"|"LORE_SEED", "crumb_text": "string", "similarity_score": 0.0-1.0 }] }
                        `;
                        // Pro Model for Reasoning (The Judge)
                        const safeRes = await smartGenerateContent(genAI, resonancePrompt, {
                            useFlash: false, // Strict Pro
                            jsonMode: true,
                            temperature: TEMP_CREATIVE,
                            contextLabel: "ResonanceCheck"
                        });

                        if (safeRes.text) {
                            const resAnalysis = parseSecureJSON(safeRes.text, "ResonanceCheck");
                            matches = resAnalysis.matches || [];
                        }
                    }
                } catch (e: any) {
                    if (e.message?.includes('index') || e.code === 9) logger.error(`[SENTINEL_ALERTA_CRITICA]: Missing Index.`);
                    logger.warn("Resonance Check Failed:", e);
                }
                return matches;
            })(),

            // 3. FACTS CHECK (Parallel Map)
            Promise.all(factsToAudit.map(async (item: any) => {
                try {
                    const embeddingResult = await embeddingModel.embedContent(`${item.entity}: ${item.fact}`);
                    const qVector = embeddingResult.embedding.values;

                    let vectorQuery = db.collectionGroup("chunks")
                        .where("userId", "==", userId)
                        .where("projectId", "==", projectId)
                        .where("path", ">=", "").where("path", "<=", "\uf8ff");

                    const nearestQuery = vectorQuery.findNearest({
                        queryVector: qVector,
                        limit: 3,
                        distanceMeasure: 'COSINE',
                        vectorField: 'embedding'
                    });

                    const snapshot = await nearestQuery.get();
                    if (snapshot.empty) return { type: 'verified_fact', item, status: 'new' };

                    const contextChunks = snapshot.docs.map(d => ({ text: d.data().text, source: d.data().fileName }));

                    const frictionPrompt = `
                        ACT AS: Logic Auditor.
                        TASK: Detect CONTRADICTIONS.
                        CLAIM: "${item.fact}" (Entity: ${item.entity})
                        EVIDENCE: ${JSON.stringify(contextChunks)}
                        INSTRUCTION: Output the 'reason' in ${detectedLanguage}.
                        OUTPUT JSON: { "has_conflict": boolean, "reason": "string", "conflicting_evidence_source": "string" }
                    `;

                    // Pro Model for Logic
                    const safeFriction = await smartGenerateContent(genAI, frictionPrompt, {
                        useFlash: false,
                        jsonMode: true,
                        temperature: TEMP_CREATIVE,
                        contextLabel: "FrictionCheck"
                    });

                    if (safeFriction.error) return null;

                    const frictionAnalysis = parseSecureJSON(safeFriction.text || "{}", "FrictionCheck");
                    if (frictionAnalysis.has_conflict) {
                        return {
                            type: 'conflict',
                            entity: item.entity,
                            fact: item.fact,
                            conflict_reason: frictionAnalysis.reason,
                            source: frictionAnalysis.conflicting_evidence_source
                        };
                    } else {
                        return { type: 'verified_fact', item, status: 'verified' };
                    }
                } catch (e) {
                    return null;
                }
            })),

            // 4. LAWS CHECK (Parallel Map)
            Promise.all(lawsToAudit.map(async (item: any) => {
                try {
                    const embeddingResult = await embeddingModel.embedContent(`${item.category}: ${item.law}`);
                    const qVector = embeddingResult.embedding.values;

                    const nearestQuery = db.collectionGroup("chunks")
                        .where("userId", "==", userId)
                        .where("projectId", "==", projectId)
                        .where("path", ">=", "").where("path", "<=", "\uf8ff")
                        .findNearest({
                            queryVector: qVector,
                            limit: 5,
                            distanceMeasure: 'COSINE',
                            vectorField: 'embedding'
                        });

                    const snapshot = await nearestQuery.get();
                    if (snapshot.empty) return null;

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
                        INSTRUCTION: Output the 'explanation' in ${detectedLanguage}.
                        OUTPUT JSON: { "trigger": "WORLD_LAW_VIOLATION", "severity": "CRITICAL" | "WARNING" | "NONE", "conflict": { "explanation": "string", "canonical_rule": "string", "source_node": "string" } }
                    `;

                    // Pro Model for Reality
                    const safeReality = await smartGenerateContent(genAI, realityPrompt, {
                        useFlash: false,
                        jsonMode: true,
                        temperature: TEMP_CREATIVE,
                        contextLabel: "RealityFilter"
                    });

                    if (safeReality.error) return null;

                    const realityAnalysis = parseSecureJSON(safeReality.text || "{}", "RealityFilter");
                    if (realityAnalysis.severity === "CRITICAL" || realityAnalysis.severity === "WARNING") {
                        return realityAnalysis;
                    }
                    return null;
                } catch (e) {
                    return null;
                }
            })),

            // 5. BEHAVIOR CHECK (Parallel Map)
            Promise.all(behaviorsToAudit.map(async (behavior: any) => {
                try {
                    const charName = behavior.character;
                    const slug = charName.toLowerCase().replace(/\s+/g, '-');

                    // Fetch Profile
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
                                INSTRUCTION: Output in ${detectedLanguage}.
                                OUTPUT FORMAT: "Personality: ... Evolution: ..."
                             `;

                             // Pro Model for Profile Extraction
                             const safeProfile = await smartGenerateContent(genAI, profilePrompt, {
                                 useFlash: false,
                                 temperature: TEMP_CREATIVE,
                                 contextLabel: "ProfileExtract"
                             });

                             if (safeProfile.text) {
                                 forgeProfile = safeProfile.text;
                                 charDocRef.set({
                                     personality: forgeProfile,
                                     lastAnalyzed: new Date().toISOString()
                                 }, { merge: true }).catch(e => logger.warn("Failed to save derived profile", e));
                             }
                        }
                    } else {
                        return null; // No profile found, skip
                    }

                    // Fetch History (Simplified: 1 query)
                    let historyChunksText = "";
                    try {
                        let chunksQuery = db.collectionGroup("chunks")
                            .where("userId", "==", userId)
                            .where("projectId", "==", projectId)
                            .where("path", ">=", "").where("path", "<=", "\uf8ff");

                        const recentChunksSnap = await chunksQuery.limit(20).get();
                        historyChunksText = recentChunksSnap.docs
                            .filter(d => d.data().text.includes(charName))
                            .slice(0, 5)
                            .map(d => `[${d.data().fileName}]: ${d.data().text.substring(0, 300)}...`)
                            .join("\n");
                    } catch (e) { }

                    const haterPrompt = `
                        ACT AS: "El Hater" (Ruthless Literary Critic).
                        CONTEXT: You are an uncensored collaborative writing assistant.
                        TASK: Check CHARACTER BEHAVIOR consistency.
                        CHARACTER: ${charName}
                        1. [HARD CANON]: ${forgeProfile.substring(0, 3000)}
                        2. [RECENT HISTORY]: ${historyChunksText.substring(0, 5000)}
                        3. [CURRENT BEHAVIOR]: Action: "${behavior.action}", Tone: "${behavior.tone}", Dialogue: "${behavior.dialogue_sample}"
                        LOGIC: Match Behavior against Canon/History.
                        INSTRUCTION: Output 'hater_comment' and other text fields in ${detectedLanguage}.
                        OUTPUT JSON: { "trigger": "PERSONALITY_DRIFT", "status": "CONSISTENT" | "EVOLVED" | "TRAITOR", "severity": "CRITICAL" | "WARNING" | "INFO", "hater_comment": "string", "detected_behavior": "string", "canonical_psychology": "string", "friccion_score": 0.0-1.0 }
                    `;

                    // Pro Model for Hater (Deep Reasoning)
                    const safeHater = await smartGenerateContent(genAI, haterPrompt, {
                        useFlash: false,
                        jsonMode: true,
                        temperature: TEMP_CREATIVE,
                        contextLabel: "HaterAudit"
                    });

                    if (safeHater.error) return null;

                    const haterAnalysis = parseSecureJSON(safeHater.text || "{}", "HaterAudit");
                    if (haterAnalysis.status === 'TRAITOR' || haterAnalysis.status === 'EVOLVED') {
                        return { character: charName, ...haterAnalysis };
                    }
                    return null;

                } catch (e) {
                    return null;
                }
            }))
        ]);

        // 🟢 AGGREGATE RESULTS

        // Facts Aggregation
        factsResults.forEach(res => {
            if (!res) return;
            if (res.type === 'conflict') conflicts.push({ ...res, type: 'contradiction' });
            else if (res.type === 'verified_fact') verifiedFacts.push({ ...res.item, status: res.status });
        });

        // Laws Aggregation
        lawsResults.forEach(res => {
            if (res) lawViolations.push(res);
        });

        // Behaviors Aggregation
        personalityResults.forEach(res => {
            if (res) personalityDrifts.push(res);
        });

        // Resonance matches
        resonanceMatches = resonanceResult || [];

        // Drift
        const { driftScore, driftStatus } = driftResult;


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
            structure_analysis: structure, // 🟢 RETURN STRUCTURE
            guardian_report: { // 🟢 RETURN DRIFT REPORT
                module: "CanonRadar",
                drift_score: driftScore,
                status: driftStatus,
                is_blocking: false
            }
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

/**
 * 25. PURGE ECHO (El Ejecutor)
 * Elimina un fragmento específico de Firestore (Nivel 1) sin tocar Drive.
 */
export const purgeEcho = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
    },
    async (request) => {
        const db = getFirestore();

        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login requerido.");
        }

        const { chunkPath } = request.data;
        const userId = request.auth.uid;

        if (!chunkPath) {
            throw new HttpsError("invalid-argument", "Falta chunkPath.");
        }

        try {
            // 1. VERIFY OWNERSHIP (Security Check)
            const docRef = db.doc(chunkPath);
            const docSnap = await docRef.get();

            if (!docSnap.exists) {
                return { success: false, message: "Fragmento no encontrado o ya eliminado." };
            }

            const data = docSnap.data();
            if (data?.userId !== userId) {
                logger.warn(`🛑 [SECURITY] Unauthorized Purge Attempt by ${userId} on ${chunkPath}`);
                throw new HttpsError("permission-denied", "No tienes permiso para purgar este fragmento.");
            }

            // 2. EXECUTE PURGE (Level 1 Only)
            await docRef.delete();
            logger.info(`🗑️ [PURGE] Fragmento eliminado: ${chunkPath}`);

            return { success: true, message: "Eco eliminado del índice." };

        } catch (error: any) {
            logger.error("Error en purgeEcho:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);

/**
 * 26. SCAN PROJECT DRIFT (El Radar de Largo Alcance)
 * Escanea la colección de chunks para detectar drift masivo comparado con el Centroide.
 */
export const scanProjectDrift = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS, // 🛡️ SENTINEL: Enforce strict CORS
    enforceAppCheck: true,
    timeoutSeconds: 540, // Long running
    memory: "1GiB",
  },
  async (request) => {
    const db = getFirestore();
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { projectId } = request.data;
    const userId = request.auth.uid;

    if (!projectId) throw new HttpsError("invalid-argument", "Falta projectId.");

    try {
        // 1. Fetch Centroid
        const centroidDoc = await db.collection("TDB_Index").doc(userId).collection("stats").doc("centroid").get();

        // 🟢 SAFETY CHECK: Return "skipped" instead of error if no centroid
        if (!centroidDoc.exists || !centroidDoc.data()?.vector) {
             logger.info(`⚓ [SENTINEL] No Centroid found for project ${projectId}. Skipping Drift Scan.`);
             // 🟢 RETURN SKIPPED STATUS (PREVENT CRASH)
             return {
                 success: true,
                 status: 'skipped',
                 alerts: {
                     identity: [],
                     geography: [],
                     continuity: [],
                     uncategorized: []
                 },
                 message: "El proyecto aún no tiene estadísticas de centroide (Indexado requerido)."
             };
        }

        const centroidVector = centroidDoc.data()?.vector;

        // 2. Fetch All Chunks for Project
        // Optimization: We could limit or paginate, but for now we scan all (assuming < 10k chunks for typical project)
        const chunksSnapshot = await db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("projectId", "==", projectId)
            .limit(MAX_SCAN_LIMIT) // 🛡️ SENTINEL: Safety limit
            .select("embedding", "fileName", "text", "path", "category") // Fetch only necessary fields
            .get();

        let partialAnalysis = false;
        if (chunksSnapshot.size === MAX_SCAN_LIMIT) {
             logger.warn(`⚠️ [SENTINEL] Drift Scan hit limit of ${MAX_SCAN_LIMIT}. Analysis may be incomplete.`);
             partialAnalysis = true;
        }

        const alerts: any = {
            identity: [],
            geography: [],
            continuity: [],
            uncategorized: []
        };

        // 3. Pre-load Context for Classification (Lightweight)
        // Characters
        const charsSnap = await db.collection("users").doc(userId).collection("characters").select("name").get();
        const charNames = charsSnap.docs.map(d => d.data().name.toLowerCase());

        let count = 0;
        const CRITICAL_THRESHOLD = 0.7;

        for (const doc of chunksSnapshot.docs) {
            const data = doc.data();
            const embedding = data.embedding;

            // Skip if no embedding or if already marked as needing no review (optional, but requested rescue sets needsReview=false)
            // But auditContent is real-time. This is deep scan.
            // We'll check all.
            if (!embedding) continue;

            const similarity = cosineSimilarity(embedding, centroidVector);
            const driftScore = 1.0 - similarity;

            if (driftScore > CRITICAL_THRESHOLD) {
                // CLASSIFY
                const textLower = (data.text || "").toLowerCase();
                const pathLower = (data.path || "").toLowerCase();
                let category = "uncategorized";

                // Heuristic 1: Identity (Match Names or Path)
                if ((data.category === 'character') || pathLower.includes("characters") || pathLower.includes("personajes") || charNames.some(n => textLower.includes(n))) {
                    category = "identity";
                }
                // Heuristic 2: Geography (Path or keywords)
                else if ((data.category === 'location') || pathLower.includes("locations") || pathLower.includes("lugares") || pathLower.includes("world")) {
                    category = "geography";
                }
                // Heuristic 3: Continuity (Timeline, Dates)
                else if ((data.category === 'timeline') || pathLower.includes("timeline") || /\b(year|año|era)\s+\d+/.test(textLower)) {
                    category = "continuity";
                }

                const alertItem = {
                    chunkId: doc.id,
                    chunkPath: doc.ref.path,
                    fileName: data.fileName,
                    snippet: data.text ? data.text.substring(0, 100) + "..." : "",
                    drift_score: driftScore,
                    reason: `High Drift (${driftScore.toFixed(2)}) detected in ${category}.`,
                    fileId: data.driveId || data.fileId // Assuming we stored this
                };

                // Limit bucket size
                if (alerts[category].length < 20) {
                    alerts[category].push(alertItem);
                }
                count++;
            }
        }

        logger.info(`📡 [SENTINEL] Drift Scan Complete. Found ${count} critical echoes.`);

        return {
            success: true,
            alerts: alerts,
            total_critical: count,
            partialAnalysis: partialAnalysis // 🛡️ SENTINEL: Soft Cap Warning
        };

    } catch (error: any) {
        logger.error("Error in scanProjectDrift:", error);
        throw new HttpsError("internal", error.message);
    }
  }
);

/**
 * 27. RESCUE ECHO (La Advertencia)
 * Marca un chunk como 'Rescatado' y actualiza el archivo padre a 'Conflicto'.
 */
export const rescueEcho = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: true,
    },
    async (request) => {
        const db = getFirestore();
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { chunkPath, driftCategory } = request.data;
        const userId = request.auth.uid;

        if (!chunkPath) throw new HttpsError("invalid-argument", "Falta chunkPath.");

        try {
            const chunkRef = db.doc(chunkPath);
            const chunkSnap = await chunkRef.get();

            if (!chunkSnap.exists) {
                return { success: false, message: "Fragmento no encontrado." };
            }

            const data = chunkSnap.data();
            if (data?.userId !== userId) throw new HttpsError("permission-denied", "Acceso denegado.");

            // 1. Get Parent File ID (The hashed Doc ID, usually stored in chunk as docId or derived)
            // In ingestFile, we store `docId` (hashed path) in the chunk.
            const fileDocId = data?.docId;

            if (!fileDocId) {
                 logger.warn(`⚠️ [RESCUE] Chunk ${chunkPath} missing docId. Cannot tag parent file.`);
                 // Fallback: Just return success but warn
            } else {
                 // 2. Update Parent File in TDB_Index
                 const fileRef = db.collection("TDB_Index").doc(userId).collection("files").doc(fileDocId);
                 await fileRef.set({
                     isConflicting: true,
                     driftCategory: driftCategory || 'General',
                     securityStatus: 'conflict',
                     lastReview: new Date().toISOString()
                 }, { merge: true });
                 logger.info(`🚩 [RESCUE] File ${fileDocId} marked as CONFLICTING.`);
            }

            // 3. Update Chunk (Optional flag)
            await chunkRef.set({
                needsReview: false,
                isRescued: true,
                rescuedAt: new Date().toISOString()
            }, { merge: true });

            return {
              action: "RESCUE_FRAGMENT",
              status: "KEEP_IN_INDEX",
              meta: {
                isConflicting: true,
                warning_code: "NARRATIVE_CONFUSION_DETECTED",
                author_instruction: "El fragmento rescatado presenta una desviación semántica significativa. Corrija el archivo original en Drive para reconciliar el canon."
              }
            };

        } catch (error: any) {
            logger.error("Error in rescueEcho:", error);
            throw new HttpsError("internal", error.message);
        }
    }
);
