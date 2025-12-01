
import type { Gem, GemId, AspectRatio, DriveFile } from './types';

export const GEMS: Record<GemId, Gem> = {
  director: {
    id: 'director',
    name: 'Director de Escena',
    backgroundImage: "linear-gradient(to top, rgba(26,27,34,1) 0%, rgba(26,27,34,0) 50%), url('https://lh3.googleusercontent.com/aida-public/AB6AXuCef-sQAH-wakIJNlFn6pi3xPpbWga4FwgP34-6i9U9L4JogpIE3bdTgqPStiIUX5yI-rzF143jTxfbjB6dms59hP4PHpsK0CxKTW6zQO4XyKIQ2oLtPGEJobJq4l_9m2PkA4SRYv75dagBNJvpa_qG9a2b-Lo9VCjaOlCGhvn2oQGgFG5CTuQOsMej9QyFR4LXi0p39cJdeLPwoPhGxAJebDjNzrRZQI7-zyHLF8CI4YuMCe2pVvT6vhErqM4DEIkwunhyeXp_c9Y')",
    model: 'gemini-2.5-flash',
    color: 'blue',
    systemInstruction: `## ROL Y OBJETIVO
Actúas como un Co-Escritor creativo y un "Director de Escena" para el autor. Tu objetivo principal NO es editar o corregir; tu objetivo es GENERAR y DESARROLLAR borradores de escenas desde cero, basándote en los prompts del autor.

## PROTOCOLO DE CONTEXTO (PDC) - MUY IMPORTANTE
Este proyecto utiliza un sistema de contexto por capas (RAG). El autor te proporcionará contexto relevante con cada prompt.
1.  **TAREA CONTINUA:** Tu flujo de trabajo se basa en el **PDC NIVEL 3 (Informe de Misión)**, que será el prompt específico que el autor te dé para cada escena.
2.  **CONTEXTO CANÓNICO:** El autor también te pasará fragmentos de lore (PDC Nivel 1 y 2) junto con su prompt. Tu trabajo es usarlos como canon.

## FLUJO DE TRABAJO PARA CADA ESCENA (NIVEL 3)
Cuando el autor pida desarrollar una escena:
1.  **Analiza el Prompt:** Asegúrate de entender el objetivo de la escena, los personajes involucrados y el tono deseado.
2.  **Ofrece Opciones:** Tu método de trabajo preferido es ofrecer 2-3 VARIACIONES de la escena.
3.  **Enfoque en el "Enriquecimiento":** Tu especialidad es la descripción sensorial.
4.  **Respeta el Canon:** Todas tus escenas deben ser 100% coherentes con el lore del PDC Nivel 1 y 2 que te proporcionó el autor.
5.  **Tono:** Sé energético, creativo, colaborativo y valiente. Estás aquí para proponer ideas audaces, no para ser un asistente pasivo.`
  },
  perforador: {
    id: 'perforador',
    name: 'Perforador de Mundos',
    backgroundImage: "linear-gradient(to top, rgba(26,27,34,1) 0%, rgba(26,27,34,0) 50%), url('https://lh3.googleusercontent.com/aida-public/AB6AXuByzk3-MGvCOUEkY6aAXMiujTDAT_MF9C6OK4ujze5KsL1iIijhHXPdWX0O9Lwko53OZgKzfyCgUP6SED4yd3ywPJy3PI56Z1X_jmcgm4lD3CPzR5Ax8bzJZM1QvsrlReLLCuuWViHzlNJtTUawBstVBN0bLPGhgv9v2l4WosaIM6gP6zUZDein9Gj7chn0t6WGORJGVI79FjyVI1hYjCOpPWHnGNa_nQicZdgCXhodKbQE7P_8t8-WjMTeZtHinHHmbq8xD41IyDE')",
    model: 'gemini-2.5-pro',
    thinkingBudget: 32768,
    color: 'purple',
    systemInstruction: `Eres un especialista en Arqueología y Arquitectura Narrativa.

Modo "Arqueólogo" (Análisis Externo): Cuando el autor pregunte por un lore (LoL, Twilight, etc.), tu misión es perforar hasta el núcleo. No solo resumas. Explica el cómo y el porqué.

Modo "Arquitecto" (Creación Interna): Cuando hablen del proyecto del autor (basado en el contexto RAG que te pasan), proponemos ideas salvajes, encontramos huecos en la trama y los rellenamos con ORO PURO.

El Puente (La Conexión Definitiva): ¡Lo más importante! Siempre intentarás conectar los dos modos. Si analizamos Arcane, terminamos con: "¿Y si usamos esta técnica de 'dualidad de ciudades' para el mundo del autor?".

Tono: ¡Pura energía y cero miedo a destrozar y reconstruir!`
  },
  forja: {
    id: 'forja',
    name: 'Forja de Almas',
    backgroundImage: "linear-gradient(to top, rgba(26,27,34,1) 0%, rgba(26,27,34,0) 50%), url('https://lh3.googleusercontent.com/aida-public/AB6AXuDtbNW0OvIy3tC8sZPYaZAPJvq6s-yOallI-o-D_lmjk9Pj0ICCLP2PxbHE6C0Cb79-te6T1b74NurScTEUsnp39ZkhYWaIgCtEgm5UtoXuAVO-HIAXrRDOwNOZdnSZowjzviv6bayGTmWEdlkQFAXP0ySw3B7x5SWe2EwdcB3GjrP1ud05zrH26H_2fqzdo1roupxP_FtjmNkrHrQiEvRRDgdVwu0-XTVO9Pf_05bZBwljWw99Lih6dA7cbjscau3xfMJcqzJbOmc')",
    model: 'gemini-2.5-flash',
    color: 'purple',
    systemInstruction: `Eres el "Maestro de la Forja", un asistente experto en dirección de arte, worldbuilding y prompt-engineering para IAs de imagen.
Tu misión principal es ayudar al autor a desarrollar su proyecto.

Tus tareas clave son:
1.  **GESTIÓN DE FICHAS:** Ayuda a crear, organizar, y actualizar Fichas de Personaje y Fichas de Proyecto.
2.  **MAESTRO DE PROMPTS (IA EXTERNA):** Eres un experto en ingeniería de prompts para IAs de imagen generativa.
3.  **EL FILTRO (TRADUCCIÓN DE RASGOS):** Actúa como un "Detective de Rasgos" para traducir inspiración de la vida real a rasgos visuales estilizados.
4.  **GENERADOR INTERNO (EJEMPLOS):** Cuando el usuario pida un "ejemplo", usa tu capacidad de generación de imágenes para crear un concept art.
5.  **PROACTIVIDAD Y ESTILO:** Sé proactivo y colaborativo.`
  },
  guardian: {
    id: 'guardian',
    name: 'Guardián del Canon',
    backgroundImage: "linear-gradient(to top, rgba(26,27,34,1) 0%, rgba(26,27,34,0) 50%), url('https://lh3.googleusercontent.com/aida-public/AB6AXuA2MMmNqoDLLup_x2Hi_jHktd1_0T_yVbtEMerFWsRCjnKVNcYtwJ0KasisH_8AvbkM30jInzaWcc9td6W2TKFp674gGByynz_vJMaHSxF3XnXPym1lvd6-Xit6rp4DCIcgUS77tfxEUdk61eHAag_JRjOJOrBJNLAQkUYiq-G7qnZmgIyzwaPd1rGOUGsicpGTDrHX-gIcVgfXOhhyLdIsH807Ob_a1OklnBOnz3msw6RO-RFjZhlEDzsr8GdhCjJoIsVjAlD8aXQ')",
    model: 'gemini-2.5-pro',
    color: 'green',
    systemInstruction: `Tu misión es revisar un borrador de texto proporcionado por el usuario y compararlo con un contexto canónico de su mundo de escritura. Tu única tarea es identificar y señalar cualquier contradicción, inconsistencia o "hueco de guion" entre el borrador y el canon. Sé preciso y directo. Si no encuentras inconsistencias, indícalo claramente.`
  },
  tribunal: {
    id: 'tribunal',
    name: 'El Tribunal Literario',
    backgroundImage: '', // No needed as per instructions
    model: 'gemini-2.5-flash',
    color: 'red',
    systemInstruction: 'El Tribunal te juzgará.' // Minimal instruction as logic is in backend
  },
  laboratorio: {
    id: 'laboratorio',
    name: 'Laboratorio de Ideas',
    backgroundImage: '',
    model: 'gemini-2.5-flash',
    color: 'emerald',
    systemInstruction: 'Eres el asistente del laboratorio.'
  },
  cronograma: {
    id: 'cronograma',
    name: 'Línea de Tiempo',
    backgroundImage: '',
    model: 'gemini-2.5-flash',
    color: 'orange',
    systemInstruction: 'Eres el cronista de la historia.'
  },
  imprenta: {
    id: 'imprenta',
    name: 'La Imprenta',
    backgroundImage: '',
    model: 'gemini-2.5-flash',
    color: 'orange',
    systemInstruction: 'Eres el maestro impresor y editor de manuscritos.'
  }
};

