## BLOQUE 1 — Cloud Functions
1. [functions/src/index.ts, Línea 183] **Falso positivo de getDriveFiles (400)**. El error "Missing params" no proviene de `getDriveFiles`, la cual lanza "Missing accessToken." cuando falla. El verdadero responsable del 400 "Missing params." es `getDriveFileContent` (Línea 148) o `saveDriveFile` (Línea 110) al omitir `fileId`, `content` o `accessToken`. [Severidad: Alta]
2. [functions/src/index.ts, Línea 407] **CORS en summonTheTribunal**. La función está exportada en `index.ts`, pero su `timeoutSeconds` está fijado en 540, lo que excede el máximo permitido para gen 1 si el cliente corta la conexión o el preflight falla por agotamiento de tiempo. Además, en frontend (`useDirectorChat.ts:251`) se invoca con un timeout manual de `540000`. Un preflight CORS fallido suele enmascarar un error 500 o timeout de servidor genérico en Firebase. [Severidad: Crítica]
3. [Múltiples Archivos] **Funciones Exportadas vs Llamadas**. Funciones exportadas nunca llamadas en frontend: `acquireLock`, `crystallizeForgeEntity`, `getBatchDriveMetadata`, `releaseLock`, `revokeDriveAccess`. Por el contrario, existen 16 funciones llamadas mediante `callFunction` en el frontend que NO están exportadas en `index.ts` (ej. `chatWithGem`, `extractTimelineEvents`, `compileManuscript`, `genesisManifest`, `worldEngine`). Esto genera un `functions/not-found` inmediato en tiempo de ejecución. [Severidad: Crítica]
4. [functions/src/index.ts, Múltiples Líneas] **Manejo de Errores Incompleto**. Funciones críticas como `saveProjectConfig`, `deleteForgeSession`, y `updateForgeCharacter` capturan el error (`catch (error: any)`) pero carecen de una propagación estructurada de `HttpsError`, devolviendo potencialmente errores opacos o `success: false` sin detalles. [Severidad: Media]
5. [functions/src/index.ts, Líneas 136, 262, 296, 322, 343, 371] **Funciones Stub / Fallbacks**. Múltiples funciones terminan con `return { success: true };` silenciando fallos o no retornando datos. Destaca `indexTDB` (Líneas 382-400), que solo imprime un TODO en el log y retorna un dummy success para desbloquear la UI. [Severidad: Importante]

## BLOQUE 2 — React / Frontend
1. [src/hooks/useFileLock.ts, Líneas 58-80] **Memory Leak (Firestore Listener)**. El listener `onSnapshot` para obtener el estado de bloqueo no se limpia en el primer `useEffect`. Retorna el `unsubscribe` junto con `clearInterval(interval)` al final del scope, pero el segundo `useEffect` encargado de "Release" carece de limpieza, creando potenciales fugas al desmontar.
2. [src/App.tsx, Línea 1143 / src/components/WorldEngineV2/WorldEnginePageV2.tsx, Líneas 126, 146] **Potenciales Infinite Loops**. Numerosos `useEffect` (alrededor de 63 detectados) utilizan objetos creados en línea (ej. arrays como `[]`, u objetos dinámicos) dentro del array de dependencias. Casos severos en `WorldEnginePageV2` usando `user` y `config?.folderId` sin memoización, gatillando re-renders masivos al propagarse cambios menores del contexto.
3. [src/components/forge/ForgePanel.tsx] **Componentes List sin React.memo()**. Mientras `FileTree.tsx` y `NexusCanvas.tsx` implementan correctamente `React.memo()` para sus items de lista, el ForgePanel (`EntityList`) omitió por completo la memoización para listas largas.
4. [src/components/...] **Error Boundaries Ausentes**. Ningún componente del árbol principal (`DirectorPanel`, `NexusCanvas`, etc.) ni de todo el repositorio `src/` cuenta con la implementación de `componentDidCatch` o envoltorios de `ErrorBoundary`. Un crash en el Canvas rompe toda la SPA.
5. [src/...] **Deuda Técnica de TypeScript y Dead Code**. Se contabilizan 241 usos explícitos de tipo `any`, concentrados críticamente en `WorldEnginePageV2.tsx` (26 usos) y `NexusCanvas.tsx` (26 usos) manipulando respuestas inseguras de Cloud Functions. Adicionalmente, existen 68 imports no usados (ej. 6 en `ForgeDashboard.tsx`).

