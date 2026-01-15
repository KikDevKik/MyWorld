# AGENTS.MD

## Protocolo de Seguridad del Gensakusha

Este proyecto requiere inyección manual de variables de entorno para App Check y Firebase debido a políticas de seguridad del Gensakusha.

- El archivo `.env.local` debe estar presente en la raíz.
- Se debe asegurar que `projectId` y `apiKey` nunca sean undefined.
- Se ha implementado un mecanismo de fallback en `src/index.tsx` para garantizar la estabilidad del sistema.
