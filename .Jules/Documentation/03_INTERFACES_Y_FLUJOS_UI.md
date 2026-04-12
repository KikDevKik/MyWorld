# 03. INTERFACES Y FLUJOS UI

VERSIÓN: 6.0 (Fase Alpha - HUD Inmersivo & Multimodal)
ESTADO: EN PRODUCCIÓN

## 1. EL ARQUITECTO: INTERFAZ TÁCTICA
- **HUD de Auditoría [NUEVO]:** Reemplazo del loader estático por una visualización de "Minería Multi-Hop". Incluye barra de asimilación con interpolación de 8 segundos para reflejar la latencia del RAG profundo.
- **Soporte PDF (Multimodal) [NUEVO]:** El chat del Arquitecto permite adjuntar documentos PDF (max 10MB). El backend los procesa como entrada multimodal y los guarda automáticamente como `RESOURCE` en el SSOT.
- **Triage Chips Reactivos:** Botones dinámicos que aparecen según el contenido de la IA para elegir modalidades (Mega-Roadmap, Ingeniería Inversa).
- **Focus Selector:** Permite permutar el objetivo narrativo de la sesión en tiempo real.

## 2. EL GUARDIÁN: CANON RADAR
- **Auditoría Global [NUEVO]:** Botón en el footer del panel que dispara `auditGlobal`. Muestra un reporte de paradojas verificables detectadas en todo el proyecto.

## 3. ESTABILIZACIÓN DE REACT (Anti-Bucle)
- **Cortafuegos de Estado:** La inicialización del Arquitecto ahora está blindada contra errores de red. Se inyecta `setHasInitialized(true)` en el bloque catch para evitar bucles infinitos de re-renderizado ante fallas del servidor.
- **Inyección Estricta de SSOT:** El frontend garantiza la transmisión de `folderId` en cada payload, eliminando errores de "projectId obligatorio".

## Actualización Sprint 6.0: UX de Alta Densidad [COMPLETADO]
La interfaz ya no es un simple chat; es un HUD táctico que informa al autor sobre la profundidad del escaneo que la IA está realizando sobre su obra.
