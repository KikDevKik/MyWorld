# Auditoría y Blueprint del Ciclo de Vida de Entidad (Proyecto Titanium)

**Estado:** Borrador (Fase de Diseño)
**Fecha:** 2026-05-21
**Autor:** Jules (Chief Architect Persona)
**Objetivo:** Transición de "Cosmetic Headers" a "Functional Ontology" con Integridad Bidireccional.

---

## 1. El Diagnóstico: Entropía Estructural

El sistema actual sufre de una disonancia fundamental entre cómo se *crean* los datos y cómo se *consumen*.

### Hallazgos Críticos (Trace-to-Root)

1.  **La Fuga de la Factoría (`forgeToolExecution`):**
    *   **Ubicación:** `functions/src/index.ts`
    *   **Problema:** Esta función crea archivos Markdown directamente usando `drive.files.create` con `media.body = content`. **Omite completamente `TitaniumFactory.forge`**.
    *   **Consecuencia:** Los archivos creados por herramientas de IA (que no sean el Escriba) no tienen el esquema estandarizado, ni `_sys`, ni metadatos garantizados. Son "Archivos Salvajes".

2.  **Taxonomía Rígida (`genesisManifest` y `crystallizeGraph`):**
    *   **Ubicación:** `functions/src/genesis.ts`, `functions/src/crystallization.ts`
    *   **Problema:** Dependen de mapas hardcodeados (`TYPE_ROLE_MAP`, `TYPE_SOUL`) que vinculan cadenas de texto específicas ("character", "beast") a carpetas físicas.
    *   **Consecuencia:** Bloquea la evolución hacia un sistema basado en capacidades (Traits). Si una entidad es "Semi-Dios" (Character + Location), el sistema actual colapsa o la fuerza a una sola carpeta.

3.  **Dependencia Visual (`NexusCanvas.tsx`):**
    *   **Ubicación:** `src/components/NexusCanvas.tsx`
    *   **Problema:** La lógica de renderizado (Colores, Iconos) y la física (d3-force radial grouping) leen directamente `node.type`.
    *   **Consecuencia:** Eliminar el campo `type` rompería la visualización inmediatamente (nodos grises, sin agrupación).

4.  **Datos Fantasma (Metadata Bloat):**
    *   **Ubicación:** Colección `users/{uid}/characters`
    *   **Problema:** Campos como `status`, `tier`, `sourceType` existen en la raíz del documento, mezclados con datos creativos. `age` y `avatar` a menudo están vacíos o son redundantes con el Markdown.
    *   **Guardian:** El sistema de auditoría (`guardian.ts`) ignora estos campos estructurados y prefiere re-leer el `bio` o texto completo, probando que los campos estructurados son "ruido" para la IA.

---

## 2. El Blueprint: Ontología Funcional (Titanium 2.0)

Proponemos un cambio de "Identidad Nominal" (Qué es) a "Identidad Funcional" (Qué hace).

### La Interfaz Universal (`TitaniumEntity`)

```typescript
export type EntityTrait =
    | 'sentient'    // Tiene agencia, psicología (Personajes, IAs)
    | 'location'    // Tiene coordenadas, atmósfera (Lugares)
    | 'artifact'    // Es un objeto tangible (Items)
    | 'faction'     // Es un grupo social (Gremios)
    | 'event'       // Ocurre en el tiempo (Escenas)
    | 'concept'     // Abstracto (Leyes, Lore)
    | 'document';   // Archivo puro (Capítulos)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista)
    name: string;        // Nombre Canónico

    // 🚀 THE TRUTH: Lo que la entidad PUEDE hacer
    traits: EntityTrait[];

    // 🛡️ THE BRIDGE: Compatibilidad hacia atrás (Derivado de Traits)
    // Se mantiene temporalmente para NexusCanvas y WorldEngine
    type: string;

    attributes: {
        role?: string;       // Descripción corta (ej. "Capitán")
        aliases?: string[];
        tags?: string[];

        // 🗑️ GHOST DATA MOVED TO _SYS OR DELETED
        // age: string; -> ELIMINADO (Pertenece al Body/Bio)
        // avatar: string; -> ELIMINADO (Pertenece a Frontmatter visual)

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT' | 'GHOST';
            last_sync: string;
            schema_version: '2.0';
            source_tool: 'scribe' | 'forge' | 'genesis';
        };
    };

    bodyContent: string; // Markdown Soberano
}
```

### El Puente de Compatibilidad (The Bridge)

La `TitaniumFactory` implementará un "Auto-Derivador" para mantener vivas las herramientas legacy mientras migramos:

- Si `traits` incluye `'sentient'` -> `type = 'character'`
- Si `traits` incluye `'location'` -> `type = 'location'`
- Si `traits` incluye `'faction'` -> `type = 'faction'`

