import './admin';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";
import { MODEL_PRO, MODEL_FLASH, SAFETY_SETTINGS_PERMISSIVE, TEMP_PRECISION, TEMP_CREATIVE } from "./ai_config";
import { getAIKey, escapePromptVariable } from "./utils/security";
import { smartGenerateContent } from "./utils/smart_generate";
import { parseSecureJSON } from "./utils/json";
import { _getDriveFileContentInternal } from "./utils/drive";
import { GeminiEmbedder } from "./utils/vector_utils";
import { TaskType } from "@google/generative-ai";

const googleApiKey = defineSecret("GOOGLE_API_KEY");

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface PendingItem {
    code: string;           // ERR-001, WRN-002, SUG-003
    severity: 'critical' | 'warning' | 'suggestion';
    title: string;
    description: string;
    relatedFiles?: string[];
    category: 'continuidad' | 'worldbuilding' | 'personaje' | 'cronologia' | 'estructura';
}

interface ArquitectoInitResult {
    pendingItems: PendingItem[];
    initialMessage: string;
    sessionId: string;
    projectSummary: string;
    lastAnalyzedAt: string;
}

interface ArquitectoChatResult {
    response: string;
    pendingItemsUpdated?: PendingItem[];
    suggestedMode?: 'efecto_domino' | 'cronologia_revelacion' | 'investigacion_cultural' | 'personaje' | 'general';
}

// ─────────────────────────────────────────────
// PILAR 1: MÁQUINA DE ESTADOS (Desacoplada)
// ─────────────────────────────────────────────

export const PROMPT_TRIAGE = (contexto: string) => `Eres El Arquitecto, Co-Editor Jefe. Analiza estos documentos del autor: \n\n${contexto}\n\nTu misión es hacer una crítica constructiva e IMPLACABLE en un solo párrafo. DESTACA LOS HUECOS (falta de worldbuilding, conflictos difusos). Hazle sentir al autor que has leído su obra.\n\nREGLA DE ORO: NO DIGAS que esto es un "Lienzo en blanco". Reconoce el material existente.\n\nLUEGO de la crítica, ofrécele EXACTAMENTE DOS opciones de enfoque de la siguiente lista para solucionar los huecos encontrados: [Mega-Roadmap, Micro-Roadmap Quirúrgico, Roadmap de Detonación, Ingeniería Inversa, Muro del 2do Acto]. Nombra claramente las opciones elegidas en tu texto.`;

export const PROMPT_INQUISITOR = `Eres un co-editor de narrativa experto (estilo Truby/Sanderson). El autor carece de lore suficiente. Tu objetivo es identificar los pilares faltantes (Cultura, Política, Economía, Sistemas de Magia). REGLAS: 1. Haz UNA sola pregunta desafiante a la vez para acorralarlo a tomar decisiones de alto costo. 2. Si el autor se bloquea, NO le des la respuesta; lee su contexto y ofrécele 2 o 3 opciones divergentes como ejemplo. 3. Tú fuerzas al autor a pensar, no escribes por él.`;

export const PROMPT_ARCHITECT = `Eres un co-editor experto en la fase de ejecución. El Roadmap ya existe. REGLAS: 1. Ayuda a resolver problemas técnicos de la escena actual. 2. Haz sugerencias estructurales pero siempre cierra con una pregunta que devuelva el control al autor. 3. Mantén un tono analítico y directo.`;

export const PROMPT_CONSULTANT = `Eres un táctico narrativo actuando como Abogado del Diablo. El autor propone un cambio en su historia. REGLAS: 1. Evalúa las consecuencias de su decisión (Efecto Dominó). 2. Haz UNA pregunta táctica sobre qué se rompe aguas arriba o abajo en la trama. 3. Si genera un agujero de guion, ofrécele un modelo mental claro. 4. Exige confirmación antes de aprobar la alteración.`;

