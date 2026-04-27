import sys

with open('functions/src/architect.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_function = """
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
        
        const messagesSnap = await db.collection("users").doc(userId)
            .collection("forge_sessions").doc(sessionId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .limit(50)
            .get();
        
        const conversationHistory = messagesSnap.docs
            .map(d => `${d.data().role === 'user' ? 'AUTOR' : 'ARQUITECTO'}: ${d.data().text || ''}`)
            .join('\\n');
        
        const genAI = new GoogleGenerativeAI(getAIKey(request.data, googleApiKey.value()));
        
        const prompt = `Eres El Arquitecto. El interrogatorio socrático ha concluido. Genera el documento maestro final.

CONTRADICCIONES RESUELTAS (${resolvedItems.length}):
${resolvedItems.map(i => `- [${i.code}] ${i.title}: ${i.resolutionText || 'Resuelta.'}`).join('\\n')}

CONTRADICCIONES AÚN PENDIENTES (${pendingStillOpen.length}):
${pendingStillOpen.map(i => `- [${i.code}] ${i.title}`).join('\\n')}

SESIÓN DE TRABAJO:
${conversationHistory.substring(0, 30000)}

Genera el Roadmap Final en 3 columnas. Responde SOLO con JSON:
{
  "changelog": ["[Modificado] Regla X ajustada para...", "[Definido] Sistema Y establece que..."],
  "creationMissions": ["[Misión] Redactar el acta de fundación de...", "[Pendiente] Definir el sistema económico de..."],
  "researchMissions": ["[Investigar] Historia real de...", "[Estudiar] Cómo funcionan los gremios medievales..."]
}

REGLAS:
- changelog: Lo que se acordó y cambió durante el interrogatorio.
- creationMissions: Documentos o conceptos que AÚN DEBEN CREARSE para sostener lo acordado.
- researchMissions: Temas del mundo real que el autor debe estudiar para dar verosimilitud.
- Detecta el idioma y responde en ese idioma.`;

        const result = await smartGenerateContent(genAI, prompt, {
            useFlash: false, jsonMode: true, temperature: TEMP_PRECISION,
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
"""

if 'arquitectoGenerateRoadmapFinal =' not in content:
    content += new_function
    with open('functions/src/architect.ts', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Added arquitectoGenerateRoadmapFinal successfully!')
else:
    print('arquitectoGenerateRoadmapFinal already exists.')
