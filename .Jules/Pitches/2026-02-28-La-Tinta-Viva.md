# 👁️ The Oracle Pitch: La Tinta Viva (The Living Ink)

**🎯 The Target:** El área de redacción (`HybridEditor.tsx`) y su interacción con The Librarian y el Lore (`RAG`).

**🔥 The Friction:**
Actualmente, el texto que escribe el usuario está "muerto". Aunque Titanium es una bestia inteligente (Cathedral) gracias a RAG, el escritor debe salir de su flujo creativo para buscar un término, preguntar al Director por detalles de un personaje, o revisar notas. Escribir sigue siendo un acto solitario de tipeo estático. No hay "magia" en el acto físico de escribir las palabras de este universo, haciendo que la conexión entre el manuscrito y "El Búnker" (la base de datos) se sienta puramente transaccional.

**✨ The Vision:**
Imagina esto, Creador: el escritor está inmerso en su narrativa en el `HybridEditor`. A medida que teclea el nombre de un personaje o un lugar clave de la historia (e.g., "Aethelgard"), la palabra, literalmente, cobra vida en el texto.
Una sutil y etérea animación (un leve resplandor o un subrayado dinámico) envuelve el término reconocido en tiempo real. Al pasar el cursor sobre esta "Tinta Viva", no se abre un menú aburrido, sino un *Vórtice Informativo*: un micro-panel flotante y estilizado que revela un resumen instantáneo extraído del Lore (generado por The Librarian), una imagen conceptual (si existe), o el último estado emocional del personaje.
Y si el término es nuevo, pero The Guardian o The Librarian detectan (vía Gemini) que es crucial para la trama (un nuevo artefacto, un hechizo), el texto palpita sutilmente, susurrando: *"¿Quieres cristalizar esta idea?"*. La escritura se convierte en un diálogo constante entre la mente del Creador y la memoria del Búnker, sin romper nunca el estado de 'Flow'.

**🛠️ The Architecture:**
*   **React Hooks / CodeMirror Ecosystem:** Utilizar `Decoration` y `ViewPlugin` en CodeMirror (el motor detrás del editor) para aplicar estilos visuales a fragmentos de texto basados en coincidencias semánticas.
*   **Gemini Flash (The Librarian Edge):** Un worker en segundo plano (debounced) que envía trozos de texto recién escritos a `gemini-1.5-flash` pidiendo extraer entidades. Flash es suficientemente rápido para hacer esto casi en tiempo real.
*   **Framer Motion / Tailwind:** Para las animaciones de palpitar y el panel emergente (Tooltip flotante) con transiciones mágicas (`layoutId`, `animate={{ opacity: 1, scale: 1 }}`).
*   **Nexus Storage:** Consulta rápida a la caché del Nexus para saber si la entidad existe y extraer su sinopsis instantánea.

**⚖️ Cathedral & Bunker Check:**
La magia de La Tinta Viva honra el Búnker. Todo el procesamiento de entidades se realiza utilizando el contexto ya aprobado (RAG local o llamadas a Gemini usando el contexto del usuario actual). No expone datos y mantiene el flujo de escritura inmersivo e inquebrantable en el templo de La Catedral.
