import { useEffect, useState } from 'react';

// Nov 2026: pantallas angostas. Devuelve si la consulta se cumple y se actualiza al girar o cambiar el tamaño.
export function useMediaQuery(query: string): boolean {
    const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
    const [matches, setMatches] = useState(get);
    useEffect(() => {
        const m = window.matchMedia?.(query);
        if (!m) return;
        const on = () => setMatches(m.matches);
        on();
        m.addEventListener?.('change', on);
        return () => m.removeEventListener?.('change', on);
    }, [query]);
    return matches;
}

// Por debajo de 1024 px la barra de documentos deja de ocupar espacio y se abre encima, como un cajón.
export const NARROW_QUERY = '(max-width: 1023px)';
export const useIsNarrow = () => useMediaQuery(NARROW_QUERY);
