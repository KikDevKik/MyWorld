# 🤖 TITANIUM PROTOCOL: AI AGENTS & ELITE MECHANICS

> **SOVEREIGN SOURCE OF TRUTH**: This document supersedes all previous instructions. It bridges the "Cathedral" (Creative Magic) and the "Bunker" (Security/Persistence). All coding agents must adhere strictly to these definitions.

---

## 🏗️ CORE PHILOSOPHY
*   **The Cathedral:** The AI acts as an "Active Mirror" (Espejo Activo), not just a tool. It must understand plot, detect contradictions, and visualize structure.
*   **The Bunker:** Absolute persistence. "Truth" resides in physical Markdown files (Google Drive) and immutable logs (Firestore).
*   **The Bridge:** Coding agents ("The Weaver") translate raw Spanish manuals (`.Jules/Manuals/`) into technical constraints here.

---

## ⚡ TECH STACK & MODEL ASSIGNMENTS
*   **Gemini 3.0 Pro (The Judge):** Used for complex reasoning, logic, and critique. (Director Logic, Tribunal, Chat RAG).
*   **Gemini 3.0 Flash (The Soldier):** Used for high-speed, low-latency tasks. (Guardian Scan, Soul Sorter Extraction, Scribe Synthesis).
*   **Thinking Mode:** All "Pro" agents must expose their internal reasoning via a visible `<thinking>...</thinking>` block in the UI to build user trust ("Glass Box AI").

---

## 🛡️ THE DIRECTOR (GUARDIAN / EL CENTINELA)
**Role:** Narrative Orchestrator & Canon Custodian.
**Model:** Gemini 3.0 Pro (Logic) / Flash (Scan).
**Location:** `functions/src/guardian.ts`, `src/components/DirectorPanel.tsx`.

### 1. OPERATIONAL MODES (Layout Context)
*   **Sentinel Mode (<500px):** Silent observation. Chat only.
*   **Strategist Mode (500px-900px):** Deploys "Tactical Tools" (Sidebar) for surgical interventions.
*   **War Room (>900px):** Full command center. Displays historical session logs + tools.

### 2. TACTICAL CAPABILITIES
*   **The Inspector:** Analyzes scene for Casting Report (Characters, Tone, Pacing).
*   **The Tribunal:** (See dedicated section).
*   **Memory Sync:** Forces manual context refresh (`handleContextSync`). Triggered by `needsReindex`.
*   **Sensory Interface:** Accepts Images/Audio inputs for multi-modal advice.
*   **Iron Guardian:** Sub-agent that strictly blocks hallucinations contradicting files marked as `[PRIORITY LORE]`.

### 3. CANON RADAR (Passive Surveillance)
*   **Trigger:** SHA-256 Hash change every 3 seconds.
*   **Traffic Light (Argos):** `CLEAN` (Green) | `SCANNING` (Yellow) | `CONFLICT` (Red).
*   **Detection Types:**
    *   **Conflicts:** Direct logical contradictions.
    *   **Fractures of Reality:** Violations of world physics/magic rules.
    *   **Narrative Betrayal:** Personality drift or out-of-character actions.
*   **Drift Control:**
    *   **Rescue:** User validates new info as Canon.
    *   **Purge:** User deletes the "Echo" (contradiction) from memory.

---

## 🌐 THE NEXUS (WORLD ENGINE v4.0)
**Role:** Entity Graph & Reality Visualizer.
**Location:** `src/components/NexusCanvas.tsx`, `src/pages/WorldEnginePageV2.tsx`.

### 1. IDENTITY PROTOCOL
*   **Deterministic Identity:** IDs = `DJB2_Hash(Slug + ProjectID)`. Ensures consistency across sessions.
*   **Batch Merge:** Unifies aliases (e.g., "The King" -> "Arthur") into a single node.

### 2. REALITY TUNER (Temperature Control)
*   **Rigor (Cyan):** Strict logic. Zero hallucinations. Pure Canon.
*   **Fusion (Silver):** Narrative balance. Plausible connections.
*   **Entropy (Violet):** Creative chaos. Wild ideas.

