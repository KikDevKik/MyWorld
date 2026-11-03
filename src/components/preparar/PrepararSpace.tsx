// Oct 2026: espacio «Preparar» — todo lo de antes de escribir en un solo lugar:
// la conversación con el Arquitecto, el Mapa del mundo (Nexus), los Personajes (Forja)
// y «Qué pasaría si» (ideas no canon). Cada vista se monta la primera vez que se abre y
// luego se conserva, para no perder la conversación al cambiar de pestaña.
import React, { useEffect, useState } from 'react';
import { DraftingCompass, Network, Users, Lightbulb } from 'lucide-react';

import { type PrepararTab, PREPARAR_TAB_KEY } from './tabs';
import RoomMira from '../mira/RoomMira';
import type { MiraPose } from '../mira/MiraSprite';

// Nov 2026: Mira cambia de lugar según el cuarto. En la mesa y el fichero ya vive dentro de la vista
// (sentada en la tarjeta, junto al fichero), así que aquí solo aparece en el observatorio y el frasco.
const ROOM_MIRA: Partial<Record<PrepararTab, { pose: MiraPose; line: string; side: 'left' | 'right'; className: string }>> = {
    mapa: { pose: 'senalando', side: 'left', className: 'left-4 bottom-12', line: 'Este es tu mundo visto desde el observatorio. Toca un punto y miramos con qué se conecta.' },
    quepasa: { pose: 'sorprendida', side: 'left', className: 'left-[52px] bottom-[76px]', line: 'Aquí va el caos: nada de esto cambia tu historia hasta que lo llevas al canon.' },
};
export type { PrepararTab } from './tabs';

const TABS: { id: PrepararTab; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'conversacion', label: 'La mesa', hint: 'Planea con el Arquitecto: partes, hilos y dudas', icon: <DraftingCompass size={14} /> },
    { id: 'mapa', label: 'El observatorio', hint: 'Tu mundo como un mapa de conexiones', icon: <Network size={14} /> },
    { id: 'personajes', label: 'El fichero', hint: 'Las fichas de tus personajes', icon: <Users size={14} /> },
    { id: 'quepasa', label: 'El frasco de ideas', hint: 'Qué pasaría si: aquí nada es canon hasta que lo decidas', icon: <Lightbulb size={14} /> },
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
        <div className="h-full w-full flex flex-col overflow-hidden bg-titanium-950">
            <nav className="shrink-0 h-11 flex items-center gap-1 border-b border-titanium-800 bg-titanium-950 px-3" role="tablist" aria-label="La mesa del arquitecto">
                <span className="mr-3 font-serif text-[15px] font-semibold text-titanium-200">La mesa del arquitecto</span>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${tab === t.id
                            ? (t.id === 'quepasa' ? 'bg-mira-bg text-titanium-100' : 'bg-titanium-800 text-titanium-100')
                            : 'text-titanium-400 hover:text-titanium-100 hover:bg-titanium-900'}`}
                        title={t.hint}
                    >
                        {t.icon}{t.label}
                    </button>
                ))}
                <span className="ml-auto hidden lg:block text-xs text-titanium-400 truncate">{current.hint}</span>
            </nav>
            <div className="flex-1 relative overflow-hidden">
                {TABS.map(t => visited.has(t.id) && (
                    <div key={t.id} className={`absolute inset-0 ${tab === t.id ? '' : 'hidden'}`} role="tabpanel">
                        {views[t.id]}
                    </div>
                ))}
                {ROOM_MIRA[tab] && <RoomMira roomKey={tab} pose={ROOM_MIRA[tab]!.pose} line={ROOM_MIRA[tab]!.line} side={ROOM_MIRA[tab]!.side} className={ROOM_MIRA[tab]!.className} />}
            </div>
        </div>
    );
}
