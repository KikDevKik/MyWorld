import { useState, useCallback } from 'react';

// Nov 2026: la bienvenida de cada herramienta se muestra una vez por persona (antes, una vez por proyecto:
// al crear el primer proyecto volvía a salir la de Mira que ya habías cerrado).
export function useToolWelcome(toolKey: string, _folderId?: string): [boolean, () => void] {
    const storageKey = `welcome_dismissed_${toolKey}`;

    const [dismissed, setDismissed] = useState(() => {
        try {
            if (localStorage.getItem('welcome_cards_disabled') === 'true' || localStorage.getItem(storageKey) === 'true') return true;
            // Las claves viejas iban por proyecto (welcome_dismissed_<tool>_<carpeta>): cualquiera cuenta.
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i) || '';
                if (k.startsWith(`${storageKey}_`) && localStorage.getItem(k) === 'true') return true;
            }
        } catch { /* sin almacenamiento */ }
        return false;
    });

    const dismiss = useCallback(() => {
        try { localStorage.setItem(storageKey, 'true'); } catch { /* sin almacenamiento */ }
        setDismissed(true);
    }, [storageKey]);

    return [!dismissed, dismiss];
}