export function selectArquitectoState(
    worldEntitiesCount: number,
    currentObjective: string | null = null
): 'triage' | 'inquisitor' | 'consultant' | 'architect' {
    if (!currentObjective) return 'triage';
    if (worldEntitiesCount < 3) return 'inquisitor';
    return 'architect';
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

async function getProjectConfigLocal(userId: string) {
    const db = getFirestore();
    const doc = await db
        .collection("users").doc(userId)
        .collection("profile").doc("project_config")
        .get();
    return doc.exists ? doc.data() : {};
}

/**
 * Lee los archivos de Canon indexados en TDB_Index.
 * Devuelve hasta 30 archivos con su contenido resumido.
 */
async function readCanonContext(userId: string, projectId: string): Promise<string> {
    const db = getFirestore();

    try {
        const filesSnap = await db
            .collection("TDB_Index").doc(userId)
            .collection("files")
            .where("category", "==", "canon")
            .limit(30)
            .get();

        if (filesSnap.empty) return "Sin archivos Canon indexados.";

        const chunks: string[] = [];

        for (const doc of filesSnap.docs.slice(0, 20)) {
            const data = doc.data();
            const chunkSnap = await doc.ref.collection("chunks").doc("chunk_0").get();

            if (chunkSnap.exists) {
                const text = chunkSnap.data()?.text || "";
                chunks.push(`[CANON: ${data.name}]\n${text.substring(0, 600)}`);
            }
        }

        return chunks.join("\n\n---\n\n");
    } catch (e) {
        logger.warn("[ARQUITECTO] Error leyendo Canon:", e);
        return "Error al leer Canon.";
    }
}

/**
 * Lee los archivos de _RESOURCES desde Drive.
 * Solo lee los primeros 10 archivos de las carpetas resourcePaths.
 */
async function readResourcesContext(
    drive: any,
    resourcePaths: Array<{ id: string; name: string }>
): Promise<string> {
    if (!resourcePaths || resourcePaths.length === 0) return "Sin carpetas de recursos configuradas.";

    const resourceChunks: string[] = [];

    for (const path of resourcePaths.slice(0, 3)) {
        try {
            const listRes = await drive.files.list({
                q: `'${path.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
                fields: "files(id, name, mimeType)",
                pageSize: 5,
            });

            const files = listRes.data.files || [];

            for (const file of files.slice(0, 3)) {
                try {
                    const content = await _getDriveFileContentInternal(drive, file.id);
                    if (content && content.length > 50) {
                        resourceChunks.push(
                            `[RESOURCE: ${file.name}]\n${content.substring(0, 500)}`
                        );
                    }
                } catch (e) {
                    logger.warn(`[ARQUITECTO] No se pudo leer recurso: ${file.name}`);
                }
            }
        } catch (e) {
            logger.warn(`[ARQUITECTO] Error leyendo carpeta recurso: ${path.name}`);
        }
    }

    return resourceChunks.length > 0
        ? resourceChunks.join("\n\n---\n\n")
        : "No se encontraron archivos en _RESOURCES.";
}

// ─────────────────────────────────────────────
// PILAR 2: EL "OJO DE CLAUDE" (Preparación Multi-Hop)
// ─────────────────────────────────────────────
async function fetchInitialContext(userId: string): Promise<string> {
    const db = getFirestore();
    let baseContext = "";
    try {
        const chunksSnap = await db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .limit(15)
            .get();

        if (!chunksSnap.empty) {
            baseContext = chunksSnap.docs
                .map(d => `[Fragmento - ${d.data().fileName || 'Doc'}]:\n${d.data().text?.substring(0, 600)}`)
                .join('\n\n');
        }
        // TODO: [Sprint 6 - RAG Agéntico]
    } catch (e) {
        logger.warn('[ARQUITECTO] Error en fetchInitialContext:', e);
    }
    return baseContext;
}

// ─────────────────────────────────────────────
// PILAR 3: EL GENERADOR ATÓMICO Y CAMBIO DE ESQUEMA
// ─────────────────────────────────────────────
async function commitRoadmapTransaction(db: FirebaseFirestore.Firestore, userId: string, sessionId: string, data: { cards: any[], pendingItems: any[] }) {
    const batch = db.batch();
    const sessionRef = db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId);
    const roadmapRef = sessionRef.collection("architect").doc("roadmap");
    const cardsRef = roadmapRef.collection("cards");

    // Borra tarjetas antiguas
    const oldCardsSnap = await cardsRef.get();
    oldCardsSnap.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
    });

    // Escribe las nuevas
    data.cards.forEach((card, index) => {
        const newCardRef = cardsRef.doc();
        batch.set(newCardRef, { ...card, order: index, id: newCardRef.id });
    });

    // Sobrescribe project_config y limpia lastArquitectoAnalysis
    const configRef = db.collection("users").doc(userId).collection("profile").doc("project_config");
    batch.set(configRef, {
        arquitectoCachedPendingItems: data.pendingItems,
        lastArquitectoAnalysis: null
    }, { merge: true });

    await batch.commit();
}

// ─────────────────────────────────────────────
// FUNCIÓN 1: arquitectoInitialize
// Inicializa la sesión del Arquitecto.
// ─────────────────────────────────────────────

export const arquitectoInitialize = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 300,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<ArquitectoInitResult> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { accessToken } = request.data;
        if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Inicializando para ${userId}`);

        // 1. LEER CONFIG DEL PROYECTO
        const config = await getProjectConfigLocal(userId);
        const projectName = (config as any)?.projectName || "Proyecto sin nombre";

        // 2. CONTAR WORLD ENTITIES (No-RESOURCE)
        let worldEntitiesCount = 0;
        try {
            const entitiesSnap = await db
                .collection("users").doc(userId)
                .collection("WorldEntities")
                .where("status", "!=", "archived")
                .get();

            worldEntitiesCount = entitiesSnap.docs.filter((d: any) =>
                d.data().category !== 'RESOURCE'
            ).length;
            logger.info(`📊 [ARQUITECTO] WorldEntities no-RESOURCE: ${worldEntitiesCount}`);
        } catch (e) {
            logger.warn("[ARQUITECTO] Error contando WorldEntities:", e);
        }

        // 3. OJO DE CLAUDE: FETCH INITIAL CONTEXT
        const initialContext = await fetchInitialContext(userId);
        
        // 4. MÁQUINA DE ESTADOS
        let initialState = selectArquitectoState(worldEntitiesCount, null);
        let promptToUse = initialState === 'triage' ? PROMPT_TRIAGE : PROMPT_INQUISITOR;
        
        if (worldEntitiesCount < 3 && initialContext.length > 0) {
            initialState = 'triage';
            promptToUse = PROMPT_TRIAGE;
        }

        // 5. LLAMADA AL LLM PARA MENSAJE INICIAL
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        
        let pendingItems: PendingItem[] = [];
        let projectSummary = "Proyecto inicializado.";

        const fullContext = `
=== CONTEXTO DEL MANUSCRITO ===
${initialContext || "Sin documentos legibles."}
`;

        const initPrompt = `
${promptToUse}

ESTADO DEL PROYECTO:
- Entidades cristalizadas: ${worldEntitiesCount}
- Nombre: ${escapePromptVariable(projectName)}

${initialState === 'triage' ? fullContext : ''}

REGLAS ABSOLUTAS:
- Responde en el idioma del usuario.
- Termina con UNA pregunta enfocada.
- No des la respuesta por ellos.
- Máximo 4 oraciones.
        `;

        const initResult = await smartGenerateContent(genAI, initPrompt, {
            useFlash: false,
            temperature: TEMP_CREATIVE,
            contextLabel: "ArquitectoInitMessage",
        });

        const initialMessage = initResult.text ||
            "El Arquitecto en línea. ¿Qué frente de batalla vamos a atacar hoy?";

        // Crear sesión en Firestore
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc();

        const now = new Date().toISOString();

        await sessionRef.set({
            name: `Arquitecto ${new Date().toLocaleDateString()}`,
            type: 'arquitecto',
            createdAt: now,
            updatedAt: now,
            pendingItems,
            projectSummary,
            lastAnalyzedAt: now,
            // Snapshot de estado para persistencia
            snapshot: {
                currentState: initialState,
                worldEntitiesCount,
                hasContent: initialContext.length > 0
            }
        });

        await sessionRef.collection("messages").add({
            role: 'ia',
            text: initialMessage,
            timestamp: new Date(),
        });

        // Actualizar project_config
        await db
            .collection("users").doc(userId)
            .collection("profile").doc("project_config")
            .set({
                lastArquitectoAnalysis: now,
                arquitectoCachedPendingItems: pendingItems,
                arquitectoSummary: projectSummary
            }, { merge: true });

        logger.info(`✅ [ARQUITECTO] Init completo. Entidades: ${worldEntitiesCount}, Estado: ${initialState}`); 

        // TODO: [Sprint 6 - Persistencia]
        return {
            pendingItems,
            initialMessage,
            sessionId: sessionRef.id,
            projectSummary,
            lastAnalyzedAt: now,
        };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN 2: arquitectoChat
// ─────────────────────────────────────────────

export const arquitectoChat = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 300,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<ArquitectoChatResult> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const {
            query,
            sessionId,
            history = [],
            pendingItems = [],
            accessToken,
            objective,
        } = request.data;

        if (!query) throw new HttpsError("invalid-argument", "Falta query.");
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Chat para ${userId}: "${query.substring(0, 50)}..." | Objetivo: ${objective || 'Ninguno'}`);

        // 1. Buscar contexto relevante via RAG
        const config = await getProjectConfigLocal(userId);
        const projectId = (config as any)?.folderId || "unknown";
        const projectName = (config as any)?.projectName || "Proyecto";
        const styleIdentity = (config as any)?.styleIdentity || "Narrativa estándar";

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        let ragContext = "";
        try {
            const embeddings = new GeminiEmbedder({
                apiKey: getAIKey(request.data, googleApiKey.value()),
                model: "gemini-embedding-001",
                taskType: TaskType.RETRIEVAL_QUERY,
            });

            const queryVector = await embeddings.embedQuery(query);

            const vectorQuery = db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .where("path", ">=", "")
                .where("path", "<=", "\uf8ff")
                .findNearest({
                    queryVector,
                    limit: 10,
                    distanceMeasure: "COSINE",
                    vectorField: "embedding",
                });

            const snap = await vectorQuery.get();
            ragContext = snap.docs
                .map((d: any) => `[${d.data().fileName}]: ${d.data().text.substring(0, 400)}`)
                .join("\n\n---\n\n");
        } catch (e) {
            logger.warn("[ARQUITECTO] RAG fallido, continuando sin contexto vectorial:", e);
        }

        // 2. Formatear historial
        const historyText = history
            .slice(-10)
            .map((h: any) => `${h.role === 'user' ? 'AUTOR' : 'ARQUITECTO'}: ${h.message}`)
            .join("\n");

        // 3. Detectar modo según el query (auto-detección)
        const modeDetectionPrompt = `
Clasifica esta pregunta del autor en uno de los modos del Arquitecto:
- efecto_domino: preguntas sobre consecuencias de decisiones del mundo
- cronologia_revelacion: preguntas sobre qué sabe el lector y cuándo
- investigacion_cultural: preguntas sobre base histórica/cultural real
- personaje: preguntas sobre psicología, arco o motivación de personajes
- general: cualquier otra cosa

Pregunta: "${escapePromptVariable(query)}"

Responde SOLO con el nombre del modo (una palabra con guión bajo).
        `;

        const modeResult = await smartGenerateContent(genAI, modeDetectionPrompt, {
            useFlash: true,
            temperature: 0.1,
            contextLabel: "ArquitectoModeDetect",
        });

        const detectedMode = (modeResult.text || "general").trim().toLowerCase() as any;

        // 4. Instrucción de modo específica
        const modeInstructions: Record<string, string> = {
            efecto_domino: `
MODO ACTIVO: Efecto Dominó
Tu misión es trazar consecuencias en cadena.
Estructura tu respuesta en capas: Consecuencia inmediata -> Consecuencia a mediano plazo -> Consecuencia a largo plazo para la saga.
Siempre pregunta: "¿Qué decisión específica quieres explorar?" si no está clara.
            `,
            cronologia_revelacion: `
MODO ACTIVO: Cronología de Revelación
Tu misión es mapear QUÉ sabe el lector en cada punto de la historia.
Analiza: qué información existe en el Canon, en qué momento narrativo revelarla tiene más impacto.
Siempre pregunta por el libro/capítulo si no está especificado.
            `,
            investigacion_cultural: `
MODO ACTIVO: Investigación Cultural
Tu misión es explicar la base histórica/real que podría inspirar el worldbuilding del autor.
IMPORTANTE: Explica el por qué histórico real, pero siempre aclara que el autor decide qué adopta.
No impongas nada. Ofrece opciones. Pregunta qué cultura o período específico les interesa explorar.
            `,
            personaje: `
MODO ACTIVO: Análisis de Personaje
Tu misión es detectar huecos en el arco o psicología del personaje.
Usa preguntas socráticas: en lugar de decir "le falta motivación", pregunta "¿qué pierde este personaje si fracasa?".
Nunca escribas la motivación por el autor. Guíalo a descubrirla.
            `,
            general: `
MODO ACTIVO: Consulta General
Responde la pregunta del autor con profundidad estratégica.
Si la respuesta requiere más contexto, haz UNA pregunta de clarificación antes de responder.
            `,
        };

        // Lógica de Objetivo (Sprint 5.6)
        let objectivePrompt = "";
        if (objective) {
            switch (objective) {
                case "Ingeniería Inversa":
                    objectivePrompt = "El usuario ha elegido Ingeniería Inversa. Tu objetivo ahora es desgranar el texto que te envíe, extraer sus reglas implícitas y proponer cómo categorizarlas en el canon.";
                    break;
                case "Mega-Roadmap":
                    objectivePrompt = "El usuario ha elegido Mega-Roadmap. Tu objetivo es estructurar el mundo desde sus cimientos. Haz preguntas sobre la geografía, el sistema de poder y la herida original del protagonista.";
                    break;
                case "Micro-Roadmap Quirúrgico":
                    objectivePrompt = "El usuario ha elegido Micro-Roadmap Quirúrgico. Concéntrate exclusivamente en el hueco narrativo específico que el usuario quiere resolver. No te desvíes a otros temas del worldbuilding.";
                    break;
                case "Roadmap de Detonación":
                    objectivePrompt = "El usuario ha elegido Roadmap de Detonación. Tu objetivo es inyectar tensión y conflicto en el lore existente. Pregunta cómo las diferentes facciones o reglas de magia colisionan entre sí de forma violenta.";
                    break;
                case "Muro del 2do Acto":
                    objectivePrompt = "El usuario ha elegido Muro del 2do Acto. Tu objetivo es destrabar la trama central. Pregunta qué revelación o giro de tuerca puede ocurrir AHORA MISMO para cambiar la dirección de los personajes.";
                    break;
            }
        }

        // 5. Generar respuesta con Pro
        const systemPrompt = `
Eres El Arquitecto de MyWorld, un agente de planificación narrativa para escritores épicos.

TU IDENTIDAD:
- Eres diferente al Director (que ayuda durante la escritura escena a escena).
- Tu dominio es la PLANIFICACIÓN ESTRATÉGICA: saga completa, worldbuilding profundo, arcos de personaje.
- PREGUNTA antes de RESPONDER. Si hay ambigüedad, haz UNA pregunta de clarificación.
- Nunca escribas la historia por el autor. Guíalo a descubrirla él mismo.

PROYECTO: "${escapePromptVariable(projectName)}"
ESTILO DETECTADO: "${escapePromptVariable(styleIdentity)}"

${objectivePrompt ? `OBJETIVO ACTUAL DE LA SESIÓN: ${objectivePrompt}\n` : ''}
${modeInstructions[detectedMode] || modeInstructions.general}

PENDIENTES ACTIVOS DEL PROYECTO:
${JSON.stringify(pendingItems.slice(0, 5), null, 2)}

CONTEXTO RAG (archivos relevantes del proyecto):
${ragContext || "Sin contexto RAG disponible."}

HISTORIAL DE CONVERSACIÓN:
${historyText || "Primera interacción."}

REGLAS ABSOLUTAS:
1. Si hay ambigüedad -> UNA pregunta de clarificación PRIMERO, no respondas todavía.
2. Si la pregunta es clara -> Responde con profundidad estratégica.
3. Nunca escribas diálogos, escenas ni prosa narrativa. Eso es territorio del Director.
4. Detecta el idioma del autor y responde en ese idioma.
5. Máximo 300 palabras en la respuesta.

PREGUNTA DEL AUTOR: "${escapePromptVariable(query)}"
        `;

        const chatResult = await smartGenerateContent(genAI, systemPrompt, {
            useFlash: false,
            temperature: TEMP_CREATIVE,
            contextLabel: "ArquitectoChat",
        });

        const responseText = chatResult.text || "No pude procesar esa consulta. ¿Puedes reformularla?";

        // 6. Guardar en Firestore
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);

        const messagesRef = sessionRef.collection("messages");

        await messagesRef.add({
            role: 'user',
            text: query,
            timestamp: new Date(),
        });

        await messagesRef.add({
            role: 'ia',
            text: responseText,
            timestamp: new Date(),
            arquitectoMode: detectedMode,
        });

        await sessionRef.set({ updatedAt: new Date().toISOString() }, { merge: true });

        return {
            response: responseText,
            suggestedMode: detectedMode,
        };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN 3: arquitectoAnalyze
// ─────────────────────────────────────────────

export const arquitectoAnalyze = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 300,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<{ pendingItems: PendingItem[]; projectSummary: string; analyzedAt: string }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { sessionId, accessToken } = request.data;
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");
        if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Re-análisis para ${userId}, sesión ${sessionId}`);

        const config = await getProjectConfigLocal(userId);
        const projectId = (config as any)?.folderId || "unknown";
        const projectName = (config as any)?.projectName || "Proyecto";
        const resourcePaths = (config as any)?.resourcePaths || [];

        // Setup Drive
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth });

        const [canonContext, resourcesContext] = await Promise.all([
            readCanonContext(userId, projectId),
            readResourcesContext(driveClient, resourcePaths),
        ]);

        const fullContext = `
=== CANON ===
${canonContext}

=== REFERENCIAS ===
${resourcesContext}
        `.trim();

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        const analysisPrompt = `
Eres El Arquitecto. Realiza un análisis completo del proyecto "${escapePromptVariable(projectName)}".

${fullContext.substring(0, 50000)}

Genera una lista actualizada de pendientes. Responde SOLO con JSON:
{
  "items": [
    {
      "code": "ERR-001",
      "severity": "critical",
      "title": "Título",
      "description": "Descripción",
      "relatedFiles": ["archivo.md"],
      "category": "continuidad"
    }
  ],
  "projectSummary": "Estado actual del proyecto en 2-3 oraciones"
}

Máximo: 3 critical, 5 warning, 7 suggestion.
Detecta idioma y responde en ese idioma.
        `;

        const result = await smartGenerateContent(genAI, analysisPrompt, {
            useFlash: true,
            jsonMode: true,
            temperature: TEMP_PRECISION,
            contextLabel: "ArquitectoAnalyze",
        });

        let pendingItems: PendingItem[] = [];
        let projectSummary = "Análisis completado.";

        if (result.text) {
            const parsed = parseSecureJSON(result.text, "ArquitectoAnalyze");
            if (parsed && !parsed.error) {
                pendingItems = parsed.items || [];
                projectSummary = parsed.projectSummary || projectSummary;
            }
        }

        const analyzedAt = new Date().toISOString();

        // Actualizar sesión con nuevos pendientes
        await db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .set({
                pendingItems,
                projectSummary,
                lastAnalyzedAt: analyzedAt,
                updatedAt: analyzedAt,
            }, { merge: true });

        // Actualizar config
        await db
            .collection("users").doc(userId)
            .collection("profile").doc("project_config")
            .set({ lastArquitectoAnalysis: analyzedAt }, { merge: true });

        logger.info(`✅ [ARQUITECTO] Re-análisis completo. ${pendingItems.length} pendientes.`);

        return { pendingItems, projectSummary, analyzedAt };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN 4: arquitectoGenerateRoadmap
// ─────────────────────────────────────────────
export const arquitectoGenerateRoadmap = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 300,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<any> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        const { sessionId, accessToken } = request.data;
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");
        
        const userId = request.auth.uid;
        const db = getFirestore();

        // Pre-Flight Seguro
        const messagesSnap = await db.collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("messages_arquitect")
            .where("role", "==", "user")
            .get();

        if (messagesSnap.size < 3) {
            return { ready: false, reason: 'conversation_too_short' };
        }

        // Llama al LLM
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        const prompt = `Genera un roadmap estructurado y la lista de misiones pendientes para el proyecto.
Devuelve SOLO JSON con formato: 
{ 
  "cards": [
    {
      "title": "...",
      "description": "...",
      "status": "locked",
      "phase": "fundacion",
      "missions": [],
      "dominoLinks": [],
      "impactScore": 5
    }
  ], 
  "pendingItems": [
    {
      "code": "ERR-001",
      "severity": "critical",
      "title": "...",
      "description": "...",
      "category": "worldbuilding"
    }
  ] 
}`;

        const result = await smartGenerateContent(genAI, prompt, {
            useFlash: true,
            jsonMode: true,
            temperature: 0.2,
            contextLabel: "ArquitectoGenerateRoadmap"
        });

        let newCards: any[] = [];
        let newPendingItems: any[] = [];
        if (result.text) {
            const parsed = parseSecureJSON(result.text, "RoadmapGen");
            if (parsed && !parsed.error) {
                newCards = parsed.cards || [];
                newPendingItems = parsed.pendingItems || [];
            }
        }

        // Transacción Aislada
        await commitRoadmapTransaction(db, userId, sessionId, { cards: newCards, pendingItems: newPendingItems });

        return { ready: true };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN 5: arquitectoRecalculateCards
// ─────────────────────────────────────────────
export const arquitectoRecalculateCards = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 300,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<any> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        return { updatedCards: [] };
    }
);
