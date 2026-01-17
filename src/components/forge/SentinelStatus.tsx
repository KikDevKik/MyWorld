import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Cloud, CloudOff, RefreshCw, X } from 'lucide-react';

interface SentinelStatusProps {
    onClose: () => void;
    isSecurityReady: boolean;
    isOffline: boolean;
}

const SentinelStatus: React.FC<SentinelStatusProps> = ({ onClose, isSecurityReady, isOffline }) => {

    const handlePurge = () => {
        console.log("Purge sequence initiated");
    };

    return (
        <div className="h-full bg-titanium-950 border-l border-titanium-800 flex flex-col w-80">
            {/* HEADER */}
            <div className="h-14 border-b border-titanium-800 flex items-center justify-between px-4 bg-titanium-900/50">
                <span className="text-xs font-mono tracking-widest text-titanium-400 uppercase">SISTEMAS SENTINEL</span>
                <button
                    onClick={onClose}
                    className="text-titanium-500 hover:text-titanium-200 transition-colors"
                >
                    <X size={16} />
                </button>
            </div>

            {/* DASHBOARD CONTENT */}
            <div className="p-4 space-y-6 overflow-y-auto flex-1">

                {/* 1. STATUS GRID */}
                <div className="grid grid-cols-2 gap-3">
                    {/* SECURITY STATUS */}
                    <div className={`
                        p-3 rounded-lg border flex flex-col gap-2 items-center justify-center
                        ${isSecurityReady
                            ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-500'
                            : 'bg-red-950/20 border-red-900/50 text-red-500'}
                    `}>
                        {isSecurityReady ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold tracking-widest uppercase">DEFENSE</span>
                            <span className="text-xs font-mono">{isSecurityReady ? 'ACTIVE' : 'OFFLINE'}</span>
                        </div>
                    </div>

                    {/* SYNC STATUS */}
                    <div className={`
                        p-3 rounded-lg border flex flex-col gap-2 items-center justify-center
                        ${!isOffline
                            ? 'bg-cyan-950/20 border-cyan-900/50 text-cyan-500'
                            : 'bg-amber-950/20 border-amber-900/50 text-amber-500'}
                    `}>
                        {!isOffline ? <Cloud size={24} /> : <CloudOff size={24} />}
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold tracking-widest uppercase">UPLINK</span>
                            <span className="text-xs font-mono">{!isOffline ? 'SYNCED' : 'PENDING'}</span>
                        </div>
                    </div>
                </div>

                {/* 2. JANITOR / MAINTENANCE */}
                <div className="space-y-3 pt-4 border-t border-titanium-800">
                    <div className="flex items-center justify-between text-titanium-400">
                        <div className="flex items-center gap-2">
                            <RefreshCw size={14} className="animate-spin-slow" />
                            <span className="text-xs font-bold uppercase tracking-wider">Mantenimiento</span>
                        </div>
                        <span className="text-xs font-mono text-emerald-500">100% CLEAN</span>
                    </div>

                    {/* Integrity Bar (Static for now) */}
                    <div className="h-1.5 w-full bg-titanium-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 w-full" />
                    </div>

                    <p className="text-[10px] text-titanium-500 leading-relaxed">
                        El sistema de limpieza de ecos elimina archivos huérfanos y fragmentos de memoria corruptos para mantener la integridad de la Forja.
                    </p>

                    {/* PURGE BUTTON */}
                    <button
                        onClick={handlePurge}
                        className="w-full mt-2 py-3 px-4 rounded border border-red-900/30 bg-red-950/10 text-red-500 text-xs font-bold tracking-widest hover:bg-red-900/20 hover:border-red-500/50 transition-all duration-300 uppercase flex items-center justify-center gap-2 group"
                    >
                        <ShieldAlert size={14} className="group-hover:scale-110 transition-transform" />
                        Ejecutar Purga de Ecos
                    </button>
                </div>

            </div>
        </div>
    );
};

export default SentinelStatus;
