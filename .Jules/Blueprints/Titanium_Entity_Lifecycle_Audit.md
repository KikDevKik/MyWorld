# 🏗️ Titanium Entity Lifecycle Audit & Unified Blueprint
> **Fecha:** 2026-02-25
> **Autor:** The Chief Architect
> **Estado:** Implemented (Titanium V3.0)
> **Directiva:** Unificar la ontología funcional y eliminar la entropía estructural.

---

## 🔍 Fase 1: Auditoría Sistémica Profunda (The Deep Audit)

El sistema actual sufre de "Fragmentación de Esquema". Múltiples herramientas crean archivos, pero cada una sigue sus propias reglas, ignorando la "Fuente de la Verdad" (`TitaniumFactory`).

### 1. Puntos de Creación (Entry Points)
He rastreado la ejecución de cada herramienta y estos son los hallazgos críticos:

| Herramienta | Archivo Fuente | Estado | Hallazgo Crítico |
| :--- | :--- | :--- | :--- |
| **`forgeToolExecution`** | `functions/src/index.ts` | ✅ **CORREGIDO** | Ahora usa `TitaniumFactory.forge` para crear entidades con el esquema correcto (V3.0). |
| **`forgeToDrive`** | `functions/src/index.ts` | ❌ **CRÍTICO** | (Legacy) Convierte chats a Markdown. Pendiente de refactorización final si se sigue usando. |
| **`scribeCreateFile`** | `functions/src/scribe.ts` | ✅ **CORREGIDO** | Refactorizado para usar `TitaniumFactory` y `traits` V3.0. |
| **`genesisManifest`** | `functions/src/genesis.ts` | ✅ **CORREGIDO** | Refactorizado para usar `TitaniumFactory` y dejar de inyectar "Ghost Data" manualmente. |
| **`syncWorldManifest`** | `functions/src/index.ts` | ❌ **CRÍTICO** | (Legacy Scanner) Aún usa taxonomía hardcodeada. Requiere migración a un sistema basado en traits en el futuro. |
| **`syncCharacterManifest`** | `functions/src/index.ts` | ⚠️ RIESGO | (Legacy Scanner) Actualiza Firestore. Se mitiga parcialmente con el "Truth Shield" (Content Hash). |

### 2. Lógica de Parcheo (`scribePatchFile`)
La función `scribePatchFile` en `functions/src/scribe.ts` contenía la semilla del "Smart-Sync".
- **Solución:** Se ha extraído la lógica a `SmartSyncService` (`functions/src/services/smart_sync.ts`), centralizando la protección de Áreas Soberanas y la reconciliación.

### 3. Consumo de Datos (Ghost Data)
El análisis de `functions/src/services/factory.ts` reveló que la política "Anti-Makeup" era insuficiente.
- **Solución:** `TitaniumFactory` V3.0 implementa una poda agresiva de metadatos basura (`age: unknown`, etc.) y mueve los campos del sistema a un bloque `_sys`.

---

## 🏛️ Fase 2: El Plano Unificado (The Unified Blueprint)

### 1. La Interfaz Universal (Traits sobre Tipos)
Se ha abandonado `type: character` como fuente de verdad única. La entidad se define por sus **Traits** (Rasgos Funcionales).

```typescript
// functions/src/types/ontology.ts

export type EntityTrait =
    | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs)
    | 'locatable'   // Tiene coordenadas, clima (Lugares, Planetas)
    | 'tangible'    // Es un objeto físico (Items, Artefactos)
    | 'temporal'    // Ocurre en el tiempo (Eventos, Escenas)
    | 'organized'   // Es un grupo (Facciones, Gremios)
    | 'abstract';   // Conceptos (Leyes, Magia)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista)
    name: string;        // Nombre Canónico
    traits: EntityTrait[]; // 🚀 EL NÚCLEO

    attributes: {
        role?: string;      // Rol Narrativo (ej. "Antagonista")
        aliases?: string[]; // Búsqueda difusa
        tags?: string[];    // Taxonomía flexible

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived' | 'ghost';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string; // ISO Date
            schema_version: '3.0'; // Titanium V3
            nexus_id?: string;
        };
    };

    bodyContent: string; // Markdown Soberano
}
```

