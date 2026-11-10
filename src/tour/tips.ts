// Nov 2026: el tutorial progresivo. Mira enseña la casa poco a poco: cada herramienta se explica la
// primera vez que la usas, una ayuda a la vez y nunca mientras escribes. Ver TourHost y tourStore.

export type RoomId = 'escritorio' | 'mira' | 'mesa' | 'observatorio' | 'fichero' | 'frasco' | 'estudio' | 'biblioteca' | 'imprenta';

export interface Room { id: RoomId; nombre: string; obj: string; frase: string; firstTip: string }

// Los 9 cuartos de la casa, en el orden en que suele descubrirlos alguien nuevo.
export const ROOMS: Room[] = [
    { id: 'escritorio', nombre: 'El escritorio', obj: 'escritorio', frase: 'Donde escribes. Yo guardo y cuento tus palabras.', firstTip: 'escritorio.guardado' },
    { id: 'mira', nombre: 'Mira', obj: 'sillon', frase: 'Pregúntame por tu mundo; te digo de dónde saco cada cosa.', firstTip: 'mira.chat' },
    { id: 'mesa', nombre: 'La mesa del arquitecto', obj: 'planos', frase: 'Planeas con el Arquitecto lo que falta decidir.', firstTip: 'mesa.conversacion' },
    { id: 'observatorio', nombre: 'El observatorio', obj: 'telescopio', frase: 'Tu mundo como un mapa de conexiones.', firstTip: 'mesa.mapa' },
    { id: 'fichero', nombre: 'El fichero', obj: 'fichero', frase: 'Una ficha por personaje, completada contigo.', firstTip: 'mesa.personajes' },
    { id: 'frasco', nombre: 'El frasco de ideas', obj: 'frasco_luciernagas', frase: '«¿Qué pasaría si…?» sin tocar tu historia.', firstTip: 'mesa.ideas' },
    { id: 'estudio', nombre: 'El estudio', obj: 'lupa', frase: 'Te leo el capítulo y te digo qué corregir.', firstTip: 'estudio.reporte' },
    { id: 'biblioteca', nombre: 'La biblioteca', obj: 'libros', frase: 'Lecciones y ejercicios hechos para ti.', firstTip: 'biblioteca.intro' },
    { id: 'imprenta', nombre: 'La imprenta', obj: 'imprenta', frase: 'Tus capítulos convertidos en libro.', firstTip: 'imprenta.intro' },
];

export interface Tip {
    id: string;
    room: RoomId;
    title: string;          // pocas palabras
    body: string;           // máximo dos frases, en primera persona (habla Mira)
    targets?: string[];     // valores de data-tour a resaltar; el primero visible gana
    clip?: string;          // nombre del clip en /tour (webm + jpg); se usa cuando lo que explico aún no se ve
    entry?: boolean;        // se pide al entrar a un cuarto: sale de inmediato (si no, espera su turno)
}

export const TIPS: Tip[] = [
    { id: 'escritorio.guardado', room: 'escritorio', entry: true, targets: ['save'],
        title: 'Escribe tranquilo, yo guardo',
        body: 'Cada cambio se guarda solo en tu Drive. Aquí abajo te aviso cuando ya quedó guardado.' },
    { id: 'escritorio.documentos', room: 'escritorio', targets: ['docs', 'dock-archivos'],
        title: 'Tu proyecto, a mano',
        body: 'Aquí están tus documentos. Lo que está en Canon (personajes, lugares, capítulos) es lo que tomo como verdad cuando te respondo.' },
    { id: 'escritorio.meta', room: 'escritorio', targets: ['meta'],
        title: 'Tu meta del día',
        body: 'Cuento lo que escribes hoy; lo que pegas de golpe no suma. Cuando llegues a la meta, te aviso para que descanses.' },
    { id: 'mira.chat', room: 'mira', entry: true, targets: ['mira-input'], clip: 'mira',
        title: 'Pregúntame por tu mundo',
        body: 'Leo tu canon antes de responder y te digo de qué documento saco cada cosa. Si algo te sirve, guárdalo como nota; nunca escribo tu capítulo por ti.' },
    { id: 'mesa.conversacion', room: 'mesa', entry: true, targets: ['tab-conversacion'], clip: 'mesa',
        title: 'Aquí se planea',
        body: 'Cuéntale al Arquitecto qué quieres resolver. Arma una agenda de puntos por decidir y los va marcando contigo.' },
    { id: 'mesa.mapa', room: 'observatorio', entry: true, targets: ['mapa-sugerir', 'tab-mapa'], clip: 'mapa',
        title: 'Tu mundo como mapa',
        body: 'Escaneo tu canon y dibujo quién se relaciona con quién. «Sugerir conexiones» propone ideas, y ninguna entra a tu historia sin ti.' },
    { id: 'mesa.personajes', room: 'fichero', entry: true, targets: ['personajes-lista', 'tab-personajes'], clip: 'personajes',
        title: 'El fichero',
        body: 'Elige un personaje: comparo su ficha con lo que dice tu manuscrito y te pregunto lo que falta. Tú apruebas antes de guardar.' },
    { id: 'mesa.ideas', room: 'frasco', entry: true, targets: ['ideas-input', 'tab-quepasa'],
        title: '¿Qué pasaría si…?',
        body: 'Pregunta sin miedo: nada de aquí cambia tu historia. Lo que quieras conservar lo guardo en Recursos.' },
    { id: 'estudio.sugerencia', room: 'estudio', targets: ['dock-estudio'],
        title: '¿Te leo el capítulo?',
        body: 'Tu capítulo ya tiene cuerpo. En el estudio te digo qué funciona y qué corregir, con la cita exacta.' },
    { id: 'estudio.reporte', room: 'estudio', entry: true, targets: ['reporte-generar'], clip: 'estudio',
        title: 'Así te leo',
        body: 'Pide el reporte cuando termines un capítulo. Cada punto trae la cita para ir al lugar exacto, y abajo puedes pedir la revisión del canon.' },
    { id: 'biblioteca.intro', room: 'biblioteca', entry: true, targets: ['biblioteca-tabs'],
        title: 'Aprender mientras escribes',
        body: 'En «Para ti» guardo lecciones hechas con lo que noto en tu escritura. En «Practicar» hay ejercicios que no tocan tu libro.' },
    { id: 'imprenta.intro', room: 'imprenta', entry: true, targets: ['imprenta-export'], clip: 'imprenta',
        title: 'Tu libro, listo para compartir',
        body: 'Elige los capítulos y el diseño, y exporta en PDF, Word o EPUB. También puedes registrar tu autoría.' },
];

export const TIP_BY_ID: Record<string, Tip> = Object.fromEntries(TIPS.map(t => [t.id, t]));
