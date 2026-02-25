# 🏗️ Titanium Entity Lifecycle Audit & Unified Blueprint
> **Fecha:** 2024-11-25
> **Autor:** The Chief Architect
> **Estado:** Fase 1 (Auditoría Profunda) & Fase 2 (Plan Maestro)
> **Directiva:** Unificar la ontología funcional y eliminar la entropía estructural.

---

## 🔍 Fase 1: Auditoría Sistémica Profunda (The Deep Audit)

El sistema actual sufre de "Fragmentación de Esquema". Múltiples herramientas crean archivos, pero cada una sigue sus propias reglas, ignorando la "Fuente de la Verdad" (`TitaniumFactory`).

### 1. Puntos de Creación (Entry Points)
He rastreado la ejecución de cada herramienta y estos son los hallazgos críticos:

| Herramienta | Archivo Fuente | Estado | Hallazgo Crítico |
| :--- | :--- | :--- | :--- |
| **`forgeToolExecution`** | `functions/src/index.ts` | ❌ **CRÍTICO** | Escribe directamente en Drive (`drive.files.create`) ignorando por completo `TitaniumFactory`. Crea archivos "huesudos" sin metadata estandarizada. |
| **`forgeToDrive`** | `functions/src/index.ts` | ❌ **CRÍTICO** | Convierte chats a Markdown y los guarda en Drive sin pasar por la validación de esquema. Genera nombres de archivo a veces inconsistentes. |
| **`scribeCreateFile`** | `functions/src/scribe.ts` | ✅ PARCIAL | Usa `TitaniumFactory.forge`, pero depende excesivamente de la inferencia de `type` (legacy) en lugar de `traits`. |
| **`genesisManifest`** | `functions/src/genesis.ts` | ⚠️ RIESGO | Usa `TitaniumFactory.forge`, pero construye manualmente los atributos (`age: "Desconocida"`), lo cual es redundante y propenso a errores si la Factory cambia. |
| **`syncWorldManifest`** | `functions/src/index.ts` | ❌ **CRÍTICO** | Usa un prompt con taxonomía hardcodeada (`character`, `location`) que no se alinea con el sistema de Traits. Inventa tipos si la IA alucina. |
| **`syncCharacterManifest`** | `functions/src/index.ts` | ⚠️ RIESGO | Actualiza Firestore directamente ("La Forja"), ignorando la lógica de `TitaniumFactory` para la sincronización de metadatos. |

### 2. Lógica de Parcheo (`scribePatchFile`)
La función `scribePatchFile` en `functions/src/scribe.ts` contiene la semilla del "Smart-Sync", pero está acoplada a la lógica del Escriba.
- **Lo bueno:** Usa `TitaniumFactory.forge` para regenerar el archivo si detecta cambios en el Frontmatter.
- **Lo malo:** La lógica de detección de cambios (Delta Validator) está hardcodeada dentro de la función y no es reutilizable por otras herramientas (como `genesis` o `forgeToolExecution`).

### 3. Consumo de Datos (Ghost Data)
El análisis de `functions/src/services/factory.ts` revela que la política "Anti-Makeup" es insuficiente.
- **Problema:** Aún permitimos campos como `age: unknown` o `role: Entidad Registrada` si vienen del prompt de Génesis.
- **Impacto:** Desperdicio de tokens en el Context Window de Gemini y ruido semántico.

---

## 🏛️ Fase 2: El Plano Unificado (The Unified Blueprint)

### 1. La Interfaz Universal (Traits sobre Tipos)
Abandonaremos `type: character` como fuente de verdad. La entidad se definirá por sus **Traits** (Rasgos Funcionales).

```typescript
// functions/src/types/ontology.ts

export type EntityTrait =
    | 'sentient'    // Tiene agencia, diálogo, psicología (Personajes, IAs)
    | 'locatable'   // Tiene coordenadas, clima (Lugares, Planetas)
    | 'tangible'    // Es un objeto físico (Items, Artefactos)
    | 'temporal'    // Ocurre en el tiempo (Eventos, Escenas)
    | 'organized'   // Es un grupo (Facciones, Gremios)
    | 'abstract';   // Conceptos (Leyes, Magia)

export interface TitaniumEntity {
    id: string;          // Nexus ID (Hash Determinista)
    name: string;        // Nombre Canónico
    traits: EntityTrait[]; // 🚀 EL NÚCLEO

    attributes: {
        role?: string;      // Rol Narrativo (ej. "Antagonista")
        aliases?: string[]; // Búsqueda difusa
        tags?: string[];    // Taxonomía flexible

        // 🟢 SISTEMA (Oculto al RAG, visible para Logic)
        _sys: {
            status: 'active' | 'archived' | 'ghost';
            tier: 'ANCHOR' | 'DRAFT';
            last_sync: string; // ISO Date
            schema_version: '3.0'; // Titanium V3
        };
    };

    bodyContent: string; // Markdown Soberano
}
```

