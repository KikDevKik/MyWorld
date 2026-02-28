# Titanium Data Architecture: Unified Blueprint V3.0

## 🎯 El Desafío Sistémico (Caos Entrópico)

El proyecto se enfrenta a una fragmentación en el ciclo de vida de entidades. Actualmente:
1. **Crisis de Fuente de Verdad:** Existe una desincronización frecuente entre el Frontmatter YAML y el contenido Markdown.
2. **Fragmentación del Esquema:** Múltiples puntos de entrada (`scribeCreateFile`, `crystallizeGraph`, `genesisManifest`, `forgeToolExecution`) utilizan plantillas rígidas e inconsistentes (tipos como `character`, `location`) en lugar de depender exclusivamente de la Factory.
3. **Bloat de Metadatos Fantasma:** Campos inútiles como `age: unknown` o `status: active` ensucian el RAG y consumen la ventana de contexto de los Agentes.
4. **Fragilidad de Análisis:** La canalización no procesa bloques narrativos ni cabeceras funcionalmente.

---

## 🏛️ Los 3 Pilares de los Datos de Titanium

### 1. Esquema Dinámico por Capacidades (Ontología Funcional)
Adiós a los tipos cosméticos (`type: character`). Implementaremos un sistema de **Traits** (rasgos) funcional:
* `sentient`: Entidad con agencia, diálogo, voluntad.
* `tangible`: Posee masa y presencia física.
* `locatable`: Tiene coordenadas o sirve como escenario.
* `temporal`: Está ligado al tiempo (Evento, Era).
* `organized`: Grupo o facción.
* `abstract`: Concepto, magia, ley natural.

### 2. Integridad Bidireccional
Cualquier cambio en el Markdown (ej., bloque `> **Rol**: Antagonista`) deberá reflejarse en el YAML y en Firestore mediante un sistema de reconciliación "Smart-Sync".

### 3. Serialización Optimizada para RAG (Anti-Makeup Policy)
Despojaremos los metadatos fantasma antes de pasarlos a Gemini 3.0 para maximizar la "Señal Creativa".

---

## 🛠️ Fase 1: Auditoría Sistémica Profunda (Trace-to-Root)

### 1. Puntos de Entrada de Creación
* **`crystallizeGraph`**: Genera nodos basándose en cadenas arcaicas del V2 (e.g., `type: 'character'`). No llama a la Factory correctamente para limpiar metadatos.
* **`scribeCreateFile`**: Delega la materialización a `TitaniumGenesis.birth`, pero aún arrastra el "Legacy Adapter" inyectando atributos `type` en base al contexto anterior.
* **`forgeToolExecution`**: Utiliza IA para inferir rasgos, lo cual es correcto para V3.0, pero depende de `genesisManifest` donde se conservan estructuras obsoletas en el RAG.
* **`genesisManifest`**: Recorre listas de entidades creando diccionarios de datos que perpetúan los atributos fijos en lugar de inferirlos dinámicamente si no se proveen.

### 2. Lógica de Parcheo (`scribePatchFile`)
Actualmente, `scribePatchFile` utiliza `SmartSyncService.reconcile` (Middleware 3.0), el cual invoca a `TitaniumFactory.forge`. Sin embargo, hay un riesgo de **Echo Loop** (Condición de Carrera) si el "Guardian Hash" en `TDB_Index` no se actualiza a tiempo antes de que `soul_sorter` escanee el mismo archivo modificado en Drive.

### 3. Consumo de Datos (Contexto AI)
* **`useDirectorChat`**: Al enviar el historial y el archivo activo, inyecta accidentalmente todo el YAML (incluyendo campos `_sys` y legacy). El modelo procesa tokens basura antes de la narrativa real.
* **`LaboratoryPanel`**: Filtra correctamente las rutas de recursos pero al hacer `flatten(fileTree)`, expone los nodos completos en lugar de las variables sanitizadas para el contexto del laboratorio.

---

## 📐 Fase 2: El Blueprint Unificado

### 1. La Interfaz de Entidad Universal (TypeScript)

