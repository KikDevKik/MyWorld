import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI, SchemaType, TaskType } from "@google/generative-ai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING, MODEL_LOW_COST } from "./ai_config";
import { parseSecureJSON } from "./utils/json";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- TOOL DEFINITION ---
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "get_entity_context",
        description: "Retrieves deep context for an entity (character, location, etc.) using Hybrid Search (Database Metadata + Narrative Memory Vectors). Use this to 'remember' what happened to someone.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            name: {
              type: SchemaType.STRING,
              description: "The name of the entity to search for (e.g., 'Juan', 'Metropolis')."
            }
          },
          required: ["name"]
        }
      }
    ]
  }
];

export const builderStream = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: [googleApiKey],
    timeoutSeconds: 300,
    memory: "1GiB",
    cors: ALLOWED_ORIGINS, // Cloud Functions v2 handles CORS via config
  },
  async (req, res) => {
    // 1. CORS Pre-flight
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).send('');
      return;
    }

    // 2. Auth Verification
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).send('Unauthorized');
      return;
    }
    const token = authHeader.split('Bearer ')[1];
    let uid, projectId;

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      projectId = req.body.projectId;

      if (!projectId) throw new Error("Missing projectId");
    } catch (e) {
      logger.error("Auth failed", e);
      res.status(403).send('Forbidden');
      return;
    }

    // 3. Setup Stream
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      const db = getFirestore();

      // 🟢 PRE-FETCH CONTEXT (Entities + Canon)
      // A. Entities Roster (Lightweight)
      const entitiesSnapshot = await db.collection("users").doc(uid).collection("projects").doc(projectId).collection("entities")
          .select("name", "type", "description")
          .limit(300) // Reasonable limit for context window
          .get();

      const entitiesList = entitiesSnapshot.docs.map(doc => {
          const d = doc.data();
          return `- ${d.name} (${d.type})`;
      }).join("\n");

      // B. Canon Narrative Context (Top Priority Chunks)
      // User requested "chunks from files with category='canon'"
      const chunksSnapshot = await db.collectionGroup("chunks")
          .where("userId", "==", uid)
          .where("projectId", "==", projectId) // Strict scope
          .where("category", "==", "canon")
          .limit(20) // Fetch top 20 chunks (approx 10-15k chars)
          .get();

      const canonContext = chunksSnapshot.docs.map(doc => {
          const d = doc.data();
          return `[FILE: ${d.fileName}]: ${d.text.substring(0, 500)}...`; // Truncate per chunk to save space
      }).join("\n\n");

      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_HIGH_REASONING,
        tools: tools,
        generationConfig: {
            temperature: 0.7,
        }
      });

      // 4. Chat Session
      const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: `
                    SYSTEM: You are THE BUILDER, an advanced Architect AI for a narrative graph.
                    OBJECTIVE: Analyze the user's request and generate a JSON payload representing new nodes and connections.

                    === WORLD MAP (EXISTING ENTITIES) ===
                    (You can connect to these by name)
                    ${entitiesList || "No existing entities found."}

                    === NARRATIVE TRUTH (CANON CONTEXT) ===
                    (Use this to inform your suggestions and relationships)
                    ${canonContext || "No canon context found."}

                    PROTOCOL:
                    1. **THOUGHT PROCESS (HIDDEN):** First, analyze the request inside <thought> tags. Plan your graph updates here.
                    2. **RESPONSE (VISIBLE):** Write a concise, helpful response to the user. Do NOT show the JSON here. Do NOT show the thought tags.
                    3. **DEEP CONTEXT CHECK:** If the user mentions an entity, call 'get_entity_context(name)'.
                    4. **ANCHOR STRATEGY:**
                       - If an entity exists (check WORLD MAP), do NOT create a new full node.
                       - Use an Anchor Node: { "id": "existing_id", "name": "Name", "isAnchor": true, ... }
                    5. **FINAL OUTPUT (HIDDEN):**
                       - At the very end, output a JSON block wrapped in \`\`\`json\`\`\`.
                       - Structure: { "nodes": [...], "edges": [{ "source": "id", "target": "id", "label": "RELATION" }] }

                    USER REQUEST: ${req.body.prompt}
                ` }]
            }
        ]
      });

      // 5. Execution Loop (Handling Tool Calls & Streaming)
      let currentResult = await chat.sendMessageStream("Start analysis.");
      let buffer = "";
      let isInThought = false;
      let isInJson = false;

      while (true) {
        let functionCalls: any[] = [];

        for await (const chunk of currentResult.stream) {
            // A. Check for Function Calls
            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
                functionCalls = calls;
            }

            // B. Text Filtering (Stream Processing)
            let text = "";
            try {
                text = chunk.text();
            } catch (e) {
                // Ignore function call chunks
            }

            if (text) {
                buffer += text;

                // Process Buffer
                let processBuffer = true;
                while (processBuffer) {
                    processBuffer = false;

                    if (isInThought) {
                        const closeIdx = buffer.indexOf('</thought>');
                        if (closeIdx !== -1) {
                            buffer = buffer.substring(closeIdx + 10);
                            isInThought = false;
                            processBuffer = true; // Re-scan remaining buffer
                        } else {
                            // Clear buffer (it's all thought) but keep last few chars in case of partial tag
                            if (buffer.length > 20) buffer = buffer.slice(-20); // Keep tail for safety
                            else buffer = ""; // Or just clear if confirmed inside? Safe to clear if we are deep inside.
                            // Actually, safer to keep tail.
                        }
                    }
                    else if (isInJson) {
                         const closeIdx = buffer.indexOf('```');
                         if (closeIdx !== -1) {
                             buffer = buffer.substring(closeIdx + 3);
                             isInJson = false;
                             processBuffer = true;
                         } else {
                             if (buffer.length > 20) buffer = buffer.slice(-20);
                         }
                    }
                    else {
                        // NORMAL MODE
                        // Check for start tags
                        const thoughtStart = buffer.indexOf('<thought>');
                        const jsonStart = buffer.indexOf('```json');

                        let splitIdx = -1;
                        let nextState = 'NORMAL';

                        if (thoughtStart !== -1 && (jsonStart === -1 || thoughtStart < jsonStart)) {
                            splitIdx = thoughtStart;
                            nextState = 'THOUGHT';
                        } else if (jsonStart !== -1) {
                            splitIdx = jsonStart;
                            nextState = 'JSON';
                        }

                        if (splitIdx !== -1) {
                            // Emit content before tag
                            const content = buffer.substring(0, splitIdx);
                            if (content) res.write(JSON.stringify({ type: 'text', content: content }) + '\n');

                            buffer = buffer.substring(splitIdx + (nextState === 'THOUGHT' ? 9 : 7)); // Skip tag length approx
                            if (nextState === 'THOUGHT') isInThought = true;
                            if (nextState === 'JSON') isInJson = true;
                            processBuffer = true;
                        } else {
                            // No tags found yet. Emit safe part of buffer?
                            // We need to keep enough buffer to avoid splitting a tag (e.g. "<tho")
                            const SAFE_THRESHOLD = 20;
                            if (buffer.length > SAFE_THRESHOLD) {
                                const emit = buffer.substring(0, buffer.length - SAFE_THRESHOLD);
                                res.write(JSON.stringify({ type: 'text', content: emit }) + '\n');
                                buffer = buffer.substring(buffer.length - SAFE_THRESHOLD);
                            }
                        }
                    }
                }
            }
        }

        // Flush remaining buffer if it's not a tag
        if (buffer && !isInThought && !isInJson) {
             res.write(JSON.stringify({ type: 'text', content: buffer }) + '\n');
        }

        // C. Execute Tools if any
        if (functionCalls.length > 0) {
             const functionResponses = await Promise.all(functionCalls.map(async (call) => {
                 logger.info(`🛠️ Tool Call: ${call.name} args:`, call.args);

                 // EXECUTE TOOL
                 let result: any = { error: "Unknown tool" };
                 if (call.name === 'get_entity_context') {
                     const nameQuery = (call.args as any).name;
                     if (nameQuery) {
                         const entitiesRef = db.collection("users").doc(uid).collection("projects").doc(projectId).collection("entities");

                         // 1. METADATA FETCH (Firestore)
                         const q = entitiesRef.where("name", "==", nameQuery).limit(1);
                         const snap = await q.get();

                         let entityData: any = null;
                         if (!snap.empty) {
                             const d = snap.docs[0].data();
                             entityData = {
                                 found: true,
                                 id: snap.docs[0].id,
                                 name: d.name,
                                 type: d.type,
                                 description: d.description,
                                 isAnchor: true
                             };
                         }

                         // 2. VECTOR SEARCH (Narrative Memory)
                         let narrativeSummary = "No narrative memory found.";
                         try {
                             const embeddings = new GoogleGenerativeAIEmbeddings({
                                apiKey: googleApiKey.value(),
                                model: "embedding-001",
                                taskType: TaskType.RETRIEVAL_QUERY,
                             });

                             const queryVector = await embeddings.embedQuery(`Contexto narrativo sobre ${nameQuery}`);

                             const coll = db.collectionGroup("chunks");
                             const vectorQuery = coll.where("userId", "==", uid)
                                .where("projectId", "==", projectId)
                                .findNearest({
                                    queryVector: queryVector,
                                    limit: 8,
                                    distanceMeasure: 'COSINE',
                                    vectorField: 'embedding'
                                });

                             const vectorSnap = await vectorQuery.get();

                             if (!vectorSnap.empty) {
                                 const rawChunks = vectorSnap.docs.map(doc => doc.data().text).join("\n---\n");
                                 const flashModel = genAI.getGenerativeModel({
                                     model: MODEL_LOW_COST,
                                     generationConfig: { temperature: 0.3 }
                                 });
                                 const synthesisPrompt = `
                                    TASK: Synthesize a dense "Memory Record" for '${nameQuery}'.
                                    FRAGMENTS: ${rawChunks.substring(0, 30000)}
                                 `;
                                 const synthesisRes = await flashModel.generateContent(synthesisPrompt);
                                 narrativeSummary = synthesisRes.response.text();
                             }

                         } catch (vecError) {
                             logger.warn("Vector Search failed:", vecError);
                             narrativeSummary = "Vectors unavailable.";
                         }

                         if (entityData) {
                             result = { ...entityData, narrative_memory: narrativeSummary };
                         } else {
                             result = { found: false, narrative_traces: narrativeSummary };
                         }
                     }
                 }

                 return {
                     functionResponse: {
                         name: call.name,
                         response: result
                     }
                 };
             }));

             currentResult = await chat.sendMessageStream(functionResponses);
        } else {
            // Process Final JSON Payload
            const response = await currentResult.response;
            const fullText = response.text();

            const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                const jsonPayload = parseSecureJSON(jsonMatch[1], "BuilderOutput");
                if (jsonPayload) {
                    res.write(JSON.stringify({ type: 'data', payload: jsonPayload }) + '\n');
                }
            }
            break;
        }
      }

      res.end();

    } catch (e: any) {
      logger.error("Builder Stream Error", e);
      res.write(JSON.stringify({ type: 'text', content: `\n[System Error: ${e.message}]` }) + '\n');
      res.end();
    }
  }
);
