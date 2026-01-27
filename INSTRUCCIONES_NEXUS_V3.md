# INSTRUCCIONES MAESTRAS PARA JULES (NEXUS FIX V3)

**CONTEXTO CRÍTICO:**
Este proyecto ha fallado 4 veces consecutivas en implementar correcciones para el sistema "Nexus" debido a conflictos de Git, lógica incompleta en la deduplicación y errores de referencia en el Frontend.
TU MISIÓN ES APLICAR ESTAS CORRECCIONES EN UN SOLO MOVIMIENTO LIMPIO Y PERFECTO.

---

## 1. OBJETIVOS DEL CLIENTE
1.  **Arreglar "Explosión de Duplicados":** El escáner genera 10 tarjetas iguales (ej. "GardenFlowers") en lugar de una sola. Necesitamos que las fusione automáticamente.
2.  **Mejorar Contexto (Alias):** Nexus no sabe que "Madre" es "Elsa". Necesitamos inyectar la lista de personajes existentes en el prompt.
3.  **Arreglar Error de Fusión (Merge):** Cuando Nexus sugiere fusionar, a veces devuelve el NOMBRE ("Anna") en lugar del ID ("char-anna-123"), rompiendo la base de datos.
4.  **Arreglar UI Manual:** El selector manual de "Select Target" crasheaba la app.

---

## 2. BLUEPRINT TÉCNICO (COPIA Y PEGA ESTA LÓGICA)

### A. BACKEND: `functions/src/nexus_scan.ts`

**Cambio 1: Inyección de Roster (Contexto)**
Debes modificar `getProjectRoster` para que incluya explícitamente el ID en el string que le pasamos a la IA.
*   *Formato Requerido:* `- Nombre (Tipo) [Aliases: ...] [ID: xxxxx]`
*   *Prompt del Juez:* Añade una instrucción: "CRITICAL: 'mergeWithId' MUST BE THE ID IN BRACKETS (e.g., '12345'). DO NOT RETURN THE NAME."

**Cambio 2: Deduplicación Post-Procesamiento (El arreglo de "GardenFlowers")**
Después de recibir los candidatos de la IA, debes iterar sobre ellos y agruparlos por nombre normalizado.
*   **REGLA DE ORO 1 (Agregación):** Si encuentras un duplicado, NO descartes su descripción. Súmala a la descripción del ganador:
    ```typescript
    existing.description += `\n\n[Alternative View]: ${candidate.description}`;
    ```
*   **REGLA DE ORO 2 (Preservación de ID):** Si el candidato perdedor tiene un `mergeWithId` y el ganador no, ¡COPIA EL ID AL GANADOR! No pierdas la sugerencia de fusión.
*   **REGLA DE ORO 3 (Mejora de Datos):** Si el nuevo candidato tiene mayor confianza, sobrescribe `type`, `subtype` y `name` (para mejor capitalización), pero mantén la descripción acumulada.

---

### B. FRONTEND: `src/components/WorldEngineV2/WorldEnginePageV2.tsx`

**Cambio 3: Fallback de Fusión (El arreglo de "Anna")**
En la función `handleTribunalAction`, dentro del bloque `if (candidate.suggestedAction === 'MERGE')`:
1.  Intenta obtener el documento usando `candidate.mergeWithId`.
2.  **SI NO EXISTE ( !docSnap.exists() ):**
    *   Llama a `await resolveNodeId(candidate.mergeWithId, ...)` para buscar el ID real usando el nombre.
    *   Si lo encuentras, usa ese nuevo ID. Si no, lanza error.
    *   *Por qué:* Esto salva la operación cuando la IA ignora la instrucción de usar IDs.

**Cambio 4: Conexión del Modal**
En el `render` (return) del componente, asegúrate de pasar estas props a `<NexusTribunalModal />`:
*   `existingNodes={unifiedNodes}` (Para que la lista desplegable tenga datos).
*   `onUpdateCandidate={handleUpdateCandidate}` (Define esta función si no existe: `(id, updates) => setCandidates(...)`).

---

### C. UI: `src/components/WorldEngineV2/NexusTribunalModal.tsx`

**Cambio 5: Selector Manual y Fix de Crash**
*   Asegúrate de que el botón de acción ("MERGE/APPROVE") no use una IIFE compleja que cause `ReferenceError`. Define la función `handleClick` fuera del JSX.
*   En el dropdown de "Select Merge Target", al hacer click en una opción, llama a `onUpdateCandidate` pasando:
    *   `mergeWithId`: El ID del nodo seleccionado (NO el nombre).
    *   `mergeTargetName`: El nombre del nodo (para visualización).
    *   `suggestedAction`: 'MERGE'.

---

## 3. PLAN DE EJECUCIÓN SUGERIDO

1.  **Backend Primero:** Aplica los cambios en `nexus_scan.ts`. Ejecuta `cd functions && npm run build` para asegurar que no hay errores de sintaxis.
2.  **Frontend Lógica:** Aplica los cambios en `WorldEnginePageV2.tsx`.
3.  **Frontend UI:** Aplica los cambios en `NexusTribunalModal.tsx`.
4.  **Verificación:** Ejecuta `npm run build` (o `pnpm tsc`) en la raíz para confirmar que las props (`existingNodes`, `onUpdateCandidate`) coinciden entre el padre y el hijo.

**NOTA FINAL:** No intentes hacer "merge" de ramas viejas. Aplica estos cambios sobre una base limpia (`main` o `develop`).
