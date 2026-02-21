# 👁️ The Oracle Pitch: El Telar del Tiempo (The Time Loom)

**🎯 The Target:** `TimelinePanel.tsx` & `functions/src/oracle.ts` (Nuevo Módulo)

**🔥 The Friction:**
El `TimelinePanel.tsx` actual es un *Registro Forense* (Autopsia Narrativa). Es una lista vertical estática que documenta lo que *ya ocurrió*.
Para un escritor de sagas complejas, el tiempo no es una línea recta hacia atrás; es un **Árbol de Probabilidades** hacia adelante.
Actualmente, si quiero planear el Clímax en el año 3050, tengo que crear un evento "falso" en una lista aburrida.
No hay **Causalidad Visual**. Si cambio un evento en el año 3020, el sistema no me avisa que el evento del 3050 ahora es imposible (Paradoja).
La herramienta es pasiva. No sueña conmigo.

**✨ The Vision:**
Transformamos el Cronograma en una **Interfaz Temporal Cuántica (Horizontal & Non-Linear)**.

1.  **Modo Profecía (The Oracle's Gaze):**
    Al final de la línea de tiempo escrita, el espacio se disuelve en niebla. Un botón pulsante "Consultar al Oráculo" invoca a Gemini 1.5 Pro.
    Analizando los vectores de trama actuales, el Oráculo proyecta **3 Futuros Probables** (Ghost Timelines) como ramas semitransparentes.
    *   *Rama A (Tragedia):* "La caída de Titanium (Año 3060)."
    *   *Rama B (Redención):* "El Pacto de los Justos (Año 3055)."
    *   *Rama C (Caos):* "La Singularidad (Año 3052)."
    Al pasar el mouse sobre estos "Nodos de Niebla", se revela un *Concept Art* (generado por Imagen/Gemini) y una sinopsis breve. Al hacer clic, se "Cristaliza" en el plan.

2.  **Efecto Mariposa Visual (Causality Ripples):**
    Si editas un evento crucial en el Pasado (ej. "La Muerte del Rey"), una onda de choque visual (shader distorsionado) recorre la línea hacia la derecha.
    Los eventos futuros que dependen de ese hecho (ej. "Coronación del Príncipe") se tiñen de rojo y vibran (Drift Alert), indicando una **Paradoja Temporal**.

3.  **Atmósfera Cronológica:**
    El fondo del timeline cambia sutilmente según la Era. "La Era Dorada" tiene un brillo cálido; "La Era Oscura" tiene cenizas cayendo (partículas). La música de fondo (si está activada) modula acorde.

**🛠️ The Architecture:**
1.  **Frontend (The Loom):**
    *   Reemplazar la lista vertical con una visualización horizontal basada en `d3.js` o `vis-timeline` envuelta en React.
    *   **Framer Motion** para las transiciones de "Cristalización" (de Niebla a Sólido).
    *   **Shaders (GLSL):** Para el efecto de "Onda de Choque" temporal.

2.  **Backend (The Oracle):**
    *   Nuevo Cloud Function `oracle.ts`: `prophesizeTimeline`.
    *   Input: Resumen de eventos actuales + "Ghost Data" (intenciones del autor).
    *   Model: **Gemini 1.5 Pro** (ventana de contexto masiva para entender toda la historia).
    *   Output: JSON estructurado con `probability_score`, `synopsis`, `visual_prompt` (para imagen).

3.  **State (The Quantum Store):**
    *   Un store local (Zustand) para "Speculative Events" que no se guardan en Firestore hasta ser confirmados (Bunker Safe).

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** Las "Profecías" son efímeras y locales hasta que el usuario las acepta. El análisis de causalidad usa la API segura existente. No se entrenan modelos con los datos del usuario.
*   **The Cathedral (Excelencia):** Eleva la herramienta de "procesador de texto" a "Simulador de Destino". Convierte la planificación (aburrida) en un juego de dioses (emocionante).
