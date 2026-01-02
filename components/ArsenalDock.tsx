import React from 'react';
import { Clapperboard, Globe2, Hammer, ShieldCheck, Image as ImageIcon, Scale, FlaskConical, CalendarClock, Printer } from 'lucide-react';
import { GEMS } from '../constants';
import { GemId } from '../types';

interface ArsenalDockProps {
    activeGemId: GemId | null;
    onGemSelect: (id: GemId) => void;
    onToggleDirector: () => void; // 👈 Add prop
}

const ArsenalDock: React.FC<ArsenalDockProps> = ({ activeGemId, onGemSelect, onToggleDirector }) => {

    // 🟢 DEFINIMOS LA LISTA DE ÉLITE
    const DOCK_GEMS: GemId[] = ['perforador', 'forja', 'guardian', 'tribunal', 'laboratorio', 'cronograma', 'imprenta'];

    // Función auxiliar para elegir el icono correcto según la ID de la Gem
    const getIcon = (id: string) => {
        switch (id) {
            case 'director': return <Clapperboard size={20} />;
            case 'perforador': return <Globe2 size={20} />;
            case 'forja': return <Hammer size={20} />;
            case 'guardian': return <ShieldCheck size={20} />;
            case 'tribunal': return <Scale size={20} />;
            case 'laboratorio': return <FlaskConical size={20} />;
            case 'cronograma': return <CalendarClock size={20} />;
            case 'imprenta': return <Printer size={20} />;
            default: return <Globe2 size={20} />;
        }
    };

    return (
        <aside className="fixed right-0 top-0 bottom-0 w-16 bg-titanium-950 border-l border-titanium-800 flex flex-col items-center py-6 gap-6 shadow-2xl z-30">

            {/* GEMS (Las Herramientas Principales) */}
            <div className="flex flex-col gap-4 w-full px-2">
                {DOCK_GEMS.map((gemId) => {
                    const isActive = activeGemId === gemId;
                    return (
                        <button
                            key={gemId}
                            onClick={() => onGemSelect(gemId)}
                            className={`
                                group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300
                                ${isActive
                                    ? 'bg-titanium-800 text-titanium-100 shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-titanium-600'
                                    : 'text-titanium-500 hover:text-titanium-200 hover:bg-titanium-900'}
                                active:scale-95
                            `}
                            title={GEMS[gemId].name}
                        >
                            <div className="relative z-10">
                                {getIcon(gemId)}
                            </div>

                            {isActive && (
                                <div className="absolute -right-3 w-1 h-5 bg-titanium-200 rounded-l-full shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
                            )}
                        </button>
                    );
                })}
            </div>
            <div className="flex-1" /> {/* Espaciador flexible para empujar lo de abajo */}

            {/* 🟢 ACCESOS DIRECTOS FLOTANTES (Director) */}
            <div className="flex flex-col gap-4 w-full px-2 pb-4">
                 <button
                    onClick={onToggleDirector}
                    className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 text-titanium-500 hover:text-accent-DEFAULT hover:bg-titanium-900 border border-transparent hover:border-titanium-700"
                    title="Director de Escena"
                >
                    <Clapperboard size={20} />
                </button>
            </div>

        </aside>
    );
};

export default ArsenalDock;