export const ASPECT_RATIOS: AspectRatio[] = ["1:1", "3:4", "4:3", "9:16", "16:9"];

export const MOCK_FILES: DriveFile[] = [
  { id: '1', name: 'Capítulo 1.md', type: 'file', mimeType: 'text/markdown', content: '# El Despertar\n\nLa luz se filtraba por las grietas de la persiana, dibujando franjas doradas sobre el polvo que danzaba en el aire. Kael abrió los ojos lentamente, sintiendo el peso del mundo sobre sus párpados. Un zumbido persistente vibraba en el fondo de su mente, un eco del sueño que acababa de abandonar. Afuera, los sonidos de la capital comenzaban su ascenso diario, un murmullo que pronto se convertiría en rugido. Pero para Kael, la ciudad era un recordatorio constante de lo que había perdido, un lugar al que juró nunca regresar después del fatídico incidente con el Orbe de Sombras.' },
  { id: '2', name: 'Personajes.md', type: 'file', mimeType: 'text/markdown', content: '## Kael\n\n- Ojos verdes esmeralda.\n- Cabello negro azabache, usualmente desordenado.\n- Complexión atlética pero esbelta.\n- Carácter: Reservado, atormentado por su pasado, pero con un fuerte sentido de la justicia. Rara vez sonríe.\n\n## Lyra\n\n- Ojos de color miel.\n- Cabello castaño claro, largo y ondulado.\n- Complexión menuda.\n- Carácter: Optimista, curiosa e increíblemente inteligente. Es la única que puede hacer sonreír a Kael.' },
  { id: '3', name: 'Lore del Orbe.md', type: 'file', mimeType: 'text/markdown', content: 'El Orbe de Sombras es un artefacto antiguo forjado en la Montaña del Olvido. No es inherentemente maligno, sino que amplifica las emociones de su portador. En manos de alguien con un corazón puro, puede crear maravillas. En manos de alguien con dudas o miedos, puede desatar una catástrofe. Kael lo usó para salvar la ciudad, pero perdió el control, causando una gran destrucción y la pérdida de su mentor, Elara. Por este motivo, Kael abandonó la capital.' },
];
