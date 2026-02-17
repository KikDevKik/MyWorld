# 👁️ The Oracle Pitch: Narrative Resonance (The Living Editor)

**🎯 The Target:**
`src/editor/HybridEditor.tsx`, `functions/src/guardian.ts` (The Director Persona), and `src/styles/narrator.css`.

**🔥 The Friction:**
Writing is currently a solitary, static experience. The screen is a blank void that demands input but offers no emotional feedback. The AI (The Director) is intelligent but "hidden" in a sidebar, acting as a critic rather than a co-pilot.
We are building a "Cathedral," yet the walls are bare. The interface feels like a tool (Microsoft Word), not a *place* where the story lives and breathes. When a user writes a terrifying scene, the editor looks exactly the same as when they write a romantic confession. This disconnect breaks immersion.

**✨ The Vision:**
**"Atmospheric Bio-Feedback."**
Imagine an editor that *feels* what you are writing.
As the user types, the **Narrative Resonance Engine** analyzes the sentiment, pacing, and intensity of the current scene in real-time.

1.  **The Pulse (Visual Ambience):**
    -   If the scene is **High Tension (Horror/Action)**: The ambient lighting (border glow, background gradient) shifts to cool, sharp hues (Deep Indigo/Crimson). The font weight subtly increases (variable fonts). Background particles move erratically.
    -   If the scene is **Low Tension (Reflection/Romance)**: The ambience warms (Amber/Soft Gold). The font softens. The background particles float like dust motes in sunlight.
    -   If the user is **Flowing (High WPM)**: The interface "brightens" and focuses, dimming the sidebar distractions. The cursor leaves a faint trail of light.
    -   If the user is **Stuck (Low WPM)**: The environment gets "dusty" or "foggy," visually prompting action without a single popup.

2.  **The Director's Presence:**
    -   Instead of chat messages, The Director communicates through *environment*. A sudden "Chill" (blue tint) might signal a plot hole or a tonal shift detected by the AI.

It’s not just a text editor. It’s a **Mood Ring for the Story's Soul.**

**🛠️ The Architecture:**

1.  **Frontend (React + Framer Motion):**
    -   **`NarrativeAtmosphereContext`:** A provider wrapping `HybridEditor`.
    -   **`useAtmosphere` Hook:** Debounces user input (every ~5-10s or on paragraph break).
    -   **`AtmosphericCanvas`:** A background component using `framer-motion` (or `react-three-fiber` for high-end) to render the particle field/gradient mesh.
    -   **Variable Fonts:** Use `font-variation-settings: 'wght' ...` to micro-adjust typography based on "Intensity" score.

2.  **Backend (Firebase + Gemini Flash):**
    -   **New Endpoint:** `analyzeAtmosphere(text: string)` (Lightweight).
    -   **AI Model:** Gemini 1.5 Flash (Optimized for speed/cost).
    -   **Output:** JSON `{ valence: -1.0 to 1.0, arousal: 0.0 to 1.0, dominant_color: "#Hex", particle_behavior: "chaos" | "flow" | "static" }`.

3.  **Local "Ghost Mode" Fallback:**
    -   If offline or low-latency required, use a local sentiment dictionary (AFINN-165 approach) to approximate the mood instantly before the AI refines it.

**⚖️ Cathedral & Bunker Check:**
-   **The Bunker (Privacy):** The "Atmosphere" analysis is **ephemeral**. The text snippet sent to Gemini is for *sentiment extraction only* and is **never stored**. The returned "mood data" is transient UI state, not persisted to Firestore.
-   **The Cathedral (Experience):** This elevates the AI from a "tool" to a "spirit" in the machine. It makes the writing process feel magical and responsive, fulfilling the "Titanium" promise of a futuristic writing ecosystem.
