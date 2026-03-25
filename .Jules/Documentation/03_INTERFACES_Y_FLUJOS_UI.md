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
- Los nodos se derivan del componente `.nexus` usando `toGraphNode()`.
- **Fantasmas (Ghosts):** Nodos semi-transparentes. Representan identidades inferidas pero no guardadas. Un simple clic ejecuta la "Cristalización" (persistir el nodo formalmente en el ECS).

### The Builder (`TheBuilder.tsx`)
Panel especializado de construcción iterativa para el Nexus. Utiliza comandos directos o "Socratic Input" para generar árboles de dependencias enteros basándose en un nodo inicial (e.g. Crear todo un linaje para "El Rey").

### La Forja de Almas (`ForgePanel.tsx`)
Visualizador tabular y detallado de entidades. Su modelo de datos fluye a través del adaptador `toSoulEntity()`, inyectando los componentes de la Forja (Tags, Alias) que residen en Firestore. 

## 3. ZONA C: LA INTELIGENCIA (The Arsenal)
Barra dock vertical derecha que gestiona las herramientas (Gems).
- Contiene accesos directos al Director (Chat contextualizado RAG), Guardián, Tribunal y Laboratorio (Musa).
- Un componente nunca se solapa destructivamente con el editor principal gracias al gestor dinámico de tamaños.

## 4. ESTADO DEL CENTINELA & MECÁNICAS DE HIGIENE
Panel global (Escudo) que audita:
- Conexión al Secret Manager de Google Cloud.
- Salud del Árbol (Fantasmas de 0 bytes o enlaces de Drive caídos).
- Ejecuta operaciones del *Janitor* (Limpieza de cachés vacías y purga de documentos inservibles).
