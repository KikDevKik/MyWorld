// Oct 2026: Guardián pasivo. Después de guardar (como mucho cada 10 min por archivo) pide una revisión
// rápida y barata contra el canon. Solo avisa de errores gigantes; el detalle vive en el Reporte.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';

export interface WatchAlert { titulo: string; explicacion: string; citaCapitulo?: string; citaCanon?: string; fuente?: string }
export type WatchStatus = 'idle' | 'scanning' | 'clean' | 'conflict';

const MIN_GAP_MS = 10 * 60 * 1000;
const MIN_CHARS = 1500;

export function useCanonWatch(fileId: string | null | undefined, fileName: string | null | undefined, onOpen: () => void) {
    const [status, setStatus] = useState<WatchStatus>('idle');
    const [alerts, setAlerts] = useState<WatchAlert[]>([]);
    const lastRun = useRef<Record<string, number>>({});
    const seen = useRef<Set<string>>(new Set());
    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;
    const currentId = useRef(fileId);
    currentId.current = fileId;

    // Al abrir un archivo: mostrar lo que el Guardián ya había visto (sin gastar nada).
    useEffect(() => {
        setAlerts([]);
        setStatus('idle');
        if (!fileId) return;
        let alive = true;
        callFunction<any>('chapterReport', { mode: 'get', fileId })
            .then(r => {
                if (!alive) return;
                const a: WatchAlert[] = r?.watch?.alertas || [];
                a.forEach(x => seen.current.add(`${fileId}:${x.titulo}`));
                setAlerts(a);
                if (r?.watchAt) setStatus(a.length ? 'conflict' : 'clean');
            })
            .catch(() => { /* sin datos: queda en reposo */ });
        return () => { alive = false; };
    }, [fileId]);

    const notifySaved = useCallback((savedFileId: string, content: string) => {
        if (!savedFileId || savedFileId !== currentId.current || (content || '').length < MIN_CHARS) return;
        const now = Date.now();
        if (now - (lastRun.current[savedFileId] || 0) < MIN_GAP_MS) return;
        lastRun.current[savedFileId] = now;
        setStatus(s => (s === 'conflict' ? s : 'scanning'));
        callFunction<any>('chapterReport', { mode: 'watch', fileId: savedFileId, fileName: fileName || '', content }, { timeout: 120000 })
            .then(r => {
                if (savedFileId !== currentId.current) return;
                const a: WatchAlert[] = r?.watch?.alertas || [];
                setAlerts(a);
                setStatus(a.length ? 'conflict' : 'clean');
                const fresh = a.filter(x => !seen.current.has(`${savedFileId}:${x.titulo}`));
                fresh.forEach(x => seen.current.add(`${savedFileId}:${x.titulo}`));
                if (fresh.length) {
                    toast.warning(`El Guardián vio algo grave: ${fresh[0].titulo}`, {
                        description: fresh.length > 1 ? `Y ${fresh.length - 1} más. Míralo en el Reporte.` : 'Míralo en el Reporte, con las dos citas.',
                        action: { label: 'Ver', onClick: () => onOpenRef.current() },
                        duration: 12000,
                    });
                }
            })
            .catch(() => setStatus(s => (s === 'scanning' ? 'idle' : s)));
    }, [fileName]);

    return { status, alerts, notifySaved };
}
