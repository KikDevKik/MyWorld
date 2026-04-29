import { useState, useCallback } from 'react';

export function useToolWelcome(toolKey: string, folderId?: string): [boolean, () => void] {
    const storageKey = `welcome_dismissed_${toolKey}_${folderId || 'global'}`;

    const [dismissed, setDismissed] = useState(() => {
        const globallyDisabled = localStorage.getItem('welcome_cards_disabled') === 'true';
        return globallyDisabled || localStorage.getItem(storageKey) === 'true';
    });

    const dismiss = useCallback(() => {
        localStorage.setItem(storageKey, 'true');
        setDismissed(true);
    }, [storageKey]);

    return [!dismissed, dismiss];
}
