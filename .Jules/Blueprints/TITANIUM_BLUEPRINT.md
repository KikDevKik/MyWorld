# TITANIUM BLUEPRINT: PROTOCOLO DE ENTIDAD UNIFICADA (V3.0)

## 🏗️ Estado: Implementado (Standard)
El sistema ha migrado de una taxonomía rígida a un sistema dinámico basado en **Rasgos (Traits)** y **Sincronización Inteligente**. Este blueprint actúa ahora como la norma técnica para toda nueva funcionalidad.

---

## 🔍 FASE 1: AUDITORÍA SISTÉMICA (Resuelta)
*   **Problema:** Discrepancia entre Frontmatter y Cuerpo.
*   **Solución:** Implementación de `Smart-Sync` en el middleware de ingesta y triaje.

---

## 📐 FASE 2: EL ESTÁNDAR UNIFICADO (V3.0)

### 1. La Interfaz de Entidad Universal (`TitaniumEntity`)
Se ha reemplazado el sistema rígido por uno basado en **Traits**.

```typescript
// Localizado en functions/src/types/forge.ts
export type EntityTier = 'GHOST' | 'LIMBO' | 'ANCHOR';
export type EntityCategory = 'PERSON' | 'CREATURE' | 'FLORA' | 'LOCATION' | 'OBJECT';

// V3.0 Body Signals (Traits detectados por Soul Sorter)
// - SENTIENT: Entidades con conciencia.
// - TANGIBLE: Objetos físicos.
// - LOCATABLE: Lugares geográficos.
// - ABSTRACT: Conceptos o Ideas.
```

### 2. El Middleware "Smart-Sync"
Implementado en `functions/src/soul_sorter.ts` y `functions/src/ingestion.ts`.

**Flujo Operativo:**
1.  **Ingesta:** Recibe Markdown completo.
2.  **Extracción Funcional:** Gemini Flash extrae hechos clave (Rol, Estado, Alias).
3.  **Comparación de Hash:** Se utiliza `contentHash` y `lastSoulSortedHash` para evitar re-análisis innecesarios.
4.  **Auto-Healing:** Si se detecta un cambio en el archivo físico, el Roster de Firestore se actualiza automáticamente.

### 3. Poda de Metadatos (Metadata Pruning)
Se han eliminado campos obsoletos de los templates oficiales:
*   ❌ `age`, `class`, `race` (Ahora son atributos dinámicos o tags).
*   ✅ **Obligatorios:** `role`, `tags`, `aliases`, `id`.

### 4. Factoría de Entidades (TitaniumFactory)
Centralizado en `functions/src/services/enrichment.ts` y templates asociados. Todas las herramientas (`scribe`, `genesis`, `forge`) utilizan ahora la misma lógica de generación de Frontmatter.

---

## ⚠️ FASE 3: MITIGACIÓN DE DEUDA TÉCNICA (V3.1)
*   **Sincronización Silenciosa:** Se actualiza Firestore sin reescribir el archivo físico si solo cambian metadatos de búsqueda.
*   **Bloqueo de Escritura:** Debounce de 2 segundos para evitar bucles con `onSnapshot`.
*   **Optimistic UI:** El editor prioriza el estado local durante la sincronización.