Esto permite que `NexusCanvas` siga coloreando nodos sin cambios inmediatos en el frontend.

---

## 3. Arquitectura "Smart-Sync" (Integridad Bidireccional)

Actualmente, `scribePatchFile` intenta esto pero es frágil. La nueva arquitectura será:

**Regla de Oro:** El Markdown (Body) es la Fuente de la Verdad Creativa. El YAML (Frontmatter) es la Fuente de la Verdad del Sistema.

### Lógica del Middleware:
1.  **Lectura:** Al leer un archivo, si el Frontmatter difiere del `_sys` en base de datos, gana el Archivo (Drive Authority).
2.  **Escritura (Patching):**
    *   AI genera el contenido.
    *   **Validator:** Extrae H1 (`# Name`) y Blockquote (`> *Role*`).
    *   **Reconciliación:** Si el H1 cambió, actualiza automáticamente el campo `name` en el Frontmatter y en Firestore (`TDB_Index`).
    *   **Protección:** Las áreas `<!-- SOVEREIGN START -->` son intocables por la IA.

---

## 4. Plan de Poda (Metadata Pruning)

Campos a eliminar de la raíz de Firestore (`characters` y `forge_detected_entities`) y del Frontmatter visible:

| Campo | Acción | Justificación |
| :--- | :--- | :--- |
| `age` | **Eliminar** | Dato narrativo, pertenece al texto (Bio). |
| `status` | Mover a `_sys` | Dato de sistema, no creativo. |
| `tier` | Mover a `_sys` | Dato de sistema. |
| `sourceType` | Mover a `_sys` | Dato de debug. |
| `sourceContext` | Eliminar | Redundante con `saga` o `project_id`. |
| `avatar` | Mantener en Frontmatter (Opcional) | Visual, pero no crítico para RAG. |
| `isGhost` | Mover a `_sys.tier` | Unificar estado. |

---

## 5. Estrategia de Ejecución (Fases)

### Fase 1: El Núcleo (Factory Upgrade)
- Refactorizar `TitaniumFactory` para soportar `traits` y `_sys`.
- Implementar la lógica "Bridge" (Type Derivation).
- Actualizar `scribeCreateFile` para usar el nuevo esquema.

### Fase 2: Sellado de Fugas (Tool Fixes)
- **Crítico:** Reescribir `forgeToolExecution` para que use `TitaniumFactory` en lugar de escritura cruda.
- Actualizar `genesisManifest` y `crystallizeGraph` para enviar `traits` a la factoría en lugar de `type` (aunque la factoría lo soporte, debemos limpiar la entrada).

### Fase 3: Limpieza del Frontend (Visual Update)
- Actualizar `NexusCanvas.tsx` para leer `node.traits` para los estilos, eliminando la dependencia de strings hardcodeados.
- Actualizar `LaboratoryPanel` para filtrar por `traits` en lugar de carpetas/categorías rígidas.

### Fase 4: La Gran Migración (Baptism V2)
- Script para recorrer todos los archivos existentes, leer su Frontmatter legacy, y re-escribirlos con el bloque `_sys` y los `traits` inferidos.

---

## 6. Análisis de Riesgos Técnicos (Ciclos y Carreras)

### 6.1. El Bucle "Echo Audit" (Scribe vs Guardian)
*   **Riesgo:** `scribePatchFile` modifica un archivo -> Trigger `onWrite` (hipotético futuro) -> `Guardian` audita -> Guardian actualiza metadatos -> Trigger dispara `scribePatchFile`.
*   **Mitigación:**
    *   Implementar **"Writer Lock"**: Si el cambio proviene del `User ID` del sistema (AI), el trigger de auditoría debe ignorarlo o usar un debounce agresivo (5000ms, ya existente en `scribe.ts`).
    *   **Timestamp Check:** `Guardian` solo debe auditar si `last_titanium_sync` > `last_audit_timestamp`.

### 6.2. La Carrera del "Soul Sorter" (Forja de Almas)
*   **Riesgo:** El usuario edita el Markdown manualmente. Al mismo tiempo, `soul_sorter` corre un escaneo programado y sobrescribe los metadatos basándose en una versión vieja del caché.
*   **Mitigación:**
    *   **Autoridad de Hash:** `soul_sorter` debe calcular el hash del contenido actual antes de escribir. Si el hash difiere del `last_known_hash` en Firestore, ABORTA la escritura y marca la entidad como `dirty` para re-escaneo.
    *   **Flag `isAIEnriched`:** Si el usuario edita manualmente un campo protegido (ej. Role), este flag debe pasar a `false`. La IA tiene prohibido sobrescribir si `isAIEnriched === false`.

---

**Siguiente Paso:** Implementar la Fase 1 (Factory Upgrade).
