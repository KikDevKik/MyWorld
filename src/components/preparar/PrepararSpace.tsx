// Oct 2026: espacio «Preparar» — todo lo de antes de escribir en un solo lugar:
// la conversación con el Arquitecto, el Mapa del mundo (Nexus), los Personajes (Forja)
// y «Qué pasaría si» (ideas no canon). Cada vista se monta la primera vez que se abre y
// luego se conserva, para no perder la conversación al cambiar de pestaña.
import React, { useEffect, useState } from 'react';
import { DraftingCompass, Network, Users, Lightbulb } from 'lucide-react';

import { type PrepararTab, PREPARAR_TAB_KEY } from './tabs';
import RoomMira from '../mira/RoomMira';
import { requestTip } from '../../tour/tourStore';
import type { MiraPose } from '../mira/MiraSprite';

// Nov 2026: Mira cambia de lugar según el cuarto. En la mesa y el fichero ya vive dentro de la vista
// (sentada en la tarjeta, junto al fichero), así que aquí solo aparece en el observatorio y el frasco.
const ROOM_MIRA: Partial<Record<PrepararTab, { pose: MiraPose; line: string; side: 'left' | 'right'; className: string }>> = {
    mapa: { pose: 'senalando', side: 'left', className: 'left-4 bottom-12', line: 'Este es tu mundo visto desde el observatorio. Toca un punto y miramos con qué se conecta.' },
    quepasa: { pose: 'sorprendida', side: 'left', className: 'left-[52px] bottom-[76px]', line: 'Aquí va el caos: nada de esto cambia tu historia hasta que lo llevas al canon.' },
};
export type { PrepararTab } from './tabs';

// Nov 2026: el objeto pixel de cada cuarto (el mismo de la guía y del inicio).
const TabIcon = ({ name }: { name: string }) => <img src={`/assets/objetos/icono/${name}.png`} alt="" width={20} height={20} className="w-5 h-5" draggable={false} />;

// Nov 2026: la pestaña dice qué hace; el nombre del cuarto queda como pista (antes «El fichero» no decía que eran los personajes).
const TABS: { id: PrepararTab; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'conversacion', label: 'Conversación', hint: 'La mesa: planea con el Arquitecto partes, hilos y dudas', icon: <TabIcon name="planos" /> },
    { id: 'mapa', label: 'Mapa', hint: 'El observatorio: tu mundo como un mapa de conexiones', icon: <TabIcon name="telescopio" /> },
    { id: 'personajes', label: 'Personajes', hint: 'El fichero: las fichas de tus personajes', icon: <TabIcon name="fichero" /> },
    { id: 'quepasa', label: 'Ideas', hint: 'El frasco de ideas: qué pasaría si. Aquí nada es canon hasta que lo decidas', icon: <TabIcon name="frasco_luciernagas" /> },
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
        // Nov 2026: tutorial progresivo: cada pestaña se explica la primera vez que entras a ella.
        requestTip(({ conversacion: 'mesa.conversacion', mapa: 'mesa.mapa', personajes: 'mesa.personajes', quepasa: 'mesa.ideas' } as Record<string, string>)[tab] || '');
    }, [tab]);
    const setTab = onTabChange;
    const current = TABS.find(t => t.id === tab)!;

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-titanium-950">
            <nav className="shrink-0 h-12 flex items-center gap-1 border-b border-titanium-800 bg-titanium-950 px-2 sm:px-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none]" role="tablist" aria-label="La mesa del arquitecto">
                <span className="mr-3 hidden md:inline font-serif text-[15px] font-semibold text-titanium-200">La mesa del arquitecto</span>
                {TABS.map(t => (
                    <button
                        key={t.id}
                        role="tab"
                        data-tour={`tab-${t.id}`}
                        aria-selected={tab === t.id}
                        onClick={() => setTab(t.id)}
                        className={`shrink-0 inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-2.5 sm:px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60 ${tab === t.id
                            ? (t.id === 'quepasa' ? 'bg-mira-bg text-titanium-100' : 'bg-titanium-800 text-titanium-100')
                            : 'text-titanium-400 hover:text-titanium-100 hover:bg-titanium-900'}`}
                        title={t.hint}
                    >
                        {t.icon}<span>{t.label}</span>
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
