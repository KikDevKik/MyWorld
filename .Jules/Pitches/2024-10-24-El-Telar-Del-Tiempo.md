# 👁️ The Oracle Pitch: El Telar del Tiempo (The Time Loom)

**🎯 The Target:** `TimelinePanel.tsx` (y su lógica forense lineal actual).

**🔥 The Friction:**
Actualmente, el `TimelinePanel` es un **cadáver exquisito**. Un registro forense estático que mira hacia atrás. Es aburrido. Es una hoja de cálculo glorificada en React.
El escritor no necesita saber *sólo* qué pasó. Necesita explorar **qué podría pasar**.
La fricción es que el sistema actual asume una sola realidad canónica, ignorando la naturaleza cuántica de la creatividad: el "What If?". El usuario está atrapado en una línea recta, cuando su mente funciona en un árbol de probabilidades ramificado.

**✨ The Vision:**
Imagina transformar esa lista vertical aburrida en un **Telar Horizontal Vivo**.
Visualiza un río de tiempo que fluye de izquierda a derecha (o vertical, pero ramificado).
El usuario puede hacer clic en cualquier evento y arrastrar un nodo hacia un lado para crear una **Divergencia (Nexus Point)**.
Al soltarlo, la IA (Gemini 1.5 Pro) no solo crea un nuevo evento alternativo, sino que **extrapola las consecuencias** de esa decisión en tiempo real, generando una rama fantasma ("Ghost Branch") de 3 o 4 eventos futuros basados en esa nueva realidad.

Es un **Explorador de Multiverso**.
*"¿Qué pasa si el villano no muere aquí?"* -> *Flash* -> El sistema genera una línea temporal donde el villano conquista el reino 50 años después.
El usuario puede "Podar" ramas muertas o "Colapsar" una rama alternativa para convertirla en la nueva Realidad Sagrada (Canon).

**🛠️ The Architecture:**
1.  **Visualización:** Reutilizar `react-xarrows` (ya implementado en `NexusCanvas`) para dibujar las conexiones dinámicas entre eventos y sus ramas divergentes. Usar `framer-motion` para animar el "nacimiento" de nuevas líneas temporales con un efecto de resplandor.
2.  **Interacción:** Implementar una interfaz de "Drag & Split" (arrastrar y dividir). Al arrastrar un evento, se crea visualmente una bifurcación.
3.  **IA (El Oráculo):** Un nuevo modo en el `Guardian` llamado "Probabilistic Forecasting" (Pronóstico Probabilístico). Se le alimenta el contexto narrativo hasta el punto de divergencia y se le pide simular consecuencias en cadena (Chain of Consequences).
4.  **Datos:** Migrar de una lista simple a una estructura de **Grafo Acíclico Dirigido (DAG)** en Firebase (`TDB_Timeline`), donde cada evento tiene `parent_id` y `children_ids`, permitiendo múltiples futuros simultáneos.

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** Las ramas alternativas ("Timeline Variants") se almacenan como metadatos locales o documentos "Ghost" en Firebase, vinculados solo al usuario. El usuario decide explícitamente qué rama se "Cristaliza" en el Canon oficial.
*   **The Cathedral (Magia):** Eleva a la IA de "secretaria que toma notas" a "Dios del Tiempo" que puede ver y mostrar todos los futuros posibles. Maximiza la capacidad multimodal y lógica de Gemini para mantener la coherencia causal.
