# 👁️ The Oracle Pitch: La Pluma Fantasma (The Ghost Quill)

**🎯 The Target:** `HybridEditor.tsx` (CodeMirror Extension) & `Gemini 1.5 Flash` (Low Latency Inference).

**🔥 The Friction:**
El "Cursor Parpadeante" es el enemigo más antiguo del escritor.
Incluso cuando sabemos *qué* va a pasar ("El héroe entra en la taberna"), a menudo nos atascamos en la *micro-ejecución*: "¿Cómo describe la puerta?", "¿Cuál era el nombre de la espada sagrada?", "¿Qué aroma flota en el aire?".
Las herramientas actuales de IA (ChatGPT) generan bloques de texto masivos que rompen el "Flow". Copiar y pegar desde un chat lateral mata la inmersión.
Necesitamos una IA que no escriba *por* nosotros, sino *con* nosotros. Una extensión de nuestros dedos, no un reemplazo de nuestro cerebro.

**✨ The Vision:**
**"El Susurro del Fantasma."**
Estás escribiendo en el `HybridEditor`.
Tecleas: *"Kaelen desenvainó su..."*
Inmediatamente, en un texto gris espectral (Ghost Text) que flota delante de tu cursor, aparece: *"...espada de acero negro, sintiendo el frío familiar de la empuñadura."*
*   **Tab** para aceptar.
*   **Esc** para ignorar.
*   **Ctrl+Arrow** para ciclar entre variaciones ("Lógica", "Emocional", "Caos").

Lo mágico no es que prediga texto (cualquier LLM hace eso).
Lo mágico es que **Conoce tu Mundo**.
Si en tu `WorldEngine` la espada de Kaelen se llama "Susurro Nocturno", la Pluma Fantasma sugerirá: *"...a Susurro Nocturno, la hoja vibrando con sed de sangre."*
Es un **Autocomplete Lore-Aware**. No alucina nombres genéricos; recupera tus verdades sagradas y las teje en la prosa en tiempo real.

**🛠️ The Architecture:**
1.  **Frontend (The Quill):**
    *   Una extensión personalizada de **CodeMirror 6** (`GhostTextPlugin`).
    *   Utiliza `StateField` y `Decoration.widget` para renderizar el texto fantasma inline sin insertarlo en el documento real.
    *   Debounce inteligente: Solo sugiere cuando el usuario hace una pausa de >500ms ("Thinking Pause").
2.  **Backend (The Ink):**
    *   Endpoint: `ghostQuill(context, cursor_position)`.
    *   Modelo: **Gemini 1.5 Flash** (Optimizado para <300ms de latencia).
    *   **Context Injection:** El sistema inyecta silenciosamente los últimos 1000 tokens + un "Resumen de Entidades Cercanas" (detectadas en el texto previo) para garantizar la coherencia del Lore.
3.  **Style Match:**
    *   El prompt del sistema incluye: "Imita el tono y estilo del usuario (e.g., Barroco, Minimalista, Noir)".

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** La inferencia es efímera. El contexto enviado se usa para la predicción y se descarta. No se entrena el modelo con tu novela.
*   **The Cathedral (Magia):** Elimina la fricción de la "palabra olvidada". Hace que el escritor se sienta como un pianista virtuoso, donde la música fluye casi antes de tocar las teclas. Es la fusión definitiva entre Humano y Máquina.
