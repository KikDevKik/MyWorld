import React, { useEffect, useRef, useState } from 'react';

// Sprites de Mira (pixel art). Cada tira es una fila de cuadros del mismo tamaño.
// big = cuadros de 144×144 (PixelLab); small = 96×128 (tanda 1).
type SpriteDef = { file: string; w: number; h: number; frames: number; fps: number; loop: boolean; loopFrom?: number };

const S = (file: string, frames: number, fps: number, loop: boolean, loopFrom?: number): SpriteDef => ({ file: `/assets/mira/${file}`, w: 96, h: 128, frames, fps, loop, loopFrom });
const B = (file: string, frames: number, fps: number, loop: boolean, loopFrom?: number): SpriteDef => ({ file: `/assets/mira/${file}`, w: 144, h: 144, frames, fps, loop, loopFrom });

export const MIRA_SPRITES = {
    neutral: S('mira_neutral_4f.png', 4, 4, true),
    pensativa: S('mira_pensativa_4f.png', 4, 3, true),
    leyendo: S('mira_leyendo_4f.png', 4, 3, true),
    dormida: S('mira_dormida_6f.png', 6, 3, true),
    despertando: S('mira_despertando_6f.png', 6, 8, false),
    celebrando: S('mira_celebrando_8f.png', 8, 12, true),
    sorprendidaAnim: S('mira_sorprendida_6f.png', 6, 12, false),
    contenta: S('mira_contenta.png', 1, 1, false),
    firme: S('mira_firme.png', 1, 1, false),
    preocupada: S('mira_preocupada.png', 1, 1, false),
    sorprendida: S('mira_sorprendida.png', 1, 1, false),
    ojo: S('mira_ojo.png', 1, 1, false),
    uy: S('mira_uy.png', 1, 1, false),
    saludo: B('mira_saludo_9f.png', 9, 10, false),
    caminar: B('mira_caminar_8f.png', 8, 10, true),
    senalando: B('mira_senalando_9f.png', 9, 10, false),
    esperando: B('mira_esperando_8f.png', 8, 6, true),
    aplauso: B('mira_aplauso_9f.png', 9, 10, false),
    sentada: B('mira_sentarse_9f.png', 9, 3, true, 5),
    sentarse: B('mira_sentarse_9f.png', 9, 8, false),
    avion: B('mira_avion_9f.png', 9, 10, false),
    salto: B('mira_salto_7f.png', 7, 10, false),
    escribiendo: B('mira_escribiendo_9f.png', 9, 8, true, 4),
} as const;

export type MiraPose = keyof typeof MIRA_SPRITES;

interface Props {
    pose: MiraPose;
    scale?: 1 | 2;
    label?: string;          // texto para lectores de pantalla; sin label = decorativo
    className?: string;
    style?: React.CSSProperties;
    flip?: boolean;
    onEnd?: () => void;      // al terminar una animación que no se repite
    /** recorta solo la cara (para avatares junto a un globo) */
    face?: boolean;
}

const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const MiraSprite: React.FC<Props> = ({ pose, scale = 1, label, className = '', style, flip, onEnd, face }) => {
    const def = MIRA_SPRITES[pose];
    const [frame, setFrame] = useState(def.loopFrom && !def.loop ? 0 : 0);
    const endRef = useRef(onEnd);
    endRef.current = onEnd;

    useEffect(() => {
        setFrame(0);
        if (def.frames <= 1) return;
        if (reduceMotion()) { setFrame(def.loop ? (def.loopFrom ?? 0) : def.frames - 1); return; }
        let f = 0;
        const id = window.setInterval(() => {
            f += 1;
            if (f >= def.frames) {
                if (def.loop) f = def.loopFrom ?? 0;
                else { f = def.frames - 1; window.clearInterval(id); endRef.current?.(); }
            }
            setFrame(f);
        }, 1000 / def.fps);
        return () => window.clearInterval(id);
    }, [pose]);

    const w = def.w * scale, h = def.h * scale;
    const box: React.CSSProperties = face
        ? { width: 54 * scale, height: 50 * scale, backgroundSize: `${def.frames * w}px ${h}px`, backgroundPosition: `${-frame * w - 20 * scale}px ${-4 * scale}px` }
        : { width: w, height: h, backgroundSize: `${def.frames * w}px ${h}px`, backgroundPosition: `${-frame * w}px 0` };

    return (
        <span
            className={`mira-spr mira-rim ${className}`}
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            style={{ backgroundImage: `url(${def.file})`, transform: flip ? 'scaleX(-1)' : undefined, ...box, ...style }}
        />
    );
};

/** Globo de Mira: su voz siempre en lavanda. */
export const MiraBubble: React.FC<{ children: React.ReactNode; title?: string; tail?: 'left' | 'right' | 'none'; className?: string; live?: boolean }> = ({ children, title, tail = 'left', className = '', live }) => (
    <div
        role={live ? 'status' : undefined}
        className={`bg-mira-bg border border-mira text-text-primary text-sm leading-relaxed px-4 py-3 ${tail === 'left' ? 'rounded-2xl rounded-bl-sm' : tail === 'right' ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl'} ${className}`}
    >
        {title && <div className="text-xs font-semibold text-mira mb-1">{title}</div>}
        {children}
    </div>
);

export default MiraSprite;
