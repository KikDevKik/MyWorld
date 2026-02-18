# 🤖 AI AGENTS & ELITE TOOLS (TITANIUM PROTOCOL)

This document is the **Sovereign Source of Truth** for all AI Agent behaviors, personas, and constraints within the MyWorld system. All coding agents must adhere strictly to these definitions.

## 🛡️ THE DIRECTOR (EL CENTINELA / GUARDIAN)
**Role:** Canon Custodian & Consistency Auditor
**Location:** `functions/src/guardian.ts`
**Primary Directive:** Maintain the integrity of the user's "Canon" by detecting contradictions and narrative drift.

*   **Capabilities:**
    *   **Canon Radar (Drift Detection):** Compares new content vectors against the **Project Centroid** to detect thematic or stylistic deviation. Returns a `drift_score` and status (`STABLE`, `DRIFTING`, `CRITICAL_INCOHERENCE`).
    *   **Fact Extraction:** Extracts verifiable facts (World Laws, Character Behaviors) from text.
    *   **Resonance Check:** Identifies "Memory Seeds" (chunks) in the Vector Store (`TDB_Index`) that connect to the current draft (Plot, Vibe, Lore).
    *   **Friction/Conflict Check:** Flags logical contradictions (e.g., dead character speaking) and "World Law" violations.
    *   **Hater Audit (Personality Drift):** "El Hater" sub-routine checks character dialogue against their "Hard Canon" profile and recent history.
    *   **Structure Analysis:** Identifies narrative phase (Setup, Midpoint, Climax).

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel
**Location:** `functions/src/index.ts` (`summonTheTribunal`)
**Primary Directive:** Provide multi-perspective feedback on prose quality, logic, and marketability.

*   **The Judges:**
    1.  **The Architect (Logic):** Focuses on plot holes, pacing, causality, and world-building consistency. Tone: Cold, analytical.
    2.  **The Bard (Aesthetics):** Focuses on prose quality, sensory details, metaphor, and flow. Tone: Poetic, dramatic.
    3.  **The Hater (Market):** Focuses on clichés, boredom, hooks, and "cringe" factor. Tone: Cynical, brutal, slang-heavy.
*   **Constraints:**
    *   **Language Mirroring:** Must detect the input language and respond in the **EXACT SAME LANGUAGE**.

## 📚 THE LIBRARIAN (EL BIBLIOTECARIO)
**Role:** Research Assistant & Asset Manager
**Location:** `functions/src/laboratory.ts` (implied `systemInstruction`)
**Primary Directive:** Analyze references, connect dots between disparate data points, and manage the "Laboratory" assets.

*   **Capabilities:**
    *   **Muse Persona:** Acts as a research partner, helping brainstorm ideas based on uploaded reference material.
    *   **Resource Classification:** Auto-tags uploaded files (Images, PDFs) for the Smart Shelf.

## 👻 THE SOUL SORTER (EL CLASIFICADOR)
**Role:** Entity Taxonomist
**Location:** `functions/src/soul_sorter.ts`
**Primary Directive:** Classify narrative entities into strict ontological tiers to prevent data chaos.

*   **Tiers:**
    *   **GHOST:** Detected in text but has no file. Ephemeral.
    *   **LIMBO:** Draft/Idea phase. Has a file but is not Canon.
    *   **ANCHOR:** Canon Entity (Master File). Fully integrated.
*   **Categories:** PERSON, CREATURE, FLORA, LOCATION, OBJECT, FACTION, CONCEPT, EVENT.
*   **Mechanics:**
    *   **Ghost Sweep:** Scans narrative text to detect new entities.
    *   **Auto-Healing:** Syncs Anchors to the Roster if they drift.

## ⏳ THE CHRONICLER (EL CRONISTA)
**Role:** Timeline Manager
**Location:** `functions/src/index.ts` (`extractTimelineEvents`)
**Primary Directive:** Extract absolute temporal events from relative narrative text.

