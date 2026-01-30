# Jules Agents Test Report - Ghost Mode Investigation

## Scope
Comprehensive UI/UX and functional analysis of all "MyWorld" tools in Ghost Mode environment.

## Environment
- **Mode:** Ghost Mode (`VITE_JULES_MODE=true`)
- **User:** Mock/Dev User (Simulated)
- **Tools Analyzed:** Director de Escena, Tribunal Literario, Perforador de Mundos v2, Laboratorio de Ideas, La Imprenta, The Builder Nexus, La Forja de Almas, Taxonomy Configuration.

## Findings & Issues Log

### 1. Director de Escena (`DirectorPanel`, `DirectorTools`)
- **Accessibility:** `DirectorTools` buttons (Inspector, Tribunal, Context) lack explicit `aria-label` attributes, relying on `title` which is insufficient for screen readers.
- **UX:** The "Tribunal" button calls `handleTribunal(null)`, opening an empty panel without context. It should ideally pass the current conversation context if available.
- **Visuals:** Drift Score visualization is clear, but "Simulate Drift" (Ghost Mode feature) feedback is toast-only.

### 2. Tribunal Literario (`TribunalPanel`)
- **Accessibility:** The "Manual / File" mode toggle buttons use visual cues (background color) but lack `aria-pressed` state for assistive technology.
- **UX:** `summonTheTribunal` has a 9-minute timeout. While necessary for AI, there is no intermediate progress feedback beyond "Deliberando...".
- **Logic:** Requires `currentFileId` in file mode. If opened without a file selected, it correctly shows an error state, but could guide the user better.

### 3. Perforador de Mundos v2 (`WorldEnginePageV2`)
- **Accessibility:** The main "NEXUS" button is a complex interactive element. It needs a clear `aria-label` describing the action "Initiate Nexus Scan".
- **UX:** Zoom controls (+/-) are icon-only and lack labels.
- **Logic:** `handleNexusClick` correctly checks for `config.canonPaths`.
- **Builder Integration:** The "Builder" trigger via command bar is functional but hidden.

### 4. The Builder Nexus (`TheBuilder`)
- **Accessibility:** "Materialize" and "Mode" toggle buttons lack `aria-label`. The `PanelResizeHandle` is a semantic separator but should be labeled as a resizer.
- **UX:** The chat interface is robust. Error handling for stream interruptions is basic (`catch` block with toast).

### 5. La Forja de Almas (`ForgePanel`)
- **Accessibility:** Navigation buttons (Back, Close) and "Unlink" button lack `aria-label`.
- **UX:** The "Create Vault" vs "Select Existing" flow is clear visually but could use better focus management for keyboard users.

### 6. Laboratorio de Ideas (`LaboratoryPanel`)
- **Accessibility:** "Filter" input and "Tag" buttons lack `aria-label`. The "Close" button is icon-only.
- **Logic:** Auto-classification (`classifyUntagged`) runs automatically on load. This might consume quota unexpectedly. Consider making it opt-in.

### 7. La Imprenta (`ExportPanel`)
- **Accessibility:** "Close" button lacks `aria-label`. Format toggles (TXT, MD, PDF) are div-based or button-based? Need to ensure they are semantic buttons with state.
- **UX:** PDF compilation can be slow; the loading state is present but could be more descriptive.

### 8. Taxonomy Configuration (`ProjectSettingsModal`)
- **Accessibility:** The Tab selector ("Rutas" vs "Taxonomía") needs `role="tablist"` and `aria-selected` attributes.
- **UX:** "Auto-Detect" and "Create Standard" are powerful actions. They have confirmation dialogs (good), but accessibility labels are missing on the buttons themselves.

## Action Plan
Execute a comprehensive "Accessibility & UX Polish" pass across all identified components to resolve the listed issues.