```typescript
export type EntityTrait =
    | 'sentient'
    | 'tangible'
    | 'locatable'
    | 'temporal'
    | 'organized'
    | 'abstract';

export interface TitaniumEntityV3 {
    id: string; // Hash Determinista
    name: string; // H1 Canónico
    traits: EntityTrait[]; // Funcionalidad pura

    attributes: {
        role?: string;
        aliases?: string[];
        tags?: string[];
        // Todos los metadatos cosméticos van a la capa dinámica.
        [key: string]: any;
    };

    // Capa de control interno
    _sys: {
        schema_version: '3.0';
        nexus_id: string;
        status: 'active' | 'archived' | 'ghost';
        tier: 'ANCHOR' | 'DRAFT';
        last_sync: string;
        legacy_type?: string; // Mantenido temporalmente para puentes migratorios
    };

    bodyContent: string; // Contenido protegido (Soberano)
}
```

### 2. El Middleware "Smart-Sync" (Parser Bidireccional)
1. **Extracción (Read):** Al detectar una actualización en Drive, el `SmartSyncService` extraerá el primer `blockquote` (`> **Key**: Value`) del Markdown.
2. **Reconciliación (Merge):** Si el valor del Markdown difiere del YAML, **el Markdown (Humano) siempre gana**.
3. **Forjado (Write):** `TitaniumFactory.forge` reconstruirá el documento:
   - Elimina el `type` y lo convierte a `traits`.
   - Asegura la presencia del bloque de cabecera H1.
   - Poda los campos inútiles.

### 3. Poda de Metadatos (Ghost Metadata)
Los siguientes atributos proporcionarán "Señal Creativa 0" y serán purgados de la raíz del YAML:
* `age`: Si es "unknown", "desconocido", o está vacío.
* `status`: Movido obligatoriamente a `_sys.status`.
* `tier`: Movido obligatoriamente a `_sys.tier`.
* `role`: Si es "unknown" o "unregistered entity".
* `last_titanium_sync` / `created_at`: Purgados y sustituidos por `_sys.last_sync`.
* `id`: Purgado de la raíz y reemplazado por `_sys.nexus_id`.

### 4. Estandarización Cruzada de Herramientas
Tanto `crystallizeGraph` (WorldEngine), `genesisManifest` (Génesis), y `forgeToolExecution` (La Forja) invocarán a **`TitaniumGenesis.birth`**. Éste, a su vez, usará estrictamente `TitaniumFactory.forge`. Se prohibirá el forjado manual de strings YAML en cualquier parte del código.

### 5. Áreas Soberanas Humanas
El bloque delimitado por `<!-- SOVEREIGN START -->` y `<!-- SOVEREIGN END -->` será procesado por `SmartSyncService.protectSovereignAreas`.
Se convertirá temporalmente en `{{SOVEREIGN_BLOCK_X}}` antes de enviarlo a cualquier modelo de la IA, previniendo alteraciones en la prosa original y asegurando que "La voz del Autor" permanece intocable.

---

## 🛡️ Fase 3: Mitigación de Deuda Técnica (Cohesion Shield)

### 1. Riesgo de "Echo Loops" (Condición de Carrera)
* **El Problema:** Al actualizar un archivo desde la aplicación (`scribePatchFile`), se dispara un cambio en Google Drive, lo que provoca que `soul_sorter` (webhook) vuelva a descargar y analizar el archivo, generando un ciclo infinito si actualiza nuevamente Firestore o Drive.
* **La Solución (Guardian Hash):** Al invocar `scribePatchFile`, se calculará inmediatamente el hash `SHA-256` del archivo recién forjado y se escribirá en la colección `TDB_Index`. Cuando `soul_sorter` reciba la señal, comparará el hash entrante con el almacenado. Si coinciden, la actualización se ignora silenciosamente.

### 2. Puente Migratorio de Herramientas
* **`legacy_adapter.ts`:** Se conservará la función `traitsToLegacyType` para componentes antiguos como `NexusCanvas.tsx`, que dependen de renderizados por colores basados en `type` (e.g., azul para `character`, verde para `location`).
* Esto evitará que la migración rompa el Arsenal (Forja y UI Visual) mientras se implementan los selectores basados en Traits en las siguientes fases.
