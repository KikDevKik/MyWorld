# 🏗️ PLANO MAESTRO: Refactorización del Ciclo de Vida de Entidades (Proyecto Titanium)

**Estado:** BORRADOR DE ARQUITECTURA
**Fecha:** 24 de Octubre, 2023
**Autor:** The Chief Architect (Simulado)
**Objetivo:** Transición de "Cabeceras Cosméticas" a "Ontología Funcional".

---

## 🔍 FASE 1: EL DIAGNÓSTICO PROFUNDO (Trace-to-Root)

Hemos auditado los vectores de entrada y consumo de datos en el sistema actual. La conclusión es que sufrimos de una **"Disonancia Estructural"**: El sistema *cree* que opera con tipos legados (`type: character`), pero *intenta* simular modernidad mediante adaptadores frágiles.

### 1. Auditoría de Puntos de Creación (`scribe.ts`, `genesis.ts`)
*   **La Ilusión de la Inferencia (`scribeCreateFile`):**
    *   El sistema actual gasta tokens infiriendo un `type` legado (String) mediante `smartGenerateContent` (Líneas 124-173 de `scribe.ts`).
    *   Luego, *inmediatamente* convierte ese String en Traits usando `legacyTypeToTraits` (Línea 217).
    *   **Fallo:** Perdemos matices. Si la IA detecta "Barco Viviente", lo colapsa a "Vehículo" o "Personaje", perdiendo la dualidad `['vehicle', 'sentient']`.
*   **Plantillas Rígidas (`genesisManifest`):**
    *   El Protocolo Génesis inyecta metadatos "Fantasma" por defecto: `age: "Desconocida"`, `role: "NPC"`.
    *   Esto viola el principio de "Señal sobre Ruido". Estos campos ocupan espacio en el Context Window del Director sin aportar valor narrativo.

### 2. La Lógica de Parcheo (`scribePatchFile`)
*   **Sincronización Ciega:**
    *   El `scribePatchFile` actual (Líneas 433+) detecta cambios en el Body, pero su lógica de reconciliación es superficial (`name` y `role`).
    *   No actualiza la Ontología. Si el usuario escribe en el texto "El personaje murió", el metadato `status: active` permanece inmutable porque el parser no entiende eventos, solo cadenas de texto.

### 3. Consumo de Datos (RAG & Director)
*   **Ceguera de Metadatos:**
    *   `ingestFile` indexa el *texto completo*. Los metadatos YAML se indexan como texto plano.
    *   La IA no distingue entre `role: Protagonista` (Meta) y "El rol del personaje..." (Texto).
    *   **Bloat:** Estamos enviando `age: unknown` miles de veces en los vectores, diluyendo la relevancia semántica.

---

## 🏛️ FASE 2: LA NUEVA ARQUITECTURA (Functional Ontology)

Proponemos un sistema unificado basado en **CAPACIDADES (Traits)** y no en **ETIQUETAS (Types)**.

### 1. La Interfaz Universal de Entidad (TypeScript)

```typescript
// .Jules/Blueprints/schemas/UniversalEntity.ts

export type EntityTrait =
  | 'sentient'    // Tiene agencia, psicología, diálogo.
  | 'mobile'      // Puede cambiar de coordenadas.
  | 'locative'    // Puede contener otras entidades (es un lugar).
  | 'item'        // Puede ser poseído/inventariado.
  | 'temporal'    // Tiene fecha de inicio/fin (Eventos).
  | 'conceptual'; // Leyes, Lore, Magia.

export interface FunctionalAttributes {
  // Solo almacenamos lo que AFECTA a la simulación o narrativa.
  coordinates?: { x: number, y: number, mapId: string }; // Si tiene trait 'mobile' o 'locative'
  inventory?: string[]; // Si tiene trait 'item' o 'sentient'
  factions?: string[];  // Alineamiento político
  aliases?: string[];   // Para reconocimiento de entidades (NER)
}

export interface TitaniumEntityV2 {
  id: string;          // Nexus ID
  name: string;        // Canonical Name
  traits: EntityTrait[];
  attributes: FunctionalAttributes;
  // Nota: Eliminamos 'role', 'age', 'status' como campos de primer nivel.
  // Se mueven a 'bodyContent' o se infieren del contexto.
  bodyContent: string;
}
```

