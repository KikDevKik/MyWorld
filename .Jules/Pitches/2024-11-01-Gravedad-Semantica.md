# 👁️ The Oracle Pitch: Gravedad Semántica (Semantic Gravity)

**🎯 The Target:** `GraphSimulationV2.tsx` (Frontend Physics) & `guardian.ts` (Vector Engine)

**🔥 The Friction:**
Actualmente, el "Knowledge Graph" de Titanium es un **cementerio estático**.
Es un "plato de espagueti" donde los nodos (personajes, lugares, ideas) se quedan exactamente donde los dejaste manualmente.
Para que el grafo sea útil, el escritor debe interrumpir su *Flow* creativo y jugar al "jardinero digital": arrastrar bolitas, crear enlaces y organizar carpetas.
La estructura de una historia es fluida y orgánica, pero nuestras herramientas de visualización son rígidas y muertas. El grafo no sabe de qué trata tu historia; solo sabe coordenadas X/Y arbitrarias.

**✨ The Vision:**
Imagina un **"Universo Narrativo Autocontenido"**.
En lugar de posiciones fijas, introducimos la física de la **Gravedad Semántica**.

1.  **El Cursor es el Sol:** Mientras escribes el Capítulo 5 (sobre "La Traición del Rey"), el grafo *siente* el contexto. Los nodos relacionados semánticamente ("El Rey", "Daga", "Veneno", "Castillo") son atraídos magnéticamente hacia el centro de la visualización, brillando con intensidad.
2.  **Órbitas Contextuales:** Los elementos irrelevantes para la escena actual (p.ej., la trama secundaria del "Pueblo de los Pescadores") pierden "calor" y se desplazan suavemente hacia la periferia, oscureciéndose.
3.  **Cúmulos Temáticos (Clustering):** Al hacer Zoom Out, los nodos no están dispersos al azar. Se auto-organizan en galaxias temáticas: "El Cúmulo de la Magia", "La Nebulosa de la Política", "El Sistema Solar del Romance".
4.  **Respiración:** El grafo *respira*. Se expande y contrae con el ritmo de tu escritura. Es un organismo vivo que te muestra las conexiones ocultas que tu cerebro consciente ha olvidado, pero que la IA (The Director) recuerda perfectamente.

**🛠️ The Architecture:**
*   **Vector Engine (`guardian.ts`):** Exponer un endpoint ligero (`getVectorMap`) que devuelve las coordenadas vectoriales reducidas (usando PCA o t-SNE server-side, o enviando los raw embeddings si son <1000 nodos) de todos los chunks.
*   **Physics Engine (`d3-force`):**
    *   Sustituir la simulación de fuerzas estándar por una **Fuerza Semántica**.
    *   `forceLink`: La "fuerza del muelle" entre dos nodos no es binaria (existe/no existe), sino analógica (0.0 a 1.0) basada en la `cosineSimilarity` de sus vectores.
    *   `forceCenter`: Dinámico, basado en el vector del párrafo activo en el editor (`HybridEditor.tsx`).
*   **Rendering:** Migrar de SVG puro a `Canvas` o `WebGL` (via `react-force-graph` o `PixiJS`) si la escala supera los 500 nodos, para permitir efectos de partículas ("Polvo de Estrellas") y *glow* performante.

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** Toda la matemática vectorial ocurre en el servidor seguro (o localmente con modelos pequeños). Lo que se visualiza son abstracciones matemáticas, no datos sensibles expuestos a terceros. Es "Zero-Knowledge Visualization".
*   **The Cathedral (Magia):** Transforma la tarea administrativa de "organizar notas" en una experiencia de "navegación estelar". El usuario se siente como un Dios observando su universo reordenarse ante su voluntad. Es la definición de *Delight*.
