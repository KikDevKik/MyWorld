// Oct 2026: carga diferida de vistas pesadas. El paquete inicial pesaba 2,8 MB porque todas las
// herramientas (World Engine, Forja, Tribunal…) se descargaban al abrir la app aunque solo se usara el editor.
import React, { Suspense } from 'react';

function ViewLoader() {
    return (
        <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-titanium-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-titanium-700 border-t-mira/40" />
            Cargando…
        </div>
    );
}

// Nov 2026: después de cada deploy, una pestaña abierta pide archivos de la versión anterior que ya no existen
// (el servidor responde con HTML y la app quedaba en negro). Si una vista no carga, se recarga la página una vez
// para traer la versión nueva; si vuelve a fallar en menos de 30 s, se deja el error a la vista.
const RELOAD_KEY = 'mw-new-version-reload';
export function reloadForNewVersion(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last < 30000) return false;
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch { /* sin almacenamiento: se recarga igual */ }
    window.location.reload();
    return true;
}

export function withNewVersionReload<T>(loader: () => Promise<T>): () => Promise<T> {
    return () => loader().catch((err) => {
        if (reloadForNewVersion()) return new Promise<T>(() => { /* la página se recarga */ });
        throw err;
    });
}

export function lazyView<P extends object>(loader: () => Promise<{ default: React.ComponentType<P> }>) {
    const Lazy = React.lazy(withNewVersionReload(loader));
    const Wrapped = (props: P) => (
        <Suspense fallback={<ViewLoader />}>
            <Lazy {...(props as any)} />
        </Suspense>
    );
    return Wrapped;
}
