# MASTER WORLD STATE
**FECHA DE REPORTE:** 15 de abril de 2026
**FASE ACTUAL:** Alpha → Pre-Producción

---

## 1. LOGROS ACUMULADOS (Sprints 6.2 → 6.4)

### El Arquitecto V3 — Completado y Validado

**Motor Socrático (Sprint 6.2)**
- Clasificador de intenciones DEBATE / RESOLUCIÓN / REFUTACIÓN / CONSULTA (Flash, temp=0)
- 4 prompts especializados por intención
- Ripple Effect: resolución en cadena automática
- ARQUITECTO_SYSTEM_INSTRUCTION unificado con todas las directivas del AI Studio
- buildAnalysisPrompt con modos TRIAGE/MACRO/MESO/MICRO + 3 Directivas Absolutas
- Jerarquía MACRO > MESO > MICRO en pendingItems
- Resoluciones previas inyectadas en contexto del chat (anti-amnesia)
- Caché de contexto en sesión — chat ya no llama Drive en cada mensaje

**Patches a Drive (Sprint 6.3)**
- arquitectoApplyPatch y arquitectoRejectPatch Cloud Functions
- DrivePatches.tsx con edición inline, aprobación y rechazo
- Badge numérico en toolbar cuando hay patches pendientes
- Changelog del Roadmap Final menciona archivos modificados
- readCanonContext inyecta ID de Drive para que el LLM lo referencie

**Flujo de Entrada (Sprint 6.4)**
- WelcomeState: pantalla de bienvenida estable, detecta sesión anterior
- IntentionModal: chips de sugerencia, campo libre, adjuntar archivo cultural, tip del Filtro de Cámara
- Máquina de estados 4 vistas: welcome → intention → chat → reinitializing
- Modo Exploración vs Modo Auditoría (detección automática por implementationGoal)
- Persistencia de mensajes en Firestore — historial sobrevive recargas
- Retomar sesión carga historial directamente con getDocs
- Indicador de modo visible: "MODO EXPLORACIÓN" / "MODO AUDITORÍA" en barra superior
- Botón "Analizar disonancias" cuando está en modo exploración
- Nueva Sesión con doble confirmación
- Semáforo userChoseToResume para controlar cuándo el onSnapshot actualiza mensajes

### Estado del sistema validado en producción
- 3 fuentes de contexto en cascada: Drive Canon → WorldEntities → TDB_Index fallback
- Muro de Cristal resuelto (11 documentos leídos en prueba real)
- Drawer de disonancias MACRO/MESO/MICRO con actualización en tiempo real
- Badge de intención en cada respuesta del Arquitecto
- Roadmap Final con 3 columnas — persiste en Firestore
- Mapa de Colisiones visual
- Todos los builds en cero errores

---

## 2. ESTADO ACTUAL DEL SISTEMA

### ✅ Funcionando y validado
- Flujo completo: WelcomeState → IntentionModal → Chat → Retomar
- Clasificador de intenciones operativo
- Persistencia de mensajes en Firestore
- Indicador de modo Exploración / Auditoría
- Patches a Drive con UI de aprobación
- Roadmap Final generado y descargable

### 🔴 Deuda técnica conocida

**Prioridad 1 — Patches a Drive end-to-end:**
El flujo de aprobación existe pero no ha sido probado con un archivo real que tenga driveFileId disponible. Pendiente prueba completa.

**Prioridad 2 — Versionado del Roadmap Final:**
Cada "Generar" sobreescribe. Diseño propuesto: roadmapVersions/{timestamp} con resolvedCount.

**Prioridad 3 — TDB_Index projectId:**
Chunks sin projectId no bloquean al Arquitecto pero afectan al Director y RAG general.

**Prioridad 4 — WorldEntities vacías:**
Fuente 2 retorna 0 entidades. La Forja no ha procesado entidades del proyecto actual.

---

## 3. ARQUITECTURA ACTUAL

### Backend architect.ts
```
arquitectoInitialize
  └─ readCanonContext (Drive → WorldEntities → TDB fallback)
  └─ buildAnalysisPrompt (TRIAGE/MACRO/MESO/MICRO + 3 Directivas)
  └─ Modo Exploración vs Auditoría según implementationGoal
  └─ Guarda initialMessage en subcolección messages
  └─ Cachea contexto en sesión

arquitectoChat
  └─ routeArquitectoIntent (Flash, temp=0)
  └─ build[Intent]Prompt con resolvedItems inyectados
  └─ updatePendingItemResolution + evaluateRippleEffect
  └─ Guarda mensajes user + ia en subcolección messages

arquitectoApplyPatch / arquitectoRejectPatch
arquitectoGenerateRoadmapFinal
arquitectoResolvePendingItem
arquitectoRecalculateCards
arquitectoAnalyze / arquitectoGenerateRoadmap
```

### Frontend
```
ArquitectoPanel.tsx
  └─ Máquina de estados: welcome | intention | chat | reinitializing
  └─ Indicador de modo en barra superior
  └─ ContradiccionesDrawer solo en estado 'chat'
  └─ Nueva Sesión con doble confirmación

useArquitecto.ts
  └─ onSnapshot(messages) con semáforo userChoseToResume
  └─ resumeSession con getDocs directo
  └─ discardSession con reset completo de estado y store
  └─ existingSession detecta sesiones activas al montar
```

---

## 4. PRÓXIMO SPRINT — PRE-PRODUCCIÓN

### Inmediato (hoy)
1. Flujo de login fluido
2. Banner de días de prueba con BYOK
3. Límite de 100 usuarios en Firebase (configurar en consola)
4. Dominio personalizado (reemplazar URL con myword + números)

### Después de pruebas iniciales
- Decidir modelo de monetización: planes de pago vs gratuito con donaciones
- Evaluar Gemma local como alternativa a Gemini API (reduce costos operativos a cero)
- Considerar migración de web a app si el modelo gratuito se confirma viable

---

## 5. PRINCIPIOS NO NEGOCIABLES
1. WorldEntities es el único SSOT.
2. El Arquitecto no escribe la historia — solo pregunta y registra acuerdos.
3. Los patches a Drive requieren aprobación explícita del usuario.
4. Ninguna clave sensible en Firestore.
5. El Changelog menciona archivos solo cuando los patches se apliquen realmente.