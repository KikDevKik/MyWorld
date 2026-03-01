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

## 🎬 THE DIRECTOR (EL DIRECTOR)
**Role:** Narrative Orchestrator & Context Manager.
**Model:** Gemini 3.0 Pro.
**Location:** `src/components/DirectorPanel.tsx`, `functions/src/director.ts`.

### 1. OPERATIONAL MODES (Layout Context)
*   **Sentinel Mode (<500px):** Silent observation. Chat only.
*   **Strategist Mode (500px-900px):** Deploys "Tactical Tools" (Sidebar) for surgical interventions.
*   **War Room (>900px):** Full command center. Displays historical session logs + tools.

### 2. TACTICAL CAPABILITIES
*   **The Inspector:** Analyzes scene for Casting Report (Characters, Tone, Pacing). Returns a structured JSON. (`handleInspector`)
*   **The Tribunal:** Invokes the 3 Judges (see dedicated section). (`handleTribunal`)
*   **Memory Sync:** Forces manual context refresh (`handleContextSync`). Triggered by `needsReindex` banner.
*   **Sensory Interface:** Accepts Images/Audio inputs. Analyzes tone/visuals to provide multi-modal narrative advice. (`handleSendMessage` con Attachment)

---

## 🛡️ THE GUARDIAN (CANON RADAR / EL CENTINELA)
**Role:** Passive Surveillance & Continuity Enforcement.
**Model:** Gemini 3.0 Flash (High Speed).
**Location:** `src/hooks/useGuardian.ts`, `src/components/StatusBar.tsx`.

### 1. MECHANICS
*   **Trigger:** SHA-256 Hash change on text buffer.
*   **Interval:** 3000ms debounce.
*   **Traffic Light (Argos):**
    *   `CLEAN` (Green): No issues.
    *   `SCANNING` (Yellow): Analysis in progress.
    *   `CONFLICT` (Red): Issue detected.

### 2. DETECTION SCOPE
*   **Conflicts:** Direct logical contradictions (e.g., "Dead character speaks").
*   **Fractures of Reality:** Violations of world physics or magic rules.
*   **Narrative Betrayal:** Personality drift or out-of-character actions.

### 3. DRIFT CONTROL
*   **Rescue:** User validates new info as Canon (updates database).
*   **Purge:** User deletes the "Echo" (contradiction) from memory.

---

## 🌐 THE NEXUS (WORLD ENGINE v4.0)
**Role:** Entity Graph & Reality Visualizer.
**Location:** `src/components/NexusCanvas.tsx`, `src/pages/WorldEnginePageV2.tsx`.

### 1. IDENTITY PROTOCOL
*   **Deterministic Identity:** IDs = `DJB2_Hash(Slug + ProjectID)`.
*   **Batch Merge:** Unifies aliases (e.g., "The King" -> "Arthur") into a single node.

### 2. GHOST NODES (Drafts)
*   **Storage:** Entities detected but not yet crystallized live in `localStorage` (`nexus_drafts_v1`).
*   **Crystallization:** The process of converting a Ghost Node into a physical Markdown file in Drive.

### 3. REALITY TUNER (Temperature Control)
*   **Rigor (Cyan):** Strict logic. Zero hallucinations. Pure Canon.
*   **Fusion (Silver):** Narrative balance. Plausible connections.
*   **Entropy (Violet):** Creative chaos. Wild ideas.

---

## 🔨 THE FORGE (SOUL SORTER / EL ARTÍFICE)
**Role:** Entity Taxonomist.
**Model:** Gemini 3.0 Flash.
**Location:** `functions/src/soul_sorter.ts`.

### 1. LIFECYCLE WORKFLOW
*   **ECHOES (The Radar):** Scans text for names without files. **RULE OF SILENCE:** Strictly ignores `_RESOURCES` / `_RECURSOS` folders.
*   **LIMBO (The Workshop):** Draft entities. Notes without Master File.
*   **ANCHORS (The Vault):** Crystallized entities with physical `.md` files.

### 2. METADATA SEALS (Anchor Detection)
To be an ANCHOR, a file must contain these keys (YAML or Markdown Bold) in the first 20 lines:
*   `Role` / `Rol` / `Cargo` / `Ocupación`
*   `Age` / `Edad`
*   `Class` / `Clase`
*   `Race` / `Raza` / `Especie`
*   `Alias` / `Apodo`
*   `Faction` / `Facción` / `Grupo`

