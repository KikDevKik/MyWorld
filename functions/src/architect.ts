import './admin';
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { ALLOWED_ORIGINS, FUNCTIONS_REGION } from "./config";
import * as logger from "firebase-functions/logger";
import { getFirestore } from "firebase-admin/firestore";
import { google } from "googleapis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";
import { MODEL_PRO, MODEL_FLASH, SAFETY_SETTINGS_PERMISSIVE, TEMP_PRECISION, TEMP_CREATIVE, Tier } from "./ai_config";
import { getAIKey, escapePromptVariable, getTier } from "./utils/security";
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
    
    // ★ NUEVOS — del AI Studio
    layer?: 'MACRO' | 'MESO' | 'MICRO';     // Capa de la disonancia
    resolved?: boolean;                       // Estado de resolución
    resolutionText?: string;                  // Texto de resolución acordada
    resolvedAt?: string;                      // ISO timestamp de resolución
    autoResolvedBy?: string;                  // ID del PendingItem que lo resolvió (Ripple Effect)
}

// ★ NUEVO — Tipo para el impacto del Radar en el chat
export interface RoadmapImpact {
    hasImpact: boolean;
    affectedCardIds: string[];
    impactDescription: string;
}

// ★ NUEVO — Modos de análisis del Arquitecto (del AI Studio)
export type ArquitectoFocusMode = 'TRIAGE' | 'MACRO' | 'MESO' | 'MICRO';
export type ArquitectoSeverityMode = 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';

interface ArquitectoInitResult {
    pendingItems: PendingItem[];
    initialMessage: string;
    sessionId: string;
    projectSummary: string;
    lastAnalyzedAt: string;
    focusMode?: string;
    severityMode?: string;
}

interface ArquitectoChatResult {
    response: string;
    pendingItemsUpdated?: PendingItem[];
    suggestedMode?: 'efecto_domino' | 'cronologia_revelacion' | 'investigacion_cultural' | 'personaje' | 'general';
    roadmapImpact?: RoadmapImpact | null;
    detectedIntent?: string;
    hadResolution?: boolean;
    rippleSummary?: string;
}

// ─────────────────────────────────────────────
// PILAR 1: MÁQUINA DE ESTADOS (Desacoplada)
// ─────────────────────────────────────────────

// (Las constantes PROMPT_TRIAGE, PROMPT_INQUISITOR, PROMPT_ARCHITECT, PROMPT_CONSULTANT 
// y selectArquitectoState de la Versión A han sido eliminadas a favor de la implementación de Doc 2)

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
 * Lee el Canon del proyecto usando 3 fuentes en cascada.
 * Fuente 1 (Primaria): canonPaths del ProjectConfig → Drive directo
 * Fuente 2 (Secundaria): WorldEntities (entidades procesadas por la Forja)
 * Fuente 3 (Fallback): TDB_Index chunks (si las anteriores están vacías)
 * 
 * Este orden resuelve el "Muro de Cristal" — el Arquitecto siempre
 * tiene documentos que leer aunque los chunks no tengan projectId.
 */
