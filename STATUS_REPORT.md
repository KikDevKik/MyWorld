================================================================================
MANIFIESTO DEL PROYECTO TITANIUM: LA CATEDRAL DE CÓDIGO
================================================================================
VERSIÓN: 3.4 (Fase 5 - Estabilización Gemini 3.0 & Perforador V2)
ESTADO: EN DESARROLLO ACTIVO
AUTOR: EQUIPO DE INGENIERÍA (IA + HUMANO)
DOCUMENTOS ANEXOS: FUNCTION_ANALYSIS.md (Inventario Técnico)
--------------------------------------------------------------------------------
1. VISIÓN: LA CATEDRAL Y EL BÚNKER
--------------------------------------------------------------------------------
No estamos construyendo un simple editor de texto. Estamos construyendo una
"Catedral de Titanio": una estructura monumental diseñada para elevar el proceso
creativo humano, sostenida por una infraestructura de seguridad paranoica.
Nuestra filosofía se basa en dos principios en tensión:

1. LA MAGIA (La Catedral): La IA no debe ser un simple autocompletar. Debe ser
un "Espejo Activo" que entienda la trama, detecte contradicciones y visualice
la estructura profunda de la obra.
2. LA SEGURIDAD (El Búnker): La "Verdad" nunca debe perderse. Si la IA falla,
el archivo físico en Google Drive permanece inmutable. La estructura debe ser
lo suficientemente robusta para contener el caos de la creatividad.
--------------------------------------------------------------------------------
2. ARQUITECTURA SAGRADA (EL STACK)
--------------------------------------------------------------------------------
Nuestro sistema es un híbrido "Nube-Local" diseñado para la persistencia absoluta.
[CEREBRO]
* Google Gemini 3.0 (Pro-Preview & Flash-Preview): El motor cognitivo actual.
Usamos modelos de "Alto Razonamiento" (`gemini-3-pro`) para tareas complejas
como el Tribunal y el Perforador, y modelos "Flash" para velocidad (chat, RAG).

[CUERPO]
* Frontend: React + Vite + Tailwind CSS. Una interfaz "Titanium Shell" oscura.
* Backend: Firebase Cloud Functions (Node.js 20+). Serverless.
* Análisis: 37 Funciones Cloud especializadas (Ver `FUNCTION_ANALYSIS.md`).

[MEMORIA]
* Nivel 0 (La Verdad Física): Google Drive. Archivos Markdown (.md) reales.
* Nivel 1 (La Verdad Indexada): Firestore `TDB_Index`. Metadatos y Vectores.
--------------------------------------------------------------------------------
3. LOS PILARES (COMPONENTES MAYORES)
--------------------------------------------------------------------------------
A. LA FORJA DE ALMAS (THE FORGE)
--------------------------------
El laboratorio alquímico donde nacen las entidades.
* Propósito: Creación, interrogatorio y materialización de personajes y lore.
* Estado: ACTIVO.
* Tecnología Clave:
- `ForgeChat`: Chat contextual con memoria a largo plazo.
- `Deep Context Enrichment`: Análisis profundo de personajes usando RAG.
- `Synchronizer`: Sincronización bidireccional (Drive <-> DB) de rasgos.

B. EL PERFORADOR DE MUNDOS V2 (WORLD ENGINE)
--------------------------------------------
El sistema visual que conecta los puntos invisibles.
* Propósito: Visualización de grafos, física de fuerzas y detección de tramas.
* Estado: ESTABILIZACIÓN.
* Tecnología Clave:
- `WorldEnginePanelV2`: Lienzo infinito con física `d3-force` optimizada.
- `Titan Link`: Motor de razonamiento que sugiere conexiones lógicas entre nodos.
- `Sanctity Filter`: Lista blanca estricta para evitar ruido en el grafo.
- `Micro-Cards`: Interfaz de nodos compacta y funcional.

C. EL LABORATORIO DE IDEAS (LABORATORY)
---------------------------------------
Un espacio de estudio aislado del Canon principal.
* Propósito: Investigación y consulta de referencias sin contaminar la trama.
* Estado: ACTIVO.
* Tecnología Clave:
- `Librarian Gem`: Asistente virtual (`gemini-2.5-flash`) especializado en RAG.
- `Reference Tab`: Separación estricta entre archivos del Proyecto y Biblioteca.
- `Study Mode`: Análisis focalizado de documentos de referencia.
--------------------------------------------------------------------------------
4. HERRAMIENTAS DE OFICIO
--------------------------------------------------------------------------------
Módulos especializados que extienden las capacidades del sistema.

A. EL TRIBUNAL LITERARIO (`summonTheTribunal`)
----------------------------------------------
Un consejo de tres jueces IA (Arquitecto, Bardo, Hater) que emite veredictos
sobre el estilo, la lógica y el mercado. Totalmente integrado.

B. EL CRONOGRAMA (DUAL-WRITE TIMELINE)
--------------------------------------
El historiador del sistema. Sincroniza eventos entre una base de datos rápida
(Firestore) y un archivo maestro JSON en Drive ("La Verdad"), asegurando que
la cronología nunca se pierda.

C. LA IMPRENTA (`compileManuscript`)
------------------------------------
Motor de publicación en PDF.
* Capacidad: Compilación multi-archivo, portadas, detección inteligente de capítulos.
* Nota: Exportación EPUB pospuesta para el futuro.

--------------------------------------------------------------------------------
5. TRABAJO ACTUAL (FASE DE ESTABILIZACIÓN)
--------------------------------------------------------------------------------
El enfoque absoluto del equipo de ingeniería está en:
1. **Perforador de Mundos V2**: Asegurar que la física, la persistencia (Lifeboat)
   y la cristalización de nodos funcionen sin fallos.
2. **Laboratorio**: Refinar la experiencia de consulta de referencias.
3. **Integración Gemini 3.0**: Optimizar los prompts para los nuevos modelos.

--------------------------------------------------------------------------------
6. EL FUTURO (MISSING / BACKLOG)
--------------------------------------------------------------------------------
Elementos identificados pero pospuestos intencionalmente:
* [ ] Exportación EPUB en La Imprenta.
* [ ] Edición colaborativa en tiempo real (Multi-User).

--------------------------------------------------------------------------------
NOTA FINAL
--------------------------------------------------------------------------------
Este documento refleja el estado del sistema en la versión 3.4.
La prioridad es la estabilidad y la profundidad del análisis narrativo.
La "Catedral" está construida; ahora estamos puliendo los vitrales.
