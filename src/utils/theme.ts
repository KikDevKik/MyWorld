// Tema de MyWorld: "noche" (imagen de marca) o "papel". Por defecto sigue al sistema.
export type ThemePref = 'sistema' | 'noche' | 'papel';
const KEY = 'mw-theme';

export function getThemePref(): ThemePref {
    try {
        const v = localStorage.getItem(KEY);
        if (v === 'noche' || v === 'papel' || v === 'sistema') return v;
    } catch { /* sin almacenamiento */ }
    return 'sistema';
}

export function resolvedTheme(pref: ThemePref = getThemePref()): 'noche' | 'papel' {
    if (pref !== 'sistema') return pref;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'papel' : 'noche';
}

export function applyTheme(pref: ThemePref = getThemePref()) {
    const t = resolvedTheme(pref);
    document.documentElement.dataset.theme = t;
    document.documentElement.classList.toggle('dark', t === 'noche');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'noche' ? '#14131B' : '#F6F1EC');
    window.dispatchEvent(new CustomEvent('mw-theme', { detail: t }));
}

export function setThemePref(pref: ThemePref) {
    try { localStorage.setItem(KEY, pref); } catch { /* sin almacenamiento */ }
    applyTheme(pref);
}

let watching = false;
export function initTheme() {
    applyTheme();
    if (watching) return;
    watching = true;
    window.matchMedia?.('(prefers-color-scheme: light)').addEventListener?.('change', () => {
        if (getThemePref() === 'sistema') applyTheme('sistema');
    });
}
