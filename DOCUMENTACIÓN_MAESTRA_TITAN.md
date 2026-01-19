DOCUMENTACIÓN TÉCNICA MAESTRA V4 - PROYECTO MYWORLD (TITAN)
===========================================================
**Fecha:** 19 de Enero de 2026
**Versión:** 4.0 (Titanium Shell)
**Estado:** OPERATIVO / VIGILANCIA ACTIVA
**Codename:** SENTINEL / PERIMETER SECURE
---
## 1. INTRODUCCIÓN Y PROPÓSITO: LA CAJA NEGRA
Este documento constituye la "Fuente de Verdad" definitiva y técnica para el proyecto MyWorld. Su propósito es servir como memoria eidética para el equipo de desarrollo, restaurando el contexto completo de la arquitectura, decisiones de diseño, protocolos de seguridad paranoica y el estado real de cada módulo.
**MyWorld** no es un simple editor de texto; es un **Entorno de Desarrollo Integrado (IDE) para Narrativa Compleja**, diseñado para asistir a arquitectos literarios mediante una simbiosis profunda con Inteligencia Artificial.
---
## 2. CIMIENTOS DEL SISTEMA (ARQUITECTURA TITAN)
### 2.1 Stack Tecnológico (The Iron Core)
* **Frontend:** React 18 + Vite (SPA). Arquitectura modular estricta.
* **Estilos:** TailwindCSS v4 ("Titanium Dark Theme"). Diseño enfocado en inmersión total ("Zen Mode").
* **Backend:** Firebase Cloud Functions v2 (Node.js 22). Arquitectura Serverless.
* **Base de Datos:**
    * **Firestore (NoSQL):** Metadatos, Sesiones, Índices Vectoriales (TDB_Index), Cronogramas (TDB_Timeline).
    * **Google Drive API v3:** **Nivel 0 de Verdad**. El sistema de archivos real.
* **Inteligencia Artificial (Neural Link):**
    * **Motor Lógico (Velocidad):** Google Gemini 2.0 Flash (Director, Chat Interactivo, Tareas Rápidas).
    * **Motor Creativo (Alto Razonamiento):** Google Gemini 2.5 Pro (Analyst, Tribunal, Deep Resonance, Style DNA).
    * **Agentes Virtuales:** El Bibliotecario, El Tribunal (Triple Persona), El Director.
### 2.2 Jerarquía de la Verdad (Data Flow)
El sistema opera bajo una estricta jerarquía de datos para evitar la corrupción narrativa:
1. **Nivel 0 (Físico - Inmutable):** Los archivos `.md` en Google Drive. Si no está en Drive, no existe.
2. **Nivel 1 (Índice Vectorial):** Colección `TDB_Index` en Firestore. Fragmentos ("chunks") vectorizados del contenido de Drive para RAG.
3. **Nivel 2 (Metadatos Derivados):** Colecciones `users/{uid}/characters` y `TDB_Timeline`. Análisis enriquecido por IA.
4. **Nivel 3 (Estado Cliente - Global):** Store de Zustand (`useLayoutStore`). La verdad única de la UI (Layout, Director Mode).
5. **Nivel 4 (Sesión Volátil):** Estado de React y Contextos efímeros (`ProjectConfigContext`).
### 2.3 Protocolo SENTINEL (Seguridad Paranoica)
MyWorld opera bajo una doctrina de "Cero Confianza" (Zero Trust) para proteger la Propiedad Intelectual.
* **Hard Handshake:** Todas las Cloud Functions (`onCall`) exigen `enforceAppCheck: true`.
* **ReCAPTCHA v3 Enterprise:** Verificación invisible de humanidad en cada interacción crítica.
* **Fail-Fast UI:** `App.tsx` (Shell) implementa un "Circuit Breaker". Si el handshake falla, la UI colapsa a una pantalla de bloqueo.
* **Límites Anti-DoS (The Dam):**
    * `MAX_AI_INPUT_CHARS`: 100k caracteres.
    * `MAX_FILE_SAVE_BYTES`: 5MB.
---
## 3. ANATOMÍA DE LOS MÓDULOS (ESTADO OPERATIVO)
### 3.1 EL NÚCLEO: Editor & App Shell
* **Componente:** `App.tsx` (Shell), `HybridEditor.tsx` (CodeMirror 6).
* **Estado:** **ACTIVO**.
* **Función:** Orquestación de seguridad y edición de texto distracción-free.
* **Características:** Zen Mode (colapso de zonas A y C), soporte para Markdown, resaltado de sintaxis.
### 3.2 LA FORJA (RAG Engine)
* **Componente:** `ForgePanel.tsx`.
* **Backend:** `chatWithGem`.
* **Estado:** **ACTIVO**.
* **Filosofía:** "The Chameleon Protocol". La IA imita el tono del proyecto.
* **Mecanismo:** Búsqueda semántica híbrida (Vectores + Keywords).
### 3.3 EL GUARDIÁN (Canon Radar)
* **Componente:** `CanonRadar.tsx`.
* **Backend:** `auditContent`, `enrichCharacterContext`, `checkResonance`.
* **Estado:** **ACTIVO / VIGILANCIA**.
* **Función:** Sistema de defensa activo contra la incoherencia y enriquecimiento de contexto de personajes.
### 3.4 EL DIRECTOR DE ESCENA (DirectorPanel)
* **Componente:** `DirectorPanel.tsx`.
* **Backend:** `chatWithGem`, `purgeEcho`, `rescueEcho`, `analyzeStyleDNA` (Inspector).
* **Estado:** **OPERATIVO**.
* **Funcionalidad Elástica (Responsive):**
    * **Modo Sentinel (<500px):** Panel chat puro, tools ocultas.
    * **Modo Strategist (500-900px):** Panel con barra de herramientas lateral (Inspector, Tribunal, Memoria).
    * **Modo War Room (>900px):** Grid de 3 columnas (Sesiones | Chat | Herramientas).
