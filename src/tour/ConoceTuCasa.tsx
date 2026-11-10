// Nov 2026: «Conoce tu casa». Los 9 cuartos de MyWorld, cuáles ya descubriste y un «Muéstrame»
// para que Mira repita la explicación de cualquiera.
import React from 'react';
import { ROOMS, RoomId } from './tips';
import { useTourStore, roomDiscovered, discoveredCount } from './tourStore';

export const TOUR_GOTO_EVENT = 'mw-tour-goto';

/** Lleva al cuarto y pide a Mira que lo explique (sin límites ni esperas). */
export function showRoom(room: RoomId) {
    window.dispatchEvent(new CustomEvent(TOUR_GOTO_EVENT, { detail: { room } }));
    const tip = ROOMS.find(r => r.id === room)?.firstTip;
    if (tip) setTimeout(() => useTourStore.getState().show(tip), 700);
}

export default function ConoceTuCasa({ onNavigate }: { onNavigate?: () => void }) {
    const { seen, disabled, setDisabled, reset } = useTourStore();
    const n = discoveredCount(seen);
    return (
        <section aria-labelledby="casa-title" className="flex flex-col gap-4 font-sans">
            <div>
                <h2 id="casa-title" className="font-serif text-[22px] leading-tight text-titanium-50">Has descubierto {n} de {ROOMS.length} cuartos</h2>
                <div className="mt-2 flex gap-1.5" aria-hidden="true">
                    {ROOMS.map(r => <span key={r.id} className={`h-1.5 flex-1 rounded-full ${roomDiscovered(seen, r.id) ? 'bg-mira' : 'bg-titanium-800'}`} />)}
                </div>
                <p className="mt-2 text-[14px] text-titanium-400">Cada herramienta es un cuarto. Te explico cada uno la primera vez que entras; aquí puedes pedirme que te lo muestre otra vez.</p>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROOMS.map(r => {
                    const found = roomDiscovered(seen, r.id);
                    return (
                        <li key={r.id} className={`flex items-center gap-3 rounded-xl border p-3 ${found ? 'border-titanium-700 bg-titanium-900' : 'border-titanium-800 border-dashed'}`}>
                            <img src={`/assets/objetos/${r.obj}.png`} alt="" width={48} height={48}
                                className={`w-12 h-12 shrink-0 ${found ? '' : 'grayscale opacity-40'}`} style={{ imageRendering: 'pixelated' }} />
                            <div className="min-w-0 flex-1">
                                <p className="font-serif text-[15px] text-titanium-100">{r.nombre}</p>
                                <p className="text-[12.5px] leading-snug text-titanium-400">{found ? r.frase : 'Todavía no has entrado.'}</p>
                            </div>
                            <button onClick={() => { onNavigate?.(); showRoom(r.id); }}
                                className="shrink-0 rounded-lg border border-titanium-700 px-3 py-1.5 text-[12.5px] text-titanium-200 hover:border-mira/60 hover:text-titanium-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                {found ? 'Muéstrame' : 'Llévame'}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-titanium-400">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={!disabled} onChange={e => setDisabled(!e.target.checked)} className="accent-[var(--color-mira)]" />
                    Que Mira me explique cada cuarto al entrar
                </label>
                {n > 0 && <button onClick={reset} className="underline underline-offset-4 hover:text-titanium-100">Empezar el recorrido de nuevo</button>}
            </div>
        </section>
    );
}
