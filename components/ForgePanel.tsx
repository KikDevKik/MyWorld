import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Hammer, X, FolderInput, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import useDrivePicker from 'react-google-drive-picker';

import { useProjectConfig } from './ProjectConfigContext';
import ForgeDashboard from './ForgeDashboard';
import { ProjectConfig } from '../types';

interface ForgePanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken }) => {
    const { config, updateConfig, refreshConfig } = useProjectConfig();
    const [openPicker] = useDrivePicker();
    const [isSyncing, setIsSyncing] = useState(false);

    // --- VAULT SELECTION ---
    const handleConnectVault = () => {
        openPicker({
            clientId: "", // Not needed for standard flow usually, but lib might warn
            developerKey: "", // We rely on access token
            viewId: "FOLDERS",
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

    // --- SYNC SOULS ---
    const handleSyncSouls = async () => {
        if (!config?.characterVaultId) return;

        setIsSyncing(true);
        const functions = getFunctions();
        const syncCharacterManifest = httpsCallable(functions, 'syncCharacterManifest');

        try {
            await syncCharacterManifest({
                masterVaultId: config.characterVaultId,
                bookFolderId: folderId, // Open folder as local book
                accessToken
            });
            toast.success("Soul Manifest updated from Drive.");
            // We rely on Dashboard's Firestore listener to update UI
        } catch (error) {
            console.error("Error syncing souls:", error);
            toast.error("Failed to sync character manifest.");
        } finally {
            setIsSyncing(false);
        }
    };

    // --- EMPTY STATE (NO VAULT) ---
    if (config && !config.characterVaultId) {
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
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-24 h-24 bg-titanium-900 rounded-3xl flex items-center justify-center text-titanium-600 mb-6 border border-titanium-800">
                        <FolderInput size={48} />
                    </div>
                    <h3 className="text-2xl font-bold text-titanium-100 mb-2">Vault Connection Required</h3>
                    <p className="text-titanium-400 max-w-md mb-8">
                        To activate the Forge, you must link a dedicated Character Vault folder from your Google Drive (Tier 1 Storage).
                    </p>
                    <button
                        onClick={handleConnectVault}
                        className="px-8 py-4 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 font-bold rounded-xl flex items-center gap-3 transition-all shadow-lg hover:shadow-accent-DEFAULT/20"
                    >
                        <FolderInput size={20} />
                        <span>Connect Character Vault</span>
                    </button>
                </div>
            </div>
        );
    }

    // --- DASHBOARD STATE (CONNECTED) ---
    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shrink-0">
                <div className="flex items-center gap-3 text-accent-DEFAULT">
                    <Hammer size={24} />
                    <h2 className="font-bold text-xl text-titanium-100">Forja de Almas</h2>
                </div>

                <div className="flex items-center gap-2">
                    {/* SYNC BUTTON */}
                    <button
                        onClick={handleSyncSouls}
                        disabled={isSyncing}
                        className="px-4 py-2 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-titanium-700"
                        title="Sync with Drive"
                    >
                        <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
                        <span>{isSyncing ? "SYNCING..." : "SYNC SOULS"}</span>
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
            <div className="flex-1 overflow-hidden">
                <ForgeDashboard
                    folderId={folderId}
                    accessToken={accessToken}
                    characterVaultId={config?.characterVaultId || ""}
                />
            </div>
        </div>
    );
};

export default ForgePanel;
