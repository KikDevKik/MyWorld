// Nov 2026: el globo de Mira del tutorial progresivo. Una ayuda a la vez, sin bloquear la pantalla:
// si lo que explico está a la vista, lo ilumino; si todavía no se ve, muestro un clip corto.
// Nunca aparece mientras escribes: espera a que hagas una pausa.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTourStore, startTourSync } from './tourStore';
import { TIP_BY_ID } from './tips';
import { useIsNarrow } from '../hooks/useMediaQuery';

const IDLE_MS = 6000;
const W = 340;

function findTarget(targets?: string[]): HTMLElement | null {
    for (const t of targets || []) {
        const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${t}"]`));
        const el = els.find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight; });
        if (el) return el;
    }
    return null;
}
const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function TourHost() {
    const { active, forced, done, snooze, setDisabled } = useTourStore();
    const tip = active ? TIP_BY_ID[active] : null;
    const narrow = useIsNarrow();
    const [ready, setReady] = useState(false);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const [clipOk, setClipOk] = useState(true);
    const lastKey = useRef(0);
    const bubbleRef = useRef<HTMLDivElement>(null);

    useEffect(() => { startTourSync(); }, []);
    useEffect(() => {
        const k = () => { lastKey.current = Date.now(); };
        window.addEventListener('keydown', k, true);
        return () => window.removeEventListener('keydown', k, true);
    }, []);

    // Espera una pausa en la escritura antes de aparecer (salvo si la pediste con «Muéstrame»).
    useEffect(() => {
        setReady(false); setClipOk(true);
        if (!tip) return;
        let timer: any;
        const check = () => {
            if (forced || Date.now() - lastKey.current >= IDLE_MS) setReady(true);
            else timer = setTimeout(check, 1500);
        };
        timer = setTimeout(check, forced ? 250 : 900);
        return () => clearTimeout(timer);
    }, [tip?.id, forced]);

    // Sigue al elemento que explico (la pantalla puede moverse, abrir paneles o cambiar de tamaño).
    useLayoutEffect(() => {
        if (!tip || !ready) { setRect(null); return; }
        let raf = 0, last = '';
        const tick = () => {
            const el = findTarget(tip.targets);
            const r = el?.getBoundingClientRect() || null;
            const key = r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}` : '';
            if (key !== last) { last = key; setRect(r); }
            raf = window.setTimeout(tick, 300) as any;
        };
        tick();
        return () => clearTimeout(raf);
    }, [tip?.id, ready]);

    useEffect(() => {
        if (!tip || !ready) return;
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') snooze(); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [tip?.id, ready]);

    if (!tip || !ready) return null;

    // El clip va cuando lo que explico todavía no está en pantalla (o si la pediste desde «Conoce tu casa»).
    const showClip = !!tip.clip && clipOk && (!rect || forced);
    const pad = 6;
    let style: React.CSSProperties;
    if (narrow) {
        style = { left: 12, right: 12, bottom: 'calc(76px + env(safe-area-inset-bottom))' };
    } else if (rect) {
        const h = bubbleRef.current?.offsetHeight || (showClip ? 380 : 200);
        const below = rect.bottom + 14 + h < window.innerHeight;
        const top = below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - h);
        const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), window.innerWidth - W - 12);
        style = { top, left, width: W };
    } else {
        style = { right: 88, bottom: 56, width: W };
    }

    return (
        <>
            {rect && (
                <div aria-hidden="true" className="fixed z-[180] pointer-events-none rounded-xl ring-2 ring-mira/80 transition-all duration-300 motion-reduce:transition-none"
                    style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: '0 0 0 9999px rgba(10,9,17,0.45)' }} />
            )}
            <div ref={bubbleRef} role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body"
                className="fixed z-[181] rounded-2xl border border-mira/50 bg-titanium-900 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none"
                style={style}>
                <div className="flex items-start gap-3">
                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={40} height={40} className="w-10 h-10 shrink-0 mira-rim" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0">
                        <h2 id="tour-title" className="font-serif text-[16px] leading-snug text-titanium-50">{tip.title}</h2>
                        <p id="tour-body" className="mt-1 text-[14px] leading-relaxed text-titanium-300 text-pretty">{tip.body}</p>
                    </div>
                </div>
                {showClip && (
                    <div className="mt-3 overflow-hidden rounded-lg border border-titanium-800 bg-titanium-950 aspect-[16/10]">
                        {reduceMotion()
                            ? <img src={`/tour/${tip.clip}.jpg`} alt="" className="w-full h-full object-cover" onError={() => setClipOk(false)} />
                            : <video src={`/tour/${tip.clip}.webm`} poster={`/tour/${tip.clip}.jpg`} autoPlay muted loop playsInline aria-hidden="true"
                                className="w-full h-full object-cover" onError={() => setClipOk(false)} />}
                    </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                    <button onClick={done} className="rounded-lg bg-coral text-on-coral px-4 py-2 text-[13px] font-semibold hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">Entendido</button>
                    {!forced && <button onClick={snooze} className="rounded-lg px-3 py-2 text-[13px] text-titanium-300 hover:bg-titanium-800 hover:text-titanium-100">Ahora no</button>}
                    {!forced && <button onClick={() => setDisabled(true)} className="ml-auto text-[12px] text-titanium-500 hover:text-titanium-200 underline underline-offset-4">No más ayudas</button>}
                </div>
            </div>
        </>
    );
}
