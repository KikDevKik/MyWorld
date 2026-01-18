import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { ChevronRight, ChevronDown, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
    driveId?: string; // Optional if we need to map back to original ID
}

interface FileTreeProps {
    folderId?: string; // Made optional
    onFileSelect: (id: string, content: string, name?: string) => void;
    accessToken: string | null;
    rootFilterId?: string | null; // 👈 NUEVO: Filtro de Saga
    onLoad?: (files: FileNode[]) => void; // 👈 NUEVO: Callback para el Sidebar
    preloadedTree?: FileNode[]; // 👈 NUEVO: Árbol estático
    conflictingFileIds?: Set<string>; // 👈 NEW: Conflicting Files
    showOnlyHealthy?: boolean; // 👈 NEW: Filter
    activeFileId?: string | null; // 👈 NEW: Active File Highlighting
}

// --- HELPER PARA EXTRAER DATOS DE FORMA SEGURA ---
const extractFiles = (resultData: any): FileNode[] => {
    // Si el backend devuelve directamente el array (Plan A)
    if (Array.isArray(resultData)) return resultData;
    // Si el backend devuelve { files: [...] } (Plan B)
    if (resultData && Array.isArray(resultData.files)) return resultData.files;
    // Si no hay nada, devolvemos array vacío para que no explote
    return [];
};

const FileTreeNode: React.FC<{
    node: FileNode;
    depth: number;
    onFileSelect: (id: string, content: string, name?: string) => void;
    accessToken: string | null;
    isPreloaded?: boolean;
    conflictingFileIds?: Set<string>;
    showOnlyHealthy?: boolean;
    activeFileId?: string | null;
}> = ({ node, depth, onFileSelect, accessToken, isPreloaded, conflictingFileIds, showOnlyHealthy, activeFileId }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileNode[]>(node.children || []);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(!!node.children);

    // Update children if node prop changes (essential for preloaded updates)
    useEffect(() => {
        if (node.children) {
            setChildren(node.children);
            setIsLoaded(true);
        }
    }, [node.children]);

    // Detectar carpetas de forma segura
    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
    const isActive = node.id === activeFileId;

    // 🟢 CONFLICT LOGIC
    // We assume node.id is the Drive ID (legacy) or we check node.driveId if available.
    // In preloadedTree (ingestFile), `id` is usually the Drive ID.
    const isConflicting = conflictingFileIds?.has(node.id) || (node.driveId && conflictingFileIds?.has(node.driveId));

    // 🟢 FILTER LOGIC
    if (showOnlyHealthy && isConflicting) {
        return null; // Hide this node
    }

    const handleToggle = async () => {
        if (!isFolder) {
            // ES UN ARCHIVO: CARGAR CONTENIDO
            loadContent();
            return;
        }

        setIsOpen(!isOpen);

        // Si es carpeta, abrimos y cargamos hijos si no están cargados
        if (!isLoaded && !isOpen) {
            // If preloaded mode, do NOT fetch. Children should already be there.
            if (isPreloaded) {
                return;
            }

            setIsLoading(true);
            try {
                const functions = getFunctions();
                const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
                const result = await getDriveFiles({ folderId: node.id, accessToken });

                // 🟢 FIX: Usamos el extractor seguro
                const files = extractFiles(result.data);

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
        setIsLoading(true);
        try {
            const functions = getFunctions();
            const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');
            const result = await getDriveFileContent({ fileId: node.id, accessToken });
            const content = (result.data as any).content;
            onFileSelect(node.id, content, node.name);
        } catch (error) {
            console.error("Error loading file:", error);
            toast.error("Error al abrir archivo");
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
        }
        if (e.key === 'ArrowRight' && isFolder && !isOpen) {
            e.preventDefault();
            handleToggle();
        }
        if (e.key === 'ArrowLeft' && isFolder && isOpen) {
            e.preventDefault();
            handleToggle();
        }
    };

    return (
        <div className="select-none" role="treeitem" aria-selected={isActive} aria-expanded={isFolder ? isOpen : undefined}>
            <div
                className={`
                    flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cyan-500
                    ${isActive
                        ? 'bg-cyan-900/20 text-cyan-400 font-medium'
                        : isConflicting
                            ? 'text-amber-500 hover:text-amber-400 hover:bg-amber-900/20'
                            : 'text-titanium-300 hover:text-titanium-100 hover:bg-cyan-900/20'
                    }
                    ${!isFolder && isLoading ? 'animate-pulse' : ''}
                `}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                title={isConflicting ? "Divergencia Narrativa detectada por el Guardián. Revisión pendiente." : undefined}
            >
                <div className="shrink-0 flex items-center justify-center w-4 h-4">
                    {isLoading ? (
                        <Loader2 size={14} className="animate-spin text-cyan-500" />
                    ) : isConflicting ? (
                        <AlertTriangle size={14} className="animate-pulse" />
                    ) : isFolder ? (
                        <div className="text-cyan-500">
                             {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </div>
                    ) : (
                        <FileText size={14} className={isActive ? "text-cyan-500" : "text-titanium-500"}/>
                    )}
                </div>

                <span className={`text-xs truncate ${isConflicting ? 'font-bold' : ''}`}>{node.name}</span>
            </div>

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
                            conflictingFileIds={conflictingFileIds} // Pass Down
                            showOnlyHealthy={showOnlyHealthy} // Pass Down
                            activeFileId={activeFileId} // Pass Down
                        />
                    ))}
                    {children.length === 0 && !isLoading && (
                        <div
                            className="text-[10px] text-titanium-600 py-1 italic"
                            style={{ paddingLeft: `${(depth + 1) * 12 + 24}px` }}
                        >
                            {isPreloaded ? 'Vacío (en memoria)' : 'Vacío'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const FileTree: React.FC<FileTreeProps> = ({ folderId, onFileSelect, accessToken, rootFilterId, onLoad, preloadedTree, conflictingFileIds, showOnlyHealthy, activeFileId }) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        // 1. PRELOADED MODE (Snapshot from DB)
        if (preloadedTree) {
            setRootFiles(preloadedTree);
            if (onLoad) onLoad(preloadedTree);
            return;
        }

        // 2. LEGACY DRIVE MODE (Fetching from API)
        const loadRoot = async () => {
            if (!folderId || !accessToken) return; // 🛡️ Si no hay token, no intentamos
            setIsLoading(true);
            try {
                const functions = getFunctions();
                const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
                const result = await getDriveFiles({ folderId, accessToken });

                // 🟢 FIX: Usamos el extractor seguro
                const files = extractFiles(result.data);

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

    // 🛡️ BLINDAJE: (displayedFiles || []).map
    return (
        <div className="flex flex-col gap-0.5" role="tree">
            {(displayedFiles || []).map(file => (
                <FileTreeNode
                    key={file.id}
                    node={file}
                    depth={0}
                    onFileSelect={onFileSelect}
                    accessToken={accessToken}
                    isPreloaded={!!preloadedTree} // Pass flag down
                    conflictingFileIds={conflictingFileIds} // Pass Down
                    showOnlyHealthy={showOnlyHealthy} // Pass Down
                    activeFileId={activeFileId} // Pass Down
                />
            ))}
        </div>
    );
};

export default FileTree;