---

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel.
**Model:** Gemini 3.0 Pro.
**Timeout:** **540 seconds (9 minutes)**.
**Output Requirement:** Must return a structured JSON with `verdict`, `critique`, and `score` for each judge.

### THE JUDGES
1.  **The Architect (Blue):** Logic, pacing, plot holes. Cold/Analytical.
2.  **The Bard (Purple):** Aesthetics, metaphors, sensory details. Poetic/Dramatic.
3.  **The Hater (Red):** Market viability, clichés, "cringe" factor. Cynical/Destructive.

---

## 🔬 THE LABORATORY (EL LABORATORIO)
**Role:** Research & Resource Management.
**Model:** Gemini 2.5 Flash / 3.0 Flash.
**Location:** `src/components/LaboratoryPanel.tsx`.

### 1. EXCLUSIVE SCOPE
*   The Librarian chat has access **ONLY** to files in `_RESOURCES` / `_RECURSOS`. It cannot see the main manuscript (Canon).

### 2. MECHANICS
*   **Smart Tags:** `classifyResource` tags content as `LORE`, `SCIENCE`, `VISUAL`.
*   **Lazy Classification:** 2000ms debounce, batches of 3 files.
*   **Context Injection:** Drag & Drop injects `fileId` + content into chat.

---

## ⏳ THE CHRONOLOGIST (EL CRONOGRAMA)
**Role:** Timeline & Event Extractor.
**Location:** `src/components/TimelinePanel.tsx`.

### 1. MECHANICS
*   **Double Pass:** Uses `extractTimelineEvents` to scan text for temporal markers.
*   **Circuit Breaker:** Blocks execution if AppCheck security is not ready.
*   **Ambiguity Handling:** Requires explicit "Current Year" configuration to resolve relative dates (e.g., "ten years ago").

---

## 🖨️ THE PRESS (LA IMPRENTA)
**Role:** Manuscript Compiler & Auditor.
**Location:** `src/components/ExportPanel.tsx`.

### 1. COMPILATION
*   **Tech:** Generates PDF via `pdfmake` on the backend.
*   **Security:** Returns Base64 string. Client decodes to `Uint8Array` Blob. File never touches public storage.

### 2. AUTHORSHIP CERTIFICATE
*   **Purpose:** Forensically prove human authorship.
*   **Source:** Compiles data from the immutable `audit_log` in Firestore.

---

## 🧹 THE SENTINEL (JANITOR / CONSERJE)
**Role:** System Hygiene.
**Location:** `functions/src/janitor.ts`, `src/components/SentinelStatus.tsx`.

*   **Vault Scan:** Calculates Health Score (Valid vs Corrupt) using `scanVaultHealth` Cloud Function.
*   **The Purge:** **Irreversibly** deletes 0-byte or corrupt "Ghost Files" using `purgeArtifacts` Cloud Function.
*   **Visual Filter:** `toggleShowOnlyHealthy` hides garbage without deleting.

---

## 👻 GHOST MECHANICS (INVISIBLE PROTOCOLS)

### 1. CREATIVE AUDIT (The Notary)
*   **Service:** `CreativeAuditService.ts`.
*   **Storage:** Immutable Firestore collection `audit_log`.
*   **Security:** `serverTimestamp()` enforces chronological truth. No edits/deletes allowed.

### 2. SILENT SCRIBE (Auto-Save)
*   **Trigger:** 2000ms debounce after last keystroke.
*   **Significant Update:** Marked as `isSignificant: true` if `Math.abs(diff) > 50`. Updates `lastSignificantUpdate` timestamp.
*   **Conflict Resolution:** "Last Write Wins".

### 3. NEURONAL SYNC (Learning Loop)
*   **Mechanism:** Backend listens to Drive changes via `onSnapshot` on `TDB_Index`.
*   **Efficiency:** Incremental indexing based on file Hash.

### 4. INSTRUCTION LEAKAGE DEFENSE
*   **Input Limit:** 100,000 chars (~25k tokens).
*   **Sanitization:** `parseSecureJSON` strips Markdown code fences.
