# 🤖 AGENTS.md — MyWorld: Titanium Protocol
> **SOVEREIGN SOURCE OF TRUTH** para todos los agentes de código (Antigravity, Jules, etc.).
> Branch: `dev-v2` | Stack: React 18 + Firebase Cloud Functions v2 + Gemini 3.1
> Última actualización: Marzo 2026

---

## ⚡ REGLAS CRÍTICAS PARA TODOS LOS AGENTES

1. **Nunca tocar `main`.** Todo va a `dev-v2`.
2. **Siempre correr `cd functions && npm run build`** después de modificar cualquier archivo en `functions/src/`.
3. **Todas las Cloud Functions nuevas DEBEN exportarse en `functions/src/index.ts`.**
4. **Importar `admin` y `db` exclusivamente desde `functions/src/admin.ts`** — nunca llamar `admin.initializeApp()` en otro lugar.
5. **Embeddings usan `outputDimensionality: 768`** — el índice vectorial de Firestore está configurado para 768d.
6. **CORS es manejado por Firebase SDK** — NO agregar headers CORS manuales a funciones `onCall`.
7. **Sovereign Areas** (`<!-- SOVEREIGN START --> ... <!-- SOVEREIGN END -->`) en archivos Markdown NUNCA deben ser sobreescritas por ningún agente.

---

## 🎨 FILOSOFÍA CENTRAL (Leer antes de implementar cualquier feature de IA)

### La IA no escribe por el usuario

MyWorld no es un ghostwriter. La IA es un **Espejo Activo** — recuerda, detecta contradicciones, enseña y pregunta. El autor siempre es dueño de su obra.

Esto aplica a TODA la IA de MyWorld:
- El Director hace más preguntas que sugerencias
- El Arquitecto pregunta antes de responder, siempre
- La Investigación Cultural explica el *por qué* histórico — el autor decide qué adopta
- Ninguna herramienta genera contenido creativo sin que el autor lo haya sembrado primero

**Antipatrón a evitar:** IA genera cultura → usuario copia → resultado genérico sin alma.
**Patrón correcto:** IA enseña historia real → explica el por qué → usuario entiende → usuario decide → resultado con raíces reales pero completamente suyo.

---

## ⚡ TECH STACK & ASIGNACIÓN DE MODELOS

| Rol | Model String | Usado Para |
|---|---|---|
| **The Judge** | `gemini-3.1-pro-preview` | Director, Tribunal, Chat RAG, razonamiento complejo |
| **The Soldier** | `gemini-3.1-flash-lite-preview` | Guardian Scan, Soul Sorter, Scribe Synthesis |
| **The Librarian** | `gemini-3.1-flash-lite-preview` | Laboratory, clasificación |
| **The Architect** | `gemini-3.1-pro-preview` | Planificación de saga, Efecto Dominó, Revelación |
| **TTS** | `gemini-2.5-pro-preview-tts` | Text-to-Speech de alta fidelidad (NO cambiar) |
| **Embeddings** | `gemini-embedding-001` | Vector search — siempre usar `outputDimensionality: 768` |

Constantes en `functions/src/ai_config.ts` y `src/constants.ts`.

---

## 📁 MAPA DE ARCHIVOS CLAVE

```
functions/src/
├── admin.ts              ← Singleton Firebase Admin init. Importar SOLO desde aquí.
├── ai_config.ts          ← MODEL_FLASH, MODEL_PRO constants
├── index.ts              ← TODOS los exports. Si no está aquí, no existe.
├── config.ts             ← ALLOWED_ORIGINS (incluye http://localhost:3000)
├── architect.ts          ← 🆕 El Arquitecto (por crear)
├── guardian.ts           ← Canon Radar / Guardian agent
├── soul_sorter.ts        ← Forge / Soul Sorter agent
├── scribe.ts             ← Creación y patch de archivos (Smart-Sync)
├── ingestion.ts          ← RAG chunking & vectorización
└── types/
    └── forge.ts          ← TitaniumEntity, EntityTier, EntityCategory

src/
├── components/
│   ├── ArquitectoPanel.tsx    ← 🆕 Panel dedicado (por crear)
│   └── director/
├── services/api.ts            ← callFunction() wrapper. Conecta al emulador en localhost:5001.
└── hooks/
    └── useArquitecto.ts       ← 🆕 Hook del Arquitecto (por crear)
```

---

## 🏛️ EL ARQUITECTO (Big Feature #1)

> Documento de diseño completo: `EL_ARQUITECTO_DESIGN.md`

### Propósito
Planificación estratégica de sagas antes de escribir. No es el Director (que trabaja escena por escena). El Arquitecto trabaja a nivel de saga completa.

### Comportamiento base (invariable)
```
usuario da documento / idea
→ Arquitecto lee y analiza
→ Identifica huecos y contradicciones
→ Hace preguntas ANTES de responder cualquier cosa
→ Usuario responde
→ Ambos construyen desde las respuestas del usuario
```

### Regla absoluta
**El Arquitecto pregunta antes de responder. Siempre.** Si no tiene suficiente información, nunca asume — pregunta.

### Modos (auto-detectados por contexto)

**Efecto Dominó**
Parte de una decisión del mundo (ej: el ciclo de Psico Energía se rompe) y traza consecuencias capa por capa. En cada capa hace UNA pregunta. La respuesta desbloquea la siguiente.

**Cronología de Revelación**
Mapea qué sabe el lector en cada libro de una saga. Detecta paradojas de revelación. No decide el orden — muestra las consecuencias de cada opción.

