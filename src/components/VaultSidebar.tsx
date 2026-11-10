/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Settings, LogOut, HelpCircle, HardDrive, BrainCircuit, ChevronDown, ChevronRight, Plus, Key, FolderCog, AlertTriangle, Eye, EyeOff, LayoutTemplate, Loader2, FilePlus, FolderPlus, Sparkles, Download, X, Brain, RefreshCw } from 'lucide-react';
import GuidePanel from './ui/GuidePanel';
import CreateItemModal from './ui/CreateItemModal';
import FolderPickerModal from './ui/FolderPickerModal';
import MemoryPanel from './ui/MemoryPanel';
import { OPEN_MEMORY_PANEL } from './ui/MemoryToast';
import useDrivePicker from 'react-google-drive-picker';
import FileTree from './FileTree';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { useLayoutStore } from "../stores/useLayoutStore"; // 🟢 IMPORT STORE
import { getFirestore, onSnapshot, collection, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { toast } from 'sonner';
import CreateProjectModal from './ui/CreateProjectModal';
import { callFunction } from '../services/api';
import { EntityService } from '../services/EntityService';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';
import { getLocalizedFolderName } from '../utils/folderLocalization';

interface VaultSidebarProps {
    folderId: string;
    onFolderIdChange: (id: string) => void;
    onFileSelect: (id: string, content: string, name?: string, isBackgroundUpdate?: boolean) => void;
    onOpenConnectModal: () => void;
    onLogout: () => void;
    onIndexRequest: () => void;
    onUpdateMemory: () => void; // 👈 New prop for God Mode
    onOpenSettings: () => void;
    onOpenProjectSettings: () => void; // 👈 New prop for Project Settings Modal
    accessToken: string | null;
    onRefreshTokens: () => void;
    driveStatus: 'connected' | 'refreshing' | 'error' | 'disconnected';
    onOpenManual: () => void; // 👈 New prop
    isIndexed?: boolean; // 👈 New prop for Index State
    isSecurityReady?: boolean; // 👈 New prop for Circuit Breaker
    activeFileId?: string | null; // 👈 New prop
    onCreateFile?: () => void;
    onFileCreated?: (id: string, content: string, name: string) => void;
    onGenesis?: () => void; // 👈 New prop for Genesis
    onStartTutorial?: () => void; // 🟢 NEW PROP FOR GUIDE
    onOpenStartingAssistant?: () => void; // 🟢 SPRINT 6.5
}

// Interfaz para los archivos que vienen del FileTree
interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
}

