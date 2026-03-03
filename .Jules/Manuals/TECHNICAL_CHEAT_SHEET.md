# TECHNICAL CHEAT SHEET: MyWorld Engine (Jules Protocol)

Este documento detalla la arquitectura técnica y las innovaciones clave de MyWorld para su presentación en entrevista técnica (Google).

## The Stack

*   **Frontend:** React 18, Vite, Tailwind CSS 4, Framer Motion, D3-Force.
*   **Backend:** Firebase Cloud Functions (Node.js 22), Firestore (NoSQL), Google Drive API v3.
*   **AI Core:** Google Gemini 3.0 Pro & Flash (Preview), LangChain (Orchestration).
*   **Vector Database:** Firestore Native Vector Search (Cosine Similarity).

## Key Features Explained

### 1. El 'Canon Radar' (Guardián)
*   **Función:** Sistema de auditoría literaria en tiempo real (`functions/src/guardian.ts`).
*   **Cómo funciona:** Ejecuta múltiples agentes paralelos ("El Resonador" para trama, "El Hater" para crítica, "El Lógico" para contradicciones, "El Resonancia" para semillas) sobre un fragmento de texto.
*   **Técnica:** Utiliza `Promise.all` para lanzar verificaciones simultáneas contra la base de datos vectorial (RAG). Si detecta una contradicción con el "Canon" (hechos inmutables), genera una alerta de "Fricción Narrativa".

### 2. La Inyección de Contexto en el Laboratorio (RAG)
*   **Función:** Recuperación Aumentada de Generación para el Chat (`functions/src/index.ts` -> `chatWithGem`).
*   **Cómo funciona:**
    1.  **Vectorización:** Convierte la consulta del usuario en embeddings (`gemini-embedding-001`).
    2.  **Búsqueda Híbrida:** Busca chunks relevantes en Firestore filtrando por ProjectID + Similitud Semántica (Cosine).
    3.  **Diversidad:** Aplica un límite de chunks por archivo para evitar "visión de túnel" (sobreajuste a una sola fuente).
    4.  **Inyección:** Construye un prompt masivo con: Perfil de Escritor + Contexto Inmediato (Editor) + Memoria a Largo Plazo (RAG) + Protocolo de Continuidad.

### 3. WorldEngine y sus herramientas (Nexus Canvas v4.0)
*   **Función:** Visualización y expansión del grafo de conocimiento (`src/components/NexusCanvas.tsx`).
*   **Cómo funciona:**
    *   **Frontend:** Renderiza nodos usando `d3-force` y `react-xarrows`. Implementa "Lifeboat" (localStorage) para persistir cambios no guardados.
    *   **LOD (Level of Detail):** Optimiza la visualización según el nivel de zoom (Macro, Meso, Micro).
    *   **Crystallization:** Proceso de convertir nodos abstractos del grafo en archivos Markdown físicos en Google Drive.

### 4. El Director de Escena y sus Herramientas
*   **Función:** Motor de simulación narrativa (`functions/src/director.ts`).
*   **Cómo funciona:**
    *   **Lógica Trifásica:** Ajusta la "temperatura" y la "persona" del modelo según el nivel de Caos (Ingeniero Lógico < 0.4, Arquitecto Visionario < 0.7, Soñador Caótico > 0.7).
    *   **Thinking Mode:** Obliga al modelo a generar un bloque `<thinking>` interno para planificar la estructura antes de emitir la respuesta visible.
    *   **Iron Guardian:** Un sub-agente que bloquea alucinaciones si contradicen archivos marcados como `[PRIORITY LORE]`.

### 5. La Forja de Almas y sus Herramientas (Titanium V3.0)
*   **Función:** Sistema de triaje de entidades (`functions/src/soul_sorter.ts`).
*   **Cómo funciona:**
    *   **Clasificación:** Escanea textos y clasifica entidades en 3 niveles: **Ghost** (mencionado), **Limbo** (draft), **Anchor** (ficha maestra).
    *   **Rasgos (Traits):** Utiliza un sistema dinámico (Sentient, Tangible, Locatable, Abstract) para definir la ontología de las entidades.
    *   **Auto-Healing:** Si se detecta un cambio en Drive, la Forja actualiza automáticamente los metadatos en Firestore.

### 6. La Imprenta y sus Herramientas (The Press)
*   **Función:** Materialización de contenido (`functions/src/scribe.ts`).
*   **Cómo funciona:**
    *   **Manuscript Compilation:** Genera PDFs forenses via `pdfmake` en el backend.
    *   **Smart Patch:** Usa IA para "cirugía de texto", insertando nueva información en archivos existentes sin romper su estructura.
    *   **Nexus Identity:** Genera IDs deterministas basados en el path del archivo para mantener la integridad referencial.

### 7. El Tribunal y la Auditoría Forense
*   **Función:** Certificación de autoría humana (`functions/src/audit.ts`).
*   **Cómo funciona:**
    *   **Certificado de Autoría:** Calcula un "Human Score" basado en la proporción de caracteres escritos por el humano vs. generados por IA.
    *   **Logs Inmutables:** Registra cada interacción creativa (Inyección, Curación, Estructura) en una colección de auditoría en Firestore.

## AI Implementation

| Función | Modelo | Razón Técnica |
| :--- | :--- | :--- |
| **Guardian (Scan)** | **Gemini 3.0 Flash (Preview)** | Alta velocidad y bajo coste para escanear miles de caracteres. |
| **Soul Sorter (Extraction)** | **Gemini 3.0 Flash (Preview)** | Capacidad de contexto larga (2M tokens) para leer sagas enteras. |
| **Director (Logic)** | **Gemini 3.0 Pro (Preview)** | Requiere razonamiento complejo y seguimiento de instrucciones. |
| **Chat (RAG)** | **Gemini 3.0 Pro (Preview)** | Necesita matices estilísticos y comprensión profunda. |
| **Scribe (Synthesis)** | **Gemini 3.0 Flash (Preview)** | Tareas de reescritura y formateo mecánicas. |

## Innovation: Unique Selling Points

1.  **Visible 'Thinking Block':**
    *   Exhibe el proceso de razonamiento interno de la IA (`<thinking>...</thinking>`) en la UI. Permite al escritor verificar la lógica creativa ("Glass Box AI").

2.  **Titanium Protocol (Forensic Authorship):**
    *   Valida el esfuerzo del escritor ante editoriales mediante un "Certificado de Autoría" criptográfico que prueba qué porcentaje de la obra es humana.