### 2. El Middleware "Smart-Sync" 3.0 (El Intérprete)

Un nuevo módulo en `functions/src/services/synapse.ts` que se ejecuta *antes* de `TitaniumFactory`.

*   **Input:** Texto Markdown Crudo (editado por humano o IA).
*   **Proceso:**
    1.  **Extracción AST:** Analiza headers funcionales.
        *   `## 📍 Coordenadas` -> Detecta Trait `locative` + Atributo `coordinates`.
        *   `## 🎒 Inventario` -> Detecta Atributo `inventory`.
        *   `> *Muerto*` (Blockquote) -> Detecta Estado.
    2.  **Inferencia de Traits:** Si el texto menciona "habló con...", infiere Trait `sentient`.
    3.  **Normalización:** Elimina claves YAML prohibidas (`type`, `class`).
*   **Output:** Objeto `TitaniumEntityV2` limpio para la Forja.

### 3. Política de Poda de Metadatos (Metadata Pruning)

Lista negra definitiva para `TitaniumFactory`:

*   ❌ `age`: Mover al cuerpo del texto (`## Biografía`).
*   ❌ `gender`: Mover al cuerpo del texto.
*   ❌ `status`: Inferir de tags o cuerpo. Solo guardar si es crítico (`DECEASED`).
*   ❌ `role`: Reemplazar por `tags: ['protagonist']` o `tier: 'MAIN'`.
*   ❌ `type`: **ELIMINADO TOTALMENTE**. Reemplazado por `traits`.

### 4. Estandarización de Herramientas

*   **La Forja (Soul Sorter):** Dejará de buscar `type: character`. Buscará `traits` que incluyan `sentient`.
*   **Génesis:** Usará el `Smart-Sync` para generar el archivo. En lugar de plantillas fijas, generará un borrador de texto y dejará que el `Smart-Sync` derive los traits.

### 5. Áreas Soberanas Humanas (DO NOT TOUCH)

La IA tendrá prohibido modificar bloques delimitados por:

```markdown
<!-- HUMAN_ONLY_START -->
...contenido...
<!-- HUMAN_ONLY_END -->
```
Y por defecto, el bloque `## 📝 Notas` será considerado sagrado/soberano salvo instrucción explícita.

---

## 🛡️ FASE 3: ESCUDO DE COHESIÓN (Impacto Cruzado)

### 🛑 Riesgos Detectados

1.  **Ruptura de `classifyEntities` (`soul_sorter.ts`):**
    *   *Riesgo Crítico:* La función actual depende fuertemente de `parsed.data.role` y `parsed.data.type` para clasificar entidades como ANCHOR.
    *   *Solución:* Actualizar `identifyEntities` para leer `parsed.data.traits`. Si `traits` incluye `sentient`, clasificar como PERSONA.
    *   *Migración:* Mantener un "Legacy Fallback" en lectura durante 30 días.

2.  **Índices de Firestore (`TDB_Index`):**
    *   *Riesgo:* Las consultas actuales filtran por `category` (que viene de `type`).
    *   *Solución:* Necesitamos una migración de base de datos para añadir el campo `traits` (Array) a los documentos de Firestore y crear índices `array-contains`.

3.  **Race Conditions en `onSnapshot`:**
    *   Si el `Smart-Sync` actualiza el YAML al mismo tiempo que el usuario edita el Markdown en el Frontend, el editor podría "saltar" o revertir cambios.
    *   *Mitigación:* Implementar bloqueo optimista (`last_titanium_sync` timestamp) y asegurar que el Frontend ignore actualizaciones que vengan del backend si el usuario tiene el foco ("Local Authority wins").

---

## 🚀 SIGUIENTES PASOS (Ejecución)

1.  Crear `functions/src/services/synapse.ts` (Smart-Sync Logic).
2.  Refactorizar `TitaniumFactory` para implementar `TitaniumEntityV2`.
3.  Actualizar `scribe.ts` para usar `synapse.ts`.
4.  Actualizar `soul_sorter.ts` para leer `traits`.
5.  Ejecutar script de migración masiva en lotes de 50 archivos.

**Firma:**
*The Chief Architect*
*Project Titanium*
