# 03. INTERFACES Y FLUJOS UI

VERSIÓN: 5.0 (Fase Alpha - ECS Hybrid Migration)
ESTADO: EN PRODUCCIÓN

La interfaz del Proyecto Titanium está diseñada en tres "Zonas" principales, diseñadas para evitar la fatiga visual mientras brindan acceso completo a las mecánicas invisibles.

## 1. ZONA A: LA BÓVEDA (Sidebar)
Navegación de Google Drive en tiempo real. Divide categóricamente:
- **Canon:** El cuerpo principal y la verdad de la historia.
- **Recursos:** Elementos de inspiración visual/texto (consumidos por el Laboratorio).

*Conexión Neural:* La app mantiene un Refresh Token infinito mediante Google Identity v2, asegurando acceso a las carpetas mapeadas de Google Drive en `ProjectConfigContext`.

## 2. ZONA B: EL ESCENARIO (El Lienzo Principal)

### Editor Híbrido (`HybridEditor.tsx`)
Lienzo central implementado en CodeMirror 6.
- **Drift Plugin:** Extensiones que subrayan incoherencias narrativas detectadas por el Guardián.
- **Sentinel Mode (Zen):** Oculta toda la interfaz y paneles dejando solo el editor para máxima inmersión. Modifica el estado global mediante `useLayoutStore`.
- **Auto-Save (El Escriba):** Dispara sincronizaciones "Debounced" de 2 segundos. Detecta Deltas grandes para activar re-indexación.

### Perforador de Mundos / Nexus (`WorldEnginePageV2.tsx`)
Motor avanzado (`react-zoom-pan-pinch` + `framer-motion`) que renderiza el **Grafo de Conocimiento ECS**.
- Los nodos se derivan del componente `.nexus` usando `toGraphNode()`. Las colecciones antiguas (`projects/{id}/entities`) han desaparecido; todo el dato visual y relacional fluye del SSOT (`WorldEntities`).
- **Esquema de Submódulos (La Trinidad de la Entidad):**
  - **`forge`**: Contiene la identidad pura (summary, aliases, tags).
  - **`nexus`**: Contiene la topología y metadata visual (relaciones, metadata del Builder).
  - **`guardian`**: Contiene los datos de auditoría y rastreo de presencia en el manuscrito.
- **Fantasmas (Ghosts):** Nodos semi-transparentes. Representan identidades inferidas pero no guardadas. Un simple clic ejecuta la "Cristalización" (persistir el nodo formalmente en el ECS).

### The Builder (`TheBuilder.tsx`)
Panel especializado de construcción iterativa para el Nexus. Utiliza comandos directos o "Socratic Input" para generar árboles de dependencias enteros basándose en un nodo inicial (e.g. Crear todo un linaje para "El Rey").

### La Forja de Almas (`ForgePanel.tsx`)
Visualizador tabular y detallado de entidades. Su modelo de datos fluye a través del adaptador `toSoulEntity()`, inyectando los componentes de la Forja (Tags, Alias) que residen en Firestore. 

## 3. ZONA C: LA INTELIGENCIA (The Arsenal)
Barra dock vertical derecha que gestiona las herramientas (Gems).
- Contiene accesos directos al Director (Chat contextualizado RAG), Guardián, Tribunal y Laboratorio (Musa).
- Un componente nunca se solapa destructivamente con el editor principal gracias al gestor dinámico de tamaños.

### La Musa / Laboratorio de Ideas
Centro de tormentas de ideas y análisis de recursos externos.

**Mecánicas de Chat y Persistencia Híbrida:**
1. **Actualización Optimista (Optimistic UI):** Para garantizar una respuesta instantánea, el chat renderiza el mensaje del usuario localmente antes de confirmar la escritura en DB. Se utiliza una guarda `useRef (isCreatingNewSession)` para evitar que la inicialización asíncrona de Firestore en sesiones nuevas borre el texto optimista (Race Condition).
2. **Filtro de Teflón (Pureza del Historial):** Solo se persisten en Firestore (`muse_sessions`) los roles canónicos (`user`, `model`). Los mensajes de error de red o bloqueos de IA son efímeros; viven en el estado de React para informar al usuario, pero está prohibido guardarlos, manteniendo el historial libre de ruido técnico.
3. **Borrado Profundo (Deep Delete):** La eliminación de una sesión desencadena un proceso recursivo que purga la subcolección `/messages` antes del documento padre, evitando la acumulación de "Ghost Data" en Firestore.

### El Arquitecto (Alpha UI Status)
Panel de planificación estratégica y Roadmap interactivo.
- **Enfoque Alpha:** La interfaz ha sido simplificada para evitar la parálisis por elección. Los botones de acceso a módulos experimentales ("Mundos", "Ajustes de Lore") han sido ocultados temporalmente (comentados) para priorizar el flujo de Misiones Operativas.

## 4. MECÁNICAS DE UX Y FALLBACKS UNIVERSALES

### Blindaje de Notificaciones (Toasts)
Todas las alertas globales (sincronización, errores de censura, guardado) están protegidas contra el doble-disparo del `StrictMode` de React mediante guardias lógicas o estados de verificación inicial, garantizando que el usuario nunca reciba "Pop-ups Gemelos" por una misma acción.

### Universal TABULA RASA UI
Cuando la IA carece de contexto canónico (RAG vacío), la interfaz presenta una invitación universal para **"Cristalizar Conocimiento"**. Este mensaje es agnóstico: ya no asume que el usuario debe ir a un panel específico, sino que ofrece la Forja como el puente para convertir la incertidumbre en una `WorldEntity` persistente.

## 5. ESTADO DEL CENTINELA & MECÁNICAS DE HIGIENE
Panel global (Escudo) que audita:
- Conexión al Secret Manager de Google Cloud.
- Salud del Árbol (Fantasmas de 0 bytes o enlaces de Drive caídos).
- Ejecuta operaciones del *Janitor* (Limpieza de cachés vacías y purga de documentos inservibles).

## Actualización Sprint 5.6: Interfaz del Arquitecto V2
- **Estructura ECS:** La Bóveda, El Constructor (Builder) y El Nexus Canvas ahora asumen y respetan rigurosamente el paradigma de componentes (`modules.forge.summary`, `modules.nexus.relations`), eliminando la necesidad de objetos JSON planos y permitiendo un grafo robusto.
- **Historial de Chat Aislado:** Para proteger las sesiones tácticas de interferencias de otros módulos, el historial del Arquitecto ahora se enruta y persiste en su propia colección anidada: `forge_sessions/{sessionId}/messages_arquitect`.
