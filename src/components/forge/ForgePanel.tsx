import React, { useState, useEffect } from 'react';
import { Hammer, FolderInput, Book, FolderPlus, ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Search, Unlink } from 'lucide-react';
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

    // 🟢 SAGA STATE (The Vault)
    const [activeSaga, setActiveSaga] = useState<DriveFile | null>(null);
    const [isResolvingVault, setIsResolvingVault] = useState(false);

    // 🟢 SELECTION STATE
    const [showSelector, setShowSelector] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [showUnlinkConfirmation, setShowUnlinkConfirmation] = useState(false);
    const [pendingVault, setPendingVault] = useState<{ id: string, name: string } | null>(null);
    const [isCreatingVault, setIsCreatingVault] = useState(false);

    // --- 1. AUTO-DETECT VAULT ---
    useEffect(() => {
        const resolveVault = async () => {
            if (loading || !config) return;

            // If we have a vault ID, try to set it as active saga
            if (config.characterVaultId && !activeSaga && !isResolvingVault) {
                console.log("Found Character Vault ID:", config.characterVaultId);
                setIsResolvingVault(true);

                // We need the name. If it's in canonPaths, we can grab it.
                const existingPath = config.canonPaths.find(p => p.id === config.characterVaultId);
                if (existingPath) {
                    setActiveSaga({
                        id: existingPath.id,
                        name: existingPath.name,
                        type: 'folder',
                        mimeType: 'application/vnd.google-apps.folder'
                    });
                    setIsResolvingVault(false);
                    return;
                }

                // If not, fetch from Drive
                try {
                   if (accessToken) {
                       const res = await fetch(`https://www.googleapis.com/drive/v3/files/${config.characterVaultId}?fields=id,name,mimeType`, {
                           headers: { Authorization: `Bearer ${accessToken}` }
                       });
                       if (res.ok) {
                           const file = await res.json();
                           setActiveSaga({
                               id: file.id,
                               name: file.name,
                               type: 'folder',
                               mimeType: file.mimeType || 'application/vnd.google-apps.folder'
                           });
                       } else {
                           console.warn("Failed to resolve vault name. Using fallback.");
                           setActiveSaga({
                               id: config.characterVaultId,
                               name: "Bóveda de Personajes",
                               type: 'folder',
                               mimeType: 'application/vnd.google-apps.folder'
                           });
                       }
                   } else {
                        // If no token, fallback immediately
                        throw new Error("No access token for vault resolution");
                   }
                } catch (e) {
                    console.warn("Error resolving vault (using fallback):", e);
                    // Fallback for offline/error/ghost mode
                    setActiveSaga({
                       id: config.characterVaultId!,
                       name: "Bóveda de Personajes",
                       type: 'folder',
                       mimeType: 'application/vnd.google-apps.folder'
                   });
                } finally {
                    setIsResolvingVault(false);
                }
            }
        };

        resolveVault();
    }, [config, loading, accessToken]);

    // --- 2. OPTION A: CREATE VAULT ---
    const handleCreateVault = async () => {
        if (!accessToken || !config) return;
        setIsCreatingVault(true);

        try {
            // 1. Create Folder
            const metadata = {
                name: 'Personajes',
                mimeType: 'application/vnd.google-apps.folder',
                parents: [folderId] // Create in Project Root
            };

            const res = await fetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(metadata)
            });

            if (!res.ok) throw new Error("Failed to create folder");

            const file = await res.json();

            // 2. Update Config
            const newConfig: ProjectConfig = {
                ...config,
                characterVaultId: file.id
            };
            await updateConfig(newConfig);

            toast.success("Bóveda creada exitosamente: /Personajes");

            // 3. Set Active (State update will trigger, but we set manually for speed)
            setActiveSaga({
                id: file.id,
                name: 'Personajes',
                type: 'folder',
                mimeType: 'application/vnd.google-apps.folder'
            });

        } catch (error) {
            console.error("Error creating vault:", error);
            toast.error("Error creando la carpeta. Intenta de nuevo.");
        } finally {
            setIsCreatingVault(false);
        }
    };

    // --- 3. OPTION B: SELECT EXISTING ---
    const handleFolderSelected = (folder: { id: string; name: string }) => {
        setPendingVault(folder);
        setShowSelector(false);
        setShowConfirmation(true);
    };

    const confirmSelection = async () => {
        if (!pendingVault || !config) return;

        try {
             const newConfig: ProjectConfig = {
                ...config,
                characterVaultId: pendingVault.id
            };
            await updateConfig(newConfig);
            toast.success("Bóveda vinculada exitosamente.");

             setActiveSaga({
                id: pendingVault.id,
                name: pendingVault.name,
                type: 'folder',
                mimeType: 'application/vnd.google-apps.folder'
            });
        } catch (e) {
            toast.error("Error al guardar la configuración.");
        } finally {
            setShowConfirmation(false);
        }
    };

    // --- 4. UNLINK VAULT ---
    const handleUnlinkVault = async () => {
        if (!config) return;
        try {
            const newConfig: ProjectConfig = {
                ...config,
                characterVaultId: null // Clear it
            };
            await updateConfig(newConfig);
            setActiveSaga(null); // Clear local state immediately
            toast.success("Bóveda desvinculada. Regresando a configuración inicial.");
        } catch (e) {
            toast.error("Error al desvincular la bóveda.");
        } finally {
            setShowUnlinkConfirmation(false);
        }
    };

    // --- LOADING STATE ---
    if (loading || isResolvingVault) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-500 gap-4">
                <RefreshCw size={40} className="animate-spin text-accent-DEFAULT" />
                <p className="text-sm font-mono opacity-70">
                    {isResolvingVault ? "Localizando Bóveda..." : "Cargando Configuración..."}
                </p>
            </div>
        );
    }

    // --- DASHBOARD VIEW (VAULT ACTIVE) ---
    if (activeSaga) {
        return (
            <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
                {/* HEADER */}
                <div className="relative z-20 h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                    <div className="flex items-center gap-2 text-titanium-100">
                        <button
                            onClick={onClose}
                            className="p-1 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors mr-2"
                            title="Salir"
                            aria-label="Cerrar panel"
                        >
                             {/* Usually we don't go back to 'Selection' once selected, so this just closes or we can remove the back button */}
                            <ArrowLeft size={20} />
                        </button>

                        <span className="flex items-center gap-2 text-titanium-400 shrink-0">
                            <Hammer size={20} />
                            <span className="font-bold hidden md:inline">Forja de Almas</span>
                        </span>

                        <span className="text-titanium-600">/</span>

                        {/* 🟢 VAULT NAME IN HEADER */}
                        <div className="flex items-center gap-2 px-3 py-1 rounded bg-titanium-800/50 border border-titanium-700/50">
                            <Book size={14} className="text-accent-DEFAULT" />
                            <span className="font-bold text-sm text-titanium-200">Bóveda: {activeSaga.name}</span>
                        </div>

                        {/* UNLINK BUTTON */}
                        <button
                            onClick={() => setShowUnlinkConfirmation(true)}
                            className="p-1.5 ml-2 hover:bg-red-900/20 rounded text-titanium-500 hover:text-red-400 transition-colors"
                            title="Desvincular Bóveda"
                            aria-label="Desvincular Bóveda"
                        >
                            <Unlink size={16} />
                        </button>
                    </div>
                </div>

                {/* DASHBOARD */}
                <div className="flex-1 overflow-hidden relative">
                    <ForgeDashboard
                        folderId={folderId} // Project Root
                        accessToken={accessToken}
                        saga={activeSaga} // 🟢 Pass Vault as Saga
                    />
                </div>

                {/* MODAL: UNLINK CONFIRMATION (Inside Active View) */}
                {showUnlinkConfirmation && (
                    <div
                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="unlink-title"
                        aria-describedby="unlink-desc"
                    >
                        <div className="w-full max-w-md bg-titanium-900 border border-red-900/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden">

                            <div className="flex flex-col gap-4 relative z-10">
                                <div className="w-12 h-12 rounded-full bg-red-900/30 flex items-center justify-center text-red-500 mb-2">
                                    <Unlink size={24} />
                                </div>

                                <h3 id="unlink-title" className="text-xl font-bold text-white">¿Desvincular Bóveda?</h3>

                                <div id="unlink-desc" className="text-titanium-300 text-sm leading-relaxed space-y-3">
                                    <p>
                                        Estás a punto de desconectar la carpeta <span className="font-bold text-white">{activeSaga.name}</span> de la Forja.
                                    </p>
                                    <div className="p-3 bg-red-900/10 border border-red-900/20 rounded-lg text-red-200/80 text-xs">
                                        <strong>Tranquilo:</strong> Esto NO borrará tus archivos en Drive. Solo reiniciará la vista de la Forja para que puedas elegir otra carpeta.
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-4">
                                    <button
                                        onClick={() => setShowUnlinkConfirmation(false)}
                                        className="flex-1 py-3 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 font-bold rounded-lg transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleUnlinkVault}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors shadow-lg shadow-red-900/20"
                                    >
                                        Desconectar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- SELECTION VIEW (NO VAULT) ---
    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in relative">

            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div className="flex items-center gap-3 text-accent-DEFAULT">
                    <Hammer size={24} />
                    <h2 className="font-bold text-xl text-titanium-100">Forja de Almas</h2>
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto z-10">

                <div className="max-w-2xl w-full flex flex-col gap-8">

                    <div className="text-center mb-4">
                        <div className="w-20 h-20 bg-titanium-900 rounded-3xl flex items-center justify-center text-accent-DEFAULT mb-6 border border-titanium-800 mx-auto shadow-2xl shadow-accent-DEFAULT/10">
                            <FolderInput size={40} />
                        </div>
                        <h3 className="text-3xl font-bold text-titanium-100 mb-3">Configuración Inicial</h3>
                        <p className="text-titanium-400 text-lg">
                            No detecto una carpeta de personajes predeterminada. <br/>
                            ¿Cómo deseas organizar tus almas?
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* OPTION A: CREATE */}
                        <button
                            onClick={handleCreateVault}
                            disabled={isCreatingVault}
                            aria-label="Crear nueva bóveda de personajes"
                            className="group relative flex flex-col items-center p-8 bg-titanium-900 border border-titanium-800 hover:border-accent-DEFAULT/50 rounded-2xl transition-all hover:bg-titanium-800/50 text-left"
                        >
                            <div className="mb-4 p-4 rounded-full bg-accent-DEFAULT/10 text-accent-DEFAULT group-hover:bg-accent-DEFAULT group-hover:text-titanium-950 transition-colors">
                                {isCreatingVault ? <RefreshCw className="animate-spin" size={32} /> : <FolderPlus size={32} />}
                            </div>
                            <h4 className="text-xl font-bold text-titanium-100 mb-2">Crear Bóveda</h4>
                            <p className="text-sm text-titanium-400 text-center">
                                Crea una carpeta <span className="text-accent-DEFAULT font-mono">/Personajes</span> en la raíz de tu proyecto automáticamente.
                            </p>
                            <div className="mt-6 px-4 py-1 bg-titanium-950 rounded border border-titanium-800 text-xs text-titanium-500 font-mono">
                                Recomendado para nuevos
                            </div>
                        </button>

                        {/* OPTION B: SELECT */}
                        <button
                            onClick={() => setShowSelector(true)}
                            aria-label="Seleccionar bóveda existente"
                            className="group relative flex flex-col items-center p-8 bg-titanium-900 border border-titanium-800 hover:border-cyan-500/50 rounded-2xl transition-all hover:bg-titanium-800/50 text-left"
                        >
                            <div className="mb-4 p-4 rounded-full bg-cyan-900/20 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                                <Search size={32} />
                            </div>
                            <h4 className="text-xl font-bold text-titanium-100 mb-2">Ya tengo una</h4>
                            <p className="text-sm text-titanium-400 text-center">
                                Selecciona una carpeta existente desde la estructura de MyWorld.
                            </p>
                            <div className="mt-6 px-4 py-1 bg-titanium-950 rounded border border-titanium-800 text-xs text-titanium-500 font-mono">
                                Para usuarios avanzados
                            </div>
                        </button>
                    </div>

                </div>
            </div>

            {/* MODAL: SELECTOR */}
            {showSelector && (
                <InternalFolderSelector
                    onFolderSelected={handleFolderSelected}
                    onCancel={() => setShowSelector(false)}
                    currentFolderId={config?.characterVaultId}
                />
            )}

            {/* MODAL: CONFIRMATION */}
            {showConfirmation && pendingVault && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-title"
                    aria-describedby="confirm-desc"
                >
                    <div className="w-full max-w-md bg-titanium-900 border border-yellow-600/30 rounded-2xl shadow-2xl p-6 relative overflow-hidden">

                        {/* WARNING ICON */}
                        <div className="absolute top-0 right-0 p-8 -mr-4 -mt-4 opacity-10">
                            <AlertTriangle size={120} className="text-yellow-600" />
                        </div>

                        <div className="flex flex-col gap-4 relative z-10">
                            <div className="w-12 h-12 rounded-full bg-yellow-900/30 flex items-center justify-center text-yellow-500 mb-2">
                                <AlertTriangle size={24} />
                            </div>

                            <h3 id="confirm-title" className="text-xl font-bold text-white">Confirmar Ubicación</h3>

                            <div id="confirm-desc" className="text-titanium-300 text-sm leading-relaxed space-y-3">
                                <p>
                                    Has seleccionado: <span className="font-bold text-white">{pendingVault.name}</span>
                                </p>
                                <div className="p-3 bg-yellow-900/10 border border-yellow-600/20 rounded-lg text-yellow-200/80 text-xs">
                                    <strong>Ojo:</strong> Si esta carpeta tiene subcarpetas, la Forja las leerá todas recursivamente, pero los nuevos personajes se crearán en la raíz de esta carpeta.
                                </div>
                                <p className="opacity-70">
                                    No necesitas mover archivos manualmente, el sistema los detectará donde estén.
                                </p>
                            </div>

                            <div className="flex gap-3 mt-4">
                                <button
                                    onClick={() => setShowConfirmation(false)}
                                    className="flex-1 py-3 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 font-bold rounded-lg transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={confirmSelection}
                                    className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg transition-colors shadow-lg shadow-yellow-900/20"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ForgePanel;
