import React, { useState, useEffect, useRef, useContext, createContext } from 'react';
import { ChevronRight, ChevronDown, FileText, Loader2, AlertTriangle, Check, X, Square, CheckSquare, MoreHorizontal, FolderInput } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../services/api';
import { useLanguageStore } from '../stores/useLanguageStore';
import { getLocalizedFolderName } from '../utils/folderLocalization';
import { FileCache } from '../utils/fileCache';

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
    driveId?: string; // Optional if we need to map back to original ID
    type?: string;
    parentId?: string;
}

interface FileTreeProps {
    folderId?: string; // Made optional
    onFileSelect: (id: string, content: string, name?: string, isBackgroundUpdate?: boolean) => void;
    accessToken: string | null;
    rootFilterId?: string | null; // 👈 NUEVO: Filtro de Saga
    onLoad?: (files: FileNode[]) => void; // 👈 NUEVO: Callback para el Sidebar
    preloadedTree?: FileNode[]; // 👈 NUEVO: Árbol estático
    conflictingFileIds?: Set<string>; // 👈 NEW: Conflicting Files
    showOnlyHealthy?: boolean; // 👈 NEW: Filter
    activeFileId?: string | null; // 👈 NEW: Active File Highlighting
    isDeleteMode?: boolean; // 👈 NEW: Delete Mode
    selectedDeleteIds?: Set<string>; // 👈 NEW: Selection
    onToggleDeleteSelect?: (id: string) => void; // 👈 NEW: Selection Handler
    onMoveFile?: (fileId: string, fileName: string, parentId?: string) => void;
}

// ⚡ PERFORMANCE: Context to avoid Prop Drilling and O(N) re-renders
interface FileTreeContextValue {
    activeFileId: string | null;
    conflictingFileIds?: Set<string>;
    showOnlyHealthy?: boolean;
    isDeleteMode?: boolean;
    selectedDeleteIds?: Set<string>;
    onToggleDeleteSelect?: (id: string) => void;
    onMoveFile?: (fileId: string, fileName: string, parentId?: string) => void;
}

const FileTreeContext = createContext<FileTreeContextValue>({
    activeFileId: null
});


// --- HELPER PARA EXTRAER DATOS DE FORMA SEGURA ---
const extractFiles = (resultData: any): FileNode[] => {
    // Si el backend devuelve directamente el array (Plan A)
    if (Array.isArray(resultData)) return resultData;
    // Si el backend devuelve { files: [...] } (Plan B)
    if (resultData && Array.isArray(resultData.files)) return resultData.files;
    // Si no hay nada, devolvemos array vacío para que no explote
    return [];
};

interface FileTreeNodeProps {
    node: FileNode;
    depth: number;
    onFileSelect: (id: string, content: string, name?: string, isBackgroundUpdate?: boolean) => void;
    accessToken: string | null;
    isPreloaded?: boolean;
}

