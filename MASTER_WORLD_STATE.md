# MASTER WORLD STATE
**FECHA DE REPORTE:** 11 de abril de 2026
**FASE ACTUAL:** Alpha 6.2 — El Arquitecto V3 Validado en Producción

---

## 1. LOGROS DEL TURNO (Validación Completa del Arquitecto V3)

### Flujo Core Validado en Producción
- **Clasificador de Intenciones:** Detecta DEBATE / RESOLUCIÓN / REFUTACIÓN / CONSULTA correctamente en prueba real. Badge visible en UI.
- **Cierre de disonancias:** 3 disonancias resueltas en sesión real. Drawer actualiza en tiempo real via onSnapshot del documento raíz de sesión.
- **Ripple Effect:** Operativo. Al resolver una disonancia evalúa automáticamente impacto en las pendientes.
- **REFUTACIÓN VÁLIDA:** El Arquitecto aceptó correctamente el Filtro de Cámara invocado por el usuario y cerró ARQ-001 sin exigir datos fuera de cámara.
- **Roadmap Final (Lore):** Genera las 3 columnas (Changelog + Misiones de Creación + Investigación) con contenido real de la sesión. Persiste en Firestore. Botón Descargar .md funcional.
- **Mapa de Colisiones (Mundo):** Panel abre correctamente con topología MACRO/MESO/MICRO.
- **3 Fuentes de contexto:** Drive Canon (11 documentos leídos en prueba real) → WorldEntities → TDB_Index fallback. Muro de Cristal resuelto definitivamente.
- **onSnapshot de pendingItems:** Listener sobre documento raíz de sesión. El drawer refleja resoluciones en tiempo real sin refresh.

### Fixes Aplicados Durante Validación
- Eliminadas 5 constantes duplicadas de Versión A (PROMPT_TRIAGE, PROMPT_INQUISITOR, PROMPT_ARCHITECT, PROMPT_CONSULTANT, selectArquitectoState antigua).
- onClick faltantes en botones Mundo y Lore de ArquitectoToolbar conectados.
- onSnapshot de pendingItems creado en useArquitecto.ts (el listener no existía).

---

## 2. ESTADO ACTUAL DEL SISTEMA

### ✅ Funcionando en producción y validado
- Arquitecto inicializa leyendo Drive directamente con canonPaths
- Clasificador de intenciones (DEBATE / RESOLUCIÓN / REFUTACIÓN / CONSULTA)
- Drawer de disonancias con jerarquía MACRO/MESO/MICRO y actualización en tiempo real
- Badge de intención en cada respuesta del Arquitecto
- Cierre de disonancias con El Espejo
- Ripple Effect automático post-resolución
- Roadmap Final con 3 columnas — persiste en Firestore
- Mapa de Colisiones visual
- Focus Selector conectado al backend
- Modal de descripción completa al hacer doble clic en disonancia

### 🟡 Implementado pero pendiente de prueba
- Notificación compacta post-cierre (máx 15 palabras) — aún no implementado en Gemini CLI
- Clasificación de "continuar"/"sí" como CONFIRMACION
- `arquitectoResolvePendingItem` (resolución manual desde frontend)

### 🔴 Deuda técnica conocida y priorizada

**Prioridad 1 — Patches reales a Drive:**
El Arquitecto propone cambios (campo `pendingDrivePatches` en Firestore) pero no los escribe en Drive. El Changelog muestra acuerdos narrativos, no cambios reales de archivo. Implementación pendiente: diff visual → aprobación usuario → escritura `.md` en Drive → Changelog menciona nombre de archivo.

**Prioridad 2 — Versionado del Roadmap Final:**
Actualmente cada "Generar Ahora" sobreescribe. Diseño propuesto: `forge_sessions/{sessionId}/architect/roadmapVersions/{timestamp}` con `resolvedCount`. Botón cambia a "Regenerar" con badge "X nuevas resoluciones" cuando hay items resueltos desde la última generación.

**Prioridad 3 — TDB_Index projectId:**
Chunks sin projectId no bloquean al Arquitecto (usa Drive directo) pero afectan al Director y RAG general. Pendiente script de migración.

**Prioridad 4 — WorldEntities vacías:**
Fuente 2 retorna 0 entidades. La Forja no ha procesado entidades del proyecto actual. No bloquea nada pero el Arquitecto pierde datos psicológicos estructurados de personajes.

---

## 3. ARQUITECTURA ACTUAL (Snapshot)

### Backend `functions/src/architect.ts`
```
arquitectoInitialize
  └─ readCanonContext (Drive → WorldEntities → TDB fallback)
  └─ buildAnalysisPrompt (TRIAGE/MACRO/MESO/MICRO + 3 Directivas + jerarquía)
  └─ Ordena pendingItems: MACRO > MESO > MICRO

arquitectoChat
  └─ routeArquitectoIntent (Flash, temp=0) → DEBATE|RESOLUCIÓN|REFUTACIÓN|CONSULTA
  └─ build[Intent]Prompt → respuesta con ARQUITECTO_SYSTEM_INSTRUCTION
  └─ updatePendingItemResolution (si RESOLUCIÓN o REFUTACIÓN válida)
      └─ evaluateRippleEffect → auto-resuelve cadena + muta items

arquitectoResolvePendingItem  (resolución manual/lote)
arquitectoGenerateRoadmapFinal  (3 columnas)
arquitectoRecalculateCards  (Efecto Dominó de tarjetas DominoCanvas)
arquitectoAnalyze  (re-análisis con focusMode)
arquitectoGenerateRoadmap  (cristalización de tarjetas visuales)
```

### Frontend relevante
```
ArquitectoPanel.tsx
  └─ ContradiccionesDrawer (MACRO/MESO/MICRO + modal descripción completa)
  └─ Badge de intención en mensajes
  └─ SlideUpPanel: Dominó | Personajes | ColisionesMap | RoadmapFinalView | Settings
  └─ ArquitectoFocusSelector (focusMode conectado al backend)

useArquitecto.ts
  └─ onSnapshot(sessionDocRef) → pendingItems en tiempo real
  └─ onSnapshot(cardsRef) → roadmapCards en tiempo real
  └─ focusMode, severityMode, lastDetectedIntent
  └─ resolveItem → arquitectoResolvePendingItem
```

---

## 4. PRÓXIMOS PASOS

### Inmediato
1. **Dos cambios de tokens en el clasificador (Gemini CLI):**
   - `buildResolucionPrompt`: notificación compacta post-cierre, máx 15 palabras
   - `routeArquitectoIntent`: "continuar"/"sí"/"siguiente" como CONFIRMACION → solo formula primera disonancia nueva

### Sprint 6.3
1. Patches reales a Drive — diff visual → aprobación → escritura en `.md`
2. Versionado del Roadmap Final con historial por timestamp y badge de nuevas resoluciones

### Sprint 6.4
1. Script de migración TDB_Index — inyectar projectId en chunks existentes
2. Procesamiento de WorldEntities con la Forja para alimentar Fuente 2
3. Gestión y optimización de tokens por sesión

---

## 5. PRINCIPIOS NO NEGOCIABLES
1. WorldEntities es el único SSOT. Sin colecciones paralelas.
2. El Arquitecto no escribe la historia — solo pregunta y registra acuerdos.
3. Los patches a Drive requieren aprobación explícita del usuario antes de escribir.
4. El grafo de dependencias se construye en memoria, no en Firestore.
5. Ninguna clave sensible en Firestore.
6. El Changelog del Roadmap Final solo menciona archivos cuando los patches se apliquen realmente.