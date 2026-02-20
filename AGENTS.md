# 🤖 AI AGENTS & ELITE TOOLS (TITANIUM PROTOCOL)

This document is the **Sovereign Source of Truth** for all AI Agent behaviors, personas, and constraints within the Titanium project. All coding agents must adhere strictly to these definitions, bridging the gap between raw human manuals (in Spanish) and technical implementation.

## 🛡️ THE DIRECTOR (EL CENTINELA / GUARDIAN)
**Role:** Canon Custodian & Narrative Orchestrator
**Location:** `functions/src/guardian.ts`, `src/components/DirectorPanel.tsx`
**Primary Directive:** Maintain the integrity of the user's "Canon" by detecting contradictions and narrative drift, acting as an omnipresent co-author.

*   **Operational Modes (Layout Context):**
    *   **Sentinel Mode:** (Width < 500px) Silent observation. Chat only.
    *   **Strategist Mode:** (Width 500px - 900px) Deploys **Tactical Tools** (Sidebar).
    *   **War Room:** (Width > 900px) Full command center. Displays historical session logs + tools.

*   **Tactical Capabilities:**
    *   **The Inspector (El Casting):** Analyzes the current scene to extract a "Casting Report" (Active Characters, Tone, Pacing). In Ghost Mode, simulates archetypes (e.g., "Weary Leader").
    *   **Canon Radar (Drift Detection):** Compares new content vectors against the **Project Centroid**. Returns `drift_score` and status (`STABLE`, `DRIFTING`, `CRITICAL_INCOHERENCE`).
    *   **Memory Sync (La Sinapsis):** Forces a manual refresh of the AI's short-term context from the active file.
    *   **Sensory Interface:** Accepts multi-modal input (Images, Audio) to influence narrative advice.

## ⚖️ THE TRIBUNAL (EL JUICIO)
**Role:** Literary Critique Panel
**Location:** `functions/src/index.ts` (`summonTheTribunal`)
**Primary Directive:** Provide multi-perspective feedback on prose quality, logic, and marketability.

*   **The Judges:**
    1.  **The Architect (Blue):** Logic, plot holes, pacing, causality, world-building consistency. Tone: Cold, analytical.
    2.  **The Bard (Purple):** Aesthetics, sensory details, metaphor, prose flow. Tone: Poetic, dramatic.
    3.  **The Hater (Red):** Market viability, clichés, boredom, "cringe" factor. Tone: Cynical, brutal, slang-heavy.
*   **Constraint:** Must detect input language and respond in the **EXACT SAME LANGUAGE**.

## 🧹 THE SENTINEL (EL CONSERJE / JANITOR)
**Role:** System Health & Hygiene
**Location:** `functions/src/janitor.ts` (`scanVaultHealth`, `purgeArtifacts`)
**Primary Directive:** Ensure the project vault remains clean of "Ghost Files" (0-byte or corrupt artifacts).

*   **Capabilities:**
    *   **Vault Scan:** Calculates a "Health Score" based on valid vs. corrupt files.
    *   **The Purge:** Irreversibly deletes identified "Ghost Files" to heal the project tree.

## ✍️ THE SCRIBE (EL ESCRIBA - BACKEND)
**Role:** Creative Engine & Ghostwriter
**Location:** `functions/src/scribe.ts`
**Primary Directive:** Assist user in generating and expanding content via AI.

*   **Sub-Routines:**
    *   **The Weaver (El Tejedor):** Integrates raw ideas/suggestions into seamless narrative prose.
    *   **The Restorer (Smart Patch):** Merges new information into existing files without destroying context.
    *   **The Guide (El Guionista):** Transforms narrative text into step-by-step writing instructions (Beats).

## 💾 THE SILENT SCRIBE (AUTO-SAVE - FRONTEND)
**Role:** Data Persistence
**Location:** `src/App.tsx` (Auto-Save Mechanic)
**Primary Directive:** Prevent data loss via "Neuronal Sync".

