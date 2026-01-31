# 👻 MECÁNICAS INVISIBLES (THE GHOST MECHANICS)

*Los engranajes silenciosos que giran en las sombras. Procesos autónomos que protegen tu autoría y tu cordura.*

---

## 1. AUDITORÍA CREATIVA (Creative Audit)

**La Promesa:**
La prueba irrefutable de tu humanidad. Un notario digital que registra cada acto de creación, asegurando que tú eres el dueño legal de la obra, no la IA.

**Mecánica Sagrada (Cómo funciona):**
1.  **Registro Pasivo:** No tienes que hacer nada. El sistema observa en silencio.
2.  **Eventos Registrados:**
    *   **Inyección:** Cuando escribes manualmente o editas un texto.
    *   **Curación:** Cuando aceptas o rechazas una sugerencia de la IA.
    *   **Estructura:** Cuando creas o mueves un archivo/nodo.
3.  **El Certificado:** En la *Imprenta*, puedes descargar un "Certificado de Autoría" (PDF o TXT). Este documento es un log forense con fechas y hashes que demuestra la trazabilidad de tu esfuerzo.

**La Magia Oculta (Lo Técnico):**
El servicio `CreativeAuditService.ts` actúa como una "Caja Negra".
*   **Inmutabilidad:** Escribe en una subcolección de Firestore (`audit_log`) con reglas de seguridad que permiten *crear* pero jamás *editar* o *borrar* registros.
*   **Firma de Tiempo:** Usa `serverTimestamp()` de Firebase para garantizar que la fecha es real y no manipulada por el reloj de tu ordenador.

**Advertencias:**
*   ⚠️ **Privacidad:** El log contiene fragmentos de tus prompts y ediciones. Es privado para ti, pero si compartes el certificado, estarás compartiendo esa metainformación.

---

## 2. EL ESCRIBA (Auto-Save)

**La Promesa:**
Jamás perderás una palabra. Un salvavidas que atrapa tus pensamientos antes de que se desvanezcan en el éter de un fallo técnico.

**Mecánica Sagrada (Cómo funciona):**
1.  **Latido:** Cada vez que dejas de escribir por 2 segundos, el Escriba despierta.
2.  **Guardado Silencioso:** Sube los cambios a Google Drive sin interrumpirte. Verás un sutil indicador en la interfaz.
3.  **Detección de Cambios:** Si cierras la pestaña antes de tiempo, el navegador te gritará una advertencia.

**La Magia Oculta (Lo Técnico):**
En `App.tsx`, un efecto (`useEffect`) con *debounce* de 2000ms vigila la variable `selectedFileContent`.
*   **Edición Significativa:** Calcula la diferencia de caracteres (`Math.abs(diff) > 50`). Si has escrito un párrafo entero, marca el guardado como `isSignificant: true`.
*   **Trigger de Indexado:** Los guardados "significativos" actualizan el timestamp `lastSignificantUpdate` en tu configuración, alertando al Director de que debe "re-aprender" el texto pronto.

**Advertencias:**
*   ⚠️ **Conflictos:** Si tienes el mismo archivo abierto en dos pestañas, ganará la última que guarde ("Last Write Wins"). No lo hagas.

---

## 3. SINCRONIZACIÓN NEURONAL (Neuronal Sync)

**La Promesa:**
La memoria viva. El proceso que transforma archivos de texto inertes en conocimiento líquido para la Inteligencia Artificial.

**Mecánica Sagrada (Cómo funciona):**
1.  **Escucha:** El sistema vigila tu carpeta de Drive.
2.  **Aprendizaje:** Cuando guardas, la IA no solo almacena el archivo; lo "lee" y extrae conceptos, personajes y relaciones.
3.  **Vectorización:** Convierte el texto en números (vectores) que permiten al Director buscar por *significado*, no solo por palabras clave.

**La Magia Oculta (Lo Técnico):**
Gestionado por `ProjectConfigContext.tsx` y la Cloud Function `indexTDB`.
*   **Listener en Tiempo Real:** El frontend se suscribe a `TDB_Index/{uid}/structure/tree` via `onSnapshot`. Cualquier cambio en el backend se refleja instantáneamente en tu árbol de archivos local.
*   **Indexado Incremental:** No re-lee todo el proyecto cada vez. Solo procesa los archivos cuyo hash ha cambiado, ahorrando costes y tiempo.

**Advertencias:**
*   ⚠️ **Coste Cognitivo:** Si pegas 50 archivos de golpe en Drive, la sincronización puede tardar unos minutos. Sé paciente mientras la IA digiere el banquete.
