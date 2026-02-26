# 👁️ The Oracle Pitch: La Hélice Narrativa (The Narrative Helix)

**🎯 The Target:**
`TimelinePanel.tsx` (Evolución) y `Guardian` (Visualización de Estructura).

**🔥 The Friction:**
Las líneas de tiempo actuales son "forenses". Listas verticales aburridas de eventos (`TimelineEventItem`).
Nos dicen *qué* pasó (cronología), pero son ciegas al *cómo* se siente (ritmo, tensión, arco emocional).
El escritor navega a ciegas estructuralmente. ¿Es este capítulo demasiado lento? ¿El clímax llega demasiado pronto? ¿El tono emocional contradice la lógica de la trama?
Titanium tiene un cerebro brillante (`Guardian`), pero actualmente solo nos habla con texto. Necesitamos ver el alma de la historia, no solo leerla.

**✨ The Vision:**
**"El ADN de tu Historia."**
Transformar la línea de tiempo plana en una **Doble Hélice Viva (3D/2D Dinámico)** que fluye horizontalmente a través de la interfaz.

1.  **La Hebra Lógica (Azul - Plot):** Representa los Hechos Duros y la Causalidad. Se alimenta de la "Extracción de Hechos" y "Leyes del Mundo" del Guardian. Si la trama es sólida, la hebra es gruesa y estable. Si hay huecos argumentales, se adelgaza o se rompe.
2.  **La Hebra Emocional (Rojo/Oro - Soul):** Representa el Arco de Personaje y el Tono. Se alimenta del "Análisis de Comportamiento" y "Sentimiento". Ondula con la intensidad dramática.
3.  **Nodos de Resonancia:** Donde ambas hebras se cruzan y brillan. Estos son los "Puntos de Giro" (Inciting Incident, Midpoint, Climax) detectados por la IA.
4.  **Respiración Viva:** La hélice se contrae (ritmo rápido, frases cortas, acción) y se expande (ritmo lento, descripciones largas). Es un bio-ritmo visual.

El escritor no solo "ve" la historia; **siente su pulso**. Si la hélice se aplana (línea muerta), sabe que necesita inyectar conflicto.

**🛠️ The Architecture:**
1.  **Visualización:** `React Three Fiber` (R3F) para una representación 3D gloriosa, o una simulación física avanzada con `D3.js` (como NexusCanvas) pero restringida a un eje horizontal sinusoidal.
2.  **IA (Guardian):**
    -   Utilizar la salida existente de `auditContent` (`structure_analysis`, `character_behaviors`).
    -   Nuevo endpoint ligero `analyzePacing(text)` para calcular la frecuencia de la hélice (WPM + Longitud de Frase).
3.  **Interacción:**
    -   Click en un Nodo de Resonancia -> Abre el "Insight del Director" ("Aquí detecto el Clímax, pero la emoción parece baja. ¿Quizás aumentar el riesgo?").
    -   Drag & Drop para reordenar eventos y ver cómo cambia la forma de la hélice en tiempo real.

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** El análisis estructural es metadato derivado y abstracto. No expone el contenido textual crudo a terceros, solo la "forma" de la historia. Se renderiza localmente.
*   **The Cathedral (Magia):** Eleva la escritura de un acto mecánico a "Ingeniería Genética Narrativa". Convierte a Titanium en el primer editor que te permite *esculpir* la estructura biológica de tu novela.
