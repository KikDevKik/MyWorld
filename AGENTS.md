# 🤖 AGENTS.md — MyWorld: Titanium Protocol
> **SOVEREIGN SOURCE OF TRUTH** for all coding agents (Antigravity, Jules, etc.).
> Branch: `dev-v2` | Stack: React 18 + Firebase Cloud Functions v2 + Gemini 3.1
> Last updated: March 2026

---

## ⚡ CRITICAL RULES FOR ALL AGENTS

1. **Never touch `main` branch.** All work goes to `dev-v2`.
2. **Always run `cd functions && npm run build` after modifying any file in `functions/src/`.**
3. **All new Cloud Functions MUST be exported in `functions/src/index.ts`.**
4. **Import `admin` and `db` exclusively from `functions/src/admin.ts`** — never call `admin.initializeApp()` elsewhere.
5. **Embeddings use `outputDimensionality: 768`** — Firestore vector index is configured for 768d.
6. **CORS is handled by Firebase SDK** — do NOT add manual CORS headers to `onCall` functions.
7. **Sovereign Areas** (`<!-- SOVEREIGN START --> ... <!-- SOVEREIGN END -->`) in Markdown files must NEVER be overwritten by any agent.

---

## 🏗️ CORE PHILOSOPHY

- **The Cathedral:** AI as "Active Mirror" (Espejo Activo). Understands plot, detects contradictions, visualizes structure.
- **The Bunker:** Absolute persistence. Truth lives in physical Markdown files (Google Drive) and immutable Firestore logs.
- **The Bridge:** Coding agents ("The Weaver") implement the manuals from `.Jules/Manuals/` as technical constraints.

---

## ⚡ TECH STACK & MODEL ASSIGNMENTS

| Role | Model String | Used For |
|---|---|---|
| **The Judge** | `gemini-3.1-pro-preview` | Director Logic, Tribunal, Chat RAG, complex reasoning |
| **The Soldier** | `gemini-3.1-flash-lite-preview` | Guardian Scan, Soul Sorter, Scribe Synthesis |
| **The Librarian** | `gemini-3.1-flash-lite-preview` | Laboratory research, classification |
| **TTS** | `gemini-2.5-pro-preview-tts` | High-fidelity Text-to-Speech (DO NOT change) |
| **Embeddings** | `gemini-embedding-001` | Vector search — always use `outputDimensionality: 768` |

Constants live in `functions/src/ai_config.ts` and `src/constants.ts`.

---

## 📁 KEY FILE MAP

```
functions/src/
├── admin.ts          ← Singleton Firebase Admin init. Import from here ONLY.
├── ai_config.ts      ← MODEL_FLASH, MODEL_PRO constants
├── index.ts          ← ALL function exports. If a function isn't here, it doesn't exist.
├── config.ts         ← ALLOWED_ORIGINS (must include http://localhost:3000)
├── director.ts       ← The Director agent
├── guardian.ts       ← Canon Radar / Guardian agent
├── soul_sorter.ts    ← Forge / Soul Sorter agent
├── scribe.ts         ← File creation & patch (Smart-Sync)
├── ingestion.ts      ← RAG chunking & vectorization
├── vector_utils.ts   ← Embedding helpers (use outputDimensionality: 768)
├── crystallization.ts← Ghost → Anchor crystallization
├── audit.ts          ← Authorship certificate & forensic audit
├── janitor.ts        ← Sentinel / system hygiene
└── types/
    └── forge.ts      ← TitaniumEntity, EntityTier, EntityCategory

src/
├── services/api.ts   ← callFunction() wrapper. Connects to emulator on localhost:5001.
├── lib/firebase.ts   ← Firebase init (Firestore points to PRODUCTION)
└── constants.ts      ← Frontend model constants
```

---

## ☁️ EXPORTED CLOUD FUNCTIONS (44 total)

All functions below MUST be exported from `functions/src/index.ts`:

**Auth & Drive:**
`exchangeAuthCode`, `refreshDriveToken`, `revokeDriveAccess`

**Drive File Operations:**
`saveDriveFile`, `getDriveFileContent`, `getDriveFiles`, `scribeCreateFile`, `scribePatchFile`, `getBatchDriveMetadata`, `getFileSystemNodes`, `renameDriveFolder`, `trashDriveItems`

**Sync & Index:**
`syncSmart`, `discoverFolderRoles`, `createTitaniumStructure`, `indexTDB`, `checkIndexStatus`, `crystallizeGraph`, `crystallizeForgeEntity`, `relinkAnchor`

**AI Agents:**
`auditContent`, `forgeToolExecution`, `analyzeStyleDNA`, `generateSpeech`, `classifyResource`, `integrateNarrative`, `transformToGuide`, `scanProjectDrift`, `rescueEcho`, `purgeEcho`

**Project Config:**
`saveProjectConfig`, `nukeProject`

**Forge / Session:**
`addForgeMessage`, `clearSessionMessages`, `deleteForgeSession`, `updateForgeCharacter`

**Locks:**
`acquireLock`, `releaseLock`

**Health & Cleanup:**
`scanVaultHealth`, `purgeArtifacts`, `purgeEmptySessions`, `purgeForgeEntities`, `purgeForgeDatabase`

**Export:**
`generateAuditPDF`, `generateCertificate`

---

## 🎬 THE DIRECTOR

**File:** `functions/src/director.ts`, `src/components/DirectorPanel.tsx`
**Model:** `gemini-3.1-pro-preview`

### Layout Modes
- **Sentinel (<500px):** Silent observation. Chat only.
- **Strategist (500px-900px):** Tactical Tools sidebar unlocked.
- **War Room (>900px):** Full command center with session history.

