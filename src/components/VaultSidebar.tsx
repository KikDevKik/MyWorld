import React, { useState, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, HardDrive, BrainCircuit, ChevronDown, Key, FolderCog, AlertTriangle, Eye, EyeOff, LayoutTemplate, Loader2 } from 'lucide-react';
import FileTree from './FileTree';
import ProjectHUD from './forge/ProjectHUD';
import { useProjectConfig } from "../contexts/ProjectConfigContext";
import { getFirestore, onSnapshot, collection, query, where } from "firebase/firestore";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from "firebase/auth";
import { toast } from 'sonner';

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

    // 🟢 CONFLICT STATE & FILTER
    const [conflictingFileIds, setConflictingFileIds] = useState<Set<string>>(new Set());
    const [showOnlyHealthy, setShowOnlyHealthy] = useState(false);
    const [isCreatingProject, setIsCreatingProject] = useState(false);

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
    const handleCreateProject = async () => {
        const name = window.prompt("Ingresa el nombre de tu nuevo Universo:", "Mi Nueva Novela");
        if (!name) return;

        setIsCreatingProject(true);
        try {
            const functions = getFunctions();
            const createTitaniumStructure = httpsCallable(functions, 'createTitaniumStructure');

            toast.info("Creando estructura del proyecto...");

            await createTitaniumStructure({
                accessToken: accessToken,
                newProjectName: name
            });

            toast.success("¡Proyecto creado exitosamente!");
            // Config context should auto-update via Firestore listener
        } catch (error: any) {
            console.error("Error creating project:", error);
            toast.error("Error al crear el proyecto: " + error.message);
        } finally {
            setIsCreatingProject(false);
        }
    };

    // 🟢 STATUS INDICATOR HELPER
    const getStatusConfig = () => {
        switch (driveStatus) {
            case 'connected':
                return { color: 'text-green-500', text: 'Conexión Estable', icon: Key };
            case 'refreshing':
                return { color: 'text-yellow-500 animate-pulse', text: 'Refrescando...', icon: Key };
            case 'error':
                return { color: 'text-red-500', text: 'Error de Conexión', icon: HelpCircle };
            default:
                return { color: 'text-titanium-600', text: 'Desconectado', icon: Key };
        }
    };

    const status = getStatusConfig();

    return (
        <div className="w-full h-full bg-titanium-900 flex flex-col z-20 select-none">

            {/* HEADER / SAGA SELECTOR */}
            <div className="px-4 py-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-2 mb-3">
                    <div className="text-titanium-500">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-xs font-medium text-titanium-400 uppercase tracking-wider">Manual de Campo</h2>

                    {/* TOGGLE FILTER */}
                    <button
                        onClick={() => setShowOnlyHealthy(!showOnlyHealthy)}
                        className={`ml-auto p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${showOnlyHealthy ? 'text-emerald-400' : 'text-titanium-500'}`}
                        title={showOnlyHealthy ? "Mostrando solo archivos sanos" : "Mostrando todo (incluyendo conflictos)"}
                        aria-label={showOnlyHealthy ? "Mostrar todos los archivos" : "Mostrar solo archivos sanos"}
                    >
                        {showOnlyHealthy ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>

                    {/* BOTÓN DE INDEXAR */}
                    <button
                        onClick={onIndexRequest}
                        className={`p-1.5 rounded-md hover:bg-titanium-700 transition-colors shrink-0 ${isIndexed ? 'text-green-500 hover:text-green-400' : 'text-titanium-400 hover:text-accent-DEFAULT'}`}
                        title={isIndexed ? "Memoria Sincronizada (Click para forzar)" : "Indexar Conocimiento (TDB)"}
                        aria-label="Indexar base de conocimiento"
                    >
                        <BrainCircuit size={16} />
                    </button>
                </div>

                <div className="relative">
                    <select
                        value={selectedSagaId || ''}
                        onChange={(e) => setSelectedSagaId(e.target.value || null)}
                        className="w-full appearance-none bg-titanium-950 hover:bg-titanium-900 text-sm font-medium text-titanium-100 focus:outline-none focus:ring-2 focus:ring-accent-DEFAULT/50 cursor-pointer py-2 px-3 pr-8 rounded-md border border-titanium-700 transition-all"
                        disabled={!fileTree || fileTree.length === 0}
                        aria-label="Filtrar por Saga"
                    >
                        <option value="" className="bg-titanium-950 text-titanium-100">Vista Global</option>
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
                            <div className="flex flex-col items-center justify-center p-6 text-center gap-3 mt-10">
                                <div className="p-3 bg-titanium-700/30 rounded-full">
                                    <FolderCog className="text-titanium-400" size={24} />
                                </div>
                                <h3 className="text-sm font-bold text-titanium-200">Proyecto Vacío</h3>
                                <p className="text-xs text-titanium-400 leading-relaxed">
                                    Tu bóveda está vacía. Crea un nuevo proyecto para comenzar o conecta uno existente.
                                </p>
                                <div className="flex flex-col gap-3 w-full px-2 mt-2">
                                    <button
                                        onClick={handleCreateProject}
                                        disabled={isCreatingProject}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-titanium-800 hover:bg-titanium-700 border border-titanium-600 hover:border-titanium-500 text-titanium-200 rounded-lg text-xs font-bold transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                        aria-label="Crear estructura estándar"
                                    >
                                        {isCreatingProject ? (
                                            <Loader2 size={14} className="animate-spin" />
                                        ) : (
                                            <LayoutTemplate size={14} />
                                        )}
                                        {isCreatingProject ? "Creando..." : "Crear Estándar"}
                                    </button>
                                    <button
                                        onClick={onOpenConnectModal}
                                        className="w-full text-[10px] text-titanium-500 hover:text-titanium-300 transition-colors"
                                    >
                                        Ya tengo carpeta en Drive
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* 🔴 CANON SECTION (LA VERDAD) */}
                        {canonNodes.length > 0 && (
                            <div className="mb-4">
                                <button
                                    onClick={() => setIsCanonOpen(!isCanonOpen)}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded hover:bg-emerald-900/10 transition-colors group"
                                >
                                    <ChevronDown size={12} className={`text-emerald-500 transition-transform ${isCanonOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                                        CANON (La Verdad)
                                    </div>
                                    <div className="h-px flex-1 bg-emerald-900/30 ml-2 group-hover:bg-emerald-900/50 transition-colors"></div>
                                </button>

                                {isCanonOpen && (
                                    <FileTree
                                        folderId={folderId}
                                        onFileSelect={onFileSelect}
                                        accessToken={accessToken}
                                        rootFilterId={selectedSagaId}
                                        preloadedTree={canonNodes}
                                        conflictingFileIds={conflictingFileIds}
                                        showOnlyHealthy={showOnlyHealthy}
                                        activeFileId={activeFileId}
                                    />
                                )}
                            </div>
                        )}

                        {/* 🔵 RESOURCES SECTION (INSPIRACION) */}
                        {resourceNodes.length > 0 && (
                            <div className="mb-4">
                                <button
                                    onClick={() => setIsResourcesOpen(!isResourcesOpen)}
                                    className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 rounded hover:bg-blue-900/10 transition-colors group"
                                >
                                    <ChevronDown size={12} className={`text-blue-500 transition-transform ${isResourcesOpen ? '' : '-rotate-90'}`} />
                                    <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                                        RECURSOS (Inspiración)
                                    </div>
                                    <div className="h-px flex-1 bg-blue-900/30 ml-2 group-hover:bg-blue-900/50 transition-colors"></div>
                                </button>

                                {isResourcesOpen && (
                                    <FileTree
                                        folderId={folderId}
                                        onFileSelect={onFileSelect}
                                        accessToken={accessToken}
                                        rootFilterId={selectedSagaId}
                                        preloadedTree={resourceNodes}
                                        conflictingFileIds={conflictingFileIds}
                                        showOnlyHealthy={showOnlyHealthy}
                                        activeFileId={activeFileId}
                                    />
                                )}
                            </div>
                        )}

                        {/* ⚪ UNASSIGNED SECTION (Optional) */}
                        {unassignedNodes.length > 0 && (
                            <div className="mb-4">
                                <div className="flex items-center gap-2 px-2 py-1.5 mb-1 text-titanium-500">
                                    <div className="text-[10px] font-bold uppercase tracking-widest">
                                        Sin Asignar
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
                                />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* FOOTER */}
            <div className="p-3 border-t border-titanium-800 bg-titanium-900 mt-auto">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={onOpenManual}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <HelpCircle size={16} className="group-hover:text-accent-DEFAULT transition-colors" />
                        <span>Manual de Campo</span>
                    </button>

                    <button
                        onClick={onOpenProjectSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <FolderCog size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>Proyecto</span>
                    </button>

                    <button
                        onClick={onOpenSettings}
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-cyan-900/20 transition-all text-xs font-medium group"
                    >
                        <Settings size={16} className="group-hover:text-cyan-500 transition-colors" />
                        <span>Preferencias</span>
                    </button>

                    {/* 🟢 STATUS INDICATOR BUTTON */}
                    <button
                        onClick={onRefreshTokens}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-cyan-900/20 transition-all text-xs font-medium group ${status.color}`}
                        title="Click para renovar manualmente"
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
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VaultSidebar;
