# AGENTS.MD

## Protocolo de Seguridad del Gensakusha

Este proyecto requiere inyección manual de variables de entorno para App Check y Firebase debido a políticas de seguridad del Gensakusha.

- El archivo `.env.local` debe estar presente en la raíz.
- Se debe asegurar que `projectId` y `apiKey` nunca sean undefined.
- Se ha implementado un mecanismo de fallback en `src/index.tsx` para garantizar la estabilidad del sistema.

## Sentinel_Alert_System

Handles Error 9 (Firestore Index) by triggering global UI ring and HUD button.
- **Backend:** Detects `FAILED_PRECONDITION` (Index missing) and logs `[SENTINEL_ALERTA_CRITICA]`. Returns `technicalError` object.
- **Frontend:** `ForgeChat` intercepts the error and updates `ProjectConfigContext`.
- **UI:** `ProjectHUD` turns orange with a repair button. `Editor` pulses with an orange ring. Audio alert triggers once.
