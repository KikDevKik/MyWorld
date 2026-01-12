# Informe del Proyecto: MyWord Creative Writing IDE

Este documento detalla todas las secciones, funciones backend y paneles frontend detectados en el proyecto.

## 🧠 Backend: Cloud Functions (Google Cloud / Firebase)
Ubicación: `functions/src/index.ts`

| Nombre | Propósito | Pantalla/Contexto | Acciones del Usuario | Estado | Dependencias Visibles |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **getDriveFiles** | Escanea carpetas de Google Drive (soporta multi-raíz) para construir el árbol de archivos. | Sidebar, Laboratorio, Forja | Abrir árbol, expandir carpetas. | ✅ Implementada | Google Drive API, Auth Token |
| **indexTDB** | Motor de ingestión que vectoriza archivos y crea la base de conocimiento (RAG). | Sidebar (Botón Cerebro), Settings | Click en "Indexar" o "Re-aprender todo". | ✅ Implementada | Gemini Embeddings, Firestore, Drive API |
| **chatWithGem** | Oráculo RAG que responde preguntas usando el contexto de los archivos indexados. | Guardián, Director, Chat | Enviar mensajes, preguntar sobre lore. | ✅ Implementada | Gemini 3 Pro, Firestore Vector Search |
| **worldEngine** | Motor de razonamiento profundo ("Titan Link") para simulación narrativa y lógica de mundo. | Perforador (WorldEnginePanel) | Generar nodos, simular consecuencias. | ✅ Implementada (Fase 4.3) | Gemini 3 Pro (Thinking Mode), Drive API |
| **summonTheTribunal** | Analiza textos con 3 personalidades (Arquitecto, Bardo, Hater) para dar crítica literaria. | TribunalPanel | Click en "Invocar al Tribunal". | ✅ Implementada | Gemini 3 Pro, JSON Output |
| **extractTimelineEvents** | Extrae eventos cronológicos (con fechas absolutas) de un texto narrativo. | Cronograma (TimelinePanel) | Click en "Analizar Archivo". | ✅ Implementada | Gemini 2.5 Flash, Firestore |
| **syncCharacterManifest** | Escanea una carpeta y sincroniza personajes detectados en una base de datos Firestore. | Forja (ForgePanel) | Click en "Sync", conectar Bóveda. | ✅ Implementada | Drive API, Firestore, Matter (Frontmatter) |
| **forgeAnalyzer** | Analiza textos para extraer nuevos personajes o actualizar el estado de los existentes. | Forja (Al abrir ficha/texto) | Automático al analizar texto. | ✅ Implementada | Gemini 3 Pro, Firestore |
| **crystallizeNode** | Convierte un nodo efímero del World Engine en un archivo Markdown persistente en Drive. | Perforador (WorldEnginePanel) | Click en "Cristalizar" en un nodo. | ✅ Implementada | Drive API, Firestore |
| **compileManuscript** | Compila múltiples archivos Markdown en un solo documento PDF (Backend logic). | Imprenta (ExportPanel) | (Acción pendiente en UI) | ✅ Implementada | PDFKit/PDFMake, Drive API |
| **forgeToDrive** | Exporta una sesión de chat de la Forja como un archivo Markdown formateado. | Director, Forja | Guardar sesión como archivo. | ✅ Implementada | Gemini (Resumen), Drive API |
| **Gestión de Sesiones** | CRUD completo (`create`, `get`, `delete`, `addMessage`) para historiales de chat. | Director, Forja | Crear chat, borrar historial. | ✅ Implementada | Firestore |
| **Gestión de Configuración** | CRUD (`get`, `save`) para configuración de proyecto y perfil de escritor. | SettingsModal, ProjectSettings | Guardar preferencias. | ✅ Implementada | Firestore |

---

## 🖥️ Frontend: Paneles e Interfaces (SPA)
Ubicación: `App.tsx` y `components/`

### 1. Editor Principal (El Lienzo)
*   **Archivo:** `components/Editor.tsx`
*   **Propósito:** Editor de texto enriquecido (TipTap) con soporte Markdown y sincronización en tiempo real.
*   **Pantalla:** Vista Principal (Ruta `/` por defecto).
*   **Acciones del Usuario:** Escribir texto, formatear, guardar (Ctrl+S), usar menú flotante ("Bubble Menu") para comandos rápidos, activar "Zen Mode".
*   **Estado:** ✅ Implementada.
*   **Dependencias:** `@tiptap/react`, `turndown` (HTML->MD), `marked` (MD->HTML), Cloud Function `saveDriveFile`.

### 2. Perforador (World Engine)
*   **Archivo:** `components/WorldEnginePanel.tsx`
*   **Propósito:** Interfaz de nodos visuales para brainstorming y simulación lógica del mundo.
*   **Pantalla:** Panel Superpuesto (GemID: `perforador`).
*   **Acciones del Usuario:** Escribir prompts, arrastrar nodos (Kinetic UI), ajustar "Caos" (Slider), activar "Red Alert", cristalizar nodos a archivos, responder interrogatorios de la IA.
*   **Estado:** ✅ Implementada (Fase Beta/4.3).
*   **Dependencias:** `framer-motion`, SVG Lines, Cloud Function `worldEngine`, `crystallizeNode`.

