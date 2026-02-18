# 👁️ The Oracle Pitch: Resonancia Atmosférica

**🎯 The Target:** `HybridEditor.tsx` & `guardian.ts` (Resonance Check)

**🔥 The Friction:**
El acto de escribir en Titanium es intelectualmente estimulante gracias a The Director y The Tribunal, pero **visceralmente estéril**.
Actualmente, escribimos escenas de terror gótico, romances bajo la lluvia o persecuciones cyberpunk sobre el mismo lienzo estático: un rectángulo gris oscuro o blanco.
El editor es sordo y ciego a la *emoción* del texto. La "Magia" ocurre en la mente del usuario, pero la interfaz no la amplifica; la ignora. "Ghost Mode" aísla, pero no *sumerge*.

**✨ The Vision:**
Imagina un **"Lienzo Vivo" (Living Canvas)**.
Mientras escribes, Gemini (versión Flash, ligera y rápida) analiza pasivamente el último párrafo en busca de: `Atmósfera`, `Iluminación`, `Clima` y `Tensión`.

Si escribes: *"La lluvia repiqueteaba contra el neón parpadeante del callejón..."*
*   **Visual:** Los bordes del editor emiten un brillo pulsante (glow) en tonos cian y magenta, con una opacidad muy baja (5%).
*   **Audio:** Un paisaje sonoro sutil (Soundscape) de "Lluvia Urbana" comienza a sonar en *fade-in*.

Si la escena cambia a una cripta oscura:
*   **Visual:** El fondo se oscurece casi al negro total, y el texto adquiere un ligero resplandor (bloom) como si fuera luz de vela.
*   **Audio:** Un zumbido grave (drone) de baja frecuencia.

No es un distractor; es una **Resonancia**. El editor *siente* lo que escribes y te devuelve esa energía, induciendo un estado de flujo (Flow State) inquebrantable. Es el "Telar Onírico" donde el entorno digital sueña junto al autor.

**🛠️ The Architecture:**
1.  **AtmosphereContext:** Un nuevo Contexto en React que envuelve al `HybridEditor`.
2.  **Sentinel Observer:** Una función ligera en `guardian.ts` (o un nuevo agente "The Bard") que se ejecuta cada 30-60 segundos de escritura activa (debounce).
3.  **Gemini Flash Analysis:** Prompt optimizado para devolver JSON: `{ "mood": "mystery", "lighting": "dim_blue", "weather": "rain", "intensity": 0.4 }`.
4.  **Frontend Render:**
    *   **CSS Variables:** Inyectar `--atmosphere-primary` y `--atmosphere-secondary` en el `titaniumTheme` de CodeMirror.
    *   **Framer Motion:** Transiciones suaves (duración: 5s) entre estados para evitar cambios bruscos.
    *   **Audio Engine:** Un pool de 5-10 loops de audio (Ruido Blanco, Lluvia, Fuego, Viento, Sci-Fi Hum) mezclados dinámicamente con Web Audio API.

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** El análisis se puede realizar localmente si usamos Gemini Nano (futuro) o mediante la API segura existente. El audio y los efectos son locales. No se guardan datos de "emoción" permanentemente, es efímero.
*   **The Cathedral (Excelencia):** Eleva la experiencia de escritura de "procesador de texto" a "simulador de realidad", diferenciando a Titanium de cualquier otro editor en el mercado.
