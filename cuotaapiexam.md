# Reporte de Auditoría: Consumo Automático de Cuota API (LLM)

A continuación, se documentan las funciones del sistema (frontend y backend) que se disparan de forma **automática** sin una acción directa o consciente del usuario (como hacer clic en un botón) y que generan un consumo directo de la cuota de la API de IA (Gemini/OpenAI).

---

## 1. El Guardián (CanonRadar / `auditContent`)
**Ubicación:** `src/hooks/useGuardian.ts` -> `functions/src/guardian.ts`
**Nivel de Consumo:** 🔥 **CRÍTICO (Alto y Continuo)**

### ¿Cómo se dispara?
En el frontend, el hook `useGuardian` envuelve el editor principal (`HybridEditor`). Se activa un temporizador (Debounce de 3000ms) cada vez que el contenido del archivo cambia. La auditoría se dispara sola bajo estas condiciones:
1. Al cargar un archivo por primera vez en la sesión.
2. Cada vez que el usuario escribe o borra **más de 50 palabras** desde la última auditoría.
3. Si el hash del texto cambió (hay una modificación real).

### ¿Qué cuota consume?
Invoca la Cloud Function `auditContent`. Esta función es la más pesada de todo el sistema, pues lanza múltiples tareas LLM en paralelo por cada texto enviado:
- `smartGenerateContent` para Extracción de Hechos (FactExtractor).
- `embeddingModel.embedContent` para convertir el texto en vectores (768d).
- `smartGenerateContent` para chequear fricción lógica (FrictionCheck).
- `smartGenerateContent` para chequear leyes del mundo (RealityFilter).
- `smartGenerateContent` para perfilar al personaje y actuar como "Hater" (HaterAudit).
- `smartGenerateContent` para buscar resonancias en el canon (ResonanceCheck).

**Conclusión:** Mientras el usuario está escribiendo y pausando, el Guardián está consumiendo múltiples llamadas a modelos generativos y de embedding en segundo plano repetidas veces por sesión.

---

## 2. El Destilador Automático de Recursos (`distillResourceOnIndex`)
**Ubicación:** `functions/src/distillation_trigger.ts`
**Nivel de Consumo:** 🟠 **ALTO (Por Evento)**

### ¿Cómo se dispara?
Es un Trigger de base de datos en el backend (`onDocumentWritten`). Se ejecuta automáticamente cada vez que se crea o modifica un documento en la colección `users/{userId}/WorldEntities/{entityId}`.

### ¿Qué cuota consume?
Si el documento recién subido o detectado tiene `category === 'RESOURCE'` y `status === 'pending'`, la función:
1. Va a Google Drive y lee el archivo subido.
2. Invoca a **Gemini (`model.generateContent`)** usando el `getModelForTask('standard', tier)` para generar un resumen, un análisis y extraer metadatos del recurso.

**Conclusión:** Cada vez que el sistema o el usuario inserta un "recurso" a la base de datos de manera encolada, el backend gasta cuota para "leerlo y destilarlo" en la sombra.

---

## 3. Aclaraciones de Falsos Positivos (No consumen LLM en automático)

Existen otras funciones autoejecutables en el sistema que *parecen* pesadas, pero **NO** consumen cuota de LLM API (aunque sí podrían consumir Google Drive API o lecturas de Firestore):

*   **Autoguardado (`saveDriveFile` en `App.tsx`)**: Se dispara a los 2 segundos de que el usuario deja de escribir. Solo hace llamadas a Google Drive API para sobreescribir el archivo. No usa inteligencia artificial.
*   **Refresco de Token (`App.tsx`)**: Un `setInterval` cada 50 minutos que interactúa con Google OAuth.
*   **Radar de Desviación / scanProjectDrift (`functions/src/guardian.ts`)**: Se dispara de forma semi-automática al abrir la vista del "Director", pero utiliza cálculos vectoriales matemáticos locales (`cosineSimilarity`) sobre los *embeddings* que ya existían previamente en la base de datos. No hace llamadas a la API de Google Generative AI directamente.

## Resumen Ejecutivo para Control de Costos
Si buscas reducir el gasto fantasma o limitar la cuota consumida de Gemini:
1. Debes modificar el umbral del Guardián en `useGuardian.ts` (Actualmente en `wordCountDiff > 50`) a un número mayor (ej. 200 palabras) o volverlo 100% manual.
2. Monitorear el volumen de archivos clasificados como `RESOURCE` que se sincronizan con la bóveda, ya que el Trigger de Firestore los procesa con IA inmediatamente.