const VaultSidebar: React.FC<VaultSidebarProps> = ({
    folderId,
    onFolderIdChange,
    onFileSelect,
    onOpenConnectModal,
    onLogout,
    onIndexRequest,
    onUpdateMemory, // 👈 Destructure
    onOpenSettings,
    onOpenProjectSettings,
    accessToken,
    onRefreshTokens,
    driveStatus,
    onOpenManual, // 👈 Destructure
    isIndexed = false, // 👈 Default to false
    isSecurityReady = false, // 👈 Default false for safety
    activeFileId, // 👈 Destructure
    onCreateFile,
    onFileCreated,
    onGenesis,
    onStartTutorial,
    onOpenStartingAssistant,
}) => {
    // STATE
    const [selectedSagaId, setSelectedSagaId] = useState<string | null>(null);
    const [isGuidePanelOpen, setIsGuidePanelOpen] = useState(false);

    // 🟢 NEW: SPLIT TREE STATE
    const [isCanonOpen, setIsCanonOpen] = useState(true);
    const [isResourcesOpen, setIsResourcesOpen] = useState(true);

    // 🟢 CONSUME GLOBAL CONTEXT
    const { fileTree, isFileTreeLoading, config, updateConfig, refreshConfig, fileTreeRefreshKey } = useProjectConfig();
    const { showOnlyHealthy } = useLayoutStore(); // 🟢 READ FROM STORE

    // 🟢 DERIVED STATE
    // hasConfiguredFoldersGlobal se basa en taxonomía (canonPaths/resourcePaths),
    // NO en folderId solo. Tener un folderId sin taxonomía = proyecto sin configurar.
    const hasConfiguredFoldersGlobal = !!(config?.canonPaths?.length || config?.resourcePaths?.length);
    const isEmptyProject = (!fileTree || fileTree.length === 0) && !hasConfiguredFoldersGlobal;

    // 🟢 SMART SYNC STATE
    const hasSyncedRef = useRef(false);

    // 🟢 RESET SYNC ON FOLDER CHANGE
    useEffect(() => {
        hasSyncedRef.current = false;
    }, [folderId]);

    // 🟢 SMART SYNC (AUTO-INDEX EXTERNAL CHANGES)
    useEffect(() => {
        if (driveStatus === 'connected' && accessToken && folderId && !isFileTreeLoading && !isEmptyProject && !hasSyncedRef.current) {
            hasSyncedRef.current = true;
            console.log("🔄 Triggering Initial Smart Sync...");

            runSmartSync();
        }
    }, [driveStatus, accessToken, folderId, isFileTreeLoading, isEmptyProject]);

    // Oct 2026: "Sincronizar ahora". La sincronización automática (al abrir y al volver a la pestaña) ya trae
    // las notas creadas o editadas en Obsidian; este botón la lanza en el momento. Bloqueado mientras corre.
    const [isBringing, setIsBringing] = useState(false);
    const handleBringNotes = async () => {
        if (isBringing || !accessToken) return;
        setIsBringing(true);
        try {
            const res = await callFunction<{ added: number; updated?: number; deleted: number; pending?: number; success: boolean }>('syncSmart', { accessToken }, { timeout: 300000 });
            const added = res?.added || 0, updated = res?.updated || 0, deleted = res?.deleted || 0;
            if (added + updated + deleted > 0) {
                const partes = [
                    added ? `${added} nueva${added === 1 ? '' : 's'}` : '',
                    updated ? `${updated} editada${updated === 1 ? '' : 's'}` : '',
                    deleted ? `${deleted} borrada${deleted === 1 ? '' : 's'}` : '',
                ].filter(Boolean).join(', ');
                toast.success('Sincronizado con Drive', { description: `${partes}${res?.pending ? ` · ${res.pending} más en la próxima pasada` : ''}.` });
                refreshConfig();
            } else {
                toast.success('Todo está al día', { description: 'No hay notas nuevas ni cambios en Drive/Obsidian desde la última sincronización.' });
            }
            lastSyncRef.current = Date.now();
        } catch {
            toast.error('No se pudo sincronizar. Intenta de nuevo en un momento.');
        } finally {
            setIsBringing(false);
        }
    };

    // Oct 2026: el aviso de la Memoria ("Ver memoria") abre este panel desde cualquier parte.
    useEffect(() => {
        const open = () => setIsMemoryOpen(true);
        window.addEventListener(OPEN_MEMORY_PANEL, open);
        return () => window.removeEventListener(OPEN_MEMORY_PANEL, open);
    }, []);

    // Oct 2026: sincronizar también al volver a la pestaña (p. ej. desde Obsidian), como mucho cada 3 min.
    const lastSyncRef = useRef(0);
    const runSmartSync = () => {
        if (!accessToken) return;
        lastSyncRef.current = Date.now();
        callFunction<{ added: number, updated?: number, deleted: number, pending?: number, success: boolean }>('syncSmart', { accessToken }, { timeout: 300000 })
            .then(res => {
                if (!res?.success) return;
                const changed = (res.added || 0) + (res.updated || 0) + (res.deleted || 0);
                if (changed > 0) {
                    console.log(`🔄 Smart Sync: +${res.added} ~${res.updated || 0} -${res.deleted}`);
                    const partes = [
                        res.added ? `${res.added} nuevo${res.added === 1 ? '' : 's'}` : '',
                        res.updated ? `${res.updated} editado${res.updated === 1 ? '' : 's'}` : '',
                        res.deleted ? `${res.deleted} borrado${res.deleted === 1 ? '' : 's'}` : '',
                    ].filter(Boolean).join(', ');
                    toast.success('Sincronizado con Drive', {
                        description: `${partes}${res.pending ? ` · ${res.pending} más en la próxima pasada` : ''}.`,
                    });
                    if ((res.added || 0) + (res.deleted || 0) > 0) refreshConfig();
                }
            })
            .catch(err => console.warn("Smart Sync skipped/failed:", err));
    };
    useEffect(() => {
        const onFocus = () => {
            if (document.visibilityState !== 'visible') return;
            if (!hasSyncedRef.current || Date.now() - lastSyncRef.current < 3 * 60 * 1000) return;
            if (driveStatus !== 'connected' || isEmptyProject) return;
            runSmartSync();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
    });

    const accountUser = getAuth().currentUser;

    // 🟢 LOCALIZATION
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].sidebar;
    const tStatus = TRANSLATIONS[currentLanguage].status;
    const tCommon = TRANSLATIONS[currentLanguage].common;

    // 🟢 CONFLICT STATE & FILTER
    const [conflictingFileIds, setConflictingFileIds] = useState<Set<string>>(new Set());
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Delete mode (legacy — kept for checkbox API compat, always false)
    const isDeleteMode = false;
    const selectedDeleteIds = new Set<string>();
    const handleToggleDeleteSelect = useCallback((_id: string) => {}, []);

    // 🟢 INDEX MENU STATE
    const [isIndexMenuOpen, setIsIndexMenuOpen] = useState(false);
    const indexMenuRef = useRef<HTMLDivElement>(null);

    // 🟢 CREATE ITEM MODAL
    const [isCreateItemOpen, setIsCreateItemOpen] = useState(false);

    // Close menus when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (indexMenuRef.current && !indexMenuRef.current.contains(event.target as Node)) {
                setIsIndexMenuOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [indexMenuRef]);

    // 🟢 LISTEN FOR CONFLICTS (Using EntityService)
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user || !isSecurityReady || !config?.folderId) return;

        console.log("📡 Listening for Conflicting Entities...");
        const unsubscribe = EntityService.subscribeToConflicts(
            user.uid,
            config.folderId,
            (entities) => {
                const conflictIds = new Set<string>();
                entities.forEach(entity => {
                    // Si tienes conflictos, típicamente se muestra el error en el archivo, 
                    // necesitamos mapearlo a id de drive o ID de entidad que el UI usa para resaltar
                    if (entity.id) { 
                        conflictIds.add(entity.id);
                    }
                    if (entity.driveFileId) {
                        conflictIds.add(entity.driveFileId);
                    }
                });
                console.log(`⚠️ Updated Conflicts: ${conflictIds.size} entities`);
                setConflictingFileIds(conflictIds);
            },
            (error) => {
                console.error("Error listening for conflicts:", error);
            }
        );

        return () => unsubscribe();
    }, [isSecurityReady, config?.folderId]);


    // 🟢 OPTIMIZED TREE SPLIT LOGIC (useMemo)
    const { topLevelFolders, canonNodes, resourceNodes, unassignedNodes } = useMemo(() => {
        if (!fileTree || !Array.isArray(fileTree)) {
            return {
                topLevelFolders: [],
                canonNodes: [],
                resourceNodes: [],
                unassignedNodes: []
            };
        }

        // 1. Saga Selector (Raw Folders)
        const folders = fileTree.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder');

        // 2. Split Logic (Canon vs Resources)
        if (config) {
            const canonIds = new Set(config.canonPaths?.map(p => p.id) || []);
            const resourceIds = new Set(config.resourcePaths?.map(p => p.id) || []);

            const cNodes: FileNode[] = [];
            const rNodes: FileNode[] = [];
            const uNodes: FileNode[] = [];

            fileTree.forEach(node => {
                // Check ID (Shortcut ID from config)
                // Note: node.id is the Original ID (Shortcut ID) as per backend update.
                if (canonIds.has(node.id)) {
                    cNodes.push(node);
                } else if (resourceIds.has(node.id)) {
                    rNodes.push(node);
                } else {
                    uNodes.push(node);
                }
            });

            return {
                topLevelFolders: folders,
                canonNodes: cNodes,
                resourceNodes: rNodes,
                unassignedNodes: uNodes
            };
        } else {
            // Fallback if config not loaded yet
            return {
                topLevelFolders: folders,
                canonNodes: [],
                resourceNodes: [],
                unassignedNodes: fileTree
            };
        }
    }, [fileTree, config]);


    // 🟢 CREATE STANDARD PROJECT
    const handleCreateProject = async (name: string, kind?: 'mundo' | 'realista') => {
        try {
            toast.info("Creando la estructura del proyecto…");

            const result = await callFunction<any>('createTitaniumStructure', {
                accessToken: accessToken,
                newProjectName: name,
                bookKind: kind,
            });

            console.log('[DEBUG] createTitaniumStructure result:', JSON.stringify(result));

            // Auto-assign taxonomy if no canon paths are already configured.
            // NO usar ...config: el backend ya guardó folderId/projectName en Firestore.
            // Solo actualizamos los campos de taxonomía para no sobreescribir con valores stale.
            if (result?.canonPaths?.length > 0 && !(config?.canonPaths?.length > 0)) {
                try {
                    await updateConfig({
                        canonPaths: result.canonPaths,
                        resourcePaths: result.resourcePaths || [],
                        primaryCanonPathId: result.canonPaths[0]?.id || null,
                    } as any);
                } catch (e) {
                    console.warn('Auto-taxonomy save failed (non-critical):', e);
                }
            }

            await refreshConfig();

            localStorage.setItem('show_taxonomy_toast', 'true');
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } catch (error: any) {
            console.error("Error creating project:", error);
            toast.error("Error al crear el proyecto: " + error.message);
            throw error;
        }
    };

    // 🟢 DELETE: Direct API call, no modal needed (files go to Drive trash = recoverable)
    const handleDeleteSingle = useCallback(async (fileId: string, fileName: string) => {
        try {
            await callFunction('trashDriveItems', { accessToken, fileIds: [fileId] });
            toast.success(`"${fileName}" movido a la papelera.`);
            await refreshConfig();
        } catch (e: any) {
            toast.error('Error al eliminar: ' + e.message);
        }
    }, [accessToken, refreshConfig]);

    // 🟢 MOVE FILE STATE
    const [isMemoryOpen, setIsMemoryOpen] = useState(false);
    const [moveTargetFile, setMoveTargetFile] = useState<{ id: string; name: string; parentId?: string } | null>(null);
    const [isMovingFileId, setIsMovingFileId] = useState<string | null>(null);

    const handleMoveFile = (fileId: string, fileName: string, parentId?: string) => {
        setMoveTargetFile({ id: fileId, name: fileName, parentId });
    };

    const handleConfirmMove = async (targetFolderId: string, targetFolderName?: string) => {
        if (!moveTargetFile || !accessToken) return;
        const fileId = moveTargetFile.id;
        const fileName = moveTargetFile.name;
        const currentParentId = moveTargetFile.parentId;
        setIsMovingFileId(fileId);
        try {
            await callFunction('moveDriveFile', {
                accessToken,
                fileId,
                targetParentId: targetFolderId,
                currentParentId,
            });
            toast.success(targetFolderName ? `"${fileName}" movido a "${targetFolderName}".` : `"${fileName}" movido correctamente.`);
            setMoveTargetFile(null);
            await refreshConfig();
        } catch (e: any) {
            toast.error("Error al mover: " + e.message);
        } finally {
            setIsMovingFileId(null);
        }
    };


    // Nov 2026: Drive a veces devuelve la misma carpeta dos veces; el filtro muestra cada nombre una sola vez.
    const sagaOptions = useMemo(() => {
        const seen = new Set<string>();
        return topLevelFolders.filter((f: FileNode) => {
            const k = (f.name || '').trim().toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });
    }, [topLevelFolders]);

    // 🟢 STATUS INDICATOR HELPER
    const getStatusConfig = () => {
        switch (driveStatus) {
            case 'connected':
                return { color: 'text-green-500', text: tStatus.connected, icon: Key };
            case 'refreshing':
                return { color: 'text-yellow-500 animate-pulse', text: tStatus.refreshing, icon: Key };
            case 'error':
                return { color: 'text-red-500', text: tStatus.reconnect, icon: HelpCircle };
            default:
                return { color: 'text-titanium-600', text: tStatus.connect, icon: Key };
        }
    };

    const status = getStatusConfig();

    return (
        <div data-tour="docs" className="w-full h-full bg-titanium-900 flex flex-col z-20 select-none">

            {/* HEADER / SAGA SELECTOR */}
            <div className="px-4 py-4 border-b border-titanium-800 bg-titanium-900/50">

                {/* TODO: Feature "Chispa" — implementar completamente a futuro.
                    Requiere: generación de idea completa, creación de documentos,
                    actualización de archivos existentes, integración con Laboratorio.
                    Por ahora dirigir al usuario al Laboratorio de Ideas.
                {!isEmptyProject && (
                    <div className="mb-4">
                        <button
                            type="button"
                            onClick={onGenesis}
                            aria-label="Iniciar proceso creativo (Génesis)"
                            className="w-full relative flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-titanium-800/50 hover:bg-gradient-to-r hover:from-mira/40 hover:to-mira/20 border border-titanium-700 hover:border-mira/30 text-titanium-200 hover:text-white transition-all group overflow-hidden focus-visible:ring-2 focus-visible:ring-mira/60 focus-visible:ring-offset-2 focus-visible:ring-offset-titanium-900 outline-none"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-mira/10 to-mira/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <Sparkles size={14} className="text-mira group-hover:text-mira transition-colors shrink-0" />
                            <span className="text-xs font-medium tracking-wide">{t.spark}</span>
                        </button>
                    </div>
                )}
                */}

                {/* Nov 2026: cabecera simple. El nombre del proyecto abre sus ajustes; «Nuevo» crea archivo o carpeta.
                    Sincronizar y escanear ya pasan solos (al entrar y al volver a la pestaña); volver a leer todo
                    desde cero está en Preferencias. */}
                <div className="flex items-center gap-2 mb-3">
                    <button
                        type="button"
                        id="sidebar-project-settings"
                        onClick={onOpenProjectSettings}
                        className="min-w-0 flex-1 text-left px-2 py-1 -ml-2 rounded-md hover:bg-titanium-800 transition-colors group focus-visible:ring-2 focus-visible:ring-mira/60 outline-none"
                        title={currentLanguage === 'es' ? 'Ajustes de este proyecto' : 'Project settings'}
                    >
                        <span className="block text-[11px] text-titanium-500">{t.project}</span>
                        <span className="flex items-center gap-1 font-serif text-[15px] text-titanium-100">
                            <span className="truncate">{config?.projectName || config?.activeBookContext || '…'}</span>
                            <ChevronRight size={13} className="shrink-0 text-titanium-500 group-hover:text-titanium-200 transition-colors" aria-hidden="true" />
                        </span>
                    </button>
                    {!isEmptyProject && (
                        <button
                            type="button"
                            onClick={() => setIsCreateItemOpen(true)}
                            className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-titanium-200 bg-titanium-800 hover:bg-mira/15 hover:text-mira transition-colors focus-visible:ring-2 focus-visible:ring-mira/60 outline-none"
                            title={currentLanguage === 'es' ? 'Crear archivo o carpeta' : 'Create file or folder'}
                        >
                            <Plus size={14} aria-hidden="true" /> {currentLanguage === 'es' ? 'Nuevo' : 'New'}
                        </button>
                    )}
                </div>

                {sagaOptions.length > 1 && (
                <div className="relative">
                    <select
                        value={selectedSagaId || ''}
                        onChange={(e) => setSelectedSagaId(e.target.value || null)}
                        className="w-full appearance-none bg-titanium-950 hover:bg-titanium-900 text-sm font-medium text-titanium-100 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 cursor-pointer py-2 px-3 pr-8 rounded-md border border-titanium-700 transition-all"
                        disabled={!fileTree || fileTree.length === 0}
                        aria-label={currentLanguage === 'es' ? 'Mostrar solo una saga' : 'Show only one saga'}
                    >
                        <option value="" className="bg-titanium-950 text-titanium-100">{t.globalView}</option>
                        {sagaOptions.map(folder => (
                            <option key={folder.id} value={folder.id} className="bg-titanium-950 text-titanium-100">
                                {getLocalizedFolderName(folder.name, currentLanguage)}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-titanium-400 pointer-events-none transition-colors"
                    />
                </div>
                )}
            </div>

            {/* FILE TREE */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {isFileTreeLoading ? (
                    // 🟢 TITANIUM SKELETON (CIRCUIT BREAKER VISUAL)
                    <div className="flex flex-col gap-3 p-2 animate-pulse" role="status" aria-label={tCommon.loading}>
                        <div className="h-4 bg-titanium-700/50 rounded w-3/4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/2 ml-4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-2/3 ml-4"></div>
                        <div className="h-4 bg-titanium-700/50 rounded w-5/6"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/3 ml-4"></div>
                    </div>
                ) : (
                    <>
                        {/* EMPTY STATE */}
                        {isEmptyProject && (
                            <div className="flex flex-col items-center p-6 text-center gap-4 mt-4 mb-auto animate-in fade-in zoom-in duration-300">
                            {driveStatus !== 'connected' && (
                                <div className="w-full mx-3 mb-1 p-3 bg-amber-500/8 border border-amber-500/20 rounded-lg">
                                    <p className="text-xs text-amber-600 leading-relaxed">
                                        {t.connectDriveHint}
                                    </p>
                                </div>
                            )}
                                <div className="p-4 bg-titanium-800/50 rounded-full border border-titanium-700/50 shadow-lg shadow-black/20">
                                    <FolderCog className="text-titanium-400" size={24} />
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-titanium-200 tracking-wide">{t.emptyProject}</h3>
                                    <p className="text-xs text-titanium-400 leading-relaxed max-w-[200px] mx-auto">
                                        {t.emptyVaultMsg}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 w-full px-4 mt-2">
                                    {/* Primary Action */}
                                    <button
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="group w-full flex items-center justify-center gap-2.5 py-2.5 bg-gradient-to-b from-titanium-700 to-titanium-800 hover:from-titanium-600 hover:to-titanium-700 border border-titanium-600 hover:border-titanium-500 text-titanium-100 rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg hover:shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                        aria-label={t.createStandard}
                                    >
                                        <LayoutTemplate size={14} className="text-mira group-hover:text-mira transition-colors" />
                                        {t.createStandard}
                                    </button>

                                    {/* Secondary Action */}
                                    <button
                                        onClick={onOpenProjectSettings}
                                        className="w-full py-2 text-xs font-medium text-titanium-300 hover:text-white hover:bg-titanium-800/50 rounded-lg transition-all border border-titanium-700 hover:border-titanium-500"
                                    >
                                        {t.alreadyHaveFolder}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 🔴 CANON SECTION (LA VERDAD) */}
                        {canonNodes.length > 0 && (
                            <div className="mb-4">
                                <button
                                    type="button"
                                    onClick={() => setIsCanonOpen(!isCanonOpen)}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded hover:bg-titanium-700/40 transition-colors group focus-visible:ring-2 focus-visible:ring-mira outline-none"
                                    aria-expanded={isCanonOpen}
                                    aria-controls="canon-tree"
                                >
                                    <ChevronDown size={12} className={`text-titanium-400 transition-transform ${isCanonOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-xs font-semibold text-titanium-200">
                                        {t.canon}
                                    </div>
                                    <div className="h-px flex-1 bg-titanium-700/60 ml-2 group-hover:bg-titanium-600/60 transition-colors"></div>
                                </button>
                                <p className="px-2 pl-7 -mt-0.5 mb-1.5 text-[11px] leading-snug text-titanium-500">{currentLanguage === 'es' ? 'Lo que ya es verdad en tu historia.' : 'What is already true in your story.'}</p>

                                {isCanonOpen && (
                                    <div id="canon-tree">
                                        <FileTree
                                            key={`canon-${fileTreeRefreshKey}`}
                                            folderId={folderId}
                                            onFileSelect={onFileSelect}
                                            accessToken={accessToken}
                                            rootFilterId={selectedSagaId}
                                            preloadedTree={canonNodes}
                                            conflictingFileIds={conflictingFileIds}
                                            showOnlyHealthy={showOnlyHealthy}
                                            activeFileId={activeFileId}
                                            isDeleteMode={isDeleteMode}
                                            selectedDeleteIds={selectedDeleteIds}
                                            onToggleDeleteSelect={handleToggleDeleteSelect}
                                            onMoveFile={handleMoveFile}
                                            onDeleteFile={handleDeleteSingle}
                                            movingFileId={isMovingFileId}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 🔵 RESOURCES SECTION (INSPIRACION) */}
                        {resourceNodes.length > 0 && (
                            <div className="mb-4">
                                <button
                                    type="button"
                                    onClick={() => setIsResourcesOpen(!isResourcesOpen)}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded hover:bg-blue-900/10 transition-colors group focus-visible:ring-2 focus-visible:ring-blue-500 outline-none"
                                    aria-expanded={isResourcesOpen}
                                    aria-controls="resources-tree"
                                >
                                    <ChevronDown size={12} className={`text-titanium-400 transition-transform ${isResourcesOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-xs font-semibold text-titanium-200">
                                        {t.resources}
                                    </div>
                                    <div className="h-px flex-1 bg-blue-900/30 ml-2 group-hover:bg-blue-900/50 transition-colors"></div>
                                </button>
                                <p className="px-2 pl-7 -mt-0.5 mb-1.5 text-[11px] leading-snug text-titanium-500">{currentLanguage === 'es' ? 'Notas, inspiración e ideas sin decidir.' : 'Notes, inspiration and undecided ideas.'}</p>

                                {isResourcesOpen && (
                                    <div id="resources-tree">
                                        <FileTree
                                            key={`resources-${fileTreeRefreshKey}`}
                                            folderId={folderId}
                                            onFileSelect={onFileSelect}
                                            accessToken={accessToken}
                                            rootFilterId={selectedSagaId}
                                            preloadedTree={resourceNodes}
                                            conflictingFileIds={conflictingFileIds}
                                            showOnlyHealthy={showOnlyHealthy}
                                            activeFileId={activeFileId}
                                            isDeleteMode={isDeleteMode}
                                            selectedDeleteIds={selectedDeleteIds}
                                            onToggleDeleteSelect={handleToggleDeleteSelect}
                                            onMoveFile={handleMoveFile}
                                            onDeleteFile={handleDeleteSingle}
                                            movingFileId={isMovingFileId}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ⚪ UNASSIGNED SECTION (Optional) */}
                        {unassignedNodes.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 px-2 py-1.5 mb-1 text-titanium-500">
                                    <div className="text-xs font-semibold">
                                        {t.unassigned}
                                    </div>
                                    <div className="h-px flex-1 bg-titanium-800"></div>
                                </div>
                                <FileTree
                                    key={`unassigned-${fileTreeRefreshKey}`}
                                    folderId={folderId}
                                    onFileSelect={onFileSelect}
                                    accessToken={accessToken}
                                    rootFilterId={selectedSagaId}
                                    preloadedTree={unassignedNodes}
                                    conflictingFileIds={conflictingFileIds}
                                    showOnlyHealthy={showOnlyHealthy}
                                    activeFileId={activeFileId}
                                    isDeleteMode={isDeleteMode}
                                    selectedDeleteIds={selectedDeleteIds}
                                    onToggleDeleteSelect={handleToggleDeleteSelect}
                                    onMoveFile={handleMoveFile}
                                    onDeleteFile={handleDeleteSingle}
                                    movingFileId={isMovingFileId}
                                />
                            </div>
                        )}
                    </>
                )}
            </div>


            {/* 🟢 FOLDER PICKER MODAL — move file/folder (navegable, cualquier profundidad) */}
            <FolderPickerModal
                isOpen={!!moveTargetFile}
                itemName={moveTargetFile?.name || ''}
                itemId={moveTargetFile?.id || ''}
                currentParentId={moveTargetFile?.parentId}
                accessToken={accessToken}
                isBusy={!!isMovingFileId}
                sections={[
                    { label: t.canon, tone: 'canon', folders: canonNodes.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder') },
                    { label: t.resources, tone: 'resources', folders: resourceNodes.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder') },
                    { label: t.unassigned, tone: 'other', folders: unassignedNodes.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder') },
                ]}
                onConfirm={handleConfirmMove}
                onClose={() => { if (!isMovingFileId) setMoveTargetFile(null); }}
            />

            <CreateProjectModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleCreateProject}
            />

            <CreateItemModal
                isOpen={isCreateItemOpen}
                onClose={() => setIsCreateItemOpen(false)}
                accessToken={accessToken}
                onFileCreated={onFileCreated || (() => {})}
                onFolderCreated={refreshConfig}
            />

            {/* FOOTER — Oct 2026: una sola fila de iconos para no aplastar el explorador */}
            <div className="px-2 py-2 border-t border-titanium-800 bg-titanium-900 mt-auto">
                {driveStatus !== 'connected' && (
                    <button
                        onClick={onRefreshTokens}
                        className={`w-full mb-1.5 flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-mira/10 transition-all text-xs font-medium ${status.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={tStatus.reconnect}
                        disabled={driveStatus === 'refreshing'}
                        aria-label={status.text}
                    >
                        <status.icon size={14} />
                        <span>{status.text}</span>
                    </button>
                )}
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsMemoryOpen(true)} title={currentLanguage === 'es' ? 'Lo que MyWorld recuerda de tu proyecto (ver, corregir, borrar)' : 'What MyWorld remembers about your project'}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-mira/90 hover:text-mira hover:bg-mira/15 transition-all text-xs font-medium">
                        <Brain size={15} aria-hidden="true" /> {currentLanguage === 'es' ? 'Memoria' : 'Memory'}
                    </button>
                    <button onClick={() => setIsGuidePanelOpen(true)}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-titanium-300 hover:text-titanium-100 hover:bg-mira/10 transition-all text-xs font-medium">
                        <HelpCircle size={15} aria-hidden="true" /> {t.guide}
                    </button>
                    {/* Cuenta: reutiliza el menú y el cierre al tocar fuera que antes usaba el cerebro */}
                    <div className="relative ml-auto" ref={indexMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsIndexMenuOpen(!isIndexMenuOpen)}
                            aria-expanded={isIndexMenuOpen}
                            aria-label={currentLanguage === 'es' ? 'Tu cuenta' : 'Your account'}
                            title={currentLanguage === 'es' ? 'Tu cuenta' : 'Your account'}
                            className="w-8 h-8 rounded-full overflow-hidden grid place-items-center bg-titanium-700 text-titanium-100 text-xs font-semibold hover:ring-2 hover:ring-mira/50 transition-all focus-visible:ring-2 focus-visible:ring-mira outline-none"
                        >
                            {accountUser?.photoURL
                                ? <img src={accountUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                : (accountUser?.displayName || accountUser?.email || '?').charAt(0).toUpperCase()}
                        </button>
                        {isIndexMenuOpen && (
                            <div className="absolute right-0 bottom-full mb-2 w-56 bg-titanium-800 border border-titanium-600 rounded-md shadow-xl z-50 overflow-hidden" role="menu">
                                <div className="px-3 py-2 border-b border-titanium-700/60">
                                    <p className="text-xs text-titanium-100 truncate">{accountUser?.displayName || (currentLanguage === 'es' ? 'Tu cuenta' : 'Your account')}</p>
                                    {accountUser?.email && <p className="text-[11px] text-titanium-400 truncate">{accountUser.email}</p>}
                                </div>
                                <button role="menuitem" onClick={() => { setIsIndexMenuOpen(false); onOpenSettings(); }}
                                    className="w-full text-left px-3 py-2.5 text-xs text-titanium-200 hover:bg-titanium-700 hover:text-white flex items-center gap-2 transition-colors">
                                    <Settings size={14} aria-hidden="true" /> {t.settings}
                                </button>
                                <button role="menuitem" onClick={() => { setIsIndexMenuOpen(false); onLogout(); }}
                                    className="w-full text-left px-3 py-2.5 text-xs text-titanium-200 hover:bg-red-900/20 hover:text-red-300 flex items-center gap-2 transition-colors">
                                    <LogOut size={14} aria-hidden="true" /> {t.logout}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                {isGuidePanelOpen && <GuidePanel onClose={() => setIsGuidePanelOpen(false)} />}
                {isMemoryOpen && <MemoryPanel onClose={() => setIsMemoryOpen(false)} accessToken={accessToken} />}
            </div>
        </div>
    );
};

export default VaultSidebar;
