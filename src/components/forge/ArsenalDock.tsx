import React from 'react';
import { Clapperboard, Globe2, Hammer, ShieldCheck, Scale, FlaskConical, CalendarClock, Printer } from 'lucide-react';
import { GEMS } from '../../constants';
import { GemId } from '../../types';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface ArsenalDockProps {
    activeGemId: GemId | null;
    onGemSelect: (id: GemId) => void;
    onSimulateDrift?: () => void; // 🟢 SMOKE TEST
    isSecurityReady?: boolean; // 🟢 NEW PROP
    onToggleSentinel?: () => void; // 🟢 NEW PROP
}

const ArsenalDock: React.FC<ArsenalDockProps> = ({ activeGemId, onGemSelect, onSimulateDrift }) => {
    const { currentLanguage } = useLanguageStore();
    const tTools = TRANSLATIONS[currentLanguage].tools;

    // 🟢 DEFINIMOS LA LISTA DE ÉLITE
    const DOCK_GEMS: GemId[] = ['director', 'perforador', 'forja', 'laboratorio', 'tribunal', 'guardian', 'imprenta'];

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

    // Helper to get translated name safely
    const getTranslatedName = (id: GemId) => {
        return tTools[id] || GEMS[id].name;
    };

    return (
        <div className="w-16 h-full bg-titanium-950 flex flex-col items-center py-6 gap-6 z-30 flex-shrink-0 pointer-events-auto">

            {/* GEMS (Las Herramientas Principales) */}
            <div className="flex flex-col gap-4 w-full px-2">
                {DOCK_GEMS.map((gemId) => {
                    const isActive = activeGemId === gemId;
                    const translatedName = getTranslatedName(gemId);
                    return (
                        <button
                            key={gemId}
                            onClick={() => onGemSelect(gemId)}
                            className={`
                                group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300
                                focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none
                                ${isActive
                                    ? 'bg-titanium-800 text-titanium-100 shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-titanium-600'
                                    : 'text-titanium-500 hover:text-titanium-200 hover:bg-titanium-900'}
                                active:scale-95
                            `}
                            title={translatedName}
                            aria-label={translatedName}
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

            {/* 🟢 ACCESOS DIRECTOS FLOTANTES (Dev Only) */}
            <div className="flex flex-col gap-4 w-full px-2 pb-4">
                {/* 🧪 DRIFT SIMULATION BUTTON (DEV ONLY) */}
                {onSimulateDrift && (
                    <button
                        onClick={onSimulateDrift}
                        className="group relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300 text-red-500 hover:text-red-400 hover:bg-red-950/20 border border-transparent hover:border-red-900/50"
                        title="Simular Drift (DEV)"
                    >
                        <FlaskConical size={20} />
                    </button>
                )}
            </div>

        </div>
    );
};

export default ArsenalDock;
