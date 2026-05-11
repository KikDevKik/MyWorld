import React from 'react';
import { ChevronDown, UserX } from 'lucide-react';

interface PersonajesHerramientaProps {
    onClose?: () => void;
}

const PersonajesHerramienta: React.FC<PersonajesHerramientaProps> = () => {
    return (
        <div className="flex flex-col h-full">
            {/* Subheader: filter toolbar */}
            <div className="flex items-center justify-end px-4 py-2 border-b border-titanium-800 shrink-0">
                <div className="relative">
                    <select
                        className="appearance-none bg-titanium-900 border border-titanium-800 text-titanium-400 text-xs rounded-lg px-3 py-1.5 pr-8 focus:outline-none font-mono opacity-50 cursor-not-allowed"
                        disabled
                    >
                        <option value="all">Filtrar por estado</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-titanium-500 pointer-events-none opacity-50" />
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center text-center p-6">
                <div className="p-4 bg-titanium-900/50 rounded-full border border-titanium-800/50 mb-4 text-titanium-600">
                    <UserX size={32} />
                </div>
                <h3 className="text-titanium-300 text-sm font-medium">No hay personajes registrados en la Forja</h3>
                <p className="text-titanium-500 text-[11px] font-mono mt-2 max-w-[280px]">
                    El manifiesto de entidades está vacío o no ha sido sincronizado. Añade personajes en la Forja para analizarlos en escena.
                </p>
            </div>
        </div>
    );
};

export default PersonajesHerramienta;
