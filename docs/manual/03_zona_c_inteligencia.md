# 🧠 ZONA C: LA INTELIGENCIA (THE ARSENAL)

*La conciencia artificial que te observa, te guía y te juzga. Tus co-pilotos en la soledad de la escritura.*

---

## 1. EL ARSENAL (Dock)

**La Promesa:**
Acceso inmediato a todas tus herramientas de poder. Un cinturón de utilidades que se adapta a tu flujo de trabajo.

**Mecánica Sagrada (Cómo se usa):**
1.  **Navegación:** Barra vertical a la derecha. Haz clic para desplegar una herramienta en la Zona C.
2.  **Estado del Centinela:** El escudo superior indica la salud del sistema (Verde = Seguro, Rojo = Error/Offline).
3.  **El Director:** El icono de la claqueta (🎬) abre tu chat con la IA principal.
4.  **Acceso Rápido:** Perforador, Forja, Guardián, Tribunal, Laboratorio, Cronograma, Imprenta.

**La Magia Oculta (Lo Técnico):**
El `ArsenalDock.tsx` gestiona el estado global de navegación (`activeGemId`).
*   **Interruptor de Director:** Al hacer clic en la claqueta, invoca una función especial `onToggleDirector` que cambia el layout, permitiendo que el panel del Director se expanda o colapse dinámicamente según el espacio disponible.

**Advertencias:**
*   ⚠️ **Exclusividad:** Solo puedes tener una herramienta "pesada" (como el Perforador) abierta a la vez. El Arsenal gestiona este cambio de contexto automáticamente.

---

## 2. EL DIRECTOR (The Director)

**La Promesa:**
Tu co-autor incansable. Un chat consciente de tu contexto que conoce tu historia mejor que tú.

**Mecánica Sagrada (Cómo se usa):**
1.  **Diálogo:** Escribe naturalmente. "Dame ideas para el villano", "¿Cómo se llamaba la espada de X?".
2.  **Modos de Vista:**
    *   **Estándar:** Panel lateral.
    *   **Estratega:** Panel ancho (clic en icono de layout).
    *   **War Room:** Pantalla completa con lista de sesiones históricas.
3.  **Memoria:** El Director recuerda lo que escribiste hace 5 minutos y hace 5 meses. Si ves el aviso "Cambios detectados", pulsa "Sincronizar" para refrescar su memoria.

**La Magia Oculta (Lo Técnico):**
Impulsado por `DirectorPanel.tsx` y el hook `useDirectorChat`.
*   **Inyección de Contexto:** Cada mensaje que envías va acompañado de un "System Prompt" invisible que contiene el resumen de tu proyecto, el contenido del archivo abierto y los hechos verificados por el Guardián.
*   **Auditoría Creativa:** Cada instrucción que das ("La Semilla") se registra legalmente via `CreativeAuditService` para probar que la idea fue tuya, no de la IA.

**Advertencias:**
*   ⚠️ **Alucinaciones:** Aunque tiene acceso a tus archivos, a veces puede inventar detalles si la memoria está desactualizada. Usa el botón "Sincronizar" frecuentemente.

---

## 3. EL TRIBUNAL (The Tribunal)

**La Promesa:**
Juicio implacable. Tres personalidades de IA critican tu texto para elevar tu prosa, no para complacerte.

**Mecánica Sagrada (Cómo se usa):**
1.  **Selección:** Elige "Texto Manual" (pegar fragmento) o "Archivo Actual".
2.  **Invocación:** Pulsa "Invocar al Tribunal".
3.  **El Veredicto:** Recibirás tres críticas:
    *   **El Arquitecto (Azul):** Evalúa estructura, lógica y ritmo.
    *   **El Bardo (Púrpura):** Evalúa belleza, metáforas y emoción.
    *   **El Hater (Rojo):** Evalúa viabilidad comercial, clichés y aburrimiento.

**La Magia Oculta (Lo Técnico):**
Una Cloud Function (`summonTheTribunal`) con un *timeout* extendido de 9 minutos.
*   **Procesamiento Paralelo:** La IA asume tres "Personas" distintas simultáneamente y genera un JSON estructurado con `verdict`, `critique` y `score` para cada juez.

**Advertencias:**
*   ⚠️ **Crueldad:** El "Hater" está programado para ser cínico y destructivo. No te lo tomes personal; es una prueba de resistencia para tu obra.

---

## 4. EL GUARDIÁN (Canon Radar)

**La Promesa:**
Vigilancia eterna. Un sistema pasivo que te alerta cuando contradices tus propias reglas o la personalidad de tus personajes.

**Mecánica Sagrada (Cómo se usa):**
1.  **Semáforo:** En la barra de estado (Zona B), verás "ARGOS" (Limpio), "ESCANEO" o "CONFLICTO".
2.  **El Radar:** Abre el panel para ver los detalles.
    *   **Conflictos:** Contradicciones directas ("Juan está muerto" vs "Juan entra al bar").
    *   **Fracturas de Realidad:** Violaciones de las leyes de tu mundo (Magia, Física).
    *   **Traición Narrativa:** Un personaje actuando fuera de su personalidad establecida ("El Hater" te avisará).
3.  **Sincronización:** Si un personaje evoluciona (cambia), puedes pulsar "Actualizar Canon" para que el sistema aprenda su nueva personalidad.

**La Magia Oculta (Lo Técnico):**
El hook `useGuardian.ts` ejecuta un hash SHA-256 de tu texto cada 3 segundos. Si el hash cambia (escribiste algo nuevo), dispara una auditoría silenciosa.
*   **Límites:** Analiza bloques de hasta 100k caracteres.
*   **Resonancia:** Detecta "Semillas" (ideas recurrentes) y similitudes con otros archivos para sugerir conexiones.

**Advertencias:**
*   ⚠️ **Falsos Positivos:** El Guardián puede ser literal. Si escribes un sueño o una mentira de un personaje, podría marcarlo como contradicción. Usa tu criterio.

---

## 5. ESTADO DEL CENTINELA (Sentinel Status)

**La Promesa:**
Higiene digital. Mantiene tu proyecto limpio de archivos basura y conexiones rotas.

**Mecánica Sagrada (Cómo se usa):**
1.  **Diagnóstico:** Panel de salud del sistema. Verifica la conexión con Drive (Uplink) y la seguridad (Defense).
2.  **Protocolo Janitor:** Escanea tu Drive en busca de "Fantasmas" (archivos vacíos de 0 bytes o corruptos).
3.  **La Purga:** Si encuentra basura, el botón "Ejecutar Purga" eliminará esos archivos permanentemente para sanar el árbol de proyecto.

**La Magia Oculta (Lo Técnico):**
Utiliza dos Cloud Functions: `scanVaultHealth` y `purgeArtifacts`.
*   **Integridad:** Calcula un porcentaje de salud basado en la proporción de archivos válidos vs. corruptos.
*   **Filtro Visual:** El interruptor "Solo Sanos" (`toggleShowOnlyHealthy`) oculta visualmente los archivos problemáticos en el explorador (Sidebar) sin borrarlos.

**Advertencias:**
*   ⚠️ **Borrado Definitivo:** La Purga es irreversible. Asegúrate de leer la lista de "Fantasmas" antes de confirmar.
