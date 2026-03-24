# 🗺️ MyWorld Roadmap
> **Branch activa:** `dev-v2`
> **Estado:** En desarrollo post-hackathon. Sin fecha límite — calidad sobre velocidad.

---

## ✅ Completado (main branch — enviado al hackathon)

- Titanium Protocol V3.0 (Trait-based entity system)
- The Director con RAG y modos Sentinel / Strategist / War Room
- The Guardian (Canon Radar) — Friction, Drift, Resonance, Structure
- The Tribunal — 3 jueces con Gemini 3.1 Pro
- Nexus Canvas v4.0 — D3-force, LOD, Crystallization
- The Forge / Soul Sorter — Ghost → Limbo → Anchor pipeline
- The Laboratory — RAG aislado, Smart Tags
- The Press — PDF compiler + Authorship Certificate
- Sentinel Status — Vault health + purge
- TTS / Narrator — Gemini 2.5 Pro
- Smart-Sync Middleware — Sovereign Areas
- Creative Audit — Immutable audit_log

---

## ✅ Completado (dev-v2 — fixes post-hackathon)

- App Check debug token hardcodeado eliminado
- CORS separado por entorno (local vs producción)
- NarratorService migrado a Cloud Function (`analyzeScene`)
- BYOK migrado de `localStorage` → `sessionStorage`
- Memory leak en `useFileLock.ts` corregido
- `ErrorBoundary.tsx` aplicado a componentes críticos
- 16 Cloud Functions huérfanas exportadas en `index.ts`
- GeminiEmbedder shadowing corregido (funciones de RAG operativas)
- Migración pnpm → npm

---

## 🔴 En progreso / Inmediato

### BYOK Onboarding
Mostrar mensaje claro cuando el usuario no tiene API key configurada. Sin esto los usuarios nuevos no saben por qué la IA no responde.

### Drive no carga al login
Token se refresca silenciosamente pero la UI no reacciona. Bug de estado en App.tsx.

### Fix SettingsModal auditoría de rutas
`nodes.forEach is not a function` — cambio en formato de respuesta de `getDriveFiles`.

---

## 🏛️ BIG FEATURE #1 — El Arquitecto

> **Prioridad:** Crítica. Desbloquea al autor para escribir con rumbo claro.
> **Documento de diseño:** `EL_ARQUITECTO_DESIGN.md`

### El problema que resuelve
El autor tiene el universo completo en la cabeza pero se pierde entre sus propias ideas cuando la saga abarca múltiples libros, razas, eras y sistemas de magia interconectados. No puede definir aspectos de la Era Actual porque el efecto dominó de eras pasadas tiene huecos. No sabe qué revelar en cada libro sin arruinar otro.

### Filosofía
La IA potencia la creatividad, no la reemplaza. El Arquitecto no genera tramas ni culturas. Enseña, pregunta y muestra. **Pregunta antes de responder, siempre.**

### Comportamiento base
```
autor da documento / idea
→ Arquitecto identifica huecos y contradicciones
→ Hace preguntas antes de responder
→ Autor responde
→ Ambos construyen desde las respuestas del autor
```

### Modos naturales (auto-detectados por contexto)
- **Efecto Dominó** — trazar consecuencias de una decisión del mundo, capa por capa
- **Cronología de Revelación** — qué sabe el lector en cada libro y cuándo
- **Investigación Cultural** — explica el *por qué* histórico real para que el autor decida qué adoptar
- **Personaje** — preguntas que revelan huecos en arco o motivación

### Fases de implementación
- **Fase 1 (MVP):** ✅ Chat dedicado + comportamiento base + Modo Efecto Dominó
- **Fase 2:** ✅ Caché de análisis inteligente + Status Bar Hover (Reemplazando el diseño original de Widget Persistente para mantener la UI limpia) + Cronología de Revelación.
- **Fase 3:** (Pendiente) Integración con Forja y Nexus Canvas

---

## 📋 Backlog

### 🔧 Refactorización de herramientas existentes
El Director y el Tribunal deben ser más apoyo que reemplazo. Pendiente refactorizar sus prompts para que hagan más preguntas y generen menos contenido automático.

### 🎨 Editor & Escritura
- [ ] **El Prisma de Voces** — Reescribir texto desde la voz de un personaje (BubbleMenu + `reimagineText`)
- [ ] **El Espejo del Alma** — Crear personajes mediante roleplay conversacional
- [ ] **La Pluma Fantasma** — Ghost text autocomplete lore-aware en CodeMirror

### 🌐 Nexus & Visualización
- [ ] **La Tinta Viva** — Nexus Cards en hover sobre entidades en el editor

### 📦 Infraestructura
- [ ] Exportación EPUB/Kindle nativa en The Press
- [ ] Modo Offline First agresivo (PWA)

### 🌕 Moonshots (sin fecha)
- [ ] La Topografía del Alma — Nexus en 3D
- [ ] El Telar del Tiempo cuántico — ramas de multiverso

---

## ❌ Descartado / Postergado

- **Resonancia Atmosférica** — solo efectos visuales, bajo valor
- **El Lienzo Onírico** → convertido en generador de prompts para IA de imágenes externa (no generación directa)
- **El Telar del Tiempo v2** — big update para cuando MyWorld esté en producción con usuarios reales
- **La Topografía del Alma (3D)** — moonshot, no prioritario

---

## 📝 Principios de Diseño (No negociables)

1. **La IA no escribe por el autor.** Recuerda, detecta, pregunta, enseña.
2. **El Arquitecto pregunta antes de responder.** Siempre.
3. **Las culturas las construye el autor.** La IA enseña historia real, el autor decide qué adopta.
4. **El autor siempre es dueño de su obra.** La IA es perspectiva externa, no co-autor.