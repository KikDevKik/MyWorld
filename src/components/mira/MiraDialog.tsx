import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLayoutStore } from '../../stores/useLayoutStore';

/** Nov 2026: Mira se abre como ventana en el centro, encima del escritorio o del cuarto en que estés.
 *  Se cierra con Escape, con su X o tocando fuera. El fondo se oscurece apenas para no molestar. */
export default function MiraDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
    const wide = useLayoutStore(s => s.isArsenalWide);
    const boxRef = useRef<HTMLDivElement>(null);
    const lastFocus = useRef<Element | null>(null);
    useEffect(() => {
        lastFocus.current = document.activeElement;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Si dentro de Mira hay otra ventana abierta (p. ej. conversaciones guardadas), esa se cierra primero.
            const inner = boxRef.current?.querySelector('[data-inner-modal="true"]');
            if (inner) return;
            e.preventDefault();
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (lastFocus.current instanceof HTMLElement) lastFocus.current.focus();
        };
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-titanium-950/45 backdrop-blur-[2px] animate-in fade-in duration-200" onMouseDown={onClose} aria-hidden="true" />
            <div
                ref={boxRef}
                role="dialog"
                aria-modal="true"
                aria-label="Mira"
                className={`relative w-full ${wide ? 'max-w-[1240px]' : 'max-w-[820px]'} h-[min(86vh,880px)] rounded-2xl border border-titanium-700 bg-titanium-950 shadow-[0_30px_80px_rgba(0,0,0,0.55)] overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
            >
                {children}
            </div>
        </div>,
        document.body
    );
}

/** En modo Zen el riel está oculto: al pasar el mouse por su lugar aparece la cara de Mira para hablarle sin salir de Zen. */
export function ZenMiraButton({ onOpen }: { onOpen: () => void }) {
    return (
        <div className="fixed right-0 top-0 z-[60] w-20 h-24 flex items-start justify-center pt-4 group">
            <button type="button" onClick={onOpen} aria-label="Hablar con Mira"
                className="rounded-xl p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-200 bg-titanium-900/80 border border-titanium-700">
                <img src="/assets/mira/mira_cara_icono.png" alt="" width={40} height={40} className="w-10 h-10 mira-rim" draggable={false} />
            </button>
        </div>
    );
}
