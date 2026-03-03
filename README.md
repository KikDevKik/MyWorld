# MyWorld: The Synaptic Loom

**AI-Powered Creative Writing Environment with Socratic Guidance & Forensic Authorship.**

Built for the future of narrative resonance | Powered by **Gemini 3.0 Pro & Flash**.

## 🚀 Overview

MyWorld is not just an editor; it's a **Creative Mirror**. It combines high-performance writing tools with a suite of AI agents ("The Titanium Protocol") designed to maintain continuity, visualize complex world-building, and certify human authorship in the age of generative AI.

## 🏗️ The Titanium Architecture (V3.0)

The core of MyWorld is the **Titanium Unified Architecture**, a trait-based entity system that synchronizes "The Cathedral" (Creative Magic) with "The Bunker" (Security & Persistence). 

*   **Deterministic Identity:** Every character, location, and object has a unique ID based on its narrative path.
*   **Trait-Based Taxonomy:** Entities are defined by functional traits (*Sentient, Tangible, Locatable*) rather than rigid RPG classes.
*   **Triple-Tier Triage:** All narrative elements live in one of three states:
    *   **Ghost:** Mentioned in text but not yet defined.
    *   **Limbo:** Draft entities living in the workbench.
    *   **Anchor:** Crystallized files synced with Google Drive.

## 🚀 System Modules

*   **🖋️ The Sentinel Editor:** A Zen-mode Markdown interface with real-time **Canon Radar** (The Guardian) that detects plot holes and character drift as you type.
*   **🌐 The Nexus (World Engine v4.0):** A 2D force-directed graph for world-building visualization. Supports **LOD (Level of Detail)** views (Macro/Meso/Micro) and **Crystallization** of ideas into files.
*   **🎬 The Director:** Your narrative orchestrator. Supports responsive modes (Sentinel, Strategist, War Room) and tactical tools like **The Inspector** and **The Tribunal**.
*   **⚖️ The Tribunal:** A literary critique panel featuring 3 distinct AI personalities: **The Architect** (Logic), **The Bard** (Aesthetics), and **The Hater** (Market/Cringe).
*   **🔨 The Forge (Soul Sorter):** Automatically extracts and triages entities from your manuscript using high-speed RAG analysis.
*   **🔬 The Laboratory:** A dedicated research space for lore and reference materials. Uses **Smart Tags** and **Lazy Classification** to organize your worldbuilding.
*   **🖨️ The Press:** Compiles manuscripts and generates a **Certificate of Authorship**, forensically proving human input through immutable logs.

## 🛠️ Tech Stack

*   **Frontend:** React 18 + Vite + TailwindCSS 4 (Titanium Dark Theme).
*   **State Management:** Zustand + React Context.
*   **Editor:** CodeMirror 6 (Markdown specialized).
*   **Visualization:** D3-force + React Xarrows + Framer Motion.
*   **Backend:** Firebase Cloud Functions v2 (Node.js 22).
*   **AI:** Google Gemini 3.0 Pro (Reasoning) & 3.0 Flash (Speed).
*   **Database:** Firestore Native Vector Search (Cosine Similarity).
*   **Storage:** Google Drive API v3 (Direct file-to-file sync).

## 🚀 Setup Instructions

### Prerequisites
*   Node.js (v20+)
*   pnpm (v9+)
*   Firebase CLI

### Installation
1.  Clone the repository and install dependencies:
    ```bash
    pnpm install
    ```
2.  Configure your `.env.local` with Firebase credentials.
3.  Set up Firebase secrets:
    ```bash
    firebase functions:secrets:set GOOGLE_API_KEY
    ```

### Running Local Development
```bash
pnpm dev
```
Open [http://localhost:5173](http://localhost:5173).
