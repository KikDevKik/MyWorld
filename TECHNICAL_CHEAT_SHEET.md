# TECHNICAL CHEAT SHEET: MyWorld Engine (Jules Protocol)

Este documento detalla la arquitectura técnica y las innovaciones clave de MyWorld para su presentación en entrevista técnica (Google).

## The Stack

*   **Frontend:** React 18, Vite, Tailwind CSS (Typography), Framer Motion, React Flow / Force Graph 2D.
*   **Backend:** Firebase Cloud Functions (Node.js 22), Firestore (NoSQL), Google Drive API v3.
*   **AI Core:** Google Gemini 1.5 Pro (Reasoning) & Flash (Speed), LangChain (Orchestration).
*   **Vector Database:** Firestore Native Vector Search (Cosine Distance).

## Key Features Explained

### 1. El 'Canon Radar' (Guardián)
*   **Función:** Sistema de auditoría literaria en tiempo real (`functions/src/guardian.ts`).
*   **Cómo funciona:** Ejecuta múltiples agentes paralelos ("El Resonador" para trama, "El Hater" para crítica, "El Lógico" para contradicciones) sobre un fragmento de texto.
*   **Técnica:** Utiliza `Promise.all` para lanzar verificaciones simultáneas contra la base de datos vectorial (RAG). Si detecta una contradicción con el "Canon" (hechos inmutables), genera una alerta de "Fricción Narrativa".

### 2. La Inyección de Contexto en el Laboratorio (RAG)
*   **Función:** Recuperación Aumentada de Generación para el Chat (`functions/src/index.ts` -> `chatWithGem`).
*   **Cómo funciona:**
    1.  **Vectorización:** Convierte la consulta del usuario en embeddings (`gemini-embedding-001`).
    2.  **Búsqueda Híbrida:** Busca chunks relevantes en Firestore filtrando por Path (ámbito del archivo actual) + Similitud Semántica.
    3.  **Diversidad:** Aplica un límite de chunks por archivo para evitar "visión de túnel" (sobreajuste a una sola fuente).
    4.  **Inyección:** Construye un prompt masivo con: Perfil de Escritor + Contexto Inmediato (Editor) + Memoria a Largo Plazo (RAG) + Protocolo de Continuidad.

### 3. WorldEngine y sus herramientas (grafo, nexus, builder)
*   **Función:** Visualización y expansión del grafo de conocimiento (`src/components/WorldEngineV2/WorldEnginePageV2.tsx`).
*   **Cómo funciona:**
    *   **Frontend:** Renderiza nodos usando `react-force-graph-2d`. Implementa "Lifeboat" (localStorage) para persistir cambios no guardados.
    *   **Backend (`syncWorldManifest`):** Escanea recursivamente carpetas de Drive, extrae entidades con Gemini Flash (batch processing), y actualiza Firestore con relaciones semánticas (ENEMY, ALLY, FAMILY).
    *   **Tribunal:** Interfaz de curación donde el usuario aprueba/rechaza sugerencias de la IA antes de que entren al grafo oficial.

### 4. El Director de Escena y sus Herramientas
*   **Función:** Motor de simulación narrativa (`functions/src/index.ts` -> `worldEngine`).
*   **Cómo funciona:**
    *   **Lógica Trifásica:** Ajusta la "temperatura" y la "persona" del modelo según el nivel de Caos (Ingeniero Lógico < 0.4, Arquitecto Visionario < 0.7, Soñador Caótico > 0.7).
    *   **Thinking Mode:** Obliga al modelo a generar un bloque `<thinking>` interno para planificar la estructura antes de emitir la respuesta visible.
    *   **Iron Guardian:** Un sub-agente que bloquea alucinaciones si contradicen archivos marcados como `[PRIORITY LORE]`.

### 5. La Forja de Almas y sus Herramientas
*   **Función:** Sistema de triaje de entidades (`functions/src/soul_sorter.ts`).
*   **Cómo funciona:**
    *   **Clasificación:** Escanea textos y clasifica entidades en 3 niveles: **Ghost** (mencionado, sin ficha), **Limbo** (ficha incompleta), **Anchor** (ficha maestra en Drive).
    *   **Enriquecimiento (`enrichCharacterContext`):** Usa RAG profundo para "leer" toda la saga y generar un perfil psicológico y rol narrativo actualizado.
    *   **Auto-Healing:** Si se detecta un cambio en Drive, la Forja actualiza automáticamente los metadatos en Firestore.

### 6. La Imprenta y sus Herramientas
*   **Función:** Materialización de contenido (`functions/src/scribe.ts`).
*   **Cómo funciona:**
    *   **Cristalización:** Convierte nodos abstractos del grafo o chats efímeros en archivos Markdown físicos en Google Drive.
    *   **Smart Patch:** Usa IA para "cirugía de texto", insertando nueva información en un archivo existente sin romper su estructura o borrar contenido previo.
    *   **Nexus Identity:** Genera IDs deterministas basados en el path del archivo para mantener la integridad referencial entre Drive y Firestore.

### 7. El Tribunal y sus Herramientas
*   **Función:** Auditoría de autoría y calidad (`functions/src/audit.ts`).
*   **Cómo funciona:**
    *   **Certificado de Autoría:** Calcula un "Human Score" basado en la proporción de caracteres escritos por el humano vs. generados por IA.
    *   **Logs Inmutables:** Registra cada interacción creativa (Inyección, Curación, Estructura) en una colección de auditoría.
    *   **Juicio de 3 Jueces:** Invoca a 3 personas de IA (Arquitecto, Bardo, Hater) para criticar el estilo y la lógica de un texto.

## AI Implementation

| Función | Modelo | Razón Técnica |
| :--- | :--- | :--- |
| **Guardian (Initial Scan)** | **Gemini 1.5 Flash** | Alta velocidad y bajo coste para escanear miles de caracteres en tiempo real. |
| **Soul Sorter (Extraction)** | **Gemini 1.5 Flash** | Capacidad de contexto larga (1M tokens) para leer novelas enteras rápido. |
| **Director (Logic)** | **Gemini 1.5 Pro** | Requiere razonamiento complejo y seguimiento de instrucciones estrictas (System 2 Thinking). |
| **Chat (RAG)** | **Gemini 1.5 Pro** | Necesita matices estilísticos y comprensión profunda del subtexto ("The Chameleon"). |
| **Scribe (Synthesis)** | **Gemini 1.5 Flash** | Tareas de reescritura y formateo son mecánicas; Flash es suficiente y más barato. |

## Innovation: Unique Selling Points

1.  **Visible 'Thinking Block':**
    *   A diferencia de ChatGPT, MyWorld expone el proceso de razonamiento interno de la IA (`<thinking>...</thinking>`) en la UI (`ChatPanel.tsx`). Esto permite al escritor verificar *por qué* la IA tomó una decisión creativa, aumentando la confianza y la colaboración ("Glass Box AI").

2.  **Auditoría Creativa (Titanium Protocol):**
    *   Resolvemos el dilema ético de la IA en el arte. El sistema rastrea la procedencia de cada idea. Al final, genera un "Certificado de Autoría" criptográfico que prueba qué porcentaje de la obra es humana, validando el esfuerzo del escritor ante editoriales o plataformas.
