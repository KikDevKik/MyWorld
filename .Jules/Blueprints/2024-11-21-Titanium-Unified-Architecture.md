# 🏗️ TITANIUM UNIFIED ARCHITECTURE: BLUEPRINT & MIGRATION PLAN
> **Date:** 2024-11-21
> **Author:** The Chief Architect
> **Status:** DRAFT
> **Context:** Refactoring from "Cosmetic Headers" to "Functional Ontology".

---

## 🔍 PHASE 1: THE DEEP SYSTEMIC AUDIT

### 1.1. The Source of Truth Crisis
The system currently suffers from a "Split Brain" condition.
*   **Symptom:** `scribePatchFile` attempts to reconcile via `SmartSyncService`, but `SmartSyncService` only scrapes specific regex patterns (`**Key**: Value`) from the body.
*   **Failure Point:** If a user edits a field in the YAML manually, it might be overwritten by the Body content on the next sync if the Body content hasn't changed but the code prefers Body extraction. Conversely, if the user edits the Body, the YAML is updated, but complex fields like `traits` are not parsed from the Body, leading to desync.

### 1.2. Schema Fragmentation (The Entry Points)
Multiple functions birth entities with inconsistent DNA:
*   **`scribeCreateFile`:** Uses `inferencePrompt` to guess `type` (string), then maps to `traits` via `legacyTypeToTraits`. Relies on legacy `entityData` structure.
*   **`crystallizeGraph`:** Uses `TYPE_ROLE_MAP` (hardcoded strings) for folder routing. Relies on `node.type` string.
*   **`genesisManifest`:** Hardcodes `TYPE_SOUL` -> `['sentient']`.
*   **`forgeToolExecution`:** Infers traits from filename keywords.

**Verdict:** The system is "String-Typed" masquerading as "Trait-Typed".

### 1.3. Ghost Metadata (Token Bloat)
We are persisting and sending low-signal fields:
*   `age: "Unknown"`
*   `status: "active"` (Default)
*   `last_titanium_sync` (Redundant with `_sys.last_sync`)
*   `created_at` (Redundant)

### 1.4. Parsing Fragility
*   **RAG Blindness:** The `ingestFile` function (vectorizer) chunks text but doesn't semantically weight the "Functional Sub-sections" (e.g., `### 🏛️ Lore` vs `### 📝 Notes`). It treats all text as equal.
*   **Metadata Extraction:** `SmartSyncService.extractMetadataFromBody` is fragile. It breaks if the user changes formatting (e.g., `* Role:` instead of `> *Role*`).

---

## 📐 PHASE 2: THE UNIFIED BLUEPRINT

### 2.1. The Universal Entity Interface (TypeScript)
We move to a pure **Trait-Based Ontology**.

```typescript
export type EntityTrait =
    | 'sentient'    // Agency/Dialogue (Character, AI)
    | 'tangible'    // Physical interaction (Object, Place, Creature)
    | 'locatable'   // Coordinates/Navigation (Place, Planet)
    | 'temporal'    // Timeline events (Scene, Era)
    | 'organized'   // Social structure (Faction, Guild)
    | 'abstract';   // Pure info (Lore, Magic System)

export interface TitaniumEntity {
    // 1. Identity
    id: string;          // Nexus ID (Hash of path/slug)
    name: string;        // Canonical Name

    // 2. Functional Ontology (What it DOES)
    traits: EntityTrait[];

    // 3. Dynamic Attributes (What it IS)
    attributes: {
        role?: string;      // Narrative Function
        aliases?: string[]; // Search Keys
        tags?: string[];    // Taxonomy

        // Dynamic Fields allowed, but restricted by Trait context
        // e.g. 'coordinates' only if 'locatable'
        [key: string]: any;

        // System Metadata (Hidden from Context Window)
        _sys: {
            schema_version: '3.0';
            tier: 'ANCHOR' | 'DRAFT';
            status: 'active' | 'archived';
            nexus_id: string;
            last_sync: string;
        };
    };

    // 4. Sovereign Content
    bodyContent: string;
}
```

### 2.2. The "Smart-Sync" Parser (Middleware 3.0)
We introduce a **Strict Layout Protocol** for Markdown files to ensure 100% sync reliability.

**The Protocol:**
1.  **YAML Frontmatter:** The Database Record (Machine Readable).
2.  **H1 Header:** The Entity Name.
3.  **The "Callout" Block:** A specific Markdown blockquote that acts as the "Human Interface" for metadata.

**Implementation Plan:**
*   **Parser Logic:**
    *   Instead of scanning the whole body, `SmartSyncService` looks for the **First Blockquote** (`> ...`).
    *   It parses `**Key**: Value` pairs within that blockquote.
    *   **Rule:** The Blockquote is the Master for Metadata. The YAML is the Slave (Generated from Blockquote).
    *   **Exception:** `_sys` fields are managed by code only.

**Example Markdown:**
```markdown
---
name: "Megu"
traits: ["sentient"]
role: "Protagonist"
aliases: ["The Glitch"]
_sys: ...
---

# Megu

> **Role**: Protagonist
> **Alias**: The Glitch
> **Traits**: #Sentient #Character

## Description
...
```

