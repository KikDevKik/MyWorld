import React from 'react';
import { Users, ChevronDown, X, User, ShieldAlert, Ghost, UserPlus } from 'lucide-react';

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
                        <select className="appearance-none bg-titanium-900 border border-titanium-800 text-titanium-300 text-sm rounded-lg px-4 py-1.5 pr-10 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 cursor-pointer font-mono">
                            <option value="all">Filtrar por estado</option>
                            <option value="herido">Heridos</option>
                            <option value="traicionado">Traicionados</option>
                            <option value="critico">Estado Crítico</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-titanium-500 pointer-events-none" />
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

            {/* Panel Content: Character Grid */}
            {/* Use #0a0a0a specifically for the background to satisfy the critical rule */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0a0a0a]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-[1400px] mx-auto">

                    {/* Character Card 1 */}
                    <div className="bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-4 group hover:-translate-y-[2px] hover:border-cyan-500 transition-all duration-200 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-titanium-800 flex items-center justify-center shrink-0 border border-titanium-600 group-hover:border-cyan-500 transition-colors">
                                <User size={20} className="text-titanium-500 group-hover:text-cyan-500 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-titanium-100 font-medium truncate">Marcus Vance</h3>
                                <p className="text-titanium-500 text-xs truncate">Protagonista / Exiliado</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-red-900/10 text-red-500 border border-red-500/20 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                Herido
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-titanium-800 text-titanium-300 border border-titanium-600">
                                Desarmado
                            </span>
                        </div>
                    </div>

                    {/* Character Card 2 */}
                    <div className="bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-4 group hover:-translate-y-[2px] hover:border-cyan-500 transition-all duration-200 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-titanium-800 flex items-center justify-center shrink-0 border border-titanium-600 group-hover:border-cyan-500 transition-colors">
                                <UserPlus size={20} className="text-titanium-500 group-hover:text-cyan-500 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-titanium-100 font-medium truncate">Elara Thorne</h3>
                                <p className="text-titanium-500 text-xs truncate">Antagonista Secundaria</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Traicionada
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-cyan-900/20 text-cyan-400 border border-cyan-500/30">
                                Tiene la llave
                            </span>
                        </div>
                    </div>

                    {/* Character Card 3 */}
                    <div className="bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-4 group hover:-translate-y-[2px] hover:border-cyan-500 transition-all duration-200 cursor-pointer opacity-70">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-titanium-800 flex items-center justify-center shrink-0 border border-titanium-600 group-hover:border-cyan-500 transition-colors">
                                <Ghost size={20} className="text-titanium-500 group-hover:text-cyan-500 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-titanium-300 font-medium truncate">Silas</h3>
                                <p className="text-titanium-500 text-xs truncate">Mentor</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-titanium-800 text-titanium-500 border border-titanium-600">
                                Oculto
                            </span>
                        </div>
                    </div>

                    {/* Character Card 4 */}
                    <div className="bg-titanium-900 border border-titanium-800 rounded-xl p-4 flex flex-col gap-4 group hover:-translate-y-[2px] hover:border-cyan-500 transition-all duration-200 cursor-pointer">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-titanium-800 flex items-center justify-center shrink-0 border border-titanium-600 group-hover:border-cyan-500 transition-colors">
                                <ShieldAlert size={20} className="text-titanium-500 group-hover:text-cyan-500 transition-colors" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-titanium-100 font-medium truncate">Kaelen</h3>
                                <p className="text-titanium-500 text-xs truncate">Mercenario</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-titanium-800 text-titanium-300 border border-titanium-600">
                                En combate
                            </span>
                            <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-md bg-titanium-800 text-titanium-300 border border-titanium-600">
                                Ileso
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default PersonajesHerramienta;
