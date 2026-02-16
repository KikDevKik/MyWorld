# TITANIUM BLUEPRINT: PROTOCOLO DE ENTIDAD UNIFICADA

## 🏗️ Introducción: La Crisis de la Verdad
El ecosistema actual sufre de entropía estructural. La "Fuente de la Verdad" está fracturada entre el Frontmatter (YAML), el contenido del cuerpo (Markdown) y el índice de Firestore (`TDB_Index`).

---

## 🔍 FASE 1: AUDITORÍA SISTÉMICA PROFUNDA

### 1. Puntos de Entrada de Creación (Creation Entry Points)
Hemos rastreado la lógica de creación en `functions/src`:

*   **`scribeCreateFile` (`scribe.ts`)**:
    *   Utiliza `generateAnchorContent` (`templates/forge.ts`) que impone una estructura rígida.
    *   Infiere el tipo (`type`) usando IA, pero si falla, recurre a `character` por defecto.
    *   **Problema:** Asigna metadatos "fantasma" (`age`, `class`, `race`) que a menudo quedan vacíos o como "Unknown", consumiendo tokens inútilmente.

*   **`crystallizeGraph` (`crystallization.ts`)**:
    *   Utiliza `generateAnchorContent`.
    *   Si el nodo no tiene tipo, asigna `concept` (o `character` en `crystallizeForgeEntity`).
    *   **Problema:** La lógica de "Adopción" (`Adopt existing entity`) es robusta para prevenir duplicados, pero no actualiza la taxonomía si el rol de la entidad cambia.

*   **`genesisManifest` (`genesis.ts`)**:
    *   Implementa una extracción estricta (`TYPE_SOUL`, `TYPE_BEAST`, etc.).
    *   **Problema:** Hardcodea valores por defecto (`age: Desconocida`, `role: NPC`) que ensucian el contexto desde el nacimiento del archivo.

*   **`forgeToolExecution` (`index.ts`)**:
    *   Recibe `title` y `content` crudos y escribe directamente en Drive.
    *   **Fallo Crítico:** No utiliza `generateAnchorContent` ni impone ninguna validación de esquema. Si la IA que llama a esta herramienta no incluye Frontmatter explícitamente, el archivo nace "desnudo" (sin metadatos), rompiendo la indexación semántica.

### 2. La Lógica de Parcheo (`scribePatchFile`)
*   **Hallazgo Crítico:** En `scribe.ts`, la función `scribePatchFile` instruye explícitamente a la IA:
    > "PRESERVE Frontmatter (--- ... ---) exactly as is."
*   **Consecuencia:** Esto garantiza la **Crisis de la Fuente de la Verdad**. Si el cuerpo del texto evoluciona (ej. el personaje muere), el Frontmatter sigue diciendo `status: active`. La IA posterior se confunde al leer contradicciones.

### 3. Consumo de Datos (`Data Consumption`)
*   **`useDirectorChat` (`src/hooks/useDirectorChat.ts`)**:
    *   Inyecta `activeFileContent` (texto crudo) al contexto de la IA.
    *   **Fallo:** La IA lee el Frontmatter desactualizado y el cuerpo nuevo, causando alucinaciones sobre el estado real de la entidad.
*   **`ingestFile` (`functions/src/ingestion.ts`)**:
    *   Calcula hash del contenido (`contentHash`) para detectar cambios.
    *   **Fallo:** Solo actualiza metadatos básicos (`name`, `path`). **No re-analiza** el contenido para actualizar `role`, `tags` o `type` en Firestore. El índice se vuelve obsoleto rápidamente.

---

## 📐 FASE 2: EL BLUEPRINT UNIFICADO

### 1. La Interfaz de Entidad Universal (`TitaniumEntity`)
Proponemos reemplazar las definiciones rígidas (`AnchorTemplateData`) por un sistema basado en **Rasgos (Traits)**.

