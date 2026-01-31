# 🎭 ZONA B: EL ESCENARIO (ACTION)

*El espacio sagrado donde el caos se transmuta en orden. Donde la creatividad toma forma física.*

---

## 1. EL EDITOR HÍBRIDO (Hybrid Editor)

**La Promesa:**
Un lienzo que respira. Un editor de texto vivo que entiende la estructura de tu universo y te protege contra la incoherencia.

**Mecánica Sagrada (Cómo se usa):**
1.  **Escritura Zen:** Escribe libremente. El editor soporta Markdown estándar (negritas, cursivas, encabezados).
2.  **Candado de Lectura:** Si ves un candado rojo en la esquina, estás en modo "Solo Lectura" (archivo bloqueado por otro sistema o usuario).
3.  **Decoraciones de Deriva:** Ocasionalmente, verás líneas subrayadas en colores (Rojo/Naranja). Son las marcas del "Drift Plugin", señales de que la IA ha detectado una incoherencia narrativa.

**La Magia Oculta (Lo Técnico):**
Basado en **CodeMirror 6**, el `HybridEditor.tsx` inyecta extensiones personalizadas (`driftExtension`, `titaniumTheme`).
*   **Compartimentos de Estado:** Usa `Compartment` para reconfigurar dinámicamente si el editor es editable o `readOnly` sin destruir el estado.
*   **Sincronización:** Detecta cambios externos y reemplaza el contenido solo si hay divergencia significativa, evitando bucles de renderizado con el autoguardado.

**Advertencias:**
*   ⚠️ **Cursor Fantasma:** Si colaboras en tiempo real, el sistema prioriza la última escritura ("Last Write Wins"). Aún no hay cursores colaborativos multijugador.

---

## 2. LA BARRA DE ESTADO (Status Bar)

**La Promesa:**
El pulso vital de tu sesión. Mantiene tus metas diarias y la vigilancia del Canon a simple vista, sin estorbar.

**Mecánica Sagrada (Cómo se usa):**
1.  **Metricas:** Observa tu conteo de palabras y tiempo de lectura estimado (~200 palabras/min).
2.  **El Ojo de Argos:** Un botón que muestra el estado del Guardián (Limpio/Conflicto/Escaneando). Púlsalo para forzar una auditoría.
3.  **La Joya (Progreso):** Una barra de energía que se llena conforme escribes. Haz clic en el engranaje para ajustar tu **Meta Diaria** (por defecto 1000 palabras) o reiniciar el contador.

**La Magia Oculta (Lo Técnico):**
El componente `StatusBar.tsx` calcula el "Delta" de palabras en tiempo real.
*   **Heurística Anti-Pegado:** Ignora saltos bruscos (>50 palabras en un *tick*) para evitar que copiar y pegar texto infle falsamente tu progreso diario.
*   **Persistencia:** Guarda tu progreso y meta en `localStorage` (`myword_daily_goal`, `myword_daily_YYYY-MM-DD`).

**Advertencias:**
*   ⚠️ **Reinicio:** El progreso se reinicia visualmente cada día, pero no se borra el historial. Si cambias de dispositivo, el progreso local no se transfiere (es *client-side*).

---

## 3. LA FORJA DE ALMAS (Forge Panel)

**La Promesa:**
El taller del Demiurgo. Crea, edita y consulta las fichas de tus personajes sin salir de la inmersión.

**Mecánica Sagrada (Cómo se usa):**
1.  **Vinculación:** Al abrirla por primera vez, te pedirá "Crear Bóveda" (carpeta automática `/Personajes`) o "Vincular Existente".
2.  **Dashboard:** Visualiza tarjetas de tus personajes.
3.  **Desvinculación:** Si necesitas cambiar la carpeta fuente, usa el botón de "Romper Enlace" (icono cadena rota) en la cabecera.

**La Magia Oculta (Lo Técnico):**
`ForgePanel.tsx` actúa como un puente entre Firestore (`ProjectConfig`) y Google Drive.
*   **Resolución Híbrida:** Si la configuración tiene un `characterVaultId`, la Forja intenta resolver su nombre via API de Drive. Si falla (offline), usa una caché local o un nombre genérico ("Bóveda de Personajes").
*   **Recursividad:** Al seleccionar una carpeta, la Forja leerá *todos* los personajes dentro, incluso en subcarpetas profundas.

**Advertencias:**
*   ⚠️ **Movimientos Físicos:** Si mueves la carpeta de Personajes en Drive a otro lugar fuera del proyecto, la Forja perderá el rastro y tendrás que volver a vincularla.

---

## 4. PERFORADOR DE MUNDOS (Nexus Canvas V2)

**La Promesa:**
Ver lo invisible. Un mapa neuronal interactivo que revela las conexiones ocultas entre todas las entidades de tu universo.

**Mecánica Sagrada (Cómo se usa):**
1.  **Navegación:** Arrastra para moverte (Pan), rueda el ratón para Zoom.
2.  **El Ojo del Nexus:** Pulsa el botón central "NEXUS" para escanear todo tu proyecto en busca de nuevas entidades.
3.  **Cristalización:** Si ves un "Fantasma" (nodo translúcido), haz clic para "Cristalizarlo" (crear su archivo oficial en Drive).
4.  **Protocolo de Incineración:** En la barra inferior, el botón de "Limpiar Todo" borra la base de datos visual para empezar de cero (útil tras refactorizaciones masivas).

