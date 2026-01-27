import React, { useState } from 'react';
import { Hammer, FolderInput, Book, FolderPlus, ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import useDrivePicker from 'react-google-drive-picker';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import ForgeDashboard from './ForgeDashboard';
import ForgeHub from './ForgeHub';
import { ProjectConfig, DriveFile } from '../../types';

interface ForgePanelProps {
    onClose: () => void;
    folderId: string; // Project Root ID (Context)
    accessToken: string | null;
}

const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, updateConfig } = useProjectConfig();
    const [openPicker] = useDrivePicker();

    // 🟢 SAGA STATE (The Hub Selection)
    const [activeSaga, setActiveSaga] = useState<DriveFile | null>(null);

    // --- VAULT SELECTION (SETUP) ---
    const handleConnectVault = () => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!clientId || !developerKey) {
            toast.error("Missing Google API Configuration (Client ID / API Key)");
            return;
        }

        openPicker({
            clientId,
            developerKey,
            viewId: "FOLDERS",
            viewMimeTypes: "application/vnd.google-apps.folder",
            setSelectFolderEnabled: true,
            setIncludeFolders: true,
            setOrigin: window.location.protocol + '//' + window.location.host,
            token: accessToken || "",
            showUploadView: false,
            showUploadFolders: false,
            supportDrives: true,
            multiselect: false,
            callbackFunction: async (data) => {
                if (data.action === 'picked' && data.docs && data.docs[0]) {
                    const picked = data.docs[0];
                    if (config) {
                        const newConfig: ProjectConfig = {
                            ...config,
                            characterVaultId: picked.id
                        };
                        await updateConfig(newConfig);
                        toast.success(`Character Vault linked: ${picked.name}`);
                    }
                }
            }
        });
    };

    const handleSelectExisting = async (selectedFolderId: string) => {
        if (!config) return;
        const newConfig: ProjectConfig = {
            ...config,
            characterVaultId: selectedFolderId
        };
        await updateConfig(newConfig);
        toast.success("Character Vault selected successfully.");
    };

    // --- 1. CONNECT VIEW (NO VAULT) ---
    if (config && !config.characterVaultId) {
        const canonPaths = config.canonPaths || [];
        const resourcePaths = config.resourcePaths || [];
        const canonIds = new Set(canonPaths.map(p => p.id));
        const uniqueResourcePaths = resourcePaths.filter(p => !canonIds.has(p.id));
        const hasExistingPaths = canonPaths.length > 0 || uniqueResourcePaths.length > 0;

        return (
            <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
                {/* HEADER */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                    <div className="flex items-center gap-3 text-accent-DEFAULT">
                        <Hammer size={24} />
                        <h2 className="font-bold text-xl text-titanium-100">Forja de Almas</h2>
                    </div>
                </div>

                {/* CONNECT CONTENT */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
                    <div className="w-24 h-24 bg-titanium-900 rounded-3xl flex items-center justify-center text-titanium-600 mb-6 border border-titanium-800 shrink-0">
                        <FolderInput size={48} />
                    </div>

                    <h3 className="text-2xl font-bold text-titanium-100 mb-2">
                        {hasExistingPaths ? "Seleccionar Bóveda Maestra" : "Conexión Requerida"}
                    </h3>
                    <p className="text-titanium-400 max-w-md mb-8">
                        {hasExistingPaths
                            ? "Elige la carpeta raíz donde viven tus personajes o conecta una nueva."
                            : "Para activar la Forja, vincula una carpeta de Google Drive como tu 'Character Vault'."
                        }
                    </p>

                    <div className="w-full max-w-md space-y-4">
                        {hasExistingPaths && (
                            <div className="space-y-4 mb-8">
                                {canonPaths.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-titanium-500 uppercase tracking-wider text-left pl-1">Carpetas Canon</h4>
                                        {canonPaths.map(path => (
                                            <button
                                                key={path.id}
                                                onClick={() => handleSelectExisting(path.id)}
                                                className="w-full p-4 bg-titanium-900 hover:bg-titanium-800 border border-titanium-800 hover:border-accent-DEFAULT/50 rounded-xl flex items-center justify-between group transition-all text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-titanium-950 rounded-lg text-accent-DEFAULT group-hover:text-white transition-colors">
                                                        <Book size={20} />
                                                    </div>
                                                    <span className="font-semibold text-titanium-200 group-hover:text-white transition-colors">{path.name}</span>
                                                </div>
                                                <span className="text-[10px] font-bold bg-titanium-950 text-titanium-500 px-2 py-1 rounded border border-titanium-800">CORE</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleConnectVault}
                            className={`w-full px-8 py-4 font-bold rounded-xl flex items-center justify-center gap-3 transition-all
                                ${hasExistingPaths
                                    ? "bg-transparent border-2 border-dashed border-titanium-700 text-titanium-400 hover:border-accent-DEFAULT hover:text-accent-DEFAULT"
                                    : "bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 shadow-lg hover:shadow-accent-DEFAULT/20"
                                }`}
                        >
                            <FolderPlus size={20} />
                            <span>{hasExistingPaths ? "Conectar Nueva Carpeta" : "Conectar Character Vault"}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- 2. HUB VIEW (VAULT LINKED, NO SAGA SELECTED) ---
    if (!activeSaga) {
        return (
            <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
                {/* HEADER */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                    <div className="flex items-center gap-3 text-titanium-100">
                        <Hammer size={24} className="text-accent-DEFAULT" />
                        <h2 className="font-bold text-xl">Forja de Almas</h2>
                        <span className="px-2 py-0.5 rounded bg-titanium-800 text-[10px] font-mono text-titanium-400">HUB</span>
                    </div>
                    {/* OPTIONAL: Sync Button could go here if we wanted a manual master sync, but we are removing it per instructions */}
                </div>

                <div className="flex-1 overflow-hidden relative">
                    <ForgeHub
                        vaultId={config?.characterVaultId || ""}
                        accessToken={accessToken}
                        onSelectSaga={setActiveSaga}
                    />
                </div>
            </div>
        );
    }

    // --- 3. DASHBOARD VIEW (SAGA SELECTED) ---
    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
            {/* HEADER */}
            <div className="relative z-20 h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div className="flex items-center gap-2 text-titanium-100">
                    <button
                        onClick={() => setActiveSaga(null)}
                        className="p-1 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors mr-2"
                        title="Volver al Hub"
                    >
                        <ArrowLeft size={20} />
                    </button>

                    <span className="flex items-center gap-2 text-titanium-400 shrink-0">
                        <Hammer size={20} />
                        <span className="font-bold hidden md:inline">Forja de Almas</span>
                    </span>

                    <span className="text-titanium-600">/</span>

                    <div className="flex items-center gap-2 px-3 py-1 rounded bg-titanium-800/50 border border-titanium-700/50">
                        <Book size={14} className="text-accent-DEFAULT" />
                        <span className="font-bold text-sm text-titanium-200">{activeSaga.name}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* Auto-Sync indicator or actions for Dashboard could go here */}
                </div>
            </div>

            {/* DASHBOARD */}
            <div className="flex-1 overflow-hidden relative">
                <ForgeDashboard
                    folderId={folderId} // Project Root
                    accessToken={accessToken}
                    saga={activeSaga} // 🟢 Pass Active Saga
                />
            </div>
        </div>
    );
};

export default ForgePanel;
