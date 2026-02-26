# 🏗️ Titanium Entity Lifecycle Audit & Unified Blueprint (Revisión Deep-Dive)
> **Fecha:** 26-02-2026
> **Autor:** The Chief Architect
> **Estado:** Implemented (Titanium V3.0)
> **Directiva:** Auditoría Sistémica y Plan de Unificación Final (V3.0).

---

## 🔍 Fase 1: Auditoría Sistémica Profunda (The Real State of the Union)

A diferencia de reportes anteriores que indicaban una implementación completa, mi análisis "Trace-to-Root" revela que el sistema se encuentra en un estado **Híbrido (V2.5)**. Si bien `TitaniumFactory` existe, el ecosistema aún depende críticamente de "Tipos Legacy" para funcionar.

### 1. La "Crisis de la Fuente de la Verdad" (Findings)
El sistema sufre de **Esquizofrenia de Datos**:
*   **`TitaniumFactory` (El Escudo de Compatibilidad):** Aunque intenta imponer una ontología V3.0, mantiene explícitamente `type` en la raíz del objeto JSON para evitar romper `soul_sorter`. Esto no es una "Limpieza", es un parche.
*   **`soul_sorter.ts` (La Forja Ciega):** Depende casi exclusivamente de `parsed.data.type` o `category` (strings hardcodeados como 'character', 'location'). **Si eliminamos `type` hoy, la Forja dejará de detectar Anchors.** No lee `traits`.
*   **`NexusCanvas.tsx` (Fragmentación Visual):** La UI determina los colores y formas basándose en `node.type` (Hardcoded: 'CHARACTER', 'LOCATION', 'IDEA'). No tiene lógica para interpretar `traits: ['sentient', 'tangible']`.
*   **`crystallization.ts` (Taxonomía Rígida):** La lógica de carpetas (`findIdealFolder`) usa un mapa estático `TYPE_ROLE_MAP` ('character' -> 'Personajes'). No es dinámica ni basada en capacidades.

### 2. Puntos de Creación & Fragilidad de Parsing
| Herramienta | Estado Real | Hallazgo Crítico |
| :--- | :--- | :--- |
| **`scribeCreateFile`** | ⚠️ Híbrido | Usa `TitaniumFactory`, pero su "Inferencia Inteligente" aún solicita a la IA clasificar en tipos legacy (`character`, etc.) en lugar de inferir traits. |
| **`scribePatchFile`** | ⚠️ Frágil | `SmartSyncService` protege áreas soberanas, pero su reconciliación es **superficial**. Solo sincroniza `name` y `role` si encuentra un H1 o Blockquote específico. Si el usuario define `**Alias**: ...` en el cuerpo, el YAML no se entera. |
| **`crystallizeGraph`** | ⚠️ Legacy | Normaliza tipos a strings ('person', 'place') y los escribe tanto en Firestore como en el Frontmatter, perpetuando el esquema antiguo. |

---

## 🏛️ Fase 2: El Blueprint Unificado (Titanium V3.0 - The Final Architecture)

Para alcanzar la verdadera "Ontología Funcional", debemos ejecutar la siguiente arquitectura.

### 1. La Interfaz de Entidad Universal (Trait-Based)
El `type` debe morir. La entidad se define por lo que **HACE** (Traits).

```typescript
// functions/src/types/ontology.ts (Propuesta Final)

export type EntityTrait =
    | 'sentient'    // Capaz de diálogo/voluntad (Personaje, IA, Deidad)
    | 'tangible'    // Tiene masa física (Objeto, Personaje, Lugar)
    | 'locatable'   // Tiene coordenadas/dirección (Lugar, Planeta)
    | 'temporal'    // Ocurre en el tiempo (Evento, Escena)
    | 'organized'   // Grupo de entidades (Facción, Gremio)
    | 'abstract';   // Concepto puro (Ley, Magia, Lore)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista)
    name: string;        // Nombre Canónico
    traits: EntityTrait[]; // 🚀 ÚNICA Fuente de Verdad Lógica

    attributes: {
        // Metadatos Flexibles (No esquemáticos)
        role?: string;      // "Protagonista", "Capital", "Espada Mágica"
        aliases?: string[];
        tags?: string[];
        [key: string]: any; // Extensible

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived' | 'ghost';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string;
            schema_version: '3.0';
            nexus_id: string;
            // ❌ legacy_type ELIMINADO en V3.0 Final
        };
    };

    bodyContent: string; // Markdown Soberano
}
```

