import React, { useState, useEffect } from 'react';
import { Hammer, FolderInput, Book, FolderPlus, ArrowLeft, RefreshCw, AlertTriangle, Search, Unlink, Settings, User, PawPrint, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import ForgeDashboard from './ForgeDashboard';
import InternalFolderSelector from '../InternalFolderSelector';
import { ProjectConfig, DriveFile } from '../../types';
import { callFunction } from '../../services/api';

interface ForgePanelProps {
    onClose: () => void;
    folderId: string; // Project Root ID (Context)
    accessToken: string | null;
}

const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, updateConfig, loading } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];

    // 🟢 SAGA STATE
    const [characterSaga, setCharacterSaga] = useState<DriveFile | null>(null);
    const [bestiarySaga, setBestiarySaga] = useState<DriveFile | null>(null);
    const [isResolving, setIsResolving] = useState(false);

    // 🟢 VIEW STATE
    // If no character vault, force SETTINGS. Otherwise DASHBOARD.
    const [viewMode, setViewMode] = useState<'DASHBOARD' | 'SETTINGS'>('DASHBOARD');

    // 🟢 SELECTION STATE
    const [showSelector, setShowSelector] = useState(false);
    const [targetVault, setTargetVault] = useState<'CHARACTER' | 'BESTIARY'>('CHARACTER');
    const [pendingFolder, setPendingFolder] = useState<{ id: string, name: string } | null>(null);
    const [showConfirmation, setShowConfirmation] = useState(false);

    // 🟢 DANGER ZONE STATE
    const [showDangerConfirm, setShowDangerConfirm] = useState(false);
    const [isPurging, setIsPurging] = useState(false);

    // --- 1. RESOLVER ---
    useEffect(() => {
        const resolveVaults = async () => {
            if (loading || !config) return;

            // If we already have sagas match config, skip
            if (characterSaga?.id === config.characterVaultId && bestiarySaga?.id === config.bestiaryVaultId) return;

            setIsResolving(true);
            try {
                // Helper to resolve one ID
                const resolve = async (id: string | null | undefined): Promise<DriveFile | null> => {
                    if (!id) return null;
                    // Check Canon Paths first
                    const existing = config.canonPaths.find(p => p.id === id);
                    if (existing) return { id: existing.id, name: existing.name, type: 'folder', mimeType: 'application/vnd.google-apps.folder' };

                    // Fetch from Drive
                    if (accessToken) {
                         const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType`, {
                           headers: { Authorization: `Bearer ${accessToken}` }
                       });
                       if (res.ok) {
                           const file = await res.json();
                           return { id: file.id, name: file.name, type: 'folder', mimeType: file.mimeType };
                       }
                    }
                    // Fallback
                    return { id, name: "Carpeta Desconocida", type: 'folder', mimeType: 'application/vnd.google-apps.folder' };
                };

                const [charVault, beastVault] = await Promise.all([
                    resolve(config.characterVaultId),
                    resolve(config.bestiaryVaultId)
                ]);

                setCharacterSaga(charVault);
                setBestiarySaga(beastVault);

                // Auto-redirect to Settings if missing primary vault
                if (!charVault) {
                    setViewMode('SETTINGS');
                } else if (viewMode === 'SETTINGS' && charVault) {
                    // Optional: Auto-switch to dashboard if just connected?
                    // Let's keep user in Settings until they click "Open Forge" or "Back"
                }

            } catch (e) {
                console.error("Error resolving vaults:", e);
            } finally {
                setIsResolving(false);
            }
        };
        resolveVaults();
    }, [config, loading, accessToken]);

    // --- 2. HANDLERS ---

    const handleOpenSelector = (target: 'CHARACTER' | 'BESTIARY') => {
        setTargetVault(target);
        setShowSelector(true);
    };

    const handleFolderSelected = (folder: { id: string; name: string }) => {
        setPendingFolder(folder);
        setShowSelector(false);
        setShowConfirmation(true);
    };

    const confirmSelection = async () => {
        if (!pendingFolder || !config) return;
        try {
            const newConfig: ProjectConfig = { ...config };
            if (targetVault === 'CHARACTER') newConfig.characterVaultId = pendingFolder.id;
            if (targetVault === 'BESTIARY') newConfig.bestiaryVaultId = pendingFolder.id;

            await updateConfig(newConfig);
            toast.success("Bóveda vinculada exitosamente.");

            // Local state update handled by useEffect
        } catch (e) {
            toast.error("Error al guardar configuración.");
        } finally {
            setShowConfirmation(false);
            setPendingFolder(null);
        }
    };

    const handleCreateVault = async (target: 'CHARACTER' | 'BESTIARY') => {
        if (!accessToken || !config) return;
        const name = target === 'CHARACTER' ? 'Personajes' : 'Bestiario';

        try {
             const metadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [folderId]
            };
            const res = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(metadata)
            });
            if (!res.ok) throw new Error("Failed to create folder");
            const file = await res.json();

            const newConfig: ProjectConfig = { ...config };
            if (target === 'CHARACTER') newConfig.characterVaultId = file.id;
            if (target === 'BESTIARY') newConfig.bestiaryVaultId = file.id;

            await updateConfig(newConfig);
            toast.success(`Carpeta /${name} creada y vinculada.`);
        } catch (e) {
            toast.error("Error al crear carpeta.");
        }
    };

    const handleUnlink = async (target: 'CHARACTER' | 'BESTIARY') => {
        if (!config) return;
        const newConfig = { ...config };
        if (target === 'CHARACTER') newConfig.characterVaultId = null;
        if (target === 'BESTIARY') newConfig.bestiaryVaultId = null;
        await updateConfig(newConfig);
        toast.info("Desvinculado.");
    };

    const handlePurgeDatabase = async () => {
        setIsPurging(true);
        const toastId = toast.loading("Eliminando base de datos...");
        try {
            await callFunction('purgeForgeDatabase');
            toast.success("Base de datos eliminada correctamente.", { id: toastId });
            setShowDangerConfirm(false);
        } catch (e) {
            console.error(e);
            toast.error("Error al eliminar base de datos.", { id: toastId });
        } finally {
            setIsPurging(false);
        }
    };

    // --- 3. RENDER ---

    if (loading || isResolving) {
        return (
             <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-500 gap-4">
                <RefreshCw size={40} className="animate-spin text-accent-DEFAULT" />
                <p className="text-sm font-mono opacity-70">{t.common.syncing}</p>
            </div>
        );
    }

    // A. SETTINGS VIEW (Connections Manager)
    if (viewMode === 'SETTINGS') {
        return (
            <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
                {/* Header */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                    <div className="flex items-center gap-3 text-white">
                        {characterSaga && (
                            <button onClick={() => setViewMode('DASHBOARD')} className="p-1 hover:bg-titanium-800 rounded-full mr-2">
                                <ArrowLeft size={20} />
                            </button>
                        )}
                        <Settings size={20} className="text-titanium-400" />
                        <h2 className="font-bold text-lg">Configuración de la Forja</h2>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 overflow-y-auto">
                    <div className="max-w-3xl mx-auto">
                        <h3 className="text-xs font-bold text-titanium-500 uppercase tracking-widest mb-6">Nivel 2: Las Entidades (Base de Datos)</h3>

                        <div className="flex flex-col gap-4">

                            {/* ROW 1: CHARACTERS */}
                            <div className="p-6 bg-titanium-900 border border-titanium-800 rounded-2xl flex items-center justify-between hover:border-accent-DEFAULT/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${characterSaga ? 'bg-accent-DEFAULT/20 text-accent-DEFAULT' : 'bg-titanium-800 text-titanium-600'}`}>
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-titanium-100 text-lg">Personajes (Forja)</h4>
                                        <p className="text-sm text-titanium-500">Humanoides con diálogo y psicología compleja.</p>
                                        {characterSaga ? (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-accent-DEFAULT font-mono">
                                                <CheckCircleIcon />
                                        <span>{t.common.connected}: {characterSaga.name}</span>
                                            </div>
                                        ) : (
                                    <div className="mt-2 text-xs text-red-400 font-bold">{t.common.disconnected}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {characterSaga ? (
                                <button onClick={() => handleUnlink('CHARACTER')} className="px-4 py-2 text-titanium-400 hover:text-red-400 text-sm font-medium">{t.common.unlink}</button>
                                    ) : (
                                <button onClick={() => handleCreateVault('CHARACTER')} className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 rounded-lg text-sm">{t.common.create}</button>
                                    )}
                                    <button
                                        onClick={() => handleOpenSelector('CHARACTER')}
                                        className="px-6 py-2 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-white rounded-lg text-sm font-bold shadow-sm"
                                    >
                                {characterSaga ? t.common.change : t.status.connect}
                                    </button>
                                </div>
                            </div>

                            {/* ROW 2: BESTIARY */}
                            <div className="p-6 bg-titanium-900 border border-titanium-800 rounded-2xl flex items-center justify-between hover:border-emerald-500/30 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bestiarySaga ? 'bg-emerald-500/20 text-emerald-500' : 'bg-titanium-800 text-titanium-600'}`}>
                                        <PawPrint size={24} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-titanium-100 text-lg">Bestiario</h4>
                                        <p className="text-sm text-titanium-500">Criaturas, Monstruos, Flora y Fauna.</p>
                                        {bestiarySaga ? (
                                            <div className="mt-2 flex items-center gap-2 text-xs text-emerald-500 font-mono">
                                                <CheckCircleIcon />
                                        <span>{t.common.connected}: {bestiarySaga.name}</span>
                                            </div>
                                        ) : (
                                    <div className="mt-2 text-xs text-titanium-600">{t.common.optional}</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {bestiarySaga ? (
                                <button onClick={() => handleUnlink('BESTIARY')} className="px-4 py-2 text-titanium-400 hover:text-red-400 text-sm font-medium">{t.common.unlink}</button>
                                    ) : (
                                <button onClick={() => handleCreateVault('BESTIARY')} className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 rounded-lg text-sm">{t.common.create}</button>
                                    )}
                                    <button
                                        onClick={() => handleOpenSelector('BESTIARY')}
                                        className="px-6 py-2 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-white rounded-lg text-sm font-bold shadow-sm"
                                    >
                                {bestiarySaga ? t.common.change : t.status.connect}
                                    </button>
                                </div>
                            </div>

                        </div>

                         {/* DANGER ZONE */}
                         <div className="mt-8 border-t border-red-900/30 pt-8">
                            <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <AlertTriangle size={14} />
                                Zona de Peligro
                            </h3>

                            <div className="p-6 bg-red-950/10 border border-red-900/30 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h4 className="font-bold text-red-400 text-lg">Eliminar Base de Datos</h4>
                                    <p className="text-sm text-red-300/60 max-w-md mt-1">
                                        Elimina todos los personajes, entidades y vectores derivados para reiniciar la Forja.
                                        <br/>
                                        <span className="font-bold text-red-400">Tus archivos de Drive y Chats NO se eliminarán.</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowDangerConfirm(true)}
                                    className="px-6 py-3 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 font-bold rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                                >
                                    <Trash2 size={18} />
                                    Eliminar Datos
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                 {/* MODAL: SELECTOR */}
                 {showSelector && (
                    <InternalFolderSelector
                        onFolderSelected={handleFolderSelected}
                        onCancel={() => setShowSelector(false)}
                        currentFolderId={targetVault === 'CHARACTER' ? config?.characterVaultId : config?.bestiaryVaultId}
                    />
                )}

                {/* MODAL: CONFIRMATION */}
                {showConfirmation && pendingFolder && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div className="w-full max-w-md bg-titanium-900 border border-accent-DEFAULT/30 rounded-2xl p-6">
                            <h3 className="text-xl font-bold text-white mb-2">{t.common.confirmation}</h3>
                            <p className="text-titanium-400 mb-6">
                                ¿Vincular <strong>{pendingFolder.name}</strong> como {targetVault === 'CHARACTER' ? 'Bóveda de Personajes' : 'Bestiario'}?
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowConfirmation(false)} className="flex-1 py-3 bg-titanium-800 rounded-lg text-titanium-300">{t.common.cancel}</button>
                                <button onClick={confirmSelection} className="flex-1 py-3 bg-accent-DEFAULT text-titanium-950 font-bold rounded-lg">{t.common.confirm}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* MODAL: DANGER CONFIRMATION */}
                {showDangerConfirm && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md bg-titanium-950 border border-red-500/50 rounded-2xl p-6 shadow-2xl shadow-red-900/20">
                            <div className="flex items-center gap-3 mb-4 text-red-500">
                                <AlertTriangle size={32} />
                                <h3 className="text-xl font-bold">¿Estás absolutamente seguro?</h3>
                            </div>

                            <p className="text-titanium-300 mb-4 leading-relaxed">
                                Esta acción eliminará permanentemente la base de datos de la Forja (Personajes, Entidades, Relaciones).
                            </p>
                            <ul className="text-sm text-red-300 mb-6 space-y-2 list-disc list-inside bg-red-950/20 p-4 rounded-lg border border-red-900/30">
                                <li>Se borrarán los índices vectoriales.</li>
                                <li>Se borrará la lista de personajes detectados.</li>
                                <li>Tendrás que volver a escanear tus carpetas.</li>
                                <li className="font-bold text-white">Tus archivos en Drive NO se tocarán.</li>
                                <li className="font-bold text-white">Tus chats NO se borrarán.</li>
                            </ul>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDangerConfirm(false)}
                                    disabled={isPurging}
                                    className="flex-1 py-3 bg-titanium-800 hover:bg-titanium-700 rounded-lg text-titanium-200 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handlePurgeDatabase}
                                    disabled={isPurging}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg hover:shadow-red-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                    {isPurging ? (
                                        <>
                                            <RefreshCw size={18} className="animate-spin" />
                                            Eliminando...
                                        </>
                                    ) : (
                                        <>
                                            <Trash2 size={18} />
                                            Confirmar Eliminación
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // B. DASHBOARD VIEW
    // Pass everything needed to Dashboard
    return (
        <ForgeDashboard
            folderId={folderId}
            accessToken={accessToken}
            characterSaga={characterSaga}
            bestiarySaga={bestiarySaga}
            onOpenSettings={() => setViewMode('SETTINGS')}
        />
    );
};

// Icon Helper
const CheckCircleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
);

export default ForgePanel;
