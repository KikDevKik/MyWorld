import { confirmDialog } from './confirmDialog';
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { X, Plus, Trash2, Save, Folder, Book, Star, Brain, Cpu, LayoutTemplate, Download, Loader2, CheckCircle2, FolderOpen, CheckCircle } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import useDrivePicker from 'react-google-drive-picker';
import { ProjectPath, FolderRole, ProjectConfig } from '../../types/project'; // Corrected import
import { callFunction } from '../../services/api';
import { openDriveFilePicker, PickedFile } from '../../utils/drivePicker';

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
    const [importState, setImportState] = useState<'pick' | 'routing' | 'copying' | 'done'>('pick');
    const [importQuery, setImportQuery] = useState('');
    const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([]);
    const [importRole, setImportRole] = useState<'canon' | 'resource' | 'root'>('canon');
    const [importGroupName, setImportGroupName] = useState('');
    const [importResult, setImportResult] = useState<{ copied: number; skipped: number; errors: string[] } | null>(null);
    const [folderNames, setFolderNames] = useState<Record<string, string>>({}); // 🟢 Cache for names

    const modalRef = useRef<HTMLDivElement>(null);

    // Google Drive Picker Hook
    const [openPicker] = useDrivePicker();

    // Nov 2026: traer trabajo anterior con el selector de archivos de Google (sin pedir permiso para
    // ver todo el Drive). El autor busca por nombre, entra a sus carpetas y elige varios archivos.
    const handleOpenFilePicker = async () => {
        if (!accessToken) { toast.error('Vuelve a entrar para conectar tu Drive.'); return; }
        try {
            await openDriveFilePicker({
                token: accessToken,
                query: importQuery,
                onPicked: (files) => {
                    if (!files.length) return;
                    setPickedFiles(files);
                    if (!importGroupName) setImportGroupName(importQuery.trim());
                    setImportState('routing');
                },
            });
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo abrir el selector de Google.');
        }
    };

    const handleExecuteImport = async () => {
        if (!accessToken) return;
        setImportState('copying');
        try {
            const rootId = config?.folderId;
            if (!rootId) throw new Error('Primero crea o conecta la carpeta de tu proyecto; después traes tus archivos.');
            const r = await callFunction<any>('importPickedFiles', {
                files: pickedFiles.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
                role: importRole, groupName: importGroupName, projectRootId: rootId, sessionToken: accessToken,
            });
            setImportResult({ copied: r?.copied || 0, skipped: r?.skipped || 0, errors: r?.errors || [] });
            const created = r?.createdFolder;
            if (created?.id && importRole !== 'root') {
                const path: ProjectPath = { id: created.id, name: created.name };
                const nextCanon = importRole === 'canon' ? [...canonPaths, path] : canonPaths;
                const nextRes = importRole === 'resource' ? [...resourcePaths, path] : resourcePaths;
                setCanonPaths(nextCanon); setResourcePaths(nextRes);
                try { await callFunction('saveProjectConfig', { folderId: rootId, canonPaths: nextCanon, resourcePaths: nextRes }); await refreshConfig(); } catch { /* se guarda al pulsar Guardar */ }
            }
            setImportState('done');
        } catch (e: any) {
            toast.error(e?.message || 'No pude copiar los archivos.');
            setImportState('routing');
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
        if (!(await confirmDialog(t.editor.noProjectDesc))) return;

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
            // Nov 2026: sin appId, Google no le da a MyWorld acceso a la carpeta elegida (drive.file).
            appId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
            locale: 'es',
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

                                {importState === 'pick' && (
                                    <div className="space-y-3">
                                        <p className="text-[13px] text-titanium-300 leading-relaxed">
                                            Trae capítulos, fichas o notas que ya tienes en tu Drive. Se abre el selector de Google: MyWorld solo podrá leer los archivos que elijas, y los copia a tu proyecto sin tocar los originales.
                                        </p>
                                        <label htmlFor="import-query" className="block text-[12px] font-medium text-titanium-300">¿Cómo se llama lo que buscas? <span className="font-normal text-titanium-500">(opcional)</span></label>
                                        <input
                                            id="import-query"
                                            value={importQuery}
                                            onChange={e => setImportQuery(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleOpenFilePicker(); } }}
                                            placeholder="Ej.: el nombre de tu novela, «capítulo», «personajes»…"
                                            className="w-full rounded-lg border border-titanium-700 bg-titanium-900 px-3 py-2 text-[13px] text-titanium-100 placeholder:text-titanium-500 outline-none focus:border-mira/60"
                                        />
                                        <button
                                            onClick={handleOpenFilePicker}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-coral text-on-coral text-sm font-semibold hover:brightness-110"
                                        >
                                            <FolderOpen size={15} aria-hidden="true" />
                                            {importQuery.trim() ? `Buscar «${importQuery.trim()}» en mi Drive` : 'Buscar en mi Drive'}
                                        </button>
                                        <ul className="space-y-1 text-[12px] leading-relaxed text-titanium-400">
                                            <li>• Arriba a la izquierda tienes Mi Drive, Destacados y Compartidos conmigo, y una barra para buscar por nombre.</li>
                                            <li>• Puedes entrar a tus carpetas y elegir varios archivos: haz clic en el primero y Mayús + clic en el último.</li>
                                            <li>• Solo se muestran los que MyWorld sabe leer: documentos de Google, Word, PDF, texto y Markdown.</li>
                                        </ul>
                                    </div>
                                )}

                                {importState === 'routing' && (
                                    <div className="space-y-3">
                                        <p className="text-[13px] text-titanium-200">Elegiste {pickedFiles.length} {pickedFiles.length === 1 ? 'archivo' : 'archivos'}.</p>
                                        <ul className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-titanium-800 bg-titanium-900/60 p-2 text-[12px] text-titanium-300">
                                            {pickedFiles.map(f => <li key={f.id} className="truncate">{f.name}</li>)}
                                        </ul>
                                        <fieldset className="space-y-1.5">
                                            <legend className="text-[12px] font-medium text-titanium-300 mb-1">¿Qué son?</legend>
                                            {([['canon', 'Parte de mi historia (canon)', 'Lo que la IA toma como verdad: capítulos, personajes, lugares.'], ['resource', 'Material de consulta (recursos)', 'Notas, investigación, ideas que no son canon.'], ['root', 'Todavía no sé', 'Quedan en la carpeta del proyecto y los ordenas después.']] as const).map(([val, label, hint]) => (
                                                <label key={val} className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer ${importRole === val ? 'border-mira/60 bg-mira/10' : 'border-titanium-800 hover:border-titanium-600'}`}>
                                                    <input type="radio" name="import-role" value={val} checked={importRole === val} onChange={() => setImportRole(val)} className="mt-1 accent-[var(--color-mira)]" />
                                                    <span><span className="block text-[13px] text-titanium-100">{label}</span><span className="block text-[11px] text-titanium-500">{hint}</span></span>
                                                </label>
                                            ))}
                                        </fieldset>
                                        <label htmlFor="import-group" className="block text-[12px] font-medium text-titanium-300">Nombre de la carpeta donde quedan</label>
                                        <input id="import-group" value={importGroupName} onChange={e => setImportGroupName(e.target.value)} placeholder="Traído de mi Drive" className="w-full rounded-lg border border-titanium-700 bg-titanium-900 px-3 py-2 text-[13px] text-titanium-100 placeholder:text-titanium-500 outline-none focus:border-mira/60" />
                                        <div className="flex gap-2 pt-1">
                                            <button onClick={() => { setPickedFiles([]); setImportState('pick'); }} className="flex-1 py-2 rounded-lg border border-titanium-700 text-[13px] text-titanium-300 hover:bg-titanium-800">Cancelar</button>
                                            <button onClick={handleOpenFilePicker} className="flex-1 py-2 rounded-lg border border-titanium-700 text-[13px] text-titanium-300 hover:bg-titanium-800">Elegir otros</button>
                                            <button onClick={handleExecuteImport} className="flex-1 py-2 rounded-lg bg-coral text-on-coral text-[13px] font-semibold hover:brightness-110">Copiar {pickedFiles.length}</button>
                                        </div>
                                    </div>
                                )}

                                {importState === 'copying' && (
                                    <div className="flex items-center gap-2 py-2" role="status">
                                        <Loader2 size={14} className="text-mira animate-spin" aria-hidden="true" />
                                        <span className="text-[13px] text-titanium-300">Copiando {pickedFiles.length} {pickedFiles.length === 1 ? 'archivo' : 'archivos'} a tu proyecto… No cierres esta ventana.</span>
                                    </div>
                                )}

                                {importState === 'done' && importResult && (
                                    <div className="space-y-3">
                                        <div className="flex items-start gap-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                            <CheckCircle2 size={16} className="text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                                            <div className="text-[13px]">
                                                <p className="font-medium text-emerald-300">Listo: {importResult.copied} {importResult.copied === 1 ? 'archivo copiado' : 'archivos copiados'}.</p>
                                                {importResult.skipped > 0 && <p className="text-titanium-400 mt-1">{importResult.skipped} no se copiaron porque MyWorld no sabe leer ese tipo de archivo.</p>}
                                                {importResult.errors.length > 0 && <p className="text-titanium-400 mt-1">No pude copiar: {importResult.errors.join(', ')}.</p>}
                                                <p className="text-titanium-400 mt-1">Tus originales siguen en su lugar.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => { setPickedFiles([]); setImportResult(null); setImportGroupName(''); setImportState('pick'); }} className="w-full py-2 rounded-lg border border-titanium-700 text-[13px] text-titanium-300 hover:bg-titanium-800">Traer más archivos</button>
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
