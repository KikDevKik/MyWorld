# Auditoría del Ciclo de Vida de Entidades Titanium

**Estado:** Borrador
**Arquitecto:** Jules
**Fecha:** 2024-05-22

---

## 🏗️ Fase 1: Auditoría Sistémica Profunda (Hallazgos)

### 1. Puntos de Entrada de Creación (Fuente de Entropía)
*   **`scribeCreateFile` (functions/src/scribe.ts):** Utiliza `TitaniumFactory.forge`, pero depende de `legacyTypeToTraits` para mapear tipos heredados (`character`, `location`) a rasgos. Por defecto asigna `role` como "Entidad Registrada" y `tier` como "ANCHOR". El prompt de "Inferencia" solicita explícitamente tipos heredados, reforzando el viejo esquema.
*   **`crystallizeGraph` (functions/src/crystallization.ts):** Utiliza `TitaniumFactory.forge`, pero inyecta tipos estáticos basados en los nodos del grafo (que a menudo son heredados).
*   **`genesisManifest` (functions/src/genesis.ts):** Utiliza `TitaniumFactory.forge`, estandarizando efectivamente la creación, pero hereda el `type` legado pasado desde el asistente (wizard).
*   **`forgeToolExecution` (en `forge_chat.ts`):** Utiliza herramientas como `consult_archives` que dependen de búsquedas vectoriales sobre `chunks`. No crea archivos directamente, pero consume datos fragmentados que carecen de contexto ontológico si no está presente en el cuerpo del texto.

### 2. La Lógica de Parcheo (Mutación)
*   **`scribePatchFile` (functions/src/scribe.ts):** Respeta `TitaniumFactory.forge` para regenerar el archivo. Sin embargo, su lógica "Smart-Sync" depende de `extractMetadataFromBody`, que solo analiza `H1 (# Nombre)` y `Blockquote (> *Rol*)`. Ignora secciones funcionales como `### 🏛️ Lore` o `### 📍 Coordenadas`, lo que lleva a pérdida de datos si la IA actualiza el cuerpo pero no el Frontmatter.
*   **Mecanismo de Debounce:** Utiliza `last_titanium_sync` (debounce de 5000ms) para prevenir bucles infinitos, lo cual es robusto.

### 3. Consumo de Datos (Datos Fantasma)
*   **`janitor.ts` (El Centinela):** La función `scanVaultHealth` ignora los metadatos (solo verifica el tamaño del archivo). Sin embargo, `scanProjectDrift` depende de `data.category === 'character'`.
*   **`guardian.ts` (El Director):** La función `auditContent` extrae entidades usando tipos estáticos hardcodeados (`character`, `location`). Consume `chunks` de Firestore.
*   **`ingestion.ts` (El Sistema Digestivo):** Este es el punto crítico de fallo. Establece `category: file.category || 'canon'`. *No* extrae el Tipo de Entidad del contenido o metadatos del archivo. Esto causa que `scanProjectDrift` (que busca `category: 'character'`) falle o dependa de coincidencias de ruta frágiles (`path.includes('personajes')`).
*   **`forge_chat.ts` (RAG):** La herramienta `consult_archives` realiza una búsqueda vectorial en `chunks`. Ignora los metadatos del Frontmatter a menos que también estén presentes en el cuerpo del texto. Esto confirma que campos como `age`, `status`, `aka` en el Frontmatter son "Datos Fantasma" para la tubería RAG.

---

## 🏛️ Fase 2: El Blueprint Unificado

### 1. La Interfaz Universal de Entidad (Ontología Funcional)
Nos movemos de **Tipos Estáticos** (`type: character`) a **Rasgos Dinámicos** (`traits: ['sentient', 'faction']`).

```typescript
// Definición Propuesta
export type EntityTrait =
    | 'sentient'   // Tiene agencia, psicología, diálogo
    | 'location'   // Tiene coordenadas, atmósfera, detalles sensoriales
    | 'artifact'   // Tiene utilidad, origen, mecánicas
    | 'event'      // Tiene línea temporal, participantes, consecuencias
    | 'faction'    // Tiene ideología, miembros, influencia
    | 'concept'    // Tiene definición, reglas, filosofía
    | 'hub'        // Es un contenedor para otras entidades (ej. Carpeta/Mapa)

export interface TitaniumEntity {
    id: string;          // ID Nexus
    name: string;        // Nombre Canónico
    traits: EntityTrait[]; // ONTOLOGÍA FUNCIONAL
    attributes: {
        role: string;       // "Protagonista", "Capital" (Solo visualización)
        aliases: string[];  // Para coincidencia RAG
        tags: string[];     // Taxonomía definida por usuario
        [key: string]: any; // Flexible para datos específicos de rasgos
    };
    bodyContent: string; // La Verdad Soberana
}
```