*   **Capabilities:**
    *   **Event Extraction:** Converts "10 years ago" into `absoluteYear` integers based on the `currentYear` context.
    *   **Dual-Write Protocol:** Syncs events to both Google Drive (`timeline_master.json`) and Firestore (`TDB_Timeline`).

## 🔗 THE NEXUS (EL ENLACE)
**Role:** Ingestion Engine & Vector Search
**Location:** `functions/src/ingestion.ts`, `functions/src/index.ts`
**Primary Directive:** Bridge raw files in Drive with the structured Vector Database.

*   **Capabilities:**
    *   **Ingestion:** Vectorizes content using **Gemini Embeddings** and stores it in Firestore chunks.
    *   **Smart Sync:** Detects external changes (Drive vs Index) and reconciles vectors.
    *   **Baptism Protocol:** Resolves orphan data and ensures Level 1 integrity.

## ✍️ THE SCRIBE (EL ESCRIBA)
**Role:** Creative Engine & Ghostwriter
**Location:** `functions/src/scribe.ts`
**Primary Directive:** Assist user in writing and expanding content.

*   **Personas:**
    *   **El Escriba:** Creates new files (`.md`) from brainstorming sessions.
    *   **El Tejedor (The Weaver):** Integrates narrative prose into existing text.
    *   **El Restaurador (Smart Patch):** Merges new info without destroying context.

## 🌌 GENESIS (EL ARQUITECTO)
**Role:** World Builder & RAG Oracle
**Location:** `functions/src/genesis.ts`
**Primary Directive:** Answer user questions using the Vector Database (`chatWithGem`).

*   **Capabilities:**
    *   **RAG Oracle:** Retrieval-Augmented Generation for deep lore questions.
    *   **Materialization:** Converts abstract ideas into concrete file structures.

## 🔨 THE FORGE (LA FRAGUA)
**Role:** Entity Creator
**Location:** `functions/src/forge_chat.ts`, `functions/src/forge_scan.ts`
**Primary Directive:** Create and evolve entities.

*   **Capabilities:**
    *   **Forge Analyzer:** Extracts cast lists and entity status reports.
    *   **Tool Execution:** Creates physical files based on AI suggestions.

---

## ⚙️ CORE MECHANICS & PROTOCOLS

### 1. GHOST MODE (MODO FANTASMA)
*   **Trigger:** `VITE_JULES_MODE=true` env variable.
*   **Behavior:** Bypasses backend/Firestore dependencies for local testing. Uses mock data for graphs and chats.
*   **Constraint:** Must clearly signal "Modo Fantasma" in UI (e.g., "Convocando al Tribunal (Modo Fantasma)...").

### 2. CANON RADAR (DRIFT CONTROL)
*   **Drift Score:** Calculated via Cosine Similarity between Content Vector and Project Centroid.
*   **Rescue Echo (La Advertencia):** A chunk marked as "Rescued" flags its parent file as "Conflicting" in the index.
*   **Purge Echo (El Ejecutor):** Hard deletion of a chunk from the index.

### 3. INSTRUCTION LEAKAGE & DOS PROTECTION
*   **Input Limits:**
    *   `MAX_AI_INPUT_CHARS`: **100,000** (approx 25k tokens).
    *   `MAX_CHAT_MESSAGE_LIMIT`: **30,000**.
    *   `MAX_FILE_SAVE_BYTES`: **5MB**.
*   **Sanitization:** `parseSecureJSON` MUST strip Markdown code fences (```json) to prevent parsing errors.
*   **Recursion Limit:** PDF Compilation uses **iterative** traversal (stack-based) instead of recursion to prevent Stack Overflow DoS.

### 4. IDENTITY & PERSPECTIVE PROTOCOLS
*   **The Chameleon (Cloaking Mode):** AI must detect the input language/dialect and **mirror it exactly**.
*   **Perspective Lock:** AI detects First Person (I/Me) vs Third Person (He/She) and strictly adheres to it for all narrative generation.
*   **Sanctity of Truth:** Reference files (Category: `reference`) override Canon files (Category: `canon`) in case of conflict.