## BLOQUE 3 — Datos y Estado
1. [src/components/NexusCanvas.tsx, Múltiples] **Inventario de localStorage y Vulnerabilidades**. El proyecto usa claves como `myworld_custom_gemini_key`, `myword_daily_goal`, y `nexus_drafts_v1`. Según el FIX 4 solicitado por la directiva, la clave Gemini (`myworld_custom_gemini_key`) **AÚN EXISTE** en localStorage y es leída por `api.ts`, `ProjectConfigContext.tsx` y `useLanguageStore.ts`, contraviniendo la política de seguridad.
2. [src/stores/useLayoutStore.ts] **Estado Global vs Contexto**. Zustand se emplea adecuadamente para Layout y Preferencias de Lenguaje. Sin embargo, `ProjectConfigContext.tsx` maneja configuraciones masivas y tokens duplicando el rol que debería tener el store, forzando re-renders del DOM completo al cambiar propiedades menores.
3. [src/components/WorldEngineV2/WorldEnginePageV2.tsx, Líneas 568, 650] **Race Conditions (Promise.all)**. Operaciones pesadas de escritura/evaluación sobre el `candidate.relations` son lanzadas con `Promise.all(map(...))` en paralelo sin cuellos de botella (chunking) o limitadores de concurrencia. Un nodo con cientos de relaciones puede desbordar la cuota de Drive/Firebase o disparar 429 (Too Many Requests).

## BLOQUE 4 — Seguridad Residual
1. [src/App.tsx, Línea 1122] **Logs de Consola Sensibles**. Mensajes de confirmación como `"✅ Token refrescado silenciosamente"` evidencian trazas temporales que en modo de error podrían escupir el response del interceptor de axios conteniendo OAuth Tokens en crudo.
2. [functions/src/genesis.ts, functions/src/crystallization.ts, functions/src/forge_chat.ts] **Validación de Inputs a la IA (Prompt Injection)**. Las Cloud Functions vinculadas directamente a la creación core carecen del envoltorio `escapePromptVariable()` mandatado por las directivas de seguridad para inputs del usuario, exponiéndose a escapes y system overrides.
3. [Múltiples Archivos en functions/src/] **File Path Traversal en Google Drive**. Funciones como `getDriveFileContent` y `crystallization.ts` reciben `fileId` inyectado libremente desde el frontend. Aunque la API de Google restringe el acceso mediante el `accessToken` del usuario, a nivel arquitectónico no existe validación previa en Firestore que certifique que el UID del token posee propiedad explícita de ese `fileId` en la estructura del proyecto (el TDB_Index).
4. [functions/src/index.ts, Múltiples] **Ausencia de AppCheck y Rate Limiting**. Todas las funciones exportadas en el index.ts están declaradas con `enforceAppCheck: false`. Al no existir un middleware de enrutamiento o limitación, el endpoint público es vulnerable a abusos o scraping masivo de peticiones facturadas (ej. llamadas maliciosas a `summonTheTribunal`).

## BLOQUE 5 — Titanium V3
1. [src/components/NexusCanvas.tsx, Línea 147] **Fragmentación Híbrida (Type vs Traits)**. El frontend, particularmente el componente crítico `NexusCanvas.tsx` y los modales visuales de `WorldEngineV2`, siguen dependiendo de propiedades legacy como `node.type` en lugar de evaluar el array `node.traits`. Existe el uso rudimentario `node.traits[0] : node.type` como parche temporal.
2. [functions/src/services/factory.ts] **Retrocompatibilidad Limitada**. `legacyTypeToTraits` actúa como puente para interpretar nodos de Firebase v2 hacia los 6 rasgos V3, pero las funciones legacy (ej. `crystallization.ts`, `smart_sync.ts`) todavía lo mapean en reversa forzando una doble fuente de verdad en Firestore.
3. [functions/src/services/smart_sync.ts, Líneas 122-136] **Gate de SHA-256 Confirmado**. La protección de Smart-Sync existe. `reconcile()` calcula el hash del contenido entrante y lo cruza (`incomingHash === storedHash`) contra la base de datos (`TDB_Index`) para detener bucles infinitos de sincronización entre el Sorter IA y los cambios de la UI en tiempo real.

