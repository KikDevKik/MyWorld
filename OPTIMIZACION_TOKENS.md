# Optimización de Tokens y Rendimiento — MyWorld AI

> Estado: Mayo 2026 | Tier System: Normal (2.5-flash-lite / 2.5-flash) / Ultra (3-flash / 3.1-pro)

---

## Diagnóstico actual

| Componente | Modelo (Normal) | Modelo (Ultra) | MaxOutput | Llamadas/acción | Paralelas |
|---|---|---|---|---|---|
| Genesis | 2.5-flash-lite | 3-flash | 2,048 | 1–2 | ❌ |
| Scribe | 2.5-flash | 3-flash | 2,048–4,096 | 1–3 | ❌ |
| Arquitecto | 2.5-flash + thinking | 3.1-pro | 16,384 | 1–3 por acción | ❌ |
| Forge RAG | 2.5-flash | 3-flash | 4,096 | 1 + embedding | ❌ |
| Forge Stream | 2.5-flash | 3-flash | 4,096 | 1 (SSE) | ❌ |
| Tribunal | 2.5-flash + thinking | 3.1-pro | 16,384×3 | **3 secuenciales** | ❌ |
| Guardian/Audit | 2.5-flash | 3-flash | 4,096 | 1–2 | ❌ |

**Puntos críticos identificados:**

1. **Tribunal corre 3 llamadas secuenciales** a `deep_analysis` — cada una pide hasta 16,384 output tokens. Una sola sesión del Tribunal puede consumir ~50K tokens.
2. **Thinking budget en Normal** fijo en 8,192 tokens para `deep_analysis` — thinking tokens son invisibles al usuario pero se cobran igual.
3. **`maxOutputTokens` no se ajusta al contenido real** — si el Arquitecto contesta 800 tokens, igualmente se reservan 16,384 en el lado del modelo.
4. **`LITERARY_FICTION_PROTOCOL`** se inyecta como prefijo del system instruction en **cada llamada** aunque no toda tarea necesita ese contexto.
5. **Sin caché de contexto** — el system prompt del Arquitecto (~7KB) se retransmite completo en cada turn de conversación.
6. **Sin deduplicación de embeddings** — Forge RAG re-embeds texto de usuario aunque la misma query haya ocurrido recientemente.

---

## Recomendaciones (ordenadas por impacto / esfuerzo)

---

### 1. Paralelizar el Tribunal — ALTO IMPACTO, BAJO ESFUERZO

**Situación actual:** Los 3 jueces (Arquitecto, Bardo, Hater) se ejecutan en secuencia con `await` encadenado.

**Solución:** `Promise.all()` — los 3 jueces son completamente independientes.

```typescript
// ACTUAL (secuencial — ~9s, 3 rondas de latencia)
const architectResult = await smartGenerateContent(genAI, prompt, archConfig);
const bardResult      = await smartGenerateContent(genAI, prompt, bardConfig);
const haterResult     = await smartGenerateContent(genAI, prompt, haterConfig);

// PROPUESTO (paralelo — ~3s, 1 ronda de latencia)
const [architectResult, bardResult, haterResult] = await Promise.all([
    smartGenerateContent(genAI, prompt, archConfig),
    smartGenerateContent(genAI, prompt, bardConfig),
    smartGenerateContent(genAI, prompt, haterConfig),
]);
```

**Ganancia:** Tiempo de respuesta del Tribunal cae de ~9s a ~3s. Consumo total de tokens no cambia, pero la **latencia percibida** mejora drásticamente. En free tier (RPM limit) puede causar throttling si los 3 pasan el límite por minuto simultáneamente — monitorear.

---

### 2. Reducir `maxOutputTokens` a valores realistas — ALTO IMPACTO, BAJO ESFUERZO

`maxOutputTokens` no determina cuántos tokens se *generan*, pero sí cuántos puede el modelo *producir* antes de truncar. En la práctica, el modelo genera hasta donde necesita. El problema real es el **thinkingBudget**: en modo thinking, el modelo consume razonamiento interno que cuenta en la cuota aunque no sea visible.

