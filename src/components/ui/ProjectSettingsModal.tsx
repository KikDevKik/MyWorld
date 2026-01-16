import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Folder, Book, Clock, Star } from 'lucide-react';
import { useProjectConfig } from '../ProjectConfigContext';
import useDrivePicker from 'react-google-drive-picker';
import { ProjectPath } from '../../types';

interface ProjectSettingsModalProps {
    onClose: () => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ onClose }) => {
    const { config, updateConfig, loading } = useProjectConfig();

    // Local state for form handling
    const [canonPaths, setCanonPaths] = useState<ProjectPath[]>([]);
    const [primaryCanonPathId, setPrimaryCanonPathId] = useState<string | null>(null);
    const [resourcePaths, setResourcePaths] = useState<ProjectPath[]>([]);
    const [chronologyPath, setChronologyPath] = useState<ProjectPath | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Google Drive Picker Hook
    const [openPicker] = useDrivePicker();

    // Load initial values from context
    useEffect(() => {
        if (config) {
            setCanonPaths(config.canonPaths || []);
            setPrimaryCanonPathId(config.primaryCanonPathId || null);
            setResourcePaths(config.resourcePaths || []);
            setChronologyPath(config.chronologyPath || null);
        }
    }, [config]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateConfig({
                canonPaths,
                primaryCanonPathId,
                resourcePaths,
                chronologyPath
            });
            onClose();
        } catch (error) {
            // Error handling is done in context
        } finally {
            setIsSaving(false);
        }
    };

    const handleOpenPicker = (
        setList: (l: ProjectPath[]) => void,
        currentList: ProjectPath[],
        singleSelect: boolean = false
    ) => {
        const token = localStorage.getItem('google_drive_token');
        if (!token) {
            alert("No hay token de acceso. Por favor recarga la página o inicia sesión de nuevo.");
            return;
        }

        // 🧠 Retrieve Google API Key/Client ID securely if needed, but react-google-drive-picker usually needs them passed.
        // Assuming environment variables or constants are available, but for now we'll assume the library handles it
        // if the user is authenticated via the same Google session or we pass the token.
        // ACTUALLY, react-google-drive-picker needs developerKey and clientId.
        // Since I don't have them in constants, I will check if I can use the existing token solely or if I need to ask the user.
        // BUT the user instruction said "Instala e implementa react-google-drive-picker".
        // I'll try to use standard env vars if they exist in the codebase context, or placeholders.
        // Wait, the project setup usually has these. Let's look at `firebase.json` or similar? No.
        // I will use placeholders and rely on the existing token if possible, but the hook requires params.

        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!clientId || !developerKey) {
            alert("Falta configuración de API Key o Client ID en las variables de entorno (VITE_GOOGLE_CLIENT_ID, VITE_GOOGLE_API_KEY).");
            return;
        }

        openPicker({
            clientId: clientId,
            developerKey: developerKey,
            viewId: "FOLDERS",
            viewMimeTypes: "application/vnd.google-apps.folder",
            setSelectFolderEnabled: true,
            setIncludeFolders: true,
            setOrigin: window.location.protocol + '//' + window.location.host,
            token: token, // Pass the existing access token
            showUploadView: false,
            showUploadFolders: false,
            supportDrives: true,
            multiselect: !singleSelect,
            callbackFunction: (data) => {
                if (data.action === 'picked') {
                    const newPaths: ProjectPath[] = data.docs.map((doc: any) => ({
                        id: doc.id,
                        name: doc.name
                    }));

                    if (singleSelect) {
                        // For chronologyPath, we expect a setter for a single object, but here we reuse the list setter signature?
                        // No, handleOpenPicker logic needs to be flexible.
                        // Actually, let's fix the call site logic.
                    } else {
                        // Prevent duplicates
                        const uniquePaths = [...currentList];
                        newPaths.forEach(p => {
                            if (!uniquePaths.find(existing => existing.id === p.id)) {
                                uniquePaths.push(p);
                            }
                        });
                        setList(uniquePaths);
                    }
                }
            },
        });
    };

    // Helper for single select (Chronology)
    const handlePickSingle = () => {
         const token = localStorage.getItem('google_drive_token');
         if (!token) {
             alert("No hay token de acceso. Por favor recarga la página.");
             return;
         }

         const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
         const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

         if (!clientId || !developerKey) {
            alert("Falta configuración de API Key o Client ID.");
            return;
         }

         openPicker({
            clientId: clientId,
            developerKey: developerKey,
            viewId: "FOLDERS",
            viewMimeTypes: "application/vnd.google-apps.folder",
            setSelectFolderEnabled: true,
            setIncludeFolders: true,
            setOrigin: window.location.protocol + '//' + window.location.host,
            token: token,
            supportDrives: true,
            multiselect: false,
            callbackFunction: (data) => {
                if (data.action === 'picked') {
                    const doc = data.docs[0];
                    setChronologyPath({ id: doc.id, name: doc.name });
                }
            }
         });
    }


    // Helper to manage list inputs
    const removePath = (list: ProjectPath[], setList: (l: ProjectPath[]) => void, index: number) => {
        const newList = [...list];
        newList.splice(index, 1);
        setList(newList);
    };

    const PathListInput: React.FC<{
        label: string;
        paths: ProjectPath[];
        setPaths: (l: ProjectPath[]) => void;
        icon: React.ElementType;
        allowPrimary?: boolean; // 👈 Feature flag for Canon
    }> = ({ label, paths, setPaths, icon: Icon, allowPrimary = false }) => {
        return (
            <div className="mb-6">
                <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Icon size={14} /> {label}
                </label>

                <div className="space-y-2">
                    {paths.map((path, idx) => {
                        const isPrimary = allowPrimary && primaryCanonPathId === path.id;

                        return (
                            <div key={path.id} className={`flex items-center justify-between bg-titanium-800/50 px-3 py-2 rounded border transition-all duration-300 ${isPrimary ? 'border-yellow-500/50 shadow-[0_0_10px_rgba(234,179,8,0.1)]' : 'border-titanium-700/50'}`}>
                                <div className="flex items-center gap-3">
                                    {allowPrimary && (
                                        <button
                                            onClick={() => setPrimaryCanonPathId(isPrimary ? null : path.id)}
                                            className={`transition-all duration-200 ${isPrimary ? 'text-yellow-400 scale-110' : 'text-titanium-600 hover:text-yellow-400/50'}`}
                                            title={isPrimary ? "Fuente Primaria de Worldbuilding (Activa)" : "Marcar como Fuente Primaria de Reglas"}
                                        >
                                            <Star size={16} fill={isPrimary ? "currentColor" : "none"} />
                                        </button>
                                    )}
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-medium ${isPrimary ? 'text-yellow-100' : 'text-titanium-200'}`}>
                                            {path.name} {isPrimary && <span className="text-[10px] text-yellow-500 font-bold ml-2 tracking-widest">[PRIMARY CORE]</span>}
                                        </span>
                                        <span className="text-[10px] text-titanium-500 font-mono">{path.id}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removePath(paths, setPaths, idx)}
                                    className="text-titanium-500 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        );
                    })}

                    <button
                        onClick={() => handleOpenPicker(setPaths, paths)}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-titanium-800/30 hover:bg-titanium-800 border border-dashed border-titanium-600 rounded-md text-titanium-400 hover:text-titanium-200 transition-all text-sm"
                    >
                        <Plus size={14} /> Añadir Carpeta desde Drive
                    </button>
                </div>
            </div>
        );
    };

    if (loading) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-titanium-900 border border-titanium-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-titanium-700/50 flex justify-between items-center bg-titanium-800/30">
                    <div>
                        <h2 className="text-xl font-bold text-titanium-100">Configuración del Proyecto</h2>
                        <p className="text-sm text-titanium-400 mt-1">Define la estructura semántica de tu mundo.</p>
                    </div>
                    <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Canon Paths */}
                        <PathListInput
                            label="Rutas Canon (Verdad Absoluta)"
                            paths={canonPaths}
                            setPaths={setCanonPaths}
                            icon={Folder}
                            allowPrimary={true}
                        />

                        {/* Resource Paths */}
                        <PathListInput
                            label="Rutas de Recursos (Inspiración)"
                            paths={resourcePaths}
                            setPaths={setResourcePaths}
                            icon={Folder}
                        />
                    </div>

                    {/* Chronology Path */}
                    <div className="mt-4">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Clock size={14} /> Ruta de Cronología
                        </label>

                        {chronologyPath ? (
                             <div className="flex items-center justify-between bg-titanium-800/50 px-3 py-2 rounded border border-titanium-700/50">
                                <div className="flex flex-col">
                                    <span className="text-sm text-titanium-200 font-medium">{chronologyPath.name}</span>
                                    <span className="text-[10px] text-titanium-500 font-mono">{chronologyPath.id}</span>
                                </div>
                                <button
                                    onClick={() => setChronologyPath(null)}
                                    className="text-titanium-500 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ) : (
                             <button
                                onClick={handlePickSingle}
                                className="w-full flex items-center justify-center gap-2 py-2 bg-titanium-800/30 hover:bg-titanium-800 border border-dashed border-titanium-600 rounded-md text-titanium-400 hover:text-titanium-200 transition-all text-sm"
                            >
                                <Plus size={14} /> Seleccionar Carpeta de Cronología
                            </button>
                        )}

                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-titanium-700/50 bg-titanium-800/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-titanium-300 hover:text-white hover:bg-titanium-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-DEFAULT text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent-DEFAULT/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={16} />
                        {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ProjectSettingsModal;
