// Oct 2026: espacio «Preparar» — todo lo de antes de escribir en un solo lugar:
// la conversación con el Arquitecto, el Mapa del mundo (Nexus), los Personajes (Forja)
// y «Qué pasaría si» (ideas no canon). Cada vista se monta la primera vez que se abre y
// luego se conserva, para no perder la conversación al cambiar de pestaña.
import React, { useEffect, useState } from 'react';
import { Landmark, Network, Users, Lightbulb } from 'lucide-react';

import { type PrepararTab, PREPARAR_TAB_KEY } from './tabs';
export type { PrepararTab } from './tabs';

const TABS: { id: PrepararTab; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'conversacion', label: 'Arquitecto', hint: 'Conecta tus ideas y tu mundo antes de escribir', icon: <Landmark size={14} /> },
    { id: 'mapa', label: 'Mapa', hint: 'Tu mundo como un mapa de conexiones', icon: <Network size={14} /> },
    { id: 'personajes', label: 'Personajes', hint: 'Completa las fichas de tus personajes', icon: <Users size={14} /> },
    { id: 'quepasa', label: 'Qué pasaría si', hint: 'Imagina sin miedo: aquí nada es canon', icon: <Lightbulb size={14} /> },
];

const KEY = PREPARAR_TAB_KEY;

interface Props {
    views: Record<PrepararTab, React.ReactNode>;
    tab: PrepararTab;
    onTabChange: (t: PrepararTab) => void;
}

export default function PrepararSpace({ views, tab, onTabChange }: Props) {
    const [visited, setVisited] = useState<Set<PrepararTab>>(() => new Set([tab]));
    useEffect(() => {
        setVisited(v => (v.has(tab) ? v : new Set(v).add(tab)));
        try { localStorage.setItem(KEY, tab); } catch { /* sin almacenamiento */ }
    }, [tab]);
    const setTab = onTabChange;
    const current = TABS.find(t => t.id === tab)!;

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-[#0a0a0a]">
            <nav className="shrink-0 h-11 flex items-center gap-1 border-b border-titanium-800 bg-[#0c0c0d] px-3" role="tablist" aria-label="Preparar">
                <span className="mr-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-titanium-500">Preparar</span>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${tab === t.id
                            ? (t.id === 'quepasa' ? 'bg-amber-900/30 text-amber-100' : 'bg-titanium-800 text-titanium-100')
                            : 'text-titanium-400 hover:text-titanium-100 hover:bg-titanium-900'}`}
                        title={t.hint}
                    >
                        {t.icon}{t.label}
                    </button>
                ))}
                <span className="ml-auto hidden lg:block text-[11px] text-titanium-600 truncate">{current.hint}</span>
            </nav>
            <div className="flex-1 relative overflow-hidden">
                {TABS.map(t => visited.has(t.id) && (
                    <div key={t.id} className={`absolute inset-0 ${tab === t.id ? '' : 'hidden'}`} role="tabpanel">
                        {views[t.id]}
                    </div>
                ))}
            </div>
        </div>
    );
}