### 3. Forja de Almas (Character Forge)
*   **Archivo:** `components/ForgePanel.tsx` / `components/ForgeDashboard.tsx`
*   **Propósito:** Dashboard para la gestión, creación y evolución de personajes.
*   **Pantalla:** Panel Superpuesto (GemID: `forja`).
*   **Acciones del Usuario:** Seleccionar "Bóveda de Personajes", ver lista de personajes (Roster), sincronizar con Drive, chatear con personajes, crear fichas nuevas.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** `react-google-drive-picker`, Firestore (Characters Collection), Cloud Functions `syncCharacterManifest`, `forgeAnalyzer`.

### 4. Guardián (Chat RAG)
*   **Archivo:** `components/ChatPanel.tsx`
*   **Propósito:** Chat lateral asistente que tiene acceso a todo el contexto del proyecto (RAG).
*   **Pantalla:** Sidebar Derecha (GemID: `guardian`).
*   **Acciones del Usuario:** Chatear con la IA, ver fuentes citadas (chunks), pedir resúmenes.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Cloud Function `chatWithGem`, `react-markdown`.

### 5. Director de Escena
*   **Archivo:** `components/DirectorPanel.tsx`
*   **Propósito:** Gestor de sesiones de chat persistentes para dirección narrativa y brainstorming largo.
*   **Pantalla:** Panel Deslizante Derecho (Trigger desde `ArsenalDock` o Comandos).
*   **Acciones del Usuario:** Crear/Borrar sesiones, chatear con historial persistente, continuar conversaciones previas.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Firestore (`forge_sessions`), Cloud Functions de Sesión.

### 6. Tribunal Literario
*   **Archivo:** `components/TribunalPanel.tsx`
*   **Propósito:** Panel de crítica literaria con 3 jueces IA (Lógica, Emoción, Mercado).
*   **Pantalla:** Panel Superpuesto (GemID: `tribunal`).
*   **Acciones del Usuario:** Pegar texto manualmente o seleccionar archivo actual, "Invocar al Tribunal", leer veredictos y puntuaciones.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Cloud Function `summonTheTribunal`.

### 7. Laboratorio
*   **Archivo:** `components/LaboratoryPanel.tsx`
*   **Propósito:** Explorador visual de archivos del proyecto (Canon vs Referencias).
*   **Pantalla:** Panel Superpuesto (GemID: `laboratorio`).
*   **Acciones del Usuario:** Navegar pestañas (Proyecto/Biblioteca), ver grid de archivos, abrir chat de investigación ("El Bibliotecario") sobre referencias.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Cloud Function `getDriveFiles`, Chat RAG filtrado.

### 8. Cronograma
*   **Archivo:** `components/TimelinePanel.tsx`
*   **Propósito:** Visualizador y extractor de eventos temporales en una línea de tiempo.
*   **Pantalla:** Panel Superpuesto (GemID: `cronograma`).
*   **Acciones del Usuario:** Configurar año actual/era, analizar archivo activo, confirmar/descartar eventos sugeridos.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Firestore (`TDB_Timeline`), Cloud Function `extractTimelineEvents`.

### 9. Imprenta (Export)
*   **Archivo:** `components/ExportPanel.tsx`
*   **Propósito:** Interfaz para compilar manuscritos y exportar a PDF/Epub.
*   **Pantalla:** Panel Superpuesto (GemID: `imprenta`).
*   **Acciones del Usuario:** (UI básica detectada) Selección de compilación.
*   **Estado:** ⚠️ Esqueleto / Placeholder.
*   **Dependencias:** Cloud Function `compileManuscript` (Backend listo, UI incompleta).

### 10. Manual de Campo (Navegación)
*   **Archivo:** `components/VaultSidebar.tsx`
*   **Propósito:** Árbol de navegación de archivos y menú principal.
*   **Pantalla:** Sidebar Izquierda (Fija).
*   **Acciones del Usuario:** Navegar carpetas, seleccionar archivos, abrir modales de configuración, indexar memoria (botón cerebro), cerrar sesión.
*   **Estado:** ✅ Implementada.
*   **Dependencias:** Firestore (`TDB_Index/structure/tree`), `react-google-drive-picker`.

---

### ⚙️ Modales y Utilidades
*   **SettingsModal:** Configuración de usuario y herramientas de depuración (re-indexar, auditar tokens).
*   **ProjectSettingsModal:** Configuración de rutas del proyecto (Canon, Recursos, Cronología).
*   **ArsenalDock:** Barra lateral derecha para cambiar entre herramientas (Gemas).
*   **CommandBar:** Barra de comandos tipo "Spotlight" (`Cmd+K`) para acciones rápidas.
