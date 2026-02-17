# 🏗️ BLUEPRINT TITANIUM: AUDITORÍA Y ARQUITECTURA DEL CICLO DE VIDA DE ENTIDADES

**Fecha:** 24 de Mayo de 2024
**Autor:** El Arquitecto (Jules)
**Versión:** 1.0.0
**Estado:** PROPUESTA (Phase 2)

---

## 🚨 1. EL DIAGNÓSTICO: ENTROPÍA SISTÉMICA (DEEP AUDIT)

Tras una auditoría exhaustiva de "Traza a la Raíz" en el código base (`functions/src` y `src/components`), se han identificado puntos críticos de fallo estructural que impiden la escalabilidad y coherencia del Proyecto Titanium.

### A. Fragmentación de la Fuente de Verdad (Schema Fragmentation)
Actualmente, existen al menos **4 vectores de creación de entidades**, cada uno con su propia lógica hardcodeada y esquemas divergentes:

1.  **El Escriba (`scribe.ts`):** Utiliza inferencia IA para asignar `type` ('character', 'location'), pero a menudo cae en defaults genéricos. Su lógica de parcheo (`scribePatchFile`) depende de **Regex frágiles** para leer el cuerpo del Markdown, lo que falla si el usuario cambia el formato manualmente.
2.  **Génesis (`genesis.ts`):** Inyecta arrays de rasgos predefinidos (`traits: ['sentient']`) y asume una estructura rígida (`TYPE_SOUL`, `TYPE_BEAST`). No utiliza la misma factoría que El Escriba para todo.
3.  **La Forja (`forge_scan.ts`):** Escanea archivos buscando explícitamente `type: "CHARACTER"`. Si cambiamos a un sistema puro de Rasgos (Traits) sin retrocompatibilidad, **esta herramienta dejará de detectar personajes**.
4.  **Frontend (`EntityCard.tsx`):** La visualización depende estrictamente de strings exactos (`type === 'CHARACTER' || type === 'PERSON'`). Cualquier desviación en el casing o nombre del tipo rompe el renderizado (íconos, colores).

### B. Datos Fantasma (Ghost Metadata)
El sistema actual inyecta campos que consumen tokens y espacio en disco sin aportar valor semántico a la IA:
*   `age: "unknown"` / `age: "Desconocida"`
*   `status: "active"` (Por defecto en casi todo)
*   `role: "Unknown"` (Cuando la inferencia falla)

### C. Fragilidad en Sincronización (The "Smart-Sync" Gap)
La función `scribePatchFile` intenta sincronizar el H1 (`# Name`) y el Blockquote (`> *Role*`) con el Frontmatter, pero lo hace mediante **Expresiones Regulares**. Esto es propenso a errores si el usuario añade atributos extra al H1 o cambia el estilo de la cita. No existe un AST (Abstract Syntax Tree) real procesando el archivo.

---

## 🏛️ 2. LA SOLUCIÓN: ONTOLOGÍA FUNCIONAL (TITANIUM TRAITS)

Para resolver la entropía, propongo abandonar la clasificación rígida por "Tipos" y adoptar una clasificación fluida por "Rasgos" (Traits). Una entidad se define por lo que **HACE**, no por lo que **ES**.

### A. La Interfaz Universal (TitaniumEntity)

```typescript
export type TitaniumTrait =
  | 'sentient'    // Tiene agencia, diálogo, psicología (Personaje, IA, Monstruo inteligente)
  | 'place'       // Tiene coordenadas, geografía, atmósfera (Lugar, Planeta, Habitación)
  | 'item'        // Puede ser poseído, usado, comerciado (Objeto, Artefacto)
  | 'faction'     // Grupo de entidades con objetivos comunes (Gremio, Familia)
  | 'event'       // Ocurre en un tiempo específico (Batalla, Escena)
  | 'concept'     // Regla abstracta, sistema de magia, lore (Ley, Historia)
  | 'anchor';     // Es un punto fijo en la realidad (Archivo Maestro)

export interface TitaniumEntity {
  id: string;           // Determinista: sha256(project_id + name)
  name: string;
  traits: TitaniumTrait[]; // 🚀 EL NUEVO NÚCLEO
  attributes: Record<string, any>; // Metadatos flexibles (sin schema rígido)
  bodyContent: string;  // Markdown Body
  projectId: string;
}
```

