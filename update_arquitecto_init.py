import sys

filename = 'functions/src/architect.ts'
with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the exact block to replace
old_init_block = """        // 5. LLAMADA AL LLM PARA MENSAJE INICIAL
        
        let pendingItems: PendingItem[] = [];
        let projectSummary = "Proyecto inicializado.";

        const fullContext = `
=== CONTEXTO DEL MANUSCRITO ===
${initialContext || "Sin documentos legibles."}
`;

        const graphSection = graphContext ? `
=== COLISIONES DETECTADAS EN EL GRAFO NARRATIVO ===
(Estas son inconsistencias matemáticamente detectadas. Incorpóralas como pendientes críticos.)
${graphContext}
` : "";

        const initPrompt = `
${promptToUse}

ESTADO DEL PROYECTO:
- Entidades cristalizadas: ${worldEntitiesCount}
- Nombre: ${escapePromptVariable(projectName)}

${initialState === 'triage' ? fullContext : ''}
${graphSection}

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
            "El Arquitecto en línea. ¿Qué frente de batalla vamos a atacar hoy?";"""

new_init_block = """        // 5. OBTENER CONTEXTO DIRECTO Y LLAMADA AL LLM
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: accessToken });
        const driveClient = google.drive({ version: "v3", auth });

        const contextData = await readCanonContext(userId, projectId, driveClient);

        const focusMode = (request.data.focusMode as any) || 'TRIAGE';
        const severityMode = (request.data.severityMode as any) || 'ALL';
        const implementationGoal = request.data.implementationGoal || '';

        const analysisPrompt = buildAnalysisPrompt(projectName, contextData, {
            focusMode,
            severityMode,
            implementationGoal
        });

        const initResult = await smartGenerateContent(genAI, analysisPrompt, {
            useFlash: false,
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
        }"""

if old_init_block in content:
    content = content.replace(old_init_block, new_init_block)
    
    # We also need to update the return of arquitectoInitialize to include focusMode and severityMode
    old_return_block = """        return {
            pendingItems,
            initialMessage,
            sessionId: sessionRef.id,
            projectSummary,
            lastAnalyzedAt: now,
        };"""
        
    new_return_block = """        return {
            pendingItems,
            initialMessage,
            sessionId: sessionRef.id,
            projectSummary,
            lastAnalyzedAt: now,
            focusMode,
            severityMode,
        };"""
        
    if old_return_block in content:
        content = content.replace(old_return_block, new_return_block)
        with open(filename, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully replaced init block!")
    else:
        print("Failed to replace return block!")
else:
    print("Failed to replace init block!")
