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
// FUNCIÓN 1: arquitectoInitialize
// Inicializa la sesión del Arquitecto.
// Lee Canon + _RESOURCES, genera lista de pendientes,
// devuelve mensaje inicial con UNA sola pregunta.
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

        // 1. Leer config del proyecto
        const config = await getProjectConfigLocal(userId);
        const projectId = (config as any)?.folderId || "unknown";
        const projectName = (config as any)?.projectName || "Proyecto sin nombre";
        const resourcePaths = (config as any)?.resourcePaths || [];

        // 2. Leer contexto
        const drive = new google.auth.OAuth2();
        drive.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth: drive });

        const [canonContext, resourcesContext] = await Promise.all([
            readCanonContext(userId, projectId),
            readResourcesContext(driveClient, resourcePaths),
        ]);

        const fullContext = `
=== CANON DEL PROYECTO ===
${canonContext}

=== REFERENCIAS E INSPIRACIONES (_RESOURCES) ===
${resourcesContext}
        `.trim();

        // 3. Generar lista de pendientes con Flash
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        const pendingPrompt = `
Eres El Arquitecto, un agente de planificación narrativa para escritores épicos.

Analiza el siguiente contenido del proyecto "${escapePromptVariable(projectName)}" y genera una lista de pendientes categorizados.

PROYECTO:
${fullContext.substring(0, 50000)}

INSTRUCCIONES:
1. Identifica huecos en el worldbuilding (reglas mágicas sin definir, inconsistencias, etc.)
2. Detecta contradicciones entre hechos establecidos
3. Señala arcos de personaje incompletos o sin resolver
4. Sugiere elementos que mejorarían la cohesión narrativa
5. Detecta preguntas sin responder sobre cronología o causa-efecto

CATEGORÍAS:
- continuidad: contradicciones o inconsistencias entre hechos
- worldbuilding: reglas del mundo sin definir o poco claras
- personaje: arcos incompletos, motivaciones poco claras
- cronologia: orden de eventos confuso o sin establecer
- estructura: elementos de trama sin resolución

SEVERIDADES:
- critical: contradicción directa que rompe la narrativa
- warning: elemento ambiguo que puede causar problemas
- suggestion: mejora que haría la historia más sólida

CÓDIGOS:
- ERR-XXX para critical
- WRN-XXX para warning  
- SUG-XXX para suggestion

Responde SOLO con JSON válido, sin markdown:
{
  "items": [
    {
      "code": "ERR-001",
      "severity": "critical",
      "title": "Título corto",
      "description": "Descripción clara de 1-2 oraciones",
      "relatedFiles": ["archivo.md"],
      "category": "continuidad"
    }
  ],
  "projectSummary": "Resumen de 2-3 oraciones del estado del proyecto"
}

Genera máximo: 3 critical, 5 warning, 7 suggestion.
Si no encuentras problemas reales, genera menos. No inventes problemas que no existen.
Detecta el idioma del contenido y responde en ese mismo idioma.
        `;

        const pendingResult = await smartGenerateContent(genAI, pendingPrompt, {
            useFlash: true,
            jsonMode: true,
            temperature: TEMP_PRECISION,
            contextLabel: "ArquitectoPending",
        });

        let pendingItems: PendingItem[] = [];
        let projectSummary = "Proyecto analizado.";

        if (pendingResult.text) {
            const parsed = parseSecureJSON(pendingResult.text, "ArquitectoPending");
            if (parsed && !parsed.error) {
                pendingItems = parsed.items || [];
                projectSummary = parsed.projectSummary || projectSummary;
            }
        }

        // 4. Generar mensaje inicial con UNA sola pregunta (Pro para mayor calidad)
        const criticalCount = pendingItems.filter(i => i.severity === 'critical').length;
        const warningCount = pendingItems.filter(i => i.severity === 'warning').length;

        const initPrompt = `
Eres El Arquitecto, un agente de planificación narrativa para escritores. Tu rol es diferente al Director: 
- El Director ayuda mientras el autor escribe escena a escena.
- Tú eres el planificador estratégico: analizas la saga completa, detectas huecos, y guías antes de que el autor escriba.

Has analizado el proyecto "${escapePromptVariable(projectName)}" y encontraste:
- ${criticalCount} problemas críticos
- ${warningCount} advertencias
- Resumen: ${escapePromptVariable(projectSummary)}

PENDIENTES DETECTADOS:
${JSON.stringify(pendingItems.slice(0, 5), null, 2)}

Genera un mensaje de bienvenida que:
1. Se presente brevemente como El Arquitecto (1 oración)
2. Resuma en 1-2 oraciones qué encontraste en el proyecto
3. Haga UNA SOLA pregunta al autor para entender dónde necesita ayuda HOY

REGLAS:
- Solo UNA pregunta al final. No más.
- No des respuestas ni soluciones todavía. Solo pregunta.
- Tono: profesional pero cálido, como un co-escritor experimentado
- Detecta el idioma del contenido del proyecto y responde en ese idioma
- Máximo 4 oraciones en total

Responde SOLO con el texto del mensaje, sin JSON ni markdown.
        `;

        const initResult = await smartGenerateContent(genAI, initPrompt, {
            useFlash: false,
            temperature: TEMP_CREATIVE,
            contextLabel: "ArquitectoInitMessage",
        });

        const initialMessage = initResult.text ||
            "El Arquitecto en línea. He analizado tu proyecto. ¿En qué área necesitas trabajar hoy: worldbuilding, personajes, o estructura de trama?";

        // 5. Crear sesión en Firestore
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc();

        const now = new Date().toISOString();

        await sessionRef.set({
            name: `Arquitecto ${new Date().toLocaleDateString()}`,
            type: 'arquitecto',
            createdAt: now,
            updatedAt: now,
            pendingItems: pendingItems,
            projectSummary: projectSummary,
            lastAnalyzedAt: now,
        });

        // 6. Guardar mensaje inicial en la sesión
        await sessionRef.collection("messages").add({
            role: 'ia',
            text: initialMessage,
            timestamp: new Date(),
        });

        // 7. Actualizar config con timestamp de análisis
        await db
            .collection("users").doc(userId)
            .collection("profile").doc("project_config")
            .set({ lastArquitectoAnalysis: now }, { merge: true });

        logger.info(`✅ [ARQUITECTO] Inicialización completa. ${pendingItems.length} pendientes. Sesión: ${sessionRef.id}`);

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
// Chat principal del Arquitecto.
// Comportamiento: pregunta PRIMERO, responde después.
// Tiene acceso completo al contexto del proyecto via RAG.
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
        } = request.data;

        if (!query) throw new HttpsError("invalid-argument", "Falta query.");
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Chat para ${userId}: "${query.substring(0, 50)}..."`);

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
                .map(d => `[${d.data().fileName}]: ${d.data().text.substring(0, 400)}`)
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
Estructura tu respuesta en capas: Consecuencia inmediata → Consecuencia a mediano plazo → Consecuencia a largo plazo para la saga.
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

${modeInstructions[detectedMode] || modeInstructions.general}

PENDIENTES ACTIVOS DEL PROYECTO:
${JSON.stringify(pendingItems.slice(0, 5), null, 2)}

CONTEXTO RAG (archivos relevantes del proyecto):
${ragContext || "Sin contexto RAG disponible."}

HISTORIAL DE CONVERSACIÓN:
${historyText || "Primera interacción."}

REGLAS ABSOLUTAS:
1. Si hay ambigüedad → UNA pregunta de clarificación PRIMERO, no respondas todavía.
2. Si la pregunta es clara → Responde con profundidad estratégica.
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
// Re-análisis completo del proyecto.
// Se llama manualmente O automáticamente si
// lastSignificantUpdate > lastArquitectoAnalysis.
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
