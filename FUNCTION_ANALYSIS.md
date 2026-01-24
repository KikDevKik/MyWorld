# 🔬 ANÁLISIS DE FUNCIONES (TITANIUM BACKEND)
**Fecha:** 24 de Mayo 2024
**Total de Funciones:** 37
**Estado General:** OPERATIVO (Integración Gemini 3.0 Activa)

Este documento detalla el inventario completo de Cloud Functions desplegadas en `functions/src/index.ts`, categorizadas por su pilar arquitectónico.

---

## 1. INFRAESTRUCTURA CENTRAL (CORE)
*El sistema nervioso del proyecto. Gestiona configuración, estado y salud.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `checkSentinelIntegrity` | **Health Check.** Verifica acceso a Secret Manager y estado de la API. | ✅ Activo |
| `getProjectConfig` | **Configuración.** Recupera rutas de carpetas Canon/Recursos. | ✅ Activo |
| `saveProjectConfig` | **Configuración.** Guarda cambios en la estructura del proyecto. | ✅ Activo |
| `checkIndexStatus` | **Estado TDB.** Verifica si existe una base vectorial indexada. | ✅ Activo |
| `indexTDB` | **El Cerebro.** Vectoriza archivos de Drive usando Gemini Embeddings. | ✅ Activo (Gemini) |
| `saveUserProfile` | **Perfil.** Guarda preferencias de estilo del escritor. | ✅ Activo |
| `getUserProfile` | **Perfil.** Recupera el "ADN de Escritor" del usuario. | ✅ Activo |
| `debugGetIndexStats` | **Debug.** Estadísticas crudas del índice vectorial. | 🛠️ Mantenimiento |

---

## 2. LA FORJA (THE FORGE)
*Gestión de personajes, chat y creación de contenido.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `createForgeSession` | Crea una nueva sesión de chat/trabajo. | ✅ Activo |
| `getForgeSessions` | Lista el historial de sesiones. | ✅ Activo |
| `deleteForgeSession` | Elimina una sesión. | ✅ Activo |
| `addForgeMessage` | Envía mensaje al chat (persistencia en Firestore). | ✅ Activo |
| `getForgeHistory` | Recupera el historial de mensajes. | ✅ Activo |
| `clearSessionMessages` | "La Purga". Limpia el historial de una sesión. | ✅ Activo |
| `forgeToDrive` | **Materialización.** Compila el chat a Markdown en Drive. | ✅ Activo |
| `enrichCharacterContext` | **Deep RAG.** Análisis profundo de personaje con Gemini 3.0. | ✅ Activo (Gemini 3) |
| `syncCharacterManifest` | **Soul Collector.** Escanea y sincroniza la lista de personajes. | ✅ Activo |
| `forgeToolExecution` | **Tools.** Permite a la IA crear archivos físicos. | ✅ Activo |
| `forgeAnalyzer` | **Inspector.** Analiza borradores para detectar elenco. | ✅ Activo |
| `updateForgeCharacter` | **Sync-Back.** Actualiza rasgos de personaje en Drive/DB. | ✅ Activo |

---

## 3. EL PERFORADOR DE MUNDOS (WORLD ENGINE)
*Visualización de grafos, física y conexiones.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `syncWorldManifest` | **Nexus Scanner.** Genera el grafo de entidades desde Drive. | ✅ Activo |
| `worldEngine` | **Titan Link.** Motor de simulación narrativa (Gemini 3.0). | ✅ Activo (Gemini 3) |
| `analyzeNexusFile` | **High Reasoning.** Análisis profundo de archivo para el grafo. | ✅ Activo |
| `analyzeConnection` | **Abogado del Diablo.** Justifica vínculos entre nodos. | ✅ Activo |
| `crystallizeNode` | **Cristalización.** Convierte nodo fantasma en archivo real. | ✅ Activo |

---

## 4. HERRAMIENTAS DE OFICIO (TOOLS)
*Módulos especializados.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `chatWithGem` | **El Oráculo.** Chat RAG general con la base de conocimientos. | ✅ Activo (Gemini 3) |
| `summonTheTribunal` | **El Juicio.** 3 Jueces IA critican el texto. | ✅ Activo |
| `extractTimelineEvents` | **El Cronista.** Extrae eventos temporales del texto. | ✅ Activo |
| `restoreTimelineFromMaster` | **Time Anchor.** Restaura la línea de tiempo desde Drive. | ✅ Activo |
| `compileManuscript` | **La Imprenta.** Genera PDF desde archivos Markdown. | ✅ Activo (Solo PDF) |

---

## 5. LOS CUSTODIOS (CUSTODIANS)
*Sistemas autónomos de mantenimiento y seguridad.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `auditContent` | **Auditor.** Verifica integridad de contenido. | ✅ Activo |
| `scanProjectDrift` | **Drift.** Detecta desviación de tono/estilo. | ✅ Activo |
| `rescueEcho` | **Recuperación.** Intenta salvar datos corruptos. | ⚠️ Beta |
| `executeBaptismProtocol` | **Migración.** Resuelve referencias huérfanas. | ✅ Activo |
| `scanVaultHealth` | **Janitor.** Escaneo de salud de la bóveda. | ✅ Activo |
| `purgeArtifacts` | **Janitor.** Limpieza de archivos basura. | ✅ Activo |
| `purgeEmptySessions` | **Janitor.** Limpieza de sesiones vacías. | ✅ Activo |
| `analyzeStyleDNA` | **Analyst.** Extracción de huella estilística. | ✅ Activo |

---

## 6. ACCESO A DATOS (IO)
*Interacción directa con Google Drive API.*

| Función | Propósito | Estado |
| :--- | :--- | :--- |
| `getDriveFiles` | **Radar.** Escáner de estructura de archivos. | ✅ Activo |
| `getDriveFileContent` | **Lector.** Lee contenido de archivo (texto plano). | ✅ Activo |
| `saveDriveFile` | **Escriba.** Guarda contenido en archivo. | ✅ Activo |