### B. Estrategia de Migración (The Bridge)
Para no romper `forge_scan.ts` ni `EntityCard.tsx`, la **TitaniumFactory** inyectará un campo `type` derivado automáticamente de los traits durante la fase de transición (Phase 3).

*   Si tiene `sentient` -> `type: "character"`
*   Si tiene `place` -> `type: "location"`
*   Si tiene `faction` -> `type: "faction"`

---

## 🧠 3. SMART-SYNC MIDDLEWARE (PROPUESTA)

En lugar de Regex, implementaremos un parser basado en **Unified / Remark** (AST) que opere como middleware en `scribePatchFile`.

**Lógica del Middleware:**
1.  **Parseo:** Convierte el Markdown en un árbol de sintaxis (AST).
2.  **Extracción Segura:**
    *   Busca el primer nodo `Heading` (depth: 1) -> Extrae `name`.
    *   Busca el primer nodo `Blockquote` que contenga texto en cursiva -> Extrae `role`.
3.  **Reconciliación:** Compara los valores extraídos con el Frontmatter actual.
4.  **Inyección:** Si hay discrepancia, actualiza el Frontmatter (YAML) preservando el resto del cuerpo intacto.
5.  **Regeneración:** Serializa el AST de nuevo a Markdown seguro.

---

## ✂️ 4. PODA DE METADATA (PRUNING LIST)

Los siguientes campos serán **eliminados permanentemente** de la generación por defecto. Solo existirán si el usuario o la IA los define explícitamente con un valor real.

*   ❌ `age: "unknown"` / `age: "Desconocida"`
*   ❌ `status: "active"`
*   ❌ `role: "Unknown"`
*   ❌ `type` (A futuro, una vez completada la migración a Traits)

---

## 🛡️ 5. ÁREAS SOBERANAS HUMANAS (SOVEREIGN AREAS)

Para proteger la "Voz del Autor", definimos bloques que la IA tiene **prohibido** modificar o auto-formatear durante un parcheo (`scribePatchFile`).

1.  **El Bloque de Citas (The Quote Block):**
    Cualquier texto dentro de un bloque `> "..."` se considera sagrado (diálogo o cita textual).
    *Razón:* La IA tiende a "corregir" el estilo de los diálogos.

2.  **Notas del Autor:**
    Cualquier bloque HTML `<!-- AUTHOR NOTE: ... -->` será ignorado por el parser de la IA y preservado tal cual.

3.  **Frontmatter Custom:**
    Cualquier campo en el YAML que empiece por `_` (ej. `_private_note:`) será preservado y nunca eliminado por la limpieza de metadatos.

---

## ⚠️ 6. ANÁLISIS DE IMPACTO CRUZADO (COHESION SHIELD)

### Riesgos Detectados:
1.  **La Forja (`forge_scan.ts`):**
    *   *Riesgo:* Ignora entidades que no tengan `type: CHARACTER`.
    *   *Mitigación:* Actualizar el scanner para buscar `type: CHARACTER` **O** `traits` que incluyan `sentient`.

2.  **Visualización (`EntityCard.tsx`):**
    *   *Riesgo:* Los nodos aparecerán grises (default) si el `type` desaparece.
    *   *Mitigación:* Crear un helper `getVisualTypeFromTraits(traits)` en el frontend que mapee `sentient` -> `CHARACTER` visualmente.

3.  **Indexador (`ingestion.ts`):**
    *   *Riesgo:* La categorización actual (`category: 'canon'`) es muy simple.
    *   *Oportunidad:* Usar los `traits` para una categorización vectorial más rica (`category: 'character'` implícito).

---

## ✅ SIGUIENTES PASOS (EXECUTION PLAN)

1.  **Refactorizar `TitaniumFactory`:** Implementar la lógica de Traits con adaptador Legacy.
2.  **Actualizar `scribe.ts`:** Conectar el nuevo Factory y limpiar la lógica de inferencia.
3.  **Actualizar `genesis.ts`:** Usar `TitaniumFactory` en lugar de crear strings manualmente.
4.  **Desplegar Smart-Sync:** Implementar la librería de parseo AST.

**FIN DEL REPORTE**
