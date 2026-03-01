# 🏛️ El Plano Universal: Ontología Funcional y Ciclo de Vida de Metadatos

## 1. La Auditoría Sistémica Profunda (Rastreo a la Raíz)

### A. Puntos de Entrada de Creación (Por qué fallan)
1. **`scribeCreateFile`**: Aún depende de `inferencePrompt` para adivinar un string de tipo (`type`) heredado ('character', 'location'). Utiliza `legacyTypeToTraits` como una ocurrencia tardía. Genera el cuerpo a través de `defaultBody` que tiene secciones codificadas en lugar de secciones basadas en rasgos (traits).
2. **`crystallizeGraph`**: Utiliza un masivo `TYPE_ROLE_MAP` con strings codificados ('person', 'place') para enrutar archivos a carpetas. Instruye a la IA para que genere contenido basado en el string `type` heredado. El contenido generado se adjunta a archivos existentes manualmente (`appendContent = ...`) sin analizar completamente los metadatos existentes.
3. **`genesisManifest`**: Codifica `TYPE_SOUL`, `TYPE_BEAST`, etc., y construye manualmente el `context` (contenido del cuerpo) utilizando strings codificados como `## 📝 Descripción`. Infiere rasgos estáticamente (`traits = ['sentient']` para `TYPE_SOUL`).
4. **`forgeToolExecution`**: La única implementación limpia que en su mayoría delega en `TitaniumGenesis.birth`, pero aún pasa un rol codificado: `role: "Tool Generated"`.

**Causa Raíz:** La tubería `TitaniumGenesis.birth` y `TitaniumFactory.forge` se trata como un paso de formato final, en lugar del motor de razonamiento central. Las herramientas de IA todavía están instruidas para pensar en "Categorías Cosméticas" (Tipos) en lugar de "Capacidades Funcionales" (Rasgos - Traits).

### B. La Lógica de Parcheo (`scribePatchFile`)
* **Fragilidad:** `scribePatchFile` usa `SmartSyncService.reconcile` lo cual es bueno, pero el prompt de IA en `scribePatchFile` le dice a la IA: "PRESERVA el Frontmatter... PRODUCE el contenido COMPLETO y VÁLIDO del archivo Markdown."
* **El Bucle:** Si un usuario edita un archivo en Drive, `soul_sorter` lo detecta y actualiza Firestore. Si `scribePatchFile` actualiza el archivo, esto desencadena un cambio en Drive, que `soul_sorter` detecta. `SmartSyncService.reconcile` intenta romper este bucle usando un hash de comprobación (`TDB_Index`), pero si el análisis de metadatos no logra extraer campos nuevos, los datos se pierden o se revierten. El `SmartSyncService.parseBlockquoteMetadata` solo admite patrones Regex específicos (`**Key**: Value`), ignorando otras representaciones válidas en Markdown.

### C. Consumo de Datos (`useDirectorChat` & `LaboratoryPanel`)
* **`useDirectorChat`**: Pasa `activeFileContent` directamente a la IA. Si el archivo está inflado con "Datos Fantasma" (ej., `age: unknown`, `status: active`, `last_updated: ...`), la IA consume tokens preciosos en datos administrativos inútiles.
* **`LaboratoryPanel`**: Depende de una lógica compleja de aplanamiento de carpetas para encontrar recursos. Lee los archivos directamente. Si los metadatos son inconsistentes, el filtrado se rompe.

---

## 2. La Arquitectura Unificada

### A. La Interfaz Universal de Entidad (Basada en Rasgos / Traits)
```typescript
// functions/src/types/ontology.ts
export type EntityTrait =
    | 'sentient'    // Capaz de hablar, tiene agencia
    | 'tangible'    // Presencia física, masa
    | 'locatable'   // Tiene coordenadas, puede ser visitado
    | 'temporal'    // Ocurre en el tiempo, tiene duración
    | 'organized'   // Grupo de entidades
    | 'abstract';   // Concepto, ley, magia

export interface TitaniumEntity {
    id: string; // Nexus ID
    name: string;
    traits: EntityTrait[]; // La definición central
    attributes: {
        role?: string;
        aliases?: string[];
        tags?: string[];
        _sys: {
            status: 'active' | 'archived';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string;
            schema_version: '3.0';
            nexus_id: string;
        };
        [key: string]: any; // Capacidades dinámicas (ej. 'coordinates' si es 'locatable')
    };
    bodyContent: string;
}
```

### B. El Analizador "Smart-Sync" (Middleware)
* **Problema:** `SmartSyncService.parseBlockquoteMetadata` está atado a Regex.
* **Solución:** Evolucionarlo a un verdadero analizador AST (usando `marked` o `mdast`). En lugar de solo buscar blockquotes, debería extraer CUALQUIER par clave-valor representado claramente en el texto (ej., listas de definición de Markdown, tablas, o `**Clave**: Valor` estándar a través de todo el documento, no solo el primer blockquote).

### C. Poda de Metadatos (Exorcismo de Datos Fantasma)
`TitaniumFactory.pruneGhostMetadata` ya maneja algunos, pero debemos aplicar esto globalmente antes de cualquier ingestión RAG (`GeminiEmbedder`) o inyección de contexto de chat (`useDirectorChat`).
**Campos a Eliminar Permanentemente:**
- `type` (Reemplazado por `traits`)
- `category` (Enrutamiento heredado de Firestore)
- `age: unknown` / `role: unknown` (Señal nula)
- `status`, `tier`, `id`, marcas de tiempo a nivel raíz (Deben estar estrictamente dentro de `_sys`).

### D. Estandarización entre Herramientas
Todas las herramientas (`scribeCreateFile`, `crystallizeGraph`, `genesisManifest`, `forgeToolExecution`) deben dejar de codificar `## 📝 Descripción`.
Deben usar un único `TitaniumPromptBuilder` que construya dinámicamente el prompt de la IA basado en los `traits` solicitados.

### E. Áreas Soberanas Humanas
`SmartSyncService.protectSovereignAreas` actualmente utiliza `<!-- SOVEREIGN START -->`. Debemos formalizar esto. Cualquier contenido entre estos marcadores es tratado como una caja negra por `scribePatchFile`. A la IA se le instruye que nunca lo modifique.

---

## 3. Mitigación de Deuda Técnica

* **Condiciones de Carrera (Race Conditions):** `scribePatchFile` actualiza Drive -> Drive dispara un webhook -> `soul_sorter` se ejecuta. La mitigación en `SmartSyncService.reconcile` (comprobando el hash `TDB_Index`) es correcta, pero `soul_sorter` debe *también* comprobar este hash antes de actualizar Firestore para evitar escrituras redundantes.
* **Dependencias Circulares:** Asegurar que `legacy_adapter.ts` solo se utilice en los bordes (al leer datos antiguos), y NUNCA al escribir datos nuevos.