// ⚡ PERFORMANCE: Separated Presentation (Row) from Logic (Node)
// This component consumes the context and re-renders only when its specific props change
// or the context values it consumes change.
const FileNodeRow = React.memo(({
    node,
    depth,
    isOpen,
    isLoading,
    onToggle,
    onRename
}: {
    node: FileNode;
    depth: number;
    isOpen: boolean;
    isLoading: boolean;
    onToggle: (e?: React.MouseEvent) => void;
    onRename: (newName: string) => Promise<void>;
}) => {
    const {
        activeFileId,
        conflictingFileIds,
        showOnlyHealthy,
        isDeleteMode,
        selectedDeleteIds,
        onToggleDeleteSelect,
        onMoveFile
    } = useContext(FileTreeContext);

    // 🟢 RENAME STATE
    const [isEditing, setIsEditing] = useState(false);
    // 🟢 FILE ACTIONS MENU STATE
    const [isActionsOpen, setIsActionsOpen] = useState(false);
    const actionsRef = useRef<HTMLDivElement>(null);
    const [editName, setEditName] = useState(node.name);
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // 🟢 LOCALIZATION
    const { currentLanguage } = useLanguageStore();
    const displayName = getLocalizedFolderName(node.name, currentLanguage);

    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
    const isActive = node.id === activeFileId;
    const isConflicting = conflictingFileIds?.has(node.id) || (node.driveId && conflictingFileIds?.has(node.driveId));
    const isDeleteSelected = selectedDeleteIds?.has(node.id);

    // Focus input on edit
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    // Close actions menu on outside click
    useEffect(() => {
        if (!isActionsOpen) return;
        function handleOutside(e: MouseEvent) {
            if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
                setIsActionsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleOutside);
        return () => document.removeEventListener('mousedown', handleOutside);
    }, [isActionsOpen]);

    // 🟢 FILTER LOGIC
    if (showOnlyHealthy && isConflicting) {
        return null; // Hide this node
    }

    const handleSaveRename = async () => {
        if (!editName.trim() || editName === node.name) {
            setIsEditing(false);
            setEditName(node.name);
            return;
        }

        setIsSaving(true);
        try {
            await onRename(editName);
            setIsEditing(false);
        } catch (error) {
            setEditName(node.name); // Revert
        } finally {
            setIsSaving(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (isEditing) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setIsEditing(false);
                setEditName(node.name);
            }
            return; // Don't trigger navigation
        }

        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
        }
        if (e.key === 'ArrowRight' && isFolder && !isOpen) {
            e.preventDefault();
            onToggle();
        }
        if (e.key === 'ArrowLeft' && isFolder && isOpen) {
            e.preventDefault();
            onToggle();
        }
    };

    return (
        <div
            className={`
                group flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-500
                ${isActive && !isEditing && !isDeleteMode
                    ? 'bg-cyan-900/20 text-cyan-400 font-medium'
                    : isConflicting
                        ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-900/20'
                        : isDeleteSelected
                            ? 'bg-red-900/20 text-red-300' // Highlight selected for delete
                            : 'text-titanium-300 hover:text-titanium-100 hover:bg-cyan-900/20'
                }
                ${!isFolder && isLoading ? 'animate-pulse' : ''}
            `}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            title={isConflicting ? "Divergencia Narrativa detectada por el Guardián. Revisión pendiente." : undefined}
            onClick={(e) => {
                // If clicking the row background (not icon/name), standard toggle behavior if needed
                // Currently toggle logic is on Icon and Name specific areas
            }}
        >
            {/* 🟢 DELETE MODE CHECKBOX */}
            {isDeleteMode && (
                <div
                    className="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer mr-1 hover:text-red-400 text-titanium-500 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleDeleteSelect) onToggleDeleteSelect(node.id);
                    }}
                >
                    {isDeleteSelected ? <CheckSquare size={14} className="text-red-500" /> : <Square size={14} />}
                </div>
            )}

            {/* 🟢 CLICK AREA 1: ICON (TOGGLE) */}
            <div
                className="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer hover:text-cyan-400 transition-colors"
                onClick={(e) => {
                    // 🟢 FIX: Respect delete mode on icon click too
                    if (isDeleteMode) {
                        e.stopPropagation();
                        if (onToggleDeleteSelect) onToggleDeleteSelect(node.id);
                        return;
                    }
                    onToggle(e);
                }}
            >
                {isLoading || isSaving ? (
                    <Loader2 size={14} className="animate-spin text-cyan-500" />
                ) : isConflicting ? (
                    <AlertTriangle size={14} className="animate-pulse" />
                ) : isFolder ? (
                    <div className="text-cyan-500">
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                ) : (
                    <FileText size={14} className={isActive ? "text-cyan-500" : "text-titanium-500"} />
                )}
            </div>

            {/* 🟢 CLICK AREA 2: NAME (EDIT / SELECT) */}
            {isEditing ? (
                <div className="flex-1 flex items-center gap-1">
                    <input
                        ref={inputRef}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onBlur={handleSaveRename} // Auto-save on blur
                        className="w-full bg-titanium-950 text-titanium-100 text-xs px-1 py-0.5 rounded border border-cyan-500/50 focus:outline-none focus:border-cyan-500"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            ) : (
                <span
                    className={`text-xs truncate cursor-pointer flex-1 ${isConflicting ? 'font-bold' : ''}`}
                    onClick={(e) => {
                        if (isDeleteMode && onToggleDeleteSelect) {
                            e.stopPropagation();
                            onToggleDeleteSelect(node.id);
                            return;
                        }
                        if (!isFolder) {
                            onToggle();
                        } else {
                            e.stopPropagation();
                        }
                    }}
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!isDeleteMode) setIsEditing(true);
                    }}
                >
                    {displayName}
                </span>
            )}

            {/* 🟢 FILE ACTIONS MENU (···) — only for files, hidden unless hovered */}
            {!isFolder && !isDeleteMode && onMoveFile && (
                <div className="relative shrink-0" ref={actionsRef}>
                    <button
                        onClick={(e) => { e.stopPropagation(); setIsActionsOpen(v => !v); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-titanium-600 hover:text-titanium-300 transition-all"
                    >
                        <MoreHorizontal size={12} />
                    </button>
                    {isActionsOpen && (
                        <div className="absolute right-0 top-full mt-1 w-36 bg-titanium-800 border border-titanium-600 rounded-md shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsActionsOpen(false);
                                    onMoveFile(node.id, node.name, node.parentId);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-titanium-200 hover:bg-titanium-700 hover:text-white flex items-center gap-2 transition-colors"
                            >
                                <FolderInput size={12} className="text-amber-400" />
                                <span>Mover a...</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

const FileTreeNode = React.memo(({ node, depth, onFileSelect, accessToken, isPreloaded }: FileTreeNodeProps) => {
    // ⚡ PERFORMANCE: This component now ONLY manages structure (open/close, children loading)
    // It is immune to context updates (activeFileId, etc) unless passed as props (which we removed).

    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileNode[]>(node.children || []);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(!!node.children && node.children.length > 0);

    // We need to access delete mode here ONLY to decide click behavior in handleToggle
    // But to keep this component pure, we will delegate decision logic to `handleToggle`
    // which checks context inside `FileNodeRow`? No, logic is mixed.
    // ⚡ Better approach: FileTreeNode is the "Controller", FileNodeRow is "View".
    // But FileTreeNode renders recursive children.

    // To properly decouple, we access context here solely for logic, OR pass callbacks down.
    // Accessing context here will re-render the whole subtree if context changes.
    // ❌ WE DO NOT WANT TO ACCESS CONTEXT HERE.

    // Solution: The `onToggle` passed to Row handles the logic.
    // BUT `FileTreeNode` needs to know if it should expand/load children.

    // Let's keep `handleToggle` here.
    // The Row will call it.

    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';

    // Update children if node prop changes (essential for preloaded updates)
    useEffect(() => {
        if (node.children) {
            setChildren(node.children);
            if (node.children.length > 0) setIsLoaded(true);
        }
    }, [node.children]);

    const handleToggle = async (e?: React.MouseEvent) => {
        if (e) e.stopPropagation(); // Stop propagation

        // ⚠️ Logic check: If delete mode is active, we don't expand/load, we select.
        // However, we don't have access to `isDeleteMode` here without Context.
        // If we consume context, we break the optimization.
        // TRICK: The `FileNodeRow` handles the "Selection" click internally if delete mode is on.
        // It only calls `onToggle` if it's a standard interaction.
        // So here we assume standard interaction.

        if (!isFolder) {
            // ES UN ARCHIVO: CARGAR CONTENIDO
            loadContent();
            return;
        }

        setIsOpen(!isOpen);

        // Si es carpeta, abrimos y cargamos hijos si no están cargados
        if (!isLoaded && !isOpen) {
            // 🟢 V3 DECENTRALIZED FIX: Preloaded roots (canonPaths) are just the shells.
            // We MUST fetch their children from Firestore!

            setIsLoading(true);
            try {
                // 🟢 LAZY LOAD: Fetch from Firestore 'files' collection
                const result = await callFunction<any>('getFileSystemNodes', { folderId: node.id, accessToken });

                // 🟢 FIX: Usamos el extractor seguro
                const files = extractFiles(result);

                setChildren(files);
                setIsLoaded(true);
            } catch (error) {
                console.error("Error loading folder:", error);
                toast.error("Error al cargar carpeta");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const loadContent = async () => {
        // 1. CACHE STRATEGY (Instant Load)
        const cachedContent = FileCache.get(node.id);
        const hasLoadedCache = cachedContent !== null;

        if (hasLoadedCache) {
            // Optimistic UI: Show cached content immediately
            onFileSelect(node.id, cachedContent!, node.name, false);
            // Don't set isLoading to true if we have cache, to keep it snappy
        } else {
            // Only show loading spinner if no cache
            setIsLoading(true);
        }

        try {
            // 2. NETWORK STRATEGY (Background Refresh)
            const result = await callFunction<{ content: string }>('getDriveFileContent', { fileId: node.id, accessToken });

            // 3. SYNC
            if (result.content) {
                FileCache.set(node.id, result.content);

                // If content differs from cache (or cache was empty), update it
                if (result.content !== cachedContent) {
                    // If we served cache, this is a BACKGROUND UPDATE (true)
                    // If we didn't serve cache, this is the INITIAL LOAD (false)
                    onFileSelect(node.id, result.content, node.name, hasLoadedCache);
                }
            }
        } catch (error) {
            console.error("Error loading file:", error);
            if (!cachedContent) {
                toast.error("Error al abrir archivo");
            } else {
                toast.warning("Modo Offline: Usando versión en caché");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleRename = async (newName: string) => {
        try {
            // Use driveId if available (for Shortcuts/Preloaded), else id
            const targetId = node.driveId || node.id;

            await callFunction('renameDriveFolder', {
                accessToken,
                fileId: targetId,
                newName: newName
            });

            node.name = newName; // Optimistic update local node ref
            toast.success("Nombre actualizado");
        } catch (error: any) {
            console.error("Error renaming:", error);
            toast.error("Error al renombrar: " + error.message);
            throw error;
        }
    };

    return (
        <div className="select-none" role="treeitem" aria-expanded={isFolder ? isOpen : undefined}>
            <FileNodeRow
                node={node}
                depth={depth}
                isOpen={isOpen}
                isLoading={isLoading}
                onToggle={handleToggle}
                onRename={handleRename}
            />

            {/* 🛡️ BLINDAJE: (children || []).map */}
            {isOpen && isFolder && (
                <div className="animate-slide-down" role="group">
                    {(children || []).map(child => (
                        <FileTreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onFileSelect={onFileSelect}
                            accessToken={accessToken}
                            isPreloaded={isPreloaded}
                        />
                    ))}
                    {children.length === 0 && !isLoading && (
                        <div
                            className="text-[10px] text-titanium-600 py-1 italic"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                        >
                            Vacío
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

const FileTree: React.FC<FileTreeProps> = ({ folderId, onFileSelect, accessToken, rootFilterId, onLoad, preloadedTree, conflictingFileIds, showOnlyHealthy, activeFileId, isDeleteMode, selectedDeleteIds, onToggleDeleteSelect, onMoveFile }) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // 1. PRELOADED MODE (Snapshot from DB)
        if (preloadedTree) {
            setRootFiles(preloadedTree);
            if (onLoad) onLoad(preloadedTree);
            return;
        }

        // 2. LAZY LOADING MODE (Fetching from Firestore V2)
        const loadRoot = async () => {
            if (!folderId || !accessToken) return; // 🛡️ Si no hay token, no intentamos
            setIsLoading(true);
            try {
                // 🟢 SWAPPED: getDriveFiles -> getFileSystemNodes
                // Fetch root level children
                const result = await callFunction<any>('getFileSystemNodes', { folderId, accessToken });

                // 🟢 FIX: Usamos el extractor seguro
                const files = extractFiles(result);

                setRootFiles(files);
                if (onLoad) onLoad(files); // 👈 Notificamos al padre
            } catch (error) {
                console.error("Error loading root:", error);
                toast.error("Error al conectar con Drive");
            } finally {
                setIsLoading(false);
            }
        };

        loadRoot();
    }, [folderId, accessToken, preloadedTree]); // ⚠️ NO añadir onLoad a deps para evitar bucles

    // 🔍 FILTRADO DE SAGA
    const displayedFiles = rootFilterId
        ? rootFiles.filter(f => f.id === rootFilterId)
        : rootFiles;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-titanium-500 gap-2">
                <Loader2 size={20} className="animate-spin text-cyan-500" />
                <span className="text-xs">Escaneando neuro-enlaces...</span>
            </div>
        );
    }

    // ⚡ PERFORMANCE: Inject Context here
    const contextValue: FileTreeContextValue = {
        activeFileId: activeFileId || null,
        conflictingFileIds,
        showOnlyHealthy,
        isDeleteMode,
        selectedDeleteIds,
        onToggleDeleteSelect,
        onMoveFile
    };

    // 🛡️ BLINDAJE: (displayedFiles || []).map
    return (
        <FileTreeContext.Provider value={contextValue}>
            <div className="flex flex-col gap-0.5" role="tree">
                {(displayedFiles || []).map(file => (
                    <FileTreeNode
                        key={file.id}
                        node={file}
                        depth={0}
                        onFileSelect={onFileSelect}
                        accessToken={accessToken}
                        isPreloaded={!!preloadedTree} // Pass flag down
                    />
                ))}
            </div>
        </FileTreeContext.Provider>
    );
};

export default FileTree;
