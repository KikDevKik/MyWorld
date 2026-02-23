# Auditoría del Ciclo de Vida de Entidades Titanium (Phase 1 & 2)

**Autor:** El Arquitecto Jefe (vía Jules)
**Fecha:** 2024-05-24
**Versión:** 1.0.0
**Estado:** DRAFT (Pendiente de Aprobación)

---

## 🏗️ Fase 1: Auditoría Sistémica Profunda (The Deep Audit)

Esta auditoría revela la "Disonancia Estructural" actual entre la ontología funcional deseada y la implementación heredada basada en cadenas de texto arbitrarias.

### 1.1. Puntos de Entrada de Creación (Creation Entry Points)

Se han identificado cuatro (4) puntos críticos de inyección de entidades al sistema. Todos sufren de dependencia del "Legacy Type".

| Función | Archivo Fuente | Problema Detectado | Riesgo |
| :--- | :--- | :--- | :--- |
| `scribeCreateFile` | `functions/src/scribe.ts` | Infiere `type` (ej. "character") mediante IA y lo pasa a `legacyTypeToTraits`. | **Alto**: Perpetúa la clasificación rígida en lugar de capacidades. |
| `crystallizeGraph` | `functions/src/crystallization.ts` | Usa un mapa hardcodeado `TYPE_ROLE_MAP` para decidir carpetas y roles. | **Crítico**: Bloquea la evolución hacia una taxonomía fluida. |
| `crystallizeForgeEntity` | `functions/src/crystallization.ts` | Asigna `traits: ['sentient']` por defecto, asumiendo que todo lo que sale de la Forja es un personaje. | **Medio**: Ignora objetos o lugares creados en la Forja. |
| `genesisManifest` | `functions/src/genesis.ts` | Extrae entidades como `TYPE_SOUL`, `TYPE_BEAST` y las mapea manualmente a `TitaniumEntity`. | **Alto**: Duplicación de lógica de mapeo fuera de la Factoría. |

**Hallazgo Clave:** Aunque `TitaniumFactory.forge` existe, los *inputs* siguen estando contaminados por la lógica de tipos heredada ("Character" vs "Location") antes de llegar a la factoría.

### 1.2. Lógica de Parcheo (The Patching Logic)

La función `scribePatchFile` en `functions/src/scribe.ts` implementa un intento de "Smart-Sync", pero es frágil:

*   **Mecanismo:** Extrae `Name` (H1) y `Role` (Blockquote) del Markdown AST.
*   **Validación:** Compara con el Frontmatter. Si hay discrepancia, actualiza el Frontmatter.
*   **Defecto:** Si el usuario cambia el *tipo* de entidad en el texto (ej. de "Lugar" a "Personaje" narrativamente), el sistema no actualiza los `traits` ni la carpeta, provocando una desincronización ontológica.
*   **Riesgo de Sobrescritura:** La instrucción al AI ("Find the most relevant section... and append it") es ambigua y puede duplicar encabezados si el modelo alucina.

### 1.3. Consumo de Datos (Data Consumption & Ghost Data)

El sistema actual sufre de "Ceguera de Metadatos":

*   **`soul_sorter.ts` (La Forja):** Depende críticamente de regex y keywords (`category: 'PERSON'`). Si eliminamos el campo `type` o `category` del YAML, **La Forja dejará de clasificar entidades correctamente**, rompiendo el radar de "Ecos".
*   **`LaboratoryPanel.tsx`:** Filtra archivos basándose en `smartTags` y la colección `TDB_Index`. Si el indexador (`ingestion.ts`) no mapea correctamente los nuevos `traits` a `category` (para compatibilidad), el panel quedará vacío.
*   **Ghost Data Detectada:** Se han encontrado campos como `age: unknown`, `status: active`, `tier: ANCHOR` ensuciando el nivel raíz del Frontmatter. `TitaniumFactory` ya tiene lógica para podar algunos, pero no todos los puntos de entrada la usan consistentemente.

---

## 🏛️ Fase 2: El Plano Unificado (The Blueprint)

Propuesta para la transición a una "Ontología Funcional" (Traits over Types).

### 2.1. La Interfaz Universal de Entidad (Universal Entity Interface)

```typescript
export type EntityTrait =
    | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs, Monstruos inteligentes)
    | 'location'    // Tiene coordenadas, geografía, atmósfera (Lugares, Planetas)
    | 'artifact'    // Es un objeto, tiene peso, valor, función (Items, MacGuffins)
    | 'faction'     // Es un grupo, tiene ideología, miembros (Gremios, Cultos)
    | 'event'       // Ocurre en el tiempo (Batallas, Escenas)
    | 'concept';    // Abstracto (Leyes mágicas, Filosofía)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista del Path)
    name: string;        // Nombre Canónico (Debe coincidir con H1)
    traits: EntityTrait[]; // 🚀 EL NÚCLEO: Define qué PUEDE hacer la entidad
    attributes: {
        role?: string;       // Descripción corta (ej. "Capitán de la Guardia")
        aliases?: string[];  // Para búsqueda difusa
        tags?: string[];     // Taxonomía flexible
        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT' | 'GHOST';
            last_sync: string;
            schema_version: '2.0';
        };
        // Datos específicos de Trait (opcionales)
        [key: string]: any;
    };
    bodyContent: string; // Markdown Soberano
}
```