```typescript
// ai_config.ts — ajuste propuesto
const MAX_OUTPUT_TOKENS_TABLE: Record<TaskType, number> = {
    high_volume:   1024,   // era 2048 — clasificaciones no necesitan más
    standard:      2048,   // era 4096 — diálogos cortos/medianos
    deep_analysis: 8192,   // era 16384 — análisis narrativos profundos
};

// Y para thinking budget en Normal tier:
const THINKING_BUDGETS = {
    deep_analysis: { normal: 4096, ultra: -1 },  // era 8192 → 4096
};
```

**Ganancia estimada:** ~40% menos tokens en `deep_analysis`, ~50% en `high_volume`. Sin pérdida de calidad apreciable — si algún caso legítimo necesita más, el modelo simplemente genera hasta el nuevo tope.

**Cómo validar:** Activar logging de `usage.totalTokenCount` en `_executeGeneration` y medir el percentil 95 de uso real durante una semana. Si p95 < 6000 para `deep_analysis`, bajar aún más.

---

### 3. Condicionalizar `LITERARY_FICTION_PROTOCOL` — IMPACTO MEDIO, BAJO ESFUERZO

**Situación actual:** El protocolo de ficción literaria (~330 chars) se inyecta en **todas** las llamadas, incluyendo tareas que no lo necesitan (indexación, embedding, clasificación de entidades).

**Solución:** Añadir flag en `SmartConfig` y aplicarlo condicionalmente.

```typescript
// SmartConfig:
skipLiteraryProtocol?: boolean;  // Para tareas técnicas/administrativas

// En _executeGeneration:
const finalSystemInstruction = config.skipLiteraryProtocol
    ? (config.systemInstruction || "")
    : LITERARY_FICTION_PROTOCOL + "\n\n" + (config.systemInstruction || "");
```

Tareas que pueden usar `skipLiteraryProtocol: true`:
- Genesis entity extraction
- Forge RAG embedding queries  
- Audit log generation
- Cualquier tarea `high_volume` de clasificación pura

**Ganancia:** ~330 tokens por llamada en tareas técnicas. Poco por llamada, pero si hay 50K llamadas/mes, son ~16M tokens ahorrados solo en el protocolo.

---

### 4. Gemini Context Caching para el system prompt del Arquitecto — ALTO IMPACTO, ESFUERZO MEDIO

