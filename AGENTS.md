# 🤖 AGENTS & ELITE TOOLS (TITANIUM EDITION)

> **SOVEREIGN SOURCE OF TRUTH**: This document bridges the raw implementation logic with the high-level personas. All coding agents must adhere to these definitions.

## 🛡️ The Director (Guardian)
**Role:** Canon Custodian & Consistency Auditor
**Location:** `functions/src/guardian.ts`
**Core Logic:** `auditContent`, `scanProjectDrift`, `rescueEcho`
**Description:**
The Director (Sentinel) enforces the integrity of the "Canon". It uses a multi-layered audit system to detect contradictions and drift.

### Sub-Modules:
1.  **The Resonator (Memory Seeds):**
    *   Identifies thematic connections (Plot, Vibe, Lore) by scanning vector chunks.
    *   Ensures new content "rhymes" with existing canon.
2.  **The Logic Auditor:**
    *   Detects factual contradictions (e.g., a dead character speaking).
    *   Flags temporal paradoxes.
3.  **The Reality Filter:**
    *   Enforces "World Laws" (Magic, Physics, Tech levels).
    *   Blocks content that violates the established rules of the universe.
4.  **El Hater (Character Critic):**
    *   Ruthless analysis of character behavior against their "Hard Canon" profile.
    *   Flags "Out of Character" (OOC) actions or dialogue.

### Mechanics:
*   **Canon Radar:** Calculates a `drift_score` by comparing new content vectors against the Project Centroid.
*   **Drift Control:** Files exceeding a drift threshold (0.6) are flagged as `CRITICAL_INCOHERENCE`.
*   **Rescue Echo:** Allows users to "rescue" a drifting chunk, marking the parent file as `CONFLICTING` but preserving the idea.

## ⚖️ The Tribunal
**Role:** Literary High Court
**Location:** `functions/src/index.ts` (`summonTheTribunal`)
**Description:**
A panel of three distinct AI judges that critique a text based on the project's specific "Genre Awareness".

### The Judges:
1.  **The Architect (Logic & Structure):**
    *   Focus: Pacing, plot holes, causality.
    *   Voice: Cold, analytical, precise.
2.  **The Bard (Aesthetics & Emotion):**
    *   Focus: Prose quality, sensory details, emotional resonance.
    *   Voice: Poetic, dramatic, flowery.
3.  **The Hater (Market & Cynicism):**
    *   Focus: Clichés, boredom, marketability, "cringe" factor.
    *   Voice: Sarcastic, brutal, internet-slang heavy.

## 🧠 The World Engine (Titan Link)
**Role:** The Creative Core & Simulation Engine
**Location:** `functions/src/index.ts` (`worldEngine`)
**Description:**
The central creative intelligence that powers "Chat with World" and deep simulations. It adapts its persona based on the requested **Chaos Level**.

### Chaos Personas:
*   **The Engineer (Low Chaos < 0.39):** Prioritizes hard consistency, causal chains, and strict magic systems.
*   **The Architect (Mid Chaos < 0.60):** Balances structure with creativity. The "Visionary" mode.
*   **The Dreamer (High Chaos > 0.60):** Prioritizes aesthetics, symbolism, and surprise. Breaks patterns.

### Thought Protocol:
*   **Thinking Block:** All World Engine responses MUST be preceded by a `<thinking>...</thinking>` block (hidden from user) where the AI performs structural analysis before generating the final output.

## ✍️ The Scribe (El Escriba)
**Role:** Ghostwriter & Content Generator
**Location:** `functions/src/scribe.ts`
**Description:**
Generates prose and narrative content. It adheres to strict "Anti-Makeup" policies to prevent metadata hallucination.

### Key Policies:
*   **Anti-Makeup:** The Scribe must NEVER invent metadata fields (e.g., `age: unknown`, `status: active`) if they are not explicitly in the source. Ghost metadata is pruned.
*   **Instruction Leakage Prevention:**
    *   **Negative Constraints:** Prompts must explicitly forbid the inclusion of system instructions (e.g., "Do not mention you are an AI", "Do not output XML tags in final text").
    *   **Ignorance Selectiva:** If the AI hallucinates technical markers (like `-[TIMELINE]`), the system strips them before presentation.

## 🕯️ The Librarian (Muse)
**Role:** Reference Analyst & Dot Connector
**Location:** `functions/src/laboratory.ts`
**Description:**
Manages the "Idea Laboratory". Its mission is to analyze uploaded references (PDFs, Images, Links) and connect them to the existing graph.
*   **Capabilities:** `classifyResource`, `enrichCharacterContext` (Deep Dive).

## 🔮 Genesis (Protocol Genesis)
**Role:** The Socratic Architect
**Location:** `functions/src/genesis.ts`
**Description:**
The "Big Bang" engine. It materializes a full project structure (Folders, Files, Config) from a simple user prompt or "Spark".

## ⚙️ Core Mechanics (System Level)

### 👻 Ghost Mode
*   **Definition:** A simulated environment (`VITE_JULES_MODE=true`) that allows testing the UI and core logic without a live Firebase/Auth connection.
*   **Constraint:** Agents must handle missing `currentUser` gracefully in this mode (using mock tokens).

### 📡 Canon Radar (Drift Detection)
*   **Centroid:** A vector average of all "Canon" files in the project.
*   **Drift Score:** `1.0 - cosineSimilarity(contentVector, centroidVector)`.
*   **Thresholds:**
    *   > 0.4: Warning (Drifting)
    *   > 0.6: Critical (Incoherent)

### ⚓ Titanium Factory
*   **Strategy:** A unified service for entity creation.
*   **Constraint:** All file creation (Characters, Locations) must go through the Factory to ensure proper metadata tagging and ID generation.