### 2. El Middleware "Smart-Sync"
Crearemos una clase estática `SmartSyncService` en `functions/src/services/smart_sync.ts` que centralice la lógica de reconciliación:

1.  **Input:** Contenido Markdown (Raw) + Nuevos Metadatos (Parcial).
2.  **Proceso:**
    *   Extraer Frontmatter actual.
    *   Extraer H1 y Blockquotes del Body (AST Analysis).
    *   Detectar conflictos (Markdown dice "Rey", YAML dice "Príncipe").
    *   **Regla de Oro:** Si el Humano editó el Texto, el Texto gana. Si la IA editó el YAML, el YAML gana.
3.  **Output:** Llamada a `TitaniumFactory.forge()` con la entidad reconciliada.

### 3. Poda de Metadatos (Metadata Pruning - The Kill List)
Los siguientes campos serán eliminados permanentemente del nivel raíz del Frontmatter y movidos a `_sys` o borrados:

*   ❌ `status` (Mover a `_sys.status`)
*   ❌ `type` (Mover a `_sys.legacy_type` solo para compatibilidad)
*   ❌ `created_at` (Ruido)
*   ❌ `updated_at` (Usar `_sys.last_sync`)
*   ❌ `age` (Si es "unknown" o "desconocida", borrar. Si es dato real, mantener en `attributes`)
*   ❌ `id` (El ID es implícito por el nombre/path, o Nexus ID calculado)

### 4. Estandarización Cruzada (Cross-Tool Standardization)
Todas las herramientas (`forgeToolExecution`, `forgeToDrive`, `genesisManifest`) deberán refactorizarse para:
1.  Construir un objeto `TitaniumEntity`.
2.  Llamar a `TitaniumFactory.forge(entity)`.
3.  Guardar el resultado en Drive.

**NUNCA** escribirán `drive.files.create` con strings concatenados manualmente.

### 5. Áreas Soberanas Humanas (Sovereign Areas)
Para proteger la voz del autor, `SmartSyncService` respetará estrictamente los bloques:

```markdown
<!-- SOVEREIGN START -->
Este contenido es sagrado. La IA no lo tocará, no lo formateará, no lo resumirá.
<!-- SOVEREIGN END -->
```
El servicio extraerá estos bloques antes de cualquier procesamiento y los reintegrará bit a bit al final.

---

## ⚠️ Fase 3: Deuda Técnica y Riesgos (Mitigation Plan)

### 🛑 El Riesgo del "Echo Loop" (Bucle Infinito)
Existe una condición de carrera crítica:
1.  `scribePatchFile` actualiza un archivo en Drive.
2.  Drive activa el trigger (o el cliente hace polling).
3.  `syncCharacterManifest` detecta el cambio e intenta actualizar Firestore.
4.  Si `syncCharacterManifest` escribe un metadato que `scribe` vigila... se dispara otro patch.

**Solución: El Guardián del Hash (Content Hash Gatekeeper)**
En `syncCharacterManifest` (o su sucesor en Titanium V3), implementaremos:

```typescript
// Pseudocódigo
const incomingHash = crypto.createHash('sha256').update(fileContent).digest('hex');
const currentDoc = await db.collection('characters').doc(id).get();

if (currentDoc.data().contentHash === incomingHash) {
    logger.info("🛡️ ECHO SHIELD: El contenido no ha cambiado. Abortando actualización de DB.");
    return;
}
```
Esto ya existe parcialmente, pero debe ser **estricto** y aplicarse a todas las sincronizaciones, no solo a personajes.

---

## 🏁 Conclusión
La "Catedral" necesita cimientos sólidos. La fragmentación actual en `index.ts` es una grieta estructural. Al centralizar la creación en `TitaniumFactory` y la reconciliación en `SmartSyncService`, eliminaremos la entropía y prepararemos el terreno para Titanium 3.0.
