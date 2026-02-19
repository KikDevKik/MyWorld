# 🏗️ PLANO TITANIUM: AUDITORÍA DE CICLO DE VIDA DE ENTIDADES & METADATOS

> **Fecha:** 2024-05-23
> **Autor:** The Chief Architect (Jules)
> **Estado:** Borrador de Arquitectura
> **Objetivo:** Unificar la creación, sincronización y consumo de entidades bajo una "Ontología Funcional".

---

## 🔍 FASE 1: LA AUDITORÍA PROFUNDA (TRACE-TO-ROOT)

He realizado un análisis exhaustivo del código fuente para identificar los puntos de fricción en la creación y gestión de entidades. Aquí están los hallazgos críticos:

### 1. Puntos de Entrada de Creación (La Fragmentación del Génesis)
Actualmente existen **cuatro** mecanismos distintos para crear archivos, cada uno con su propia lógica y esquema de datos:

| Herramienta | Función | Lógica de Creación | Problema Detectado |
| :--- | :--- | :--- | :--- |
| **El Escriba** | `scribeCreateFile` (`scribe.ts`) | Usa `generateAnchorContent` (Legacy Template) | Hardcodea `status: 'active'`, `role: 'Unknown'`. Infiere tipos básicos pero no usa Traits. |
| **Génesis** | `genesisManifest` (`genesis.ts`) | Usa `TitaniumFactory.forge` | **El más avanzado**, pero hardcodea arrays de traits como `['sentient']` o `['location']` de forma estática. |
| **El Constructor** | `crystallizeGraph` (`crystallization.ts`) | Usa `generateAnchorContent` (Legacy Template) | Fuerza `type: 'concept'` si falta. Mapea tipos a carpetas usando lógica duplicada de `genesis.ts`. |
| **La Forja** | `crystallizeForgeEntity` (`crystallization.ts`) | Usa `generateAnchorContent` (Legacy Template) | Asume por defecto `type: 'character'`. Crea entradas en Roster (`users/{uid}/characters`) con campos legacy. |

**Diagnóstico:** No existe una "Fuente de Verdad" única para la estructura de un archivo. `TitaniumFactory` existe pero está subutilizado.

### 2. Lógica de Parcheo (`scribePatchFile`)
*   **Estado Actual:** Utiliza un bloque de "Smart-Sync Middleware 2.0".
*   **Hallazgo Positivo:** Intenta reconciliar `name` y `role` extrayéndolos del cuerpo del Markdown (AST) antes de guardar.
*   **Fallo Crítico:** Aunque usa `TitaniumFactory.forge` para regenerar el contenido, la lógica de "Anti-Makeup" (poda de metadatos) es local y no se comparte con los otros creadores. Esto significa que un archivo creado por Génesis puede tener campos que el Escriba borraría, creando inconsistencia.

### 3. Consumo de Datos (La Señal vs El Ruido)
*   **El Laboratorio (`LaboratoryPanel.tsx`):** Depende de `smartTags` en `TDB_Index`. No lee el Frontmatter directamente, lo que es bueno para el rendimiento pero malo para la coherencia si los tags no se sincronizan con el contenido.
*   **El Director (`useDirectorChat.ts`):** Construye contexto enviando el **texto crudo** (`activeFileContent`) a la IA. **Ignora casi totalmente el Frontmatter**. Esto confirma que campos como `age: unknown` o `status: active` son "Ghost Data" (Ruido) que consume tokens sin aportar valor.
*   **El Centinela (`guardian.ts`):** Escanea el texto en busca de contradicciones semánticas. No valida si el `type` en YAML coincide con el contenido, confiando puramente en embeddings.

### 4. Escudo de Cohesión (Impacto Cruzado)
*   **`syncCharacterManifest` (`index.ts`):** Este es el punto de rotura más alto. Lee explícitamente `fm.type` o `fm.category` para clasificar entidades en Firestore ('PERSON', 'LOCATION'). **Si cambiamos a Traits sin un adaptador, este escáner dejará de indexar personajes.**
*   **`analyzeForgeBatch` (`forge_scan.ts`):** Filtra estrictamente por `type: "CHARACTER"`. Requiere actualización para entender que `traits: ["sentient", "agent"]` equivale a un personaje.

---

## 📐 FASE 2: EL BLUEPRINT UNIFICADO

Proponemos una arquitectura basada en **Traits (Rasgos)** en lugar de Tipos estáticos. Una entidad se define por lo que *hace*, no por una etiqueta arbitraria.

### 1. La Interfaz Universal de Entidad (Titanium Entity)

