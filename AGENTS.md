# 🤖 AI AGENTS & ELITE TOOLS (TITANIUM PROTOCOL)

This document is the **Sovereign Source of Truth** for all AI Agent behaviors, personas, and constraints within the Titanium project. All coding agents must adhere strictly to these definitions, bridging the gap between raw human manuals (in Spanish) and technical implementation.

## 🛡️ THE DIRECTOR (EL CENTINELA / GUARDIAN)
**Role:** Canon Custodian & Narrative Orchestrator
**Location:** `functions/src/guardian.ts`, `src/components/DirectorPanel.tsx`, `src/hooks/useDirectorChat.ts`
**Primary Directive:** Maintain the integrity of the user's "Canon" by detecting contradictions and narrative drift, acting as an omnipresent co-author.

*   **Operational Modes (Layout Context):**
    *   **Sentinel Mode:** (Width < 500px) Silent observation. Chat only.
    *   **Strategist Mode:** (Width 500px - 900px) Deploys **Tactical Tools** (Sidebar).
    *   **War Room:** (Width > 900px) Full command center. Displays historical session logs + tools.

*   **Tactical Capabilities:**
    *   **The Inspector (El Casting):** Analyzes the current scene to extract a "Casting Report" (Active Characters, Tone, Pacing). In Ghost Mode, simulates archetypes (e.g., "Weary Leader").
    *   **Canon Radar (Drift Detection):** Compares new content vectors against the **Project Centroid**. Returns `drift_score` and status (`STABLE`, `DRIFTING`, `CRITICAL_INCOHERENCE`).
    *   **Canon Sync (Re-Index):** Triggered by `needsReindex` banner. Forces a "Quick Index" to prevent hallucinations when file structure changes.
    *   **Drift Control (Echoes):** Detects "Echoes" (contradictions).
        *   **Rescue:** Validates new information as Canon.
        *   **Purge:** Deletes the echo from memory permanently.
    *   **Memory Sync (La Sinapsis):** Forces a manual refresh of the AI's short-term context from the active file.
    *   **Sensory Interface:** Accepts multi-modal input (Images, Audio) to influence narrative advice.

## 🛠️ THE ARSENAL (ZONA C)
**Role:** Tool Dock & Navigation Controller
**Location:** `src/components/forge/ArsenalDock.tsx`
**Primary Directive:** Manage access to heavy AI tools without cluttering the interface.

*   **Mechanics:**
    *   **Exclusivity:** Only ONE heavy tool (Director, Tribunal, Forge, etc.) can be active in Zone C at a time.
    *   **Toggle Logic:** Clicking the active tool icon closes it (returns to `editor` view).
    *   **Director Toggle:** The clapperboard icon (🎬) invokes `onToggleDirector` (or equivalent) to expand/collapse the Director Panel.

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel
**Location:** `functions/src/index.ts` (`summonTheTribunal`), `src/components/TribunalPanel.tsx`
**Primary Directive:** Provide multi-perspective feedback on prose quality, logic, and marketability.

*   **Constraints:**
    *   **Timeout:** The Cloud Function has an extended timeout of **540 seconds (9 minutes)** to allow deep reasoning.
    *   **Language Mirroring:** Must detect input language and respond in the **EXACT SAME LANGUAGE**.

*   **The Judges:**
    1.  **The Architect (Blue):** Logic, plot holes, pacing, causality, world-building consistency. Tone: Cold, analytical.
    2.  **The Bard (Purple):** Aesthetics, sensory details, metaphor, prose flow. Tone: Poetic, dramatic.
    3.  **The Hater (Red):** Market viability, clichés, boredom, "cringe" factor. Tone: Cynical, brutal, slang-heavy.

## 🧹 THE SENTINEL (EL CONSERJE / JANITOR)
**Role:** System Health & Hygiene
**Location:** `functions/src/janitor.ts` (`scanVaultHealth`, `purgeArtifacts`)
**Primary Directive:** Ensure the project vault remains clean of "Ghost Files" (0-byte or corrupt artifacts).

*   **Capabilities:**
    *   **Vault Scan:** Calculates a "Health Score" based on valid vs. corrupt files.
    *   **The Purge:** Irreversibly deletes identified "Ghost Files" to heal the project tree.
    *   **Visual Filter:** `toggleShowOnlyHealthy` hides problematic files in the UI without deleting them.

