import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING } from "./ai_config";
import { parseSecureJSON } from "./utils/json";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- TOOL DEFINITION ---
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "get_entity_context",
        description: "Retrieves metadata for an existing entity (character, location, faction, etc.) from the database. Use this to verify if a node exists before creating a new one, or to link to it as an Anchor.",
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
    // 1. CORS Pre-flight (Manual handling just in case, though 'cors' option above usually handles it)
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

                    PROTOCOL:
                    1. REASONING FIRST: Explain your thought process to the user in plain text.
                    2. CHECK CONTEXT: If the user mentions an entity that might exist, call 'get_entity_context(name)' to fetch it.
                    3. ANCHOR STRATEGY:
                       - If an entity exists, do NOT create a new full node.
                       - Instead, verify its existence via the tool, then include it in the final JSON as an Anchor.
                       - Anchor Format: { "id": "real_id", "name": "Real Name", "type": "real_type", "isAnchor": true, "fx": 0, "fy": 0 } (Use fx/fy if available, or just omit).
                    4. NEW NODES:
                       - Create new nodes for new concepts.
                       - Schema: { "name": "Name", "type": "character|location|event|faction|idea", "description": "...", "subtype": "..." }
                    5. FINAL OUTPUT:
                       - At the very end, output a JSON block wrapped in \`\`\`json\`\`\`.
                       - Structure: { "nodes": [...], "edges": [...] }

                    USER REQUEST: ${req.body.prompt}
                ` }]
            }
        ]
      });

      // 5. Execution Loop (Handling Tool Calls)
      let currentResult = await chat.sendMessageStream("Start analysis.");

      while (true) {
        let functionCalls: any[] = [];

        for await (const chunk of currentResult.stream) {
            // A. Check for Function Calls
            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
                functionCalls = calls;
                // Note: The loop might continue yielding text before the function call is fully formed or if parallel?
                // Actually, standard behavior: text chunks -> function call chunk -> stream ends.
            }

            // B. Check for Text (Reasoning)
            const text = chunk.text();
            if (text) {
                // Sanitize: Don't stream the final JSON block as text if possible, or let frontend parse it?
                // We stream everything. Frontend distinguishes logic.
                // But better to stream text.
                res.write(JSON.stringify({ type: 'text', content: text }) + '\n');
            }
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
                         const db = getFirestore();
                         const entitiesRef = db.collection("users").doc(uid).collection("projects").doc(projectId).collection("entities");

                         // Try Exact Match first
                         // Issue: deterministic ID is unknown here (we don't have the hashing logic in this scope easily without importing).
                         // We query by 'name'.
                         const q = entitiesRef.where("name", "==", nameQuery).limit(1);
                         const snap = await q.get();

                         if (!snap.empty) {
                             const data = snap.docs[0].data();
                             result = {
                                 found: true,
                                 id: snap.docs[0].id,
                                 name: data.name,
                                 type: data.type,
                                 description: data.description,
                                 isAnchor: true
                             } as any;
                         } else {
                             // Fallback: Check Aliases?
                             // Limited query support in Firestore for array-contains.
                             // Simple fallback for now.
                             result = { found: false, message: "Entity not found in DB." };
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

             // D. Send Results back to Model
             currentResult = await chat.sendMessageStream(functionResponses);
             // Loop continues to process the Next Response (Reasoning + JSON)
        } else {
            // No function calls? Then we are done.
            // But wait, did we get the JSON?
            // The model might output JSON in the LAST text chunks.
            // We need to parse that JSON from the accumulated text?
            // Or better: We rely on the frontend to parse the JSON from the text stream?
            // The directive says: "buffering the JSON payload silently until it is complete".
            // Since we are streaming "text" directly to frontend, the frontend sees the JSON string being typed.
            // We want to extract it and send a clean `data` event.

            // Let's do a post-processing extraction if we can access the full response?
            // `currentResult.response` promise resolves to the aggregated response.
            const response = await currentResult.response;
            const fullText = response.text();

            const jsonMatch = fullText.match(/```json\n([\s\S]*?)\n```/);
            if (jsonMatch && jsonMatch[1]) {
                const jsonPayload = parseSecureJSON(jsonMatch[1], "BuilderOutput");
                if (jsonPayload) {
                    res.write(JSON.stringify({ type: 'data', payload: jsonPayload }) + '\n');
                }
            }

            break; // Exit loop
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
