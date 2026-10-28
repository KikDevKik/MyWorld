// Oct 2026: carga diferida de vistas pesadas. El paquete inicial pesaba 2,8 MB porque todas las
// herramientas (World Engine, Forja, Tribunal…) se descargaban al abrir la app aunque solo se usara el editor.
import React, { Suspense } from 'react';

function ViewLoader() {
    return (
        <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-titanium-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-titanium-700 border-t-purple-500" />
            Cargando…
        </div>
    );
}

export function lazyView<P extends object>(loader: () => Promise<{ default: React.ComponentType<P> }>) {
    const Lazy = React.lazy(loader);
    const Wrapped = (props: P) => (
        <Suspense fallback={<ViewLoader />}>
            <Lazy {...(props as any)} />
        </Suspense>
    );
    return Wrapped;
}
