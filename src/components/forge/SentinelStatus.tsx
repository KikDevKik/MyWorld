import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Cloud, CloudOff, RefreshCw, X, Trash2, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { callFunction } from '../../services/api';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface SentinelStatusProps {
    onClose: () => void;
    isSecurityReady: boolean;
    isOffline: boolean;
    accessToken?: string | null;
}

interface ScanResult {
    health: number;
    ghostCount: number;
    ghosts: { id: string; name: string; size: string; mimeType: string }[];
}

const SentinelStatus: React.FC<SentinelStatusProps> = ({ onClose, isSecurityReady, isOffline, accessToken }) => {
    const { config, fileTree, isFileTreeLoading } = useProjectConfig();
    const { showOnlyHealthy, toggleShowOnlyHealthy } = useLayoutStore();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tForge = t.forge;

    // UI State
    const [isScanning, setIsScanning] = useState(false);
    const [isPurging, setIsPurging] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);

    // 🟢 HANDLE SCAN
    const handleScan = async () => {
        if (!config?.folderId) {
            toast.error(t.common?.noVaultConfig || "No hay carpeta de proyecto configurada.");
            return;
        }

        setIsScanning(true);
        setScanResult(null);

        const token = accessToken;
        if (!token) {
            toast.error(t.common?.sessionExpired || "Token de acceso expirado. Por favor, refresca la página.");
            setIsScanning(false);
            return;
        }

        try {
            const data = await callFunction<ScanResult>('scanVaultHealth', {
                folderId: config.folderId,
                accessToken: token
            });
            setScanResult(data);

            if (data.ghostCount > 0) {
                toast.warning(`${data.ghostCount} ${tForge.ghostsDetected || 'fantasmas detectados'}.`);
            } else {
                toast.success(t.common?.systemClean || "Sistema limpio. Integridad al 100%.");
            }

        } catch (error: any) {
            console.error("Scan Error:", error);
            toast.error(`${t.common?.scanError || 'Error de escaneo'}: ${error.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    // 🟢 HANDLE PURGE
    const handlePurge = async () => {
        if (!scanResult || scanResult.ghostCount === 0) return;

        if (!confirm(`${t.common?.confirmPurge || '¿CONFIRMAR PURGA?'} ${t.common?.purgeCountDesc?.replace('{count}', String(scanResult.ghostCount)) || `Se eliminarán permanentemente ${scanResult.ghostCount} archivos fantasma.`}`)) {
            return;
        }

        setIsPurging(true);
        const token = accessToken;

        try {
            const ghostIds = scanResult.ghosts.map(g => g.id);
            await callFunction('purgeArtifacts', {
                fileIds: ghostIds,
                accessToken: token
            });

            toast.success(t.common?.purgeComplete || "Purga completada. Artefactos eliminados.");

            // Re-scan to confirm clean state
            handleScan();

        } catch (error: any) {
            console.error("Purge Error:", error);
            toast.error(`${t.common?.purgeError || 'Error durante la purga'}: ${error.message}`);
        } finally {
            setIsPurging(false);
        }
    };

    return (
        <div className="h-full bg-titanium-950 border-l border-titanium-800 flex flex-col w-80 shadow-2xl z-50">
            {/* HEADER */}
            <div className="h-14 border-b border-titanium-800 flex items-center justify-between px-4 bg-titanium-900/50">
                <span className="text-xs font-mono tracking-widest text-titanium-400 uppercase">{tForge.sentinelSystems || "SISTEMAS SENTINEL"}</span>
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
                        p-3 rounded-lg border flex flex-col gap-2 items-center justify-center transition-all duration-500
                        ${isSecurityReady
                            ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                            : 'bg-red-950/20 border-red-900/50 text-red-500 animate-pulse'}
                    `}>
                        {isSecurityReady ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold tracking-widest uppercase">{t.common?.defense || 'DEFENSE'}</span>
                            <span className="text-xs font-mono">{isSecurityReady ? (t.common?.active || 'ACTIVE') : (t.common?.offline || 'OFFLINE')}</span>
                        </div>
                    </div>

                    {/* SYNC STATUS */}
                    <div className={`
                        p-3 rounded-lg border flex flex-col gap-2 items-center justify-center transition-all duration-500
                        ${!isOffline
                            ? 'bg-cyan-950/20 border-cyan-900/50 text-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                            : 'bg-amber-950/20 border-amber-900/50 text-amber-500'}
                    `}>
                        {!isOffline ? <Cloud size={24} /> : <CloudOff size={24} />}
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold tracking-widest uppercase">{t.common?.uplink || 'UPLINK'}</span>
                            <span className="text-xs font-mono">{!isOffline ? (t.common?.synced || 'SYNCED') : (t.common?.pending || 'PENDING')}</span>
                        </div>
                    </div>
                </div>

                {/* 2. VISUAL FILTERS */}
                <div className="pt-4 border-t border-titanium-800">
                     <div className="flex items-center justify-between pb-4">
                         <span className="text-xs font-bold text-titanium-400 uppercase tracking-wider flex items-center gap-2">
                             <Eye size={14} /> {t.common?.onlyHealthy || 'Solo Sanos'}
                         </span>
                         <button
                            onClick={toggleShowOnlyHealthy}
                            className={`
                                relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-titanium-900
                                ${showOnlyHealthy ? 'bg-cyan-600' : 'bg-titanium-700'}
                            `}
                            title={t.common?.hideCorruptFiles || "Ocultar archivos corruptos o en conflicto"}
                         >
                            <span
                                className={`
                                    inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                                    ${showOnlyHealthy ? 'translate-x-5' : 'translate-x-1'}
                                `}
                            />
                         </button>
                    </div>
                </div>

                {/* 3. JANITOR / MAINTENANCE */}
                <div className="space-y-4 pt-4 border-t border-titanium-800">
                    <div className="flex items-center justify-between text-titanium-400">
                        <div className="flex items-center gap-2">
                            <RefreshCw size={14} className={isScanning || isPurging ? "animate-spin" : ""} />
                            <span className="text-xs font-bold uppercase tracking-wider">{t.common?.janitorProtocol || 'Janitor Protocol'}</span>
                        </div>
                        {scanResult && (
                            <span className={`text-xs font-mono ${scanResult.health < 100 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {scanResult.health}% {t.common?.health || 'HEALTH'}
                            </span>
                        )}
                    </div>

                    {/* INTEGRITY BAR */}
                    <div className="h-2 w-full bg-titanium-900 rounded-full overflow-hidden relative">
                        <div
                            className={`h-full transition-all duration-1000 ${
                                !scanResult ? 'bg-titanium-700 w-full opacity-20' :
                                scanResult.health < 50 ? 'bg-red-500' :
                                scanResult.health < 90 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: scanResult ? `${scanResult.health}%` : '100%' }}
                        />
                    </div>

                    {/* SCAN FEEDBACK AREA */}
                    {!scanResult ? (
                        <div className="bg-titanium-900/30 border border-titanium-800 rounded p-3 text-center">
                            <p className="text-[10px] text-titanium-500 leading-relaxed mb-2">
                                {tForge.janitorDesc || "El sistema de limpieza de ecos elimina archivos huérfanos (<10 bytes) para mantener la integridad."}
                            </p>
                            <button
                                onClick={handleScan}
                                disabled={isScanning}
                                className="w-full py-2 px-3 rounded bg-titanium-800 hover:bg-titanium-700 text-titanium-300 text-[10px] font-bold uppercase tracking-wide transition-all border border-titanium-700 hover:border-cyan-500/30 flex items-center justify-center gap-2"
                            >
                                {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                {isScanning ? (t.common?.scanning || "Escaneando...") : (t.common?.startScan || "Iniciar Escaneo")}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                            {/* RESULTS CARD */}
                            <div className={`
                                p-3 rounded border text-xs
                                ${scanResult.ghostCount > 0
                                    ? 'bg-red-950/10 border-red-900/30 text-red-400'
                                    : 'bg-emerald-950/10 border-emerald-900/30 text-emerald-400'}
                            `}>
                                {scanResult.ghostCount > 0 ? (
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold uppercase">{t.common?.detectedCountDesc?.replace('{count}', String(scanResult.ghostCount)) || `DETECTADOS ${scanResult.ghostCount} FANTASMAS`}</span>
                                            <span className="text-[10px] opacity-80">{tForge.ghostsDesc || "Archivos vacíos o corruptos encontrados en el Drive."}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={14} />
                                        <span className="font-bold uppercase">{t.common?.systemClean || "SISTEMA LIMPIO"}</span>
                                    </div>
                                )}
                            </div>

                            {/* ACTION BUTTONS */}
                            {scanResult.ghostCount > 0 ? (
                                <button
                                    onClick={handlePurge}
                                    disabled={isPurging}
                                    className="w-full py-3 px-4 rounded border border-red-500/30 bg-red-500/10 text-red-500 text-xs font-bold tracking-widest hover:bg-red-500/20 hover:border-red-500/50 transition-all duration-300 uppercase flex items-center justify-center gap-2 group shadow-[0_0_15px_rgba(239,68,68,0.1)]"
                                >
                                    {isPurging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} className="group-hover:scale-110 transition-transform" />}
                                    {isPurging ? (t.common?.purging || "Purgando...") : (t.common?.executePurge || "Ejecutar Purga")}
                                </button>
                            ) : (
                                <button
                                    onClick={handleScan}
                                    disabled={isScanning}
                                    className="w-full py-2 px-3 rounded bg-titanium-800 hover:bg-titanium-700 text-titanium-400 text-[10px] uppercase tracking-wide transition-all border border-titanium-700"
                                >
                                    {t.common?.rescan || "Re-escanear"}
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 4. FILE SYSTEM STATS (Context Aware) */}
                <div className="pt-4 border-t border-titanium-800">
                    <span className="text-[10px] font-bold text-titanium-500 uppercase tracking-widest mb-2 block">{tForge.vaultStats || "Estadísticas del Baúl"}</span>
                    <div className="grid grid-cols-2 gap-2 text-xs text-titanium-300">
                        <div className="bg-titanium-900/50 p-2 rounded flex justify-between">
                            <span>{t.common?.files || "Archivos"}:</span>
                            <span className="font-mono text-cyan-500">{fileTree ? fileTree.length : '...'}</span>
                        </div>
                        <div className="bg-titanium-900/50 p-2 rounded flex justify-between">
                            <span>{t.common?.status || "Estado"}:</span>
                            <span className={`font-mono ${isFileTreeLoading ? 'text-yellow-500' : 'text-emerald-500'}`}>
                                {isFileTreeLoading ? (t.common?.loading || 'LOADING') : (t.common?.ready || 'READY')}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SentinelStatus;