*   **Mechanics:**
    *   **Heartbeat:** Triggers after 2 seconds of inactivity.
    *   **Significant Update:** If `char_diff > 50`, flags the update as "Significant" to trigger a vector re-index (Learning).

## 📚 THE LIBRARIAN (EL BIBLIOTECARIO)
**Role:** Research Assistant & Asset Manager
**Location:** `functions/src/laboratory.ts`
**Primary Directive:** Analyze references ("Idea Laboratory") and connect disparate data points.

*   **Capabilities:**
    *   **Muse Persona:** Brainstorms ideas based on uploaded reference material.
    *   **Smart Shelf:** Auto-tags and classifies uploaded assets (Images, PDFs).

## 👻 THE SOUL SORTER (EL CLASIFICADOR)
**Role:** Entity Taxonomist
**Location:** `functions/src/soul_sorter.ts`
**Primary Directive:** Classify narrative entities into strict ontological tiers.

*   **Tiers:**
    *   **GHOST:** Detected in text, no file.
    *   **LIMBO:** Draft phase, file exists but not Canon.
    *   **ANCHOR:** Canon Entity (Master File).
*   **Categories:** PERSON, CREATURE, FLORA, LOCATION, OBJECT, FACTION, CONCEPT, EVENT.

## 🔗 THE NEXUS (EL ENLACE)
**Role:** Ingestion Engine & Vector Search
**Location:** `functions/src/ingestion.ts`
**Primary Directive:** Bridge raw files in Drive with the structured Vector Database.

*   **Capabilities:**
    *   **Smart Sync:** Detects external changes (Drive vs Index) and reconciles vectors.
    *   **Baptism Protocol:** Resolves orphan data and ensures Level 1 integrity.

---

## ⚙️ CORE MECHANICS & PROTOCOLS

### 1. GHOST MODE (MODO FANTASMA)
*   **Trigger:** `VITE_JULES_MODE=true` env variable.
*   **Behavior:** Bypasses backend/Firestore dependencies for local testing. Uses mock data for graphs and chats.
*   **Simulation:** In Ghost Mode, agents (Director, Tribunal) return *simulated* analysis (e.g., "Simulated Verdict: 85/100") to test UI flows without consuming tokens.

### 2. CREATIVE AUDIT (LA AUDITORÍA)
*   **Purpose:** Provenance & Forensics.
*   **Mechanism:** `CreativeAuditService.ts` logs every user interaction (writing, editing, accepting AI suggestions) to a tamper-proof Firestore collection.
*   **Goal:** Generate a "Certificate of Authorship" proving human effort vs. AI generation.

### 3. CANON RADAR (DRIFT CONTROL)
*   **Drift Score:** Calculated via Cosine Similarity between Content Vector and Project Centroid.
*   **Rescue Echo (La Advertencia):** A chunk marked as "Rescued" flags its parent file as "Conflicting" in the index.
*   **Purge Echo (El Ejecutor):** Hard deletion of a chunk from the index.

### 4. INSTRUCTION LEAKAGE & DOS PROTECTION
*   **Input Limits:**
    *   `MAX_AI_INPUT_CHARS`: **100,000** (approx 25k tokens).
    *   `MAX_CHAT_MESSAGE_LIMIT`: **30,000**.
    *   `MAX_FILE_SAVE_BYTES`: **5MB**.
*   **Sanitization:** `parseSecureJSON` MUST strip Markdown code fences (```json) to prevent parsing errors.
*   **Recursion Limit:** PDF Compilation uses **iterative** traversal (stack-based) instead of recursion to prevent Stack Overflow DoS.

### 5. IDENTITY & PERSPECTIVE PROTOCOLS
*   **The Chameleon (Cloaking Mode):** AI must detect the input language/dialect and **mirror it exactly**.
*   **Perspective Lock:** AI detects First Person (I/Me) vs Third Person (He/She) and strictly adheres to it for all narrative generation.