```typescript
// src/types/titanium.ts (Propuesta)

export type EntityKind = 'agent' | 'place' | 'object' | 'concept' | 'event';

export interface TitaniumEntity {
    // Identidad Nuclear
    id: string;          // Nexus ID (Hash determinista del path)
    name: string;        // El nombre visible (Handle)
    kind: EntityKind;    // Categoría ontológica amplia

    // Sistema de Capacidades (Lo que PUEDE HACER)
    capabilities: string[]; // e.g., ["speaks", "inv_holder", "combative", "moveable"]

    // Atributos Flexibles (Lo que ES)
    attributes: Record<string, string | number | boolean>;
    // Ejemplo: { "hp": 100, "faction": "Rebels", "visibility": "hidden" }

    // Metadatos de Sistema
    tags: string[];      // Para filtrado rápido (e.g., "Main Cast", "Draft")
    aliases: string[];   // Para link-healing
    version: number;     // Para control de concurrencia
}
```

### 2. El Middleware "Smart-Sync"
Necesitamos un intermediario que garantice la **Integridad Bidireccional**.

**Flujo Propuesto (On-Save / Post-Patch):**
1.  **Ingesta:** Recibir el contenido Markdown completo.
2.  **Extracción Funcional:** Una "IA Ligera" (Gemini Flash) extrae los hechos clave del cuerpo (Rol, Estado, Alias).
3.  **Comparación:**
    *   Si `Body.Role != Frontmatter.Role` -> **Actualizar Frontmatter**.
    *   Si `Frontmatter != Firestore` -> **Actualizar Firestore**.
4.  **Escritura Atómica:** Si hubo cambios en Frontmatter, reescribir el archivo (con cuidado de bucles).

### 3. Poda de Metadatos (`Metadata Pruning`)
Lista de campos a eliminar del Frontmatter y Templates:

*   ❌ `age`: Irrelevante para la mayoría de entidades no humanas o inmortales. Mover a `attributes` si es crítico.
*   ❌ `class`: Término de RPG obsoleto. Usar `role` o `tags`.
*   ❌ `race`: Demasiado específico de fantasía. Usar `attributes['species']` si es necesario.
*   ❌ `status`: Eliminar 'active'. Solo marcar 'archived' o 'deceased' si es relevante.
*   ✅ **Mantener:** `role`, `tags`, `aliases`, `id`.

### 4. Estandarización entre Herramientas
Para resolver la fragmentación entre `scribe`, `genesis`, `forge` y `worldEngine`:

*   **Propuesta:** Crear una clase estática `TitaniumFactory` en `functions/src/services/factory.ts`.
*   **Responsabilidad:** Centralizar la lógica de `generateAnchorContent`.
*   **Método Único:** `TitaniumFactory.forge(entity: TitaniumEntity): string`
    *   Esta función será la **única** autorizada para generar strings Markdown con Frontmatter.
    *   `scribeCreateFile`, `genesisManifest`, `crystallizeGraph` y `forgeToolExecution` deberán migrar a usar este método.
    *   Esto garantiza que **todos** los archivos nazcan con el mismo ADN estructural, independientemente de qué herramienta los creó.

### 5. Áreas Soberanas Humanas
Para preservar la voz del autor, la IA tiene prohibido reescribir:

*   **Soberanía Absoluta:** Cualquier bloque de texto narrativo bajo `## Descripción` o `## Historia` que no haya sido explícitamente marcado para "Refactorización".
*   **Zona de IA:** El bloque `> *Role*` (Cita de rol) y el Frontmatter YAML. La IA *debe* mantener estos sincronizados con la narrativa.

---

## ⚠️ FASE 3: MITIGACIÓN DE DEUDA TÉCNICA

### Riesgo de Dependencia Circular (`onSnapshot`)
*   **El Problema:** Si `Smart-Sync` detecta que el YAML está desactualizado y reescribe el archivo en Drive, esto disparará un nuevo evento `change` en Drive -> `onSnapshot` en el Frontend -> Recarga del Editor.
*   **El Riesgo:** Si el usuario está escribiendo, su cursor saltará o perderá cambios no guardados.
*   **Solución:**
    1.  **Sincronización Silenciosa:** Actualizar Firestore **sin** tocar el archivo físico si la discrepancia es menor (solo metadatos de búsqueda).
    2.  **Bloqueo de Escritura:** Usar `lastUpdated` timestamp para ignorar actualizaciones que ocurrieron hace < 2 segundos (debounce).
    3.  **Optimistic UI:** El Frontend asume que el YAML está "sucio" y lo ignora en favor de su estado local hasta que se confirme la sincronización.
