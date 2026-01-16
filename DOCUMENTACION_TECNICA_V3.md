DOCUMENTACIÓN TÉCNICA MAESTRA - PROYECTO MYWORLD (TITAN)
===========================================================
**Fecha:** 25 de Febrero de 2025
**Versión:** 3.0 (The Architect's Cut)
**Estado:** EN DESARROLLO ACTIVO / REVISIÓN ESTRUCTURAL
**Codename:** SENTINEL / PERIMETER BREACH

---

## 1. INTRODUCCIÓN Y PROPÓSITO: LA CAJA NEGRA
Este documento constituye la "Fuente de Verdad" definitiva y técnica para el proyecto MyWorld. Su propósito es servir como memoria eidética para el equipo de desarrollo, restaurando el contexto completo de la arquitectura, decisiones de diseño, protocolos de seguridad paranoica y el estado real de cada módulo.

**MyWorld** no es un simple editor de texto; es un **Entorno de Desarrollo Integrado (IDE) para Narrativa Compleja**, diseñado para asistir a arquitectos literarios mediante una simbiosis profunda con Inteligencia Artificial (Gemini 2.0 Flash/Pro/Exp).

---

## 2. CIMIENTOS DEL SISTEMA (ARQUITECTURA TITAN)

### 2.1 Stack Tecnológico (The Iron Core)
*   **Frontend:** React 18 + Vite (SPA). Arquitectura modular estricta.
*   **Estilos:** TailwindCSS v4 ("Titanium Dark Theme"). Diseño enfocado en inmersión total ("Zen Mode").
*   **Backend:** Firebase Cloud Functions v2 (Node.js 22). Arquitectura Serverless.
*   **Base de Datos:**
    *   **Firestore (NoSQL):** Metadatos, Sesiones, Índices Vectoriales (TDB_Index), Cronogramas (TDB_Timeline).
    *   **Google Drive API v3:** **Nivel 0 de Verdad**. El sistema de archivos real.
*   **Inteligencia Artificial (Neural Link):**
    *   **Motor Lógico:** Google Gemini 2.0 Flash (Razonamiento rápido, extracción).
    *   **Motor Creativo:** Google Gemini 1.5 Pro (Resonancia profunda, análisis estilístico).
    *   **Agentes Virtuales:** El Bibliotecario (Gemini 2.5 Flash), El Tribunal (Triple Persona).

### 2.2 Jerarquía de la Verdad (Data Flow)
El sistema opera bajo una estricta jerarquía de datos para evitar la corrupción narrativa:
1.  **Nivel 0 (Físico - Inmutable):** Los archivos `.md` en Google Drive. Si no está en Drive, no existe.
2.  **Nivel 1 (Índice Vectorial):** Colección `TDB_Index` en Firestore. Fragmentos ("chunks") vectorizados del contenido de Drive para RAG.
3.  **Nivel 2 (Metadatos Derivados):** Colecciones `users/{uid}/characters` y `TDB_Timeline`. Análisis enriquecido por IA (Personalidad, Cronología) sobre los archivos planos.
4.  **Nivel 3 (Sesión Volátil):** Estado de React (`ProjectConfigContext`). Sincronización en tiempo real.

### 2.3 Protocolo SENTINEL (Seguridad Paranoica)
MyWorld opera bajo una doctrina de "Cero Confianza" (Zero Trust) para proteger la Propiedad Intelectual.
*   **Hard Handshake:** Todas las Cloud Functions (`onCall`) exigen `enforceAppCheck: true`.
*   **ReCAPTCHA v3 Enterprise:** Verificación invisible de humanidad en cada interacción crítica.
*   **Fail-Fast UI:** `App.tsx` implementa un "Circuit Breaker" de seguridad. Si el handshake falla (Error 403), la UI colapsa inmediatamente a una pantalla de bloqueo (`SecurityLockScreen` - Titanium Aesthetics), impidiendo cualquier acceso a datos cacheados.
*   **Limites Anti-DoS (The Dam):**
    *   `MAX_AI_INPUT_CHARS`: 100k caracteres (prevención de desbordamiento de contexto).
    *   `MAX_FILE_SAVE_BYTES`: 5MB (prevención de almacenamiento masivo).

---

## 3. ANATOMÍA DE LOS MÓDULOS (ESTADO DEL ARTE)

### 3.1 EL NÚCLEO: Editor & App Shell
*   **Componente:** `App.tsx`, `Editor.tsx`.
*   **Función:** Orquestación de seguridad y edición de texto.
*   **Circuit Breakers:**
    *   La inicialización de Firebase espera explícitamente el token de App Check (`isSecurityReady`) antes de permitir cualquier escucha (`onSnapshot`) en `VaultSidebar` o `TimelinePanel`. Esto previene errores de "Permisos Insuficientes" y estados zombies en la UI.
*   **Zen Mode:** El editor tiene capacidad de ocultar toda la UI periférica para enfoque total.

### 3.2 LA FORJA (RAG Engine)
*   **Componente:** `ForgePanel.tsx`.
*   **Backend:** `chatWithGem`.
*   **Filosofía:** "The Chameleon Protocol". La IA no tiene personalidad propia por defecto; imita el tono, estilo y vocabulario de los documentos recuperados del RAG (`TDB_Index`).
*   **Mecanismo:** Búsqueda semántica híbrida (Vectores + Keywords) para recuperar contexto relevante antes de responder.

### 3.3 EL GUARDIÁN (Canon Radar)
*   **Componente:** `CanonRadar.tsx`.
*   **Backend:** `auditContent`, `checkResonance`.
*   **Función:** Sistema de defensa activo contra la incoherencia.
*   **Triggers:**
    1.  **Hechos:** Contradicciones lógicas (e.j., personaje muerto hablando).
    2.  **Leyes:** Violaciones de reglas del mundo (e.j., magia en zona anti-magia).
    3.  **El Hater:** Detección de "Drift" en la personalidad de los personajes.
*   **Evolución:** Actualmente ocupa el `<main>` completo cuando se activa, desplazando al editor para una auditoría forense del texto.

### 3.4 EL DIRECTOR DE ESCENA (DirectorPanel) - *[CRÍTICO]*
*   **Estado:** **DISFUNCIONAL / CONFLICTO DE DISEÑO**.
*   **Concepto Original (Ideal):** Un **Asistente de Dirección Interactivo**. Una IA proactiva que sugiere ritmos, gestiona el tono de la escena y guía al autor paso a paso, similar a un copiloto de vuelo. (`App.tsx` está preparado para esto, manejando sesiones y paso de mensajes).
*   **Estado Actual (Código):** El componente `DirectorPanel.tsx` actual es meramente un **Overlay de Resonancia Pasivo**. Solo visualiza "Ecos" (coincidencias temáticas) y "Alertas de Estructura" (Midpoint Wall).
*   **La Anomalía:** Esta funcionalidad de "visualizar ecos" fue insertada erróneamente aquí por una planificación previa (Planificador Orcaulo Jul v8.0). Debía pertenecer al **Guardián del Canon**.
*   **Veredicto:** El Director no abre porque el componente espera "Ecos" para renderizarse (`if (!hasContent) return null`), mientras que la App intenta usarlo como chat.
    *   *Futuro:* La funcionalidad de Ecos se mantendrá latente (podría escalar a una visión de "Director que ve conexiones ocultas"), pero la prioridad es refactorizarlo para que cumpla su rol de **Asistente Interactivo** (Chat/Guía).

### 3.5 EL PERFORADOR (World Engine)
*   **Componente:** `WorldEnginePanel.tsx`.
*   **Backend:** `worldEngine`.
*   **Función:** Generador de Lore y Trama basado en Agentes Competitivos.
*   **Los Agentes:**
    *   **Arquitecto (Cyan):** Estructura lógica.
    *   **Oráculo (Purple):** Caos creativo y alucinación.
    *   **Abogado del Diablo (Red):** Crítica y búsqueda de agujeros.
*   **Mecánicas Únicas:**
    *   **Chaos Slider:** Control de entropía (Temperatura del LLM).
    *   **Combat Mode:** Activa una estética agresiva y respuestas más radicales.
    *   **Cristalización:** Convierte nodos efímeros del grafo en archivos Markdown persistentes en Drive.

### 3.6 EL TRIBUNAL (Literary Court)
*   **Componente:** `TribunalPanel.tsx`.
*   **Backend:** `summonTheTribunal`.
*   **Función:** Evaluación crítica tripartita de un texto.
*   **Jueces:** Tres personalidades de IA evalúan el texto simultáneamente y emiten un veredicto y puntuación (1-10).

---

## 4. MÓDULOS EN "SOPORTE VITAL" O DEPRECACIÓN

### 4.1 LA IMPRENTA (ExportPanel)
*   **Estado:** **EN CONSTRUCCIÓN / DESACTIVADO**.
*   **Código:** El archivo existe pero es un "stub" (cascarón vacío).
*   **Función Prevista:**
    *   Compilación del manuscrito final (unir capítulos).
    *   Formateo estándar para industria editorial (Manuscrito Estándar, Guion).
    *   Exportación a PDF/EPUB/DOCX.
*   **Acción:** Se mantiene en la interfaz como promesa de funcionalidad futura, pero actualmente no operativo.

### 4.2 EL LABORATORIO (LaboratoryPanel)
*   **Estado:** **CANDIDATO A ELIMINACIÓN**.
*   **Función Actual:** Interfaz para explorar archivos categorizados en "Canon" (Proyecto) vs "Referencia" (Material externo). Incluye un agente "Bibliotecario" para chatear con las referencias.
*   **Causa de Muerte:** Falta de uso por parte del usuario ("agarrando polvo").
*   **Potencial Latente:** Podría pivotar a ser un gestor de RAG dedicado, permitiendo al usuario "interrogar" libros de referencia (PDFs de historia, manuales técnicos) sin contaminar el contexto creativo principal.

### 4.3 CRONOGRAMA (TimelinePanel)
*   **Estado:** **CANDIDATO A ELIMINACIÓN**.
*   **Función Actual:** Visualización lineal de eventos extraídos por IA (`extractTimelineEvents`) desde los textos, guardados en `TDB_Timeline`.
*   **Problema:** La extracción automática suele ser ruidosa y requiere mucha micro-gestión manual (Aprobar/Descartar eventos), lo que rompe el flujo creativo.
*   **Potencial Latente:** Herramienta vital para sagas de alta complejidad temporal (viajes en el tiempo, historias multigeneracionales).

---

## 5. AUTOPSIA TÉCNICA Y DEUDA (THE MORGUE)

1.  **El Cortocircuito del Director:**
    *   Existe una discrepancia fundamental de tipos y propósito entre `App.tsx` (que espera un `chatInterface`) y `DirectorPanel.tsx` (que es un `notificationOverlay`).
    *   **Solución Requerida:** Reescribir `DirectorPanel.tsx` para aceptar `activeSessionId` y `pendingMessage`, comportándose como una interfaz de chat especializada, y mover la visualización de "Ecos" a un sub-componente o devolverla al Guardián.

2.  **Persistencia Fantasma (Config):**
    *   Aunque se implementó `ProjectConfigContext` (Firestore), todavía quedan vestigios de `localStorage` (`myworld_folder_id`) en `App.tsx` como fallback. Esto debe purgarse para evitar condiciones de carrera donde la configuración local sobrescribe la nube.

3.  **Dependencias Transitivas (Hygiene):**
    *   El build de Vite (`pnpm build`) arroja advertencias sobre dependencias. Se requiere una limpieza profunda de `package.json` ("Hygiene Maintenance") para asegurar la estabilidad a largo plazo.

4.  **Latencia del Guardián:**
    *   `CanonRadar` hace llamadas pesadas a Gemini 1.5 Pro. La UI necesita manejar mejor los estados de "Loading" para no parecer congelada durante auditorías profundas.

---

**NOTA FINAL DEL ARQUITECTO:**
Este sistema es un organismo vivo. Las partes marcadas como "Candidatas a Eliminación" no deben borrarse imprudentemente; su código contiene lógica de interacción con Drive y Firestore que podría ser reutilizada. La prioridad inmediata es la **Reactancia del Director** y la **Estabilidad de la Seguridad (Sentinel)**.
