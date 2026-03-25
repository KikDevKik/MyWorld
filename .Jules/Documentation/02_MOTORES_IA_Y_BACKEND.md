# 02. MOTORES IA Y BACKEND

VERSIÓN: 5.0 (Fase Alpha - ECS Hybrid Migration)
ESTADO: EN PRODUCCIÓN

## 1. PIPELINE DE INGESTIÓN (HÍBRIDO CERO-TOKENS)
El archivo `functions/src/ingestion.ts` ya no inyecta documentos enteros a la IA. Opera bajo un flujo de 4 fases para eficiencia extrema:

1. **AST Parser (Zero Tokens):** Extrae el Frontmatter YAML y los enlaces explícitos (`[[Link]]`) de los archivos de Drive.
2. **Motor Semantic Delta:** Trocea el texto por párrafos semánticos (`\n\n`) y compara el Hash criptográfico de cada uno con la base de datos. Descarta todo lo que ya ha sido indexado.
3. **Lexer de Alta Velocidad (Aho-Corasick):** Usa un árbol trie (Trie) para realizar una búsqueda determinista de nombres y aliases sobre el delta, a coste `O(n)`. Incrementa el `guardian.occurrences` de cada entidad encontrada.
4. **AI Event Emitter (Batched):** Agrupa el texto nuevo en lotes semánticos de max 15,000 caracteres y lo envía al Escriba. La IA ya no clasifica la entidad; está forzada a devolver un JSON estricto (`Structured Output`) que emite **Eventos Narrativos** o **Nuevas Relaciones** para el componente `.nexus`.
5. **Upsert ECS:** Consolida la data a través de `EntityRepository`.

## 2. EL TRÍPTICO GENERATIVO (Creadores)
Las entidades que generan bases de la nada.

### A. Génesis (`genesis.ts`)
Asistente socrático. Extrae estilos de voz (FPS/TPS) y crea de manera recursiva la estructura física en Drive. Ya no utiliza `TYPE_SOUL`; asigna categorías nativas (`PERSON`, `LOCATION`) compatibles con ECS e invoca `TitaniumGenesis.birth`.

### B. La Musa / Laboratorio (`IdeaWizardModal.tsx`)
Un chat aislado y juguetón (Gemini Flash). Acompaña al autor en tormentas de ideas. Puede invocar la acción **"Cristalizar"**, llamando a `scribeCreateFile` para transformar una simple charla en una nueva entidad formal dentro de la Bóveda, mapeada a `WorldEntities`.

### C. El Escriba (`scribe.ts`)
Encargado de la asimilación profunda. Posee protección de regiones sagradas ("Sovereign Blocks") usando delimitadores HTML para que la IA no destruya el canon duro al integrar texto.

## 3. LA CORTE DE EVALUACIÓN (Jueces y Vigilantes)
Operan como módulos pasivos o de consulta.

### A. El Guardián (Canon Radar)
Proceso constante y en la sombra. Calcula el *Personality Drift* cruzando los vectores del nuevo párrafo contra la ficha psicológica del personaje. Evalúa *Lore Fractures*.

### B. El Director & El Inspector (`forgeAnalyzer`)
El Director posee "Memoria a Largo Plazo" (RAG). El *Inspector* puede ser invocado para leer la escena activa y deducir quién habla, actualizando silenciosamente el campo `lastInspectorReport` en el ECS.

### C. El Tribunal (`summonTheTribunal`)
Consulta pesada y estricta:
- **El Arquitecto:** Fallos de estructura y lógica.
- **El Bardo:** Fluidez, prosa y evocación emocional.
- **El Hater:** Destrucción sistemática de clichés y viabilidad comercial.
Sus veredictos se persisten ahora en `.judgement.tribunalVerdicts` evitando fugas de tokens en el frontend.
