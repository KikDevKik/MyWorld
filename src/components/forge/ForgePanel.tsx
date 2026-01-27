import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Hammer, X, FolderInput, RefreshCw, Book, FolderPlus } from 'lucide-react';
import { toast } from 'sonner';
import useDrivePicker from 'react-google-drive-picker';

import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import ForgeDashboard from './ForgeDashboard';
import { ProjectConfig } from '../../types';
import ScopeTreeSelector from '../ScopeTreeSelector';

interface ForgePanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, updateConfig } = useProjectConfig();
    const [openPicker] = useDrivePicker();
    const [isSyncing, setIsSyncing] = useState(false);

    // 🟢 SCOPE STATE (REPLACED BREADCRUMB)
    const [selectedScope, setSelectedScope] = useState<{ id: string | null; name: string; recursiveIds: string[]; path?: string }>({
        id: null,
        name: "Global (Todo el Proyecto)",
        recursiveIds: []
    });

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

    // --- SYNC SOULS ---
    const handleSyncSouls = async () => {
        if (!config?.characterVaultId) return;

        setIsSyncing(true);
        const functions = getFunctions();
        const syncCharacterManifest = httpsCallable(functions, 'syncCharacterManifest');

        // Logic remains: Sync Master Vault mostly.
        // If we want to sync the Local Scope, we could pass it.
        // For now, let's keep it syncing the Master Vault to ensure characters are up to date.
        // If the user wants to sync the "Current Scope", we might need to change this logic,
        // but traditionally Sync is for Characters (Master Vault).

        try {
            const result = await syncCharacterManifest({
                masterVaultId: config.characterVaultId,
                accessToken
            });
            const count = (result.data as any).count || 0;
            toast.success(`Sincronizados ${count} personajes en la Bóveda`);
        } catch (error) {
            console.error("Error syncing souls:", error);
            toast.error("Failed to sync character manifest.");
        } finally {
            setIsSyncing(false);
        }
    };

    // --- EMPTY STATE (NO VAULT) ---
    if (config && !config.characterVaultId) {
        // Source Selector Logic
        const canonPaths = config.canonPaths || [];
        const resourcePaths = config.resourcePaths || [];

        // Deduplicate: Create Set of Canon IDs
        const canonIds = new Set(canonPaths.map(p => p.id));

        // Filter Resource paths (exclude if in Canon)
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
                    <button onClick={onClose} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* CONNECT CONTENT */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto">
                    <div className="w-24 h-24 bg-titanium-900 rounded-3xl flex items-center justify-center text-titanium-600 mb-6 border border-titanium-800 shrink-0">
                        <FolderInput size={48} />
                    </div>

                    <h3 className="text-2xl font-bold text-titanium-100 mb-2">
                        {hasExistingPaths ? "Select Character Source" : "Vault Connection Required"}
                    </h3>
                    <p className="text-titanium-400 max-w-md mb-8">
                        {hasExistingPaths
                            ? "Choose an existing project folder to serve as your Character Vault, or connect a new one."
                            : "To activate the Forge, you must link a dedicated Character Vault folder from your Google Drive (Tier 1 Storage)."
                        }
                    </p>

                    <div className="w-full max-w-md space-y-4">
                        {/* EXISTING FOLDERS OPTION */}
                        {hasExistingPaths && (
                            <div className="space-y-4 mb-8">
                                {/* CANON GROUP */}
                                {canonPaths.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-titanium-500 uppercase tracking-wider text-left pl-1">Canon Folders</h4>
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

                                {/* RESOURCE GROUP */}
                                {uniqueResourcePaths.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold text-titanium-500 uppercase tracking-wider text-left pl-1">Resource Folders</h4>
                                        {uniqueResourcePaths.map(path => (
                                            <button
                                                key={path.id}
                                                onClick={() => handleSelectExisting(path.id)}
                                                className="w-full p-4 bg-titanium-900 hover:bg-titanium-800 border border-titanium-800 hover:border-purple-500/50 rounded-xl flex items-center justify-between group transition-all text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-titanium-950 rounded-lg text-purple-400 group-hover:text-white transition-colors">
                                                        <FolderInput size={20} />
                                                    </div>
                                                    <span className="font-semibold text-titanium-200 group-hover:text-white transition-colors">{path.name}</span>
                                                </div>
                                                <span className="text-[10px] font-bold bg-titanium-950 text-titanium-500 px-2 py-1 rounded border border-titanium-800">REF</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* CONNECT NEW FOLDER (Fallback) */}
                        <button
                            onClick={handleConnectVault}
                            className={`w-full px-8 py-4 font-bold rounded-xl flex items-center justify-center gap-3 transition-all
                                ${hasExistingPaths
                                    ? "bg-transparent border-2 border-dashed border-titanium-700 text-titanium-400 hover:border-accent-DEFAULT hover:text-accent-DEFAULT"
                                    : "bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 shadow-lg hover:shadow-accent-DEFAULT/20"
                                }`}
                        >
                            <FolderPlus size={20} />
                            <span>{hasExistingPaths ? "Connect External Folder from Drive" : "Connect Character Vault"}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- DASHBOARD STATE (CONNECTED) ---
    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
            {/* HEADER */}
            <div className="relative z-20 h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div className="flex items-center gap-2 text-titanium-100">
                    <span className="flex items-center gap-2 text-titanium-400 shrink-0">
                        <Hammer size={20} />
                        <span className="font-bold hidden md:inline">Forja de Almas</span>
                    </span>

                    {/* 🟢 NEW SCOPE SELECTOR */}
                    <div className="ml-4">
                        <ScopeTreeSelector
                            onScopeSelected={setSelectedScope}
                            activeScopeId={selectedScope.id}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* SYNC BUTTON */}
                    <button
                        onClick={() => handleSyncSouls()}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-titanium-700"
                        title="Sync with Drive"
                    >
                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                        <span>{isSyncing ? "SYNCING..." : "SYNC"}</span>
                    </button>

                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* DASHBOARD */}
            <div className="flex-1 overflow-hidden relative">
                <ForgeDashboard
                    folderId={folderId}
                    accessToken={accessToken}
                    characterVaultId={config?.characterVaultId || ""}
                    selectedScope={selectedScope} // 🟢 Pass Scope Down
                />
            </div>

        </div>
    );
};

export default ForgePanel;