## FIXES INMEDIATOS RECOMENDADOS

1. **(CRÍTICO) Funciones Frontend huérfanas**:
El frontend llama a funciones Cloud (ej. `chatWithGem`, `worldEngine`, `extractTimelineEvents`) que **no están** en el `export` raíz de `functions/src/index.ts`, generando errores 404/Not Found.
**Solución**: Agregar las importaciones directas desde sus respectivos archivos y re-exportarlas explícitamente usando el formato requerido en `index.ts`.

2. **(CRÍTICO) CORS en summonTheTribunal por Timeout excesivo**:
Firebase Cloud Functions Gen 1 no procesa bien preflights si el timeout interno de invocación de cliente supera los límites del proxy inverso (o si la respuesta HTTP tarda >60s sin keep-alive). Además, el frontend lanza con 540000 ms.
**Solución**:
```typescript
// En functions/src/index.ts
export const summonTheTribunal = onCall(
    {
        region: FUNCTIONS_REGION,
        cors: ALLOWED_ORIGINS, // Asegurarse de que ALLOWED_ORIGINS incluya el puerto local dev
        enforceAppCheck: false,
        timeoutSeconds: 300, // <-- REDUCIR a max seguro Gen1
        memory: "1GiB",
        secrets: [googleApiKey],
    },
```

3. **(CRÍTICO) Error 400 "Missing params" en getDriveFileContent**:
El frontend (ej. `FileTree.tsx:366`) llama a `getDriveFileContent` esperando que funcione, pero si por latencia o desincronización el `accessToken` es indefinido, estalla.
**Solución**:
```typescript
// En functions/src/index.ts (getDriveFileContent)
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login Required");
        const { fileId, accessToken } = request.data;
        if (!fileId) throw new HttpsError("invalid-argument", "Missing fileId parameter.");
        if (!accessToken) throw new HttpsError("invalid-argument", "Missing accessToken parameter.");
        // ...
```

4. **(IMPORTANTE) Fuga de Información de Gemini Key**:
A pesar de la directiva, `localStorage.getItem(myworld_custom_gemini_key)` sigue presente en el código.
**Solución**: Eliminar todas las trazas de `localStorage` para las credenciales de la API y forzar el uso de estado React efímero o `SessionStorage` estrictamente cifrado.

5. **(IMPORTANTE) FileLock Memory Leak**:
**Solución**:
```typescript
// En src/hooks/useFileLock.ts
    useEffect(() => {
        if (!fileId || !userId) return;
        const lockRef = doc(db, "users", userId, "file_locks", fileId);

        const unsubscribe = onSnapshot(lockRef, (docSnap) => { /* logic */ });

        const interval = setInterval(() => { /* logic */ }, 60000);

        return () => { // 🟢 CLEANUP CORRECTO
            unsubscribe();
            clearInterval(interval);
        };
    }, [fileId, userId]);
```

## RESUMEN EJECUTIVO

| Bloque | # Hallazgos | Críticos | Importantes | Menores |
|--------|------------|----------|-------------|---------|
| Bloque 1 - Cloud Functions | 5 | 2 | 2 | 1 |
| Bloque 2 - React / Frontend | 5 | 0 | 4 | 1 |
| Bloque 3 - Datos y Estado | 3 | 1 | 2 | 0 |
| Bloque 4 - Seguridad Residual | 4 | 2 | 2 | 0 |
| Bloque 5 - Titanium V3 | 3 | 0 | 2 | 1 |

AUDITORÍA DE SALUD COMPLETA. ESPERANDO INSTRUCCIONES.
