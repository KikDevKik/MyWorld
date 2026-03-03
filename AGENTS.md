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
*   **Gemini 2.5 Flash / 3.0 Flash (The Librarian):** Used for research, categorization, and Laboratory tasks.
*   **Gemini 2.5 Pro (TTS):** Used for high-fidelity Text-to-Speech with emotional depth (`gemini-2.5-pro-preview-tts`).

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
**Model:** Gemini 3.0 Flash (Detection) & Pro (Logic).
**Location:** `src/hooks/useGuardian.ts`, `functions/src/guardian.ts`.

### 1. MECHANICS
*   **Trigger:** SHA-256 Hash change on text buffer.
*   **Interval:** 3000ms debounce.
*   **Traffic Light (Argos):** `CLEAN`, `SCANNING`, `CONFLICT`.

### 2. DETECTION SCOPE
*   **Friction Analysis:** Detects logical contradictions against the RAG memory (Friction Score).
*   **Personality Drift:** Uses **"The Hater"** personality to detect if character actions betray their canonical profile.
*   **World Law Violations:** Flags violations of established physics, magic, or chronology.
*   **Resonance Engine (New):** Identifies connections between current drafts and previously written "Memory Seeds" (Chunks).
*   **Structure Analyst (New):** Analyzes the narrative phase (Setup, Inciting Incident, Climax, etc.) and provides structural advice.

### 3. CENTROID SYNC
*   Calculates a **Semantic Centroid** for the entire project. Detects "Drift" when a new chapter deviates too far from the project's core style and themes.

---

## 🌐 THE NEXUS (WORLD ENGINE v4.0)
**Role:** Entity Graph & Reality Visualizer.
**Location:** `src/components/NexusCanvas.tsx`.

### 1. IDENTITY PROTOCOL
*   **Deterministic Identity:** IDs = `DJB2_Hash(Slug + ProjectID)`.
*   **V3.0 Traits:** Uses universal traits (*Sentient, Tangible, Locatable, Abstract*) instead of rigid classes.

### 2. L.O.D. SYSTEM (Level of Detail)
*   **MACRO:** View factions and high-level relationships.
*   **MESO:** Standard interactive node view.
*   **MICRO:** Detailed cards with descriptions and crystallization tools.

### 3. THE LIFEBOAT (Boyas Locales)
*   If crystallization fails (e.g. network error), entities are saved as **Rescue Nodes** in `localStorage` until sync is restored.

---

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel.
**Model:** Gemini 3.0 Pro.
**Timeout:** 540 seconds.

### 1. THE JUDGES
1.  **The Architect (Blue):** Logic and pacing.
2.  **The Bard (Purple):** Aesthetics and subtext.
3.  **The Hater (Red):** Marketability and "cringe" detection.

### 2. FORENSIC AUDIT (The Notary)
*   Generates a **Human Score** and **Certificate of Authorship** based on the immutable audit log, distinguishing human effort from AI suggestions.

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
*   **Events Logged:** Manual Injection, Curation (accept/reject AI suggestions), and Structure changes. Used to generate legal Authorship Certificates.

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

### 5. DIRECTOR CONSTRAINTS
*   **Iron Guardian:** A sub-agent blocks hallucinations if they contradict files marked as `[PRIORITY LORE]`.
*   **Reality Tuner (Trifase):** Adjusts temperature/persona. Logical Engineer (< 0.4), Visionary Architect (< 0.7), Chaotic Dreamer (> 0.7).
