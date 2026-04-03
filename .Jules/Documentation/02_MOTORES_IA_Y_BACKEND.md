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

### Evasión de Censura Capa 0 (Google Firewall)
Para evitar el error `PROHIBITED_CONTENT` al analizar textos de ficción oscura (gore, tragedia, violencia), el backend implementa una estrategia de "Dilución de Riesgo":
- **Trunking (Lector Superficial):** Se recorta el input a un máximo de 3,000 caracteres en `distillResource`, eliminando la acumulación masiva de tokens sensibles que disparan las heurísticas de bloqueo.
- **Semantic Framing (Identidad Clínica):** Los prompts fuerzan a la IA a adoptar un rol de "Objective Data Extractor". Al tratar el texto como "dataset de manuscrito" y no como narrativa generativa, se desactivan los filtros morales de la Capa 0.

## 2. EL TRÍPTICO GENERATIVO (Creadores)
Las entidades que generan bases de la nada.

### A. Génesis (`genesis.ts`)
Asistente socrático. Extrae estilos de voz (FPS/TPS) y crea de manera recursiva la estructura física en Drive. Ya no utiliza `TYPE_SOUL`; asigna categorías nativas (`PERSON`, `LOCATION`) compatibles con ECS e invoca `TitaniumGenesis.birth`.

### B. La Musa / Laboratorio (`IdeaWizardModal.tsx`)
Un chat aislado y juguetón (Gemini Flash). Acompaña al autor en tormentas de ideas. Puede invocar la acción **"Cristalizar"**, llamando a `scribeCreateFile` para transformar una simple charla en una nueva entidad formal dentro de la Bóveda, mapeada a `WorldEntities`.

### C. El Escriba (`scribe.ts`)
Encargado de la asimilación profunda. Posee protección de regiones sagradas ("Sovereign Blocks") usando delimitadores HTML para que la IA no destruya el canon duro al integrar texto.

### D. El Arquitecto (`architect.ts`) y el Bucle RAG Agéntico (Multi-hop)
Encargado de la planificación estratégica, ahora opera bajo un "Ojo de Claude" o bucle de pensamiento iterativo (Multi-hop Reasoning):
1. **Salto 1 (Exploración Base):** Recupera los primeros chunks físicos del manuscrito como contexto inicial.
2. **Salto 2 (Profundización NER):** Extrae conceptos clave del texto base usando un LLM a baja temperatura (0.1) y realiza una segunda búsqueda dirigida sobre `WorldEntities` para recuperar el lore específico de esas entidades.
3. **El Veredicto (Prompt Socrático):** Con el contexto consolidado, emite una crítica implacable del worldbuilding y obliga al usuario a elegir entre enfoques de desarrollo tácticos (Mega-Roadmap, Micro-Roadmap Quirúrgico, etc.) sin alucinar problemas inexistentes.

## 3. EL MOTOR RAG Y MEMORIA A LARGO PLAZO
El sistema de recuperación aumentada por generación (RAG) es el corazón de la omnisciencia de las herramientas.

### CONTINUITY_PROTOCOL & Dynamic Top-K
La función `chatWithGem` no usa límites estáticos. Evalúa la importancia de la entidad en el ECS para decidir cuánto contexto inyectar a Gemini 3.1 Pro:
- **Entidades ANCHOR (Protagonistas):** `returnLimit = 150` chunks. Permite a la IA leer capítulos enteros para mantener la coherencia a largo plazo.
- **Entidades GHOST (Menciones):** `returnLimit = 15` chunks. Contexto ligero para identificación rápida.
- **Sentinel Handshake:** El motor detecta proactivamente la falta de índices vectoriales en Firestore y reporta el error directamente al desarrollador con el link de activación necesario.

## 4. LA CORTE DE EVALUACIÓN (Jueces y Vigilantes)
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

## Actualización Sprint 5.6: Flujo del Arquitecto V2
El motor del Arquitecto ha sido reestructurado (Protocolo Fénix V2) para ser modular y resistente:
- **Ojo de Claude:** Usa `fetchInitialContext` (`collectionGroup("chunks").limit(15)`) para escanear el texto crudo del manuscrito y no asumir lienzos en blanco.
- **Enrutador Puro:** `selectArquitectoState` ha sido desacoplado del endpoint, determinando la personalidad de la IA (Triage, Inquisidor, Arquitecto) de forma aislada.
- **Generador Atómico:** `arquitectoGenerateRoadmap` implementa un `WriteBatch` de Firestore aislado dentro de `commitRoadmapTransaction`, para asegurar la creación atómica de tarjetas de Roadmap y pendientes, con un *Pre-Flight Check* que exige una conversación mínima de 3 mensajes.
