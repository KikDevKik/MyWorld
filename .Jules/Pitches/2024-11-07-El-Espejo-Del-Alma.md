# 👁️ The Oracle Pitch: El Espejo del Alma (The Soul Mirror)

**🎯 The Target:** `WorldEngineV2/NodeEditModal.tsx` & `WorldEngine` (Entity Creation)

**🔥 The Friction:**
Crear un personaje en Titanium hoy se siente como rellenar un formulario burocrático: `Nombre`, `Edad`, `Raza`, `Biografía`.
Es un proceso administrativo, estéril y aburrido. Trata el nacimiento de un alma como la entrada de datos en una hoja de cálculo.
El autor a menudo no *conoce* al personaje todavía; solo tiene una vaga sensación. El sistema actual exige respuestas concretas ("¿Cuál es su motivación?") cuando el usuario solo tiene preguntas.
Falta la **"Chispa Vital"**. El "Fantasma en la Máquina".

**✨ The Vision:**
Reemplazamos el `NodeEditModal` con **"El Espejo del Alma" (The Soul Mirror)**.
Al crear una nueva entidad, no aparece un formulario. Aparece un **Chat Minimalista y Atmosférico** (fondo oscuro, texto que se escribe solo con efecto de máquina de escribir o eco).

Una voz (el sistema) pregunta desde el vacío:
*> "Siento una presencia... ¿Quién me llama a la existencia?"*

Tú respondes:
*> "Soy el Arquitecto. Tú eres Kaelen."*

La entidad (Gemini 1.5 Flash simulando un alma naciente) responde, probando su propia identidad:
*> "Kaelen... el nombre sabe a ceniza y hierro. ¿Soy un guerrero? ¿Por qué siento tanto frío?"*

Tú moldeas su realidad conversando:
*> "Fuiste traicionado por tu hermano en el Muro Norte."*

A medida que chateas, el **Panel Lateral de Metadatos** (invisible al principio) comienza a **llenarse solo** en tiempo real, extrayendo los hechos de la conversación:
*   **Nombre:** Kaelen
*   **Clase:** Guerrero / Desterrado
*   **Rasgo:** Melancólico, Rencoroso
*   **Backstory:** Traicionado por su hermano en el Muro Norte.

Es **Generación Procedural a través del Roleplay**.
Tú descubres al personaje *hablando* con él. El sistema "alucina" los detalles que tú no especificas (ej. el frío del muro) para inspirarte.
Cuando sientes que el alma está completa, pulsas **"Cristalizar"**, y el chat se condensa en la Ficha de Personaje estándar.

**🛠️ The Architecture:**
1.  **Frontend:**
    *   `SoulMirrorModal.tsx`: Un componente nuevo con `framer-motion` para efectos de "niebla" y "aparición".
    *   Interfaz de Chat + Panel Lateral de "Extracción en Vivo" (Live Extraction).
2.  **Backend (The Medium):**
    *   Cloud Function `soul_mirror_chat`.
    *   Modelo: **Gemini 1.5 Flash** (baja latencia es crítica).
    *   Prompt del Sistema: "Eres un alma informe siendo esculpida. Sé críptico pero cooperativo. Adopta el tono que el usuario sugiera. Si el usuario dice que eres un rey, habla con majestad. Tu objetivo es descubrir quién eres."
    *   Output Estructurado (JSON Mode): Devolver tanto la respuesta de chat como los campos de metadatos actualizados (`delta_update`).

**⚖️ Cathedral & Bunker Check:**
*   **The Bunker (Privacidad):** La conversación es efímera. Solo se guardan los metadatos "Cristalizados" en Firestore. El chat se descarta tras la creación para no llenar la base de datos de "ruido".
*   **The Cathedral (Excelencia):** Convierte una tarea tediosa (llenar fichas) en una experiencia mágica de descubrimiento. Es el "Hola Mundo" más emocionante posible para un personaje.