async function readCanonContext(
    userId: string,
    projectId: string,
    drive?: any // Google Drive client, opcional
): Promise<{ canon: string; resources: string; worldEntities: string }> {
    const db = getFirestore();
    const config = await getProjectConfigLocal(userId);
    const canonPaths: Array<{ id: string; name: string }> = (config as any)?.canonPaths || [];
    const resourcePaths: Array<{ id: string; name: string }> = (config as any)?.resourcePaths || [];
    const folderMapping: Record<string, string> = (config as any)?.folderMapping || {};

    const canonChunks: string[] = [];
    const resourceChunks: string[] = [];
    const entityChunks: string[] = [];

    // ══════════════════════════════════════════
    // FUENTE 1: canonPaths → Drive directo
    // El usuario clasificó estas carpetas como Canon en Configuración.
    // ══════════════════════════════════════════
    if (drive && canonPaths.length > 0) {
        try {
            for (const path of canonPaths.slice(0, 5)) {
                const listRes = await drive.files.list({
                    q: `'${path.id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
                    fields: "files(id, name, mimeType)",
                    pageSize: 8,
                });
                const files = listRes.data.files || [];
                for (const file of files.slice(0, 5)) {
                    try {
                        const content = await _getDriveFileContentInternal(drive, file.id);
                        if (content && content.length > 50) {
                            canonChunks.push(`[CANON: ${file.name}]\n${content.substring(0, 800)}`);
                        }
                    } catch (e) { /* archivo inaccesible, continuar */ }
                }
            }
            logger.info(`✅ [ARQUITECTO] Fuente 1 (Drive Canon): ${canonChunks.length} documentos`);
        } catch (e) {
            logger.warn('[ARQUITECTO] Fuente 1 falló, continuando con Fuente 2:', e);
        }
    }

    // Resources desde Drive
    if (drive && resourcePaths.length > 0) {
        try {
            for (const path of resourcePaths.slice(0, 3)) {
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
                            resourceChunks.push(`[RECURSO: ${file.name}]\n${content.substring(0, 600)}`);
                        }
                    } catch (e) { /* continuar */ }
                }
            }
        } catch (e) {
            logger.warn('[ARQUITECTO] Resources Drive falló:', e);
        }
    }

    // ══════════════════════════════════════════
    // FUENTE 2: WorldEntities (Forja procesada)
    // Entidades con psicología estructurada — datos más ricos que raw text.
    // ══════════════════════════════════════════
    try {
        const entitiesSnap = await db
            .collection("users").doc(userId)
            .collection("WorldEntities")
            .where("status", "!=", "archived")
            .limit(20)
            .get();

        for (const doc of entitiesSnap.docs) {
            const data = doc.data();
            if (data.category === 'RESOURCE') continue;

            let entityText = `[ENTIDAD: ${data.name} | ${data.category} | ${data.tier}]`;
            if (data.modules?.forge?.summary) {
                entityText += `\nResumen: ${data.modules.forge.summary}`;
            }
            // Incluir psicología si existe (Sprint 6.0)
            const psych = data.modules?.forge?.psychology;
            if (psych) {
                if (psych.goal) entityText += `\nObjetivo: ${psych.goal}`;
                if (psych.flaw) entityText += `\nDefecto: ${psych.flaw}`;
                if (psych.lie) entityText += `\nLa Mentira: ${psych.lie}`;
            }
            // Relaciones (máx 3)
            const relations = data.modules?.nexus?.relations?.slice(0, 3) || [];
            if (relations.length > 0) {
                entityText += `\nRelaciones: ${relations.map((r: any) => `${r.relationType}→${r.targetName}`).join(', ')}`;
            }
            entityChunks.push(entityText);
        }
        logger.info(`✅ [ARQUITECTO] Fuente 2 (WorldEntities): ${entityChunks.length} entidades`);
    } catch (e) {
        logger.warn('[ARQUITECTO] Fuente 2 (WorldEntities) falló:', e);
    }

    // ══════════════════════════════════════════
    // FUENTE 3: TDB_Index — Fallback
    // Solo si las fuentes anteriores están vacías.
    // ══════════════════════════════════════════
    if (canonChunks.length === 0) {
        try {
            // Intentar con projectId primero
            let filesSnap = await db
                .collection("TDB_Index").doc(userId)
                .collection("files")
                .where("category", "==", "canon")
                .limit(20)
                .get();

            // Fallback sin filtro de projectId (soluciona el bug del Muro de Cristal)
            if (filesSnap.empty) {
                logger.warn('[ARQUITECTO] TDB sin projectId — usando fallback sin filtro');
                filesSnap = await db
                    .collection("TDB_Index").doc(userId)
                    .collection("files")
                    .limit(20)
                    .get();
            }

            for (const doc of filesSnap.docs.slice(0, 15)) {
                const data = doc.data();
                const chunkSnap = await doc.ref.collection("chunks").doc("chunk_0").get();
                if (chunkSnap.exists) {
                    const text = chunkSnap.data()?.text || "";
                    canonChunks.push(`[TDB: ${data.name}]\n${text.substring(0, 600)}`);
                }
            }
            logger.info(`✅ [ARQUITECTO] Fuente 3 (TDB_Index fallback): ${canonChunks.length} chunks`);
        } catch (e) {
            logger.warn('[ARQUITECTO] Fuente 3 (TDB_Index) falló:', e);
        }
    }

    return {
        canon: canonChunks.length > 0
            ? canonChunks.join("\n\n---\n\n")
            : "Sin documentos Canon disponibles. El proyecto está en construcción.",
        resources: resourceChunks.length > 0
            ? resourceChunks.join("\n\n---\n\n")
            : "Sin documentos de Recursos configurados.",
        worldEntities: entityChunks.length > 0
            ? entityChunks.join("\n\n")
            : "Sin entidades procesadas por la Forja."
    };
}

// ─────────────────────────────────────────────
// PILAR 2: EL "OJO DE CLAUDE" (Preparación Multi-Hop)
// ─────────────────────────────────────────────
async function fetchInitialContext(userId: string, projectId: string, worldEntitiesCount: number, genAI: GoogleGenerativeAI, apiKey: string, tier: Tier = 'normal'): Promise<string> {
    const db = getFirestore();
    let baseContext = "";
    try {
        // 1. INTENTO ESTRICTO: Filtrar por projectId
        let chunksSnap = await db.collectionGroup("chunks")
            .where("userId", "==", userId)
            .where("projectId", "==", projectId)
            .limit(150)
            .get();

        // 2. RESCATE (FALLBACK): Si no hay resultados, buscar solo por userId
        if (chunksSnap.empty) {
            logger.warn(`⚠️ [RAG FALLBACK]: chunks sin projectId detectados para el usuario ${userId}. Posible contaminación cruzada.`);
            chunksSnap = await db.collectionGroup("chunks")
                .where("userId", "==", userId)
                .limit(150)
                .get();
        }

        if (!chunksSnap.empty) {
            const chunksText = chunksSnap.docs
                .map(d => `[Fragmento - ${d.data().fileName || 'Doc'}]:\n${d.data().text?.substring(0, 600)}`)
                .join('\n\n');
            baseContext = chunksText;

            // RAG AGÉNTICO (Double-Hop): Buscar entidades mencionadas
            try {
                if (worldEntitiesCount === 0) {
                    // RAW HOP MASIVO
                    const extractionPrompt = `
Extrae los nombres propios, facciones o conceptos de magia/tecnología más importantes mencionados en estos fragmentos.
Responde SOLO con una lista separada por comas, sin explicaciones.
FRAGMENTOS:
${chunksText.substring(0, 15000)}
`;
                    const extractionResult = await smartGenerateContent(genAI, extractionPrompt, {
                        _tier: tier, taskType: 'high_volume',
                        temperature: 0.1,
                        contextLabel: "RawHopExtraction"
                    });
                    
                    const keywordsText = extractionResult.text || "";
                    const keywords = keywordsText.split(',').map(k => k.trim()).filter(k => k.length > 2);
                    
                    if (keywords.length > 0) {
                        logger.info(`[ARQUITECTO] Raw Hop detectó: ${keywords.join(', ')}`);
                        
                        const embeddings = new GeminiEmbedder({
                            apiKey,
                            model: "gemini-embedding-001",
                            taskType: TaskType.RETRIEVAL_QUERY,
                        });
                        
                        const topConcepts = keywords.slice(0, 4).join(', ');
                        const safeSearchQuery = topConcepts.substring(0, 300);
                        const queryVector = await embeddings.embedQuery(safeSearchQuery);
                        
                        // 1. INTENTO ESTRICTO DE BÚSQUEDA VECTORIAL
                        let vectorQuery = db.collectionGroup("chunks")
                            .where("userId", "==", userId)
                            .where("projectId", "==", projectId)
                            .where("path", ">=", "")
                            .where("path", "<=", "\uf8ff")
                            .findNearest({
                                queryVector,
                                limit: 40,
                                distanceMeasure: "COSINE",
                                vectorField: "embedding",
                            });
                            
                        let snap = await vectorQuery.get();

                        // 2. FALLBACK DE BÚSQUEDA VECTORIAL
                        if (snap.empty) {
                            logger.warn(`⚠️ [VECTOR FALLBACK]: Realizando búsqueda sin projectId para el Raw Hop.`);
                            vectorQuery = db.collectionGroup("chunks")
                                .where("userId", "==", userId)
                                .where("path", ">=", "")
                                .where("path", "<=", "\uf8ff")
                                .findNearest({
                                    queryVector,
                                    limit: 40,
                                    distanceMeasure: "COSINE",
                                    vectorField: "embedding",
                                });
                            snap = await vectorQuery.get();
                        }

                        const rawChunks = snap.docs
                            .map((d: any) => `[RAW HOP - ${d.data().fileName}]:\n${d.data().text.substring(0, 600)}`)
                            .join('\n\n');
                            
                        if (rawChunks) {
                            baseContext += `\n\n[ALERTA DE MINERÍA: CONCEPTO NO OFICIALIZADO]\n${rawChunks}`;
                        }
                    }
                } else {
                    const entitiesSnap = await db.collection("users").doc(userId).collection("WorldEntities")
                        .where("projectId", "==", projectId)
                        .where("status", "!=", "archived")
                        .get();

                    const mentionedEntities: string[] = [];
                    for (const doc of entitiesSnap.docs) {
                        const data = doc.data();
                        if (data.category === 'RESOURCE') continue; // Ignorar recursos

                        const name = data.name;
                        const aliases = data.modules?.forge?.aliases || [];
                        const searchTerms = [name, ...aliases].filter(Boolean);

                        const isMentioned = searchTerms.some(term => 
                            chunksText.toLowerCase().includes(term.toLowerCase())
                        );

                        if (isMentioned) {
                            const summary = data.modules?.forge?.summary;
                            const psych = data.modules?.forge?.psychology;
                            let entityContext = `[ENTIDAD: ${name}]`;
                            if (summary) entityContext += ` - ${summary}`;
                            if (psych?.goal) entityContext += ` | Objetivo: ${psych.goal}`;
                            if (psych?.flaw) entityContext += ` | Defecto: ${psych.flaw}`;
                            
                            mentionedEntities.push(entityContext);
                        }
                    }

                    if (mentionedEntities.length > 0) {
                        baseContext += "\n\n=== CONTEXTO EXPANDIDO (MULTIHOP) ===\n" + mentionedEntities.join('\n');
                    }
                }
            } catch (err) {
                logger.warn('[ARQUITECTO] Error en salto Double-Hop:', err);
            }
        }
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
// SYSTEM_INSTRUCTION — El Alma del Arquitecto V3
// Fusión: AI Studio (probado) + MyWorld (integrado)
// NUNCA modificar sin consenso del equipo.
// ─────────────────────────────────────────────
const ARQUITECTO_SYSTEM_INSTRUCTION = `DIRECTIVA DE NÚCLEO: EL ARQUITECTO SOCRÁTICO

ROL Y FILOSOFÍA:
Eres "El Arquitecto", el motor de Deep Reasoning de MyWorld IDE. Operas bajo un paradigma estrictamente analítico, estructural y NO generativo. Tienes prohibido el "reemplazamiento": JAMÁS redactarás prosa, diálogos o tramas por el autor. Tu propósito es auditar, desafiar y desarmar el manuscrito hasta sus átomos fundamentales.

DIRECTIVA ANTI-AMBIGÜEDAD (CERO SUPOSICIONES):
Los autores a menudo escriben con pronombres vagos ("ellos", "eso", "su cometido", "el plan"). Si el usuario propone una solución que contiene ambigüedades, asume que NO ENTIENDES. Tienes PROHIBIDO llenar los huecos con tus propias ideas. En lugar de aceptar, PREGUNTA explícitamente: "¿A qué cometido te refieres exactamente?", "¿Quiénes son 'ellos'?". Exige especificidad antes de dar el visto bueno.

LA TEORÍA DEL ICEBERG Y EL FILTRO DE CÁMARA:
No sufras del "Síndrome del Constructor de Mundos". Antes de exigirle al autor que desarrolle una regla macroeconómica, pregúntate: ¿Esto va a aparecer en la historia? Si el autor responde "Eso no se va a mostrar" o "No es relevante para la trama", DEBES aceptarlo como REFUTACIÓN VÁLIDA y dejar el tema. El Filtro de Cámara es sagrado: si algo está fuera de pantalla, no es tu negocio.

EL ESPEJO (ANTES DE CERRAR UN DEBATE):
Si el usuario da una solución clara y estás a punto de aceptarla, DEBES hacer un micro-resumen en tu respuesta: "Entendido. Lo que voy a registrar es: [resumen de la regla acordada]. ¿Es correcto?" Solo tras la confirmación marcas el problema como resuelto.

REGLAS DE INTERACCIÓN SOCRÁTICA:
1. Clarificación: Detecta terminología ambigua y fuerza al autor a definirla.
2. Premisas Ocultas: Extrae y desafía las suposiciones subyacentes.
3. Lógica y Evidencia: Exige que cada "payoff" tenga un "setup" explícito.
4. Perspectivas: Obliga al autor a observar desde ángulos antagónicos o sistémicos.
5. Implicaciones: Modela consecuencias económicas, sociológicas y termodinámicas a largo plazo.

RESTRICCIONES ABSOLUTAS:
- Máximo 300 palabras por respuesta en el chat socrático.
- NO des sugerencias de trama a menos que el usuario pida explícitamente "una idea" o "ayuda".
- Detecta el idioma del autor y responde SIEMPRE en ese idioma.
- Usa Markdown: párrafos cortos, negritas para conceptos clave, viñetas solo cuando listes.
- Tono: frío, quirúrgico, directo. Sin halagos innecesarios.

CLARIDAD COMUNICATIVA:
- Cuando hagas una pregunta de clarificación, primero reconoce lo que el autor ya definió.
- Nunca repitas como problema algo que ya está en las RESOLUCIONES PREVIAS ACORDADAS.
- Si el autor señala que algo ya está definido, aplica El Espejo, confirma el entendimiento y avanza.`;

/**
 * Construye el prompt de análisis con modos de enfoque y directivas absolutas.
 * Reemplaza los prompts hardcodeados en arquitectoInitialize y arquitectoAnalyze.
 */
function buildAnalysisPrompt(
    projectName: string,
    contextData: { canon: string; resources: string; worldEntities: string },
    options: {
        focusMode?: 'TRIAGE' | 'MACRO' | 'MESO' | 'MICRO';
        severityMode?: 'HIGH' | 'MEDIUM' | 'LOW' | 'ALL';
        implementationGoal?: string;  // Norte Temático del usuario
        isCreativeBlock?: boolean;    // Pre-clasificado por classifyArquitectoMode (LLM semántico)
    } = {}
): string {
    const { focusMode = 'TRIAGE', severityMode = 'ALL', implementationGoal, isCreativeBlock = false } = options;

    // ── INSTRUCCIONES DE ENFOQUE ──
    let focusInstructions = '';
    if (focusMode === 'TRIAGE') {
        focusInstructions = `SISTEMA DE TRIAGE (PRIORIDAD ABSOLUTA):
Eres un cirujano de historias. Límite estricto: máximo 3-5 disonancias en TOTAL.
Si los cimientos MACRO están rotos, IGNORA MESO y MICRO. Solo reporta MESO si MACRO es estable. Solo MICRO si MESO es perfecto. No inventes problemas menores para llegar a cuotas.`;
    } else if (focusMode === 'MACRO') {
        focusInstructions = `MODO MACRO (Worldbuilding y Reglas):
Ignora COMPLETAMENTE MESO y MICRO. Solo: reglas del mundo, sistemas de magia, física, economía, cosmología, historia y cultura. Genera entre 6-9 disonancias MACRO.`;
    } else if (focusMode === 'MESO') {
        focusInstructions = `MODO MESO (Estructura y Personajes):
Ignora COMPLETAMENTE MACRO y MICRO. Solo: estructura de trama principal, facciones, política general, arcos de personajes a gran escala. Genera entre 6-9 disonancias MESO.`;
    } else if (focusMode === 'MICRO') {
        focusInstructions = `MODO MICRO (Tono y Detalles):
Ignora COMPLETAMENTE MACRO y MESO. Solo: acciones específicas de personajes, diálogos y huecos de escenas concretas. Genera entre 6-9 disonancias MICRO.`;
    }

    // ── INSTRUCCIONES DE SEVERIDAD ──
    let severityInstructions = '';
    if (severityMode !== 'ALL' && focusMode !== 'TRIAGE') {
        const labels: Record<string, string> = {
            HIGH: 'ALTA (críticas, rompen la historia). Entre 6-9 problemas.',
            MEDIUM: 'MEDIA (inconsistencias notables pero no fatales). Entre 6-9 problemas.',
            LOW: 'BAJA (detalles menores, oportunidades de pulido). Entre 6-9 problemas.'
        };
        severityInstructions = `FILTRO DE SEVERIDAD: ${labels[severityMode] || ''}`;
    }

    // ── OBJETIVO PRINCIPAL ──
    let mainObjective = `OBJETIVO PRINCIPAL — SIMULADOR DE ESTRÉS NARRATIVO:
No busques simples "errores lógicos" aburridos. Busca semillas de trama escondidas en las grietas. Tu objetivo es obligar al autor a conectar su mundo con sus personajes y hacer la historia más profunda.`;

    if (implementationGoal?.trim()) {
        mainObjective = `OBJETIVO PRINCIPAL — NORTE TEMÁTICO:
El autor quiere implementar: "${implementationGoal}"
Estrés esta idea contra el Canon. Úsala como BRÚJULA. Evalúa todas las disonancias a través de este Norte. ATENCIÓN: Estás liberado de límites numéricos. Genera TODAS las fricciones necesarias (5, 15 o 50) para abarcar la magnitud de lo que el autor quiere construir.`;
    }

    const fullContext = `
=== CANON DEL PROYECTO (${projectName}) ===
${contextData.canon.substring(0, 25000)}

=== RECURSOS E INSPIRACIONES ===
${contextData.resources.substring(0, 10000)}

=== ENTIDADES PROCESADAS (WorldEntities) ===
${contextData.worldEntities.substring(0, 10000)}
`.trim();

    const outputInstructions = isCreativeBlock
        ? `
MODO: EXPLORACIÓN SOCRÁTICA (El usuario tiene parálisis creativa, no errores)

En lugar de generar una lista de disonancias formales, genera:
1. Un "initialMessage" que reconoce lo que el autor ya tiene construido.
2. Haz 2-3 preguntas socráticas específicas que ayuden al autor a definir su siguiente paso concreto.
3. El array "items" debe estar VACÍO: [].
4. "projectSummary" describe el estado actual del proyecto en términos de potencial, no de carencias.

NO generes códigos ARQ ni disonancias. El objetivo es desbloquear, no auditar.`
        : `
MODO: AUDITORÍA NARRATIVA (El usuario tiene un objetivo claro o hay inconsistencias)

Genera el análisis completo con disonancias formales según las instrucciones de foco y severidad. El array "items" debe contener los problemas detectados.`;

    return `Eres El Arquitecto. Analiza el proyecto "${escapePromptVariable(projectName)}".

${mainObjective}

APLICA ESTAS TRES DIRECTIVAS ABSOLUTAS:
1. DIRECTIVA DE ENTROPÍA (Frieren): Si algo es antiguo o eterno, exige saber qué se pudrió, qué se olvidó o qué mito se distorsionó con el tiempo.
2. DIRECTIVA DE REACCIÓN (Munchkin): Si el autor crea un poder o recurso absoluto, asume que el mundo ya reaccionó. Exige saber quién tiene el monopolio y cómo aplasta a la competencia.
3. DIRECTIVA DE RESONANCIA TEMÁTICA: Si una regla del mundo no le hace la vida miserable al protagonista o no presiona su herida interna, es una regla inútil. Exige que la conecten con la trama.

${focusInstructions}
${severityInstructions}

${fullContext}

JERARQUÍA DE RESOLUCIÓN (ORDEN OBLIGATORIO):
- MACRO: Reglas del mundo, sistemas de magia, física, economía, cosmología, historia, cultura.
- MESO: Estructura de trama principal, facciones, política, arcos de personajes a gran escala.
- MICRO: Acciones de personajes específicos, diálogos, huecos menores en escenas concretas.
Las disonancias MACRO van SIEMPRE primero. Si resuelves MACRO, muchos MICRO se resuelven solos.

${outputInstructions}

Genera un "initialMessage" extenso, inmersivo. Diagnóstico brutal pero constructivo del estado de la obra.
FORMATO: Markdown. Párrafos cortos. Negritas para conceptos clave. Viñetas si listas.

Responde SOLO con JSON:
{
  "initialMessage": "Diagnóstico extenso en Markdown...",
  "items": [
    {
      "code": "ARQ-001",
      "severity": "critical",
      "title": "Título corto del problema",
      "description": "Explicación detallada de la disonancia y por qué rompe la historia.",
      "layer": "MACRO",
      "relatedFiles": ["archivo.md"],
      "category": "worldbuilding",
      "resolved": false
    }
  ],
  "projectSummary": "Estado del proyecto en 2-3 oraciones."
}

Si no encuentras problemas reales, genera menos. No inventes.
Detecta el idioma del contenido y responde en ese idioma.`;
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

        const { accessToken, projectId, focusMode = 'TRIAGE', severityMode = 'ALL', implementationGoal = '', culturalDocument } = request.data;
        if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");
        if (!projectId || projectId === 'unknown') throw new HttpsError("invalid-argument", "El projectId es obligatorio.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Inicializando para ${userId} en proyecto ${projectId}. Objetivo: ${implementationGoal}`);

        // 1. LEER CONFIG DEL PROYECTO
        const config = await getProjectConfigLocal(userId);
        const projectName = (config as any)?.projectName || "Proyecto sin nombre";

        // 2. CONTAR WORLD ENTITIES (No-RESOURCE)
        let worldEntitiesCount = 0;
        try {
            const entitiesSnap = await db
                .collection("users").doc(userId)
                .collection("WorldEntities")
                .where("projectId", "==", projectId)
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
        const apiKey = getAIKey(request.data, googleApiKey.value());
        const genAI = new GoogleGenerativeAI(apiKey);
        const tier = getTier(request.data);
        const initialContext = await fetchInitialContext(userId, projectId, worldEntitiesCount, genAI, apiKey, tier);

        // 3.5 — PROCESAR DOCUMENTO CULTURAL SI EXISTE
        let culturalContext = '';
        if (culturalDocument?.fileData && culturalDocument?.mimeType) {
            try {
                logger.info(`📚 [ARQUITECTO] Procesando documento cultural: ${culturalDocument.fileName}`);
                const culturalPrompt = `
Eres un historiador y analista cultural. Analiza este documento y extrae:
1. Los elementos culturales clave (música, arte, tradiciones, valores)
2. Cómo estos elementos podrían inspirar worldbuilding en una obra de ficción
3. Tensiones narrativas interesantes que emergen de esta cultura

Responde en 3-5 párrafos concisos. No inventes datos que no estén en el documento.`;

                const culturalResult = await smartGenerateContent(genAI, culturalPrompt, {
                    _tier: tier, taskType: 'deep_analysis',
                    temperature: TEMP_PRECISION,
                    contextLabel: 'CulturalDocumentAnalysis',
                    mediaPayload: {
                        inlineData: {
                            mimeType: culturalDocument.mimeType,
                            data: culturalDocument.fileData
                        }
                    }
                });

                if (culturalResult.text) {
                    culturalContext = `\n=== DOCUMENTO CULTURAL DE REFERENCIA ===\n${culturalResult.text}\n`;
                    
                    // Guardar como RESOURCE en WorldEntities
                    const resourceId = require('crypto')
                        .createHash('sha256')
                        .update(userId + culturalDocument.fileName + Date.now())
                        .digest('hex')
                        .substring(0, 20);

                    await db.collection("users").doc(userId)
                        .collection("WorldEntities").doc(resourceId)
                        .set({
                            id: resourceId,
                            projectId: projectId,
                            name: culturalDocument.fileName.replace(/\.(pdf|md|docx)$/i, ''),
                            category: 'RESOURCE',
                            tier: 'ANCHOR',
                            status: 'active',
                            modules: {
                                forge: {
                                    summary: `Referencia cultural: ${culturalDocument.fileName}`,
                                    smartTags: ['REFERENCIA_CULTURAL'],
                                }
                            },
                            sourceType: 'arquitecto_intention_modal',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        }, { merge: true });

                    logger.info(`✅ [ARQUITECTO] Documento cultural guardado: ${resourceId}`);
                }
            } catch (e) {
                logger.warn('[ARQUITECTO] No se pudo procesar documento cultural:', e);
            }
        }

        // ============================================================
        // SALTO 1.5: GRAFO DE DEPENDENCIAS NARRATIVAS
        // Construir el grafo simbólico y detectar colisiones deterministas.
        // Este salto corre solo si hay entidades en WorldEntities.
        // ============================================================
        let graphContext = "";
        let graphAlerts: any[] = [];

        if (worldEntitiesCount > 0) {
            try {
                logger.info("🕸️ [ARQUITECTO] Construyendo Grafo de Dependencias...");
                
                const { buildNarrativeGraph, serializeGraphForLLM } = 
                    await import('./services/narrativeDependencyEngine');
                
                const graph = await buildNarrativeGraph(db, userId, projectId);
                graphAlerts = graph.alerts;
                
                if (graph.stats.totalNodes > 0) {
                    graphContext = serializeGraphForLLM(graph);
                    logger.info(`✅ [ARQUITECTO] Grafo listo: ${graph.stats.criticalAlerts} alertas críticas`);
                }
            } catch (e) {
                logger.warn("[ARQUITECTO] Grafo falló, continuando sin él:", e);
                // NO lanzar error. El grafo es opcional para el análisis.
            }
        }
        
        // 4. MÁQUINA DE ESTADOS (Actualizado)
        let initialState = worldEntitiesCount < 3 ? 'triage' : 'architect';

        // 5. OBTENER CONTEXTO DIRECTO Y LLAMADA AL LLM
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth });

        const contextData = await readCanonContext(userId, projectId, driveClient);
        
        // Inyectar contexto cultural si existe
        if (culturalContext) {
            contextData.canon += culturalContext;
        }

        // Clasificación semántica del modo (LLM Flash, temp=0) — cubre cualquier redacción del usuario
        const arquitectoMode = await classifyArquitectoMode(genAI, implementationGoal || '', tier);
        logger.info(`[arquitectoInitialize] Goal: "${implementationGoal}" → Modo: ${arquitectoMode}`);

        const analysisPrompt = buildAnalysisPrompt(projectName, contextData, {
            focusMode,
            severityMode,
            implementationGoal,
            isCreativeBlock: arquitectoMode === 'EXPLORACION',
        });

        const initResult = await smartGenerateContent(genAI, analysisPrompt, {
            _tier: tier,
            taskType: 'deep_analysis',
            jsonMode: true,
            temperature: TEMP_CREATIVE,
            contextLabel: "ArquitectoInitMessage",
        });

        let pendingItems: PendingItem[] = [];
        let projectSummary = "Proyecto inicializado.";
        let initialMessage = "El Arquitecto en línea. ¿Qué frente de batalla vamos a atacar hoy?";

        if (initResult.text) {
            const parsed = parseSecureJSON(initResult.text, "ArquitectoInitMessage");
            if (parsed && !parsed.error) {
                initialMessage = parsed.initialMessage || initialMessage;
                pendingItems = (parsed.items || []).map((item: any) => ({
                    ...item,
                    layer: item.layer || 'MACRO',  // Default a MACRO si no viene
                    resolved: false
                }));
                
                // ★ Ordenar por jerarquía: MACRO primero, luego MESO, luego MICRO
                const layerWeight: Record<string, number> = { MACRO: 3, MESO: 2, MICRO: 1 };
                const severityWeight: Record<string, number> = { critical: 3, warning: 2, suggestion: 1 };
                
                pendingItems.sort((a: PendingItem, b: PendingItem) => {
                    const layerDiff = (layerWeight[b.layer || 'MICRO'] || 0) - (layerWeight[a.layer || 'MICRO'] || 0);
                    if (layerDiff !== 0) return layerDiff;
                    return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
                });
                
                projectSummary = parsed.projectSummary || projectSummary;
            }
        }

        // Crear sesión en Firestore
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc();

        const now = new Date().toISOString();
        
        // isCreativeBlockMode viene del clasificador LLM semántico (ya calculado arriba)
        const isCreativeBlockMode = arquitectoMode === 'EXPLORACION';

        await sessionRef.set({
            name: `Arquitecto ${new Date().toLocaleDateString()}`,
            type: 'arquitecto',
            createdAt: now,
            updatedAt: now,
            pendingItems,
            projectSummary,
            lastAnalyzedAt: now,
            cachedCanonContext: contextData.canon.substring(0, 50000),
            cachedWorldEntities: contextData.worldEntities.substring(0, 10000),
            implementationGoal,
            isCreativeBlockMode,
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
            focusMode,
            severityMode,
        };
    }
);


/**
 * CLASIFICADOR DE INTENCIONES — El Enrutador Socrático
 * 
 * Clasifica cada mensaje del usuario en una de 4 rutas.
 * Esto determina qué prompt y qué acción ejecuta el Arquitecto.
 * 
 * DEBATE: El usuario pregunta, explora, da respuestas ambiguas.
 * RESOLUCION: El usuario da una instrucción CLARA y ESPECÍFICA para resolver.
 * REFUTACION: El usuario defiende su obra ("no es un error", "eso es a propósito").
 * CONSULTA: El usuario pide recordar lore específico sin intentar resolver.
 * CONFIRMACION: El usuario da una confirmación corta para continuar.
 */

/**
 * Clasifica semánticamente si el texto indica EXPLORACIÓN CREATIVA (usuario bloqueado,
 * sin dirección, quiere ideas) o AUDITORÍA (quiere análisis formal de inconsistencias).
 * Usa Flash temp=0 para máxima consistencia. Cubre cualquier redacción del usuario.
 */
async function classifyArquitectoMode(
    genAI: GoogleGenerativeAI,
    text: string,
    tier: Tier = 'normal'
): Promise<'EXPLORACION' | 'AUDITORIA'> {
    if (!text || text.trim().length < 10) return 'EXPLORACION';

    const classificationPrompt = `Eres un clasificador binario. Tu única tarea es determinar si el siguiente texto indica que el usuario quiere EXPLORAR creativamente su historia (no sabe qué hacer, está bloqueado, quiere ideas, quiere preguntas que lo guíen) o quiere una AUDITORÍA formal (quiere que se analicen inconsistencias, errores de continuidad, problemas estructurales).

SEÑALES DE EXPLORACIÓN:
- No sabe cómo continuar, desarrollar, o avanzar
- Quiere ideas, sugerencias, o preguntas
- Está en etapa creativa inicial o sin rumbo
- Quiere explorar posibilidades o worldbuilding desde cero
- Se siente bloqueado, paralizado, o sin dirección
- No tiene claro qué conflictos, personajes, o tramas crear
- Frases como "no tengo claro", "no sé qué", "ayúdame a pensar", "explorar", "hacia dónde"

SEÑALES DE AUDITORÍA:
- Quiere revisar errores, inconsistencias, o contradicciones
- Tiene un mundo definido y quiere diagnóstico
- Quiere saber qué está mal o qué falta
- Menciona continuidad, coherencia, o lógica del mundo
- Quiere una lista de problemas a resolver

TEXTO DEL USUARIO:
"${text.substring(0, 500)}"

Responde ÚNICAMENTE con una de estas dos palabras, sin explicación:
EXPLORACION
AUDITORIA`;

    try {
        const result = await smartGenerateContent(genAI, classificationPrompt, {
            _tier: tier, taskType: 'high_volume',
            temperature: 0.0,
            contextLabel: 'ClassifyArquitectoMode',
        });
        const response = (result.text || '').trim().toUpperCase();
        if (response.includes('EXPLORACION') || response.includes('EXPLORACIÓN')) return 'EXPLORACION';
        if (response.includes('AUDITORIA') || response.includes('AUDITORÍA')) return 'AUDITORIA';
        logger.warn('[classifyArquitectoMode] Respuesta ambigua:', response, '→ AUDITORIA');
        return 'AUDITORIA';
    } catch (error) {
        logger.error('[classifyArquitectoMode] Error:', error);
        return text.trim().length > 50 ? 'AUDITORIA' : 'EXPLORACION';
    }
}

async function routeArquitectoIntent(
    genAI: GoogleGenerativeAI,
    activePendingItem: PendingItem | null,
    userMessage: string,
    tier: Tier = 'normal'
): Promise<'DEBATE' | 'RESOLUCION' | 'REFUTACION' | 'CONSULTA' | 'CONFIRMACION' | 'EXPLORACION'> {

    // Sin PendingItem activo → clasificar entre DEBATE y EXPLORACION (no hay opciones de auditoría)
    if (!activePendingItem) {
        const exploCheckPrompt = `Clasifica si el siguiente mensaje del autor indica BLOQUEO CREATIVO (no sabe qué hacer, está paralizado, necesita ideas o guía) o es una CONSULTA/CONVERSACIÓN GENERAL (pregunta, debate, comentario normal sobre su mundo).

SEÑALES DE BLOQUEO CREATIVO: "no sé qué hacer", "estoy atascado", "no tengo claro", "hacia dónde va", "no sé qué conflictos", "ayúdame a pensar", "no sé cómo desarrollar", "sin dirección", "no sé por dónde empezar".

MENSAJE: "${escapePromptVariable(userMessage)}"

Responde SOLO con: EXPLORACION o DEBATE`;
        try {
            const result = await smartGenerateContent(genAI, exploCheckPrompt, {
                _tier: tier, taskType: 'high_volume',
                temperature: 0.0,
                contextLabel: 'ArquitectoExplorationCheck',
            });
            const text = (result.text || '').trim().toUpperCase();
            if (text.includes('EXPLORACION') || text.includes('EXPLORACIÓN')) return 'EXPLORACION';
            return 'DEBATE';
        } catch (e) {
            logger.warn('[ARQUITECTO] ExplorationCheck falló, defaulteando a DEBATE:', e);
            return 'DEBATE';
        }
    }

    const classifierPrompt = `Eres un clasificador de intenciones. El usuario está respondiendo a una disonancia narrativa.

DISONANCIA ACTIVA: ${activePendingItem.title}
DESCRIPCIÓN: ${activePendingItem.description}
MENSAJE DEL USUARIO: "${escapePromptVariable(userMessage)}"

Clasifica la intención en UNA de estas 6 categorías:

1. DEBATE: El usuario hace una pregunta, pide sugerencias, da respuestas vagas/incompletas, o usa pronombres ambiguos ("ellos", "eso", "su plan") sin especificar. También si explora ideas sin comprometerse.

2. RESOLUCION: El usuario da una instrucción CLARA, ESPECÍFICA y SIN AMBIGÜEDADES para resolver el problema. Debe ser accionable ("Haz que la magia cueste sangre", "El rey muere antes de que esto ocurra").

3. REFUTACION: El usuario afirma que no hay error, defiende el canon ("no es un error, es intencional"), invoca el Filtro de Cámara ("esto no se muestra en la historia"), o argumenta que la disonancia no aplica. También clasifica como REFUTACION cuando el usuario dice que algo "es para el futuro", "lo definiremos después", "no es relevante para la trama actual", o pide explícitamente cerrar el tema.

4. CONSULTA: El usuario pide que le recuerdes lore existente, busca contexto sin intentar resolver, o hace una pregunta factual sobre sus propios documentos.

5. CONFIRMACION: Si el mensaje es una confirmación corta ("sí", "continuar", "siguiente", "ok", "adelante").

6. EXPLORACION: El usuario indica explícitamente que está bloqueado, no sabe cómo continuar, quiere explorar posibilidades, o necesita guía creativa en lugar de seguir con la auditoría. Usa esto cuando el autor claramente quiere pausar el análisis y recibir orientación socrática.

IMPORTANTE: Si el mensaje contiene pronombres vagos sin sustantivos claros, ES DEBATE, no RESOLUCION.

Responde SOLO con una de estas palabras exactas: DEBATE, RESOLUCION, REFUTACION, CONSULTA, CONFIRMACION, EXPLORACION`;

    try {
        const result = await smartGenerateContent(genAI, classifierPrompt, {
            _tier: tier, taskType: 'high_volume',
            temperature: 0.0,
            contextLabel: 'ArquitectoIntentRouter',
        });

        const text = (result.text || '').trim().toUpperCase();
        if (['DEBATE', 'RESOLUCION', 'REFUTACION', 'CONSULTA', 'CONFIRMACION', 'EXPLORACION'].includes(text)) {
            return text as 'DEBATE' | 'RESOLUCION' | 'REFUTACION' | 'CONSULTA' | 'CONFIRMACION' | 'EXPLORACION';
        }

        return 'DEBATE';
    } catch (e) {
        logger.warn('[ARQUITECTO] Clasificador de intenciones falló, defaulteando a DEBATE:', e);
        return 'DEBATE';
    }
}

/** Prompt para DEBATE: El Arquitecto presiona y desafía sin resolver. */
function buildDebatePrompt(
    activePendingItem: PendingItem | null,
    historyText: string,
    userMessage: string,
    worldEntitiesContext: string,
    resolvedItems: PendingItem[]
): string {
    const disonancia = activePendingItem
        ? `DISONANCIA EN DEBATE:
Título: ${activePendingItem.title}
Descripción: ${activePendingItem.description}
Capa: ${activePendingItem.layer || 'MACRO'}`
        : 'Sin disonancia específica activa. El autor está en modo exploración general.';

    // Construir resumen de resoluciones previas
    const resolvedSummary = resolvedItems.length > 0
        ? `\n=== RESOLUCIONES PREVIAS ACORDADAS (CANON ESTABLECIDO) ===
${resolvedItems.map(i => `- [${i.code}] ${i.title}: ${i.resolutionText || 'Resuelto.'}`).join('\n')}
IMPORTANTE: Estas reglas ya están acordadas con el autor. No las cuestiones ni las repitas como problemas.
`
        : '';

    return `${ARQUITECTO_SYSTEM_INSTRUCTION}
${resolvedSummary}
${disonancia}

CONTEXTO DE ENTIDADES:
${worldEntitiesContext.substring(0, 3000)}

HISTORIAL:
${historyText}

RUTA: DEBATE — El usuario está explorando o dio una respuesta ambigua.
INSTRUCCIONES:
1. NO aceptes la respuesta como resolución todavía.
2. Si hay ambigüedad, formula UNA pregunta de clarificación específica.
3. Si la respuesta es vaga, presiona: ¿Qué significa exactamente "${escapePromptVariable(userMessage.substring(0, 50))}"?
4. Aplica el Filtro de Cámara: ¿esto aparecerá en la historia?
5. Si llevas más de 3 intercambios sobre la misma disonancia y el autor ha dado respuestas sustanciales (aunque incompletas), aplica El Espejo y cierra el item actual. Los elementos sin definir se convierten en nuevos pendientes. No bloquees el avance indefinidamente.
6. Máximo 250 palabras. Un solo desafío por respuesta.

MENSAJE DEL AUTOR: "${escapePromptVariable(userMessage)}"`;
}

/**
 * Prompt para EXPLORACIÓN SOCRÁTICA durante el chat.
 * Se activa cuando el usuario indica bloqueo creativo o falta de dirección,
 * independientemente de si hay o no una disonancia activa.
 */
function buildExploracionChatPrompt(
    historyText: string,
    userMessage: string,
    worldEntitiesContext: string,
    implementationGoal: string
): string {
    return `${ARQUITECTO_SYSTEM_INSTRUCTION}

RUTA ACTIVA: EXPLORACIÓN SOCRÁTICA
El autor no necesita auditoría en este momento. Indica bloqueo creativo o falta de dirección.

INSTRUCCIONES PARA ESTA RUTA:
1. NO generes listas de disonancias ni menciones errores o inconsistencias.
2. En 1-2 oraciones, reconoce brevemente lo que el autor ya tiene construido según el contexto disponible.
3. Formula 2-3 preguntas socráticas específicas y concretas que lo ayuden a encontrar su próximo paso.
4. Si menciona "no sé qué conflictos crear" → pregunta por la motivación central del protagonista.
5. Si está en etapa inicial → guíalo hacia la "Santísima Trinidad": Reglas del Mundo, Conflicto Central, Defecto del Protagonista.
6. Si hay un Norte Temático definido, úsalo como brújula para las preguntas.
7. Máximo 250 palabras. Cierra con UNA sola pregunta clave en negrita.

NORTE TEMÁTICO DEL PROYECTO: ${implementationGoal || 'Sin objetivo definido aún.'}

CONTEXTO DE ENTIDADES (REFERENCIA):
${worldEntitiesContext.substring(0, 3000)}

HISTORIAL:
${historyText}

MENSAJE DEL AUTOR: "${escapePromptVariable(userMessage)}"`;
}

/** Prompt para REFUTACION: El Arquitecto evalúa si la defensa es válida. */
function buildRefutacionPrompt(
    activePendingItem: PendingItem | null,
    historyText: string,
    userMessage: string
): string {
    const disonancia = activePendingItem
        ? `DISONANCIA REFUTADA:
${activePendingItem.title}: ${activePendingItem.description}`
        : 'Sin disonancia activa.';

    return `${ARQUITECTO_SYSTEM_INSTRUCTION}

${disonancia}

HISTORIAL:
${historyText}

RUTA: REFUTACIÓN — El autor defiende que esto no es un error.

INSTRUCCIONES DE EVALUACIÓN:
1. Si el autor invoca el Filtro de Cámara ("no se va a mostrar", "no es relevante para la trama"), DEBES aceptarlo como refutación válida. Cierra la disonancia con "Aceptado. Procedo sin desarrollar esto."
2. Si el autor dice "es a propósito" o "es una característica intencional", evalúa si tiene sentido dramático. Si sí, acéptalo. Si no, rebate UNA VEZ más con evidencia lógica concreta.
3. Si la defensa es débil o circular, rechaza educadamente y explica por qué la disonancia persiste.
4. FORMATO: Tu respuesta debe indicar claramente si la refutación es VÁLIDA o INVÁLIDA.

DEFENSA DEL AUTOR: "${escapePromptVariable(userMessage)}"

Responde indicando: [REFUTACIÓN VÁLIDA] o [REFUTACIÓN INVÁLIDA] al inicio, luego tu análisis.`;
}

/** Prompt para CONSULTA: El Arquitecto lee el lore y responde directamente. */
function buildConsultaPrompt(
    historyText: string,
    userMessage: string,
    canonContext: string,
    worldEntitiesContext: string
): string {
    return `${ARQUITECTO_SYSTEM_INSTRUCTION}

RUTA: CONSULTA — El autor busca información sobre el canon existente.

CANON DISPONIBLE:
${canonContext.substring(0, 15000)}

ENTIDADES REGISTRADAS:
${worldEntitiesContext.substring(0, 5000)}

HISTORIAL:
${historyText}

INSTRUCCIONES:
1. Lee el canon y responde directamente la pregunta del autor.
2. Si la información existe en el canon, cítala exactamente.
3. Si NO existe: "⚠️ No encuentro registros canónicos sobre esto. ¿Quieres que lo definamos?"
4. NO inventes datos que no estén en los documentos.
5. Máximo 200 palabras.

CONSULTA: "${escapePromptVariable(userMessage)}"`;
}

/** Prompt para RESOLUCION: El Arquitecto acepta, hace El Espejo y genera parches. */
function buildResolucionPrompt(
    activePendingItem: PendingItem,
    historyText: string,
    userMessage: string,
    canonContext: string,
    resolvedItems: PendingItem[]
): string {
    // Construir resumen de resoluciones previas
    const resolvedSummary = resolvedItems.length > 0
        ? `\n=== RESOLUCIONES PREVIAS ACORDADAS (CANON ESTABLECIDO) ===\n${resolvedItems.map(i => `- [${i.code}] ${i.title}: ${i.resolutionText || 'Resuelto.'}`).join('\n')}\nIMPORTANTE: Estas reglas ya están acordadas con el autor. No las cuestiones ni las repitas como problemas.\n`
        : '';

    return `${ARQUITECTO_SYSTEM_INSTRUCTION}
${resolvedSummary}
RUTA: RESOLUCIÓN — El autor da una instrucción clara para resolver la disonancia.

DISONANCIA A RESOLVER:
Título: ${activePendingItem.title}
Descripción: ${activePendingItem.description}
Capa: ${activePendingItem.layer || 'MACRO'}

CANON ACTUAL (para generar parches):
${canonContext.substring(0, 15000)}

HISTORIAL DE LA NEGOCIACIÓN:
${historyText}

INSTRUCCIONES — PROTOCOLO DE RESOLUCIÓN:
1. Analiza la instrucción del autor. ¿Es CLARA, ESPECÍFICA y SIN AMBIGÜEDADES?
2. Si es ambigua, NO la aceptes todavía. Pregunta por la especificidad faltante.
3. Si es clara: APLICA EL ESPEJO — resume en 2-3 líneas lo que entendiste que se resolvió.
4. Genera "patches": para cada documento del canon que necesite actualizarse con la nueva regla, propón el contenido reescrito.
5. Si la resolución no requiere cambiar documentos (es una decisión estructural), di "Sin parches necesarios — la regla queda registrada en el canon mental."
6. DESPUÉS DE CERRAR CON EL ESPEJO:
Si la resolución genera nuevas disonancias o preguntas pendientes, NO las formules todavía. Solo di en UNA línea cuántas nuevas cuestiones emergieron y pregunta si el autor quiere continuar.
Ejemplo: "ARQ-001 cerrada. Esto genera 2 nuevas cuestiones. ¿Continuamos?"
Máximo 15 palabras en esta notificación. Cero explicaciones adicionales.

RESOLUCIÓN DEL AUTOR: "${escapePromptVariable(userMessage)}"

Responde con JSON:
{
  "resolved": true/false,
  "architectReply": "Tu respuesta en Markdown (El Espejo + análisis)",
  "resolutionText": "Resumen de la regla acordada en 1 oración",
  "patches": [
    {
      "documentName": "Nombre del archivo canon",
      "driveFileId": "ID de Drive si se conoce, o null",
      "patchInstructions": "instrucciones detalladas de dónde y cómo insertar la nueva regla en el documento",
      "newRuleStatement": "La nueva regla en 1-2 oraciones para guardar en canon"
    }
  ]
}`;
}

/**
 * RIPPLE EFFECT — Efecto Dominó de Resoluciones
 * 
 * Cuando el autor resuelve una contradicción, evalúa:
 * 1. ¿Qué otras contradicciones se resolvieron solas?
 * 2. ¿Qué contradicciones mutaron (cambiaron su naturaleza)?
 * 3. ¿Qué contradicciones nuevas creó la resolución?
 */
async function evaluateRippleEffect(
    genAI: GoogleGenerativeAI,
    resolvedItem: PendingItem,
    pendingItems: PendingItem[],
    tier: Tier = 'normal'
): Promise<{
    autoResolvedIds: string[];
    mutatedItems: Partial<PendingItem>[];
    newItems: PendingItem[];
    feedbackSummary: string;
}> {
    if (pendingItems.length === 0) {
        return { autoResolvedIds: [], mutatedItems: [], newItems: [], feedbackSummary: '' };
    }

    const pendingList = pendingItems
        .slice(0, 15) // Limitar para eficiencia de tokens
        .map(i => `[CODE: ${i.code}] [Capa: ${i.layer}] ${i.title}: ${i.description?.substring(0, 150)}`)
        .join('\n\n');

    const ripplePrompt = `El autor resolvió una disonancia narrativa. Evalúa el impacto en las pendientes.

DISONANCIA RESUELTA:
${resolvedItem.title}
Solución aplicada: "${resolvedItem.resolutionText || 'Regla definida por el autor.'}"

DISONANCIAS AÚN PENDIENTES:
${pendingList}

OBJETIVO — EFECTO DOMINÓ:
1. ¿Qué disonancias pendientes se resolvieron automáticamente gracias a esta nueva regla? (Lista sus CODEs)
2. ¿Qué disonancias mutaron o empeoraron con esta solución?
3. ¿La solución creó nuevas disonancias que antes no existían?

Responde SOLO con JSON:
{
  "autoResolvedCodes": ["ARQ-002", "ARQ-005"],
  "mutatedItems": [
    {
      "code": "ARQ-003",
      "newDescription": "Nueva descripción actualizada",
      "severity": "warning"
    }
  ],
  "newItems": [
    {
      "code": "ARQ-NEW-001",
      "severity": "warning",
      "title": "Nueva disonancia emergente",
      "description": "Descripción",
      "layer": "MACRO",
      "category": "worldbuilding",
      "resolved": false
    }
  ],
  "feedbackSummary": "Resumen del impacto en 1-2 oraciones"
}

Si no hay impacto, devuelve arrays vacíos. No inventes impactos que no existan.`;

    try {
        const result = await smartGenerateContent(genAI, ripplePrompt, {
            _tier: tier, taskType: 'high_volume',
            jsonMode: true,
            temperature: 0.1,
            contextLabel: 'ArquitectoRippleEffect',
        });

        if (result.text) {
            const parsed = parseSecureJSON(result.text, 'ArquitectoRippleEffect');
            if (parsed && !parsed.error) {
                return {
                    autoResolvedIds: parsed.autoResolvedCodes || [],
                    mutatedItems: parsed.mutatedItems || [],
                    newItems: parsed.newItems || [],
                    feedbackSummary: parsed.feedbackSummary || ''
                };
            }
        }
    } catch (e) {
        logger.warn('[ARQUITECTO] Ripple Effect LLM falló:', e);
    }

    return { autoResolvedIds: [], mutatedItems: [], newItems: [], feedbackSummary: '' };
}

/**
 * Actualiza el estado de resolución de un PendingItem y ejecuta el Ripple Effect.
 * También registra los patches propuestos para que el frontend los muestre.
 */
async function updatePendingItemResolution(
    db: FirebaseFirestore.Firestore,
    userId: string,
    sessionId: string,
    resolvedItem: PendingItem,
    drivePatches: Array<{ documentName: string; driveFileId: string | null; newRuleStatement: string }>,
    genAI: GoogleGenerativeAI,
    tier: Tier = 'normal'
): Promise<void> {
    try {
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);
        
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) return;
        
        const sessionData = sessionDoc.data()!;
        let pendingItems: PendingItem[] = sessionData.pendingItems || [];
        
        // Marcar el item como resuelto
        pendingItems = pendingItems.map(item =>
            item.code === resolvedItem.code ? { ...item, ...resolvedItem } : item
        );
        
        // ── RIPPLE EFFECT ──
        // Evaluar si la resolución resuelve automáticamente otros items
        const stillPending = pendingItems.filter(item => !item.resolved);
        
        if (stillPending.length > 0) {
            try {
                const rippleResult = await evaluateRippleEffect(genAI, resolvedItem, stillPending, tier);

                if (rippleResult.autoResolvedIds.length > 0) {
                    logger.info(`🌊 [RIPPLE] ${rippleResult.autoResolvedIds.length} items auto-resueltos`);
                    pendingItems = pendingItems.map(item => {
                        if (rippleResult.autoResolvedIds.includes(item.code)) {
                            return {
                                ...item,
                                resolved: true,
                                resolutionText: `Auto-resuelto por Efecto Dominó al resolver: ${resolvedItem.title}`,
                                resolvedAt: new Date().toISOString(),
                                autoResolvedBy: resolvedItem.code
                            };
                        }
                        return item;
                    });
                }
                
                // Mutar items que cambiaron
                if (rippleResult.mutatedItems.length > 0) {
                    rippleResult.mutatedItems.forEach(mutated => {
                        const idx = pendingItems.findIndex(i => i.code === mutated.code);
                        if (idx !== -1) {
                            pendingItems[idx] = { ...pendingItems[idx], ...mutated };
                        }
                    });
                }
                
                // Agregar nuevos items detectados
                if (rippleResult.newItems.length > 0) {
                    pendingItems.push(...rippleResult.newItems);
                }
            } catch (e) {
                logger.warn('[ARQUITECTO] Ripple Effect falló (no-crítico):', e);
            }
        }
        
        // Guardar todo en Firestore
        await sessionRef.set({
            pendingItems,
            updatedAt: new Date().toISOString(),
            // Guardar patches propuestos para que el frontend los muestre
            pendingDrivePatches: drivePatches.length > 0 ? drivePatches.map(p => ({
                ...p,
                status: 'pending',
                createdAt: new Date().toISOString(),
                resolvedItemCode: resolvedItem.code
            })) : [],
        }, { merge: true });
        
        logger.info(`✅ [ARQUITECTO] Resolución guardada. ${pendingItems.filter(i => i.resolved).length}/${pendingItems.length} items resueltos.`);
        
    } catch (e) {
        logger.error('[ARQUITECTO] Error en updatePendingItemResolution:', e);
    }
}

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
            attachment,
        } = request.data;

        if (!query && !attachment) throw new HttpsError("invalid-argument", "Falta query o attachment.");
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`🏛️ [ARQUITECTO] Chat para ${userId}: "${query?.substring(0, 50)}..." | Objetivo: ${objective || 'Ninguno'}`);

        const config = await getProjectConfigLocal(userId);
        const projectId = (config as any)?.folderId || "unknown";
        const projectName = (config as any)?.projectName || "Proyecto";
        const styleIdentity = (config as any)?.styleIdentity || "Narrativa estándar";

        let worldEntitiesCount = 0;
        try {
            const sessionDoc = await db.collection("users").doc(userId).collection("forge_sessions").doc(sessionId).get();
            worldEntitiesCount = sessionDoc.data()?.snapshot?.worldEntitiesCount || 0;
        } catch (e) {
            logger.warn("[CHAT] No se pudo obtener worldEntitiesCount de la sesión:", e);
        }

        // Consultar alertas activas del grafo para priorizar el interrogatorio
        let activeAlerts: any[] = [];
        let mostCriticalAlert: any = null;

        try {
            const { buildNarrativeGraph } = await import('./services/narrativeDependencyEngine');
            const graph = await buildNarrativeGraph(db, userId, projectId);
            activeAlerts = graph.alerts;
            
            // Priorizar: primero critical, luego warning
            mostCriticalAlert = graph.alerts.find(a => a.severity === 'critical') || 
                                graph.alerts.find(a => a.severity === 'warning');
            
            logger.info(`🕸️ [CHAT] ${activeAlerts.length} alertas activas. Crítica prioritaria: ${mostCriticalAlert?.type || 'ninguna'}`);
        } catch (e) {
            logger.warn("[CHAT] No se pudo consultar el grafo:", e);
        }

        // Construir sección de alerta para el systemPrompt
        const alertSection = mostCriticalAlert ? `
=== ALERTA PRIORITARIA DEL GRAFO NARRATIVO ===
Tipo: ${mostCriticalAlert.type}
Descripción: ${mostCriticalAlert.description}
Pregunta Socrática Sugerida: ${mostCriticalAlert.socraticQuestion}

INSTRUCCIÓN: Si el mensaje del usuario no resuelve directamente esta alerta,
integra la pregunta socrática sugerida al final de tu respuesta.
No la copies literalmente. Adáptala al flujo de la conversación.
` : "";

        // Construir payload multimodal si hay adjunto
        let mediaPayload: any = null;
        if (attachment?.fileData && attachment?.mimeType === 'application/pdf') {
            mediaPayload = {
                inlineData: {
                    mimeType: 'application/pdf',
                    data: attachment.fileData
                }
            };
            logger.info(`📎 [ARQUITECTO] PDF adjunto: ${attachment.fileName}`);
        }

        // 1. Buscar contexto relevante via RAG
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        const tier = getTier(request.data);

        let ragContext = "";
        if (query) {
            try {
                const embeddings = new GeminiEmbedder({
                    apiKey: getAIKey(request.data, googleApiKey.value()),
                    model: "gemini-embedding-001",
                    taskType: TaskType.RETRIEVAL_QUERY,
                });

                const safeSearchQuery = query.substring(0, 300);
                const queryVector = await embeddings.embedQuery(safeSearchQuery);

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

Pregunta: "${escapePromptVariable(query || 'Documento adjunto')}"

Responde SOLO con el nombre del modo (una palabra con guión bajo).
        `;

        const modeResult = await smartGenerateContent(genAI, modeDetectionPrompt, {
            _tier: tier, taskType: 'high_volume',
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

        const CULTURAL_DETECTION_INSTRUCTION = `
=== PROTOCOLO DE DETECCIÓN CULTURAL ===
Si el usuario menciona una cultura real, país, período histórico, tradición o 
elemento de civilización específico (ej: "mate argentino", "samurái", "Imperio Romano",
"cultura maya"), ejecuta este flujo:

1. Responde con 2-3 datos históricos específicos y NO obvios sobre ese elemento.
   (Evita lo genérico. Busca el dato que sorprende y que tiene implicaciones narrativas.)
   
2. Señala la tensión narrativa que ese dato crea:
   "Este elemento tiene una historia de [conflicto/prohibición/evolución] que podría 
   generar fricción interesante en tu mundo."

3. Ofrece la opción de documentos:
   "Si quieres que mi análisis sea históricamente más preciso, puedes compartirme 
   documentos PDF sobre esta cultura directamente en el chat. Sin documentos puedo 
   ayudarte, pero con menos profundidad específica. ¿Tienes material de referencia?"

IMPORTANTE: No inventes datos históricos. Si no estás seguro de un dato específico,
di "hay elementos de esta cultura que conozco superficialmente" y redirige hacia 
lo que sí conoces con certeza.
`;

        let priorityProtocol = '';
        const hasRagContent = ragContext && ragContext.trim().length > 10;

        if (worldEntitiesCount === 0 && !hasRagContent) {
            priorityProtocol = `=== PROTOCOLO TABULA RASA (PÁGINA EN BLANCO) ===
El proyecto "${projectName}" está completamente vacío. No hay documentos subidos ni entidades creadas.
TU MISIÓN: No supongas nada, no ataques al autor por "vacíos documentales" porque literalmente acaba de empezar. Adopta una postura de Guía Socrático Estricto. Oblígalo a definir la "Santísima Trinidad" narrativa (Reglas del Mundo, Conflicto Central, Defecto del Protagonista). Ofrécele iniciar un "Mega-Roadmap" para construir los cimientos paso a paso.`;
        } else if (worldEntitiesCount === 0 && hasRagContent) {
            priorityProtocol = `=== PROTOCOLO DE CAOS ESTRUCTURAL ===
Has detectado que el autor tiene documentos y lore escrito (Contexto RAG), pero su Base de Datos de Canon (WorldEntities) está VACÍA. El autor está construyendo sobre arena.
TU MISIÓN: Sé implacable. Enfréntate al autor y exígele formalizar los conceptos que mencionan sus propios textos crudos. Si sus textos hablan de una "Magia" o "Facción", ordénale que defina sus reglas, límites, costos y debilidades AHORA. No le permitas avanzar ni cristalizar Roadmaps hasta que no convierta su prosa caótica en un sistema estructural sólido.`;
        }

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
                case "Micro-Roadmap":
                    objectivePrompt = "El usuario ha elegido Micro-Roadmap. Concéntrate exclusivamente en el hueco narrativo específico que el usuario quiere resolver. No te desvíes a otros temas del worldbuilding.";
                    break;
                case "Roadmap de Detonación":
                    objectivePrompt = "El usuario ha elegido Roadmap de Detonación. Tu objetivo es inyectar tensión y conflicto en el lore existente. Pregunta cómo las diferentes facciones o reglas de magia colisionan entre sí de forma violenta.";
                    break;
                case "Muro del 2do Acto":
                    objectivePrompt = "El usuario ha elegido Muro del 2do Acto. Tu objetivo es destrabar la trama central. Pregunta qué revelación o giro de tuerca puede ocurrir AHORA MISMO para cambiar la dirección de los personajes.";
                    break;
            }
        }

        // 5. Generar respuesta con el Clasificador de Intenciones
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth });

        // 1. Leer el pendingItem activo de la sesión
        let activePendingItem: PendingItem | null = null;
        let resolvedItems: PendingItem[] = [];
        let cachedCanonContext = '';
        let cachedWorldEntities = '';
        let sessionImplementationGoal = '';

        try {
            const sessionDoc = await db
                .collection("users").doc(userId)
                .collection("forge_sessions").doc(sessionId)
                .get();
            
            if (sessionDoc.exists) {
                const sessionData = sessionDoc.data();
                const currentPendingItems: PendingItem[] = sessionData?.pendingItems || [];
                // El item activo es el primero no resuelto, ordenado por jerarquía
                activePendingItem = currentPendingItems.find(item => !item.resolved) || null;
                resolvedItems = currentPendingItems.filter(item => item.resolved);
                cachedCanonContext = sessionData?.cachedCanonContext || '';
                cachedWorldEntities = sessionData?.cachedWorldEntities || '';
                sessionImplementationGoal = sessionData?.implementationGoal || '';
            }
        } catch (e) {
            logger.warn('[ARQUITECTO] No se pudo leer el pending item activo:', e);
        }

        // 2. Usar contexto cacheado
        const contextData = {
            canon: cachedCanonContext,
            resources: '',
            worldEntities: cachedWorldEntities
        };

        // 3. Construir historial de conversación
        const historyMessagesSnap = await db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("messages")
            .orderBy("timestamp", "desc")
            .limit(10)
            .get();

        const recentHistoryText = historyMessagesSnap.docs
            .reverse()
            .filter((d: any) => d.data().role !== 'system')
            .map((d: any) => `${d.data().role === 'user' ? 'AUTOR' : 'ARQUITECTO'}: ${d.data().text || ''}`)
            .join('\n\n');

        // 4. Clasificar la intención del mensaje
        const intent = await routeArquitectoIntent(genAI, activePendingItem, query || '', tier);
        logger.info(`🧭 [ARQUITECTO] Intención detectada: ${intent} | Item activo: ${activePendingItem?.title || 'ninguno'}`);

        // 5. Generar respuesta según la intención
        let responseText = '';
        let resolvedItem: PendingItem | null = null;
        let drivePatches: Array<{ documentName: string; driveFileId: string | null; newRuleStatement: string }> = [];

        if (intent === 'EXPLORACION') {
            // Ruta de Exploración Socrática — el usuario tiene bloqueo creativo
            const prompt = buildExploracionChatPrompt(
                recentHistoryText,
                query || '',
                contextData.worldEntities,
                sessionImplementationGoal
            );
            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier,
                taskType: 'deep_analysis',
                temperature: TEMP_CREATIVE,
                contextLabel: 'ArquitectoChat_EXPLORACION',
            });
            responseText = result.text || 'Cuéntame más sobre tu proyecto. ¿Qué tienes construido hasta ahora?';

        } else if (intent === 'DEBATE' || intent === 'CONSULTA') {
            const prompt = intent === 'CONSULTA'
                ? buildConsultaPrompt(recentHistoryText, query || '', contextData.canon, contextData.worldEntities)
                : buildDebatePrompt(activePendingItem, recentHistoryText, query || '', contextData.worldEntities, resolvedItems);

            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier,
                taskType: 'deep_analysis',
                temperature: TEMP_CREATIVE,
                contextLabel: `ArquitectoChat_${intent}`,
            });
            responseText = result.text || 'No pude procesar esa consulta. ¿Puedes reformularla?';

        } else if (intent === 'REFUTACION') {
            const prompt = buildRefutacionPrompt(activePendingItem, recentHistoryText, query || '');
            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier,
                taskType: 'deep_analysis',
                temperature: TEMP_PRECISION,
                contextLabel: 'ArquitectoChat_REFUTACION',
            });
            responseText = result.text || 'No pude evaluar la refutación. Intenta de nuevo.';
            
            // Si la refutación es válida, marcar el item como resuelto
            if (responseText.includes('[REFUTACIÓN VÁLIDA]') && activePendingItem) {
                resolvedItem = {
                    ...activePendingItem,
                    resolved: true,
                    resolutionText: 'Refutación aceptada por el Arquitecto — elemento fuera de cámara o intencional.',
                    resolvedAt: new Date().toISOString()
                };
            }

        } else if (intent === 'CONFIRMACION') {
            const confirmacionPrompt = `${ARQUITECTO_SYSTEM_INSTRUCTION}

RUTA: CONFIRMACIÓN — El autor aceptó continuar.

DISONANCIA SIGUIENTE (ÚNICA):
${activePendingItem ? `Título: ${activePendingItem.title}\nDescripción: ${activePendingItem.description}\nCapa: ${activePendingItem.layer || 'MACRO'}` : 'Sin disonancia activa.'}

INSTRUCCIONES:
Formula el desafío socrático para la disonancia siguiente. Aborda ÚNICAMENTE esta disonancia, ninguna otra. Si no hay disonancia activa, felicita al autor por resolver todo.
Máximo 150 palabras. Un solo desafío.`;

            const result = await smartGenerateContent(genAI, confirmacionPrompt, {
                _tier: tier,
                taskType: 'standard',
                temperature: TEMP_CREATIVE,
                contextLabel: 'ArquitectoChat_CONFIRMACION',
            });
            responseText = result.text || 'Entendido. Pasemos al siguiente punto.';

        } else if (intent === 'RESOLUCION' && activePendingItem) {
            const prompt = buildResolucionPrompt(activePendingItem, recentHistoryText, query || '', contextData.canon, resolvedItems);
            const result = await smartGenerateContent(genAI, prompt, {
                _tier: tier,
                taskType: 'deep_analysis',
                jsonMode: true,
                temperature: TEMP_PRECISION,
                contextLabel: 'ArquitectoChat_RESOLUCION',
            });
            
            if (result.text) {
                const parsed = parseSecureJSON(result.text, 'ArquitectoChat_RESOLUCION');
                if (parsed && !parsed.error) {
                    responseText = parsed.architectReply || 'Resolución registrada.';
                    
                    if (parsed.resolved === true) {
                        resolvedItem = {
                            ...activePendingItem,
                            resolved: true,
                            resolutionText: parsed.resolutionText || (query || '').substring(0, 200),
                            resolvedAt: new Date().toISOString()
                        };
                        drivePatches = parsed.patches || [];
                    }
                }
            }
            
            if (!responseText) {
                responseText = 'Procesé la resolución. Revisemos el siguiente punto del canon.';
            }
        }

        // 6. Si hubo resolución, actualizar pendingItems y ejecutar Ripple Effect
        if (resolvedItem) {
            await updatePendingItemResolution(db, userId, sessionId, resolvedItem, drivePatches, genAI, tier);
        }

        // Pipeline de guardado del PDF en WorldEntities RESOURCE
        if (attachment?.fileData && attachment?.fileName) {
            try {
                const resourceId = require('crypto')
                    .createHash('sha256')
                    .update(userId + attachment.fileName + Date.now())
                    .digest('hex')
                    .substring(0, 20);

                await db
                    .collection("users").doc(userId)
                    .collection("WorldEntities")
                    .doc(resourceId)
                    .set({
                        id: resourceId,
                        projectId: projectId,
                        name: attachment.fileName.replace('.pdf', ''),
                        category: 'RESOURCE',
                        tier: 'ANCHOR',
                        status: 'active',
                        modules: {
                            forge: {
                                summary: `Documento de referencia cultural compartido en sesión del Arquitecto`,
                                smartTags: ['CIENCIA', 'REFERENCIA_CULTURAL'],
                            }
                        },
                        sourceType: 'arquitecto_chat',
                        sessionId: sessionId,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    }, { merge: true });

                logger.info(`📚 [ARQUITECTO] PDF guardado como RESOURCE: ${resourceId}`);
            } catch (e) {
                logger.warn("[ARQUITECTO] No se pudo guardar PDF como RESOURCE:", e);
            }
        }

        // 6. Guardar en Firestore
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);

        const messagesRef = sessionRef.collection("messages");

        await messagesRef.add({
            role: 'user',
            text: query || `[Adjunto: ${attachment?.fileName}]`,
            timestamp: new Date(),
        });

        await messagesRef.add({
            role: 'ia',
            text: responseText,
            timestamp: new Date(),
            arquitectoMode: detectedMode,
        });

        await sessionRef.set({ updatedAt: new Date().toISOString() }, { merge: true });

        // Actualizar snapshot de la sesión
        try {
            await sessionRef.set({
                updatedAt: new Date().toISOString(),
                'snapshot.currentState': detectedMode,
                'snapshot.activeAlertCount': activeAlerts.length,
                ...(mostCriticalAlert ? {
                    'snapshot.lastCriticalAlert': {
                        type: mostCriticalAlert.type,
                        socraticQuestion: mostCriticalAlert.socraticQuestion,
                        nodeAName: mostCriticalAlert.nodeA.name,
                        nodeBName: mostCriticalAlert.nodeB.name
                    }
                } : {})
            }, { merge: true });
        } catch (e) {
            logger.warn("[ARQUITECTO] No se pudo actualizar snapshot:", e);
        }

        return {
            response: responseText,
            suggestedMode: detectedMode,
            detectedIntent: intent,
            hadResolution: !!resolvedItem,
            rippleSummary: resolvedItem ? 'Efecto Dominó calculado.' : undefined,
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

        const contextData = await readCanonContext(userId, projectId, driveClient);

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        const tier = getTier(request.data);

        const focusMode = (request.data.focusMode as any) || 'TRIAGE';
        const severityMode = (request.data.severityMode as any) || 'ALL';
        const implementationGoal = request.data.implementationGoal || '';

        const analyzeMode = await classifyArquitectoMode(genAI, implementationGoal, tier);
        logger.info(`[arquitectoAnalyze] Goal: "${implementationGoal}" → Modo: ${analyzeMode}`);

        const analysisPrompt = buildAnalysisPrompt(projectName, contextData, {
            focusMode,
            severityMode,
            implementationGoal,
            isCreativeBlock: analyzeMode === 'EXPLORACION',
        });

        const result = await smartGenerateContent(genAI, analysisPrompt, {
            _tier: tier,
            taskType: 'deep_analysis',
            jsonMode: true,
            temperature: TEMP_PRECISION,
            contextLabel: "ArquitectoAnalyze",
        });

        let pendingItems: PendingItem[] = [];
        let projectSummary = "Análisis completado.";

        if (result.text) {
            const parsed = parseSecureJSON(result.text, "ArquitectoAnalyze");
            if (parsed && !parsed.error) {
                pendingItems = (parsed.items || []).map((item: any) => ({
                    ...item,
                    layer: item.layer || 'MACRO',  // Default a MACRO si no viene
                    resolved: false
                }));
                
                // ★ Ordenar por jerarquía: MACRO primero, luego MESO, luego MICRO
                const layerWeight: Record<string, number> = { MACRO: 3, MESO: 2, MICRO: 1 };
                const severityWeight: Record<string, number> = { critical: 3, warning: 2, suggestion: 1 };
                
                pendingItems.sort((a: PendingItem, b: PendingItem) => {
                    const layerDiff = (layerWeight[b.layer || 'MICRO'] || 0) - (layerWeight[a.layer || 'MICRO'] || 0);
                    if (layerDiff !== 0) return layerDiff;
                    return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
                });
                
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
    async (request): Promise<{
        ready: boolean;
        reason?: string;
        roadmapCards?: any[];
        pendingItems?: any[];
        hasMorePhases?: boolean;
        nextPhaseToGenerate?: string | null;
    }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { sessionId, objective, scope, isContinuation, currentPhase } = request.data;
        // scope: 'micro' (un arco) | 'mega' (obra completa)
        
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");

        const userId = request.auth.uid;
        const db = getFirestore();

        // ═══ PRE-FLIGHT CHECK ═══
        const messagesSnap = await db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .get();

        const userMessages = messagesSnap.docs.filter(d => d.data().role === 'user');
        
        if (userMessages.length < 3) {
            return {
                ready: false,
                reason: 'conversation_too_short',
            };
        }

        // ═══ CONSTRUIR CONTEXTO DE GENERACIÓN ═══
        const conversationHistory = messagesSnap.docs
            .slice(-30) // Últimos 30 mensajes
            .map(d => `${d.data().role === 'user' ? 'AUTOR' : 'ARQUITECTO'}: ${d.data().text}`)
            .join("\n");

        // Leer WorldEntities top 5
        const entitiesSnap = await db
            .collection("users").doc(userId)
            .collection("WorldEntities")
            .where("tier", "==", "ANCHOR")
            .limit(5)
            .get();

        const entitiesContext = entitiesSnap.docs
            .filter(d => d.data().category !== 'RESOURCE')
            .map(d => {
                const data = d.data();
                return `${data.name} (${data.category}): ${data.modules?.forge?.summary || ''}`;
            })
            .join("\n");

        // Construir grafo para detectar colisiones actuales
        const config = await getProjectConfigLocal(userId);
        const projectId = config?.folderId || "unknown";
        
        const { buildNarrativeGraph } = await import('./services/narrativeDependencyEngine');
        const graph = await buildNarrativeGraph(db, userId, projectId);
        
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        const tier = getTier(request.data);

        // ═══ GENERACIÓN ═══
        const roadmapPrompt = `
Eres El Arquitecto. Has tenido la siguiente conversación socrática con un escritor.
Basándote EXCLUSIVAMENTE en esta conversación, genera el Roadmap narrativo.

OBJETIVO DEL ROADMAP: ${objective || "Definir la estructura narrativa principal"}
ALCANCE: ${scope === 'micro' ? 'Un arco narrativo específico' : 'La obra completa'}
FASE A GENERAR EN ESTA ITERACIÓN: ${currentPhase || 'El inicio de la historia (Acto 1 / Setup)'}

ENTIDADES CRISTALIZADAS EN EL PROYECTO:
${entitiesContext || "Sin entidades definidas aún."}

CONVERSACIÓN (La base del Roadmap):
${conversationHistory}

COLISIONES DETECTADAS EN EL GRAFO (Incorpóralas como pendientes críticos):
${graph.alerts.slice(0, 5).map(a => `- ${a.description}`).join('\n') || "Sin colisiones detectadas."}

INSTRUCCIONES ABSOLUTAS:

1. Genera EXCLUSIVAMENTE las tarjetas correspondientes a la FASE A GENERAR EN ESTA ITERACIÓN. No intentes resumir toda la historia en esta sola respuesta.

Cada tarjeta es un hito narrativo concreto y accionable.

El campo "phase" debe describir la etapa del hito de forma libre (ej. SETUP, MIDPOINT, CLIMAX, KISHOTENKETSU_TWIST, o la nomenclatura que mejor encaje con la historia).

Genera pendingItems específicos (Deuda Técnica Narrativa) que el autor debe resolver.

NO inventes elementos que no se mencionaron en la conversación.

6. Si consideras que la historia necesita más fases después de esta para completarse según el ALCANCE, marca 'hasMorePhases: true' y define cuál debería ser la 'nextPhaseToGenerate'.

Responde SOLO con JSON:
{
"hasMorePhases": true,
"nextPhaseToGenerate": "Nombre de la siguiente fase lógica (ej. El Nudo, El Descenso, Acto 2)",
"roadmapCards": [
{
"id": "card_1",
"title": "Título del hito narrativo",
"description": "Qué debe existir o resolverse en este punto",
"phase": "Nombre de la fase narrativa (dinámico)",
"dependencies": ["card_id_previo"],
"status": "pending",
"socraticChallenge": "Pregunta de alta presión que el Arquitecto haría sobre este hito para validar su fortaleza"
}
],
"pendingItems": [
{
"code": "ARQ-001",
"severity": "critical" | "warning" | "suggestion",
"title": "Título específico",
"description": "Descripción basada en la conversación",
"category": "continuidad" | "worldbuilding" | "personaje" | "cronologia" | "estructura"
}
]
}
`;

        const result = await smartGenerateContent(genAI, roadmapPrompt, {
            _tier: tier,
            taskType: 'deep_analysis',
            jsonMode: true,
            temperature: TEMP_PRECISION,
            contextLabel: "ArquitectoGenerateRoadmap"
        });

        if (result.error || !result.text) {
            throw new HttpsError("internal", "No se pudo generar el Roadmap.");
        }

        const parsed = parseSecureJSON(result.text, "ArquitectoGenerateRoadmap");
        
        if (parsed.error) {
            throw new HttpsError("internal", "Error parseando el Roadmap.");
        }

        // ═══ ESCRITURA ATÓMICA ═══
        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);

        const batch = db.batch();

        // Borrar cards existentes SOLO si NO es continuación
        if (!isContinuation) {
            const existingCards = await sessionRef.collection("cards").get();
            existingCards.docs.forEach(doc => batch.delete(doc.ref));
        }

        // Crear nuevas cards
        for (const card of (parsed.roadmapCards || [])) {
            const cardRef = sessionRef.collection("cards").doc(card.id);
            batch.set(cardRef, {
                ...card,
                createdAt: new Date().toISOString()
            });
        }

        // Actualizar session con nuevos pendingItems
        batch.update(sessionRef, {
            pendingItems: parsed.pendingItems || [],
            updatedAt: new Date().toISOString(),
            'snapshot.currentState': 'architect'
        });

        // Actualizar project_config
        const configRef = db
            .collection("users").doc(userId)
            .collection("profile").doc("project_config");

        batch.update(configRef, {
            lastArquitectoAnalysis: new Date().toISOString(),
            arquitectoCachedPendingItems: parsed.pendingItems || [],
            arquitectoSummary: `Roadmap generado: ${(parsed.roadmapCards || []).length} hitos definidos.`
        });

        await batch.commit();

        logger.info(`✅ [ARQUITECTO] Roadmap generado: ${(parsed.roadmapCards || []).length} cards`);

        return {
            ready: true,
            roadmapCards: parsed.roadmapCards || [],
            pendingItems: parsed.pendingItems || [],
            hasMorePhases: parsed.hasMorePhases || false,
            nextPhaseToGenerate: parsed.nextPhaseToGenerate || null
        };
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

// ─────────────────────────────────────────────
// FUNCIÓN: arquitectoResolvePendingItem
// ─────────────────────────────────────────────
export const arquitectoResolvePendingItem = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 60,
        memory: "512MiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<{ success: boolean; pendingItems: PendingItem[] }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { sessionId, itemCode, resolutionText, skipRipple } = request.data;
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");
        if (!itemCode) throw new HttpsError("invalid-argument", "Falta itemCode.");

        const userId = request.auth.uid;
        const db = getFirestore();

        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);

        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) throw new HttpsError("not-found", "Sesión no encontrada.");

        let pendingItems: PendingItem[] = sessionDoc.data()?.pendingItems || [];
        const targetItem = pendingItems.find(i => i.code === itemCode);
        
        if (!targetItem) throw new HttpsError("not-found", "Item no encontrado.");

        // Marcar como resuelto
        const resolvedItem: PendingItem = {
            ...targetItem,
            resolved: true,
            resolutionText: resolutionText || 'Resuelto manualmente.',
            resolvedAt: new Date().toISOString()
        };

        pendingItems = pendingItems.map(i => i.code === itemCode ? resolvedItem : i);

        const tier = getTier(request.data);

        // Ripple Effect (opcional, puede saltarse para resoluciones en lote)
        if (!skipRipple) {
            const stillPending = pendingItems.filter(i => !i.resolved);
            if (stillPending.length > 0) {
                try {
                    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
                    const rippleResult = await evaluateRippleEffect(genAI, resolvedItem, stillPending, tier);
                    
                    pendingItems = pendingItems.map(item => {
                        if (rippleResult.autoResolvedIds.includes(item.code)) {
                            return {
                                ...item,
                                resolved: true,
                                resolutionText: `Auto-resuelto: ${resolvedItem.title}`,
                                resolvedAt: new Date().toISOString(),
                                autoResolvedBy: resolvedItem.code
                            };
                        }
                        return item;
                    });
                } catch (e) {
                    logger.warn('[ARQUITECTO] Ripple skip por error:', e);
                }
            }
        }

        await sessionRef.set({ pendingItems, updatedAt: new Date().toISOString() }, { merge: true });

        return { success: true, pendingItems };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN: arquitectoApplyPatch
// ─────────────────────────────────────────────
export const arquitectoApplyPatch = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 120,
        memory: "1GiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<{ success: boolean; updatedFileName?: string }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { sessionId, patchIndex, driveFileId, documentName, newRuleStatement, patchInstructions, accessToken } = request.data;

        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");
        if (!driveFileId) throw new HttpsError("invalid-argument", "Falta driveFileId. El archivo debe estar indexado en Drive.");
        if (!accessToken) throw new HttpsError("invalid-argument", "Falta accessToken.");

        const userId = request.auth.uid;
        const db = getFirestore();

        logger.info(`📝 [ARQUITECTO] Aplicando patch a ${documentName} (${driveFileId})`);

        try {
            const auth = new google.auth.OAuth2();
            auth.setCredentials({ access_token: accessToken });
            const drive = google.drive({ version: "v3", auth });

            // 1. Obtener metadata del archivo para detectar su tipo
            const metaRes = await drive.files.get({
                fileId: driveFileId,
                fields: 'id, name, mimeType'
            });
            const fileMimeType = metaRes.data.mimeType || 'text/plain';
            const isGoogleDoc = fileMimeType === 'application/vnd.google-apps.document';

            // Leer el archivo original
            let originalContent: string;

            if (isGoogleDoc) {
                // Google Docs nativos: exportar como texto plano
                const exportRes = await drive.files.export({
                    fileId: driveFileId,
                    mimeType: 'text/plain'
                });
                originalContent = typeof exportRes.data === 'string' 
                    ? exportRes.data 
                    : JSON.stringify(exportRes.data);
            } else {
                // Archivos .md, .txt, etc.: descarga directa
                const getRes = await drive.files.get({
                    fileId: driveFileId,
                    alt: 'media'
                } as any);
                originalContent = typeof getRes.data === 'string' 
                    ? getRes.data 
                    : JSON.stringify(getRes.data);
            }

            // Proteger sovereign areas
            const { SmartSyncService } = await import('./services/smart_sync');
            const { protectedContent, map: sovereignMap } = SmartSyncService.protectSovereignAreas(originalContent);

            // IA integra la nueva regla
            const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
            const tier = getTier(request.data);

            const mergePrompt = `
ACT AS: Expert Markdown Editor & Canon Archivist for a literary project.
TASK: Integrate the following new canonical rule into the existing document.

INTEGRATION INSTRUCTIONS: "${escapePromptVariable(patchInstructions || 'Agrega esta regla en la sección más relevante o crea una nueva sección si no existe.')}"

NEW CANONICAL RULE TO INTEGRATE:
"${escapePromptVariable(newRuleStatement)}"

RULES:
1. PRESERVE Frontmatter (--- ... ---) exactly as is.
2. PRESERVE existing content. Only append or insert. Do NOT delete anything.
3. PRESERVE Sovereign Blocks ({{SOVEREIGN_BLOCK_X}}) exactly as is.
4. OUTPUT the FULL, VALID Markdown file. Raw text only, no code blocks.
5. The integration must feel natural — not like an appended note.

EXISTING DOCUMENT:
"${escapePromptVariable(protectedContent.substring(0, 80000))}"
`;

            const result = await smartGenerateContent(genAI, mergePrompt, {
                _tier: tier, taskType: 'standard',
                temperature: TEMP_PRECISION,
                contextLabel: 'ArquitectoApplyPatch'
            });

            if (!result.text) {
                throw new Error("El motor de integración no generó contenido.");
            }

            let newContent = result.text;

            // Limpiar code blocks si el LLM los agrega
            if (newContent.startsWith('\`\`\`markdown')) newContent = newContent.replace(/^\`\`\`markdown\n/, '').replace(/\n\`\`\`$/, '');
            if (newContent.startsWith('\`\`\`')) newContent = newContent.replace(/^\`\`\`\n/, '').replace(/\n\`\`\`$/, '');

            // Restaurar sovereign areas
            newContent = SmartSyncService.restoreSovereignAreas(newContent, sovereignMap);

            // 2. Escribir en Drive
            if (isGoogleDoc) {
                // Google Docs nativos: no podemos sobreescribir con text/markdown
                // Debemos usar la API de Google Docs para hacer la edición
                // POR AHORA: mostrar error explicativo en lugar de corromper el documento
                throw new Error(
                    `El archivo "${documentName}" es un Google Doc nativo. ` +
                    `Los patches automáticos solo funcionan con archivos .md o .txt. ` +
                    `Copia el contenido propuesto manualmente en tu documento.`
                );
                // TODO futuro: usar Google Docs API (batchUpdate) para edición nativa
            } else {
                // Archivos .md, .txt: subida directa preservando el mimeType original
                await drive.files.update({
                    fileId: driveFileId,
                    media: {
                        mimeType: fileMimeType, // Preservar el tipo original, no forzar markdown
                        body: newContent
                    }
                });
            }

            logger.info(`✅ [ARQUITECTO] Patch aplicado exitosamente a ${documentName}`);

            // 3. Marcar el patch como aprobado en Firestore
            const sessionRef = db
                .collection("users").doc(userId)
                .collection("forge_sessions").doc(sessionId);

            const sessionDoc = await sessionRef.get();
            if (sessionDoc.exists) {
                const patches = sessionDoc.data()?.pendingDrivePatches || [];
                patches[patchIndex] = { ...patches[patchIndex], status: 'approved', appliedAt: new Date().toISOString() };
                await sessionRef.set({ pendingDrivePatches: patches }, { merge: true });
            }

            // 4. Auto-indexar el archivo actualizado (fire & forget)
            db.collection("TDB_Index").doc(userId)
                .collection("files").doc(driveFileId)
                .set({
                    lastModifiedByArchitect: new Date().toISOString(),
                    pendingReindex: true
                }, { merge: true })
                .catch(e => logger.warn("[ARQUITECTO] No se pudo marcar para re-indexar:", e));

            return { success: true, updatedFileName: documentName };

        } catch (error: any) {
            logger.error("[ARQUITECTO] Error aplicando patch:", error);
            throw new HttpsError("internal", `Error al aplicar el patch: ${error.message}`);
        }
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN: arquitectoRejectPatch
// ─────────────────────────────────────────────
export const arquitectoRejectPatch = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS,
        enforceAppCheck: false,
        timeoutSeconds: 30,
        memory: "256MiB",
        secrets: [googleApiKey],
    },
    async (request): Promise<{ success: boolean }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");

        const { sessionId, patchIndex } = request.data;
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");

        const userId = request.auth.uid;
        const db = getFirestore();

        const sessionRef = db
            .collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId);

        const sessionDoc = await sessionRef.get();
        if (sessionDoc.exists) {
            const patches = sessionDoc.data()?.pendingDrivePatches || [];
            patches[patchIndex] = { ...patches[patchIndex], status: 'rejected', rejectedAt: new Date().toISOString() };
            await sessionRef.set({ pendingDrivePatches: patches }, { merge: true });
        }

        logger.info(`🚫 [ARQUITECTO] Patch ${patchIndex} rechazado para sesión ${sessionId}`);
        return { success: true };
    }
);

// ─────────────────────────────────────────────
// FUNCIÓN: arquitectoGenerateRoadmapFinal
// ─────────────────────────────────────────────
export const arquitectoGenerateRoadmapFinal = onCall(
    {
        region: FUNCTIONS_REGION, cors: ALLOWED_ORIGINS,
        enforceAppCheck: false, timeoutSeconds: 300,
        memory: "1GiB", secrets: [googleApiKey],
    },
    async (request): Promise<{ changelog: string[]; creationMissions: string[]; researchMissions: string[] }> => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido.");
        
        const { sessionId } = request.data;
        if (!sessionId) throw new HttpsError("invalid-argument", "Falta sessionId.");
        
        const userId = request.auth.uid;
        const db = getFirestore();
        
        // Leer historial y pendingItems
        const sessionDoc = await db.collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId).get();
        
        if (!sessionDoc.exists) throw new HttpsError("not-found", "Sesión no encontrada.");
        
        const sessionData = sessionDoc.data()!;
        const pendingItems: PendingItem[] = sessionData.pendingItems || [];
        const resolvedItems = pendingItems.filter(i => i.resolved);
        const pendingStillOpen = pendingItems.filter(i => !i.resolved);

        const appliedPatches = (sessionData.pendingDrivePatches || [])
            .filter((p: any) => p.status === 'approved')
            .map((p: any) => `[Archivo modificado: ${p.documentName}] ${p.newRuleStatement}`)
            .join('\n');

        const appliedPatchesSection = appliedPatches
            ? `\nARCHIVOS MODIFICADOS EN DRIVE (ya aplicados):\n${appliedPatches}\n`
            : '';
        
        const messagesSnap = await db.collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .limit(50)
            .get();
        
        const conversationHistory = messagesSnap.docs
            .map(d => `${d.data().role === 'user' ? 'AUTOR' : 'ARQUITECTO'}: ${d.data().text || ''}`)
            .join('\n');
        
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        const tier = getTier(request.data);

        const prompt = `Eres El Arquitecto. El interrogatorio socrático ha concluido. Genera el documento maestro final.

CONTRADICCIONES RESUELTAS (${resolvedItems.length}):
${resolvedItems.map(i => `- [${i.code}] ${i.title}: ${i.resolutionText || 'Resuelta.'}`).join('\n')}
${appliedPatchesSection}
CONTRADICCIONES AÚN PENDIENTES (${pendingStillOpen.length}):
${pendingStillOpen.map(i => `- [${i.code}] ${i.title}`).join('\n')}

SESIÓN DE TRABAJO:
${conversationHistory.substring(0, 30000)}

Genera el Roadmap Final en 3 columnas. Responde SOLO con JSON:
{
  "changelog": ["[Modificado] Regla X ajustada para...", "[Definido] Sistema Y establece que..."],
  "creationMissions": ["[Misión] Redactar el acta de fundación de...", "[Pendiente] Definir el sistema económico de..."],
  "researchMissions": ["[Investigar] Historia real de...", "[Estudiar] Cómo funcionan los gremios medievales..."]
}

REGLAS:
- changelog: Lo que se acordó y cambió durante el interrogatorio. Si hay archivos modificados, inclúyelos con el formato "[Archivo: nombre.md] descripción del cambio".
- creationMissions: Documentos o conceptos que AÚN DEBEN CREARSE para sostener lo acordado.
- researchMissions: Temas del mundo real que el autor debe estudiar para dar verosimilitud.
- Detecta el idioma y responde en ese idioma.`;

        const result = await smartGenerateContent(genAI, prompt, {
            _tier: tier, taskType: 'deep_analysis', jsonMode: true, temperature: TEMP_PRECISION,
            contextLabel: 'ArquitectoGenerateRoadmapFinal'
        });
        
        let roadmapFinal = { changelog: [], creationMissions: [], researchMissions: [] };
        
        if (result.text) {
            const parsed = parseSecureJSON(result.text, 'ArquitectoGenerateRoadmapFinal');
            if (parsed && !parsed.error) {
                roadmapFinal = {
                    changelog: parsed.changelog || [],
                    creationMissions: parsed.creationMissions || [],
                    researchMissions: parsed.researchMissions || []
                };
            }
        }
        
        // Persistir el roadmap final
        await db.collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("architect").doc("roadmapFinal")
            .set({ ...roadmapFinal, generatedAt: new Date().toISOString() });
        
        return roadmapFinal;
    }
);