## 🔨 THE FORGE (SOUL SORTER / EL ARTÍFICE)
**Role:** Entity Taxonomist & Character Manager
**Location:** `functions/src/soul_sorter.ts`, `src/components/forge/ForgePanel.tsx`
**Primary Directive:** Classify narrative entities into strict ontological tiers and manage their lifecycle.

*   **Lifecycle Workflow:**
    1.  **ECHOES (The Radar):** "The Eye" scans narrative text for names without files (Ghosts). Ignores `Resources` folder.
    2.  **LIMBO (The Workshop):** Draft phase. Entities exist as ideas/notes but lack a Master File. "The Oracle" (Chat) assists here with full project visibility.
    3.  **ANCHORS (The Vault):** "Crystallized" entities with a physical Markdown file in Drive.

*   **Metadata Seals (Anchor Detection):**
    To be recognized as an ANCHOR, a file must contain specific metadata keys (YAML or Markdown) in the first 20 lines:
    *   `Role` / `Rol` / `Cargo`
    *   `Age` / `Edad`
    *   `Class` / `Clase`
    *   `Race` / `Raza` / `Especie`
    *   `Alias` / `Apodo`
    *   `Faction` / `Facción` / `Grupo`

## 👻 GHOST MECHANICS (INVISIBLE PROTOCOLS)
**Role:** Silent Protection & Persistence
**Location:** `src/services/CreativeAuditService.ts`, `src/App.tsx`, `functions/src/index.ts`

### 1. CREATIVE AUDIT (LA AUDITORÍA)
*   **Purpose:** Provenance & Forensics. Proves human authorship.
*   **Mechanism:** `CreativeAuditService.ts` logs events ('INJECTION', 'CURATION', 'STRUCTURE') to an immutable Firestore collection (`audit_log`).
*   **Security:** Uses `serverTimestamp()` to prevent client-side tampering.
*   **Output:** Generates a "Certificate of Authorship" (PDF/TXT).

### 2. THE SILENT SCRIBE (AUTO-SAVE)
*   **Trigger:** Debounce of **2000ms** (2 seconds) after last keystroke.
*   **Significant Update:** If `char_diff > 50` (Manual) or massive change, flags update as `isSignificant: true` to trigger immediate Vector Indexing.
*   **Conflict Resolution:** "Last Write Wins". If multiple tabs open, warns user of version conflict.

### 3. NEURONAL SYNC (THE LEARNING LOOP)
*   **Mechanism:** Backend (`indexTDB`) listens for Drive changes.
*   **Incremental Indexing:** Only re-processes files where the **SHA-256 Hash** has changed.
*   **Frontend Sync:** `ProjectConfigContext.tsx` subscribes to `TDB_Index/{uid}/structure/tree` for real-time file tree updates.

## ⚙️ CORE MECHANICS & CONTROLS

### 1. GUARDIAN (CANON RADAR)
*   **Location:** `src/hooks/useGuardian.ts`, `functions/src/guardian.ts`
*   **Hashing:** Calculates SHA-256 hash of content every 3 seconds to detect changes.
*   **Resonance:** Detects "Plot Seeds" and thematic connections across files.
*   **Drift Score:** Calculated via Cosine Similarity between Content Vector and Project Centroid.

### 2. INSTRUCTION LEAKAGE & DOS PROTECTION
*   **Input Limits:**
    *   `MAX_AI_INPUT_CHARS`: **100,000** (approx 25k tokens).
    *   `MAX_CHAT_MESSAGE_LIMIT`: **30,000**.
    *   `MAX_FILE_SAVE_BYTES`: **5MB**.
*   **Sanitization:** `parseSecureJSON` MUST strip Markdown code fences (```json) to prevent parsing errors.
*   **Recursion Limit:** PDF Compilation uses **iterative** traversal (stack-based) instead of recursion to prevent Stack Overflow DoS.

### 3. IDENTITY & PERSPECTIVE PROTOCOLS
*   **The Chameleon (Cloaking Mode):** AI must detect the input language/dialect and **mirror it exactly**.
*   **Perspective Lock:** AI detects First Person (I/Me) vs Third Person (He/She) and strictly adheres to it for all narrative generation.
