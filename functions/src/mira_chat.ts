// Nov 2026: la conversación de Mira (antes «el Director», función chatWithGem). Salió de index.ts tal cual,
// sin cambiar su comportamiento: era la función más larga del servidor y cada cambio ahí era difícil de revisar.
import { routedModel } from "./utils/routed_model";
import { MODEL_PRO, MODEL_FLASH, MODEL_FLASH_2_5_LITE, modelForRequest } from './ai_config';
import './admin'; // Ensure firebase-admin is initialized
import { HttpsError } from "firebase-functions/v2/https";
import { onCall } from "./utils/on_call";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import { TitaniumGenesis } from "./services/genesis";
import { getAIKey, getTier } from "./utils/security";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { google } from "./utils/gapi";
import { updateFirestoreTree } from "./utils/tree_utils";
import { GeminiEmbedder } from "./utils/vector_utils";
import { GoogleGenerativeAI, TaskType, SchemaType } from "./utils/genai";
import { _getDriveFileContentInternal } from "./utils/drive";
import { textHash } from "./utils/text_hash";
import { smartGenerateContent } from "./utils/smart_generate";
import { claudeEnabledForCurrentUser, myworldClaudeAvailable, pickClaudeModel, callClaude, CLAUDE_FICTION_SYSTEM, MYWORLD_VOICE, REWRITE_RULE, monthlyCapUsd } from "./utils/claude_router";
import { fileChangeDates, dateTag, CANON_DATES_RULE } from "./utils/canon_dates";
import { sharedContext, noteAuthorMessage } from "./utils/shared_context";
import { MIRA_SYSTEM } from "./prompts/mira";
import { CRAFT_RULE, splitCraft, saveCraft, craftContext } from "./craft";
import { planContext } from "./plan_context";
import { getMemoryContext } from "./utils/memory_store";
import { parseSecureJSON } from "./utils/json";
import { ingestFile, deleteFileVectors, IngestionFile } from './ingestion';
import * as crypto from 'crypto';
import { MAX_CHAT_MESSAGE_LIMIT, MAX_AI_INPUT_CHARS, MAX_SESSION_NAME_CHARS, TEMP_CREATIVE, TEMP_PRECISION, SAFETY_SETTINGS_PERMISSIVE, FolderRole, FinishReason, WriterProfile, AnyTypeHack, _getProjectConfigInternal, maskLog, extractUrls, fetchWebPageContent, matter, marked, sanitizeHtml, JSDOM, htmlToPdfmake, handleSecureError, appendToSessionLog, resolveDriveFolder, fetchFolderContents, flattenFileTree, createProjectCache, getFolderIdForRole, SecretManagerServiceClient, admin } from "./utils/legacy_stubs";

// --- QUOTA ERROR DETECTION ---
function isQuotaError(e: any): boolean {
    return (
        e?.status === 429 ||
        e?.message?.includes('429') ||
        e?.message?.includes('RESOURCE_EXHAUSTED') ||
        e?.message?.toLowerCase().includes('quota') ||
        e?.message?.includes('Too Many Requests')
    );
}
const QUOTA_USER_MESSAGE = "⚠️ Cuota de API Agotada: Tu plan gratuito de Google AI Studio alcanzó el límite diario. Las cuotas se restablecen automáticamente cada 24 horas. Mientras tanto, configura tu propia API Key en Preferencias → Configuración de IA para continuar sin interrupciones.";

