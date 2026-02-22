# Auditoría y Plano Unificado: El Ciclo de Vida de la Entidad (Titanium)

**Fecha:** 2024-10-26
**Autor:** The Chief Architect (Jules)
**Estado:** DRAFT (Propuesta de Migración)
**Alcance:** Proyecto Titanium (Backend Functions & Frontend Hooks)

---

## 🏗️ 1. Auditoría Sistémica Profunda (Fase 1)

Hemos realizado un análisis "Trace-to-Root" de los puntos de entrada de creación de archivos y consumo de datos. La conclusión es clara: **Existe una "Entropía Estructural" significativa.**

### 1.1 Fragmentación del Esquema (Creation Entry Points)

Cada herramienta del arsenal "inventa" su propia definición de entidad, resultando en inconsistencias de metadatos y tipos.

*   **El Escriba (`scribeCreateFile` en `scribe.ts`):**
    *   Usa `legacyTypeToTraits` para mapear `entityData.type` (string) a traits.
    *   Inyecta valores por defecto rígidos: `role: "Entidad Registrada"`, `status: 'active'`, `tier: 'ANCHOR'`.
    *   Llama a `TitaniumFactory.forge(entity)`, pero la "fábrica" no es lo suficientemente estricta para eliminar metadatos fantasma heredados.

*   **Protocolo Génesis (`genesisManifest` en `genesis.ts`):**
    *   **Crítico:** Hardcodea la lógica de creación basada en strings mágicos (`TYPE_SOUL`, `TYPE_LOCATION`).
    *   Asigna atributos por defecto que generan ruido: `age: "Desconocida"`, `role: "NPC"`.
    *   No usa la misma lógica de inferencia que El Escriba, creando dos "verdades" sobre cómo se ve un personaje.

*   **La Forja (`crystallizeForgeEntity` en `crystallization.ts`):**
    *   Asume por defecto `traits: ['sentient']` y `role: 'Unknown'`.
    *   Promueve entidades de 'LIMBO' a 'ANCHOR' sin limpiar los metadatos provisionales, arrastrando "basura" de la fase de brainstorming al Canon definitivo.

*   **El Constructor (`crystallizeGraph` en `crystallization.ts`):**
    *   Implementa su propia lógica de normalización de tipos (`safeType`).
    *   Intenta "adivinar" carpetas basándose en nombres (`findIdealFolder`), lo cual es frágil.

### 1.2 Lógica de Parcheo (The Patching Logic)

*   **Smart-Sync (`scribePatchFile` en `scribe.ts`):**
    *   Es el componente más robusto actualmente. Compara el Frontmatter anterior con el nuevo.
    *   Si el Frontmatter no cambia, intenta extraer metadatos del cuerpo (`extractMetadataFromBody`).
    *   **Fallo:** Aún depende de `legacyTypeToTraits` y no tiene una política clara de "qué gana" entre un trait funcional y un tipo heredado.

### 1.3 Fragilidad de Análisis (Parsing Fragility & Ghost Data)

*   **El Clasificador de Almas (`soul_sorter.ts`):**
    *   Depende peligrosamente de REGEX para detectar metadatos en el cuerpo del texto (`detectCategoryByMetadata`). Busca claves como `Nombre:`, `Edad:`, `Raza:`.
    *   **Riesgo Mayor:** Si limpiamos estos campos del Markdown (para ahorrar tokens), el Soul Sorter dejará de detectar estas entidades como `ANCHOR`, degradándolas a `GHOST` o `LIMBO`.
    *   **Ghost Data:** Campos como `age: unknown`, `status: active`, `tier: anchor` se almacenan en Firestore y se envían al contexto del AI, consumiendo tokens sin aportar valor narrativo.

---

## 🏛️ 2. El Plano Unificado (Fase 2)

### 2.1 La Nueva Interfaz Universal de Entidad

Abandonamos los "Tipos Estáticos" (`type: character`) en favor de una "Ontología Funcional" (`traits: ['sentient', 'mobile']`).