### 2. El Middleware "Smart-Sync"
Se ha creado `SmartSyncService` en `functions/src/services/smart_sync.ts`:

1.  **Input:** Contenido Markdown (Raw) + Nuevos Metadatos (Parcial).
2.  **Proceso:**
    *   Protege bloques `<!-- SOVEREIGN START -->`.
    *   Extrae H1 y Blockquotes del Body (AST Analysis).
    *   Detecta cambios en Frontmatter vs Body.
    *   **Regla de Oro:** Si el Humano editó el Texto, el Texto gana. Si la IA editó el YAML, el YAML gana.
3.  **Output:** Llamada a `TitaniumFactory.forge()` con la entidad reconciliada.

### 3. Poda de Metadatos (Metadata Pruning - The Kill List)
Se han eliminado permanentemente del nivel raíz:

*   ❌ `status` (Movido a `_sys.status`)
*   ❌ `type` (Movido a `_sys.legacy_type` solo para compatibilidad)
*   ❌ `created_at` (Eliminado)
*   ❌ `updated_at` (Reemplazado por `_sys.last_sync`)
*   ❌ `age` (Si es "unknown", eliminado)
*   ❌ `id` (Movido a `_sys.nexus_id`)

### 4. Estandarización Cruzada (Cross-Tool Standardization)
Todas las herramientas (`forgeToolExecution`, `genesisManifest`, `scribeCreateFile`) han sido refactorizadas para usar `TitaniumFactory.forge()`. Se ha eliminado `drive.files.create` manual en la lógica de negocio.

### 5. Áreas Soberanas Humanas (Sovereign Areas)
`SmartSyncService` implementa la protección estricta de bloques `<!-- SOVEREIGN START -->`.

---

## ⚠️ Fase 3: Deuda Técnica y Riesgos (Mitigation Plan)

### 🛑 El Riesgo del "Echo Loop" (Bucle Infinito)
Existe una condición de carrera crítica:
1.  `scribePatchFile` actualiza un archivo en Drive.
2.  Drive activa el trigger (o el cliente hace polling).
3.  `syncCharacterManifest` detecta el cambio e intenta actualizar Firestore.
4.  Si `syncCharacterManifest` escribe un metadato que `scribe` vigila... se dispara otro patch.

**Solución: El Guardián del Hash (Content Hash Gatekeeper)**
En `syncCharacterManifest` (o su sucesor en Titanium V3), implementaremos:

```typescript
// Pseudocódigo
const incomingHash = crypto.createHash('sha256').update(fileContent).digest('hex');
const currentDoc = await db.collection('characters').doc(id).get();

if (currentDoc.data().contentHash === incomingHash) {
    logger.info("🛡️ ECHO SHIELD: El contenido no ha cambiado. Abortando actualización de DB.");
    return;
}
```
Esto ya existe parcialmente, pero debe ser **estricto** y aplicarse a todas las sincronizaciones, no solo a personajes.

---

## 🛡️ Execution Log (Titanium V3.0 Implementation)
> **Fecha de Ejecución:** 2026-02-25

1.  **Ontology Update:** Se actualizó `functions/src/types/ontology.ts` para reflejar la interfaz `TitaniumEntity` V3.0 y los `EntityTrait`s.
2.  **Factory Refactor:** `TitaniumFactory` (`functions/src/services/factory.ts`) ahora impone el esquema V3.0, maneja el bloque `_sys` y aplica poda estricta.
3.  **Smart-Sync Service:** Se creó `functions/src/services/smart_sync.ts` para encapsular la lógica de reconciliación y protección soberana.
4.  **Scribe Refactor:** `functions/src/scribe.ts` fue actualizado para usar `SmartSyncService` y `TitaniumFactory`, eliminando código duplicado.
5.  **Genesis & Forge Refactor:** `genesis.ts` y `index.ts` (`forgeToolExecution`) ahora usan la Factory, eliminando la creación de archivos "huesudos" y datos fantasma.
6.  **Legacy Adapter:** Se actualizó `legacy_adapter.ts` para mapear los nuevos traits (ej. `sentient` + `tangible` -> `creature`) a los tipos antiguos, manteniendo compatibilidad con `soul_sorter`.

**Estado Final:** El núcleo de la creación y mantenimiento de archivos (Lifecycle) ha sido unificado bajo la arquitectura Titanium V3.0.
