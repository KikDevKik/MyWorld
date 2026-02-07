# 🤖 AGENTS & ELITE TOOLS

This document describes the core AI agents and background processes that power **MyWorld**. These components work autonomously or semi-autonomously to ensure narrative consistency, manage data, and assist the user.

## 🛡️ The Director (Guardian)
**Role:** Canon Custodian & Consistency Auditor
**Location:** `functions/src/guardian.ts`
**Description:**
The Director (also known as The Guardian or Sentinel) is responsible for maintaining the integrity of the user's "Canon". It performs real-time audits of new content against the existing knowledge base (Vector Store).
*   **Capabilities:**
    *   **Fact Extraction:** Extracts verifiable facts, world laws, and character behaviors.
    *   **Drift Detection:** Compares new content against the project's "Centroid" to detect thematic or stylistic drift.
    *   **Resonance Check:** Identifies if the current draft connects to existing memory seeds (plot, vibe, lore).
    *   **Conflict Resolution:** Flags contradictions (e.g., a dead character appearing alive) and "World Law" violations.
    *   **Profile Analysis:** Updates character profiles based on new behavioral data.

## 🔗 The Nexus
**Role:** Digestion System & Central Nervous System
**Location:** `functions/src/ingestion.ts`, `functions/src/migration.ts`
**Description:**
The Nexus handles the ingestion, processing, and retrieval of all textual data. It is the bridge between the raw files in Google Drive and the structured Vector Search index in Firestore.
*   **Capabilities:**
    *   **Ingestion:** Vectorizes file content using Gemini Embeddings and stores it in Firestore (`TDB_Index`).
    *   **Migration (Titanium):** Manages the "Baptism" protocol and `migrateDatabaseV1toV2`, flattening legacy JSON trees into scalable collections.
    *   **Synchronization:** Ensures that the `files` collection in Firestore is always in sync with Google Drive state (Drive ID is King).

## 🔮 The Soul Sorter
**Role:** Taxonomist & Entity Classifier
**Location:** `functions/src/soul_sorter.ts`
**Description:**
The Soul Sorter is an intelligent classification engine that analyzes entities and sorts them into the correct semantic categories (Character, Location, Faction, Object, Event, Lore, Concept). It prevents data chaos by ensuring every "Soul" (Entity) has a proper home.

## ✍️ The Scribe (El Escriba)
**Role:** Creative Engine & Ghostwriter
**Location:** `functions/src/scribe.ts`
**Description:**
The Scribe is the primary generative agent for content creation. It assists the user in writing, expanding, and refining their world.
*   **Personas:**
    *   **El Escriba:** Creates new files (`.md`) from chat brainstorming sessions, synthesizing raw ideas into structured documents.
    *   **El Tejedor (The Weaver):** Integrates suggested narrative prose seamlessly into the user's existing text.
    *   **El Restaurador (The Smart Patch):** Intelligently merges new information into existing files without destroying context.
    *   **El Guionista (The Guide):** Transforms narrative text into a step-by-step writing guide/outline.

## 🧹 The Janitor (El Candado)
**Role:** Concurrency Manager
**Location:** `functions/src/janitor.ts`
**Description:**
The Janitor ensures data integrity during collaborative or multi-tab sessions. It manages file locks (`acquireLock`, `releaseLock`) to prevent race conditions where two processes might try to edit the same file simultaneously.

## 🌌 Genesis (The Architect)
**Role:** World Builder & RAG Oracle
**Location:** `functions/src/genesis.ts`
**Description:**
Genesis is the RAG (Retrieval-Augmented Generation) engine of MyWorld. It answers user questions by querying the vector database (`TDB_Index`) and synthesizing the results into coherent, canon-aware responses. It powers the "Chat with World" feature and the "Ask Genesis" tool.

## 🧪 The Idea Laboratory (Muse)
**Role:** Asset Management & Research Assistant
**Location:** `functions/src/laboratory.ts`
**Description:**
The Laboratory is where "Reference" material (images, PDFs, links) is processed and converted into "Canon". It features a dedicated chat persona ("Muse") that helps the user research topics, analyze uploaded documents, and brainstorm ideas before they are crystallized into the main project.

## 🔨 The Forge of Souls
**Role:** Entity Generator & Character Architect
**Location:** `src/components/forge/ForgeDashboard.tsx`, `functions/src/forge_chat.ts`
**Description:**
The Forge is a specialized environment for creating and developing entities. It allows the user to:
*   **Generate Ideas:** Spawn new characters, locations, or factions from scratch.
*   **Detect Ghosts:** Identify mentioned entities in the text that don't have a file yet.
*   **Evolve Entities:** Upgrade a "Ghost" (Idea) to a "Limbo" (Draft) and finally to an "Anchor" (Master File).
*   **Bestiary Mode:** Specialized support for creating creatures and flora with unique metadata.
