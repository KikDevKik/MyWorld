import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { X, Plus, Trash2, Save, Folder, Book, Star, Brain, Cpu, LayoutTemplate, Download, Loader2, CheckCircle2, FolderOpen, CheckCircle } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import useDrivePicker from 'react-google-drive-picker';
import { ProjectPath, FolderRole, ProjectConfig } from '../../types/project'; // Corrected import
import { callFunction } from '../../services/api';
import { requestImportScope, getImportToken, clearImportToken } from '../../services/importAuth';

interface ProjectSettingsModalProps {
    onClose: () => void;
    accessToken?: string | null;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ onClose, accessToken }) => {
    const { config, updateConfig, refreshConfig, loading } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];

    // Local state for form handling
    const [canonPaths, setCanonPaths] = useState<ProjectPath[]>(config?.canonPaths || []);
    const [resourcePaths, setResourcePaths] = useState<ProjectPath[]>(config?.resourcePaths || []);
    const [folderMapping, setFolderMapping] = useState<Partial<Record<FolderRole, string>>>(config?.folderMapping || {});
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'paths' | 'taxonomy'>('paths');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [importState, setImportState] = useState<'unauthorized' | 'authorized' | 'routing' | 'copying' | 'done'>('unauthorized');
    const [copiedCount, setCopiedCount] = useState(0);
    const [totalFiles, setTotalFiles] = useState(0);
    const [pendingFolders, setPendingFolders] = useState<any[]>([]); // Folders waiting for routing decision
    const [folderNames, setFolderNames] = useState<Record<string, string>>({}); // 🟢 Cache for names

    const modalRef = useRef<HTMLDivElement>(null);

    // Google Drive Picker Hook
    const [openPicker] = useDrivePicker();

    // 🟢 MIGRACIÓN DE PROYECTO (Incremental Scope)
    const handleRequestImportScope = async () => {
        try {
            await requestImportScope();
            setImportState('authorized');
            toast.success("Acceso concedido temporalmente.");
        } catch (error) {
            toast.error("No se pudo obtener la autorización.");
        }
    };

    const handleOpenFolderPicker = async () => {
        const importToken = getImportToken();
        if (!importToken) {
            toast.error('Token de importación no disponible. Autoriza de nuevo.');
            setImportState('unauthorized');
            return;
        }

        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const developerKey = import.meta.env.VITE_GOOGLE_API_KEY;

        if (!clientId || !developerKey) {
            toast.error("Falta configuración de Google Drive en las variables de entorno.");
            return;
        }

        // 🟢 SOLUCIÓN 1: CREACIÓN JUST-IN-TIME (Frontend Safeguard)
        if (!config?.folderId) {
            toast.info("Creando tu Bóveda base en Google Drive para alojar la importación...", { duration: 5000 });
            try {
                const token = accessToken;
                if (!token) {
                    toast.error("Falta token principal para crear carpetas.");
                    return;
                }
                const data = await callFunction<any>('createTitaniumStructure', { accessToken: token, newProjectName: "MyWorld Import" });
                if (data.success) {
                    if (data.mapping) setFolderMapping(data.mapping);
                    if (data.canonPaths) setCanonPaths(data.canonPaths);
                    if (data.resourcePaths) setResourcePaths(data.resourcePaths);
                    await refreshConfig();
                    toast.success("Bóveda base creada exitosamente.");
                } else {
                    toast.error("No se pudo crear la bóveda.");
                    return;
                }
            } catch (e: any) {
                console.error(e);
                toast.error("Error crítico al crear la bóveda: " + e.message);
                return;
            }
        }

        let customViews: any[] | undefined;
        const googleAny = window as any;
        if (googleAny.google && googleAny.google.picker) {
            const view = new googleAny.google.picker.DocsView(googleAny.google.picker.ViewId.FOLDERS);
            view.setIncludeFolders(true);
            view.setSelectFolderEnabled(true);
            view.setMimeTypes("application/vnd.google-apps.folder");
            view.setQuery("trashed=false");
            customViews = [view];
        }

        openPicker({
            clientId,
            developerKey,
            viewId: "FOLDERS",
            viewMimeTypes: "application/vnd.google-apps.folder",
            setIncludeFolders: true,
            setSelectFolderEnabled: true,
            multiselect: true, // SOLUCIÓN 3: Multiselect activado
            supportDrives: true,
            token: importToken,
            customViews: customViews,
            callbackFunction: async (data) => {
                if (data.action === 'picked') {
                    if (data.docs.length === 0) return;
                    
                    // Almacenamos las carpetas seleccionadas y pasamos al paso de enrutamiento
                    setPendingFolders(data.docs);
                    setImportState('routing');
                }
            }
        });
    };

    // Helper para cambiar el rol de una carpeta en la lista de enrutamiento
    const handleUpdateFolderRoute = (index: number, role: 'canon' | 'resource' | 'root') => {
        const newFolders = [...pendingFolders];
        newFolders[index].targetRole = role;
        setPendingFolders(newFolders);
    };

    // Ejecuta la copia real después del enrutamiento
    const handleExecuteImport = async () => {
        const importToken = getImportToken();
        const sessionToken = accessToken; // El token principal con permisos de escritura
        if (!importToken || !sessionToken || !config?.folderId) return;

        // Validar que todas tengan rol asignado
        const unassigned = pendingFolders.find(f => !f.targetRole);
        if (unassigned) {
            toast.warning(`Debes seleccionar el rol para la carpeta "${unassigned.name}"`);
            return;
        }

        setImportState('copying');
        setCopiedCount(0);
        setTotalFiles(pendingFolders.length); // Representa total de carpetas a procesar

        try {
            let currentRootId = config.folderId;
            let totalImportedFiles = 0;
            let hasErrors = false;
            let currentFolderIndex = 0;

            const newCanonPaths = [...canonPaths];
            const newResourcePaths = [...resourcePaths];

            for (const f of pendingFolders) {
                setCopiedCount(currentFolderIndex); // Actualiza progreso visual (carpetas)
                
                try {
                    const mappedFolder = [{
                        folderId: f.id,
                        folderName: f.name,
                        role: f.targetRole
                    }];

                    // Llamada independiente al backend POR CADA carpeta (resetea el timeout de 5 min)
                    const result = await callFunction<any>('importDriveFolder', {
                        folders: mappedFolder,
                        projectRootId: currentRootId,
                        importToken,
                        sessionToken
                    });

                    if (result.success) {
                        totalImportedFiles += result.copied;
                        
                        // Si el Ghost Detector creó una raíz de emergencia en la primera iteración,
                        // la guardamos para que las siguientes carpetas vayan al mismo lugar.
                        if (result.newFolderId && result.newFolderId !== currentRootId) {
                            currentRootId = result.newFolderId;
                        }

                        // Agregar la nueva carpeta (devuelta en result.files) a la lista correspondiente
                        if (result.createdFolders && result.createdFolders.length > 0) {
                            const clonedFolder = result.createdFolders[0];
                            if (clonedFolder.id) {
                                const newPath: ProjectPath = { id: clonedFolder.id, name: clonedFolder.name || f.name };
                                if (f.targetRole === 'canon') {
                                    newCanonPaths.push(newPath);
                                } else if (f.targetRole === 'resource') {
                                    newResourcePaths.push(newPath);
                                }
                            }
                        }
                    }
                } catch (e: any) {
                    console.error(`Error importando carpeta ${f.name}:`, e);
                    toast.error(`Fallo importando "${f.name}": ${e.message}`);
                    hasErrors = true;
                }
                
                currentFolderIndex++;
            }

            setCopiedCount(pendingFolders.length); // 100%
            
            // Actualizar el estado visual de las rutas
            setCanonPaths(newCanonPaths);
            setResourcePaths(newResourcePaths);

            // 🟢 AUTO-GUARDAR LA CONFIGURACIÓN DEL PROYECTO INMEDIATAMENTE
            try {
                await callFunction('saveProjectConfig', {
                    folderId: currentRootId !== config.folderId ? currentRootId : config.folderId,
                    canonPaths: newCanonPaths,
                    resourcePaths: newResourcePaths
                });
                await refreshConfig();
            } catch (saveError) {
                console.error("No se pudo guardar la taxonomía automáticamente", saveError);
            }
            
            if (hasErrors) {
                toast.warning(`Migración finalizada con algunos errores. ${totalImportedFiles} archivos copiados.`);
            } else {
                toast.success(`Migración completada. ${totalImportedFiles} archivos copiados exitosamente.`);
            }
            
            setImportState('done');
            clearImportToken();
            
        } catch (error: any) {
            console.error("Error crítico en bucle de importación:", error);
            toast.error(`Error de sistema: ${error.message}`);
            setImportState('authorized'); // Devolver estado si colapsa todo
        }
    };

    // 🎨 PALETTE: Focus trap & Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        // Focus modal for accessibility
        if (modalRef.current) {
            modalRef.current.focus();
        }

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Load initial values from context
    useEffect(() => {
        if (config) {
            setCanonPaths(config.canonPaths || []);
            setResourcePaths(config.resourcePaths || []);
            setFolderMapping(config.folderMapping || {});
        }
    }, [config]);

    // 🟢 Explicit fallback sync for folder mapping
    useEffect(() => {
        if (config?.folderMapping) {
            setFolderMapping(config.folderMapping);
        }
    }, [config?.folderMapping]);

    // 🟢 FETCH FOLDER NAMES (Metadata)
    useEffect(() => {
        const fetchNames = async () => {
            if (activeTab !== 'taxonomy') return;

            // Collect IDs that we don't have names for yet
            const idsToFetch = Object.values(folderMapping).filter(id => id && typeof id === 'string' && !folderNames[id]);

            if (idsToFetch.length === 0) return;

            const token = accessToken;
            if (!token) return;

            try {
                // Batch fetch
                const result = await callFunction<{ metadata: Record<string, { name: string }> }>('getBatchDriveMetadata', {
                    accessToken: token,
                    fileIds: idsToFetch
                });

                if (result.metadata) {
                    const newNames: Record<string, string> = {};
                    Object.entries(result.metadata).forEach(([id, meta]) => {
                        newNames[id] = meta.name;
                    });
                    setFolderNames(prev => ({ ...prev, ...newNames }));
                }
            } catch (e) {
                console.error("Failed to fetch folder names:", e);
            }
        };

        fetchNames();
    }, [activeTab, folderMapping]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Correctly typecast or construct the object to match ProjectConfig
            const newConfig: ProjectConfig = config ? {
                ...config,
                canonPaths,
                resourcePaths,
                folderMapping,
            } : {
                // 🟢 CREATE NEW CONFIG IF MISSING
                canonPaths,
                resourcePaths,
                folderMapping,
                activeBookContext: "",
                folderId: "" // Empty root initially
            };

            // Nov 2026: si solo cambió la organización (qué guarda cada carpeta) no hace falta reindexar:
            // el índice depende de qué carpetas son canon o inspiración, no de su tipo.
            const idsOf = (l: any[] = []) => l.map(p => p.id).sort().join(',');
            const pathsChanged = idsOf(canonPaths) !== idsOf(config?.canonPaths) || idsOf(resourcePaths) !== idsOf(config?.resourcePaths);

            await updateConfig(newConfig);
            if (!pathsChanged) toast.success('Guardado. No hace falta reindexar: tus carpetas siguen siendo las mismas.');

            // 🟢 TRIGGER MEMORY INDEX REFRESH (Botón de Indexar Automático)
            const token = accessToken;
            if (token && pathsChanged) {
                try {
                    const allPaths = [...canonPaths, ...resourcePaths];
                    const folderIds = allPaths.map(p => p.id);

                    // 1. Árbol de archivos (Bloqueante para la Bóveda/Sidebar)
                    toast.info(folderIds.length > 0 ? "Actualizando bóveda de archivos..." : "Limpiando bóveda...");
                    await callFunction('getDriveFiles', {
                        folderIds,
                        accessToken: token,
                        recursive: true,
                        persist: true
                    });

                    // 2. Cerebro / Vector Indexing (En segundo plano)
                    if (folderIds.length > 0) {
                        toast.info("Iniciando indexado profundo en segundo plano...");

                        // Fire and forget (No await para no bloquear el modal)
                        callFunction('indexTDB', {
                            folderIds: folderIds,
                            projectId: newConfig.folderId || "no-root", // Fallback (Aunque folderId no se use realmente en indexado descentralizado, es de rigor)
                            accessToken: token,
                            forceFullReindex: false
                        }).then((result: any) => {
                            toast.success(`¡Aprendizaje Completado! ${result?.message || ''}`);
                        }).catch(err => {
                            console.error("Auto-index error:", err);
                            toast.error("Error en indexado automático de memoria. Revisa la consola.");
                        });
                    }

                } catch (e) {
                    console.error("Failed to refresh index:", e);
                    toast.warning("Configuración guardada, pero falló la actualización de la bóveda.");
                }
            }

            onClose();
        } catch (error) {
            toast.error("Error al guardar la configuración.");
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to manage list inputs
    const removePath = (list: ProjectPath[], setList: (l: ProjectPath[]) => void, index: number) => {
        const newList = [...list];
        newList.splice(index, 1);
        setList(newList);
    };

    // 🟢 AI AUTO-DISCOVERY
    const handleAutoDiscover = async () => {
        const token = accessToken;
        if (!token) { toast.error('Reconecta Google Drive para analizar tus carpetas.'); return; }
        setIsAnalyzing(true);

        if (!config?.folderId && !config?.canonPaths?.length) {
            toast.error('Primero crea o conecta una carpeta de proyecto.');
            setIsAnalyzing(false);
            return;
        }

        try {
            toast.info("Escaneando estructura de carpetas...");
            const data = await callFunction<any>('discoverFolderRoles', {
                accessToken: token,
                rootFolderId: config?.folderId,
                canonPaths: canonPaths.length ? canonPaths : (config?.canonPaths || []),
                resourcePaths: resourcePaths.length ? resourcePaths : (config?.resourcePaths || []),
            });

            if (data.suggestion && Object.keys(data.suggestion).length > 0) {
                setFolderMapping(prev => ({ ...prev, ...data.suggestion }));
                if (Array.isArray(data.folderList)) setFolderNames(prev => ({ ...prev, ...Object.fromEntries(data.folderList.map((f: any) => [f.id, f.name])) }));
                
                // Update lists if backend provided them
                if (data.canonPaths) setCanonPaths(data.canonPaths);
                if (data.resourcePaths) setResourcePaths(data.resourcePaths);

                toast.success(`Listo: ${Object.keys(data.suggestion).length} tipos de carpeta asignados. Revísalos y guarda.`);
            } else {
                toast.warning(data.message || "No se pudieron deducir roles automáticamente.");
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
        if (!confirm(t.editor.noProjectDesc)) return; // reusing message approx

        setIsAnalyzing(true);
        const token = accessToken;
        const rootId = config?.folderId;

        if (!token || !rootId) {
            toast.error("Falta configuración base (Token o Root ID).");
            setIsAnalyzing(false);
            return;
        }

        try {
            toast.info("Construyendo cimientos...");
            const data = await callFunction<any>('createTitaniumStructure', { accessToken: token, rootFolderId: rootId });

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
        const token = accessToken;
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
                <label className="text-sm font-semibold text-titanium-200 mb-2 flex items-center gap-2">
                    <Icon size={14} /> {label}
                </label>

                <div className="space-y-2">
                    {paths.length === 0 ? (
                        <div className="flex items-center justify-center p-4 bg-titanium-800/30 border border-dashed border-titanium-700/50 rounded text-titanium-500 text-xs text-center">
                            Aquí irán tus carpetas importadas o creadas.
                        </div>
                    ) : (
                        paths.map((path, idx) => {
                            return (
                                <div key={path.id} className="flex items-center justify-between bg-titanium-800/50 px-3 py-2 rounded border border-titanium-700/50 transition-all duration-300">
                                    <div className="flex items-center gap-3">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-titanium-200">
                                                {path.name}
                                            </span>
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
                        })
                    )}
                </div>
            </div>
        );
    };

    // 🟢 ROLE MAPPER COMPONENT
    const RoleRow = ({ role, label, desc }: { role: FolderRole, label: string, desc: string }) => {
        const currentId = folderMapping[role];
        const displayName = currentId ? (folderNames[currentId] || currentId) : null;

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
                        <span className="text-xs text-titanium-300 max-w-[220px] truncate" title={displayName || currentId}>
                            {displayName}
                        </span>
                    )}
                    <button
                        onClick={() => selectFolderForRole(role)}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${currentId
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
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div
                id="project-settings-modal"
                ref={modalRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="project-settings-title"
                className="bg-titanium-900 border border-titanium-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] focus:outline-none"
            >

                {/* Header */}
                <div className="p-6 border-b border-titanium-700/50 bg-titanium-800/30">
                    <div className="flex justify-between items-start mb-6">
                        <div>
                            <h2 id="project-settings-title" className="font-serif text-xl font-semibold text-titanium-100">{currentLanguage === 'en' ? 'Your project' : 'Tu proyecto'}</h2>
                            <p className="text-sm text-titanium-400 mt-1">{currentLanguage === 'en' ? 'Which folders are canon and which are inspiration.' : 'Qué carpetas son canon y cuáles son inspiración.'}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-titanium-400 hover:text-white transition-colors"
                            aria-label="Cerrar configuración"
                        >
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
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'paths'
                                ? 'bg-titanium-700 text-white shadow-sm'
                                : 'text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50'
                                }`}
                        >
                            <Folder size={14} /> {t.settings.accessPaths}
                        </button>
                        <button
                            onClick={() => setActiveTab('taxonomy')}
                            role="tab"
                            aria-selected={activeTab === 'taxonomy'}
                            aria-controls="panel-taxonomy"
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'taxonomy'
                                ? 'bg-mira/15 text-mira shadow-sm border border-mira/50'
                                : 'text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50'
                                }`}
                        >
                            <Brain size={14} /> {t.settings.taxonomy}
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">

                    {activeTab === 'paths' && (
                        <div id="project-settings-paths" className="space-y-8 animate-in slide-in-from-left-4 duration-300">
                            
                            {/* Import Old Work Header */}
                            <div className="bg-titanium-950/30 p-4 rounded-lg border border-titanium-800 space-y-4">
                                
                                {/* Header Title */}
                                <div>
                                    <h3 className="text-sm font-bold text-titanium-200 flex items-center gap-2">
                                        <Download size={16} className="text-mira" /> {t.settings.migrateDrive}
                                    </h3>
                                </div>

                                {/* State 1: Unauthorized */}
                                {importState === 'unauthorized' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <p className="text-xs text-titanium-400 leading-relaxed">
                                            Para importar una carpeta completa, MyWorld necesita acceso 
                                            temporal de solo-lectura a tu Drive. Este acceso se usa 
                                            únicamente para copiar tus archivos y luego se descarta.
                                        </p>
                                        <button
                                            onClick={handleRequestImportScope}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-mira/20 hover:bg-mira/30 border border-mira/30 text-mira text-sm font-medium rounded-lg transition-colors"
                                        >
                                            <FolderOpen size={15} />
                                            {t.settings.authorizeImport}
                                        </button>
                                        <p className="text-[10px] text-titanium-500 text-center mt-2">
                                            Google te mostrará una pantalla de consentimiento adicional
                                        </p>
                                    </div>
                                )}

                                {/* State 2: Authorized */}
                                {importState === 'authorized' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                            <CheckCircle size={13} className="text-emerald-400" />
                                            <p className="text-xs text-emerald-400">
                                                Acceso de importación concedido temporalmente
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleOpenFolderPicker}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 text-titanium-300 text-sm rounded-lg transition-colors"
                                        >
                                            <Folder size={15} className="text-mira" />
                                            Seleccionar carpeta de mi proyecto
                                        </button>
                                    </div>
                                )}

                                {/* State 3: Routing (Wizard Step) */}
                                {importState === 'routing' && (
                                    <div className="space-y-4 animate-in fade-in duration-300">
                                        <p className="text-xs text-titanium-400">
                                            Seleccionaste {pendingFolders.length} carpetas. ¿A dónde debería ir cada una?
                                        </p>
                                        
                                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-titanium-700">
                                            {pendingFolders.map((folder, index) => (
                                                <div key={folder.id} className="flex flex-col gap-1.5 p-3 bg-titanium-800/50 rounded border border-titanium-700">
                                                    <div className="flex items-center gap-2 text-sm text-titanium-200 font-medium">
                                                        <Folder size={14} className="text-mira shrink-0" />
                                                        <span className="truncate">{folder.name}</span>
                                                    </div>
                                                    
                                                    <select
                                                        value={folder.targetRole || ''}
                                                        onChange={(e) => handleUpdateFolderRoute(index, e.target.value as any)}
                                                        className="w-full bg-titanium-900 text-xs text-titanium-300 border border-titanium-600 rounded px-2 py-1.5 focus:border-mira/40 outline-none"
                                                    >
                                                        <option value="" disabled>Asignar Rol Funcional...</option>
                                                        <option value="canon">Canon (Añadir a Rutas Canon)</option>
                                                        <option value="resource">Recurso (Añadir a Rutas de Recursos)</option>
                                                        <option value="root">Dejar en la Raíz (Sin organizar)</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2 pt-2 border-t border-titanium-700/50">
                                            <button
                                                onClick={() => { setImportState('authorized'); setPendingFolders([]); }}
                                                className="flex-1 py-2 bg-titanium-800 hover:bg-titanium-700 text-xs font-medium text-titanium-300 rounded transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleExecuteImport}
                                                className="flex-1 py-2 bg-mira/25 hover:bg-mira/25 text-xs font-medium text-white rounded transition-colors"
                                            >
                                                Iniciar Copia
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* State 4: Copying */}
                                {importState === 'copying' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={13} className="text-mira animate-spin" />
                                            <span className="text-sm text-titanium-400">
                                                {totalFiles > 0 
                                                    ? `Importando carpeta ${Math.min(copiedCount + 1, totalFiles)} de ${totalFiles}...` 
                                                    : 'Copiando archivos recursivamente...'}
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-titanium-800 rounded-full overflow-hidden">
                                            <div 
                                                className={`h-full bg-mira/25 rounded-full transition-all duration-500 ${totalFiles === 0 ? 'animate-pulse w-full' : ''}`}
                                                style={totalFiles > 0 ? { width: `${(Math.max(copiedCount, 0.5) / totalFiles) * 100}%` } : {}}
                                            />
                                        </div>
                                        <p className="text-xs text-titanium-500">
                                            Por favor no cierres esta ventana.
                                        </p>
                                    </div>
                                )}

                                {/* State 4: Done */}
                                {importState === 'done' && (
                                    <div className="space-y-3 animate-in fade-in duration-300">
                                        <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                                            <div>
                                                <p className="text-sm font-medium text-emerald-400">
                                                    ¡Migración completada!
                                                </p>
                                                <p className="text-xs text-titanium-400 mt-1">
                                                    {totalFiles} archivos copiados a tu bóveda. 
                                                    El acceso de importación ha sido revocado automáticamente.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setImportState('authorized')}
                                            className="w-full py-2 bg-titanium-800 hover:bg-titanium-700 text-xs font-medium text-titanium-300 rounded transition-colors"
                                        >
                                            Importar otra carpeta
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <PathListInput
                                    label="Canon: lo que es verdad en tu historia"
                                    paths={canonPaths}
                                    setPaths={setCanonPaths}
                                    icon={Book}
                                />
                                <PathListInput
                                    label="Inspiración: referencias y apuntes"
                                    paths={resourcePaths}
                                    setPaths={setResourcePaths}
                                    icon={Star}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'taxonomy' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">

                            {/* Tools Header */}
                            <div className="flex items-center justify-between bg-titanium-950/30 p-4 rounded-lg border border-titanium-800">
                                <div>
                                    <h3 className="text-sm font-bold text-titanium-200 flex items-center gap-2">
                                        <Cpu size={16} className="text-mira" /> Qué guarda cada carpeta
                                    </h3>
                                    <p className="text-xs text-titanium-500 mt-1">
                                        Así Mira y el Arquitecto saben dónde buscar y dónde guardar lo nuevo (una ficha va a Personajes, un capítulo a la historia).
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAutoDiscover}
                                        disabled={isAnalyzing}
                                        className="px-3 py-1.5 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 rounded text-xs font-medium text-titanium-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Brain size={14} /> {isAnalyzing ? 'Analizando…' : 'Detectar solo'}
                                    </button>
                                    <button
                                        onClick={handleCreateStructure}
                                        disabled={isAnalyzing}
                                        className="px-3 py-1.5 bg-titanium-800 hover:bg-titanium-700 border border-titanium-700 rounded text-xs font-medium text-titanium-300 transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <LayoutTemplate size={14} /> {t.sidebar.createStandard}
                                    </button>
                                </div>
                            </div>

                            {/* Mappings List */}
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-titanium-100 mb-2">El mundo</h4>
                                <RoleRow role={FolderRole.WORLD_CORE} label="Reglas del mundo" desc="Física, magia, cosmología." />
                                <RoleRow role={FolderRole.LORE_HISTORY} label="Historia del mundo" desc="Cronologías, mitos, eventos pasados." />

                                <h4 className="text-sm font-semibold text-titanium-100 mt-6 mb-2">Quiénes lo habitan</h4>
                                <RoleRow role={FolderRole.ENTITY_PEOPLE} label="Personajes" desc="Quienes hablan y actúan en tu historia." />
                                <RoleRow role={FolderRole.ENTITY_BESTIARY} label="Bestiario" desc="Criaturas, monstruos, flora." />
                                <RoleRow role={FolderRole.ENTITY_FACTIONS} label="Facciones" desc="Gremios, religiones, ejércitos." />

                                <h4 className="text-sm font-semibold text-titanium-100 mt-6 mb-2">Lo que escribes</h4>
                                <RoleRow role={FolderRole.SAGA_MAIN} label="Tu historia" desc="Los libros y capítulos principales." />
                                <RoleRow role={FolderRole.SAGA_EXTRAS} label="Historias aparte" desc="Relatos cortos y spin-offs." />
                                <RoleRow role={FolderRole.DRAFTS} label="Borradores" desc="Ideas sin procesar." />
                                <RoleRow role={FolderRole.RESOURCES} label="Recursos" desc="Referencias: PDFs, imágenes, apuntes." />
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
                        {t.common.cancel}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-DEFAULT text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent-DEFAULT/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={16} />
                        {isSaving ? t.common.saving : t.common.save}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ProjectSettingsModal;
