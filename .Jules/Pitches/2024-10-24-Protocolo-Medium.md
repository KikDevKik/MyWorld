# 👁️ The Oracle Pitch: Protocolo Médium (The Medium Protocol)

**🎯 The Target:** `DirectorPanel.tsx` (New Mode: 'Séance') & `WorldEngineV2` (Selection).

**🔥 The Friction:**
El "Síndrome de la Voz Única" (Single Voice Syndrome) es la plaga de todo escritor.
A menudo, los personajes terminan sonando igual que el autor o igual entre sí.
Escribir dinámicas de grupo complejas (una cena tensa, un consejo de guerra, una conspiración) es mentalmente agotador porque debes simular N^2 relaciones en tu cabeza simultáneamente.
Además, a veces solo necesitas preguntarle a tu villano: *"¿Por qué demonios hiciste eso?"* y obtener una respuesta honesta desde SU perspectiva, no la tuya.
Actualmente, Titanium tiene chats 1:1 con "The Director", pero no permite que los personajes hablen entre ellos.

**✨ The Vision:**
Imagina una **"Sala de Espiritismo Digital"**.
Seleccionas 3-5 nodos de personaje en el `WorldEngine` (ej. "El Rey", "El Asesino", "La Princesa") y haces clic en "Invocar".
Se abre una interfaz de chat especial con una estética mística/oscura.
Tú no eres el autor. Tú eres un "Médium" o un observador invisible.
Lanzas un tema al centro de la mesa: *"El barco se hunde y solo hay un bote salvavidas."*
Al instante, la IA (Gemini 1.5 Pro) genera un **Guion Teatral en Tiempo Real** donde los personajes interactúan entre sí, debaten, gritan o conspiran.
Cada línea de diálogo respeta estrictamente sus perfiles psicológicos (`bio`, `traits`, `voice`) definidos en el grafo.
Puedes intervenir ("poseer" a uno para decir algo específico) o simplemente dejar que el caos se desarrolle para encontrar la "verdad" de la escena.

**🛠️ The Architecture:**
1.  **Selection Bridge:** Un hook `useMediumSession(selectedNodeIds)` en `WorldEngineV2` que recupera los perfiles completos del Vector Store.
2.  **System Prompt Injection (The Séance Master):**
    *   Construir un "Mega-Prompt" que inyecte las definiciones de cada personaje como actores.
    *   `[PERSONA A]: Nombre: X, Rasgos: Y, Voz: Z.`
    *   `[SCENARIO]: "Debate about the bomb."`
    *   Instrucción: "Genera un diálogo multi-turno. Mantén las voces distintas. No rompas el personaje."
3.  **UI Layer:**
    *   `DirectorPanel` en modo "Séance".
    *   Visualización de avatares parlantes (brillan cuando "hablan").
4.  **Crystallization:** Un botón para "Cristalizar" la sesión como un borrador `.md` en la carpeta de la novela para usarlo como base del capítulo real.

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** Todo ocurre en la sesión efímera. Si no se guarda, se desvanece como el humo. El usuario tiene control total sobre qué se envía a la nube.
*   **The Cathedral (Magia):** Es la herramienta definitiva para desbloquear escenas y descubrir la "voz" real de los personajes. Transforma la escritura solitaria en una dirección de orquesta.
