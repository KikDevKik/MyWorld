# Auditoría y Blueprint del Ciclo de Vida de Entidades Titanium

**Autor:** El Arquitecto Jefe
**Fecha:** 2024-05-24
**Versión:** 1.0
**Estado:** Propuesta de Refactorización Masiva

---

## 🏛️ FASE 1: LA AUDITORÍA SISTÉMICA PROFUNDA (THE ENTROPIC CHAOS)

Hemos realizado un análisis "Trace-to-Root" de los puntos de creación y consumo de datos en el ecosistema Titanium. La conclusión es clara: **Existe una fragmentación crítica en la ontología.**

### 1. Puntos de Entrada de Creación (Creation Entry Points)

El sistema utiliza múltiples fuentes de verdad para crear archivos, lo que genera inconsistencia en los metadatos.

| Función | Archivo | Método de Creación | Problema Detectado |
| :--- | :--- | :--- | :--- |
| **`scribeCreateFile`** | `functions/src/scribe.ts` | Usa `generateAnchorContent` (Legacy Template) | Ignora `TitaniumFactory`. Hardcodea `type: 'character'` por defecto si falla la inferencia. Genera campos vacíos. |
| **`crystallizeGraph`** | `functions/src/index.ts` | Usa `generateAnchorContent` | Lógica compleja de "JIT Taxonomy" pero termina usando el template antiguo. |
| **`genesisManifest`** | `functions/src/genesis.ts` | Usa `TitaniumFactory.forge` ✅ | Es el único alineado, PERO hardcodea los `traits` (ej. `['sentient']`) basándose en una lógica interna (`TYPE_SOUL`), creando una dependencia oculta. |
| **`crystallizeForgeEntity`** | `functions/src/index.ts` | Usa `generateAnchorContent` | Ignora la factoría unificada. Promueve entidades desde la Forja con esquemas antiguos. |

### 2. La Lógica de Parcheo (The Patching Logic)

*   **Archivo:** `functions/src/scribe.ts` -> `scribePatchFile`
*   **Hallazgo:** Implementa una lógica de "Anti-Makeup" (`pruneGhostMetadata`) localmente.
*   **Riesgo:** Si creamos un archivo con `crystallizeGraph`, no pasa por esta limpieza. Los datos "fantasmas" (ej. `age: unknown`) persisten hasta que `scribePatchFile` los toca, creando inconsistencia temporal.

### 3. Consumo de Datos (Data Consumption)

*   **`useDirectorChat` & `LaboratoryPanel`:** El frontend consume metadatos superficiales (`smartTags`, `type`).
*   **`forge_scan.ts` (Soul Sorter):** ⚠️ **Punto Crítico.** Escanea archivos buscando explícitamente `type: "CHARACTER"`.
    *   *Impacto:* Si migramos puramente a `traits` sin un adaptador, el Soul Sorter dejará de detectar personajes, rompiendo la Forja de Almas.

---

## 🏗️ FASE 2: EL BLUEPRINT UNIFICADO (TITANIUM V2)

Proponemos una arquitectura basada en **Traits (Rasgos Funcionales)** en lugar de Tipos Estáticos.

### 1. La Interfaz de Entidad Universal (The Universal Entity Interface)

Definimos la única fuente de verdad en TypeScript (`functions/src/services/factory.ts`).

```typescript
export type TitaniumTrait =
  | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs)
  | 'place'       // Tiene coordenadas, atmósfera (Lugares)
  | 'item'        // Es poseíble, tiene utilidad (Objetos)
  | 'faction'     // Grupo social, tiene ideología (Facciones)
  | 'event'       // Ocurre en el tiempo (Eventos históricos)
  | 'concept';    // Abstracto (Leyes, Magia)

export interface TitaniumEntity {
    id: string;             // Nexus ID (Hash determinístico)
    name: string;           // Nombre canónico
    traits: TitaniumTrait[]; // 🚀 EL NUEVO NÚCLEO
    attributes: Record<string, any>; // Metadatos flexibles (pruned)
    bodyContent: string;    // Contenido Markdown puro
    projectId?: string;
}
```

### 2. Middleware "Smart-Sync" (El Sanitizador)

Centralizaremos la lógica de limpieza en `TitaniumFactory`. Antes de "forjar" (serializar a YAML), los datos pasarán por un filtro estricto.

*   **Política de "Anti-Maquillaje":**
    *   Si `age` es "unknown", "desconocida", o "?", se elimina.
    *   Si `status` es "active" (valor por defecto), se elimina (se asume implícito).
    *   Si `role` es "Unknown", se elimina.
*   **Sincronización Bidireccional:**
    *   El `scribePatchFile` usará `TitaniumFactory.parse(content)` para extraer el AST, actualizar los atributos, limpiar fantasmas, y regenerar con `TitaniumFactory.forge(entity)`.

### 3. Estandarización de Herramientas (Cross-Tool Standardization)

Eliminaremos `functions/src/templates/forge.ts`. Todas las funciones de creación (`scribe`, `genesis`, `crystallize`) importarán `TitaniumFactory`.

*   **Migración:**
    *   `generateAnchorContent` -> `TitaniumFactory.forge(entity)`
    *   Los `traits` se inferirán automáticamente si el input antiguo trae `type`.

### 4. Áreas Soberanas Humanas (Sovereign Areas)

Para proteger la voz del autor, la IA tendrá **PROHIBIDO** modificar:

1.  **Bloques de Pensamiento:** `<thinking>...</thinking>` (Usados por el Director).
2.  **Comentarios HTML:** `<!-- HUMAN-ONLY -->` o cualquier comentario.
3.  **Frontmatter Personalizado:** Campos que no estén en el esquema Titanium (ej. `my_custom_field: value`) deben preservarse, no eliminarse.

---

## 🛡️ FASE 3: MITIGACIÓN DE DEUDA TÉCNICA (COHESION SHIELD)

### 1. El Puente del "Soul Sorter" (`forge_scan.ts`)

Dado que `forge_scan.ts` busca `type: "CHARACTER"`, implementaremos una estrategia de **Doble Vinculación** durante la transición.

*   **Estrategia:** `TitaniumFactory` escribirá AMBOS campos en el YAML durante la fase de migración (v2.0 -> v2.1).
    ```yaml
    ---
    name: "Arin"
    type: "character"  # 🛡️ LEGACY (Para Soul Sorter actual)
    traits: ["sentient"] # 🚀 TITANIUM (Para el futuro)
    ---
    ```
*   **Refactorización Futura:** Una vez que `forge_scan.ts` sea actualizado para leer `traits`, eliminaremos el campo `type`.

### 2. Análisis de Regresión

*   **Circular Dependencies:** No se detectan ciclos nuevos. `TitaniumFactory` es una función pura.
*   **Race Conditions:** `scribePatchFile` ya tiene un "Debounce" (5000ms check). Mantendremos esta lógica pero movida al wrapper de la Cloud Function, no dentro de la Factory.

---

## 🚀 EJECUCIÓN INMEDIATA

1.  **Refactorizar `TitaniumFactory`:** Implementar `pruneGhostMetadata` dentro de `forge`.
2.  **Actualizar `scribe.ts`:** Usar la nueva Factory.
3.  **Actualizar `index.ts`:** Reemplazar `generateAnchorContent`.
4.  **Desplegar:** Verificar que el Soul Sorter sigue detectando personajes.
