# 👁️ The Oracle Pitch: The Synaptic Loom

**🎯 The Target:** `HybridEditor.tsx` (The Skin) & `WorldEngineV2` (The Brain).

**🔥 The Friction:**
Currently, Titanium suffers from "The Amnesiac Typewriter" syndrome.
The Writer pours their soul into the `HybridEditor`, but the editor has no idea what they are writing about.
Meanwhile, the `WorldEngineV2` holds a rich graph of characters, locations, and lore, but it sits idle in a separate tab.
To check a fact ("What color are Seraphina's eyes?"), the Writer must break their flow, switch tabs, search, and switch back.
The text is dead. The world is distant.

**✨ The Vision:**
Imagine a "Living Text".
As you type "The Iron Gate", the words shimmer with a faint, bioluminescent underglow. The Editor *recognizes* the location from your World Engine.
You hover over "Seraphina", and a "Nexus Card" floats into view—a mini-profile showing her image, current status, and key relationships.
If you write "Seraphina drew her sword", but the Graph knows she lost it in Chapter 3, the text pulses with a soft "Continuity Rift" warning.
The Editor becomes a bi-directional nervous system. You aren't just writing text; you are weaving the graph.

**🛠️ The Architecture:**
We will bridge the gap using **CodeMirror 6 Extensions** and **React Context**:

1.  **The Synapse (State)**: Lift the `entities` collection listener from `WorldEnginePageV2` to a global `WorldContext`. This makes the Graph data accessible to the entire app without re-fetching.
2.  **The Retina (ViewPlugin)**: Create a custom CodeMirror `ViewPlugin`. It receives the list of Entity Names from the Context.
3.  **The Loom (Decorations)**:
    *   The plugin scans the *visible viewport* (for performance) using a dynamically compiled Regex of all entity names.
    *   It applies `Decoration.mark({ class: "cm-synaptic-entity" })` to matches.
    *   CSS adds the subtle glow/underline.
4.  **The Oracle's Eye (Tooltip)**: Use CodeMirror's `hoverTooltip` extension. When hovering a decorated entity, it renders a React Portal containing the "Nexus Card" (a simplified `NodeDetailsSidebar`).

**⚖️ Cathedral & Bunker Check:**
*   **The Cathedral (Creativity):** It turns the writing process into a magical act of connection, keeping the lore alive and present.
*   **The Bunker (Privacy):** The entity scanning happens entirely **client-side** (in-browser Regex). No keystrokes are sent to the cloud for this feature. It respects the "Local First" architecture of the editor.