El Arquitecto tiene un system prompt de ~7KB que se retransmite en cada turn de conversación. La API de Gemini tiene [**Explicit Caching**](https://ai.google.dev/gemini-api/docs/caching) — cachea el prefijo del contexto por hasta 1 hora, cobrando solo una fracción.

```typescript
// Pseudocódigo — usar CachedContent API
const cache = await genAI.cacheContent({
    model: modelName,
    systemInstruction: heavySystemPrompt,
    ttl: '3600s',  // 1 hora
});

const model = genAI.getGenerativeModelFromCachedContent(cache);
```

**Restricciones:**
- Mínimo 32,768 tokens para que el caché sea rentable
- Solo disponible en modelos 1.5+ (confirmar disponibilidad en 2.5-flash y 3.1-pro)
- Requiere gestión del ciclo de vida del cache (crear, reutilizar, expirar)

**Ganancia estimada:** Si el Arquitecto tiene 10 turns por sesión con un system prompt de 2K tokens, el caché ahorra ~18K tokens por sesión en input.

---

### 5. Acortar el system prompt del Arquitecto — IMPACTO MEDIO, ESFUERZO MEDIO

El prompt del Arquitecto en `prompt_manager.ts` es el más largo del sistema (~6–9KB). Muchas instrucciones están escritas en lenguaje natural extenso cuando podrían comprimirse.

**Principios de compresión de system prompts:**
- Eliminar explicaciones del "por qué" — el modelo no necesita justificaciones, solo directivas
- Usar listas cortas en lugar de párrafos
- Eliminar ejemplos redundantes — uno bien elegido vale más que cinco mediocres
- Consolidar instrucciones de formato repetidas

**Objetivo:** Llevar el system prompt del Arquitecto de ~7KB a ~3KB sin pérdida de calidad. Validar con A/B testing interno antes de desplegar.

---

### 6. Limitar contexto del canvas enviado al Arquitecto — IMPACTO ALTO, ESFUERZO ALTO

El Arquitecto recibe el canvas completo en cada llamada (entidades + arcos + recursos). En proyectos maduros esto puede ser 40–60KB de contexto, la mayoría irrelevante para la pregunta específica del usuario.

**Solución:** Enviar solo el subgrafo relevante.

```typescript
// En lugar de: todo el canvas
const fullContext = serializeCanvas(canvas);

// Propuesto: solo entidades relacionadas con la intención detectada
const relevantEntities = canvas.entities
    .filter(e => e.relevanceScore > 0.7)  // o top-K por similitud semántica
    .slice(0, 20);                          // límite duro
const focusedContext = serializeEntities(relevantEntities);
```

**Ganancia:** En proyectos grandes, puede reducir el input del Arquitecto de 60KB a 8–15KB — un 75–85% de reducción en input tokens para esas llamadas.

**Complejidad:** Requiere un mecanismo de scoring/filtering de entidades por relevancia. Podría implementarse como una llamada previa rápida (`high_volume`, sin thinking) que selecciona las entidades más pertinentes.

---

### 7. Caché de embeddings para Forge RAG — IMPACTO MEDIO, ESFUERZO MEDIO

Forge RAG genera un embedding por cada mensaje del usuario para buscar en el vector store. Si el usuario envía mensajes similares o reformula la misma pregunta, se generan embeddings innecesarios.

**Solución:** Cache en memoria o Firestore para embeddings recientes (TTL: 10 minutos por sesión).

```typescript
// Simple in-memory cache (por instancia de Cloud Function)
const embeddingCache = new Map<string, number[]>();

async function getEmbedding(text: string): Promise<number[]> {
    const key = text.trim().toLowerCase().slice(0, 200);  // normalizar
    if (embeddingCache.has(key)) return embeddingCache.get(key)!;
    const embedding = await generateEmbedding(text);
    embeddingCache.set(key, embedding);
    return embedding;
}
```

**Nota:** Las Cloud Functions son stateless — el caché en memoria solo persiste mientras la instancia esté caliente. Para caché persistente usar Firestore o Redis (Memorystore).

---

## Sobre la API Key personal y el quota exhaustion

**Por qué puede agotar cuota con API key propia:**

Google AI Studio ofrece dos tipos de acceso:
1. **Free tier de AI Studio** — limitado por RPM (requests per minute) y por día, sin cargo. Aplica aunque uses tu propia API key si la key es del free tier.
2. **Billing activado** — sin límite de RPM, se cobra por token. Requiere tarjeta en Google Cloud Console.

**El diagnóstico más probable:** La API key del tu bro es del free tier de AI Studio (sin billing activado). Esas keys tienen exactamente los mismos límites que la key del proyecto. Para confirmar:

1. Ir a [Google AI Studio](https://aistudio.google.com) → API Keys → verificar si dice "Free" o "Paid"
2. O abrir [Google Cloud Console](https://console.cloud.google.com) → Billing → verificar si el proyecto tiene billing activo

**Horario de reset:** Los límites diarios se resetean a medianoche **Pacific Time** (UTC-7 en verano / UTC-8 en invierno), NO a las 24h del primer uso. Si usaron la API a las 11 PM PT, se resetea en 1 hora. Si la usaron a las 1 AM PT, esperan ~23 horas más.

---

## Resumen de ganancias estimadas

| Cambio | Esfuerzo | Reducción tokens | Impacto latencia |
|---|---|---|---|
| Paralelizar Tribunal | Bajo (1h) | 0% | -66% latencia |
| Reducir maxOutputTokens | Bajo (30min) | ~40% deep_analysis | Sin cambio |
| Reducir thinkingBudget Normal | Bajo (30min) | ~20% deep_analysis | Sin cambio |
| Condicionalizar LiteraryProtocol | Bajo (2h) | ~5% global | Sin cambio |
| Context Caching Arquitecto | Medio (1 día) | ~30% input Arquitecto | -20% latencia |
| Acortar system prompt Arquitecto | Medio (2 días) | ~15% input Arquitecto | Sin cambio |
| Filtrar canvas Arquitecto | Alto (3–5 días) | ~60% input en proyectos grandes | Sin cambio |
| Caché embeddings Forge | Medio (1 día) | ~5% input Forge | -30% latencia Forge (reuse) |

**Prioridad recomendada para el sprint más próximo:**
1. Reducir `maxOutputTokens` y `thinkingBudget` — cambio de 2 líneas, ganancia inmediata
2. Paralelizar el Tribunal — cambio de 10 líneas, experiencia de usuario notablemente mejor
3. Condicionalizar `LITERARY_FICTION_PROTOCOL` — pequeño pero acumulativo

Las demás mejoras (Context Caching, filtrado de canvas) son trabajo de mayor envergadura — candidatas para una sprint dedicada.

---

## Modelo de negocio y estrategia de lanzamiento

### Arquitectura actual: 100% BYOK

MyWorld no tiene ninguna key compartida del sistema. Si un usuario no configura su propia API key de Google AI Studio en Preferencias, el backend rechaza la solicitud con `API_KEY_REQUIRED`. No hay fallback.

Esto significa:
- Cada usuario usa su propia cuota — no se comparte entre usuarios
- Un usuario con key del free tier tiene los mismos límites que cualquier key gratuita
- La presencia de una key determina el tier: key presente → Ultra (3.x), sin key → bloqueado

### Por qué el modelo BYOK puro no escala al público general

El flujo actual para usar MyWorld:
> Crear cuenta en Google AI Studio → generar API key → entender free vs paid → abrir MyWorld → ir a Preferencias → pegar la key

El 90%+ de usuarios no técnicos abandona antes de escribir la primera palabra. El billing propio (Option A) es inevitable para un lanzamiento masivo.

### Opciones de modelo de negocio

| Opción | Descripción | Para cuándo |
|---|---|---|
| **A — SaaS estándar** | MyWorld paga Google Cloud con billing, cobra suscripción ($8–15/mes). Rate limiting por usuario. | Lanzamiento público masivo |
| **B — Freemium** | MyWorld paga un free tier limitado (X ops/mes); usuarios pagan para más | Requiere estimar costo por usuario activo |
| **C — BYOK + onboarding** | Wizard paso a paso para conseguir key. Demo key con cuota mínima. | Beta técnico / devs |
| **D — Multi-provider** | Soporte para Groq (free tier generoso) como alternativa a Google AI | Free tier real sin billing |

### Costo estimado en Opción A (referencia)

Con las optimizaciones de este documento aplicadas:
- ~$0.003–0.01 por sesión activa de usuario
- 500 usuarios activos/mes → ~$50–200/mes en API
- Google Cloud da **$300 en créditos gratis** a cuentas nuevas → suficiente para el beta

### Plan de lanzamiento en 2 semanas (Beta Técnico)

**Semana 1 — Beta dev:**
- Publicar en redes dirigido a devs y early adopters técnicos
- Ellos tienen API keys y toleran rough edges
- Crear Discord como canal principal de feedback
- Comunicar honestamente: "billing coming soon" (no "en días")

**Semana 2 — Decisiones de billing:**
- Evaluar feedback recibido
- Registrar Google Cloud con billing activado
- Definir tiers y precios
- Implementar integración con Stripe

**Por qué "billing coming soon" y no "en X días":**
Stripe + tiers + arquitectura de keys + testing + deploy = 3–5 semanas si se hace bien. Prometer días y no cumplir destruye la credibilidad con exactamente la audiencia que más importa (devs). Los devs respetan la honestidad sobre timelines.

### Sobre el quota exhaustion del tester con key propia

**Diagnóstico:** La key del tester es del free tier de Google AI Studio. Las keys gratuitas tienen los mismos límites independientemente de quién las tenga. Para tener acceso sin límites diarios se necesita billing activado en Google Cloud Console.

**Cómo verificar:** Google AI Studio → API Keys → si dice "Free" es free tier con límites. Para activar billing: Google Cloud Console → Billing → vincular proyecto.
