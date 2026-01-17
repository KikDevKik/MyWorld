import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Cloud, CloudOff, RefreshCw, X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { useProjectConfig } from '../ProjectConfigContext';

interface SentinelStatusProps {
    onClose: () => void;
    isSecurityReady: boolean;
    isOffline: boolean;
}

interface ScanResult {
    health: number;
    ghostCount: number;
    ghosts: { id: string; name: string; size: string; mimeType: string }[];
}

const SentinelStatus: React.FC<SentinelStatusProps> = ({ onClose, isSecurityReady, isOffline }) => {
    const { config, fileTree, isFileTreeLoading } = useProjectConfig();

    // UI State
    const [isScanning, setIsScanning] = useState(false);
    const [isPurging, setIsPurging] = useState(false);
    const [scanResult, setScanResult] = useState<ScanResult | null>(null);

    // 🟢 CLOUD FUNCTIONS
    const functions = getFunctions();
    const scanVaultHealth = httpsCallable(functions, 'scanVaultHealth');
    const purgeArtifacts = httpsCallable(functions, 'purgeArtifacts');

    // 🟢 HANDLE SCAN
    const handleScan = async () => {
        if (!config?.folderId) {
            toast.error("No hay carpeta de proyecto configurada.");
            return;
        }

        setIsScanning(true);
        setScanResult(null);

        // Get accessToken (Need to handle this cleanly, ideally passed or context,
        // but for now relying on user context via standard means or prop drilling not available here.
        // Wait, SentinelStatus doesn't have accessToken prop.
        // We usually rely on `auth.currentUser` but onCall sends auth token automatically.
        // HOWEVER, `scanVaultHealth` needs `accessToken` for Google Drive API.
        // We need to fetch it from storage or prompt refresh.
        // App.tsx manages oauthToken. We should probably accept it as a prop or lift state.
        // The user instruction implies connecting logic.
        // Let's assume we can get it from localStorage for now as a fallback or assume component props.
        // But App.tsx renders SentinelStatus. Let's check App.tsx props passed to SentinelStatus.
        // App.tsx passes: onClose, isSecurityReady, isOffline. NO accessToken.
        // I need to add accessToken to SentinelStatusProps in App.tsx!
        // FOR NOW: I will try to retrieve from localStorage 'google_drive_token' as a fallback,
        // or prompt the user. But since I can't easily change App.tsx props *inside* this file edit,
        // I will use localStorage logic which App.tsx uses.

        const token = localStorage.getItem('google_drive_token');
        if (!token) {
            toast.error("Token de acceso expirado. Por favor, refresca la página.");
            setIsScanning(false);
            return;
        }

        try {
            const result = await scanVaultHealth({
                folderId: config.folderId,
                accessToken: token
            });
            const data = result.data as ScanResult;
            setScanResult(data);

            if (data.ghostCount > 0) {
                toast.warning(`${data.ghostCount} fantasmas detectados.`);
            } else {
                toast.success("Sistema limpio. Integridad al 100%.");
            }

        } catch (error: any) {
            console.error("Scan Error:", error);
            toast.error(`Error de escaneo: ${error.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    // 🟢 HANDLE PURGE
    const handlePurge = async () => {
        if (!scanResult || scanResult.ghostCount === 0) return;

        if (!confirm(`¿CONFIRMAR PURGA? Se eliminarán permanentemente ${scanResult.ghostCount} archivos fantasma.`)) {
            return;
        }

        setIsPurging(true);
        const token = localStorage.getItem('google_drive_token'); // Fallback

        try {
            const ghostIds = scanResult.ghosts.map(g => g.id);
            const result = await purgeArtifacts({
                fileIds: ghostIds,
                accessToken: token
            });

            toast.success("Purga completada. Artefactos eliminados.");

            // Re-scan to confirm clean state
            handleScan();

        } catch (error: any) {
            console.error("Purge Error:", error);
            toast.error(`Error durante la purga: ${error.message}`);
        } finally {
            setIsPurging(false);
        }
    };

    return (
        <div className="h-full bg-titanium-950 border-l border-titanium-800 flex flex-col w-80 shadow-2xl z-50">
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
                        p-3 rounded-lg border flex flex-col gap-2 items-center justify-center transition-all duration-500
                        ${isSecurityReady
                            ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                            : 'bg-red-950/20 border-red-900/50 text-red-500 animate-pulse'}
                    `}>
                        {isSecurityReady ? <ShieldCheck size={24} /> : <ShieldAlert size={24} />}
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold tracking-widest uppercase">DEFENSE</span>
                            <span className="text-xs font-mono">{isSecurityReady ? 'ACTIVE' : 'OFFLINE'}</span>
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
                            <span className="text-[10px] font-bold tracking-widest uppercase">UPLINK</span>
                            <span className="text-xs font-mono">{!isOffline ? 'SYNCED' : 'PENDING'}</span>
                        </div>
                    </div>
                </div>

                {/* 2. JANITOR / MAINTENANCE */}
                <div className="space-y-4 pt-4 border-t border-titanium-800">
                    <div className="flex items-center justify-between text-titanium-400">
                        <div className="flex items-center gap-2">
                            <RefreshCw size={14} className={isScanning || isPurging ? "animate-spin" : ""} />
                            <span className="text-xs font-bold uppercase tracking-wider">Janitor Protocol</span>
                        </div>
                        {scanResult && (
                            <span className={`text-xs font-mono ${scanResult.health < 100 ? 'text-red-500' : 'text-emerald-500'}`}>
                                {scanResult.health}% HEALTH
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
                                El sistema de limpieza de ecos elimina archivos huérfanos (&lt;10 bytes) para mantener la integridad.
                            </p>
                            <button
                                onClick={handleScan}
                                disabled={isScanning}
                                className="w-full py-2 px-3 rounded bg-titanium-800 hover:bg-titanium-700 text-titanium-300 text-[10px] font-bold uppercase tracking-wide transition-all border border-titanium-700 hover:border-cyan-500/30 flex items-center justify-center gap-2"
                            >
                                {isScanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                {isScanning ? "Escaneando..." : "Iniciar Escaneo"}
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
                                            <span className="font-bold">DETECTADOS {scanResult.ghostCount} FANTASMAS</span>
                                            <span className="text-[10px] opacity-80">Archivos vacíos o corruptos encontrados en el Drive.</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ShieldCheck size={14} />
                                        <span className="font-bold">SISTEMA LIMPIO</span>
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
                                    {isPurging ? "Purgando..." : "Ejecutar Purga"}
                                </button>
                            ) : (
                                <button
                                    onClick={handleScan}
                                    disabled={isScanning}
                                    className="w-full py-2 px-3 rounded bg-titanium-800 hover:bg-titanium-700 text-titanium-400 text-[10px] uppercase tracking-wide transition-all border border-titanium-700"
                                >
                                    Re-escanear
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* 3. FILE SYSTEM STATS (Context Aware) */}
                <div className="pt-4 border-t border-titanium-800">
                    <span className="text-[10px] font-bold text-titanium-500 uppercase tracking-widest mb-2 block">Estadísticas del Baúl</span>
                    <div className="grid grid-cols-2 gap-2 text-xs text-titanium-300">
                        <div className="bg-titanium-900/50 p-2 rounded flex justify-between">
                            <span>Archivos:</span>
                            <span className="font-mono text-cyan-500">{fileTree ? fileTree.length : '...'}</span>
                        </div>
                        <div className="bg-titanium-900/50 p-2 rounded flex justify-between">
                            <span>Estado:</span>
                            <span className={`font-mono ${isFileTreeLoading ? 'text-yellow-500' : 'text-emerald-500'}`}>
                                {isFileTreeLoading ? 'LOADING' : 'READY'}
                            </span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default SentinelStatus;
