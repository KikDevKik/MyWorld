// Nov 2026: muestra una imagen que vive en el Drive del autor (las del frasco de ideas).
// La baja con su sesión de Google y la guarda en memoria mientras la pestaña esté abierta.
import React, { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';

const cache = new Map<string, string>();          // id → object URL
const inflight = new Map<string, Promise<string>>();

/** Una imagen recién enviada ya está en el navegador: se muestra sin volver a bajarla. */
export function rememberDriveImage(id: string, url: string) { if (id && url && !cache.has(id)) cache.set(id, url); }

async function load(id: string, token: string): Promise<string> {
    const hit = cache.get(id);
    if (hit) return hit;
    let p = inflight.get(id);
    if (!p) {
        p = fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); })
            .then(b => { const u = URL.createObjectURL(b); cache.set(id, u); return u; })
            .finally(() => inflight.delete(id));
        inflight.set(id, p);
    }
    return p;
}

interface Props {
    id: string;
    token: string | null;
    alt: string;
    className?: string;
    onClick?: (url: string) => void;
}

export const DriveImage: React.FC<Props> = ({ id, token, alt, className = '', onClick }) => {
    const [url, setUrl] = useState<string | null>(cache.get(id) || null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let alive = true;
        setFailed(false);
        const hit = cache.get(id);
        if (hit) { setUrl(hit); return; }
        setUrl(null);
        if (!token) { setFailed(true); return; }
        load(id, token).then(u => { if (alive) setUrl(u); }).catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, [id, token]);

    if (failed) {
        return (
            <span className={`flex flex-col items-center justify-center gap-1 bg-titanium-800/60 text-titanium-500 text-[11px] text-center px-2 ${className}`} role="img" aria-label={`No pude cargar ${alt}`}>
                <ImageOff size={16} aria-hidden="true" />
                <span className="line-clamp-2 break-all">{alt}</span>
            </span>
        );
    }
    if (!url) {
        return <span className={`flex items-center justify-center bg-titanium-800/60 text-titanium-500 ${className}`} aria-label={`Cargando ${alt}`}><Loader2 size={16} className="animate-spin" aria-hidden="true" /></span>;
    }
    const img = <img src={url} alt={alt} loading="lazy" decoding="async" className={`object-cover ${onClick ? '' : className}`} style={onClick ? { width: '100%', height: '100%' } : undefined} />;
    if (!onClick) return img;
    return (
        <button type="button" onClick={() => onClick(url)} className={`block overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${className}`} aria-label={`Ver ${alt} en grande`}>
            {img}
        </button>
    );
};

/** Reduce una imagen en el navegador antes de enviarla (lado mayor 1600 px, JPEG). */
export async function shrinkImage(file: File, maxSide = 1600): Promise<{ name: string; mimeType: string; data: string; preview: string }> {
    const src = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No pude leer la imagen.')); i.src = src; });
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#ffffff';       // las transparencias quedan sobre blanco
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.86);
        return { name: file.name || 'imagen', mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), preview: dataUrl };
    } finally {
        URL.revokeObjectURL(src);
    }
}
