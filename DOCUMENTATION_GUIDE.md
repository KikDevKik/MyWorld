# Guía de Mapeo para Documentación Narrativa

Este documento sirve como mapa para redactar la documentación final del usuario ("El Manual de Campo"). Asocia cada funcionalidad narrativa con su "Fuente de Verdad" en el código, permitiendo crear instrucciones precisas para la IA encargada de redactar la guía final.

---

## 🏛️ Zona A: La Memoria (The Vault)
*El cerebro organizado de tu universo. Donde reside todo lo que has creado.*

| Funcionalidad Narrativa | Descripción (Objetivo del Usuario) | Fuente de Verdad (Código) |
| :--- | :--- | :--- |
| **La Bóveda (Sidebar)** | Navegar entre archivos, carpetas y capítulos. Es el índice de tu libro. | `src/components/VaultSidebar.tsx`<br>`src/components/FileTree.tsx` |
| **Enlace Neural (Drive)** | Conectar el proyecto a la nube de Google Drive para almacenamiento seguro y propiedad total de los datos. | `src/components/ui/ConnectDriveModal.tsx`<br>`src/App.tsx` (Lógica `handleDriveLink`) |
| **Configuración del Proyecto** | Ajustar los metadatos del universo, nombre del proyecto y preferencias globales. | `src/components/ui/ProjectSettingsModal.tsx`<br>`src/components/ui/SettingsModal.tsx` |
| **Modo Zen** | Ocultar distracciones para enfocarse puramente en la escritura. | `src/layout/SentinelShell.tsx` (Lógica de ocultamiento)<br>`src/stores/useLayoutStore.ts` |

---

## 🎭 Zona B: El Escenario (Action)
*El espacio de trabajo principal donde la creatividad toma forma.*

| Funcionalidad Narrativa | Descripción (Objetivo del Usuario) | Fuente de Verdad (Código) |
| :--- | :--- | :--- |
| **Editor Híbrido** | El lienzo de escritura principal. Soporta texto enriquecido y análisis en tiempo real. | `src/editor/HybridEditor.tsx` |
| **La Barra de Estado** | Información vital a pie de página: estado del Guardián, conteo de palabras, y salud del sistema. | `src/components/ui/StatusBar.tsx` |
| **La Forja de Almas** | Herramienta para "craftear" personajes detallados, definiendo su psique, físico e historia. | `src/components/forge/ForgePanel.tsx` |
| **Perforador de Mundos** | Motor visual de grafos para diseñar la estructura del mundo (lugares, facciones) y sus conexiones. | `src/components/WorldEngineV2/WorldEnginePageV2.tsx`<br>`src/components/WorldEngineV2/GraphSimulationV2.tsx` |
| **El Laboratorio** | Espacio para experimentar con ideas sueltas, *prompts* y lluvia de ideas sin ensuciar el manuscrito. | `src/components/LaboratoryPanel.tsx` |
| **El Cronograma** | Línea de tiempo para organizar eventos cronológicos de la historia y visualizar la secuencia. | `src/components/TimelinePanel.tsx` |
| **La Imprenta** | Sistema de exportación para compilar el manuscrito en formatos legibles (PDF, Markdown). | `src/components/ExportPanel.tsx` |

---

## 🧠 Zona C: La Inteligencia (The Arsenal)
*Tus co-pilotos de IA y herramientas de análisis avanzado.*

| Funcionalidad Narrativa | Descripción (Objetivo del Usuario) | Fuente de Verdad (Código) |
| :--- | :--- | :--- |
| **El Arsenal (Dock)** | Barra de herramientas lateral para acceder rápidamente a las IAs especializadas. | `src/components/forge/ArsenalDock.tsx` |
| **El Director** | Tu co-piloto creativo. Responde preguntas, sugiere giros de trama y guía el proceso. | `src/components/DirectorPanel.tsx` |
| **El Tribunal** | Crítico literario implacable. Analiza el texto seleccionado en busca de mejoras de estilo y tono. | `src/components/TribunalPanel.tsx` |
| **El Guardián (Canon Radar)** | Sistema de vigilancia pasiva que alerta sobre contradicciones con la historia (Canon) o errores de continuidad. | `src/components/CanonRadar.tsx`<br>`src/hooks/useGuardian.ts` |
| **Estado del Centinela** | Panel de diagnóstico del sistema (salud de la conexión, estado de la IA). | `src/components/forge/SentinelStatus.tsx` |

---

## 🔮 Protocolos de Origen
*Sistemas de iniciación y acceso.*

| Funcionalidad Narrativa | Descripción (Objetivo del Usuario) | Fuente de Verdad (Código) |
| :--- | :--- | :--- |
| **Protocolo Génesis** | Asistente inicial (Wizard) que entrevista al autor para generar la "semilla" del mundo automáticamente. | `src/components/genesis/GenesisWizardModal.tsx` |
| **Acceso Seguro** | Pantalla de entrada y autenticación. | `src/pages/LoginScreen.tsx`<br>`src/pages/SecurityLockScreen.tsx` |

---

## 👻 Mecánicas Invisibles
*Sistemas que trabajan en las sombras para proteger al autor.*

| Funcionalidad Narrativa | Descripción (Objetivo del Usuario) | Fuente de Verdad (Código) |
| :--- | :--- | :--- |
| **Auditoría Creativa** | Registro forense inmutable que prueba que el humano escribió el texto (vs IA). Genera certificados de autoría. | `src/services/CreativeAuditService.ts` |
| **El Escriba (Auto-Guardado)** | Sistema que guarda cambios en Drive automáticamente cada 2 segundos tras detectar inactividad. | `src/App.tsx` (Buscar `saveToDrive` y `useEffect` de guardado) |
| **Sincronización Neuronal** | Proceso que lee los archivos de Drive para "enseñar" a la IA sobre los cambios recientes en el canon. | `src/contexts/ProjectConfigContext.tsx`<br>Backend: `functions/src/index.ts` (indexTDB) |
