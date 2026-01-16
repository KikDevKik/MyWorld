import React from 'react';
import { useProjectConfig } from '../ProjectConfigContext';

const ProjectHUD: React.FC = () => {
    const { currentProjectName, currentProjectId } = useProjectConfig();

    if (!currentProjectId) return null;

    return (
        <div className="px-4 pb-4 pt-1 border-b border-titanium-700/30 bg-titanium-800">
            <div className="bg-titanium-900/50 rounded-lg p-2 border border-titanium-700/50 flex items-center justify-between group hover:border-accent-DEFAULT/30 transition-colors cursor-default">
                <div className="flex flex-col overflow-hidden">
                    <span className="text-[10px] text-titanium-500 font-mono tracking-widest uppercase mb-0.5">
                        Frecuencia Activa
                    </span>
                    <h3 className="text-xs font-bold text-titanium-100 truncate pr-2 group-hover:text-accent-DEFAULT transition-colors">
                        {currentProjectName || "Señal Desconocida"}
                    </h3>
                </div>

                {/* Status Pulse */}
                <div className="flex items-center gap-1.5 shrink-0" title="Enlace Neural Estable">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                </div>
            </div>

            {/* ID Hash (Cosmetic) */}
            <div className="flex justify-end mt-1">
                <span className="text-[9px] font-mono text-titanium-600 truncate max-w-full opacity-50">
                    ID: {currentProjectId.substring(0, 8)}...
                </span>
            </div>
        </div>
    );
};

export default ProjectHUD;