* **Características:**
    * Chat interactivo con personalidad de Director.
    * Gestión de Alertas de Drift (Score Visual).
    * **Inspector Integrado:** Botón para invocar `forgeAnalyzer` (Style DNA/Elenco).
    * **Archivos de Sesión:** Drawer deslizante para recuperar contextos pasados.
### 3.5 EL PERFORADOR (World Engine)
* **Componente:** `WorldEnginePanel.tsx`.
* **Backend:** `worldEngine`.
* **Estado:** **ACTIVO**.
* **Función:** Generador de Lore y Trama con agentes competitivos (Arquitecto, Oráculo, Abogado del Diablo).
### 3.6 EL TRIBUNAL (Literary Court)
* **Componente:** `TribunalPanel.tsx`.
* **Backend:** `summonTheTribunal` (Gemini 2.5 Pro).
* **Estado:** **ACTIVO**.
* **Función:** Evaluación crítica tripartita (Arquitecto, Bardo, Hater) con puntuación numérica (1-10).
### 3.7 LA IMPRENTA (ExportPanel)
* **Componente:** `ExportPanel.tsx`.
* **Backend:** `compileManuscript`.
* **Estado:** **OPERATIVO / BETA**.
* **Función:** Compilación de manuscritos PDF.
* **Características:**
    * UI "Split-View" (Árbol de Selección vs Ajustes).
    * **Smart Breaks:** Detección automática de capítulos basada en headers Markdown.
    * Inyección de Metadatos (Título, Autor).
### 3.8 EL LABORATORIO (LaboratoryPanel)
* **Componente:** `LaboratoryPanel.tsx`.
* **Estado:** **ACTIVO**.
* **Función:** Gestor de Referencias y Biblioteca. Chat con "El Bibliotecario" (`_RESOURCES`).
### 3.9 CRONOGRAMA (TimelinePanel)
* **Componente:** `TimelinePanel.tsx`.
* **Backend:** `extractTimelineEvents`.
* **Estado:** **ACTIVO**.
* **Función:** Extracción y visualización de eventos temporales.
---
## 4. ANÁLISIS DE BRECHAS Y DEUDA TÉCNICA (GAP ANALYSIS)
### 4.1 UI Faltante: El Inspector (`forgeAnalyzer`)
* **Estado:** **RESUELTO**. Integrado en `DirectorTools` (Botón Lupa/Inspector).
### 4.2 Visualización de Drift (The Guardian) - [BRECHA CRÍTICA]
* **Estado:** **NO OPERATIVO / ROTO**.
* **Diagnóstico:** El plugin del editor (`driftPlugin.ts`) marca erróneamente la primera línea completa del documento al recibir alertas.
* **Requerimiento:** Se requiere una implementación visual granular que soporte:
    1.  Detección de incoherencias de trama (Drift semántico).
    2.  **Corrección Gramatical:** Detección de errores ortográficos (typos), mala puntuación y sintaxis.
    3.  Subrayado preciso (wavy underline) en el rango exacto del error, no en la línea completa.
### 4.3 Persistencia y Limpieza
* **Diagnóstico:** Migración a Firestore mayormente completa. Limpieza de `package.json` pendiente.
---
## 5. PROTOCOLO DE FUNCIONES INVISIBLES (SENTINEL BACKLOG)
1. **Manifiesto de Migración (Logs):** Historial de sistema visible solo en Drive (`_SYSTEM_LOGS`).
2. **ADN del Proyecto (Centroide):** Cálculo vectorial del "centro" del proyecto. Invisible al usuario.
3. **Estado de Salud Sentinel:** Dashboard de seguridad detallado pendiente.
---
## 6. PROTOCOLOS DE DESPLIEGUE Y MANTENIMIENTO
### 6.1 Protocolo del Silo (Backend Isolation)
* **Independencia:** `functions/` es aislado.
* **Gestor:** `npm` obligatorio en `functions/` (NO `pnpm`).
* **Compilación:** `npm run build` mandatorio antes de deploy.
### 6.2 Ghost Access (Modo Fantasma)
* **Variable:** `VITE_JULES_MODE='true'`.
* **Efecto:** Bypasea Auth y Drive para dev offline.
### 6.3 Protocolo Janitor
* **Estrategia:** "Backend-First". Limpieza vía `scanVaultHealth`.
* **Límite:** 50 archivos por ejecución.
---
## 7. SUGERENCIAS PARA EFICIENCIA Y FUTURO
Para maximizar el rendimiento y optimizar el gasto (Tokens/Costos), se proponen las siguientes mejoras técnicas:
1.  **Estandarización de Modelos AI:** Centralizar la configuración de modelos en `ai_config.ts`. Actualmente `analyst.ts` tiene hardcoded `gemini-2.5-pro`. Debe unificarse para evitar "Model Drift" y facilitar actualizaciones globales.
2.  **Caché de Drive (Style DNA):** La función `analyzeStyleDNA` descarga streams completos de archivos en cada ejecución. Se sugiere implementar un sistema de caché temporal (Redis o Firestore efímero) o hash-check para no re-descargar archivos que no han cambiado, reduciendo latencia y cuota de Drive API.
3.  **Auditoría Tailwind 4.0:** Verificar que el motor de estilos esté utilizando las nuevas capacidades de compilación JIT nativa de v4 para reducir el tamaño del bundle final CSS.

---
**FIN DE TRANSMISIÓN**
**AUTORIDAD:** JULES (SENTINEL AI)
**FECHA:** 19/01/2026
