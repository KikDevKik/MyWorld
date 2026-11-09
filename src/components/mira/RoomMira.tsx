import React, { useEffect, useState } from 'react';
import { MiraSprite, MiraBubble, MiraPose } from './MiraSprite';
import { getMiraPrefs } from './tips';

/** Mira dentro de un cuarto: aparece con algo que decir del lugar y luego se calla.
 *  Nov 2026: cada cuarto elige su lado (side) para no tapar lo importante; al callarse pasa a una pose de reposo. */
const REST: Partial<Record<MiraPose, MiraPose>> = { senalando: 'esperando', saludo: 'esperando', aplauso: 'esperando', sorprendidaAnim: 'neutral' };

export default function RoomMira({ pose, line, roomKey, className = 'right-5 bottom-5', side = 'right' }: { pose: MiraPose; line: string; roomKey: string; className?: string; side?: 'left' | 'right' }) {
    const [visible, setVisible] = useState(() => getMiraPrefs().visible);
    const [open, setOpen] = useState(true);
    useEffect(() => {
        const on = (e: Event) => setVisible((e as CustomEvent).detail.visible);
        window.addEventListener('mw-mira-prefs', on);
        return () => window.removeEventListener('mw-mira-prefs', on);
    }, []);
    useEffect(() => { setOpen(true); const id = window.setTimeout(() => setOpen(false), 7000); return () => window.clearTimeout(id); }, [roomKey]);
    if (!visible) return null;
    const shown = open ? pose : (REST[pose] || pose);
    const bubble = open && (
        <div className="pointer-events-auto mb-12 max-w-[260px]"><MiraBubble tail={side === 'left' ? 'left' : 'right'} live>{line}</MiraBubble></div>
    );
    const sprite = (
        <button type="button" className="pointer-events-auto rounded-lg" onClick={() => setOpen(o => !o)} aria-label="Mira" aria-expanded={open}>
            <MiraSprite key={`${roomKey}-${shown}`} pose={shown} />
        </button>
    );
    return (
        // Nov 2026: en el celular no cabe: tapaba las opciones del cuarto. Mira sigue a un toque en el riel.
        <div className={`absolute z-30 hidden sm:flex items-end gap-1 pointer-events-none ${className}`}>
            {side === 'left' ? <>{sprite}{bubble}</> : <>{bubble}{sprite}</>}
        </div>
    );
}
