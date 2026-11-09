// Nov 2026: lecciones cortas de la biblioteca. Ejemplos inventados (no citas de libros).
export interface Lesson { id: string; topic: string; title: string; summary: string; body: { h?: string; p: string }[]; example?: { label: string; text: string }[]; voz?: string; hint?: string; craftId?: string }

export const LESSONS: Lesson[] = [
    {
        id: 'tercera_cercana', topic: 'tercera_cercana', voz: 'tercera_cercana',
        title: 'Tercera persona cercana: por dónde empezar',
        summary: 'Cuentas en «ella», pero desde dentro de ella: el lector ve, oye y piensa lo que ella, con sus palabras.',
        body: [
            { h: 'Punto de partida: elige una cámara y no la sueltes', p: 'Antes de cada escena, decide por los ojos de quién va. Durante esa escena solo cuentas lo que esa persona puede ver, oír, recordar o suponer. Si otro personaje siente algo, el lector lo sabe por un gesto que ella nota, no porque el narrador se meta en la cabeza del otro.' },
            { h: 'Quita los filtros', p: 'Los «vio», «sintió», «pensó», «se dio cuenta» alejan al lector: lo ponen a mirar al personaje desde fuera. En vez de «Lía sintió que el agua estaba fría», escribe «El agua estaba helada». Ya sabemos que es ella quien la siente.' },
            { h: 'Sus palabras, no las tuyas', p: 'El narrador usa el vocabulario del personaje. Una niña del campo no ve «un cielo cerúleo»: ve «el cielo de cuando va a llover». Si una palabra no la diría ella, sobra o se cambia.' },
            { h: 'Los pensamientos van sin comillas', p: 'Puedes pasar del relato al pensamiento sin avisar: «Mamá tardaba. Seguro se le olvidó otra vez.» La segunda frase es ella pensando, en pasado y sin cursiva. Eso es lo que hace la cercanía.' },
            { h: 'La distancia se mueve', p: 'No todo va pegado. Al abrir una escena puedes alejarte un poco (dónde estamos, qué hora es) y acercarte cuando llega lo importante. Lo que no se hace es cambiar de cabeza a mitad de escena.' },
            { h: 'Cómo revisarlo', p: 'Relee una escena y marca cada frase que ella no podría saber. Cada marca es un salto de punto de vista: o lo cambias por algo que ella note, o lo dejas para otra escena contada desde otro personaje.' },
        ],
        example: [
            { label: 'Lejos (narrador que mira)', text: 'Lía estaba nerviosa. Pensó que su padre se enojaría al ver la cerca rota y sintió miedo cuando oyó la camioneta.' },
            { label: 'Cerca (desde dentro de ella)', text: 'La cerca seguía rota. Lía la miró como si así se fuera a arreglar sola. Entonces sonó la camioneta, ese motor que tosía, y se le cerró el estómago.' },
        ],
    },
    {
        id: 'primera', topic: 'primera', voz: 'primera',
        title: 'Que la primera persona tenga voz',
        summary: 'En primera persona, el narrador no solo cuenta: elige qué contar y cómo. Esa elección es el personaje.',
        body: [
            { h: 'Punto de partida', p: 'Escribe tres frases sobre algo cotidiano (despertarse, el desayuno) como lo diría tu personaje a un amigo. Si suenan como las diría cualquiera, todavía no tiene voz.' },
            { h: 'Lo que calla', p: 'Un narrador en primera persona no lo dice todo. Lo que evita nombrar o cuenta con prisa dice tanto como lo que cuenta.' },
            { h: 'Cuidado con el «yo» en cada frase', p: '«Yo fui, yo vi, yo sentí» cansa. Varía: empieza por lo que ve o por lo que le pasa, y deja que el «yo» se sobreentienda.' },
        ],
        example: [
            { label: 'Sin voz', text: 'Me desperté temprano. Desayuné y fui a la escuela.' },
            { label: 'Con voz', text: 'El gallo de don Rafa tiene algo personal conmigo: a las cinco ya estaba despierta y con hambre.' },
        ],
    },
    {
        id: 'narradora', topic: 'narradora',
        title: 'Narrar en primera persona desde la adultez',
        summary: 'La narradora ya es mayor y cuenta su infancia. ¿Cómo suenan los pensamientos de la niña y los diálogos que «recuerda»?',
        body: [
            { h: 'Hay dos «yo»', p: 'El yo que narra (la mayor, que ya sabe cómo termina todo) y el yo que vive (la niña, que no sabe nada). La narradora es siempre la mayor, pero puede acercarse tanto a la niña que el lector casi olvida que alguien está recordando.' },
            { h: 'La distancia se regula', p: 'Casi todo el libro se cuenta pegado a la niña: lo que ella veía, entendía y sentía entonces, con sus palabras. La voz mayor aparece poco y en momentos elegidos: para adelantar algo («todavía no sabía que…»), para un comentario con humor o para entender algo que la niña no podía.' },
            { h: 'Los diálogos no son un problema', p: 'El lector acepta un pacto: nadie cree que la narradora recuerde cada palabra, y no hace falta explicarlo. Las escenas se cuentan como si pasaran ahora, con su diálogo completo. Si quieres, una vez en el libro puede admitirlo («no recuerdo qué le dije; seguro algo tonto») y eso la hace más creíble.' },
            { h: 'Los pensamientos de la niña', p: 'Van en pasado y con la lógica de una niña: «pensé que si no lloraba, mamá no se iría». La narradora no los corrige; deja que el lector vea la distancia entre lo que la niña creía y lo que era verdad.' },
            { h: 'La voz crece con ella', p: 'Si el libro avanza años, la voz puede madurar: frases más simples y concretas en la niñez, más ironía y reflexión cuando es adolescente. El lector siente que creció sin que se lo digas.' },
            { h: 'Desde dónde recuerda', p: 'Decide en qué momento está la narradora mientras cuenta. Si cuenta desde el final del propio libro, la última escena cierra el círculo: el lector llega justo al lugar desde donde ella empezó a recordar.' },
        ],
        example: [
            { label: 'Pegado a la niña', text: 'El abuelo dijo que las vacas sabían cuándo iba a llover. Yo me quedé toda la tarde mirándolas para que me avisaran.' },
            { label: 'La voz mayor asoma', text: 'Esa tarde no llovió. Las vacas, ahora lo sé, solo tenían hambre.' },
        ],
    },
    {
        id: 'presentar', topic: 'presentar',
        title: 'Presentar a muchos personajes sin perder al lector',
        summary: 'Cuando entran cinco nombres de golpe, el lector no recuerda a ninguno.',
        body: [
            { h: 'Uno a la vez', p: 'Escalona las entradas: cada personaje necesita un momento propio antes de que llegue el siguiente. Si la escena exige a muchos, que solo dos o tres tengan nombre; el resto puede ser «los primos» hasta que importen.' },
            { h: 'Nombre + rasgo + relación', p: 'La primera vez, ata el nombre a un rasgo que se vea o se oiga y a lo que es para la protagonista: «Tomi, el que siempre olía a leña y me robaba el pan». Ese gancho es lo que el lector recuerda.' },
            { h: 'Que hagan algo', p: 'Un personaje se queda en la memoria por lo que hace en su primera escena, no por su descripción. Dale una acción pequeña que lo defina.' },
        ],
        example: [{ label: 'Gancho', text: 'Lía llegó tarde, como siempre, con las trenzas a medio hacer y una rana en el bolsillo.' }],
    },
    {
        id: 'dialogo', topic: 'dialogo',
        title: 'Que siempre se sepa quién habla',
        summary: 'En una escena con tres o más voces, el lector no debería releer para saber quién dijo qué.',
        body: [
            { h: 'Acotaciones y gestos', p: 'Alterna «dijo» con un gesto del que habla antes o después de la línea: si alguien deja la taza y habla, ya sabemos quién es sin «dijo».' },
            { h: 'Voces distintas', p: 'Cada personaje habla a su manera: uno pregunta todo, otro responde con una sola palabra, otro siempre bromea. Si tapas los nombres y aún sabes quién habla, la escena funciona.' },
            { h: 'Pocos a la vez', p: 'Aunque haya seis en la mesa, que la conversación la lleven dos o tres. Los demás reaccionan con gestos.' },
        ],
    },
    {
        id: 'relacion', topic: 'relacion',
        title: 'Mostrar una relación de años',
        summary: 'Una pareja o unos amigos de toda la vida no se hablan como si se acabaran de conocer.',
        body: [
            { h: 'Lo que no se dicen', p: 'Las personas que se conocen hace años se entienden a medias palabras: terminan las frases del otro, tienen bromas que nadie más entiende, saben qué le molesta al otro sin preguntarlo.' },
            { h: 'Costumbres', p: 'Un gesto repetido dice más que un párrafo de historia: él siempre le sirve el café sin preguntar; ella siempre le corrige la misma palabra.' },
            { h: 'Roces pequeños', p: 'Los años también dejan discusiones viejas. Una mirada cuando sale cierto tema muestra una historia compartida.' },
        ],
        example: [{ label: 'Sin explicar', text: '—No digas nada —dijo ella antes de que él abriera la boca. Él no dijo nada, pero le dejó el pan más tostado, el que a ella le gustaba.' }],
    },
    {
        id: 'dilema', topic: 'dilema',
        title: 'Un dilema que duela',
        summary: 'Elegir entre algo bueno y algo malo no es un dilema. Elegir entre dos cosas que el personaje quiere, sí.',
        body: [
            { h: 'Dos bienes', p: 'Quedarse con sus abuelos o irse con sus padres; decir la verdad o proteger a su amigo. Cada opción le cuesta algo que ama.' },
            { h: 'Que el lector entienda las dos', p: 'Antes de la decisión, muestra por qué cada opción importa. Si el lector duda con el personaje, el dilema funciona.' },
            { h: 'Que la decisión cambie algo', p: 'Después de elegir, el mundo del personaje ya no es el mismo. Si nada cambia, no era un dilema.' },
        ],
    },
    {
        id: 'estudio', topic: 'estudio',
        title: 'Estudiar mientras ves series',
        summary: 'Ver algo para relajarte también puede enseñarte, si miras una cosa a la vez.',
        body: [
            { h: 'Una sola pregunta', p: 'Elige qué mirar antes de empezar: cómo presentan a un personaje, cómo cortan una escena, cómo arman un dilema. Si miras todo, no ves nada.' },
            { h: 'Pausa y anota', p: 'Cuando algo te atrape, pausa y escribe una línea: «me enganchó porque…». Esas notas valen más que cualquier manual porque salen de lo que a ti te mueve.' },
            { h: 'Llévalo a tu historia', p: 'Pregúntate cómo se vería esa técnica con tus personajes. En «Practicar» puedes pedirle a Mira un ejercicio con la técnica que encontraste.' },
        ],
    },
];