### 2.3. Metadata Pruning (The Purge List)
The following fields will be **permanently deleted** from `attributes` (and moved to `_sys` or trash):

1.  `type` (Replaced by `traits`).
2.  `category` (Replaced by `traits`).
3.  `age` (If "Unknown" or null).
4.  `status` (Moved to `_sys`).
5.  `tier` (Moved to `_sys`).
6.  `last_updated` (Moved to `_sys`).
7.  `created_at` (Deleted - Drive handles this).
8.  `nexus_id` (Moved to `_sys`).

### 2.4. Cross-Tool Standardization
We will create a new service class `TitaniumGenesis` that abstracts the creation process.

```typescript
class TitaniumGenesis {
    /**
     * The Single Entry Point for ALL tools.
     */
    static async birth(payload: {
        name: string;
        context: string; // The "DNA" source (Chat, Graph Node, etc.)
        targetFolderId: string;
        inferredTraits?: EntityTrait[]; // Optional hint
    }): Promise<TitaniumEntity> {
        // 1. Analyze Context -> Deduce Traits (if not provided)
        // 2. Construct TitaniumEntity
        // 3. Forge Content (Factory)
        // 4. Create Drive File
        // 5. Index (Firestore)
        // 6. Return Entity
    }
}
```
All tools (`scribe`, `crystallize`, `genesis`) must call `TitaniumGenesis.birth`.

### 2.5. Human Sovereign Areas
We define **Protected Blocks** where the AI cannot auto-format or inject content during a `patch` or `sync` operation.

**Policy:**
1.  **The "Handwritten" Zone:** Any content enclosed in `<!-- SOVEREIGN START -->` and `<!-- SOVEREIGN END -->`.
2.  **The "Voice" Zone:** Any blockquote `> ...` that is *NOT* the Metadata Block (i.e., nested blockquotes or blockquotes after the first section) is preserved as stylistic choice.
3.  **Frontmatter:** AI can update it, but only to reflect the Body (Sync). AI cannot arbitrarily change Frontmatter values that contradict the Body.

---

## 🚧 PHASE 3: TECHNICAL DEBT MITIGATION

### 3.1. Circular Dependencies & Race Conditions
**Risk:** `SmartSyncService` updates the file -> Google Drive triggers push notification -> Backend receives change -> `SmartSyncService` runs again.

**Mitigation: The Hash Gate (Expanded)**
*   Current `guardian.ts` uses `audit_cache` hash.
*   **New Logic:** `SmartSyncService` must check `TDB_Index` *before* writing.
    *   Calculate Hash(NewContent).
    *   If Hash(NewContent) == Hash(LastIndexed), **ABORT WRITE**.
    *   This stops the Echo Loop at the source.

**Risk:** `scribePatchFile` vs `soul_sorter`.
*   `scribePatchFile` writes to Drive.
*   `soul_sorter` scans Drive (via `classifyEntities`).
*   **Race:** `soul_sorter` might pick up the file *before* the Drive write propagates or is indexed.
*   **Mitigation:** `scribePatchFile` must **immediately** update the `TDB_Index` (Firestore) with the new Hash and Content Snippet, effectively "pre-caching" the truth before Drive confirms it. `soul_sorter` should check Firestore `lastUpdated` before scanning Drive.

### 3.2. Migration Bridge
Since we cannot rewrite 100% of the files immediately:
1.  **Lazy Migration:** `TitaniumFactory.forge` will currently accept legacy data and output V3.0 structure.
2.  **Reader Compatibility:** The UI (`NexusCanvas`) must be able to read *both* `type` (Legacy) and `traits` (V3.0).
    *   Logic: `const traits = node.traits || legacyTypeToTraits(node.type);`

---

## 🛡️ AUDITORÍA DE IMPACTO CRUZADO (COHESION SHIELD)

**Herramienta: 'La Forja de Almas' (Soul Sorter)**
*   **Impacto:** Alto. `identifyEntities` usa regex buscando claves como "rol", "raza".
*   **Solución:** Actualizar `identifyEntities` para buscar también el bloque de metadatos estandarizado `> **Trait**: ...`.

**Herramienta: 'El Centinela' (Guardian)**
*   **Impacto:** Medio. Verifica hechos.
*   **Solución:** El nuevo formato estructura mejor la información, facilitando la extracción de hechos. No requiere cambios críticos, solo re-calibración de prompts.

**Herramienta: 'El Director' (Chat)**
*   **Impacto:** Bajo. Consume texto crudo.
*   **Beneficio:** Recibirá menos "basura" (Ghost Metadata) en el contexto, mejorando la calidad de las respuestas.

---

**🛑 NEXT STEPS:**
1.  Review and Approve this Blueprint.
2.  Refactor `functions/src/types/ontology.ts` to strictly enforce the new Schema.
3.  Implement `TitaniumGenesis` service.
4.  Refactor `SmartSyncService` to implement the "Blockquote Protocol".
