# 01. ARQUITECTURA Y DATOS (EL NÚCLEO)

VERSIÓN: 6.0 (Fase Alpha - Neuro-Symbolic Integration)
ESTADO: EN PRODUCCIÓN

## 1. LA VISIÓN: LA CATEDRAL Y EL BÚNKER
El sistema es un híbrido "Nube-Local".
- **El Cerebro (La Catedral):** Motores Gemini (Flash para procesos en tiempo real, Pro para análisis profundos y auditoría socrática).
- **El Cuerpo (Titanium Shell):** Frontend en React + Vite + Tailwind CSS.
- **La Memoria (El Búnker):** Google Drive como única fuente de la "Verdad Física" (.md). Firestore actúa como la "Verdad Indexada" (caché y metadatos) y registro legal (`audit_log`).

## 2. EL PARADIGMA ECS (Entity-Component-System) Y EL SSOT UNIFICADO
El sistema ha consolidado el **SSOT Unificado (Single Source of Truth)**. Todas las entidades (personajes, lugares, objetos) conviven en la colección `users/{uid}/WorldEntities`.

### El Contrato Maestro: `WorldEntity` V6.0
Evolución hacia el motor neuro-simbólico:
- **Core:** `id`, `name`, `category`, `tier`, `projectId`.
- **Nuevos Componentes Psicofísicos (.forge):**
  - `psychology`: Variables estructuradas (Goal, Fear, Flaw, Lie, Wound, Need) basadas en Truby/McKee.
  - `physicalState`: Rastreo de lesiones permanentes (`injuries`) y estado vital (`currentStatus`).
- **Relaciones Causales (.nexus):** Grafo de dependencias $G=(V,E,W)$ donde el peso $W$ se deriva del contexto narrativo.

## 3. MOTOR DE DEPENDENCIAS NARRATIVAS (NDG)
Implementado en `narrativeDependencyEngine.ts`.
- **Nodos:** WorldEntities.
- **Aristas:** Relaciones Nexus con peso semántico.
- **Lógica:** Grafo efímero construido en memoria para detectar colisiones deterministas (muertos que hablan, heridas ignoradas, paradojas causales).

## 4. SEGURIDAD Y ESTABILIZACIÓN TÉRMICA
- **Cero Persistencia de Claves:** El sistema *BYOK* es 100% cliente/memoria. Las funciones de backend sanitizan payloads para evitar fugas de `_authOverride` o `apiKey` hacia Firestore.
- **Límites de Cómputo:** Cloud Functions configuradas con `timeoutSeconds: 300` y `memory: 1GiB` para soportar minería masiva de chunks.
- **Embedder Overflow Fix:** Truncamiento estricto a 300 caracteres antes de vectorizar consultas para evitar errores de dimensión.

## Actualización Sprint 6.0: Base Tectónica Neuro-Simbólica [COMPLETADO]
Se ha inyectado la capacidad de análisis profundo de personajes y la detección de colisiones físicas/lógicas. El sistema ya no solo "lee" texto, sino que entiende las restricciones narrativas del canon.
