import React, { useState, useEffect } from 'react';
import { X, Folder, FilePlus, Loader2, Save } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import useDrivePicker from 'react-google-drive-picker';
import { FolderRole } from '../../types/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

interface CreateFileModalProps {
    isOpen: boolean;
    onClose: () => void;
    onFileCreated: (id: string, content: string, name: string) => void;
    accessToken: string | null;
}

const CreateFileModal: React.FC<CreateFileModalProps> = ({ isOpen, onClose, onFileCreated, accessToken }) => {
    const { config, fileTree } = useProjectConfig();
    const [fileName, setFileName] = useState("");
    const [selectedFolder, setSelectedFolder] = useState<{ id: string; name: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openPicker] = useDrivePicker();

    // 🟢 DEFAULT FOLDER LOGIC
    useEffect(() => {
        if (!isOpen || !config) return;

        // Reset state
        setFileName("");

        // Strategy:
        // 1. Try to find SAGA_MAIN (Manuscrito)
        // 2. Try to find "Libro_01" inside it.
        // 3. Fallback to Root.

        const findDefault = () => {
             const manuscriptId = config.folderMapping?.[FolderRole.SAGA_MAIN];

             // If no manuscript mapping, try first canon path
             if (!manuscriptId) {
                 if (config.canonPaths.length > 0) {
                     return { id: config.canonPaths[0].id, name: config.canonPaths[0].name };
                 }
                 if (config.folderId) {
                     return { id: config.folderId, name: "Raíz del Proyecto" };
                 }
                 return null;
             }

             // If we have fileTree, try to find Libro_01
             if (fileTree && Array.isArray(fileTree)) {
                // Helper to search tree
                const findNode = (nodes: any[], id: string): any => {
                    for (const node of nodes) {
                        if (node.id === id) return node;
                        if (node.children) {
                            const found = findNode(node.children, id);
                            if (found) return found;
                        }
                    }
                    return null;
                };

                const rootNode = findNode(fileTree, manuscriptId);
                if (rootNode && rootNode.children) {
                     const book = rootNode.children.find((c: any) =>
                        c.name.toLowerCase().replace(/_/g, '').includes('libro01') ||
                        c.name.toLowerCase().includes('libro_01') ||
                        c.name.toLowerCase().includes('libro 1')
                    );
                    if (book) {
                        return { id: book.id, name: book.name };
                    }
                }

                // If finding node worked but no book, return node
                if (rootNode) return { id: rootNode.id, name: rootNode.name };
             }

             // Fallback if no tree or not found
             return { id: manuscriptId, name: "Manuscrito (Principal)" };
        };

        const def = findDefault();
        setSelectedFolder(def);

    }, [isOpen, config, fileTree]);

    const handleOpenPicker = () => {
        const token = accessToken || localStorage.getItem('google_drive_token');
        if (!token) {
            toast.error("Error de autenticación. Recarga la página.");
            return;
        }

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
                    const doc = data.docs[0];
                    setSelectedFolder({ id: doc.id, name: doc.name });
                }
            }
        });
    };

    const handleSubmit = async () => {
        if (!fileName.trim()) {
            toast.error("Escribe un nombre para el archivo.");
            return;
        }
        if (!selectedFolder) {
            toast.error("Selecciona una carpeta de destino.");
            return;
        }
        if (!accessToken) {
             toast.error("Sesión no válida.");
             return;
        }

        setIsSubmitting(true);
        try {
            const functions = getFunctions();
            const forgeToolExecution = httpsCallable(functions, 'forgeToolExecution');

            const fileContent = `# ${fileName}\n\n`;

            const result = await forgeToolExecution({
                title: fileName,
                content: fileContent,
                folderId: selectedFolder.id,
                accessToken: accessToken
            });

            const data = result.data as any;

            if (data.success) {
                toast.success("Archivo creado exitosamente.");
                onFileCreated(data.fileId, fileContent, fileName);
                onClose();
            } else {
                throw new Error(data.message || "Error desconocido");
            }

        } catch (error: any) {
            console.error("Error creating file:", error);
            toast.error("Error al crear archivo: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-titanium-900 border border-titanium-700 rounded-xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-5 border-b border-titanium-700/50 bg-titanium-800/30 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-titanium-100 flex items-center gap-2">
                        <FilePlus size={20} className="text-cyan-500"/> Nuevo Manuscrito
                    </h3>
                    <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Name Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Nombre del Archivo
                        </label>
                        <input
                            type="text"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            placeholder="Ej. Capítulo 1: El Inicio"
                            className="w-full bg-titanium-950 border border-titanium-700 rounded-lg px-4 py-3 text-titanium-100 placeholder:text-titanium-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                            autoFocus
                        />
                        <p className="text-[10px] text-titanium-500">
                            Se creará como un archivo Markdown (.md)
                        </p>
                    </div>

                    {/* Folder Select */}
                    <div className="space-y-2">
                         <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Ubicación
                        </label>
                        <div className="flex items-center justify-between bg-titanium-800/50 border border-titanium-700 rounded-lg p-3">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="p-2 bg-titanium-900 rounded-md shrink-0">
                                    <Folder size={16} className="text-titanium-400" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-sm font-medium text-titanium-200 truncate">
                                        {selectedFolder ? selectedFolder.name : "Cargando..."}
                                    </span>
                                    <span className="text-[10px] text-titanium-500 font-mono truncate">
                                        {selectedFolder ? (selectedFolder.name.toLowerCase().includes('libro') ? 'Recomendado' : 'Carpeta de destino') : 'Detectando...'}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={handleOpenPicker}
                                className="text-xs font-medium text-cyan-500 hover:text-cyan-400 hover:underline px-2 py-1"
                            >
                                Cambiar
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-titanium-700/50 bg-titanium-800/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-titanium-400 hover:text-white hover:bg-titanium-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !fileName.trim() || !selectedFolder}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold bg-cyan-600 text-white hover:bg-cyan-500 transition-all shadow-lg shadow-cyan-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? <Loader2 size={16} className="animate-spin"/> : <Save size={16} />}
                        {isSubmitting ? 'Creando...' : 'Crear Archivo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CreateFileModal;