**La Magia Oculta (Lo Técnico):**
Un motor gráfico avanzado (`WorldEnginePageV2.tsx`) impulsado por `react-zoom-pan-pinch` y `framer-motion`.
*   **Nodos Fantasma:** Entidades detectadas en el texto pero que aún no tienen archivo (`isGhost: true`). Viven en `localStorage` (`nexus_drafts_v1`) hasta que las cristalizas.
*   **Identidad Determinista:** Los IDs de los nodos se generan matemáticamente (DJB2 Hash) basados en el nombre y proyecto, asegurando que "Gandalf" siempre tenga el mismo ID, sin importar cuántas veces lo escanees.

**Advertencias:**
*   ⚠️ **Zona de Peligro:** La opción "Confirmar Destrucción" elimina *físicamente* los metadatos de grafos en Firestore. Úsala con precaución extrema.

---

## 5. EL LABORATORIO (Laboratory)

**La Promesa:**
Tu mesa de alquimia. Un espacio para filtrar, etiquetar y chatear con tus archivos de referencia (PDFs, imágenes, notas) sin contaminar la novela.

**Mecánica Sagrada (Cómo se usa):**
1.  **Filtros:** Usa las etiquetas inteligentes (LORE, CIENCIA, VISUAL) para filtrar tus recursos.
2.  **El Bibliotecario:** El chat integrado ("Gemini Flash") tiene acceso exclusivo a los archivos que ves en pantalla. Pregúntale cosas como "¿Qué dice el PDF sobre la gravedad artificial?".
3.  **Auto-Etiquetado:** El sistema intenta clasificar tus archivos nuevos en segundo plano. Verás un icono de "Analizando..." mientras ocurre.

**La Magia Oculta (Lo Técnico):**
El `LaboratoryPanel.tsx` aplana la estructura de carpetas (`flatten(fileTree)`) y filtra solo aquellos archivos que viven en rutas designadas como `_RESOURCES`.
*   **Clasificación Perezosa:** Usa un *debounce* de 2 segundos para invocar la función `classifyResource` en lotes pequeños (3 archivos a la vez), evitando saturar la cuota de la IA.

**Advertencias:**
*   ⚠️ **Solo Referencias:** El Laboratorio ignora deliberadamente los archivos de tu Manuscrito (Borradores/Saga) para evitar confusiones. Solo ve lo que está en la carpeta de Recursos.

---

## 6. EL CRONOGRAMA (Timeline)

**La Promesa:**
El guardián del tiempo. Extrae automáticamente eventos y fechas de tu texto para construir una línea temporal coherente.

**Mecánica Sagrada (Cómo se usa):**
1.  **Configuración:** Define el "Año Actual" y el nombre de la "Era" (ej: 3050, Era Galáctica).
2.  **Invocación:** Pulsa "Analizar Archivo" mientras tienes un capítulo abierto. La IA leerá el texto buscando marcadores temporales.
3.  **Curación:** Los eventos aparecen como "Sugeridos" (Amarillo). Confírmalos (Verde) o descártalos (Rojo).

**La Magia Oculta (Lo Técnico):**
Utiliza una extracción de doble paso (`extractTimelineEvents`).
*   **Circuit Breaker:** Si la seguridad (`AppCheck`) no está lista, el panel bloquea la escucha de eventos (`isSecurityReady check`) para proteger la base de datos `TDB_Timeline`.

**Advertencias:**
*   ⚠️ **Ambigüedad:** La IA puede confundir "hace diez años" si no tiene un contexto claro del "ahora". Asegúrate de configurar bien el Año Actual antes de analizar.

---

## 7. LA IMPRENTA (Export Panel)

**La Promesa:**
La materialización final. Compila tus miles de fragmentos dispersos en un único manuscrito profesional (PDF) o genera certificados legales de autoría.

**Mecánica Sagrada (Cómo se usa):**
1.  **Composición:** Selecciona qué carpetas o archivos incluir en el libro usando el árbol con casillas de verificación.
2.  **Metadatos:** Rellena Título, Autor y Subtítulo.
3.  **Prensado:**
    *   **Compilar Manuscrito:** Genera un PDF legible para lectura o impresión.
    *   **Certificado de Autoría:** Descarga un informe forense (`.pdf`, `.md`, `.txt`) que demuestra la trazabilidad humana de tu escritura (Logs de Auditoría).

**La Magia Oculta (Lo Técnico):**
La función `compileManuscript` en el backend recibe la lista ordenada de IDs.
*   **Reconstrucción Binaria:** El PDF se genera en la nube (`pdfmake`) y se devuelve como una cadena Base64. El frontend la decodifica byte a byte (`Uint8Array`) para crear un Blob descargable, garantizando que el archivo nunca toque un servidor público de almacenamiento.

**Advertencias:**
*   ⚠️ **Tiempo de Prensado:** Compilar una novela entera (>50k palabras) puede tardar hasta 30 segundos. No cierres la ventana mientras el icono gira.
