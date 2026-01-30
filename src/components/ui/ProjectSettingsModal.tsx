import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { X, Plus, Trash2, Save, Folder, Book, Star, Brain, Cpu, LayoutTemplate } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import useDrivePicker from 'react-google-drive-picker';
import { ProjectPath, FolderRole } from '../../types/core';

interface ProjectSettingsModalProps {
    onClose: () => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ onClose }) => {
    const { config, updateConfig, loading } = useProjectConfig();

    // Local state for form handling
    const [canonPaths, setCanonPaths] = useState<ProjectPath[]>([]);
    const [resourcePaths, setResourcePaths] = useState<ProjectPath[]>([]);
    const [folderMapping, setFolderMapping] = useState<Partial<Record<FolderRole, string>>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'paths' | 'taxonomy'>('paths');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Google Drive Picker Hook
    const [openPicker] = useDrivePicker();

    // Load initial values from context
    useEffect(() => {
        if (config) {
            setCanonPaths(config.canonPaths || []);
            setResourcePaths(config.resourcePaths || []);
            setFolderMapping(config.folderMapping || {});
        }
    }, [config]);

    const handleSave = async () => {
        if (!config) return;
        setIsSaving(true);
        try {
            await updateConfig({
                ...config,
                canonPaths,
                resourcePaths,
                folderMapping, // 👈 Save new mapping
                // chronologyPath: null // Removed
            });

            // 🟢 TRIGGER INDEX REFRESH (Lightweight & Strict)
            const token = localStorage.getItem('google_drive_token');
            if (token) {
                try {
                    const allPaths = [...canonPaths, ...resourcePaths];
                    const folderIds = allPaths.map(p => p.id);

                    // 🟢 STRICT LOGIC: Do NOT append config.folderId fallback.
                    // If the list is empty, we MUST send empty list to clear the tree.

                    const functions = getFunctions();
                    const getDriveFiles = httpsCallable(functions, 'getDriveFiles');

                    // Fire and forget (or await if critical) - Awaiting to ensure consistency
                    toast.info(folderIds.length > 0 ? "Actualizando índice de archivos..." : "Limpiando índice...");

                    await getDriveFiles({
                        folderIds, // Can be empty []
                        accessToken: token,
                        recursive: true,
                        persist: true // 🟢 ENABLE PERSISTENCE (Wipes tree if empty)
                    });

                    toast.success("Índice actualizado.");

                } catch (e) {
                    console.error("Failed to refresh index:", e);
                    toast.warning("Configuración guardada, pero falló la indexación automática.");
                }
            }

            onClose();
        } catch (error) {
            // Error handling is done in context (updateConfig throws?)
            // updateConfig throws, so we catch here
            toast.error("Error al guardar la configuración.");
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
            token: token,
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
                        // For chronologyPath, we expect a setter for a single object
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

    // Helper to manage list inputs
    const removePath = (list: ProjectPath[], setList: (l: ProjectPath[]) => void, index: number) => {
        const newList = [...list];
        newList.splice(index, 1);
        setList(newList);
    };

    // 🟢 AI AUTO-DISCOVERY
    const handleAutoDiscover = async () => {
        setIsAnalyzing(true);
        const token = localStorage.getItem('google_drive_token');
        if (!token) return;

        try {
            const functions = getFunctions();
            const discoverFolderRoles = httpsCallable(functions, 'discoverFolderRoles');

            toast.info("Escaneando estructura de carpetas...");
            const result = await discoverFolderRoles({ accessToken: token });
            const data = result.data as any;

            if (data.suggestion && Object.keys(data.suggestion).length > 0) {
                setFolderMapping(prev => ({ ...prev, ...data.suggestion }));
                toast.success(`Se detectaron ${Object.keys(data.suggestion).length} roles.`);
            } else {
                toast.warning("No se pudieron deducir roles automáticamente.");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error en el análisis automático.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // 🟢 BUILD TITANIUM STRUCTURE
    const handleCreateStructure = async () => {
        if (!confirm("Esto creará la estructura de carpetas estándar 'Titanium' en tu carpeta raíz. ¿Continuar?")) return;

        setIsAnalyzing(true);
        const token = localStorage.getItem('google_drive_token');
        const rootId = config?.folderId;

        if (!token || !rootId) {
            toast.error("Falta configuración base (Token o Root ID).");
            setIsAnalyzing(false);
            return;
        }

        try {
            const functions = getFunctions();
            const createTitaniumStructure = httpsCallable(functions, 'createTitaniumStructure');

            toast.info("Construyendo cimientos...");
            const result = await createTitaniumStructure({ accessToken: token, rootFolderId: rootId });
            const data = result.data as any;

            if (data.success) {
                setFolderMapping(data.mapping);
                if (data.canonPaths) setCanonPaths(data.canonPaths);
                if (data.resourcePaths) setResourcePaths(data.resourcePaths);
                toast.success("Estructura Titanium creada exitosamente.");
            }
        } catch (e) {
            console.error(e);
            toast.error("Error al crear la estructura.");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // 🟢 MANUAL FOLDER SELECTOR HELPER
    const selectFolderForRole = (role: FolderRole) => {
        const token = localStorage.getItem('google_drive_token');
        if (!token) return;

        // Use standard picker logic but for single folder
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

        openPicker({
            clientId,
            developerKey,
            viewId: "FOLDERS",
            setSelectFolderEnabled: true,
            setIncludeFolders: true,
            token,
            multiselect: false,
            callbackFunction: (data) => {
                if (data.action === 'picked' && data.docs.length > 0) {
                    const folderId = data.docs[0].id;
                    setFolderMapping(prev => ({ ...prev, [role]: folderId }));
                }
            }
        });
    };

    const PathListInput: React.FC<{
        label: string;
        paths: ProjectPath[];
        setPaths: (l: ProjectPath[]) => void;
        icon: React.ElementType;
    }> = ({ label, paths, setPaths, icon: Icon }) => {
        return (
            <div className="mb-6">
                <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Icon size={14} /> {label}
                </label>

                <div className="space-y-2">
                    {paths.map((path, idx) => {
                        return (
                            <div key={path.id} className="flex items-center justify-between bg-titanium-800/50 px-3 py-2 rounded border border-titanium-700/50 transition-all duration-300">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-titanium-200">
                                            {path.name}
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

    // 🟢 ROLE MAPPER COMPONENT
    const RoleRow = ({ role, label, desc }: { role: FolderRole, label: string, desc: string }) => {
        const currentId = folderMapping[role];
        return (
            <div className="flex items-center justify-between py-3 border-b border-titanium-800 last:border-0">
                <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-titanium-200">{label}</span>
                        {currentId && <span className="text-[10px] px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded border border-green-800/50">Conectado</span>}
                    </div>
                    <p className="text-xs text-titanium-500 mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-2">
                    {currentId && (
                        <span className="text-[10px] font-mono text-titanium-600 max-w-[80px] truncate" title={currentId}>
                            {currentId}
                        </span>
                    )}
                    <button
                        onClick={() => selectFolderForRole(role)}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                            currentId
                            ? 'bg-titanium-800 border-titanium-700 text-titanium-300 hover:bg-titanium-700'
                            : 'bg-titanium-800/30 border-dashed border-titanium-600 text-titanium-400 hover:text-titanium-200 hover:border-titanium-500'
                        }`}
                    >
                        {currentId ? 'Cambiar' : 'Seleccionar'}
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
                <div className="p-6 border-b border-titanium-700/50 bg-titanium-800/30">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 className="text-xl font-bold text-titanium-100">Configuración del Proyecto</h2>
                            <p className="text-sm text-titanium-400 mt-1">Define la estructura semántica de tu mundo.</p>
                        </div>
                        <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-titanium-950/50 p-1 rounded-lg w-fit" role="tablist" aria-label="Configuración de proyecto">
                        <button
                            onClick={() => setActiveTab('paths')}
                            role="tab"
                            aria-selected={activeTab === 'paths'}
                            aria-controls="panel-paths"
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${
                                activeTab === 'paths'
                                ? 'bg-titanium-700 text-white shadow-sm'
                                : 'text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50'
                            }`}
                        >
                            <Folder size={14} /> Rutas de Acceso
                        </button>
                        <button
                            onClick={() => setActiveTab('taxonomy')}
                            role="tab"
                            aria-selected={activeTab === 'taxonomy'}
                            aria-controls="panel-taxonomy"
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${
                                activeTab === 'taxonomy'
                                ? 'bg-cyan-900/50 text-cyan-200 shadow-sm border border-cyan-800/50'
                                : 'text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50'
                            }`}
                        >
                            <Brain size={14} /> Taxonomía (Cerebro)
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">

                    {activeTab === 'paths' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-left-4 duration-300">
                            <PathListInput
                                label="Rutas Canon (Verdad Absoluta)"
                                paths={canonPaths}
                                setPaths={setCanonPaths}
                                icon={Book}
                            />
                            <PathListInput
                                label="Rutas de Recursos (Inspiración)"
                                paths={resourcePaths}
                                setPaths={setResourcePaths}
                                icon={Star}
                            />
                        </div>
                    )}

                    {activeTab === 'taxonomy' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">

                            {/* Tools Header */}
                            <div className="flex items-center justify-between bg-titanium-950/30 p-4 rounded-lg border border-titanium-800">
                                <div>
                                    <h3 className="text-sm font-bold text-titanium-200 flex items-center gap-2">
                                        <Cpu size={16} className="text-cyan-500"/> Asistente de Estructura
                                    </h3>
                                    <p className="text-xs text-titanium-500 mt-1">
                                        Deja que la IA organice tu proyecto automáticamente.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAutoDiscover}
                                        disabled={isAnalyzing}
                                        className="px-3 py-1.5 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 rounded text-xs font-medium text-titanium-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Brain size={14} /> {isAnalyzing ? 'Analizando...' : 'Auto-Detectar'}
                                    </button>
                                    <button
                                        onClick={handleCreateStructure}
                                        disabled={isAnalyzing}
                                        className="px-3 py-1.5 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 rounded text-xs font-medium text-titanium-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <LayoutTemplate size={14} /> Crear Estándar
                                    </button>
                                </div>
                            </div>

                            {/* Mappings List */}
                            <div className="space-y-1">
                                <h4 className="text-xs font-bold text-titanium-400 uppercase tracking-wider mb-3">Nivel 1: El Mundo (La Biblia)</h4>
                                <RoleRow role={FolderRole.WORLD_CORE} label="Reglas Universales" desc="Física, Magia, Cosmología." />
                                <RoleRow role={FolderRole.LORE_HISTORY} label="Lore & Historia" desc="Cronologías, Mitos, Eventos Pasados." />

                                <h4 className="text-xs font-bold text-titanium-400 uppercase tracking-wider mt-6 mb-3">Nivel 2: Las Entidades (Base de Datos)</h4>
                                <RoleRow role={FolderRole.ENTITY_PEOPLE} label="Personajes (Forja)" desc="Humanoides con diálogo." />
                                <RoleRow role={FolderRole.ENTITY_BESTIARY} label="Bestiario" desc="Criaturas, Monstruos, Flora." />
                                <RoleRow role={FolderRole.ENTITY_FACTIONS} label="Facciones" desc="Gremios, Religiones, Ejércitos." />

                                <h4 className="text-xs font-bold text-titanium-400 uppercase tracking-wider mt-6 mb-3">Nivel 3: La Narrativa (Manuscrito)</h4>
                                <RoleRow role={FolderRole.SAGA_MAIN} label="Saga Principal" desc="Los libros principales." />
                                <RoleRow role={FolderRole.SAGA_EXTRAS} label="Extras & Spin-offs" desc="Historias cortas, One-shots." />
                                <RoleRow role={FolderRole.DRAFTS} label="Borradores (Limbos)" desc="Ideas sin procesar." />
                                <RoleRow role={FolderRole.RESOURCES} label="Recursos" desc="Archivos de referencia (PDFs, Imágenes)." />
                            </div>
                        </div>
                    )}

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
