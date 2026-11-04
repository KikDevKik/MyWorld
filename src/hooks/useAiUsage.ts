import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';

// Nov 2026: cuánto Claude queda este mes (nivel MyWorld). Se muestra en la barra de estado y avisa
// una sola vez al 80 % (pasa a Haiku) y al 100 % (se acaba hasta el mes siguiente; MyWorld sigue con Gemini).
export interface AiUsage { myworldAvailable: boolean; claudeActive: boolean; spent: number; cap: number; ratio: number; calls: number; resetsOn: Date }

let cache: AiUsage | null = null;
let inflight: Promise<AiUsage | null> | null = null;
let lastAt = 0;
const listeners = new Set<(u: AiUsage) => void>();

function nextReset(): Date {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1, 12));
}

export function fmtReset(d: Date, lang = 'es') {
    return d.toLocaleDateString(lang === 'en' ? 'en' : 'es', { day: 'numeric', month: 'long' });
}

function warnOnce(u: AiUsage) {
    if (!u.myworldAvailable) return;
    const month = new Date().toISOString().slice(0, 7);
    const pct = Math.round(u.ratio * 100);
    const k = (lvl: number) => `mw-ai-warn-${month}-${lvl}`;
    try {
        if (u.ratio >= 1 && !localStorage.getItem(k(100))) {
            localStorage.setItem(k(100), '1');
            toast.error('Se acabó Claude por este mes', { description: `MyWorld sigue funcionando con Gemini hasta el ${fmtReset(u.resetsOn)}.`, duration: 12000 });
        } else if (u.ratio >= 0.8 && u.ratio < 1 && !localStorage.getItem(k(80))) {
            localStorage.setItem(k(80), '1');
            toast.warning('Te queda poco de Claude este mes', { description: `Llevas el ${pct} %. Para estirarlo, Mira y el Arquitecto pasan a Haiku. Se renueva el ${fmtReset(u.resetsOn)}.`, duration: 12000 });
        }
    } catch { /* sin almacenamiento */ }
}

export async function refreshAiUsage(force = false): Promise<AiUsage | null> {
    if (!force && cache && Date.now() - lastAt < 4 * 60 * 1000) return cache;
    if (inflight) return inflight;
    inflight = callFunction<any>('getAIStatus', {}).then(r => {
        if (!r) return cache;
        const cap = Number(r.capUsd) || 8, spent = Number(r.monthCostUsd) || 0;
        cache = { myworldAvailable: !!r.myworldAvailable, claudeActive: !!r.claudeActive, spent, cap, ratio: cap > 0 ? spent / cap : 0, calls: Number(r.calls) || 0, resetsOn: nextReset() };
        lastAt = Date.now();
        listeners.forEach(l => l(cache!));
        warnOnce(cache);
        return cache;
    }).catch(() => cache).finally(() => { inflight = null; });
    return inflight;
}

export function useAiUsage(): AiUsage | null {
    const [u, setU] = useState<AiUsage | null>(cache);
    useEffect(() => {
        listeners.add(setU);
        refreshAiUsage();
        const id = window.setInterval(() => refreshAiUsage(), 5 * 60 * 1000);
        const onFocus = () => refreshAiUsage();
        window.addEventListener('focus', onFocus);
        return () => { listeners.delete(setU); window.clearInterval(id); window.removeEventListener('focus', onFocus); };
    }, []);
    return u;
}
