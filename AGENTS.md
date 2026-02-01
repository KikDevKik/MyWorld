# MANUAL OPERATIVO DE AGENTES (v3.2 - FASE 5)

Este archivo documenta los roles activos de la IA y los protocolos de mantenimiento del sistema.

## 🟢 1. ROLES OPERATIVOS (THE TRINITY)

### A. SENTINEL (El Guardián)
*   **Misión:** Seguridad, Integridad y UI Shell.
*   **Dominio:** `SentinelShell`, `VaultSidebar`, `SentinelStatus`.
*   **Responsabilidades:**
    *   Gestionar el "Titanium Shell" (Layout Zones A/B/C).
    *   Monitorizar la conexión con Google Drive y Firestore.
    *   Alertar sobre fallos de integridad (Missing Index, Auth Failures).

### B. DRIFTER (El Analista)
*   **Misión:** Coherencia y Detección de Desvíos.
*   **Dominio:** `HybridEditor` (CodeMirror), `DirectorPanel`.
*   **Responsabilidades:**
    *   Analizar el texto en tiempo real mediante `driftPlugin` (CodeMirror Extension).
    *   Pintar "Decorations" en el editor (Líneas rojas/naranjas) cuando la IA detecta inconsistencias.
    *   Comunicarse con el `DirectorPanel` para ofrecer soluciones ("Rescue").

### C. JANITOR (El Limpiador)
*   **Misión:** Mantenimiento e Higiene de Datos.
*   **Dominio:** `functions/src/janitor.ts`, `SentinelStatus`.
*   **Responsabilidades:**
    *   **Ghost Detection:** Escanear Drive en busca de archivos vacíos (< 10 bytes) o corruptos.
    *   **The Purge:** Ejecutar borrado duro (Hard Delete) en Drive y Firestore para eliminar artefactos.
    *   Mantener la salud del baúl al 100%.

## 🔵 2. PROTOCOLOS TÉCNICOS

### PROTOCOLO DE ESTADO (Single Source of Truth)
*   El árbol de archivos (`fileTree`) se gestiona exclusivamente en `ProjectConfigContext`.
*   `VaultSidebar` (Zona A) y `SentinelStatus` (Zona C) consumen este mismo contexto.
*   Cualquier cambio en la estructura (Borrado, Creación) debe reflejarse instantáneamente en ambos paneles gracias a la suscripción a Firestore `TDB_Index`.

### PROTOCOLO DE EDITOR (Hybrid Core)
*   Se ha eliminado Tiptap. El único editor activo es **CodeMirror 6** (`HybridEditor`).
*   Los agentes (`DirectorPanel`, `TribunalPanel`) leen el contenido a través del estado `selectedFileContent` en `App.tsx`, el cual se sincroniza en tiempo real con `HybridEditor`.

### PROTOCOLO DE SEGURIDAD (Sentinel Pulse)
*   El sistema verifica la integridad al inicio (`checkSentinelIntegrity`).
*   Si falla, se bloquea el acceso a funciones críticas (Indexado, Chat) y se muestra una alerta en `SentinelStatus`.

## 🟠 3. MEMORIA Y PERSISTENCIA
*   **Nivel 0:** Google Drive (Archivos físicos .md). La verdad absoluta.
*   **Nivel 1:** Firestore `TDB_Index` (Metadatos y Vectores). La memoria de trabajo.
*   **Nivel 2:** Firestore `users/{uid}/profile` (Configuración y Preferencias).
*   **Purga:** Cuando el Janitor elimina un archivo, debe hacerlo en Nivel 0 y Nivel 1 simultáneamente.

## 🟣 4. FUNCIONES DESACTIVADAS (LEGACY / HIBERNACIÓN)

### CRONOGRAMA (Timeline)
*   **Estado:** Desactivado (UI Oculta).
*   **Motivo:** Problemas técnicos pendientes de resolución (Fase de presentación).
*   **Componentes:** `TimelinePanel`, `cronograma` (GemId).
*   **Instrucción:** La lógica y los componentes existen (`src/components/TimelinePanel.tsx`) pero se han eliminado los puntos de acceso en `ArsenalDock` y `FieldManualModal`. Si se requiere reactivar, revertir los cambios en UI.
