# 👁️ The Oracle Pitch: El Lienzo Onírico (The Dream Canvas)

**🎯 The Target:** `HybridEditor.tsx` (BubbleMenu Action) & `WorldEngineV2` (Visual Assets).

**🔥 The Friction:**
El escritor promedio sufre de "Afantasía Funcional".
Podemos describir una escena con palabras ("El dragón biomecánico rugió"), pero nuestra mente a menudo falla al visualizar los detalles granulares: ¿Cómo se refleja la luz en sus escamas de cromo? ¿Qué patrón tienen sus alas?
Actualmente, el `WorldEngine` tiene huecos para imágenes de personajes y lugares, pero estos suelen quedar vacíos o rellenos con arte robado de Pinterest que no encaja con el tono.
La escritura descriptiva es difícil cuando no puedes *ver* lo que describes. El editor es ciego.

**✨ The Vision:**
Imagina un **"Concept Artist"** invisible sentado a tu lado.
Estás escribiendo: *"La ciudad flotante de Aethelgard brillaba bajo la luz de las tres lunas..."*
Seleccionas el texto. En el `BubbleMenu`, junto a "Negrita" y "Cursiva", aparece un icono de **Ojo Místico 👁️**.
Al hacer clic, se despliega el panel **"Sueños" (Dreams)**.
En 5 segundos, Gemini Pro Vision (o Imagen 3) genera 3 variaciones de alta fidelidad de esa descripción, estilizadas automáticamente según el "ADN Visual" de tu proyecto (Cyberpunk, Alta Fantasía, Noir).
*   No te gusta? Refinas el prompt visualmente.
*   Te encanta? La arrastras al texto y se convierte en una "Ilustración Ancla" o la envías al perfil del Lugar en el `WorldEngine`.
Ahora puedes *describir* lo que *ves*. "Las lunas no eran blancas, eran de un violeta enfermizo". La imagen retroalimenta al texto. Es un bucle de creatividad infinito.

**🛠️ The Architecture:**
1.  **Frontend:**
    *   Añadir `DreamAction` al `BubbleMenu.tsx`.
    *   Crear `DreamPanel.tsx`: Un panel lateral (como el de Comentarios) que muestra los estados de carga y resultados (Grid de imágenes).
2.  **Backend (The Artist):**
    *   Endpoint: `dreamScape(prompt, style_dna)`.
    *   Uso de **Vertex AI (Imagen 3)** para generación de alta calidad.
    *   Optimización de costes: Cachear resultados basados en el hash del texto seleccionado.
3.  **Integration:**
    *   Drag-and-Drop: Permitir arrastrar la imagen generada directamente al nodo correspondiente del grafo (`WorldEngine`).
    *   Almacenamiento: Guardar en Firebase Storage solo si el usuario la "Cristaliza" (acepta).

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** Las imágenes se generan en la nube (necesario por GPU), pero el prompt es anónimo y las imágenes no aceptadas se purgan tras la sesión. El usuario mantiene los derechos de lo generado.
*   **The Cathedral (Magia):** Transforma Titanium de un "procesador de texto" a un "estudio de producción". Elimina el bloqueo del escritor visual y llena el mundo de color y textura. Es el fin de la página en blanco.
