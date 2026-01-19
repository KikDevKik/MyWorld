import React from 'react';
import { Search, User, AlertTriangle, ArrowRight } from 'lucide-react';

interface Entity {
    name: string;
    role: string;
    status: 'EXISTING' | 'DETECTED';
    description?: string;
}

interface InspectorData {
    report_summary: string;
    entities: Entity[];
}

interface AnalysisCardProps {
    data: InspectorData;
}

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ data }) => {
    return (
        <div className="mx-auto w-[95%] bg-amber-950/10 backdrop-blur-sm border border-amber-500/50 rounded-lg p-4 animate-in fade-in slide-in-from-bottom-2 shadow-lg shadow-amber-900/10">
            {/* HEADER */}
            <div className="flex items-center gap-2 mb-3 text-amber-400 font-bold text-xs uppercase tracking-wider border-b border-amber-500/20 pb-2">
                <Search size={14} />
                <span>Reporte de Inspector</span>
            </div>

            {/* SUMMARY */}
            <div className="text-titanium-300 text-xs mb-4 italic leading-relaxed pl-3 border-l-2 border-amber-500/30">
                {data.report_summary}
            </div>

            {/* ENTITIES LIST */}
            {data.entities && data.entities.length > 0 && (
                <div className="flex flex-col gap-2">
                    {data.entities.map((ent, i) => (
                        <div key={i} className="flex flex-col bg-titanium-900/50 p-3 rounded border border-titanium-800 hover:border-amber-500/30 transition-colors">
                            <div className="flex justify-between items-start mb-1">
                                <div className="flex items-center gap-2">
                                    <User size={12} className={ent.status === 'DETECTED' ? 'text-cyan-400' : 'text-titanium-500'} />
                                    <span className={`text-xs font-bold ${ent.status === 'DETECTED' ? 'text-cyan-400' : 'text-titanium-300'}`}>
                                        {ent.name}
                                    </span>
                                </div>
                                {ent.status === 'DETECTED' && (
                                    <span className="px-1.5 py-0.5 bg-cyan-900/30 text-cyan-400 text-[9px] rounded uppercase font-bold tracking-wider flex items-center gap-1">
                                        <AlertTriangle size={8} /> Nuevo
                                    </span>
                                )}
                            </div>

                            <span className="text-[10px] text-titanium-500 mb-2">{ent.role}</span>

                            {ent.status === 'DETECTED' && (
                                <button
                                    className="mt-1 flex items-center justify-center gap-2 w-full py-1.5 bg-titanium-800 hover:bg-cyan-900/20 text-titanium-400 hover:text-cyan-400 text-[10px] uppercase font-bold rounded transition-colors border border-transparent hover:border-cyan-500/30"
                                    onClick={() => alert("Función de Forja no disponible en modo Director. Ve a la Forja para registrar.")}
                                    title="Ir a la Forja (Solo Lectura)"
                                >
                                    <span>Ir a la Forja</span>
                                    <ArrowRight size={10} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
