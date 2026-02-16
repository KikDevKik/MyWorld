# PROTOCOLO DE EJECUCIÓN SEGURA: TRANSICIÓN A TITANIUM
**Fecha:** 16 de Febrero, 2026
**Autor:** The Chief Architect (Jules)
**Objetivo:** Implementar el Protocolo de Entidad Unificada sin romper la compatibilidad con el ecosistema actual (Forja, Nexus, Director).

---

## 1. DIAGNÓSTICO Y MAPA DE DEPENDENCIAS

### Dependencias Críticas de `type: anchor`
Actualmente, el sistema depende de valores hardcodeados en el Frontmatter para clasificar entidades. Un cambio abrupto rompería estas herramientas:

1.  **La Forja de Almas (`forge_scan.ts`)**:
    *   Utiliza un prompt estricto que busca `type: "CHARACTER"`.
    *   Ignora cualquier entidad que no sea "persona, ser sintiente, IA o monstruo con nombre".
    *   **Riesgo:** Si cambiamos `type: character` a `kind: agent`, el escáner ignorará a todos los personajes, vaciando el Roster.

2.  **El Clasificador de Almas (`soul_sorter.ts`)**:
    *   Utiliza heurísticas basadas en claves de metadatos (`role`, `age`, `race` -> `PERSON`; `habitat`, `diet` -> `CREATURE`).
    *   Depende de `detectCategoryByMetadata` para asignar categorías (`PERSON`, `LOCATION`, `OBJECT`).
    *   **Riesgo:** Si eliminamos claves como `role` o `age` del YAML, el clasificador degradará a las entidades a "LIMBO" o "GHOST".

3.  **El Cristalizador (`crystallization.ts`)**:
    *   Asigna `type: concept` por defecto si no se especifica.
    *   Usa `generateAnchorContent` que espera `AnchorTemplateData` con campos específicos.

### Estrategia de Mapeo (Legacy Adapter)
Para mantener la compatibilidad mientras migramos a Traits, `TitaniumFactory` inyectará automáticamente los tipos antiguos en el YAML basándose en los nuevos Traits.

| Nuevo Trait (Titanium) | Tipo Legacy (YAML) | Categoría (Firestore) | Claves Inyectadas Automáticamente |
| :--- | :--- | :--- | :--- |
| `sentient` | `character` | `PERSON` | `role`, `age` (opcional), `status` |
| `location` | `location` | `LOCATION` | `region`, `population` (opcional) |
| `artifact` | `object` | `OBJECT` | `type`, `value` (opcional) |
| `concept` | `concept` | `CONCEPT` | `tags` |
| `event` | `event` | `EVENT` | `date` (opcional) |

---

## 2. IMPLEMENTACIÓN DE LA FUNDICIÓN ÚNICA (`TitaniumFactory`)

Crearemos `functions/src/services/factory.ts` como la nueva Fuente de Verdad.

### Interfaz Propuesta
```typescript
export interface TitaniumEntity {
    id: string;
    name: string;
    traits: ('sentient' | 'location' | 'artifact' | 'concept' | 'event')[];
    attributes: Record<string, any>; // Flexible: { role: "Hero", hp: 100 }
    bodyContent: string;
}
```

### Lógica del Legacy Adapter (`forge` method)
```typescript
static forge(entity: TitaniumEntity): string {
    // 1. Detectar Tipo Legacy
    let legacyType = 'concept';
    if (entity.traits.includes('sentient')) legacyType = 'character';
    else if (entity.traits.includes('location')) legacyType = 'location';
    else if (entity.traits.includes('artifact')) legacyType = 'object';

    // 2. Construir Frontmatter Híbrido
    const frontmatter = {
        id: entity.id,
        name: entity.name,
        type: legacyType, // COMPATIBILIDAD
        traits: entity.traits, // FUTURO
        ...entity.attributes // APLANADO para compatibilidad con Soul Sorter
    };

    // 3. Generar Markdown
    return `---\n${yaml.dump(frontmatter)}---\n\n${entity.bodyContent}`;
}
```

