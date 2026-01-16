import React from 'react';
import { useProjectConfig } from '../ProjectConfigContext';

const ProjectHUD: React.FC = () => {
    const { currentProjectName, currentProjectId } = useProjectConfig();

    if (!currentProjectId) return null;

    return (
        <div className="px-4">
            <div className="bg-titanium-900/50 rounded-lg p-3 border border-titanium-700/50 flex items-center justify-between group hover:border-cyan-500/30 transition-colors cursor-default shadow-sm">
                <div className="flex flex-col overflow-hidden">
                    <span className="text-[10px] text-cyan-500/70 font-mono tracking-widest uppercase mb-0.5">
                        Identidad
                    </span>
                    <h3 className="text-sm font-bold text-cyan-100 truncate pr-2 group-hover:text-cyan-400 transition-colors">
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