### 2.2. El Analizador "Smart-Sync" (Middleware)

En lugar de confiar solo en `scribePatchFile`, implementaremos un **Trigger de Firestore (`onWrite`)** en la colección `TDB_Index` o un hook en el guardado de archivo:

1.  **Detector de Cambios:** Al guardar, comparar Hash del Markdown vs Hash del Frontmatter.
2.  **Sincronización Bidireccional:**
    *   Si cambia H1 (`# Nuevo Nombre`) -> Actualizar `attributes.name` y renombrar archivo (con confirmación).
    *   Si cambia Frontmatter (`role: Nuevo Rol`) -> Inyectar actualización en el bloque `> *Rol*` del Markdown.
3.  **Protección de Soberanía:** El sistema NUNCA tocará bloques dentro de `<!-- SOVEREIGN START --> ... <!-- SOVEREIGN END -->`.

### 2.3. Poda de Metadatos (Metadata Pruning)

Campos a **ELIMINAR PERMANENTEMENTE** del nivel raíz (Root YAML):

*   ❌ `age` (Mover a `attributes` solo si es relevante, o borrar si es "unknown")
*   ❌ `status` (Mover a `_sys.status`)
*   ❌ `tier` (Mover a `_sys.tier`)
*   ❌ `last_updated`, `created_at` (Usar `_sys.last_sync`)
*   ❌ `type` (Mantener SOLO como "Compatibility Shield" temporalmente, calculado desde `traits`)

### 2.4. Estandarización entre Herramientas (TitaniumSDK)

Crear una clase abstracta `TitaniumSDK` que todas las herramientas (`Genesis`, `Scribe`, `Forge`) deban usar. Nadie debe instanciar objetos JSON manualmente.

```typescript
// Ejemplo de uso obligatorio
const entity = TitaniumSDK.create({
    name: "Aryon",
    traits: ['sentient', 'magic_user'], // Type-safe
    ...
});
// Esto garantiza que _sys, pruning y validación ocurran SIEMPRE.
```

### 2.5. Áreas Soberanas Humanas (Human Sovereign Areas)

El AI tiene prohibido terminantemente modificar:
1.  Cualquier texto entre `<!-- SOVEREIGN START -->` y `<!-- SOVEREIGN END -->`.
2.  El bloque de `Frontmatter` manual si contiene el flag `locked: true`.

---

## 🛑 Fase 3: Mitigación de Deuda Técnica & Riesgos

### 3.1. Dependencias Circulares (Riesgo Crítico)
*   **Problema:** `soul_sorter` lee cambios en Firestore. Si `TitaniumFactory` actualiza el archivo al "Podar Metadatos", dispara un evento de escritura. `soul_sorter` lo lee de nuevo, intenta clasificar, y podría escribir de nuevo.
*   **Solución:** Implementar un **"Idempotency Key"** (Hash del Contenido) en `_sys`. Si el Hash no cambia, `TitaniumFactory` aborta la escritura, rompiendo el bucle.

### 3.2. Condiciones de Carrera (Race Conditions)
*   **Problema:** El usuario edita el archivo en Obsidian (local) mientras `Scribe` intenta parchearlo en la nube.
*   **Solución:** Uso estricto de `optimistic locking` (versiones de archivo) o bloqueo suave (`.lock` file) durante operaciones de `Scribe`.

---

## 🛡️ Cohesion Shield: Análisis de Impacto Cruzado

**Cambio Propuesto:** Reemplazar `type: string` con `traits: string[]`.

**Impacto en Herramientas:**
1.  **La Forja (`soul_sorter.ts`):** 🔴 **ROMPIENTE**.
    *   La lógica actual `detectCategoryByMetadata` busca claves específicas y valores legacy.
    *   *Mitigación:* `TitaniumFactory` seguirá escribiendo un campo `type` derivado (calculado) en el YAML durante la Fase de Transición (Compatibility Shield).
2.  **El Centinela (`janitor.ts`):** 🟡 **MEDIO**.
    *   Escanea carpetas basándose en `type`.
    *   *Mitigación:* Actualizar `janitor` para leer `traits` O mantener la estructura de carpetas vinculada a `traits` (ej. `traits: ['sentient']` -> `Folder: Personajes`).
3.  **El Director (`guardian.ts`):** 🟢 **BAJO**.
    *   Consume texto plano y contexto. No depende fuertemente de la estructura del YAML, solo del contenido.

**Veredicto:** Proceder con la implementación de `TitaniumEntity` y `traits`, pero **MANTENER** la inyección del campo `type` (calculado) en el Frontmatter por al menos 2 ciclos de release para permitir la refactorización segura de `soul_sorter`.
