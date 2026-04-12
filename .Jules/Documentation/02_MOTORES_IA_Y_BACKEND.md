# 02. MOTORES IA Y BACKEND

VERSIÓN: 6.0 (Fase Alpha - RAG Agéntico & Paginación)
ESTADO: EN PRODUCCIÓN

## 1. PIPELINE DE INGESTIÓN Y ENRIQUECIMIENTO
- **Psychology Enrichment [NUEVO]:** `enrichEntity` ahora extrae variables socráticas (Miedos, Heridas, Mentiras) para personajes `PERSON` y `CREATURE`.
- **Filtro de Contaminación Cruzada:** Todas las consultas de backend (`chunks`, `WorldEntities`, `Timeline`) ahora filtran estrictamente por `projectId`.

## 2. EL ARQUITECTO V2 (OJO DE CLAUDE)
El motor de planificación ha evolucionado a un sistema Agéntico:

### RAG Multi-hop [COMPLETADO]
1. **Salto 1 (Base):** Recupera hasta 150 chunks iniciales del proyecto.
2. **Double-Hop (Entidades):** Detecta menciones de entidades en el texto base y realiza una segunda consulta automática para inyectar su lore oficial.
3. **Raw Hop (Minería Masiva):** Si el canon está vacío, extrae hasta 40 chunks adicionales de alta densidad semántica sobre conceptos huérfanos.

### Paginación Narrativa [COMPLETADO]
`arquitectoGenerateRoadmap` soporta ahora generación iterativa.
- **Mecánica:** Si el LLM detecta que la obra es extensa, marca `hasMorePhases: true`. El frontend orquestadora llamadas en cadena hasta completar el Roadmap sin exceder límites de salida ni timeouts.

### Protocolos de Prioridad
- **Tabula Rasa:** Guía socrática para proyectos vacíos.
- **Caos Estructural:** Postura inquisidora para proyectos con texto crudo pero sin canon estructurado.

## 3. EL GUARDIÁN OMNISCIENTE [EN PROGRESO]
- **`auditGlobal`:** Nueva Cloud Function que construye el grafo NDG y detecta paradojas temporales cruzando el Timeline con la base de datos de entidades. Instruido con "Máximo Rigor" para detectar fallas sistémicas (economía, política, biometría).

## 4. EL DIRECTOR PRECISO [NUEVO]
- **Inyección de WorldEntities:** `chatWithGem` ahora identifica entidades mencionadas en la consulta y trae sus fichas completas (psicología + heridas + relaciones) al contexto inmediato de la conversación.

## Actualización Sprint 6.0: Evolución Agéntica [COMPLETADO]
Se ha erradicado la "Ceguera de Inicio". El Arquitecto ahora posee visión profunda sobre el manuscrito crudo y orquesta la cristalización del Roadmap de forma paginada y segura.
