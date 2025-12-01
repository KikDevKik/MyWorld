import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { X, Printer, CheckSquare, Square, FolderOpen, Folder, FileText, BookOpen, ChevronLeft } from 'lucide-react';
import { DriveFile } from '../types';
import { toast } from 'sonner';

interface ExportPanelProps {
    onClose: () => void;
    folderId: string | null;
    accessToken: string | null;
}

interface SelectableFile extends DriveFile {
    selected: boolean;
}

// Helper to safely extract files from Cloud Function response
const extractFiles = (resultData: any): DriveFile[] => {
    if (Array.isArray(resultData)) return resultData;
    if (resultData && Array.isArray(resultData.files)) return resultData.files;
    return [];
};

const ExportPanel: React.FC<ExportPanelProps> = ({ onClose, folderId, accessToken }) => {
    const [files, setFiles] = useState<SelectableFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [format, setFormat] = useState<string>('PDF Standard');
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(folderId);
    const [folderHistory, setFolderHistory] = useState<Array<{ id: string, name: string }>>([]);

    useEffect(() => {
        if (!currentFolderId || !accessToken) return;

        const loadFiles = async () => {
            setLoading(true);
            try {
                const functions = getFunctions();
                const getDriveFiles = httpsCallable(functions, 'getDriveFiles');
                const result = await getDriveFiles({
                    folderId: currentFolderId,
                    accessToken
                });

                const allFiles = extractFiles(result.data);

                // Filter out _RESOURCES and convert to selectable
                const filteredFiles = allFiles
                    .filter(f => !f.name.includes('_RESOURCES'))
                    .map(f => {
                        // Preserve selection state if file was already loaded
                        const existing = files.find(existing => existing.id === f.id);
                        return { ...f, selected: existing?.selected || false };
                    });

                setFiles(filteredFiles);
            } catch (error: any) {
                console.error('Error loading files:', error);
                toast.error('Error al cargar archivos: ' + (error.message || 'Desconocido'));
            } finally {
                setLoading(false);
            }
        };

        loadFiles();
    }, [currentFolderId, accessToken]);

    const handleFolderClick = (folder: SelectableFile) => {
        setFolderHistory(prev => [...prev, { id: currentFolderId!, name: 'Atrás' }]);
        setCurrentFolderId(folder.id);
    };

    const handleGoBack = () => {
        if (folderHistory.length > 0) {
            const previous = folderHistory[folderHistory.length - 1];
            setCurrentFolderId(previous.id);
            setFolderHistory(prev => prev.slice(0, -1));
        }
    };

    const toggleFileSelection = (fileId: string) => {
        setFiles(prevFiles => prevFiles.map(f =>
            f.id === fileId ? { ...f, selected: !f.selected } : f
        ));
    };

    const getAllSelectedIds = (): string[] => {
        // Only return currently visible selected files
        return files.filter(f => f.selected && f.type === 'file').map(f => f.id);
    };

    const handleCompile = async () => {
        const selectedIds = getAllSelectedIds();

        if (selectedIds.length === 0) {
            toast.warning('No hay archivos seleccionados');
            return;
        }

        console.log('📚 COMPILAR MANUSCRITO');
        console.log('IDs seleccionados:', selectedIds);
        console.log('Formato:', format);

        try {
            toast.info('Compilando manuscrito... Esto puede tomar unos minutos.');

            const functions = getFunctions();
            const compileManuscript = httpsCallable(functions, 'compileManuscript');

            const result = await compileManuscript({
                fileIds: selectedIds,
                title: 'Mi Manuscrito',
                author: 'Autor',
                accessToken
            });

            const data = result.data as { success: boolean; pdf: string; sizeBytes: number };

            if (data.success) {
                const linkSource = `data:application/pdf;base64,${data.pdf}`;
                const downloadLink = document.createElement('a');
                downloadLink.href = linkSource;
                downloadLink.download = 'manuscrito.pdf';
                downloadLink.click();

                toast.success(`¡PDF generado! (${(data.sizeBytes / 1024).toFixed(1)} KB)`);
            }

        } catch (error: any) {
            console.error('Error compilando:', error);
            toast.error('Error al compilar: ' + (error.message || 'Desconocido'));
        }
    };

    const selectedCount = files.filter(f => f.selected && f.name.endsWith('.md')).length;
    const estimatedWords = selectedCount * 1200;

    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 text-titanium-100 animate-fade-in">
            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shadow-md z-10">
                <div className="flex items-center gap-3 text-orange-500">
                    <Printer size={24} />
                    <h2 className="font-bold text-xl text-titanium-100 tracking-wider">LA IMPRENTA</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* CONTENT - 2 COLUMNS */}
            <div className="flex-1 flex overflow-hidden">
                {/* LEFT: EL COMPOSITOR (File List) */}
                <div className="w-1/2 border-r border-titanium-800 flex flex-col">
                    <div className="p-4 border-b border-titanium-800">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-titanium-400 uppercase tracking-wide">El Compositor</h3>
                            {folderHistory.length > 0 && (
                                <button
                                    onClick={handleGoBack}
                                    className="flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 transition-colors"
                                >
                                    <ChevronLeft size={14} />
                                    Volver
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-titanium-600">Selecciona los archivos para compilar</p>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-titanium-500">
                                <Printer className="animate-pulse mr-2" size={20} /> Cargando archivos...
                            </div>
                        ) : files.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-titanium-600 opacity-50">
                                <FolderOpen size={48} className="mb-2" />
                                <p>No hay archivos disponibles</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {files.map(file => {
                                    const isFolder = file.type === 'folder';
                                    return (
                                        <button
                                            key={file.id}
                                            onClick={() => isFolder ? handleFolderClick(file) : toggleFileSelection(file.id)}
                                            className={`
                                                w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all
                                                ${isFolder
                                                    ? 'hover:bg-titanium-900 text-blue-400 hover:text-blue-300'
                                                    : file.selected
                                                        ? 'bg-orange-500/10 border border-orange-500/30 text-titanium-100'
                                                        : 'hover:bg-titanium-900 text-titanium-400 hover:text-titanium-100'}
                                            `}
                                        >
                                            {/* Checkbox (only for files) */}
                                            {!isFolder && (
                                                file.selected ? (
                                                    <CheckSquare size={16} className="text-orange-500 flex-shrink-0" />
                                                ) : (
                                                    <Square size={16} className="text-titanium-600 flex-shrink-0" />
                                                )
                                            )}

                                            {/* Icon */}
                                            {isFolder ? (
                                                <Folder size={16} className="flex-shrink-0" />
                                            ) : (
                                                <FileText size={14} className="text-titanium-500 flex-shrink-0" />
                                            )}

                                            {/* Name */}
                                            <span className="text-sm truncate flex-1 text-left">
                                                {file.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT: VISTA PREVIA */}
                <div className="w-1/2 flex flex-col">
                    <div className="p-4 border-b border-titanium-800">
                        <h3 className="text-sm font-bold text-titanium-400 uppercase tracking-wide">Vista Previa</h3>
                        <p className="text-xs text-titanium-600 mt-1">Resumen de compilación</p>
                    </div>

                    <div className="flex-1 p-6 flex flex-col">
                        {/* Stats */}
                        <div className="space-y-4 mb-6">
                            <div className="bg-titanium-900 rounded-xl p-4 border border-titanium-800">
                                <div className="text-3xl font-bold text-orange-500">{selectedCount}</div>
                                <div className="text-sm text-titanium-500 mt-1">
                                    {selectedCount === 1 ? 'Capítulo seleccionado' : 'Capítulos seleccionados'}
                                </div>
                            </div>

                            <div className="bg-titanium-900 rounded-xl p-4 border border-titanium-800">
                                <div className="text-3xl font-bold text-blue-400">{estimatedWords.toLocaleString()}</div>
                                <div className="text-sm text-titanium-500 mt-1">Palabras estimadas</div>
                            </div>
                        </div>

                        {/* Format Options */}
                        <div className="mb-6">
                            <label className="text-sm font-bold text-titanium-400 uppercase tracking-wide mb-2 block">Formato</label>
                            <button
                                className="w-full bg-titanium-900 border border-titanium-700 rounded-lg px-4 py-3 text-left hover:border-orange-500/50 transition-colors"
                                onClick={() => toast.info('Más formatos disponibles próximamente')}
                            >
                                <div className="flex items-center gap-2">
                                    <BookOpen size={18} className="text-orange-500" />
                                    <span className="text-titanium-100">{format}</span>
                                </div>
                            </button>
                        </div>

                        {/* Spacer */}
                        <div className="flex-1" />

                        {/* Compile Button */}
                        <button
                            onClick={handleCompile}
                            disabled={selectedCount === 0}
                            className={`
                                w-full py-4 rounded-xl font-bold text-lg transition-all
                                ${selectedCount > 0
                                    ? 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white shadow-lg hover:shadow-orange-500/20'
                                    : 'bg-titanium-800 text-titanium-600 cursor-not-allowed'}
                            `}
                        >
                            {selectedCount > 0 ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Printer size={20} />
                                    COMPILAR MANUSCRITO
                                </div>
                            ) : (
                                'SELECCIONA ARCHIVOS'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExportPanel;