---

## 3. IMPLEMENTACIÓN DEL MIDDLEWARE "SMART-SYNC"

Refactorizaremos `scribePatchFile` en `functions/src/scribe.ts` para incluir la capa de Reconciliación.

### Lógica de Reconciliación (Pre-Save)
1.  **Extracción:** Usar Regex/IA ligera para leer el `> *Role*` y el `# Name` del Markdown.
2.  **Validación:** Comparar con `frontmatter.role` y `frontmatter.name`.
3.  **Corrección:** Si hay discrepancia, actualizar el objeto `frontmatter` antes de escribir en Drive.

### Prevención de Bucles (Debounce)
*   **Mecanismo:** Añadir campo `last_titanium_sync` (timestamp) en el Frontmatter.
*   **Regla:** Si `Date.now() - last_titanium_sync < 5000ms`, abortar la reconciliación automática (asumimos que es un eco del sistema).
*   **Firestore:** Solo actualizar `TDB_Index` si hubo cambios reales en metadatos funcionales (`role`, `type`, `tags`).

---

## 4. PLAN DE MIGRACIÓN PROGRESIVA (Fases de PR)

No haremos un "Big Bang". Migraremos herramienta por herramienta.

### PR 1: El Génesis (`genesis.ts`)
*   **Objetivo:** Que los nuevos proyectos nazcan limpios.
*   **Cambio:** Reemplazar `generateAnchorContent` por `TitaniumFactory.forge`.
*   **Prueba:** Ejecutar `genesisManifest` y verificar que los archivos creados tienen `type` (Legacy) y `traits` (Titanium).

### PR 2: La Forja de Almas (`crystallization.ts`)
*   **Objetivo:** Que los nuevos personajes creados desde el chat usen la nueva estructura.
*   **Cambio:** Actualizar `crystallizeForgeEntity` y `crystallizeGraph` para usar la Factory.
*   **Prueba:** Crear un personaje desde el chat y verificar que el Soul Sorter lo detecta correctamente como `ANCHOR`.

### PR 3: WorldEngine (`index.ts`)
*   **Objetivo:** Que los nodos generados por la IA (`forgeToolExecution`) tengan estructura.
*   **Cambio:** En `forgeToolExecution`, instanciar `TitaniumEntity` antes de guardar.
*   **Beneficio:** Elimina los archivos "desnudos" (sin YAML) que actualmente rompen el índice.

---

## 5. PODA DE "GHOST DATA"

### Campos a Eliminar (Deprecation List)
Estos campos dejarán de ser ciudadanos de primera clase en el YAML raíz y pasarán a `attributes` (o desaparecerán si están vacíos).

1.  **`age: unknown` / `age: Desconocida`**:
    *   **Acción:** Eliminar del template por defecto. Solo incluir si el usuario lo especifica explícitamente.
2.  **`status: active`**:
    *   **Acción:** Eliminar. Se asume `active` por defecto. Solo escribir `status: deceased` o `status: archived`.
3.  **`class` / `race`**:
    *   **Acción:** Mover a `attributes.class` y `attributes.species`. El Soul Sorter deberá actualizarse para leer `attributes` también (Fase 3).

### Estrategia de Limpieza
No ejecutaremos un script masivo de reescritura en Drive (demasiado riesgo de I/O).
**Estrategia "Lazy Pruning":** La poda ocurrirá naturalmente cuando el archivo sea tocado por `scribePatchFile` (Smart-Sync). Al guardar una nueva versión, la Factory limpiará los campos obsoletos.

---

## ESTADO DE SEGURIDAD
🛑 **BLOQUEO ACTIVO.** Esperando confirmación del Arquitecto Jefe para proceder con el PR 1 (Creación de `TitaniumFactory` y Migración de `genesis.ts`).
