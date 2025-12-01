import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { ChevronRight, ChevronDown, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
}

interface FileTreeProps {
    folderId: string;
    onFileSelect: (id: string, content: string, name?: string) => void;
    accessToken: string | null;
    rootFilterId?: string | null; // 👈 NUEVO: Filtro de Saga
    onLoad?: (files: FileNode[]) => void; // 👈 NUEVO: Callback para el Sidebar
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
}> = ({ node, depth, onFileSelect, accessToken }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [children, setChildren] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    // Detectar carpetas de forma segura
    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';

    const handleToggle = async () => {
        if (!isFolder) {
            // ES UN ARCHIVO: CARGAR CONTENIDO
            loadContent();
            return;
        }

        setIsOpen(!isOpen);

        // Si es carpeta, abrimos y cargamos hijos si no están cargados
        if (!isLoaded && !isOpen) {
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

    return (
        <div className="select-none">
            <div
                className={`
                    flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors
                    hover:bg-titanium-800/50 text-titanium-300 hover:text-titanium-100
                    ${!isFolder && isLoading ? 'animate-pulse' : ''}
                `}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={handleToggle}
            >
                <div className="text-titanium-500 shrink-0">
                    {isLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : isFolder ? (
                        isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : (
                        <FileText size={14} />
                    )}
                </div>

                <span className="text-xs truncate font-medium">{node.name}</span>
            </div>

            {/* 🛡️ BLINDAJE: (children || []).map */}
            {isOpen && isFolder && (
                <div className="animate-slide-down">
                    {(children || []).map(child => (
                        <FileTreeNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onFileSelect={onFileSelect}
                            accessToken={accessToken}
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
};

const FileTree: React.FC<FileTreeProps> = ({ folderId, onFileSelect, accessToken, rootFilterId, onLoad }) => {
    const [rootFiles, setRootFiles] = useState<FileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
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
    }, [folderId, accessToken]); // ⚠️ NO añadir onLoad a deps para evitar bucles

    // 🔍 FILTRADO DE SAGA
    const displayedFiles = rootFilterId
        ? rootFiles.filter(f => f.id === rootFilterId)
        : rootFiles;

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-titanium-500 gap-2">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs">Escaneando neuro-enlaces...</span>
            </div>
        );
    }

    // 🛡️ BLINDAJE: (displayedFiles || []).map
    return (
        <div className="flex flex-col gap-0.5">
            {(displayedFiles || []).map(file => (
                <FileTreeNode
                    key={file.id}
                    node={file}
                    depth={0}
                    onFileSelect={onFileSelect}
                    accessToken={accessToken}
                />
            ))}
        </div>
    );
};

export default FileTree;