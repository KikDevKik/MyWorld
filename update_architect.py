import sys

with open('functions/src/architect.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add the new helper functions before arquitectoChat
new_helpers = """
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
 */
async function routeArquitectoIntent(
    genAI: GoogleGenerativeAI,
    activePendingItem: PendingItem | null,
    userMessage: string
): Promise<'DEBATE' | 'RESOLUCION' | 'REFUTACION' | 'CONSULTA'> {
    
    // Si no hay un PendingItem activo, todo es un DEBATE general
    if (!activePendingItem) return 'DEBATE';

    const classifierPrompt = `Eres un clasificador de intenciones. El usuario está respondiendo a una disonancia narrativa.

DISONANCIA ACTIVA: ${activePendingItem.title}
DESCRIPCIÓN: ${activePendingItem.description}
MENSAJE DEL USUARIO: "${escapePromptVariable(userMessage)}"

Clasifica la intención en UNA de estas 4 categorías:

1. DEBATE: El usuario hace una pregunta, pide sugerencias, da respuestas vagas/incompletas, o usa pronombres ambiguos ("ellos", "eso", "su plan") sin especificar. También si explora ideas sin comprometerse.

2. RESOLUCION: El usuario da una instrucción CLARA, ESPECÍFICA y SIN AMBIGÜEDADES para resolver el problema. Debe ser accionable ("Haz que la magia cueste sangre", "El rey muere antes de que esto ocurra").

3. REFUTACION: El usuario afirma que no hay error, defiende el canon ("no es un error, es intencional"), invoca el Filtro de Cámara ("esto no se muestra en la historia"), o argumenta que la disonancia no aplica.

4. CONSULTA: El usuario pide que le recuerdes lore existente, busca contexto sin intentar resolver, o hace una pregunta factual sobre sus propios documentos.

IMPORTANTE: Si el mensaje contiene pronombres vagos sin sustantivos claros, ES DEBATE, no RESOLUCION.

Responde SOLO con una de estas palabras exactas: DEBATE, RESOLUCION, REFUTACION, CONSULTA`;

    try {
        const result = await smartGenerateContent(genAI, classifierPrompt, {
            useFlash: true, // Flash para clasificación rápida — no necesita Pro
            temperature: 0.0, // Temperatura 0 para máxima determinismo
            contextLabel: 'ArquitectoIntentRouter',
        });

        const text = (result.text || '').trim().toUpperCase();
        if (['DEBATE', 'RESOLUCION', 'REFUTACION', 'CONSULTA'].includes(text)) {
            return text as 'DEBATE' | 'RESOLUCION' | 'REFUTACION' | 'CONSULTA';
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
    worldEntitiesContext: string
): string {
    const disonancia = activePendingItem
        ? `DISONANCIA EN DEBATE:\nTítulo: ${activePendingItem.title}\nDescripción: ${activePendingItem.description}\nCapa: ${activePendingItem.layer || 'MACRO'}`
        : 'Sin disonancia específica activa. El autor está en modo exploración general.';

    return `${ARQUITECTO_SYSTEM_INSTRUCTION}

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
5. Máximo 250 palabras. Un solo desafío por respuesta.

MENSAJE DEL AUTOR: "${escapePromptVariable(userMessage)}"`;
}

/** Prompt para REFUTACION: El Arquitecto evalúa si la defensa es válida. */
function buildRefutacionPrompt(
    activePendingItem: PendingItem | null,
    historyText: string,
    userMessage: string
): string {
    const disonancia = activePendingItem
        ? `DISONANCIA REFUTADA:\n${activePendingItem.title}: ${activePendingItem.description}`
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
    canonContext: string
): string {
    return `${ARQUITECTO_SYSTEM_INSTRUCTION}

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
      "proposedChange": "Descripción concisa del cambio a aplicar",
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
    pendingItems: PendingItem[]
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
        .join('\\n\\n');

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
            useFlash: true, // Flash es suficiente para esta evaluación
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
    genAI: GoogleGenerativeAI
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
                const rippleResult = await evaluateRippleEffect(genAI, resolvedItem, stillPending);
                
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
            pendingDrivePatches: drivePatches.length > 0 ? drivePatches : [],
        }, { merge: true });
        
        logger.info(`✅ [ARQUITECTO] Resolución guardada. ${pendingItems.filter(i => i.resolved).length}/${pendingItems.length} items resueltos.`);
        
    } catch (e) {
        logger.error('[ARQUITECTO] Error en updatePendingItemResolution:', e);
    }
}

// ─────────────────────────────────────────────
// FUNCIÓN 2: arquitectoChat
// ─────────────────────────────────────────────
"""

if "routeArquitectoIntent" not in content:
    content = content.replace("// ─────────────────────────────────────────────\n// FUNCIÓN 2: arquitectoChat\n// ─────────────────────────────────────────────", new_helpers)

# 2. Add arquitectoResolvePendingItem at the end
new_resolve_function = """
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

        // Ripple Effect (opcional, puede saltarse para resoluciones en lote)
        if (!skipRipple) {
            const stillPending = pendingItems.filter(i => !i.resolved);
            if (stillPending.length > 0) {
                try {
                    const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
                    const rippleResult = await evaluateRippleEffect(genAI, resolvedItem, stillPending);
                    
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
"""
if "arquitectoResolvePendingItem" not in content:
    content += new_resolve_function

# 3. Replace the generation block in arquitectoChat
start_idx = content.find('// 5. Generar respuesta con Pro')
end_idx = content.find('// Pipeline de guardado del PDF en WorldEntities RESOURCE')

if start_idx != -1 and end_idx != -1:
    old_block = content[start_idx:end_idx]
    
    new_block = """// 5. Generar respuesta con el Clasificador de Intenciones
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth });

        // 1. Leer el pendingItem activo de la sesión
        let activePendingItem: PendingItem | null = null;
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
            }
        } catch (e) {
            logger.warn('[ARQUITECTO] No se pudo leer el pending item activo:', e);
        }

        // 2. Leer contexto de WorldEntities para respuestas ricas
        const contextData = await readCanonContext(userId, projectId, driveClient);

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
            .join('\\n\\n');

        // 4. Clasificar la intención del mensaje
        const intent = await routeArquitectoIntent(genAI, activePendingItem, query || '');
        logger.info(`🧭 [ARQUITECTO] Intención detectada: ${intent} | Item activo: ${activePendingItem?.title || 'ninguno'}`);

        // 5. Generar respuesta según la intención
        let responseText = '';
        let resolvedItem: PendingItem | null = null;
        let drivePatches: Array<{ documentName: string; driveFileId: string | null; newRuleStatement: string }> = [];

        if (intent === 'DEBATE' || intent === 'CONSULTA') {
            const prompt = intent === 'CONSULTA'
                ? buildConsultaPrompt(recentHistoryText, query || '', contextData.canon, contextData.worldEntities)
                : buildDebatePrompt(activePendingItem, recentHistoryText, query || '', contextData.worldEntities);

            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: detectedMode !== 'architect', // Flash para triage/inquisitor, Pro para architect
                temperature: TEMP_CREATIVE,
                contextLabel: `ArquitectoChat_${intent}`,
            });
            responseText = result.text || 'No pude procesar esa consulta. ¿Puedes reformularla?';

        } else if (intent === 'REFUTACION') {
            const prompt = buildRefutacionPrompt(activePendingItem, recentHistoryText, query || '');
            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: false, // Pro para evaluar refutaciones — requiere razonamiento
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

        } else if (intent === 'RESOLUCION' && activePendingItem) {
            const prompt = buildResolucionPrompt(activePendingItem, recentHistoryText, query || '', contextData.canon);
            const result = await smartGenerateContent(genAI, prompt, {
                useFlash: false, // Pro para resoluciones — genera parches de canon
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
            await updatePendingItemResolution(db, userId, sessionId, resolvedItem, drivePatches, genAI);
        }

        """
    content = content.replace(old_block, new_block)
    
# 4. Modify return value of arquitectoChat
old_return = """        return {
            response: responseText,
            suggestedMode: detectedMode,
        };"""

new_return = """        return {
            response: responseText,
            suggestedMode: detectedMode,
            detectedIntent: intent,
            hadResolution: !!resolvedItem,
            rippleSummary: resolvedItem ? 'Efecto Dominó calculado.' : undefined,
        };"""
if old_return in content:
    content = content.replace(old_return, new_return)

with open('functions/src/architect.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated architect.ts successfully!")
