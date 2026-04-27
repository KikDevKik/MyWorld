# MyWorld: The Synaptic Loom
**AI-Powered Creative Writing Environment with Socratic Guidance & Forensic Authorship.**

> *"Not a tool. A Cathedral."*
> Built on the **Titanium Protocol (V3.0)** | Powered by **Gemini 3.1 Pro & Flash Lite**

---

## 🧭 What is MyWorld?

MyWorld is a **World Engine** — a living writing environment that combines a high-performance Markdown editor with a suite of specialized AI agents designed to maintain narrative continuity, visualize world-building, and certify human authorship in the age of generative AI.

It operates on a core duality:
- **The Cathedral** — the creative magic: AI as Active Mirror, not just a tool.
- **The Bunker** — absolute persistence: truth lives in physical Markdown files (Google Drive) and immutable logs (Firestore).

---

## 🏗️ Architecture: The Titanium Protocol (V3.0)

The backbone of MyWorld is a **Trait-Based Entity Ontology** that synchronizes the Cathedral and the Bunker.

- **Deterministic Identity:** Every entity has a unique ID based on `DJB2_Hash(Slug + ProjectID)`.
- **Trait-Based Taxonomy:** Entities are defined by functional traits (`sentient`, `tangible`, `locatable`, `temporal`, `organized`, `abstract`) rather than rigid RPG classes.
- **Triple-Tier Lifecycle:**
  - **Ghost** — mentioned in text, not yet defined.
  - **Limbo** — draft entity on the workbench.
  - **Anchor** — crystallized file synced with Google Drive.

---

## 🚀 System Modules

### 🗃️ Zone A: The Memory (The Vault)
| Module | Description |
|---|---|
| **The Vault (Sidebar)** | Live file tree separating CANON from RESOURCES. Syncs via Firestore `onSnapshot`. |
| **Neural Link** | Persistent Google Drive OAuth 2.0 connection with auto-refresh token. |
| **Project Matrix** | Taxonomy configuration — maps Drive folders to narrative roles. |
| **Zen Mode** | Cognitive shield. Partially unmounts heavy panels to free browser memory. |

### ✍️ Zone B: The Stage (Action)
| Module | Description |
|---|---|
| **Hybrid Editor** | CodeMirror 6 with `driftExtension` (continuity underlines) and Sovereign Area protection. |
| **The Forge (Soul Sorter)** | Extracts and triages entities (Ghost → Limbo → Anchor) from manuscript. |
| **Nexus Canvas v4.0** | D3-force graph with LOD (Macro/Meso/Micro), Crystallization, and Ghost Nodes. |
| **The Chronologist** | Extracts timeline events from text. DAG structure in `TDB_Timeline`. |
| **The Laboratory** | Research space with Smart Tags (`LORE`, `SCIENCE`, `VISUAL`) and RAG chat. |
| **The Press** | Compiles manuscripts to PDF via `pdfmake` + generates Authorship Certificates. |

### 🧠 Zone C: The Intelligence (The Arsenal)
| Module | Description |
|---|---|
| **The Director** | Narrative co-pilot with long-term RAG memory. Modes: Sentinel / Strategist / War Room. |
| **The Tribunal** | 3-judge AI critique panel: The Architect (Logic), The Bard (Aesthetics), The Hater (Market). |
| **The Guardian (Canon Radar)** | Passive continuity surveillance. Detects Friction, Personality Drift, and World Law violations. |
| **Sentinel Status** | System hygiene dashboard. Vault health scan + irreversible Ghost File purge. |

---

## 🤖 AI Model Assignments

| Agent | Model | Reasoning |
|---|---|---|
| **The Director / Tribunal / Forge** | `gemini-3.1-pro-preview` | Complex reasoning, logic, critique |
| **Guardian / Soul Sorter / Scribe** | `gemini-3.1-flash-lite-preview` | High-speed, low-latency tasks |
| **TTS (Narrator)** | `gemini-2.5-pro-preview-tts` | High-fidelity emotional audio |
| **Embeddings (RAG)** | `gemini-embedding-001` @ 768d | Semantic vector search |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TailwindCSS 4, Framer Motion, CodeMirror 6 |
| **State** | Zustand + React Context |
| **Visualization** | D3-force, React Xarrows |
| **Backend** | Firebase Cloud Functions v2 (Node.js 22), Serverless |
| **AI** | Google Gemini 3.1 Pro & Flash Lite (Preview) |
| **Vector DB** | Firestore Native Vector Search (Cosine Similarity, 768d) |
| **Storage** | Google Drive API v3 (direct file sync) |
| **Auth** | Google Identity Services v2 (OAuth 2.0 + persistent Refresh Token) |

---

## 🔒 Ghost Mechanics (Invisible Protocols)

- **Creative Audit** — Immutable `audit_log` in Firestore. Records every human injection, curation decision, and structural change with `serverTimestamp()`. Source of Authorship Certificates.
- **Silent Scribe (Auto-Save)** — 2000ms debounce. Marks saves as `isSignificant` if `|diff| > 50 chars`. Triggers re-index.
- **Neuronal Sync** — Backend listens to Drive changes via `onSnapshot` on `TDB_Index`. Incremental re-indexing based on SHA-256 content hash.
- **Sovereign Areas** — `<!-- SOVEREIGN START -->` blocks are untouchable by any AI agent during patch or sync operations.

---

## ⚙️ Setup

### Prerequisites
- Node.js v22+
- npm v10+
- Firebase CLI

### Installation
```bash
git clone <repo>
npm install
```

### Environment
Configure `.env.local` with Firebase credentials. Set secrets:
```bash
firebase functions:secrets:set GOOGLE_API_KEY
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
```

### Local Development
```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Firebase Emulator (Functions on :5001)
firebase emulators:start
```

Frontend: `http://localhost:3000` | Functions: `http://localhost:5001`

---

## 🗺️ Roadmap

See [`ROADMAP.md`](./ROADMAP.md) for planned features and Oracle Pitches status.

---

## 📚 Documentation Index

| Document | Purpose |
|---|---|
| `AGENTS.md` | AI agent definitions & constraints for coding agents (Antigravity) |
| `ROADMAP.md` | Feature roadmap and Oracle Pitch tracker |
| `TECHNICAL_CHEAT_SHEET.md` | Architecture deep-dive for technical interviews |
| `MANIFIESTO_TITANIUM.txt` | Project philosophy and vision |