### Tactical Tools
- `handleInspector` — Casting Report (Characters, Tone, Pacing). Returns structured JSON.
- `handleTribunal` → calls `summonTheTribunal` Cloud Function.
- `handleContextSync` — Forces manual context refresh.
- `handleSendMessage` — Accepts image/audio attachments for multi-modal advice.

### Reality Tuner (Temperature)
- **Rigor (LOGIC):** `temp < 0.4` — zero hallucinations, pure canon.
- **Fusión (BALANCE):** `temp < 0.7` — narrative balance.
- **Entropía (CHAOS):** `temp > 0.7` — creative chaos.

---

## 🛡️ THE GUARDIAN (Canon Radar)

**File:** `functions/src/guardian.ts`, `src/hooks/useGuardian.ts`
**Model:** Flash Lite (detection) + Pro (logic)

### Trigger
SHA-256 hash change on text buffer. 3000ms debounce.

### Detection Scope
- **Friction Analysis:** Logical contradictions against RAG memory.
- **Personality Drift:** "The Hater" persona detects character betrayal.
- **World Law Violations:** Physics, magic, chronology flags.
- **Resonance Engine:** Connects current draft to past "Memory Seeds."
- **Structure Analyst:** Identifies narrative phase (Setup, Climax, etc.).
- **Centroid Sync:** Detects drift from project's core style/theme.

### Vector Dimension
Always use `outputDimensionality: 768` in all `embedContent()` calls.

---

## ⚖️ THE TRIBUNAL

**Cloud Function:** `summonTheTribunal`
**Model:** `gemini-3.1-pro-preview`
**Timeout:** 540 seconds

### The Judges
1. **The Architect (Blue):** Logic and pacing.
2. **The Bard (Purple):** Aesthetics and subtext.
3. **The Hater (Red):** Marketability and cringe detection.

### Known Issue (dev-v2)
`summonTheTribunal` must be exported in `index.ts` — CORS error appears when missing.

---

## 🌐 THE NEXUS (World Engine v4.0)

**File:** `src/components/NexusCanvas.tsx`

### Identity Protocol
IDs = `DJB2_Hash(Slug + ProjectID)`. Deterministic — same entity always gets same ID.

### LOD System
- **MACRO:** Faction-level overview.
- **MESO:** Standard interactive node view.
- **MICRO:** Detailed cards with crystallization tools.

### Entity Visuals (Traits → Colors)
When refactoring NexusCanvas, use traits not `node.type`:
```typescript
const traits = node.traits || legacyTypeToTraits(node.type); // migration bridge
// ['sentient'] → Yellow
// ['locatable'] → Cyan
// ['abstract'] → Purple
```

### The Lifeboat
Failed crystallizations are saved as Rescue Nodes in `localStorage` until sync restores.

---

## 🔬 THE LABORATORY

**File:** `src/components/LaboratoryPanel.tsx`
**Model:** `gemini-3.1-flash-lite-preview`

- **Scope:** ONLY files in `_RESOURCES` / `_RECURSOS` folders.
- **Smart Tags:** `classifyResource` → `LORE`, `SCIENCE`, `VISUAL`.
- **Lazy Classification:** 2000ms debounce, batches of 3.
- **Prompt Injection:** Always use `escapePromptVariable()` on `fileName`, `mimeType`, `snippet` before interpolation (injection vulnerability prevention).

---

## 🏭 TITANIUM FACTORY (Entity Lifecycle)

**Status:** Hybrid V2.5 — legacy `type` field still present for backward compat.

### Do NOT remove `type` from frontmatter yet.
`soul_sorter.ts` and `NexusCanvas.tsx` still depend on `node.type`. Use the bridge:
```typescript
const traits = node.traits || legacyTypeToTraits(node.type);
```

### Smart-Sync Rules
1. Calculate `SHA-256` of file content before any write.
2. If `newHash === storedHash` → **ABORT WRITE** (prevents Echo Loop).
3. `<!-- SOVEREIGN START --> ... <!-- SOVEREIGN END -->` blocks are UNTOUCHABLE.
4. Debounce writes: if `Date.now() - last_titanium_sync < 5000ms` → skip reconciliation.

---

## 🧹 THE SENTINEL (Janitor)

**File:** `functions/src/janitor.ts`, `src/components/SentinelStatus.tsx`

- `scanVaultHealth` — calculates Health Score (Valid vs Corrupt).
- `purgeArtifacts` — **IRREVERSIBLY** deletes 0-byte or corrupt Ghost Files.
- `toggleShowOnlyHealthy` — visual filter only, does NOT delete.

---

## 👻 GHOST MECHANICS

### Creative Audit
- **Service:** `CreativeAuditService.ts`
- **Storage:** Immutable `audit_log` Firestore collection.
- **Security:** `serverTimestamp()` only — no client clock manipulation possible.
- **Events:** `INJECTION`, `CURATION`, `STRUCTURE`.

### Silent Scribe (Auto-Save)
- 2000ms debounce on `selectedFileContent`.
- `isSignificant: true` if `Math.abs(diff) > 50`.
- Significant saves update `lastSignificantUpdate` → triggers Director re-index.

### Security Limits
- Input cap: 100,000 chars (~25k tokens).
- Use `parseSecureJSON` to strip Markdown code fences from AI responses.

---

## 🔧 LOCAL EMULATOR SETUP

```bash
firebase emulators:start
```

| Service | URL |
|---|---|
| Functions | `http://127.0.0.1:5001` |
| Hosting | `http://127.0.0.1:5000` |
| Frontend | `http://localhost:3000` |

**Note:** Firestore points to **PRODUCTION** (no emulator for Firestore). Functions point to local emulator via `connectFunctionsEmulator` in `src/services/api.ts`.

Drive tokens reset on emulator restart — reconnect Drive once per session.