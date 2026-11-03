import React, { useEffect, useState } from 'react';
import { MiraSprite, MiraBubble, MiraPose } from './MiraSprite';
import { getMiraPrefs } from './tips';

/** Mira dentro de un cuarto: aparece en su esquina con algo que decir del lugar, y luego se calla. */
export default function RoomMira({ pose, line, roomKey, className = 'right-5 bottom-5' }: { pose: MiraPose; line: string; roomKey: string; className?: string }) {
    const [visible, setVisible] = useState(() => getMiraPrefs().visible);
    const [open, setOpen] = useState(true);
    useEffect(() => {
        const on = (e: Event) => setVisible((e as CustomEvent).detail.visible);
        window.addEventListener('mw-mira-prefs', on);
        return () => window.removeEventListener('mw-mira-prefs', on);
    }, []);
    useEffect(() => { setOpen(true); const id = window.setTimeout(() => setOpen(false), 7000); return () => window.clearTimeout(id); }, [roomKey]);
    if (!visible) return null;
    return (
        <div className={`absolute z-30 flex items-end gap-1 pointer-events-none ${className}`}>
            {open && <div className="pointer-events-auto mb-12 max-w-[260px]"><MiraBubble tail="right" live>{line}</MiraBubble></div>}
            <button type="button" className="pointer-events-auto rounded-lg" onClick={() => setOpen(o => !o)} aria-label="Mira" aria-expanded={open}>
                <MiraSprite key={roomKey} pose={pose} />
            </button>
        </div>
    );
}
