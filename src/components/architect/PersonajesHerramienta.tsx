import React from 'react';
import { Users, ChevronDown, X, UserX } from 'lucide-react';

interface PersonajesHerramientaProps {
    onClose: () => void;
}

const PersonajesHerramienta: React.FC<PersonajesHerramientaProps> = ({ onClose }) => {
    return (
        <div className="absolute bottom-0 left-0 w-full h-[409px] bg-[#0a0a0a]/95 backdrop-blur-2xl border-t border-titanium-800 rounded-t-[16px] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col transform translate-y-0 transition-transform duration-300 z-50">
            {/* Panel Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 shrink-0">
                <div className="flex items-center gap-3">
                    <Users className="text-cyan-500" size={20} />
                    <h2 className="text-titanium-100 text-lg font-semibold tracking-tight">Personajes en escena</h2>
                    <span className="text-titanium-500 text-xs font-mono ml-2 px-2 py-0.5 rounded bg-titanium-900 border border-titanium-800">ACTIVO</span>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative">
                        <select className="appearance-none bg-titanium-900 border border-titanium-800 text-titanium-300 text-sm rounded-lg px-4 py-1.5 pr-10 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-mono opacity-50 cursor-not-allowed" disabled>
                            <option value="all">Filtrar por estado</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-titanium-500 pointer-events-none opacity-50" />
                    </div>

                    <button
                        onClick={onClose}
                        className="text-titanium-500 hover:text-titanium-100 transition-colors"
                        aria-label="Cerrar Personajes"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Panel Content: Empty State */}
            {/* Use #0a0a0a specifically for the background to satisfy the critical rule */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0a] flex flex-col items-center justify-center text-center">
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
