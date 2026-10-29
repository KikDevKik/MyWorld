// Oct 2026: pestañas del espacio Preparar (módulo liviano: App lo importa sin cargar las vistas).
export type PrepararTab = 'conversacion' | 'mapa' | 'personajes' | 'quepasa';
export const PREPARAR_TAB_IDS: PrepararTab[] = ['conversacion', 'mapa', 'personajes', 'quepasa'];
export const PREPARAR_TAB_KEY = 'myworld_preparar_tab';

export function loadPrepararTab(): PrepararTab {
    try { const s = localStorage.getItem(PREPARAR_TAB_KEY) as PrepararTab | null; if (s && PREPARAR_TAB_IDS.includes(s)) return s; } catch { /* sin almacenamiento */ }
    return 'conversacion';
}