### 2. El Parser "Smart-Sync" (Middleware)
Un motor de sincronización bidireccional que trata el Cuerpo Markdown como la Fuente de Verdad para datos *narrativos*, y el Frontmatter para datos del *sistema*.

*   **Lógica:**
    1.  **Parsear AST del Cuerpo:** Extraer `H1` (Nombre), `> *Rol*`, `### 📍 Coordenadas`, `### 🏛️ Lore`.
    2.  **Comparar:** Verificar contra el Frontmatter.
    3.  **Sincronizar:** Si el Cuerpo cambió, actualizar Frontmatter. Si el Frontmatter cambió (vía UI), actualizar Cuerpo (reinyectar en plantilla).
    4.  **Podar:** Eliminar cualquier campo del Frontmatter no presente en el Cuerpo o en la lista de "Campos de Sistema Permitidos".

### 3. Poda de Metadatos (La Purga)
Los siguientes campos proveen **Cero Señal** a la tubería actual de RAG/Director y deben ser purgados:

*   `age` (a menos que sea parte de un rasgo 'timeline')
*   `status` (el defecto siempre es 'active')
*   `tier` (el defecto siempre es 'ANCHOR' o 'canon')
*   `aka` (redundante con `aliases`)
*   `appearance` (debe estar en el Cuerpo)
*   `personality` (debe estar en el Cuerpo)
*   `history` (debe estar en el Cuerpo)

**Campos de Sistema Permitidos:**
*   `id` (ID Nexus)
*   `traits` (La Ontología)
*   `tags` (Taxonomía de Usuario)
*   `last_titanium_sync` (Sistema)
*   `created_at` (Sistema)

### 4. Estandarización Cruzada de Herramientas
*   **`TitaniumFactory.forge`** se convierte en el **único** método permitido para generar contenido de archivo.
*   **`ingestion.ts`** debe ser refactorizado para extraer `traits` del contenido/metadatos del archivo y almacenarlos en los `chunks` (ej. `traits: ['sentient']`) en lugar de la ambigua `category`.
*   **`scanProjectDrift`** debe consultar el array `traits` (ej. `traits array-contains 'sentient'`) en lugar de `category == 'character'`.

### 5. Áreas Soberanas Humanas
Se prohíbe a la IA auto-formatear o "corregir":
*   **Bloques de Diálogo:** Texto entre "comillas".
*   **Clases CSS Personalizadas:** Cualquier etiqueta HTML/JSX.
*   **Bloques de Código:** Contenido dentro de \`\`\`.

---

## 🧱 Fase 3: Mitigación de Deuda Técnica

### 1. Colisión de Esquema (La Crisis de "Category")
*   **Problema:** `ingestion.ts` usa `category` para denotar **Nivel** (Canon/Referencia), mientras que `janitor.ts` lo usa para denotar **Tipo** (Personaje/Lugar).
*   **Solución:** Dividir en dos campos distintos en los `chunks` de Firestore:
    *   `tier`: 'CANON' | 'REFERENCE' | 'ARCHIVE'
    *   `traits`: ['sentient', 'location', ...]

### 2. Condiciones de Carrera (Race Conditions)
*   **`scribePatchFile` vs `ingestion`:** `scribePatchFile` actualiza Drive, lo que dispara una notificación push o sondeo (si está implementado). Actualmente, `scribePatchFile` también llama manualmente a `ingestFile` ("Fire & Forget"). Si el observador estándar de Drive también dispara la ingestión, tenemos una carrera de doble escritura.
    *   **Mitigación:** `scribePatchFile` debería confiar en el disparador central de `ingestion` si es posible, o `ingestion` debería usar `contentHash` (lo cual ya hace) para saltar duplicados de manera idempotente.

### 3. Dependencia Circular
*   **`TitaniumFactory` depende de `legacy_adapter`:** Esto nos impide deprecar completamente los tipos viejos.
    *   **Mitigación:** En la Fase 4 (Migración), debemos ejecutar un script de migración "Big Bang" para convertir todos los archivos existentes a `traits`, y luego eliminar el adaptador.
