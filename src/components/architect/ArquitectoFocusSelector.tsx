import React from 'react';
import { Target, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { doc, setDoc, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export type FocusOption = {
    id: string;
    label: string;
    shortName: string;
    description: string;
};

export const FOCUS_OPTIONS: FocusOption[] = [
    { id: 'mega', label: 'Mega-Roadmap', shortName: 'Construcción Total', description: 'Construcción total del universo y la trama.' },
    { id: 'micro', label: 'Micro-Roadmap Quirúrgico', shortName: 'Resolución de Hueco', description: 'Para resolver un hueco de guion específico.' },
    { id: 'detonacion', label: 'Roadmap de Detonación', shortName: 'Crear Conflicto', description: 'Si tienes lore, pero la trama está estancada.' },
    { id: 'inversa', label: 'Ingeniería Inversa', shortName: 'Alterar Canon', description: 'Si quieres cambiar algo que ya está escrito.' },
    { id: 'muro', label: 'Muro del 2do Acto', shortName: 'Desbloqueo', description: 'Si estás atascado a la mitad de la historia.' },
];

interface ArquitectoFocusSelectorProps {
    sessionId: string | null;
    currentObjective: string | null;
    setCurrentObjective: (obj: string) => void;
    disabled?: boolean;
}

const ArquitectoFocusSelector: React.FC<ArquitectoFocusSelectorProps> = ({
    sessionId,
    currentObjective,
    setCurrentObjective,
    disabled = false
}) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleSelect = async (opt: FocusOption) => {
        setIsOpen(false);
        const objText = opt.label;
        setCurrentObjective(objText);

        const userId = getAuth().currentUser?.uid;

        // Si hay una sesión activa, guardarlo en Firestore
        if (sessionId && userId) {
            try {
                const db = getFirestore();
                const roadmapRef = doc(db, 'users', userId, 'forge_sessions', sessionId, 'architect', 'roadmap');
                await setDoc(roadmapRef, { objective: objText }, { merge: true });
            } catch (error) {
                console.error("Error al persistir el objetivo:", error);
            }
        }
    };

    const activeOption = FOCUS_OPTIONS.find(o => o.label === currentObjective || o.shortName === currentObjective);

    return (
        <div className="relative h-full">
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`
                    h-full w-full px-4 rounded-none rounded-l-xl border-r border-titanium-600 flex items-center justify-center gap-1.5 transition-colors
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-titanium-800/50 hover:border-titanium-500'}
                    ${activeOption ? 'text-cyan-400' : 'text-titanium-500'}
                `}
                title="Selector de Foco Narrativo"
            >
                <Target size={18} />
                {isOpen ? <ChevronUp size={12} className="opacity-70" /> : <ChevronDown size={12} className="opacity-70" />}
            </button>

            {isOpen && !disabled && (
                <div className="absolute bottom-[calc(100%+12px)] left-0 w-64 bg-titanium-950 border border-titanium-800 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className="px-3 py-2 mb-1 border-b border-titanium-800/50">
                        <span className="text-xs font-mono text-titanium-500 tracking-wider uppercase">Frente de Batalla</span>
                    </div>
                    <div className="flex flex-col gap-1 max-h-60 overflow-y-auto custom-scrollbar">
                        {FOCUS_OPTIONS.map(opt => {
                            const isActive = currentObjective === opt.label;
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => handleSelect(opt)}
                                    className={`
                                        flex flex-col items-start px-3 py-2 rounded-lg text-left transition-colors
                                        ${isActive ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-titanium-900 border border-transparent'}
                                    `}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <span className={`text-[13px] font-medium ${isActive ? 'text-amber-400' : 'text-titanium-300'}`}>
                                            {opt.label}
                                        </span>
                                        {isActive && <Check size={14} className="text-amber-500" />}
                                    </div>
                                    <span className="text-[10px] text-titanium-500 mt-0.5 leading-tight">{opt.description}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArquitectoFocusSelector;