```typescript
// Definición Oficial para todo el Proyecto Titanium
export interface TitaniumEntity {
    id: string;          // Nexus ID (Determinista)
    name: string;        // Nombre canónico

    // 🟢 EL NÚCLEO: RASGOS FUNCIONALES
    // Reemplaza a 'type'. Define comportamiento.
    traits: string[];
    // Ejemplos:
    // - ['sentient', 'agent'] -> Personaje
    // - ['location', 'static'] -> Lugar
    // - ['object', 'item'] -> Objeto
    // - ['concept', 'abstract'] -> Lore/Regla

    // 🟢 ATRIBUTOS DINÁMICOS (Solo si aportan valor)
    attributes: {
        role?: string;       // "Protagonista", "Capital", "Espada Mágica"
        aliases?: string[];  // "El Elegido", "Neo"
        // NO MÁS: age, status, gender (a menos que sean críticos para la trama)
        [key: string]: any;
    };

    bodyContent: string; // El contenido Markdown (Sovereign)
}
```

### 2. El "Smart-Sync" Parser (Middleware Universal)
Este middleware debe ejecutarse en **cada escritura** (Creación o Edición):

1.  **Extracción AST:** Leer el Markdown Body.
    *   H1 (`# Nombre`) -> `entity.name`
    *   Blockquote (`> *Rol*`) -> `entity.attributes.role`
2.  **Reconciliación:**
    *   Si el Frontmatter dice "Nombre: A" y el H1 dice "Nombre: B", **el H1 (Texto) Gana**. Actualizar Frontmatter.
    *   Si el Frontmatter tiene `traits` y el Texto sugiere otros (ej. habla, tiene agencia), sugerir actualización de traits (IA asistida, no automática).
3.  **Serialización:**
    *   Reescribir el archivo usando `TitaniumFactory` para garantizar que el YAML siempre esté limpio y ordenado.

### 3. Poda de Metadatos (Metadata Pruning Protocol)
Los siguientes campos serán eliminados permanentemente del Frontmatter y Firestore ("Ghost Data"):

*   ❌ `age: unknown` / `age: desconocida` (Ruido puro).
*   ❌ `status: active` (El defecto es siempre activo).
*   ❌ `id: ...` (El ID debe ser implícito por el nombre/path o estar en una base de datos, no ensuciando el archivo visualmente si es posible, o al menos minimizado). *Nota: Mantendremos nexusId si es crítico para enlaces.*
*   ❌ `type: ...` (Reemplazado por `traits`). *Nota: Se mantendrá un `type` calculado ("computed prop") en memoria para compatibilidad legacy.*

### 4. Estandarización Cruzada (Factory Pattern)
Todas las herramientas (`scribe`, `genesis`, `builder`, `forge`) deben importar y usar **exclusivamente** `TitaniumFactory.forge(entity)`.
*   Eliminar `generateAnchorContent` y `generateDraftContent` (Legacy).
*   Centralizar la lógica de templates en `src/services/factory.ts`.

### 5. Áreas Soberanas Humanas (Sovereign Areas)
La IA tiene **PROHIBIDO** modificar o formatear:
*   Bloques de código (` ``` `).
*   Citas textuales que no sean el "Rol" (`> "Diálogo..."`).
*   Secciones personalizadas que no estén en el esquema estándar (ej. `## Notas del Autor`).
*   Comentarios HTML (`<!-- COMENTARIO -->`).

---

## ⚠️ FASE 3: MITIGACIÓN DE DEUDA TÉCNICA

### 1. Dependencias Circulares (Race Conditions)
*   **Riesgo:** `crystallizeGraph` actualiza Firestore (`TDB_Index`, `entities`) manualmente, pero también activa `ingestFile` (Indexador) que *también* actualiza Firestore.
*   **Solución:** Desacoplar la escritura en DB. `crystallizeGraph` solo debe escribir en **Drive**. Un `onCreate` trigger en Cloud Functions (o el `ingestFile` llamado explícitamente una sola vez) debe encargarse de la indexación.

### 2. El Adaptador Legacy (Cohesion Shield)
Para evitar romper `syncCharacterManifest` y `forge_scan`:

```typescript
// En functions/src/utils/legacy_adapter.ts

export function traitsToLegacyType(traits: string[]): string {
    if (traits.includes('sentient') || traits.includes('agent')) return 'character';
    if (traits.includes('location') || traits.includes('place')) return 'location';
    if (traits.includes('object') || traits.includes('item')) return 'object';
    return 'concept'; // Fallback
}

export function traitsToLegacyCategory(traits: string[]): string {
    if (traits.includes('sentient')) return 'PERSON';
    if (traits.includes('location')) return 'LOCATION';
    // ...
    return 'UNKNOWN';
}
```
Todas las funciones antiguas (`syncCharacterManifest`) deben envolver su lógica de lectura con este adaptador.

---

**🛑 FIN DEL INFORME.**
Esperando autorización para proceder con la implementación de la Fase 1 (Refactorización de Factories).