**Investigación Cultural**
Recibe documentos históricos reales. Explica el *por qué* histórico de cada elemento. NO genera la cultura ficticia. Enseña para que el autor decida.

**Personaje**
Hace preguntas que revelan huecos en arco o motivación. Ejemplo: *"Perdió todo dos veces. ¿Qué perdió la primera vez que todavía no sabe que perdió?"*

### Lo que NUNCA hace
- Generar culturas completas
- Decidir tramas o giros
- Escribir escenas o diálogos
- Asumir respuestas cuando no tiene información

### Prompt del sistema base
```
Eres El Arquitecto de MyWorld. Eres un colaborador de planificación narrativa para sagas complejas.

REGLA ABSOLUTA: Antes de responder cualquier cosa, analiza lo que el usuario compartió e identifica:
1. Qué huecos existen (información que falta para que el mundo sea coherente)
2. Qué contradicciones existen (elementos que se contradicen entre sí)
3. Qué preguntas el usuario no se ha hecho todavía

Haz esas preguntas PRIMERO. Solo cuando el usuario responda, construyes con él.

NUNCA:
- Generes culturas, tramas o escenas sin que el usuario las haya sembrado
- Asumas respuestas cuando no tienes información
- Decidas por el usuario

SIEMPRE:
- Explica el *por qué* de cada cosa cuando enseñas historia real
- Señala huecos sin rellenarlos
- Construye desde las respuestas del usuario, no desde tus suposiciones

El usuario es el autor. Tú eres perspectiva externa.
```

### Diferencia con el Director

| El Director | El Arquitecto |
|---|---|
| Co-piloto durante la escritura | Planificación antes de escribir |
| Trabaja escena por escena | Trabaja saga completa |
| Mantiene coherencia táctica | Construye estructura estratégica |
| Responde sobre el texto | Pregunta sobre el mundo |
| Memoria de lo que escribiste | Mapa de lo que planeas |

---

## ☁️ CLOUD FUNCTIONS EXPORTADAS

Todas deben estar en `functions/src/index.ts`:

**Auth & Drive:**
`exchangeAuthCode`, `refreshDriveToken`, `revokeDriveAccess`

**Drive File Operations:**
`saveDriveFile`, `getDriveFileContent`, `getDriveFiles`, `scribeCreateFile`, `scribePatchFile`, `getBatchDriveMetadata`, `getFileSystemNodes`, `renameDriveFolder`, `trashDriveItems`

**Sync & Index:**
`syncSmart`, `discoverFolderRoles`, `createTitaniumStructure`, `indexTDB`, `checkIndexStatus`, `crystallizeGraph`, `crystallizeForgeEntity`, `relinkAnchor`

**AI Agents:**
`auditContent`, `forgeToolExecution`, `analyzeStyleDNA`, `generateSpeech`, `classifyResource`, `integrateNarrative`, `transformToGuide`, `scanProjectDrift`, `rescueEcho`, `purgeEcho`

**El Arquitecto (nuevas):**
`arquitectoChat` ← 🆕 Chat principal del Arquitecto
`arquitectoAnalyzeDoc` ← 🆕 Análisis de documentos con identificación de huecos

**Project Config:**
`saveProjectConfig`, `nukeProject`

**Forge / Session:**
`addForgeMessage`, `clearSessionMessages`, `deleteForgeSession`, `updateForgeCharacter`

**Locks:**
`acquireLock`, `releaseLock`

**Health & Cleanup:**
`scanVaultHealth`, `purgeArtifacts`, `purgeEmptySessions`, `purgeForgeEntities`, `purgeForgeDatabase`

**Export:**
`generateAuditPDF`, `generateCertificate`

---

## 🎬 EL DIRECTOR

**Archivo:** `src/components/DirectorPanel.tsx`
**Modelo:** `gemini-3.1-pro-preview`

### Layout Modes
- **Sentinel (<500px):** Chat only.
- **Strategist (500px-900px):** Tactical Tools sidebar.
- **War Room (>900px):** Full command center.

### Nota de refactorización pendiente
El Director actual tiende a generar contenido rápidamente. Pendiente refactorizar su prompt para que haga más preguntas y genere menos automáticamente. La filosofía del Arquitecto (preguntar primero) debe eventualmente impregnar también al Director.

---

## 🛡️ THE GUARDIAN (Canon Radar)

**Archivo:** `functions/src/guardian.ts`, `src/hooks/useGuardian.ts`
**Modelo:** Flash Lite (detección) + Pro (lógica)

### Trigger
Cambio de hash SHA-256 en el buffer de texto. Debounce de 3000ms.

### Dimensión vectorial
Siempre usar `outputDimensionality: 768` en todas las llamadas `embedContent()`.

---

## 🧹 THE SENTINEL (Janitor)

- `scanVaultHealth` — calcula Health Score
- `purgeArtifacts` — elimina Ghost Files **irreversiblemente**
- `toggleShowOnlyHealthy` — filtro visual solamente, NO elimina

---

## 🔧 SETUP LOCAL

```bash
cd functions && npm run build && cd .. && firebase emulators:start
```

| Servicio | URL |
|---|---|
| Functions | `http://127.0.0.1:5001` |
| Hosting | `http://127.0.0.1:5000` |
| Frontend | `http://localhost:3000` |

**Nota:** Firestore apunta a PRODUCCIÓN. Functions al emulador local.

BYOK para desarrollo: `sessionStorage.setItem('myworld_custom_gemini_key', 'TU_KEY')` en consola del navegador.