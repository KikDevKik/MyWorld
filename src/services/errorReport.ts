// Nov 2026: aviso de errores en producción. Manda al servidor los errores que rompen la app en el navegador
// del autor (mensaje, dónde y versión). Nunca manda lo que el autor estaba escribiendo.
import { callFunction } from './api';

const sent = new Set<string>();
let count = 0;
const MAX_PER_SESSION = 6;
// Ruido que no es un fallo de MyWorld: extensiones del navegador, cortes de red, avisos del navegador.
const NOISE = /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|Failed to fetch|NetworkError|Load failed|AbortError|The user aborted/i;

export function reportError(kind: 'error' | 'promesa' | 'pantalla', err: unknown, extra?: string) {
    try {
        if (!import.meta.env.PROD) return;
        const e = err as any;
        const message = String(e?.message || e || '').slice(0, 500);
        if (!message || NOISE.test(message)) return;
        const key = `${kind}:${message.slice(0, 120)}`;
        if (sent.has(key) || count >= MAX_PER_SESSION) return;
        sent.add(key); count++;
        const build = (document.querySelector('meta[name="build"]') as HTMLMetaElement | null)?.content || '';
        callFunction('logClientError', {
            kind, message,
            stack: String(e?.stack || extra || '').slice(0, 3000),
            where: location.pathname + (extra ? ` · ${extra.slice(0, 80)}` : ''),
            build, ua: navigator.userAgent,
        }, { timeout: 15000 }).catch(() => { /* si no se puede avisar, no pasa nada */ });
    } catch { /* avisar de un error nunca debe causar otro */ }
}

export function initErrorReporting() {
    window.addEventListener('error', ev => reportError('error', ev.error || ev.message));
    window.addEventListener('unhandledrejection', ev => reportError('promesa', (ev as PromiseRejectionEvent).reason));
}
