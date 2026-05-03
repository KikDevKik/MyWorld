# Auditoría de Localización y Traducciones Faltantes (MyWorld)

Este documento sirve como inventario de todas las cadenas de texto, etiquetas, mensajes de error y contenidos generados que actualmente NO están integrados en el sistema de internacionalización (i18n) y necesitan traducción al **Inglés (EN)** y futuros idiomas.

---

## 1. INFRAESTRUCTURA i18n ACTUAL
- **Archivo Central:** `src/i18n/translations.ts`
- **Store de Estado:** `src/stores/useLanguageStore.ts`
- **Idiomas configurados:** ES, EN.

---

## 2. PENDIENTES: INTERFAZ DE USUARIO (Frontend)

| Componente | Ubicación | Cadenas Hardcoded (Texto actual) | Prioridad |
| :--- | :--- | :--- | :--- |
| `LoginScreen` | `src/pages/LoginScreen.tsx` | "MyWorld es un IDE creativo...", "Al iniciar sesión autorizas...", "También necesitarás una API Key..." | Alta |
| `ProjectSettingsModal` | `src/components/ui/ProjectSettingsModal.tsx` | "Configuración del Proyecto", "Rutas de Acceso", "Taxonomía", "Migrar proyecto desde Drive", "Autorizar acceso de importación" (y estados del Wizard) | Alta |
| `ConnectDriveModal` | `src/components/ui/ConnectDriveModal.tsx` | "Conexión Neuronal", "Enlaza tu Google Drive", "ID de la Carpeta o Enlace" | Media |
| `VaultSidebar` | `src/components/VaultSidebar.tsx` | Títulos de menús contextuales, tooltips de botones nuevos. | Media |
| `ArquitectoPanel` | `src/components/ArquitectoPanel.tsx` | "Auditoría Estructural en Curso", "MINERÍA MULTI-HOP", "Nueva Sesión", "El Arquitecto procesa la lógica, tú pones el alma." | Alta |
| `DirectorPanel` | `src/components/DirectorPanel.tsx` | "Director de Escena en línea", "Ecos Críticos", "Veredicto del Tribunal", "Analizando Elenco" | Alta |
| `StatusBar` | `src/components/ui/StatusBar.tsx` | "Sin API Key", "Misiones del Roadmap", "Narrando", "Pausar", "Detener", "Restablecer progreso" | Media |
| `ForgeSoul` | `src/components/forge/ForgeSoul.tsx` | "REGISTRO DE BESTIARIO", "ARCHIVO MAESTRO", "Usar Plantilla Bestiario", "Vínculo Roto" | Media |
| `NexusCanvas` | `src/components/NexusCanvas.tsx` | "CARGANDO NEXUS...", "Inyectar variable...", "Limpiar Todo", "Acercar/Alejar vista" | Media |
| `App.tsx` | `src/App.tsx` | "CARGANDO SISTEMAS NEURONALES...", "Sincronizando Neuronas", "Protocolo de Seguridad Fallido", "Advertencia de Seguridad" | Alta |

---

## 3. PENDIENTES: SERVICIOS Y LÓGICA (Generación de Contenido)

### 3.1 Exportación e Imprenta (PDF/Docs)
- **Problema:** El motor de exportación debe respetar el idioma de preferencia.
- **Archivos a revisar:** `src/components/ExportPanel.tsx`, servicios de generación de PDF.
- **Textos faltantes:** Índices automáticos, encabezados ("Capítulo", "Prólogo"), metadatos del documento.

### 3.2 Mensajes de IA (Arquitecto / Director / Escriba)
- **El Arquitecto (`functions/src/architect.ts`):** Las `SYSTEM_INSTRUCTION` y los modos `TRIAGE`, `MACRO`, `MESO`, `MICRO` están en español.
- **El Director (`src/hooks/useDirectorChat.ts`):** Las instrucciones de comportamiento socrático están hardcodeadas en español.
- **El Escriba (`functions/src/scribe.ts`):** Las plantillas de Markdown (`# Descripción`, `## Relaciones`) se generan en español.

---

## 4. PENDIENTES: BACKEND (Cloud Functions)
- **Errores:** Mensajes de error enviados a través de `HttpsError` que llegan al frontend en español ("Login requerido", "Falta token").
- **Estructura Titanium:** Los nombres de las carpetas creadas por defecto (`CANON`, `RECURSOS`, `PERSONAJES`) deben localizarse.

---

## 5. REQUERIMIENTOS ESPECIALES (User Feedback)
- **Sincronizando Neuronas:** Se ha detectado que esta cadena (o variaciones como "Sistemas Neuronales") debe ser movida a `translations.ts` y sincronizada con el idioma activo del usuario para evitar disonancia cognitiva en el inicio de la app.

---

## 6. INSTRUCCIONES PARA EL EQUIPO DE TRADUCCIÓN
1.  **Mover a `translations.ts`:** Todas las cadenas detectadas arriba deben recibir una clave única (ej. `statusBar.noApiKey`).
2.  **Referenciar en Componentes:** Reemplazar el texto estático por `t.clave` usando el hook `useLanguageStore`.
3.  **Localizar Backend:** Las Cloud Functions deben recibir el parámetro `lang` del frontend y elegir el prompt o nombre de carpeta correspondiente.
4.  **Verificar Invariantes:** No traducir nombres de comandos técnicos o códigos de error que no se muestran al usuario final.

