# 01. ARQUITECTURA Y DATOS (EL NÚCLEO)

VERSIÓN: 5.0 (Fase Alpha - ECS Hybrid Migration)
ESTADO: EN PRODUCCIÓN

## 1. LA VISIÓN: LA CATEDRAL Y EL BÚNKER
El sistema es un híbrido "Nube-Local".
- **El Cerebro (La Catedral):** Motores Gemini (Flash para procesos en tiempo real, Pro para análisis profundos).
- **El Cuerpo (Titanium Shell):** Frontend en React + Vite + Tailwind CSS.
- **La Memoria (El Búnker):** Google Drive como única fuente de la "Verdad Física" (.md). Firestore actúa como la "Verdad Indexada" (caché y metadatos) y registro legal (`audit_log`).

## 2. EL PARADIGMA ECS (Entity-Component-System)
El sistema ha migrado de una arquitectura de documentos monolíticos a un sistema ECS. 
Todas las entidades (personajes, lugares, objetos) conviven en una única colección plana: `users/{uid}/WorldEntities`.

### El Contrato Maestro: `WorldEntity`
La interfaz de base consta de metadatos centrales y submódulos (Componentes).
- **Core:** `id`, `name`, `category` (PERSON, CREATURE, LOCATION, OBJECT, CHAPTER), `tier` (ANCHOR, LIMBO, GHOST).
- **Componentes (Modules):**
  - `.forge`: Datos para la tarjeta de personaje (`summary`, `tags`, `aliases`).
  - `.nexus`: Grafo de relaciones (`relations: [{ targetId, relationType, context }]`).
  - `.guardian`: Metadatos de auditoría (`occurrences`, `firstMentionedIn`).
  - `.judgement`: Persistencia de la IA crítica (`tribunalVerdicts`, `lastInspectorReport`, `lastJudgedAt`).

**Ventaja:** Permite Upserts granulares mediante `EntityRepository.upsertEntity({ merge: true })`. Una Cloud Function puede actualizar las estadísticas del Nexus sin sobrescribir o perder los datos de la Forja.

## 3. GESTIÓN DE ESTADO FRONTEND (Zustand & Adaptadores)
Para evitar el prop-drilling y el colapso de renders, el Frontend utiliza **Zustand**.
- `useLayoutStore`: Controla el estado visual del "Modo Zen", paneles laterales y qué herramienta (Gem) está activa en el Arsenal.
- `useArquitectoStore` / `useLanguageStore`: Mantienen el contexto y el idioma sin depender del React Tree.

**Adaptadores Zero-Break:**
Dado que el código JSX antiguo (`ForgeCard`, `NexusCanvas`) esperaba objetos específicos, se utilizan funciones puente (`toSoulEntity`, `toGraphNode`) que leen de la colección plana ECS y mapean los datos al vuelo para la interfaz, garantizando retrocompatibilidad visual absoluta.

## 4. SEGURIDAD Y CONCURRENCIA (Protocolos Invisibles)
- **Bloqueo Mutex (useFileLock):** Un mecanismo de concurrencia diseñado para el modo Enterprise. Utiliza `sessionStorage` para mantener un `SESSION_ID` persistente ante recargas del navegador, evitando "Zombies Locks". Crea un bloqueo en la base de datos `users/{userId}/file_locks` con latidos de red (heartbeats).
- **Auditoría Creativa (Caja Negra):** Registra cada inyección manual o acción sobre el lienzo. La data es inmutable (regla de no-edición en Firestore). Sirve como notario digital para generar Certificados de Autoría legales que protegen al escritor de falsas acusaciones de uso masivo de IA.
