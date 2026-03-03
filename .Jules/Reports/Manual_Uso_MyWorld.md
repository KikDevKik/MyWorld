# Manual del Creador: Cómo Manejar MyWorld
**Versión de Referencia:** Marzo 2026 (Titanium V3)
**Autor:** El Ingeniero Jefe de Turno

Bienvenido a MyWorld. Este no es un simple procesador de textos o una base de datos de wikis. MyWorld es un "Motor de Mundos" (World Engine) diseñado para que tu narrativa (el "Lore") respire, se interconecte y evolucione con la ayuda de un ecosistema de Inteligencias Artificiales especializadas.

Este manual extenso está diseñado para ti, el Artífice (el creador humano). Aprenderás a dominar la interfaz principal (Titanium), las herramientas de visualización (Nexus) y las mecánicas invisibles que protegen tu arte.

---

## 1. La Arquitectura Básica de MyWorld

MyWorld se divide conceptualmente en tres grandes pilares:

* **Titanium (La Interfaz del Artífice):** Es todo lo que ves y tocas. El editor de texto, la barra lateral donde organizas tus archivos, y los menús de configuración.
* **Nexus (El Mapa del Alma):** Es la herramienta visual interactiva (el lienzo o canvas) donde tus creaciones no son texto, sino "nodos" interconectados por hilos de relaciones (ej. "Aliado de", "Nacido en").
* **El Ecosistema de Agentes (Las Mentes en la Sombra):** Son inteligencias artificiales que leen, auditan y expanden tu mundo sin que tengas que pedírselo constantemente.

---

## 2. Dominando Titanium (La Interfaz)

### A. El Árbol de Archivos (La Bóveda)
A tu izquierda, tienes la Bóveda (`FileTree`). No es solo una lista de carpetas. Es el esqueleto de tu mundo.
* *Crear:* Puedes crear archivos directamente.
* *Organizar:* Agrupa tus entidades lógicamente (ej. "Reino del Norte", "Magia Antigua").
* *Seguridad:* Si intentas borrar algo por accidente, el sistema ahora auto-enfoca el botón "Cancelar" para protegerte de clics rápidos erróneos.

### B. El Editor Híbrido (Donde Ocurre la Magia)
Cuando abres un archivo, entras al Editor. Aquí es donde MyWorld brilla:
* **El Metadato (La Sangre Fría):** En la parte superior de tu documento (oculto o en formato YAML) están los datos duros: Edad, Facción, Rol. MyWorld ahora usa "Rasgos" (Titanium V3). Tu personaje ya no es solo un "Personaje", es una entidad "Sintiente" y "Ubicable".
* **El Cuerpo del Texto (El Alma Caliente):** Aquí escribes tu prosa, tu historia.
* **Las Áreas Soberanas (Tu Zona Segura):** Lo más importante que debes saber. Cuando escribes texto largo que consideras arte puro y definitivo, MyWorld lo envuelve invisiblemente en `<!-- SOVEREIGN START -->`. Esto le dice a la IA: "Bajo ninguna circunstancia puedes alterar, resumir o reescribir esta sección humana".
* **Modo Zen:** Si necesitas concentrarte, activa el Modo Zen. Las barras laterales desaparecen y te quedas a solas con tus palabras. Ahora es totalmente accesible usando solo tu teclado.

---

## 3. Comandando a "El Director" (El Chat Inteligente)

A tu derecha (o en un panel emergente) vive **El Director**, tu co-piloto narrativo principal.
* **Memoria a Largo Plazo (RAG):** El Director ha leído *todo* tu mundo. Si estás escribiendo el capítulo 20 y le preguntas "¿Cómo se llamaba la posada del capítulo 2?", él buscará en sus "Chunks" (fragmentos de memoria) y te responderá.
* **El Protocolo del Vacío:** Si le preguntas algo que nunca has escrito (ej. "¿Cuál es el postre favorito del Rey?"), El Director no lo inventará para complacerte. Admitirá que ese dato no existe en el "Lore". Esto evita que tu mundo se llene de alucinaciones contradictorias.
* **Conciencia de Género:** El Director ajusta su tono al de tu obra. Si tu mundo es "Cyberpunk Distópico", no usará palabras como "Hechicería" o "Caballero" en sus sugerencias.
* **Las Burbujas de Pensamiento:** Ahora puedes ver un pequeño indicador de "Pensando..." cuando el Director está escaneando tu mundo entero antes de responderte.

---

## 4. Nexus: Tejiendo la Red

El Nexus no es solo para mirar; es para comprender la "Gravedad Semántica" de tu obra.
* **El Lienzo:** Al abrir Nexus, verás burbujas flotantes. Son tus personajes, lugares y artefactos.
* **Las Conexiones:** Si en un texto escribiste que "Aria encontró la Espada Solar en las Ruinas", Nexus intentará dibujar líneas entre Aria, la Espada y las Ruinas.
* **Rendimiento:** Recientemente optimicé este mapa. Puedes tener cientos de nodos flotando; si pasas el ratón por encima de uno, los demás se atenuarán instantáneamente para mostrarte solo las conexiones de ese nodo específico, sin que tu computadora se congele.

---

## 5. El Laboratorio (La Forja de Almas)

A veces, no quieres escribir un archivo desde cero. Quieres "escupir" ideas en bruto.
* **Ideas Sueltas (Fantasmas):** Entras al Laboratorio y escribes: "Un asesino ciego que usa el eco del metal para ver. Vive en las alcantarillas de Omicrón."
* **Cristalización:** Le das al botón de "Cristalizar". Aquí entra el agente "Soul Sorter" (Forjador de Almas). Él tomará ese párrafo caótico, deducirá que es una entidad "Sintiente", le asignará el rasgo "Ubicable" (Alcantarillas), creará un archivo perfectamente formateado con metadatos (YAML) y lo guardará en la carpeta correcta de tu Bóveda.

---

## 6. La Cronología (Timeline Panel)

* *El Tejedor del Tiempo:* MyWorld tiene un agente llamado "El Cronologista". Él lee tus historias y extrae eventos con fechas (ej. "En el año 45 de la Era Rota, cayó el Imperio").
* *Visualización:* El panel de la Cronología organiza estos eventos en una línea de tiempo para que nunca cometas un error de continuidad (ej. revivir a alguien antes de que nazca). Nota: Esta herramienta visual es inmensamente potente y acaba de ser estabilizada para que no parpadee al cargar cientos de eras históricas.

---

## 7. Consejos de Seguridad del Ingeniero

1. **Tu Nube es Tuya:** Si conectas Google Drive para importar mundos, tu contraseña/token es inyectado en memoria profunda (props). Ninguna extensión maligna de tu navegador puede robarlo gracias a las recientes actualizaciones de "Sentinel".
2. **Confía en el Guardián:** En segundo plano, un agente llamado "Radar Canon" está constantemente comparando lo que escribes hoy con lo que escribiste ayer. Si detecta que cambiaste el color de los ojos de un personaje de azul a verde, registrará un "Conflicto" en silencio para que lo revises luego.
3. **No Muevas los Cimientos Manualmente:** Si cambias la carpeta de un archivo usando el explorador de Windows/Mac en lugar del árbol de MyWorld (Titanium), puedes confundir temporalmente al Nexus. Usa siempre la interfaz para organizar tu mundo.

*Bienvenido a tu Mundo. Que la tinta fluya libre y el Lore se mantenga eterno.*