### 2. El "Smart-Sync" Parser (Middleware 2.0)
El parser actual es insuficiente. Necesitamos un **"Deep Bi-Directional Sync"**.
*   **Lógica:** El parser debe escanear el Body no solo por H1, sino por patrones de definición Clave-Valor (`**Key**: Value` o tablas Markdown).
*   **Regla de Sincronización:**
    *   YAML -> Body: Si `attributes.aliases` cambia en YAML, el parser busca la línea `**Alias**: ...` en el body y la actualiza (si existe).
    *   Body -> YAML: Si el usuario edita `**Alias**: Nuevo Apodo` en el texto, `SmartSync` actualiza `attributes.aliases` en el próximo ciclo.

### 3. Metadata Pruning (The Kill List)
Campos a eliminar **permanentemente** (una vez migrados los consumidores):
*   ❌ `type` (Root level) -> Reemplazado por lógica de inferencia en UI (`sentient` -> Icono Usuario).
*   ❌ `category` -> Redundante con Traits.
*   ❌ `age`, `gender`, `race` (Root level) -> Movidos a `attributes` genéricos o inferidos del texto. No deben ser esquema rígido.
*   ❌ `created_at`, `updated_at` (Legacy) -> Usar `_sys.last_sync`.

### 4. Estandarización Cruzada (Factory Pattern)
Todas las herramientas (`NexusCanvas`, `Laboratory`, `Forge`) deben instanciar `TitaniumFactory`.
*   **`NexusCanvas` Refactor:** Dejar de usar `node.type`. Implementar `getVisualsFromTraits(traits)`:
    *   `['sentient', 'tangible']` -> 🟡 Color Personaje (Yellow).
    *   `['locatable']` -> 🔵 Color Lugar (Cyan).
    *   `['abstract']` -> 🟣 Color Idea (Purple).

### 5. Áreas Soberanas Humanas (Refinamiento)
El sistema debe respetar bloques explícitos.
*   `<!-- SOVEREIGN START -->` ... `<!-- SOVEREIGN END -->`: Contenido intocable por la IA.
*   **Bloque de "Voz del Autor":** Cualquier texto fuera de las secciones estándar generadas por la IA debe ser tratado como "Soberano Implícito" y preservado por `SmartSync`.

---

## ⚠️ Fase 3: Mitigación de Deuda Técnica (Riesgos Críticos)

### 1. El "Echo Loop" (Condición de Carrera)
**Problema:** `scribePatchFile` modifica el archivo en Drive -> Drive notifica cambio -> `soul_sorter` (o legacy scanners) detectan cambio -> intentan actualizar Firestore -> `scribe` detecta cambio en Firestore -> Bucle.

**Solución: The Guardian Hash (Implementación Inmediata)**
1.  Calcular `SHA-256` del contenido completo del archivo (`contentHash`).
2.  Almacenar este hash en `TDB_Index`.
3.  Antes de cualquier escritura en Drive o Firestore:
    ```typescript
    if (newHash === currentStoredHash) return; // No hay cambios reales, abortar.
    ```
4.  Esto debe implementarse en `SmartSyncService.reconcile` y en `soul_sorter`.

### 2. Dependencia Circular en `soul_sorter`
**Problema:** `soul_sorter` necesita leer el archivo para clasificarlo. Si cambiamos a Traits, `detectCategoryByMetadata` fallará.
**Plan de Migración:**
1.  Actualizar `soul_sorter` para que `detectCategory` infiera Traits basándose en palabras clave (`edad` -> `sentient`, `clima` -> `locatable`).
2.  Solo después de esto, eliminar `type` de `TitaniumFactory`.

---

**Conclusión:** La Catedral tiene cimientos fuertes (`TitaniumFactory`), pero sus muros (`Legacy Types`) son de barro. Debemos endurecer la ontología y limpiar la lógica de consumo antes de declarar la victoria.
