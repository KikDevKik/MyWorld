import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { MiraSprite } from '../mira/MiraSprite';

// Nov 2026: la guía usa la casa (un cuarto por herramienta, con su objeto pixel) en vez de las herramientas antiguas.
interface GuidePanelProps {
    onClose: () => void;
}

type Room = { obj: string; es: [string, string]; en: [string, string] };
const ROOMS: Room[] = [
    { obj: 'escritorio', es: ['El escritorio', 'Escribes tu capítulo sin distracciones, con modo enfoque y meta del día.'], en: ['The desk', 'Write your chapter without distractions, with focus mode and a daily goal.'] },
    { obj: 'sillon', es: ['Mira', 'Pregúntale por un personaje, un lugar o una escena: ya conoce tu canon y te dice de dónde saca cada dato.'], en: ['Mira', 'Ask her about a character, a place or a scene: she knows your canon and tells you where each fact comes from.'] },
    { obj: 'lupa', es: ['El estudio', 'Revisa el capítulo abierto y marca lo que choca con tu canon y lo que conviene pulir.'], en: ['The study', 'Reviews the open chapter and flags what clashes with your canon and what to polish.'] },
    { obj: 'planos', es: ['La mesa del arquitecto', 'Planeas con el Arquitecto: las partes del libro, los hilos de la trama y las dudas por resolver.'], en: ["The architect's table", 'Plan with the Architect: the parts of your book, plot threads and open questions.'] },
    { obj: 'telescopio', es: ['El observatorio', 'Tu mundo como un mapa de conexiones entre personajes, lugares y reglas.'], en: ['The observatory', 'Your world as a map of connections between characters, places and rules.'] },
    { obj: 'fichero', es: ['El fichero', 'Una ficha por personaje. Mira te ayuda a completarlas con lo que ya escribiste.'], en: ['The card file', 'One card per character. Mira helps you fill them in from what you already wrote.'] },
    { obj: 'frasco_luciernagas', es: ['El frasco de ideas', '«¿Qué pasaría si…?». Nada de aquí cambia tu historia hasta que lo llevas al canon.'], en: ['The idea jar', '"What if…?". Nothing here changes your story until you bring it into the canon.'] },
    { obj: 'imprenta', es: ['La imprenta', 'Convierte tus capítulos en un libro: Word, EPUB o PDF.'], en: ['The press', 'Turn your chapters into a book: Word, EPUB or PDF.'] },
];

export default function GuidePanel({ onClose }: GuidePanelProps) {
    const { currentLanguage } = useLanguageStore();
    const es = currentLanguage === 'es';
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        closeRef.current?.focus();
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-labelledby="guide-title"
                className="relative w-full max-w-xl bg-titanium-900 border border-titanium-700 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-titanium-800">
                    <div>
                        <h2 id="guide-title" className="font-serif text-xl font-semibold text-titanium-100">{es ? 'La casa de MyWorld' : 'The MyWorld house'}</h2>
                        <p className="text-sm text-titanium-400 mt-1">{es ? 'Cada herramienta es un cuarto. Mira tiene algo suyo en cada uno.' : 'Each tool is a room. Mira has something of hers in each one.'}</p>
                    </div>
                    <button ref={closeRef} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}
                        className="p-2 rounded-lg text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <ul className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[62vh] overflow-y-auto custom-scrollbar">
                    {ROOMS.map(r => {
                        const [name, desc] = es ? r.es : r.en;
                        return (
                            <li key={r.obj} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-titanium-800/60">
                                <img src={`/assets/objetos/${r.obj}.png`} alt="" width={48} height={48}
                                    className="w-12 h-12 shrink-0" style={{ imageRendering: 'pixelated' }} />
                                <div className="min-w-0">
                                    <p className="font-serif text-[15px] font-semibold text-titanium-100">{name}</p>
                                    <p className="text-[13px] text-titanium-400 mt-0.5 leading-snug">{desc}</p>
                                </div>
                            </li>
                        );
                    })}
                </ul>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-titanium-800 bg-titanium-950/40">
                    <MiraSprite pose="contenta" face label="Mira" className="shrink-0" />
                    <p className="text-sm text-titanium-300 flex-1">{es ? '¿Buscas consejos para escribir o enfocarte?' : 'Looking for writing or focus tips?'}</p>
                    <button type="button" onClick={() => { onClose(); window.dispatchEvent(new Event('OPEN_TIPS')); }}
                        className="text-sm font-semibold text-mira hover:underline underline-offset-4">
                        {es ? 'Abrir el rincón de tips' : 'Open the tips corner'}
                    </button>
                </div>
            </div>
        </div>
    );
}
