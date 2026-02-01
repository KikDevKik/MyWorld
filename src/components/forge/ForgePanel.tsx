import React, { useState, useEffect } from 'react';
import { Hammer, FolderInput, Book, FolderPlus, ArrowLeft, RefreshCw, AlertTriangle, Search, Unlink, Settings, User, PawPrint } from 'lucide-react';
import { toast } from 'sonner';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import ForgeDashboard from './ForgeDashboard';
import InternalFolderSelector from '../InternalFolderSelector';
import { ProjectConfig, DriveFile } from '../../types';

interface ForgePanelProps {
    onClose: () => void;
    folderId: string; // Project Root ID (Context)
    accessToken: string | null;
}

const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, updateConfig, loading } = useProjectConfig();

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

    // --- 3. RENDER ---

    if (loading || isResolving) {
        return (
             <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-500 gap-4">
                <RefreshCw size={40} className="animate-spin text-accent-DEFAULT" />
                <p className="text-sm font-mono opacity-70">Sincronizando Bóvedas...</p>
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
                                                <span>Conectado: {characterSaga.name}</span>
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-xs text-red-400 font-bold">Desconectado (Requerido)</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {characterSaga ? (
                                        <button onClick={() => handleUnlink('CHARACTER')} className="px-4 py-2 text-titanium-400 hover:text-red-400 text-sm font-medium">Desvincular</button>
                                    ) : (
                                        <button onClick={() => handleCreateVault('CHARACTER')} className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 rounded-lg text-sm">Crear</button>
                                    )}
                                    <button
                                        onClick={() => handleOpenSelector('CHARACTER')}
                                        className="px-6 py-2 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-white rounded-lg text-sm font-bold shadow-sm"
                                    >
                                        {characterSaga ? 'Cambiar' : 'Conectar'}
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
                                                <span>Conectado: {bestiarySaga.name}</span>
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-xs text-titanium-600">Opcional</div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {bestiarySaga ? (
                                        <button onClick={() => handleUnlink('BESTIARY')} className="px-4 py-2 text-titanium-400 hover:text-red-400 text-sm font-medium">Desvincular</button>
                                    ) : (
                                        <button onClick={() => handleCreateVault('BESTIARY')} className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-200 rounded-lg text-sm">Crear</button>
                                    )}
                                    <button
                                        onClick={() => handleOpenSelector('BESTIARY')}
                                        className="px-6 py-2 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-white rounded-lg text-sm font-bold shadow-sm"
                                    >
                                        {bestiarySaga ? 'Cambiar' : 'Conectar'}
                                    </button>
                                </div>
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
                            <h3 className="text-xl font-bold text-white mb-2">Confirmar Vinculación</h3>
                            <p className="text-titanium-400 mb-6">
                                ¿Vincular <strong>{pendingFolder.name}</strong> como {targetVault === 'CHARACTER' ? 'Bóveda de Personajes' : 'Bestiario'}?
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => setShowConfirmation(false)} className="flex-1 py-3 bg-titanium-800 rounded-lg text-titanium-300">Cancelar</button>
                                <button onClick={confirmSelection} className="flex-1 py-3 bg-accent-DEFAULT text-titanium-950 font-bold rounded-lg">Confirmar</button>
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