const googleApiKey = defineSecret("GOOGLE_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

/**
 * 4. CHAT WITH GEM (El Oráculo RAG)
 * Responde preguntas usando la base de datos vectorial.
 */
export const chatWithGem = onCall(
  {
    region: FUNCTIONS_REGION,
    cors: ALLOWED_ORIGINS,
    enforceAppCheck: false,
    timeoutSeconds: 300,
    secrets: [googleApiKey, anthropicApiKey],
    memory: "2GiB",
  },
  async (request) => {
    console.log('🚀 WORLD ENGINE: Phase 2 - ' + new Date().toISOString());
    const db = getFirestore();

    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

    const { query, systemInstruction: clientSystemInstruction, history, categoryFilter, activeFileContent, activeFileName, isFallbackContext, filterScopePath, sessionId, attachedFiles, mediaAttachment, maxOutputTokens: requestedMaxTokens } = request.data;

    // 🟢 ALLOW EMPTY QUERY IF ATTACHMENT IS PRESENT
    if (!query && !mediaAttachment) {
      throw new HttpsError("invalid-argument", "Falta la pregunta.");
    }

    // Default query for image-only requests
    // Mira: su prompt vive en el servidor. Las herramientas viejas que aún mandan el suyo siguen funcionando.
    const systemInstruction: string = request.data?.persona === 'mira' ? MIRA_SYSTEM : (clientSystemInstruction || "");
    const finalQuery = query || "Analiza este archivo adjunto.";

    // 🛡️ SENTINEL CHECK: INPUT LIMITS
    if (finalQuery.length > MAX_CHAT_MESSAGE_LIMIT) {
      throw new HttpsError("resource-exhausted", `La pregunta excede el límite de ${MAX_CHAT_MESSAGE_LIMIT} caracteres.`);
    }

    const userId = request.auth.uid;
    const profileDoc = await db.collection("users").doc(userId).collection("profile").doc("writer_config").get();
    const profile: WriterProfile = profileDoc.exists
      ? profileDoc.data() as WriterProfile
      : { style: '', inspirations: '', rules: '' };

    await _getProjectConfigInternal(userId);

    let profileContext = '';
    if (profile.style || profile.inspirations || profile.rules) {
      profileContext = `
=== PERFIL DE ESCRITURA DEL AUTOR (lo escribió él en Ajustes) ===
ESTILO: ${profile.style || 'sin especificar'}
INSPIRACIONES: ${profile.inspirations || 'sin especificar'}
REGLAS QUE PIDE: ${profile.rules || 'sin especificar'}
=================================================================
`;
      logger.info(`🎨 Profile injected for user ${userId}`);
    }

    // 🟢 0.4. PERSPECTIVE DETECTION (Auto-Align)
    let perspectiveContext = "";
    if (activeFileContent) {
      const sample = activeFileContent.substring(0, 3000).toLowerCase();
      // Simple heuristic: Count pronouns (English & Spanish)
      // English: I, me, my, mine, myself
      // Spanish: yo, mi, mis, me, conmigo
      const firstPersonMatches = (sample.match(/\b(i|me|my|mine|myself|yo|mi|mis|conmigo)\b/g) || []).length;

      // English: he, him, his, she, her, hers, it, they, them, their
      // Spanish: él, ella, su, sus, le, les, ellos, ellas
      // Note: We avoid 'el' (the) and strictly use 'él' (he).
      const thirdPersonMatches = (sample.match(/\b(he|him|his|she|her|hers|it|they|them|their|él|ella|su|sus|le|les|ellos|ellas)\b/g) || []).length;

      let detectedPerspective = "Neutral/Unknown";
      if (firstPersonMatches > thirdPersonMatches && firstPersonMatches > 3) {
        detectedPerspective = "FIRST PERSON (I/Me/Yo)";
      } else if (thirdPersonMatches > firstPersonMatches && thirdPersonMatches > 3) {
        detectedPerspective = "THIRD PERSON (He/She/El/Ella)";
      }

      if (detectedPerspective !== "Neutral/Unknown") {
        perspectiveContext = `
[PERSONA NARRATIVA DEL TEXTO ABIERTO]:
El texto abierto parece estar narrado en ${detectedPerspective === "FIRST PERSON (I/Me/Yo)" ? "primera persona" : "tercera persona"} (detección automática por conteo de pronombres: puede fallar).
Si das un ejemplo breve, que vaya en esa misma persona. Si las «Decisiones del libro» de la memoria dicen otra cosa, mandan ellas; y si el texto y esas decisiones no coinciden, pregúntale al autor si es a propósito.
`;
        logger.info(`👁️ Perspective Detected: ${detectedPerspective} (1st: ${firstPersonMatches}, 3rd: ${thirdPersonMatches})`);
      }
    }

    try {
      // 🟢 0. DEEP TRACE: CONNECTIVITY CHECK
      try {
        const traceColl = db.collectionGroup("chunks");
        const traceQuery = traceColl.where("userId", "==", userId).limit(1);
        const traceSnapshot = await traceQuery.get();

        if (!traceSnapshot.empty) {
          const traceDoc = traceSnapshot.docs[0].data();
          logger.info(`[DEEP TRACE] Connectivity Check: ✅ SUCCESS. Found chunk from file: "${traceDoc.fileName}" (ID: ${traceSnapshot.docs[0].id})`);
        } else {
          logger.warn(`[DEEP TRACE] Connectivity Check: ⚠️ FAILED/EMPTY. No chunks found for user ${userId}. Index might be empty.`);
        }
      } catch (traceError: any) {
        logger.warn(`[DEEP TRACE] Connectivity Check SKIPPED/FAILED: ${traceError.message}`);
      }

      // 🟢 0.5. ENTITY RECOGNITION (RAG++ OPTIMIZATION)
      let entityContext = "";
      try {
        const lowerQuery = finalQuery.toLowerCase();

        // Strategy: Fetch names only to match, then fetch full doc
        const charsRef = db.collection("users").doc(userId).collection("characters").select("name");
        const ghostsRef = db.collection("users").doc(userId).collection("forge_detected_entities").select("name");

        const [charsSnap, ghostsSnap] = await Promise.all([charsRef.get(), ghostsRef.get()]);

        let matchedDocRef: any = null;
        let matchedName = "";

        // Check Existing
        for (const doc of charsSnap.docs) {
          const n = doc.data().name;
          if (n && lowerQuery.includes(n.toLowerCase())) {
            matchedDocRef = doc.ref;
            matchedName = n;
            break;
          }
        }

        // Check Ghosts (if no existing match found)
        if (!matchedDocRef) {
          for (const doc of ghostsSnap.docs) {
            const n = doc.data().name;
            if (n && lowerQuery.includes(n.toLowerCase())) {
              matchedDocRef = doc.ref;
              matchedName = n;
              break;
            }
          }
        }

        if (matchedDocRef) {
          const fullDoc = await matchedDocRef.get();
          const analysis = fullDoc.data()?.contextualAnalysis;
          if (analysis) {
            logger.info(`🎯 [ENTITY RECOGNITION] Matched: ${matchedName}`);
            entityContext = `
[CRITICAL CHARACTER CONTEXT - DEEP ANALYSIS]:
(This is verified intelligence about ${matchedName}. Use it as primary truth.)
${analysis}
`;
          }
        }

      } catch (e) {
        logger.warn(`⚠️ Entity Recognition failed:`, e);
      }

      // ═══ INYECCIÓN DE WORLDENTITIES PARA EL DIRECTOR ═══
      // Para cada entidad mencionada en el query, traer sus datos completos del SSOT
      let worldEntitiesRAG = "";
      try {
          // Extraer nombres de entidades del query usando el grafo en memoria
          const entityNamesInQuery: string[] = [];
          
          // Simple detección: buscar entidades conocidas que aparecen en el query
          const entitiesSnap = await db
              .collection("users").doc(userId)
              .collection("WorldEntities")
              .where("tier", "==", "ANCHOR")
              .select("name", "modules") // Solo traer lo necesario
              .limit(100)
              .get();

          for (const doc of entitiesSnap.docs) {
              const data = doc.data();
              if (data.category === 'RESOURCE') continue;
              
              const entityName = data.name?.toLowerCase();
              if (entityName && finalQuery.toLowerCase().includes(entityName)) {
                  entityNamesInQuery.push(doc.id);
                  
                  // Construir contexto rico para esta entidad
                  const psych = data.modules?.forge?.psychology;
                  const relations = data.modules?.nexus?.relations?.slice(0, 3) || [];
                  const injuries = data.modules?.forge?.physicalState?.injuries?.filter(
                      (i: any) => !i.isResolved
                  ) || [];
                  
                  worldEntitiesRAG += `\n[ENTIDAD: ${data.name}]`;
                  if (data.modules?.forge?.summary) {
                      worldEntitiesRAG += `\nResumen: ${data.modules.forge.summary}`;
                  }
                  if (psych?.goal) worldEntitiesRAG += `\nObjetivo: ${psych.goal}`;
                  if (psych?.flaw) worldEntitiesRAG += `\nDefecto: ${psych.flaw}`;
                  if (injuries.length > 0) {
                      worldEntitiesRAG += `\nLesiones activas: ${injuries.map((i: any) => i.description).join(', ')}`;
                  }
                  if (relations.length > 0) {
                      worldEntitiesRAG += `\nRelaciones clave: ${relations.map((r: any) => `${r.relationType} → ${r.targetName}`).join(', ')}`;
                  }
                  worldEntitiesRAG += '\n';
              }
          }
      } catch (e) {
          logger.warn("[DIRECTOR] No se pudo inyectar WorldEntities:", e);
      }

      // 1. Preparar Búsqueda Contextual
      let searchQuery = finalQuery;
      let historyText = "No hay historial previo.";

      if (history && Array.isArray(history) && history.length > 0) {
        historyText = history.map((h: any) =>
          `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");

        const userHistory = history
          .filter((h: any) => h.role === 'user' || h.role === 'USER')
          .slice(-3)
          .map((h: any) => h.message)
          .join(" ");

        searchQuery = `Contexto: ${userHistory} \n Pregunta: ${finalQuery}`;
        // 🛡️ SENTINEL: Mask sensitive query data in logs
        logger.info(`🔍 Búsqueda Vectorial Enriquecida (Length: ${searchQuery.length}):`, maskLog(finalQuery, 100));
      }

      if (history && Array.isArray(history) && history.length > 20) {
        const sliced = history.slice(-20);
        historyText = sliced.map((h: any) =>
          `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.message}`
        ).join("\n");
        logger.info(`✂️ Historial recortado a los últimos 20 mensajes para ahorrar tokens.`);
      }

      const finalKey = getAIKey(request.data, googleApiKey.value());

      // 2. Vectorizar Pregunta
      const embeddings = new GeminiEmbedder({
        apiKey: finalKey,
        model: "gemini-embedding-001",
        taskType: TaskType.RETRIEVAL_QUERY,
      });
      // Oct 2026: si la clave de Gemini falla, el Director responde sin canon en vez de romperse.
      let queryVector: number[] | null = null;
      let ragNotice = "";
      try {
        queryVector = await embeddings.embedQuery(searchQuery);
      } catch (embErr: any) {
        const em = String(embErr?.message || embErr);
        logger.warn(`⚠️ [RAG] Embedding falló; sigo sin canon: ${em.slice(0, 300)}`);
        ragNotice = /401|403|API key|ACCESS_TOKEN|PERMISSION/i.test(em)
          ? "⚠️ No pude consultar tu canon: Google rechazó tu clave de Gemini. Cámbiala en Ajustes → Claves de API (la de AI Studio sirve). Esta respuesta va sin fuentes.\n\n"
          : "⚠️ No pude consultar tu canon (Gemini no respondió). Esta respuesta va sin fuentes.\n\n";
      }

      // 3. Recuperar anys (Vector Search Nativo)
      const coll = db.collectionGroup("chunks");
      let chunkQuery = coll.where("userId", "==", userId);

      // 🟢 PRECONDITION FIX: ALWAYS USE PATH FILTER (Composite Index: userId + path + embedding)
      if (filterScopePath) {
        logger.info(`🛡️ SCOPED SEARCH: Using PATH PREFIX optimization: ${filterScopePath}`);
        chunkQuery = chunkQuery
          .where("path", ">=", filterScopePath)
          .where("path", "<=", filterScopePath + "\uf8ff");
      } else {
        // 🟢 GLOBAL SEARCH: UNIVERSAL PATH RANGE
        // We must include 'path' in the query to satisfy the Firestore Composite Index requirement.
        logger.info(`🌍 GLOBAL SEARCH: Using Universal Path Range ("" to "\\uf8ff")`);
        chunkQuery = chunkQuery
          .where("path", ">=", "")
          .where("path", "<=", "\uf8ff");
      }

      const fetchLimit = isFallbackContext ? 100 : 50;

      console.log('🔍 Vector Search Request for User:', userId);

      const vectorQuery = chunkQuery.findNearest({
        queryVector: queryVector || [0],
        limit: fetchLimit,
        distanceMeasure: 'COSINE',
        vectorField: 'embedding'
      });

      // 🟢 [SENTINEL] SAFE VECTOR SEARCH
      let vectorSnapshot;
      try {
        vectorSnapshot = queryVector ? await vectorQuery.get() : ({ docs: [] } as unknown as Awaited<ReturnType<typeof vectorQuery.get>>);
      } catch (vectorError: any) {
        if (vectorError.message?.includes('index') || vectorError.code === 9) {
          logger.error(`[SENTINEL_ALERTA_CRITICA]: Fallo de Precondición en Firestore. El índice vectorial no existe o está inactivo. LINK DE ACTIVACIÓN: [LINK_DE_ERROR_9]`);

          // 🟢 RETURN DUAL PAYLOAD
          return {
            response: "La Forja está calibrando sus lentes. Reintenta en 5 minutos.",
            sources: [],
            technicalError: {
              isTechnicalError: true,
              status: "error",
              error_code: "MISSING_VECTOR_INDEX",
              metadata: {
                collection: "TDB_Index",
                required_fields: ["userId", "path", "embedding"],
                action_url: "https://console.firebase.google.com/"
              },
              ui_hint: "ALERTA_NARANJA_SENTINEL"
            }
          };
        }
        throw vectorError;
      }

      console.log('🔢 Vectors Found (Raw):', vectorSnapshot.docs.length);
      if (vectorSnapshot.docs.length > 0) {
        const firstMatch = vectorSnapshot.docs[0].data();
        console.log('📜 First Match:', firstMatch.fileName);
      } else {
        console.log('⚠️ NO VECTORS FOUND. Check Index or UserID match.');
      }

      let candidates: any[] = vectorSnapshot.docs.map(doc => ({
        text: doc.data().text,
        embedding: [],
        fileName: doc.data().fileName || "Desconocido",
        fileId: doc.ref.parent.parent?.id || "unknown_id",
        category: doc.data().category || 'canon',
        // 🟢 Pass Path for Source Transparency
        path: doc.data().path || ""
      }));

      // 🟢 RAG DINÁMICO: Determinar límites según el tier de la entidad reconocida
      // Esto destru­ye el cuello de botella estático que filtraba protagonistas del contexto.
      let returnLimit = isFallbackContext ? 20 : 15;
      let MAX_CHUNKS_PER_FILE = 5;

      try {
        // Leer tier y occurrences de la entidad coincidente desde WorldEntities
        if (entityContext) {
          const entityName = entityContext.match(/DEEP ANALYSIS\]:\n\(This is verified intelligence about (.+?)\./)?.[1];
          if (entityName) {
            const weRef = db.collection('users').doc(userId).collection('WorldEntities');
            const snap = await weRef
              .where('name', '>=', entityName)
              .where('name', '<=', entityName + '\uf8ff')
              .limit(1)
              .get();

            if (!snap.empty) {
              const we = snap.docs[0].data();
              const tier = we.tier || 'GHOST';
              const occurrences = we.modules?.guardian?.occurrences || we.modules?.forge?.occurrences || 0;

              if (tier === 'ANCHOR' || occurrences > 50) {
                // Protagonistas / entidades densas: contexto máximo
                returnLimit = 150;
                MAX_CHUNKS_PER_FILE = 50;
                logger.info(`🔓 [RAG DINÁMICO] ANCHOR/ALTA DENSIDAD: ${entityName} (tier=${tier}, occ=${occurrences}) → returnLimit=150, cap=50`);
              } else if (tier === 'LIMBO' || occurrences > 10) {
                // Entidades secundarias importantes
                returnLimit = 40;
                MAX_CHUNKS_PER_FILE = 15;
                logger.info(`🔓 [RAG DINÁMICO] LIMBO/MEDIA DENSIDAD: ${entityName} (tier=${tier}, occ=${occurrences}) → returnLimit=40, cap=15`);
              } else {
                logger.info(`🔓 [RAG DINÁMICO] GHOST/DEFAULT: ${entityName} (tier=${tier}, occ=${occurrences}) → usando valores base`);
              }
            }
          }
        }
      } catch (dynErr: any) {
        logger.warn(`⚠️ [RAG DINÁMICO] Fallo al leer WorldEntities para ajuste dinámico: ${dynErr.message}. Usando valores base.`);
      }

      const finalContext: any[] = [];
      const rejectedCandidates: any[] = [];
      const fileCounts: { [key: string]: number } = {};

      const isScopedSearch = !!filterScopePath;

      // A) FILTER EXCLUSION (Active File)
      // CONDITION: Only filter if we have enough candidates (>10) to avoid "Diversity Shortfall"
      if (activeFileName && candidates.length > 10) {
        logger.info(`🔍 Filtering out chunks from active file: ${activeFileName}`);
        candidates = candidates.filter(c => c.fileName !== activeFileName);
      } else if (activeFileName) {
        logger.info(`🔍 Keeping active file chunks for context (Low Diversity: ${candidates.length})`);
      }

      // B) DIVERSITY PASS (Cap)
      for (const chunk of candidates) {
        if (finalContext.length >= returnLimit) break;

        const fid = chunk.fileId || chunk.fileName;
        const currentCount = fileCounts[fid] || 0;

        if (currentCount < MAX_CHUNKS_PER_FILE) {
          finalContext.push(chunk);
          fileCounts[fid] = currentCount + 1;
        } else {
          rejectedCandidates.push(chunk);
        }
      }

      // C) BACKFILL PASS (Fill Gaps) - DISABLE IF SCOPED
      if (!isScopedSearch && finalContext.length < returnLimit) {
        logger.info(`⚠️ Diversity Shortfall (${finalContext.length}/${returnLimit}). Backfilling...`);
        for (const chunk of rejectedCandidates) {
          if (finalContext.length >= returnLimit) break;
          finalContext.push(chunk);
        }
      } else if (isScopedSearch) {
        logger.info(`⚖️ SCOPED SEARCH ACTIVE: Backfilling DISABLED. Context is Finite (${finalContext.length} chunks).`);
      }

      const relevantanys = finalContext;

      // 🛑 FINITE CONTEXT CHECK (Prevent Crash on Empty)
      if (isScopedSearch && relevantanys.length === 0 && !ragNotice) {
        logger.warn("🛑 SCOPE EMPTY: No chunks found in selected path. Aborting AI call.");
        return {
          response: "No encontré información en los libros seleccionados.",
          sources: []
        };
      }
      logger.info('📚 RAG Context Sources:', relevantanys.map(c => c.fileName));

      // 5. Construir Contexto RAG
      const contextText = relevantanys.map(c => c.text).join("\n\n---\n\n");

      // 🟢 DEBUG SOURCES
      if (filterScopePath) {
        logger.info("📊 Scope Filter Result Sources:", relevantanys.map(c => `${c.fileName} (${(c as any).path})`));
      }

      // 6. Preparar Prompt del Sistema (Nivel GOD TIER)
      let activeCharacterPrompt = "";
      if (activeFileName && activeFileContent) {
        activeCharacterPrompt = `
[CONTEXTO VISUAL ACTIVO]:
Nombre: ${activeFileName}
(Este es el personaje o archivo que el usuario tiene abierto en pantalla. Prioriza su información sobre cualquier búsqueda externa si hay conflicto).
`;
      }

      // 🟢 PHASE 3: CONTEXT PORTAL INJECTION (Attached Chips)
      let attachedContextSection = "";
      if (attachedFiles && Array.isArray(attachedFiles) && attachedFiles.length > 0) {
        const filesContent = attachedFiles.map((f: any) =>
          `--- ARCHIVO ADJUNTO: ${f.name} ---\n${f.content}\n--- FIN ADJUNTO ---`
        ).join("\n\n");

        attachedContextSection = `
[PORTAL DE CONTEXTO - ARCHIVOS SELECCIONADOS MANUALMENTE]:
(El usuario ha adjuntado explícitamente estos archivos para que los analices. Son la prioridad MÁXIMA para tu respuesta).
${filesContent}
`;
      }

      // 🟢 0.6. WEB CONTENT INJECTION (The Spider)
      let webContext = "";
      const urls = extractUrls(finalQuery || "");
      if (urls.length > 0) {
        // Only scrape the first URL to avoid latency explosion
        const targetUrl = urls[0];
        const scrapeResult = await fetchWebPageContent(targetUrl);

        if (scrapeResult) {
          webContext = `
[CONTEXTO DEL ENLACE - ${(scrapeResult as any).title}]:
(El usuario ha proporcionado un enlace. Aquí tienes el contenido extraído de la web para que puedas responder basándote en él).
URL: ${(scrapeResult as any).url}
CONTENIDO:
${(scrapeResult as any).content}
--------------------------------------------------
`;
          logger.info(`🌐 Web Context Injected (${(scrapeResult as any).content.length} chars)`);
        }
      }

      // Oct 2026: protocolo reescrito. El anterior (VER. 00131.2 "CHAMELEON") traía datos fijos de TDB
      // (año 486, GardenFlowers, Elsa Liselotte) que se aplicaban a TODOS los usuarios, y pedía imitar
      // dialectos. Ahora es genérico: el "ahora" de la historia sale del texto, la memoria y el canon.
      // El bloque de razonamiento visible solo se pide a Gemini; la API de Claude lo bloquea.
      const THINKING_BLOCK_GEMINI = `[RAZONAMIENTO]
Antes de responder, analiza en un bloque <thinking> ... </thinking> qué dice el canon recuperado, qué dice el texto abierto y qué pide el autor. El autor puede desplegarlo si quiere verlo.

`;
      const CONTINUITY_PROTOCOL = `
=== PROTOCOLO DE CONTINUIDAD DE MYWORLD ===
ROL: Acompañas al autor en su propia obra. No escribes por él: lees su canon y su texto, opinas con argumentos y le ayudas a decidir.

[CANON, IDEA Y PROPUESTA]:
Los archivos de la carpeta «Ideas (no canon)» y las notas de sesiones son ideas del autor, no hechos de su mundo: cuando las uses, dilo («en tu idea…, que aún no es canon»). Lo que propongas tú va dicho como propuesta tuya. Nunca presentes una idea o una propuesta como si ya fuera verdad en su historia.

${CANON_DATES_RULE}

[IDIOMA Y TONO]:
- Responde en el idioma en que escribe el autor (si la obra está en inglés, en inglés).
- Respeta la terminología del mundo tal como aparece en el canon: nombres, lugares, términos propios.
- No imites dialectos ni modismos en tu voz salvo que el autor lo pida; puedes usarlos cuando propongas diálogo de un personaje que habla así.

[VERDAD DEL CANON (RAG)]:
Si un vínculo entre personajes (familiar, sentimental, de lealtad) NO aparece en los archivos recuperados, no lo infieras. Di: 'No hay datos de este vínculo en los archivos del proyecto'.

[MEMORIA VACÍA]:
Si NO se recupera nada de la [MEMORIA A LARGO PLAZO] sobre lo que se pregunta:
1. No inventes hechos del lore ni de personajes concretos.
2. Dilo claro: 'No encuentro registros canónicos sobre esto en el proyecto. Si quieres, lo definimos ahora y lo guardamos.'
3. Excepción: si el autor pide ideas generales (lluvia de ideas sin lore concreto), puedes proponer.

[BÚSQUEDA DE PERSONAJES]:
Si el autor pregunta por alguien que NO es el personaje activo, busca primero en la lista de personajes de la Memoria a Largo Plazo y luego en el resto del canon recuperado.

${activeCharacterPrompt}

[TIEMPO DE LA HISTORIA]:
1. El "ahora" de la escena lo marcan, en este orden: un encabezado \`[TIMELINE CONTEXT: Año X]\`, el texto abierto y la memoria del proyecto (plan del libro). Si nada lo indica, no supongas un año: habla en términos relativos o pregunta.
2. Lo que el canon fecha ANTES del ahora es historia: úsalo como experiencia, trauma o contexto.
3. Lo que pasa DESPUÉS del ahora, o va marcado \`# PLANIFICACIÓN FUTURA\`, es subtexto: no lo narres como ya ocurrido y no lo trates como contradicción.
4. En un flashback, usa el estado del mundo de ese momento y recalcula edades con la ficha del personaje.

[EXCEPCIONES]:
El contenido marcado \`[WORLD RULES]\` o \`[LOGIC EXCEPTION]\` en el canon es verdad absoluta, aunque contradiga la física, la historia o las reglas anteriores.

[JERARQUÍA DE LA VERDAD]:
Si un borrador contradice una ficha o un archivo de referencia, normalmente manda la ficha. Pero si el autor decidió un cambio después (memoria del proyecto, Nombres del mundo, Decisiones del libro), manda lo más reciente. Si no está claro cuál vale, señala la contradicción con las dos fuentes y pregúntale, sin elegir por él.
===================================================
`;

      let finalSystemInstruction = systemInstruction || "";
      finalSystemInstruction = THINKING_BLOCK_GEMINI + CONTINUITY_PROTOCOL + "\n\n" + entityContext + "\n\n" + finalSystemInstruction;

      if (categoryFilter === 'reference') {
        // 🟢 OMNISCIENT MODE: No longer exclusive — RAG already searches ALL user chunks.
        // We prioritize reference material in the response framing, but the AI can
        // cross-reference canon, characters and lore to give a complete answer.
        finalSystemInstruction += "\n\n[MODO LABORATORIO - PRIORIDAD DE FUENTES]:\nEstás en modo Analista de Recursos. Cuando respondas, prioriza la información de los archivos de referencia y recursos adjuntos. SIN EMBARGO, puedes y DEBES cruzar esa información con el resto del canon del proyecto (personajes, facciones, lore) recuperado de la Memoria a Largo Plazo para dar respuestas completas y conectadas. No te limites solo a los archivos de referencia, y di siempre de qué archivo sale cada cosa.";
      }

      let activeContextSection = "";
      if (activeFileContent) {
        const header = isFallbackContext
          ? "[CONTEXTO DE FONDO - ÚLTIMO ARCHIVO EDITADO]"
          : "[CONTEXTO INMEDIATO - ESCENA ACTUAL]";

        const note = isFallbackContext
          ? "(El usuario no tiene archivos abiertos. Este es el último archivo que editó. Úsalo como contexto principal pero no asumas que lo está viendo ahora.)"
          : "(Lo que el usuario ve ahora en su editor. Úsalo para mantener continuidad inmediata)";

        activeContextSection = `
${header}:
${note}
${activeFileContent}
          `;
      }

      const longTermMemorySection = `
[MEMORIA A LARGO PLAZO - DATOS RELEVANTES DEL PROYECTO]:
(Fichas de personajes, reglas del mundo, eventos pasados encontrados en la base de datos)
${contextText || "No se encontraron datos relevantes en la memoria."}
      `;

      const coAuthorInstruction = `
[INSTRUCCIÓN]:
La obra es del autor: tú la lees con él, no la escribes. Usa el Contexto Inmediato para la continuidad y apoya lo que digas en la Memoria a Largo Plazo. Antes de afirmar algo de su mundo, comprueba que esté en esos datos; si no está, dilo en vez de inventarlo.

[NOTA DE INTERFAZ]:
Si el autor quiere llevar a su documento algo que él mismo dictó o un ejemplo tuyo para adaptarlo, tiene el botón «Insertar» en la interfaz. No lo ofrezcas para que copie prosa tuya.
      `;

      const promptFinal = `
        ${profileContext}
        ${perspectiveContext}
        ${finalSystemInstruction}

        ${coAuthorInstruction}

        ${activeContextSection}

        ${attachedContextSection}

        ${webContext}

        ${longTermMemorySection}

        --- HISTORIAL DE CONVERSACIÓN ---
        ${historyText}
        -------------------------------------------

        PREGUNTA DEL USUARIO: "${finalQuery}"
      `;

      // ── Oct 2026: Claude (pagado por MyWorld) para usuarios autorizados ──
      // Sistema fijo + archivo abierto van con caché de prompt (se cobran a 1/10 al repetirse).
      // Si Claude falla (sin saldo, error), seguimos con Gemini como antes.
      if (claudeEnabledForCurrentUser()) {
        const labIdx = finalSystemInstruction.indexOf('[MODO LABORATORIO');
        const labExtra = labIdx >= 0 ? finalSystemInstruction.slice(labIdx) : '';
        // Oct 2026 (costos): razonamiento visible corto y sin el rol de "espejo" (choca con el tono nuevo);
        // canon limitado a los 8 fragmentos más relevantes (~9.000 caracteres).
        // NO pedir razonamiento en <thinking>: la API de Claude lo bloquea (refusal: reasoning_extraction).
        const continuityForClaude = CONTINUITY_PROTOCOL
          + "\nAl final de tu respuesta, en una línea aparte que empiece por «Fuentes:», nombra los archivos del canon en los que te apoyaste.\n";
        let memChars = 0;
        // Máx. 2 fragmentos por archivo: la búsqueda solía devolver el mismo borrador 4-5 veces.
        const perFile: Record<string, number> = {};
        const diverse = relevantanys.filter(c => { const k = c.fileName || '?'; perFile[k] = (perFile[k] || 0) + 1; return perFile[k] <= 2; });
        // Prioridad a fragmentos de la misma carpeta (mismo libro) que el archivo abierto.
        let activeFolder = '';
        try {
          if (activeFileName) {
            const fq = await getFirestore().collection('TDB_Index').doc(userId).collection('files').where('name', '==', activeFileName).limit(1).get();
            const ap: string = fq.docs[0]?.data()?.path || '';
            activeFolder = ap.includes('/') ? ap.slice(0, ap.lastIndexOf('/')) : '';
          }
        } catch { /* sin prioridad */ }
        // Oct 2026: la carpeta del capítulo suele tener solo el capítulo abierto (que ya va completo y se excluye
        // de la búsqueda). Lo útil está un nivel arriba, en la carpeta del libro (p. ej. "JUST ANNA": estructura,
        // personajes). Se hace una búsqueda extra limitada a esa carpeta y sus fragmentos van primero.
        const bookFolder = activeFolder.includes('/') ? activeFolder.slice(0, activeFolder.lastIndexOf('/')) : activeFolder;
        let bookChunks: any[] = [];
        if (bookFolder && queryVector) {
          try {
            const bq = await getFirestore().collectionGroup('chunks')
              .where('userId', '==', userId)
              .where('path', '>=', bookFolder + '/')
              .where('path', '<=', bookFolder + '/\uf8ff')
              .findNearest({ vectorField: 'embedding', queryVector, limit: 12, distanceMeasure: 'COSINE' })
              .get();
            const seen = new Set(diverse.map((c: any) => (c.text || '').slice(0, 80)));
            const perBook: Record<string, number> = {};
            bookChunks = bq.docs.map(d => ({ text: d.data().text, fileName: d.data().fileName || 'Desconocido', path: d.data().path || '', fileId: d.ref.parent.parent?.id }))
              .filter(c => c.fileName !== activeFileName && !seen.has((c.text || '').slice(0, 80)))
              .filter(c => { perBook[c.fileName] = (perBook[c.fileName] || 0) + 1; return perBook[c.fileName] <= 2; })
              .slice(0, 5);
          } catch (e: any) {
            logger.warn(`[DIRECTOR] Búsqueda en la carpeta del libro falló: ${e?.message}`);
          }
        }
        const inFolder = (c: any) => {
          const p = String(c.path || '');
          if (activeFolder && p.startsWith(activeFolder + '/')) return 2;
          if (bookFolder && p.startsWith(bookFolder + '/')) return 1;
          return 0;
        };
        const ranked = [...bookChunks, ...(activeFolder ? [...diverse].sort((a, b) => inFolder(b) - inFolder(a)) : diverse)];
        if (activeFolder) logger.info(`📂 [DIRECTOR] Libro "${bookFolder}": ${bookChunks.length} fragmentos extra (${[...new Set(bookChunks.map(c => c.fileName))].join(', ')}); en la búsqueda general: ${diverse.filter(c => inFolder(c) > 0).length}`);
        const claudeChunks = ranked.slice(0, 8).filter(c => { memChars += (c.text || '').length; return memChars <= 9000; });
        const changedAt = await fileChangeDates(userId, claudeChunks.map(c => c.fileId));
        const claudeMemory = `[MEMORIA A LARGO PLAZO - DATOS RELEVANTES DEL PROYECTO]:\n${claudeChunks.map(c => `(${c.fileName}${c.category === 'reference' ? ' · recurso, no canon' : ''}${dateTag(changedAt.get(c.fileId))})\n${c.text}`).join("\n\n---\n\n") || "No se encontraron datos relevantes en la memoria."}`;
        const staticSystem = `${CLAUDE_FICTION_SYSTEM}\n\n${systemInstruction || ''}\n\n${MYWORLD_VOICE}\n\n${REWRITE_RULE}\n\n${CRAFT_RULE}\n\n${continuityForClaude}\n\n${coAuthorInstruction}`;
        // Memoria de MyWorld: fuera de la caché (cambia cuando se guarda algo nuevo)
        // Nov 2026: + los focos de oficio ya anotados (para no repetirlos).
        // Nov 2026: + el plan del libro (misiones del roadmap): Mira no sabía lo decidido con el Arquitecto.
        if (query) await noteAuthorMessage(userId, "mira", String(query));
        const [myworldMemoryBase, craftNotes, planNotes, elsewhere] = await Promise.all([
          getMemoryContext(userId, `${finalQuery} ${activeFileName || ''} ${(activeFileContent || '').slice(0, 3000)}`),
          craftContext(userId),
          planContext(userId),
          sharedContext(userId, "mira"),
        ]);
        const myworldMemory = [myworldMemoryBase, elsewhere, planNotes, craftNotes].filter(Boolean).join('\n\n');
        // Quitar bloques <thinking> de respuestas anteriores (también provocan el bloqueo de Claude)
        // Oct 2026 (costos): el historial era la parte más cara sin caché (~12k tokens por mensaje): las
        // respuestas largas del Director viajaban completas 20 veces. Ahora: últimos 12 mensajes; los del
        // asistente recortados a su inicio (lo que importa para la continuidad) y los del autor a 2.000 caracteres.
        const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + ' […]' : s);
        const historyForClaude = Array.isArray(history) && history.length
          ? (() => {
              const recent = history.slice(-12);
              const lastAsst = recent.map((h: any) => h?.role).lastIndexOf('model') >= 0
                ? recent.map((h: any) => h?.role).lastIndexOf('model')
                : recent.map((h: any) => h?.role).lastIndexOf('assistant');
              return recent.map((h: any, i: number) => {
                const msg = String(h?.message || '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').replace(/<\/?thinking>/gi, '').trim();
                // La última respuesta va casi completa: el autor suele preguntar sobre ella ("explícame el punto B").
                return h?.role === 'user' ? `USUARIO: ${clip(msg, 2000)}` : `ASISTENTE: ${clip(msg, i === lastAsst ? 5000 : 900)}`;
              }).join('\n');
            })()
          : 'No hay historial previo.';
        const userText = `${myworldMemory}\n\n${profileContext}\n${perspectiveContext}\n${entityContext}\n${labExtra}\n\n${attachedContextSection}\n\n${webContext}\n\n${claudeMemory}\n\n--- HISTORIAL DE CONVERSACIÓN ---\n${historyForClaude}\n-------------------------------------------\n\nPREGUNTA DEL USUARIO: "${finalQuery}"`;
        const totalChars = staticSystem.length + activeContextSection.length + userText.length;
        logger.info(`📏 [DIRECTOR] chars: sistema=${staticSystem.length} archivo=${activeContextSection.length} memoria=${myworldMemory.length} canon=${claudeMemory.length} entidad=${entityContext.length} historial=${historyForClaude.length} adjuntos=${attachedContextSection.length} web=${webContext.length}`);
        const claudeModel = pickClaudeModel('Director', totalChars, true);
        const content: any[] = [];
        if (mediaAttachment?.mimeType?.startsWith('image/')) {
          content.push({ type: 'image', source: { type: 'base64', media_type: mediaAttachment.mimeType, data: mediaAttachment.data } });
        }
        content.push({ type: 'text', text: userText });
        const r = await callClaude({
          model: claudeModel,
          system: [
            // Caché de 1 h: el autor escribe y vuelve cada 10-30 min; la de 5 min nunca se reutilizaba.
            { text: staticSystem, cache: true, ttl1h: true },
            // El archivo abierto cambia cada vez que el autor escribe: caché de 5 min (escritura 1,25×) en vez de
            // 1 h (2×). Si pregunta varias veces seguidas sin escribir, igual se lee a 0,1×.
            ...(activeContextSection.trim() ? [{ text: activeContextSection, cache: true }] : []),
          ],
          content,
          // Oct 2026: 3000 no alcanzaba en pedidos grandes (p. ej. un reporte): el pensamiento se comía todo
          // y llegaba vacío. Solo se paga lo que se usa; la brevedad la sigue controlando el prompt.
          maxTokens: 8000,
          label: 'Director',
        });
        if (r.ok && r.text) {
          const sc = splitCraft(r.text);
          if (sc.craft) await saveCraft(userId, sc.craft, 'mira');
          return {
            response: ragNotice + sc.text,
            // Las fuentes son lo que de verdad recibió Claude (incluye los fragmentos de la carpeta del libro).
            sources: claudeChunks.map((chunk: any) => ({ text: String(chunk.text || '').substring(0, 200) + "...", fileName: chunk.fileName })),
          };
        }
        if (r.refusal) {
          // Claude se negó: no gastar la cuota diaria de Gemini (20/día), que además bloquea estos temas.
          return {
            response: `🛡️ Claude no respondió a este mensaje: lo bloqueó su filtro (motivo: ${r.stopReason || 'desconocido'}). Si se repite con mensajes normales, avísale a Claude en el chat de desarrollo para revisar el registro.`,
            sources: [],
          };
        }
        logger.warn('↩️ [DIRECTOR] Claude no respondió; usando Gemini.');
      }

      // 🟢 OPERATION BYPASS TOTAL: NATIVE SDK IMPLEMENTATION
      try {
        const genAI = new GoogleGenerativeAI(finalKey);

        // 🟢 GOD MODE: CONTEXT CACHING
        const config = await _getProjectConfigInternal(userId);
        let cachedContent = undefined;

        if (config.longTermMemory?.cacheName) {
          cachedContent = config.longTermMemory.cacheName;
          logger.info(`🧠 [GOD MODE] Using Context Cache in Forge: ${cachedContent}`);
        }

        // --- 1. CONFIGURATION & TOOLS ---
        const fetchPastSessionsTool = {
          functionDeclarations: [
            {
              name: "fetchPastSessions",
              description: "Recupera un resumen de las conversaciones pasadas del usuario para mantener la memoria transversal. Úsalo solo si el usuario pide recordar algo específico de otro chat.",
              parameters: {
                type: SchemaType.OBJECT,
                properties: {
                  searchQuery: {
                    type: SchemaType.STRING,
                    description: "Palabra clave para buscar en los títulos o contenido de sesiones pasadas."
                  }
                },
                required: ["searchQuery"]
              }
            }
          ]
        } as any; // Cast to any to bypass strict schema vs interface mismatch in SDK types

        // Oct 2026: en nivel normal (3.8-flash gratis) el razonamiento sin límite tardaba >3 min
        // y el cliente se rendía. Limitamos el thinking para respuestas en segundos.
        const chatModelName = modelForRequest(MODEL_PRO, request.data);
        const generationConfig: any = {
          temperature: TEMP_CREATIVE,
          maxOutputTokens: requestedMaxTokens ?? 8192,
          ...(chatModelName !== MODEL_PRO ? { thinkingConfig: { thinkingBudget: 1024 } } : {}),
        };

        // --- 2. ATTEMPT 1: STANDARD CALL WITH TOOLS ---
        // Oct 2026: en nivel gratis la llamada con herramienta + caché tardaba ~205 s constantes
        // (el Arquitecto, sin herramientas, responde en 8-26 s con el mismo modelo).
        // En nivel normal: sin herramienta ni caché (la caché era del modelo Pro) y con límite de tiempo.
        const isFreeTierChat = chatModelName !== MODEL_PRO;
        let model = genAI.getGenerativeModel({
          model: chatModelName,
          generationConfig,
          safetySettings: SAFETY_SETTINGS_PERMISSIVE,
          ...(isFreeTierChat ? {} : { cachedContent: cachedContent, tools: [fetchPastSessionsTool] }),
        } as any, { timeout: 120000 });

        // 🟢 MULTIMODAL PAYLOAD
        let payload: any = promptFinal;
        if (mediaAttachment) {
          payload = [
            { text: promptFinal },
            { inlineData: mediaAttachment }
          ];
          logger.info("📸 Multimodal Payload Detected");
        }

        logger.info("🚀 [BYPASS] Attempt 1: Calling Gemini Native SDK with Tools...");

        let chat = model.startChat();
        // Oct 2026: el modelo gratuito devuelve a veces 503 "high demand". Reintentamos
        // y, en nivel gratis, pasamos a un modelo de respaldo antes de rendirnos.
        let result: any;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await chat.sendMessage(payload);
            break;
          } catch (sendErr: any) {
            const m = String(sendErr?.message || '');
            const overloaded = m.includes('503') || m.toLowerCase().includes('high demand') || m.toLowerCase().includes('overloaded');
            if (!overloaded || attempt === 2) throw sendErr;
            logger.warn(`⏳ [DIRECTOR] Modelo saturado (intento ${attempt + 1}). Reintentando...`);
            await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            if (attempt === 1 && isFreeTierChat) {
              logger.warn(`🔁 [DIRECTOR] Cambiando a modelo de respaldo ${MODEL_FLASH_2_5_LITE}.`);
              model = genAI.getGenerativeModel({
                model: MODEL_FLASH_2_5_LITE,
                generationConfig: { temperature: TEMP_CREATIVE, maxOutputTokens: requestedMaxTokens ?? 8192 },
                safetySettings: SAFETY_SETTINGS_PERMISSIVE,
              } as any, { timeout: 120000 });
              chat = model.startChat();
            }
          }
        }
        let response = result.response;

        // 🟢 TOOL HANDLING (FUNCTION CALLING)
        // Oct 2026: functionCalls() lanza excepción si la respuesta fue bloqueada (PROHIBITED_CONTENT),
        // lo que saltaba el intento 2 (sin fragmentos del canon). Ahora el bloqueo sigue al intento 2.
        let calls: any;
        try { calls = response.functionCalls(); } catch { calls = undefined; }
        if (calls && calls.length > 0) {
          const call = calls[0];
          if (call.name === "fetchPastSessions") {
            logger.info("🧠 AI requested fetchPastSessions tool (Meta-RAG Mode)");
            const { searchQuery: q } = call.args as any;

            let sessionContexts: string[] = [];

            try {
              // 1. Vectorize Query
              const embeddings = new GeminiEmbedder({
                apiKey: getAIKey(request.data, googleApiKey.value()),
                model: "gemini-embedding-001"
              });
              const queryVector = await embeddings.embedQuery(q || "conversaciones pasadas");

              // 2. Vector Search (Firestore findNearest)
              const vectorQuery = db.collection("users").doc(userId)
                .collection("muse_sessions")
                .findNearest({
                  queryVector: queryVector,
                  distanceMeasure: "COSINE",
                  limit: 5,
                  vectorField: "embedding"
                });

              const vectorSnap = await vectorQuery.get();

              if (!vectorSnap.empty) {
                sessionContexts = await Promise.all(vectorSnap.docs.map(async d => {
                  const data = d.data();
                  // Fetch last few messages for deeper context
                  const messages = await d.ref.collection("messages").orderBy("timestamp", "desc").limit(3).get();
                  const msgText = messages.docs.reverse().map(m => `[${m.data().role}]: ${m.data().text}`).join("\n");
                  return `SESIÓN: ${data.title}\nRESUMEN: ${data.preview}\nCONTENIDO RELEVANTE:\n${msgText}`;
                }));
              } else {
                // Fallback: Recent sessions if no vector match
                const recentSnap = await db.collection("users").doc(userId)
                  .collection("muse_sessions")
                  .orderBy("lastActivity", "desc")
                  .limit(3)
                  .get();

                sessionContexts = recentSnap.docs.map(d => `SESIÓN: ${d.data().title}\nRESUMEN: ${d.data().preview}`);
              }

            } catch (vecError) {
              logger.error("💥 Meta-RAG Search Failed:", vecError);
              // Critical Fallback
              sessionContexts = ["Error en búsqueda semántica. Intenta una búsqueda por fecha."];
            }

            const toolResponse = sessionContexts.length > 0
              ? "Aquí tienes fragmentos de conversaciones pasadas semánticamente relevantes:\n\n" + sessionContexts.join("\n\n---\n\n")
              : "No encontré conversaciones pasadas relevantes para tu búsqueda.";

            // Send tool result back
            result = await chat.sendMessage([{
              functionResponse: {
                name: "fetchPastSessions",
                response: { content: toolResponse }
              }
            }]);
            response = result.response;
          }
        }

        let finishReason = response.candidates?.[0]?.finishReason;

        // 🟢 DEBUG RAW RESPONSE
        // 🛡️ SENTINEL UPDATE: Truncate log to prevent PII leakage and log bloat
        const rawResponseStr = JSON.stringify(result, null, 2);
        const truncatedLog = rawResponseStr.length > 2000 ? rawResponseStr.substring(0, 2000) + "... (TRUNCATED)" : rawResponseStr;
        logger.info("🔍 [RAW NATIVE RESPONSE]:", truncatedLog);

        // --- 3. RETRY LOGIC (SANITIZATION FALLBACK) ---
        // REVISION 00130: If Attempt 1 is blocked, Attempt 2 must STRIP RAG chunks.
        const isBlocked = finishReason === FinishReason.SAFETY || finishReason === (FinishReason as any).OTHER || String(finishReason) === 'PROHIBITED_CONTENT' || (response.promptFeedback?.blockReason);
        const isEmpty = !response.candidates || response.candidates.length === 0 || !response.text;

        if (isBlocked || isEmpty) {
          logger.warn(`⚠️ [BYPASS] Attempt 1 Failed (Reason: ${finishReason}). Initiating SANITIZATION PROTOCOL...`);

          // 🟢 SANITIZATION: STRIP RAG MEMORY (The 6 chunks)
          const sanitizedPrompt = `
                ${profileContext}
                ${CONTINUITY_PROTOCOL}

                [MODO DE EMERGENCIA / SANITIZED CONTEXT]
                (El contexto detallado ha sido ocultado por protocolos de seguridad. Responde de forma constructiva basándote en la pregunta).

                ${activeFileContent ? `[ACTIVE FILE SUMMARY]: ${activeFileContent.substring(0, 500)}... (Truncated)` : ''}

                --- HISTORIAL DE CONVERSACIÓN ---
                ${historyText}
                -------------------------------------------

                PREGUNTA DEL USUARIO: "${finalQuery}"
             `;

          let sanitizedPayload: any = sanitizedPrompt;
          if (mediaAttachment) {
            sanitizedPayload = [
              { text: sanitizedPrompt },
              { inlineData: mediaAttachment }
            ];
          }

          logger.info("🚀 [BYPASS] Attempt 2: Retrying with SANITIZED PROMPT...");

          // Retry with same permissive settings but clean prompt
          result = await model.generateContent(sanitizedPayload);
          response = result.response;
          finishReason = response.candidates?.[0]?.finishReason;

          logger.info("🔍 [RAW NATIVE RESPONSE 2]:", JSON.stringify(result, null, 2));
        }

        // --- 4. FINAL VALIDATION ---
        let finalText = "";
        try {
          finalText = response.text();
        } catch (e) {
          // .text() throws if there is no text. Use robust check.
          finalText = "";
        }

        if (!finalText && (finishReason === FinishReason.SAFETY)) {
          // FAIL STATE A: BLOCKED
          return {
            response: "⚠️ Contenido Bloqueado por Protocolos de Seguridad (Gemini Refusal).",
            sources: []
          };
        } else if (!finalText) {
          // FAIL STATE B: EMPTY/NULL
          // 🟢 FALLBACK PROTOCOL INJECTED
          throw new Error("EMPTY_FRAGMENT_ERROR");
        }

        return {
          response: finalText,
          sources: relevantanys.map(chunk => ({
            text: chunk.text.substring(0, 200) + "...",
            fileName: chunk.fileName
          }))
        };

      } catch (invokeError: any) {
        if (invokeError.message === "EMPTY_FRAGMENT_ERROR") {
          logger.error("💥 [BYPASS] CRITICAL: Gemini returned empty fragment after retries.");
          return {
            response: "La IA devolvió una respuesta vacía. Vuelve a enviar tu mensaje; si se repite, pregúntalo de otra forma.",
            sources: []
          };
        }

        // Detect API quota / rate-limit errors and surface them clearly
        const invokeMsg = String(invokeError?.message || '').toLowerCase();
        const isOverloaded = invokeMsg.includes('503') || invokeMsg.includes('high demand') || invokeMsg.includes('overloaded');
        const errorText = isQuotaError(invokeError)
            ? (claudeEnabledForCurrentUser()
                ? "⚠️ Claude no pudo responder este mensaje y el respaldo gratuito (Gemini) ya gastó su cuota de hoy. Vuelve a enviarlo en un momento."
                : QUOTA_USER_MESSAGE)
            : isOverloaded
              ? "⏳ Los servidores gratuitos de Gemini están saturados en este momento. Tu mensaje no se perdió: vuelve a enviarlo en un minuto."
              : /PROHIBITED_CONTENT|blocked/i.test(String(invokeError?.message || ''))
                ? "🛡️ Gemini bloqueó esta respuesta con su filtro de contenido, que MyWorld no puede desactivar. Suele saltar con escenas duras que involucran a menores (acoso, violencia, muerte). Tu texto no tiene nada malo: prueba a reformular la pregunta de forma más general o cierra el archivo abierto y vuelve a preguntar."
                : (/timed? ?out|abort|deadline/i.test(String(invokeError?.message || "")) ? "⏳ La IA tardó demasiado en responder y lo corté. Tu mensaje no se perdió: vuelve a enviarlo en un momento." : "⚠️ No pude responder esta vez. Vuelve a enviar tu mensaje en un momento; si se repite, escríbenos a deidev180@gmail.com.");

        logger.error(
          isQuotaError(invokeError) ? "⚠️ [QUOTA] Cuota API agotada en forgeRagChat:" : "💥 ERROR CRÍTICO EN GENERACIÓN (Chat RAG) [CATCH-ALL]:",
          invokeError?.message || invokeError
        );

        if (sessionId) {
          try {
            await db.collection("users").doc(userId)
              .collection("forge_sessions").doc(sessionId)
              .collection("messages").add({
                role: 'system',
                text: errorText,
                timestamp: new Date().toISOString(),
                type: 'error',
                isError: true,
                isQuota: isQuotaError(invokeError)
              });
          } catch (persistError: any) {
            logger.error("Error al persistir mensaje de fallo:", persistError?.message);
          }
        }

        return { response: errorText, sources: [] };
      }

    } catch (error: any) {
      if (isQuotaError(error)) {
        logger.warn("⚠️ [QUOTA] Cuota API agotada en forgeRagChat (setup):", error?.message);
        return { response: QUOTA_USER_MESSAGE, sources: [] };
      }
      logger.error("Error General en Chat RAG (Setup):", error);
      return {
        response: `⚠️ Error del Sistema: Fallo en la memoria a largo plazo. (${error.message || 'Unknown Error'})`,
        sources: []
      };
    }
  }
);
