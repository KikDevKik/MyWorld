import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import { MODEL_HIGH_REASONING, TEMP_CREATIVE } from "./ai_config";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// --- TOOL DEFINITION ---
const tools: any = [
  {
    functionDeclarations: [
      {
        name: "consult_archives",
        description: "Searches the Project's Canon (Knowledge Base) for lore, history, locations, or character details. Use this when the user asks a question about the world that isn't in the immediate context.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "The search query. Focus on keywords (e.g., 'The Fall of GardenFlowers', 'Who is Anna?', 'Magic System Rules')."
            }
          },
          required: ["query"]
        }
      }
    ]
  }
];

export const forgeChatStream = onRequest(
  {
    region: FUNCTIONS_REGION,
    secrets: [googleApiKey],
    timeoutSeconds: 300,
    memory: "1GiB",
    cors: ALLOWED_ORIGINS,
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
    let uid, requestProjectId;

    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      requestProjectId = req.body.folderId; // Project Scope

      if (!requestProjectId) throw new Error("Missing folderId (Project Scope)");
    } catch (e) {
      logger.error("Auth failed", e);
      res.status(403).send('Forbidden');
      return;
    }

    // 3. Setup Stream
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    const { query, history, filterScopePath } = req.body;
    const db = getFirestore();

    try {
      // --- SYSTEM PROMPT CONSTRUCTION ---
      const CONTINUITY_PROTOCOL = `
=== ORACLE PROTOCOL (FORGE CHAT) ===
ROLE: You are the 'Spirit of the Forge', an omniscient narrative assistant (Oracle) for the author.
OBJECTIVE: Answer questions about the story, suggest ideas, and maintain deep continuity.

[AGENCY & TOOLS]:
- You have access to 'consult_archives'.
- **CRITICAL:** If the user asks about something specific (a name, a place, an event) that you don't fully recall from the immediate conversation history, YOU MUST USE 'consult_archives' to verify the truth before answering.
- Do not hallucinate facts. If unsure, search.

[STYLE]:
- Tone: Immersive, helpful, slightly cryptic but precise.
- Language: Mirror the user's language (Spanish/English).

[SCOPE]:
- Current Project ID: ${requestProjectId}
- Active Scope Path: ${filterScopePath || "Global"}
`;

      const historyFormatted = (history || []).map((h: any) => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.message }]
      }));

      const genAI = new GoogleGenerativeAI(googleApiKey.value());
      const model = genAI.getGenerativeModel({
        model: MODEL_HIGH_REASONING,
        tools: tools,
        generationConfig: {
            temperature: TEMP_CREATIVE,
        } as any
      });

      const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: `SYSTEM INSTRUCTION:\n${CONTINUITY_PROTOCOL}` }]
            },
            {
                role: "model",
                parts: [{ text: "I am ready. The Archives are open." }]
            },
            ...historyFormatted
        ]
      });

      // 4. Execution Loop
      let currentResult = await chat.sendMessageStream(query);

      // Helper to emit JSON lines
      const emit = (data: any) => res.write(JSON.stringify(data) + '\n');

      while (true) {
        let functionCalls: any[] = [];

        for await (const chunk of currentResult.stream) {
            // A. Function Calls
            const calls = chunk.functionCalls();
            if (calls && calls.length > 0) {
                functionCalls = calls;
            }

            // B. Text
            let text = "";
            try { text = chunk.text(); } catch (e) { /* ignore */ }

            if (text) {
                emit({ type: 'text', content: text });
            }
        }

        // C. Execute Tools
        if (functionCalls.length > 0) {
             const functionResponses = await Promise.all(functionCalls.map(async (call) => {
                 logger.info(`🛠️ Tool Call: ${call.name} args:`, call.args);

                 if (call.name === 'consult_archives') {
                     emit({ type: 'tool_start', tool: 'consult_archives', query: (call.args as any).query });

                     const searchQuery = (call.args as any).query;

                     // 1. EMBEDDING (Native SDK)
                     // 🟢 FIX: Use 'text-embedding-004' (v1beta standard)
                     const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
                     const embedResult = await embeddingModel.embedContent(searchQuery);
                     const queryVector = embedResult.embedding.values;

                     // 2. FIRESTORE SEARCH
                     const coll = db.collectionGroup("chunks");
                     let chunkQuery = coll.where("userId", "==", uid);

                     // Path Filter
                     if (filterScopePath) {
                        chunkQuery = chunkQuery
                            .where("path", ">=", filterScopePath)
                            .where("path", "<=", filterScopePath + "\uf8ff");
                     } else {
                        // Global (Composite Index Req)
                        chunkQuery = chunkQuery
                            .where("path", ">=", "")
                            .where("path", "<=", "\uf8ff");
                     }

                     const vectorQuery = chunkQuery.findNearest({
                        queryVector: queryVector,
                        limit: 8, // Fetch top 8
                        distanceMeasure: 'COSINE',
                        vectorField: 'embedding'
                     });

                     const snap = await vectorQuery.get();

                     // 3. PROCESS RESULTS
                     const chunks = snap.docs.map(d => ({
                         text: d.data().text,
                         source: d.data().fileName
                     }));

                     const contextText = chunks.map(c => `[SOURCE: ${c.source}]\n${c.text}`).join("\n\n---\n\n");

                     const sourcesList = Array.from(new Set(chunks.map(c => c.source)));
                     emit({ type: 'tool_end', tool: 'consult_archives', sources: sourcesList });

                     return {
                         functionResponse: {
                             name: call.name,
                             response: {
                                 found: chunks.length > 0,
                                 context: contextText || "No relevant records found in the archives."
                             }
                         }
                     };
                 }

                 return { functionResponse: { name: call.name, response: { error: "Unknown tool" } } };
             }));

             // Feed tool outputs back to model
             currentResult = await chat.sendMessageStream(functionResponses);
        } else {
            // Done
            break;
        }
      }

      res.end();

    } catch (e: any) {
      logger.error("Forge Chat Stream Error", e);
      res.write(JSON.stringify({ type: 'error', message: e.message }) + '\n');
      res.end();
    }
  }
);