```typescript
// functions/src/types/ontology.ts

export type EntityTrait =
    | 'sentient'   // Tiene agencia, diálogo, personalidad. (Antes: Character/NPC)
    | 'location'   // Tiene coordenadas, clima, atmósfera. (Antes: Location/World)
    | 'artifact'   // Es un objeto tangible, puede ser poseído. (Antes: Item/Object)
    | 'concept'    // Es una idea, ley mágica, filosofía. (Antes: Lore)
    | 'event'      // Ocurre en un tiempo específico. (Antes: Scene/History)
    | 'faction'    // Es un grupo de entidades sentientes. (Antes: Group)
    | 'creature';  // Instinto, biología, stats. (Antes: Beast)

export interface TitaniumEntity {
    // Identidad Determinística (Nexus ID)
    id: string;
    name: string;

    // Ontología Funcional (Lo que HACE, no lo que ES)
    traits: EntityTrait[];

    // Atributos Dinámicos (Solo si tienen valor)
    attributes: {
        role?: string;       // "Protagonista", "Capital", "Espada Maldita" (Opcional)
        aliases?: string[];
        tags?: string[];
        project_id?: string;
        avatar?: string;
        // Metadatos de Sistema (Ocultos al AI en RAG, visibles para el Sistema)
        _sys?: {
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string;
        };
        [key: string]: any;
    };

    // El Cuerpo Soberano (Markdown Puro)
    bodyContent: string;
}
```

### 2.2 Middleware "Smart-Sync" (El Sincronizador)

El nuevo `scribePatchFile` debe operar bajo la regla de **"Verdad Bidireccional"**:

1.  **Lectura:** Al leer un archivo, si el Frontmatter difiere del AST (Abstract Syntax Tree) del Markdown (ej. El usuario cambió el H1 `# Nuevo Nombre`), el AST gana y actualiza el Frontmatter.
2.  **Escritura:** Al escribir, `TitaniumFactory` fuerza la consistencia.
3.  **Detección de Cambios:** Usar un hash del contenido (`contentHash`) para evitar escrituras innecesarias en Firestore si solo cambió un espacio en blanco.

### 2.3 Política de Poda de Metadatos (Metadata Pruning)

Los siguientes campos serán **ELIMINADOS PERMANENTEMENTE** del Frontmatter visible y del contexto enviado al AI (RAG), a menos que tengan un valor semántico específico diferente al defecto:

*   `age` (Si es "Unknown", "Desconocida", o numérico irrelevante para la trama).
*   `status` (Se mueve a `_sys.status`).
*   `tier` (Se mueve a `_sys.tier`).
*   `id` (El ID de Drive es irrelevante para la narrativa; el Nexus ID es interno).
*   `created_at` / `updated_at` (Mover a `_sys`).

**Solo se conservan señales creativas:** `role`, `faction`, `location`, `aliases`.

### 2.4 Estandarización Transversal (Cross-Tool)

Todas las herramientas (`Genesis`, `Forge`, `Scribe`) deben instanciar entidades usando un **Builder Pattern** centralizado, no objetos literales.

```typescript
// functions/src/services/EntityBuilder.ts
class EntityBuilder {
  static create(name: string): EntityBuilder;
  withTrait(trait: EntityTrait): EntityBuilder;
  withAttribute(key: string, value: any): EntityBuilder;
  build(): TitaniumEntity;
}
```

Esto asegura que si cambiamos la estructura en el futuro, solo tocamos el Builder.

### 2.5 Áreas Soberanas Humanas

Para preservar la voz del autor, el AI tiene estrictamente **PROHIBIDO** modificar bloques marcados como:

```markdown
<!-- SOVEREIGN START -->
Cualquier texto aquí es sagrado. El AI puede leerlo pero JAMÁS
intentará formatearlo, resumirlo o "corregirlo".
<!-- SOVEREIGN END -->
```

El `scribePatchFile` debe detectar estos bloques y protegerlos byte a byte durante cualquier fusión.

---

## 🛑 3. Mitigación de Deuda Técnica (Fase 3)

### 3.1 Dependencia Circular en Soul Sorter
**Riesgo:** El `soul_sorter` detecta una entidad -> La enriquece -> Actualiza el archivo -> `onSnapshot` detecta el cambio -> Dispara `soul_sorter` de nuevo.
**Solución:** Implementar un **"Hash de Idempotencia"**. Antes de procesar un archivo, calcular `sha256(content)`. Si el hash en Firestore (`lastSoulSortedHash`) coincide, abortar el proceso inmediatamente.

### 3.2 Condición de Carrera (Race Condition)
**Riesgo:** `scribePatchFile` actualiza Drive y luego Firestore. Si el usuario edita el archivo en Drive *mientras* la función corre, los cambios del usuario podrían sobrescribirse.
**Solución:** Usar `revisionId` de Drive para asegurar escrituras atómicas (Optimistic Locking). Si la revisión en el servidor es mayor a la que la función leyó, fallar y reintentar.

---

**Siguientes Pasos:** Esperar aprobación del Arquitecto Jefe para proceder con la implementación de la Fase 2 (Refactorización de `TitaniumFactory` y `scribePatchFile`).
