/*
 * Este software y su código fuente son propiedad intelectual de Deiner David Trelles Renteria.
 * Queda prohibida su reproducción, distribución o ingeniería inversa sin autorización.
 */
import React, { useState, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, HardDrive, BrainCircuit, ChevronDown, Key, FolderCog, AlertTriangle, Eye, EyeOff, LayoutTemplate, Loader2, FilePlus, Sparkles, Trash2 } from 'lucide-react';
import FileTree from './FileTree';
import ProjectHUD from './forge/ProjectHUD';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { useLayoutStore } from "../stores/useLayoutStore"; // 🟢 IMPORT STORE
import { getFirestore, onSnapshot, collection, query, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { toast } from 'sonner';
import CreateProjectModal from './ui/CreateProjectModal';
import DeleteConfirmationModal from './ui/DeleteConfirmationModal'; // 🟢 NEW
import { callFunction } from '../services/api';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface VaultSidebarProps {
    folderId: string;
    onFolderIdChange: (id: string) => void;
    onFileSelect: (id: string, content: string, name?: string) => void;
    onOpenConnectModal: () => void;
    onLogout: () => void;
    onIndexRequest: () => void;
    onOpenSettings: () => void;
    onOpenProjectSettings: () => void; // 👈 New prop for Project Settings Modal
    accessToken: string | null;
    onRefreshTokens: () => void;
    driveStatus: 'connected' | 'refreshing' | 'error' | 'disconnected';
    onOpenManual: () => void; // 👈 New prop
    isIndexed?: boolean; // 👈 New prop for Index State
    isSecurityReady?: boolean; // 👈 New prop for Circuit Breaker
    activeFileId?: string | null; // 👈 New prop
    onCreateFile?: () => void; // 👈 New prop for File Creation
    onGenesis?: () => void; // 👈 New prop for Genesis
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
    onOpenSettings,
    onOpenProjectSettings,
    accessToken,
    onRefreshTokens,
    driveStatus,
    onOpenManual, // 👈 Destructure
    isIndexed = false, // 👈 Default to false
    isSecurityReady = false, // 👈 Default false for safety
    activeFileId, // 👈 Destructure
    onCreateFile, // 👈 Destructure
    onGenesis, // 👈 Destructure
}) => {
    // STATE
    const [topLevelFolders, setTopLevelFolders] = useState<FileNode[]>([]);
    const [selectedSagaId, setSelectedSagaId] = useState<string | null>(null);

    // 🟢 NEW: SPLIT TREE STATE
    const [canonNodes, setCanonNodes] = useState<FileNode[]>([]);
    const [resourceNodes, setResourceNodes] = useState<FileNode[]>([]);
    const [unassignedNodes, setUnassignedNodes] = useState<FileNode[]>([]);
    const [isCanonOpen, setIsCanonOpen] = useState(true);
    const [isResourcesOpen, setIsResourcesOpen] = useState(true);

    // 🟢 CONSUME GLOBAL CONTEXT
    const { fileTree, isFileTreeLoading, config } = useProjectConfig();
    const { showOnlyHealthy } = useLayoutStore(); // 🟢 READ FROM STORE

    // 🟢 LOCALIZATION
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].sidebar;
    const tStatus = TRANSLATIONS[currentLanguage].status;

    // 🟢 CONFLICT STATE & FILTER
    const [conflictingFileIds, setConflictingFileIds] = useState<Set<string>>(new Set());
    // const [showOnlyHealthy, setShowOnlyHealthy] = useState(false); // REMOVED LOCAL STATE
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // 🟢 DELETE MODE STATE
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [selectedDeleteIds, setSelectedDeleteIds] = useState<Set<string>>(new Set());
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // 🟢 LISTEN FOR CONFLICTS (Kept Local as it's UI specific, but could be lifted later)
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user || !isSecurityReady) return;

        const db = getFirestore();
        // Query TDB_Index/files where isConflicting == true
        const q = query(
            collection(db, "TDB_Index", user.uid, "files"),
            where("isConflicting", "==", true)
        );

        console.log("📡 Listening for Conflicting Files...");
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const conflictIds = new Set<string>();
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                if (data.driveId) {
                    conflictIds.add(data.driveId);
                }
            });
            console.log(`⚠️ Updated Conflicts: ${conflictIds.size} files`);
            setConflictingFileIds(conflictIds);
        });

        return () => unsubscribe();
    }, [isSecurityReady]);


    // 🟢 UPDATE TREE SPLIT LOGIC
    useEffect(() => {
        if (!fileTree) {
            setTopLevelFolders([]);
            setCanonNodes([]);
            setResourceNodes([]);
            setUnassignedNodes([]);
            return;
        }

        if (Array.isArray(fileTree)) {
            // 1. Saga Selector (Raw Folders)
            const folders = fileTree.filter((f: FileNode) => f.mimeType === 'application/vnd.google-apps.folder');
            setTopLevelFolders(folders);

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

                setCanonNodes(cNodes);
                setResourceNodes(rNodes);
                setUnassignedNodes(uNodes);
            } else {
                // Fallback if config not loaded yet
                setUnassignedNodes(fileTree);
            }
        }
    }, [fileTree, config]);


    // 🟢 CREATE STANDARD PROJECT
    const handleCreateProject = async (name: string) => {
        try {
            toast.info("Creando estructura del proyecto...");

            await callFunction('createTitaniumStructure', {
                accessToken: accessToken,
                newProjectName: name
            });

            toast.success("¡Proyecto creado exitosamente!");
            // Config context should auto-update via Firestore listener
            // 🟢 FORCE RELOAD (Requested by Commander)
            // Ensures total cleanup of stale state from previous (deleted) projects.
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        } catch (error: any) {
            console.error("Error creating project:", error);
            toast.error("Error al crear el proyecto: " + error.message);
            throw error; // Re-throw to let Modal know it failed
        }
    };

    // 🟢 DELETE LOGIC
    const handleToggleDeleteMode = () => {
        if (isDeleteMode) {
            setIsDeleteMode(false);
            setSelectedDeleteIds(new Set());
        } else {
            setIsDeleteMode(true);
        }
    };

    const handleToggleDeleteSelect = (id: string) => {
        const newSet = new Set(selectedDeleteIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedDeleteIds(newSet);
    };

    const handleDeleteClick = () => {
        if (selectedDeleteIds.size === 0) return;
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            await callFunction('trashDriveItems', {
                accessToken,
                fileIds: Array.from(selectedDeleteIds)
            });
            toast.success(`${selectedDeleteIds.size} elementos movidos a la papelera.`);

            // Cleanup
            setIsDeleteMode(false);
            setSelectedDeleteIds(new Set());
            setIsDeleteModalOpen(false);

            // Note: Firestore listener will auto-refresh the tree
        } catch (error: any) {
            toast.error("Error al borrar: " + error.message);
        } finally {
            setIsDeleting(false);
        }
    };

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
        <div className="w-full h-full bg-titanium-900 flex flex-col z-20 select-none">

            {/* HEADER / SAGA SELECTOR */}
            <div className="px-4 py-4 border-b border-titanium-800 bg-titanium-900/50">

                {/* 🟢 GENESIS BUTTON (REPLACES 'MANUAL DE CAMPO' SECTION) */}
                <div className="mb-4">
                    <button
                        type="button"
                        onClick={onGenesis}
                        aria-label="Iniciar proceso creativo (Génesis)"
                        className="w-full relative flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-titanium-800/50 hover:bg-gradient-to-r hover:from-purple-900/40 hover:to-cyan-900/40 border border-titanium-700 hover:border-cyan-500/30 text-titanium-200 hover:text-white transition-all group overflow-hidden focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-titanium-900 outline-none"
                    >
                        {/* Glow Effect */}
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />

                        <Sparkles size={14} className="text-purple-400 group-hover:text-cyan-400 transition-colors shrink-0" />
                        <span className="text-xs font-medium tracking-wide">{t.spark}</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 mb-3">
                    <div className="text-titanium-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    {/* Replaced 'Manual de Campo' text with generic 'Explorador' or similar if needed, or kept structural header */}
                    <h2 className="text-xs font-medium text-titanium-400 uppercase tracking-wider">{t.explorer}</h2>

                    {/* ACTION BUTTONS (DISTRIBUTED) */}
                    <div className="ml-auto flex items-center gap-2">
                        {/* 🟢 DELETE TOGGLE */}
                        <button
                            onClick={handleToggleDeleteMode}
                            className={`p-1.5 rounded-md transition-colors shrink-0 ${isDeleteMode ? 'text-red-500 bg-titanium-800' : 'text-titanium-400 hover:text-red-400 hover:bg-titanium-700'}`}
                            title={isDeleteMode ? t.deleteMode : t.deleteMode} // Toggle msg is dynamic enough
                            aria-label={t.deleteMode}
                            aria-pressed={isDeleteMode}
                        >
                            <Trash2 size={16} />
                        </button>

                        {/* 🟢 EXECUTE DELETE */}
                        {isDeleteMode && selectedDeleteIds.size > 0 && (
                            <button
                                onClick={handleDeleteClick}
                                className="px-2 py-1 rounded-md bg-red-900/50 text-red-400 hover:bg-red-900/80 hover:text-white text-xs font-bold transition-all animate-in fade-in zoom-in"
                                title="Confirmar Borrado"
                            >
                                {t.delete} ({selectedDeleteIds.size})
                            </button>
                        )}

                        {onCreateFile && (
                            <button
                                onClick={onCreateFile}
                                className="p-1.5 rounded-md hover:bg-titanium-700 transition-colors text-titanium-400 hover:text-cyan-400"
                                title={t.newFile}
                                aria-label={t.newFile}
                            >
                                <FilePlus size={16} />
                            </button>
                        )}

                        {/* BOTÓN DE INDEXAR */}
                        <button
                            onClick={onIndexRequest}
                            className={`p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${isIndexed ? 'text-green-500 hover:text-green-400' : 'text-titanium-400 hover:text-accent-DEFAULT'}`}
                            title={isIndexed ? t.index : t.index}
                            aria-label={t.index}
                        >
                            <BrainCircuit size={16} />
                        </button>
                    </div>
                </div>

                <div className="relative">
                    <select
                        value={selectedSagaId || ''}
                        onChange={(e) => setSelectedSagaId(e.target.value || null)}
                        className="w-full appearance-none bg-titanium-950 hover:bg-titanium-900 text-sm font-medium text-titanium-100 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 cursor-pointer py-2 px-3 pr-8 rounded-md border border-titanium-700 transition-all"
                        disabled={!fileTree || fileTree.length === 0}
                        aria-label="Filtrar por Saga"
                    >
                        <option value="" className="bg-titanium-950 text-titanium-100">{t.globalView}</option>
                        {topLevelFolders.map(folder => (
                            <option key={folder.id} value={folder.id} className="bg-titanium-950 text-titanium-100">
                                {folder.name}
                            </option>
                        ))}
                    </select>
                    <ChevronDown
                        size={14}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-titanium-400 pointer-events-none transition-colors"
                    />
                </div>
            </div>

            {/* 🟢 PROJECT IDENTITY HUD (SENTINEL PULSE) */}
            <ProjectHUD />

            {/* FILE TREE */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {isFileTreeLoading ? (
                    // 🟢 TITANIUM SKELETON (CIRCUIT BREAKER VISUAL)
                    <div className="flex flex-col gap-3 p-2 animate-pulse" role="status" aria-label="Cargando estructura de archivos...">
                        <div className="h-4 bg-titanium-700/50 rounded w-3/4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/2 ml-4"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-2/3 ml-4"></div>
                        <div className="h-4 bg-titanium-700/50 rounded w-5/6"></div>
                        <div className="h-4 bg-titanium-700/30 rounded w-1/3 ml-4"></div>
                    </div>
                ) : (
                    <>
                        {/* EMPTY STATE */}
                        {(!fileTree || fileTree.length === 0) && (
                            <div className="flex flex-col items-center p-6 text-center gap-4 mt-4 mb-auto animate-in fade-in zoom-in duration-300">
                                <div className="p-4 bg-titanium-800/50 rounded-full border border-titanium-700/50 shadow-lg shadow-black/20">
                                    <FolderCog className="text-titanium-400" size={24} />
                                </div>

                                <div className="space-y-1">
                                    <h3 className="text-sm font-bold text-titanium-200 tracking-wide">{t.emptyProject}</h3>
                                    <p className="text-[11px] text-titanium-400 leading-relaxed max-w-[200px] mx-auto">
                                        {t.emptyVaultMsg}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 w-full px-4 mt-2">
                                    {/* Primary Action */}
                                    <button
                                        onClick={() => setIsCreateModalOpen(true)}
                                        className="group w-full flex items-center justify-center gap-2.5 py-2.5 bg-gradient-to-b from-titanium-700 to-titanium-800 hover:from-titanium-600 hover:to-titanium-700 border border-titanium-600 hover:border-titanium-500 text-titanium-100 rounded-lg text-xs font-semibold transition-all shadow-md hover:shadow-lg hover:shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                        aria-label="Crear estructura estándar"
                                    >
                                        <LayoutTemplate size={14} className="text-cyan-500 group-hover:text-cyan-400 transition-colors" />
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
                                    className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded hover:bg-emerald-900/10 transition-colors group focus-visible:ring-2 focus-visible:ring-emerald-500 outline-none"
                                    aria-expanded={isCanonOpen}
                                    aria-controls="canon-tree"
                                >
                                    <ChevronDown size={12} className={`text-emerald-500 transition-transform ${isCanonOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                        {t.canon}
                                    </div>
                                    <div className="h-px flex-1 bg-emerald-900/30 ml-2 group-hover:bg-emerald-900/50 transition-colors"></div>
                                </button>

                                {isCanonOpen && (
                                    <div id="canon-tree">
                                        <FileTree
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
                                    <ChevronDown size={12} className={`text-blue-500 transition-transform ${isResourcesOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                                        {t.resources}
                                    </div>
                                    <div className="h-px flex-1 bg-blue-900/30 ml-2 group-hover:bg-blue-900/50 transition-colors"></div>
                                </button>

                                {isResourcesOpen && (
                                    <div id="resources-tree">
                                        <FileTree
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
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ⚪ UNASSIGNED SECTION (Optional) */}
                        {unassignedNodes.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 px-2 py-1.5 mb-1 text-titanium-500">
                                    <div className="text-[10px] font-bold uppercase tracking-widest">
                                        {t.unassigned}
                                    </div>
                                    <div className="h-px flex-1 bg-titanium-800"></div>
                                </div>
                                <FileTree
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
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                count={selectedDeleteIds.size}
                isDeleting={isDeleting}
            />

            <CreateProjectModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSubmit={handleCreateProject}
            />

            {/* FOOTER */}
            <div className="p-3 border-t border-titanium-800 bg-titanium-900 mt-auto">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={onOpenManual}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <HelpCircle size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>{t.guide}</span>
                    </button>

                    <button
                        onClick={onOpenProjectSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <FolderCog size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>{t.project}</span>
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <Settings size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>{t.settings}</span>
                    </button>

                    {/* 🟢 STATUS INDICATOR BUTTON */}
                    <button
                        onClick={onRefreshTokens}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-cyan-900/20 transition-all text-xs font-medium group ${status.color} disabled:opacity-50 disabled:cursor-not-allowed`}
                        title="Click para renovar manualmente"
                        disabled={driveStatus === 'refreshing'}
                        aria-label={`Estado de conexión: ${status.text}`}
                    >
                        <status.icon size={16} className="transition-colors" />
                        <span>{status.text}</span>
                    </button>

                    <div className="h-px bg-titanium-700/50 my-1 mx-2"></div>

                    <button
                        onClick={onLogout}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-red-400 hover:bg-red-900/10 transition-all text-xs font-medium group"
                    >
                        <LogOut size={16} />
                        <span>{t.logout}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VaultSidebar;
