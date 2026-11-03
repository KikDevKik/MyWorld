// Tips del Rincón de tips. Dos estantes: escribir y enfocarse.
export type Tip = { id: string; shelf: 'escribir' | 'enfocarse'; short: string; title: string; text: string };

const ES: Tip[] = [
    { id: 'mal', shelf: 'escribir', short: 'Escribe mal', title: 'Escribe la escena mal a propósito', text: 'El primer borrador solo tiene que existir. Corregir algo escrito es mucho más fácil que llenar una página vacía.' },
    { id: 'mitad', shelf: 'escribir', short: 'Mitad de frase', title: 'Termina a mitad de una frase', text: 'Si paras justo antes de saber qué viene, mañana empiezas sin pensarlo: ya sabes cómo sigue.' },
    { id: 'sentido', shelf: 'escribir', short: 'Un sentido', title: 'Un sentido por escena', text: 'Además de lo que se ve, añade un olor, un sonido o una textura. Una sola basta para que el lector entre.' },
    { id: 'dialogo', shelf: 'escribir', short: 'Diálogo', title: 'Corta la primera línea del diálogo', text: 'Muchas conversaciones empiezan con saludos que no dicen nada. Entra cuando ya pasa algo.' },
    { id: 'telefono', shelf: 'enfocarse', short: 'El teléfono', title: 'Deja el teléfono en otra habitación', text: 'Lo que no ves no te llama. Ni siquiera boca abajo: en otra habitación.' },
    { id: 'bloques', shelf: 'enfocarse', short: '25 minutos', title: 'Prueba bloques de 25 minutos', text: 'Escribe 25 minutos sin parar y descansa 5. Cuatro bloques y un descanso largo.' },
    { id: 'hora', shelf: 'enfocarse', short: 'Misma hora', title: 'Escribe siempre a la misma hora', text: 'Tu cabeza aprende la rutina. Después de unos días, sentarte a escribir cuesta menos.' },
    { id: 'descansa', shelf: 'enfocarse', short: 'Descansa', title: 'Descansar también es escribir', text: 'Cuando llevas mucho rato, levántate, toma agua y camina. Las ideas llegan cuando sueltas.' },
];
const EN: Tip[] = [
    { id: 'mal', shelf: 'escribir', short: 'Write it badly', title: 'Write the scene badly on purpose', text: 'A first draft only has to exist. Fixing something written is far easier than filling an empty page.' },
    { id: 'mitad', shelf: 'escribir', short: 'Mid-sentence', title: 'Stop in the middle of a sentence', text: 'If you stop right before you know what comes next, tomorrow you start without thinking: you already know how it goes.' },
    { id: 'sentido', shelf: 'escribir', short: 'One sense', title: 'One sense per scene', text: 'Besides what is seen, add a smell, a sound or a texture. One is enough to pull the reader in.' },
    { id: 'dialogo', shelf: 'escribir', short: 'Dialogue', title: 'Cut the first line of dialogue', text: 'Many conversations open with greetings that say nothing. Come in when something is already happening.' },
    { id: 'telefono', shelf: 'enfocarse', short: 'Your phone', title: 'Leave your phone in another room', text: 'What you can’t see can’t call you. Not face down: in another room.' },
    { id: 'bloques', shelf: 'enfocarse', short: '25 minutes', title: 'Try 25-minute blocks', text: 'Write for 25 minutes without stopping and rest for 5. Four blocks, then a long break.' },
    { id: 'hora', shelf: 'enfocarse', short: 'Same time', title: 'Write at the same time every day', text: 'Your mind learns the routine. After a few days, sitting down to write gets easier.' },
    { id: 'descansa', shelf: 'enfocarse', short: 'Rest', title: 'Resting is part of writing', text: 'When you have been at it a long while, get up, drink some water and walk. Ideas come when you let go.' },
];
export const getTips = (lang: string): Tip[] => (lang === 'es' ? ES : EN);

// Preferencias de Mira (se guardan en este navegador)
export type MiraPrefs = { visible: boolean; tipsOnWake: boolean; ritual: boolean };
const KEY = 'mw-mira-prefs';
export function getMiraPrefs(): MiraPrefs {
    try { return { visible: true, tipsOnWake: true, ritual: true, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
    catch { return { visible: true, tipsOnWake: true, ritual: true }; }
}
export function setMiraPrefs(p: Partial<MiraPrefs>) {
    const next = { ...getMiraPrefs(), ...p };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
    window.dispatchEvent(new CustomEvent('mw-mira-prefs', { detail: next }));
    return next;
}
