import sys

filename = 'functions/src/architect.ts'
with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

old_analyze = """        const [canonContext, resourcesContext] = await Promise.all([
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
        }"""

new_analyze = """        const contextData = await readCanonContext(userId, projectId, driveClient);

        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));

        const focusMode = (request.data.focusMode as any) || 'TRIAGE';
        const severityMode = (request.data.severityMode as any) || 'ALL';
        const implementationGoal = request.data.implementationGoal || '';

        const analysisPrompt = buildAnalysisPrompt(projectName, contextData, {
            focusMode,
            severityMode,
            implementationGoal
        });

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

if old_analyze in content:
    content = content.replace(old_analyze, new_analyze)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Successfully replaced analyze!")
else:
    print("Failed to replace analyze!")