### 3. THE GRUDGE (Blacklist)
*   Persists `ignoredTerms` in `project_config`. The AI actively ignores these terms during future scans.

---

## 🔨 THE FORGE (SOUL SORTER / EL ARTÍFICE)
**Role:** Entity Taxonomist.
**Model:** Gemini 3.0 Flash.
**Location:** `functions/src/soul_sorter.ts`.

### 1. LIFECYCLE WORKFLOW
*   **ECHOES (The Radar):** Scans text for names without files. **RULE OF SILENCE:** The Radar *strictly ignores* `_RESOURCES` / `_RECURSOS` folders.
*   **LIMBO (The Workshop):** Draft entities. Notes without Master File.
*   **ANCHORS (The Vault):** Crystallized entities with physical `.md` files.

### 2. ORACLE OMNISCIENCE
*   **Contrast:** Unlike the Radar, the **Chat Interface (Oracle)** *HAS ACCESS* to `_RESOURCES`. It uses this to suggest connections from research notes.

### 3. METADATA SEALS (Anchor Detection)
To be an ANCHOR, a file must contain these keys (YAML or Markdown Bold) in the first 20 lines:
*   `Role` / `Rol` / `Cargo`
*   `Age` / `Edad`
*   `Class` / `Clase`
*   `Race` / `Raza` / `Especie`
*   `Alias` / `Apodo`
*   `Faction` / `Facción`

---

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel.
**Model:** Gemini 3.0 Pro.
**Timeout:** **540 seconds (9 minutes)**.

### THE JUDGES
1.  **The Architect (Blue):** Logic, pacing, plot holes. Cold/Analytical.
2.  **The Bard (Purple):** Aesthetics, metaphors, sensory details. Poetic/Dramatic.
3.  **The Hater (Red):** Market viability, clichés, "cringe" factor. Cynical/Destructive.

---

## 🔬 THE LABORATORY (EL LABORATORIO)
**Role:** Research & Resource Management.
**Model:** Gemini 2.5 Flash (per Manual) / 3.0 Flash (per Stack).
**Location:** `src/components/LaboratoryPanel.tsx`.

### 1. EXCLUSIVE SCOPE
*   The Librarian chat has access **ONLY** to files in `_RESOURCES` / `_RECURSOS`. It cannot see the main manuscript (Canon) to prevent pollution.

### 2. MECHANICS
*   **Smart Tags:** `classifyResource` Cloud Function tags content as `LORE`, `SCIENCE`, `VISUAL`.
*   **Lazy Classification:** 2000ms debounce, batches of 3 files.
*   **Context Injection:** Drag & Drop injects specific `fileId` + content into chat context.

---

## 🧹 THE SENTINEL (JANITOR / CONSERJE)
**Role:** System Hygiene.
**Location:** `functions/src/janitor.ts`.

*   **Vault Scan:** Calculates Health Score (Valid vs Corrupt).
*   **The Purge:** **Irreversibly** deletes 0-byte or corrupt "Ghost Files".
*   **Visual Filter:** `toggleShowOnlyHealthy` hides garbage without deleting.

---

## 👻 GHOST MECHANICS (INVISIBLE PROTOCOLS)

### 1. CREATIVE AUDIT (The Notary)
*   **Purpose:** Prove human authorship.
*   **Mechanism:** Logs `INJECTION`, `CURATION`, `STRUCTURE` events to immutable Firestore `audit_log`.
*   **Output:** "Certificate of Authorship" (PDF/TXT) via The Press.

### 2. SILENT SCRIBE (Auto-Save)
*   **Trigger:** 2000ms debounce after last keystroke.
*   **Significant Update:** If `char_diff > 50`, flags as significant.
*   **Conflict:** "Last Write Wins".

### 3. NEURONAL SYNC (Learning Loop)
*   **Mechanism:** Backend listens to Drive changes.
*   **Efficiency:** Incremental indexing (only re-processes if SHA-256 changes).

### 4. INSTRUCTION LEAKAGE DEFENSE
*   **Input Limit:** 100,000 chars (~25k tokens).
*   **Recursion:** Iterative stack-based parsing for PDFs to prevent Stack Overflow.
*   **Sanitization:** `parseSecureJSON` strips Markdown code fences.
