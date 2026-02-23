# 👁️ The Oracle Pitch: El Prisma de Voces (The Voice Prism)

**🎯 The Target:** `BubbleMenu.tsx` (en `HybridEditor`) y `scribe.ts` (Backend).

**🔥 The Friction:**
El "Síndrome de la Voz Única" (Single Voice Syndrome).
Incluso los mejores escritores caen en la trampa de que todos sus personajes suenen sospechosamente parecidos al narrador (o al propio autor).
Cuando escribes una escena desde la perspectiva de un Enano Borracho y luego pasas a una Elfa Erudita, el *cambio de tono* mental es agotador.
El texto a menudo sale "plano" o "neutro", requiriendo múltiples pasadas de edición para inyectar "sabor" (slang, ritmo, vocabulario específico).
Actualmente, el `BubbleMenu` tiene herramientas de formato (Negrita, H1) pero ninguna herramienta *creativa* de transformación.

**✨ The Vision:**
Imagina un **"Lente de Realidad"**.
Seleccionas un párrafo de diálogo o narración en el editor.
En el menú flotante (`BubbleMenu`), aparece un nuevo icono: un **Prisma 💎**.
Al hacer clic, se despliega una lista de tus "Anclas" (Personajes Principales detectados por `Soul Sorter`).
Eliges: **"Garrick (El Enano)"**.
Al instante, el texto seleccionado se *refracta*. La IA reescribe el párrafo *estrictamente* desde la perspectiva y voz de Garrick, usando su biografía y rasgos definidos.
*   *Original:* "The room was dark and smelled like old wood."
*   *Garrick Lens:* "The hole was dimmer than a goblin's arse and stank of rot-wood and spilled ale."
*   *Elara Lens:* "The chamber lay in shadows, carrying the ancient scent of decaying oak."

Es como tener un actor de método para cada personaje, listo para improvisar sobre tu guion base.

**🛠️ The Architecture:**
1.  **Frontend (BubbleMenu):**
    *   Añadir un botón `PrismButton` al `BubbleMenu.tsx`.
    *   Al hacer clic, mostrar un `Popover` o `CommandPalette` ligero que lista las entidades con `tier: 'ANCHOR'` y `category: 'PERSON'`.
2.  **Backend (Scribe):**
    *   Crear una nueva función `reimagineText` en `functions/src/scribe.ts`.
    *   Recibe: `selectionText`, `characterId` (Anchor ID).
    *   Lógica: Recupera el `TitaniumEntity` completo (Rasgos, Bio, Ejemplo de Voz).
    *   Prompt: `ACT AS [Name]. TRAITS: [Traits]. VOICE SAMPLE: [Sample]. REWRITE the following text preserving the meaning but enforcing your voice/POV.`
3.  **UX Magic:**
    *   Mostrar la diferencia en un modo "Diff" efímero o reemplazar con una animación suave (framer-motion).

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** La transformación es puntual y efímera hasta que el usuario la acepta. No se envían datos masivos, solo el fragmento seleccionado.
*   **The Cathedral (Magia):** Rompe el bloqueo del escritor instantáneamente. Permite explorar "Cómo diría esto X?" sin esfuerzo, elevando la calidad literaria del borrador.
