import React, { useState, useEffect } from 'react';
import { FilePlus, FolderPlus, Loader2, Folder, FileText } from 'lucide-react';
import { Modal } from './Modal';
import { useProjectConfig } from '../../contexts/ProjectConfigContext';
import { callFunction } from '../../services/api';
import { toast } from 'sonner';

type ItemType = 'file' | 'folder';
type SectionType = 'canon' | 'resources';

interface FlatFolder {
    id: string;
    name: string;
    depth: number;
    section: SectionType;
}

interface CreateItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessToken: string | null;
    onFileCreated: (id: string, content: string, name: string) => void;
    onFolderCreated: () => void;
    defaultType?: ItemType;
}

const extractFiles = (result: any): any[] => {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.files)) return result.files;
    return [];
};

const CreateItemModal: React.FC<CreateItemModalProps> = ({
    isOpen,
    onClose,
    accessToken,
    onFileCreated,
    onFolderCreated,
    defaultType = 'file',
}) => {
    const { config, updateConfig } = useProjectConfig();

    const [itemType, setItemType] = useState<ItemType>(defaultType);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // File state
    const [fileName, setFileName] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

    // Folder state
    const [folderName, setFolderName] = useState('');
    const [sectionType, setSectionType] = useState<SectionType>('canon');
    const [parentFolderId, setParentFolderId] = useState<string | null>(null);

    // Folder tree (loaded on open)
    const [flatFolders, setFlatFolders] = useState<FlatFolder[]>([]);
    const [isLoadingFolders, setIsLoadingFolders] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setItemType(defaultType);
        setFileName('');
        setFolderName('');
        setSectionType('canon');
        setParentFolderId(null);
        loadFolderTree();
    }, [isOpen]);

    const loadFolderTree = async () => {
        if (!accessToken) return;
        setIsLoadingFolders(true);
        const folders: FlatFolder[] = [];

        const processPath = async (path: { id: string; name: string }, section: SectionType) => {
            folders.push({ id: path.id, name: path.name, depth: 0, section });
            try {
                const result = await callFunction<any>('getFileSystemNodes', { folderId: path.id, accessToken });
                for (const child of extractFiles(result)) {
                    if (child.mimeType === 'application/vnd.google-apps.folder') {
                        folders.push({ id: child.id, name: child.name, depth: 1, section });
                    }
                }
            } catch (_) {}
        };

        for (const p of config?.canonPaths || []) await processPath(p, 'canon');
        for (const p of config?.resourcePaths || []) await processPath(p, 'resources');

        setFlatFolders(folders);
        if (!selectedFolderId && folders.length > 0) setSelectedFolderId(folders[0].id);
        setIsLoadingFolders(false);
    };

    const handleCreateFile = async () => {
        if (!fileName.trim() || !selectedFolderId || !accessToken) return;
        setIsSubmitting(true);
        try {
            const content = `# ${fileName.trim()}\n\n`;
            const data = await callFunction<any>('forgeToolExecution', {
                title: fileName.trim(),
                content,
                folderId: selectedFolderId,
                accessToken,
            });
            if (!data.success) throw new Error(data.message || 'Error desconocido');
            toast.success('Archivo creado correctamente.');
            onFileCreated(data.fileId, content, fileName.trim());
            onClose();
        } catch (e: any) {
            toast.error('Error al crear archivo: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateFolder = async () => {
        if (!folderName.trim() || !accessToken || !config?.folderId) return;
        const parentId = parentFolderId || config.folderId;
        setIsSubmitting(true);
        try {
            const result = await callFunction<{ id: string; name: string; success: boolean }>(
                'createDriveFolder',
                { accessToken, parentId, folderName: folderName.trim() }
            );
            if (!parentFolderId && result?.id) {
                const newPath = { id: result.id, name: folderName.trim() };
                if (sectionType === 'canon') {
                    await updateConfig({ ...config, canonPaths: [...(config.canonPaths || []), newPath] } as any);
                } else {
                    await updateConfig({ ...config, resourcePaths: [...(config.resourcePaths || []), newPath] } as any);
                }
            }
            toast.success(`Carpeta "${folderName.trim()}" creada.`);
            onFolderCreated();
            onClose();
        } catch (e: any) {
            toast.error('Error al crear carpeta: ' + e.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = () => {
        if (itemType === 'file') handleCreateFile();
        else handleCreateFolder();
    };

    const canSubmit = itemType === 'file'
        ? !!fileName.trim() && !!selectedFolderId && !isLoadingFolders
        : !!folderName.trim();

    const sectionFolders = flatFolders.filter(f => f.section === sectionType);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeOnBackdropClick={false}
            className="max-w-md"
            title={
                <span className="flex items-center gap-2">
                    {itemType === 'file'
                        ? <FilePlus size={18} className="text-cyan-400" />
                        : <FolderPlus size={18} className="text-amber-400" />
                    }
                    Crear nuevo
                </span>
            }
            footer={
                <>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm text-titanium-400 hover:text-white hover:bg-titanium-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit || isSubmitting}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 ${
                            itemType === 'file'
                                ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20'
                                : 'bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20'
                        }`}
                    >
                        {isSubmitting
                            ? <><Loader2 size={14} className="animate-spin" />Creando...</>
                            : itemType === 'file'
                                ? <><FilePlus size={14} />Crear Archivo</>
                                : <><FolderPlus size={14} />Crear Carpeta</>
                        }
                    </button>
                </>
            }
        >
            {/* Type toggle */}
            <div className="flex gap-1.5 mb-5 p-1 bg-titanium-950 rounded-lg border border-titanium-800">
                <button
                    type="button"
                    onClick={() => setItemType('file')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
                        itemType === 'file'
                            ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 shadow'
                            : 'text-titanium-500 hover:text-titanium-300 hover:bg-titanium-800/50'
                    }`}
                >
                    <FileText size={13} />
                    Archivo
                </button>
                <button
                    type="button"
                    onClick={() => setItemType('folder')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-all ${
                        itemType === 'folder'
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-500/30 shadow'
                            : 'text-titanium-500 hover:text-titanium-300 hover:bg-titanium-800/50'
                    }`}
                >
                    <Folder size={13} />
                    Carpeta
                </button>
            </div>

            {itemType === 'file' ? (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Nombre del archivo
                        </label>
                        <input
                            type="text"
                            value={fileName}
                            onChange={e => setFileName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
                            placeholder="Ej. Capítulo 1: El Inicio"
                            className="w-full bg-titanium-950 border border-titanium-700 rounded-lg px-4 py-3 text-titanium-100 placeholder:text-titanium-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
                            autoFocus
                        />
                        <p className="text-[10px] text-titanium-500">Se creará como archivo Markdown (.md)</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Carpeta de destino
                        </label>
                        {isLoadingFolders ? (
                            <div className="flex items-center gap-2 p-3 text-titanium-500 text-xs">
                                <Loader2 size={13} className="animate-spin" />
                                Cargando carpetas...
                            </div>
                        ) : flatFolders.length === 0 ? (
                            <p className="text-xs text-titanium-500 italic p-3">No hay carpetas configuradas.</p>
                        ) : (
                            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto bg-titanium-950/50 border border-titanium-700 rounded-lg p-1.5 custom-scrollbar">
                                {flatFolders.map(folder => (
                                    <button
                                        key={folder.id}
                                        type="button"
                                        onClick={() => setSelectedFolderId(folder.id)}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[11px] transition-colors ${
                                            selectedFolderId === folder.id
                                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/20'
                                                : 'text-titanium-400 hover:bg-titanium-800/60 hover:text-titanium-200 border border-transparent'
                                        }`}
                                        style={{ paddingLeft: `${folder.depth * 14 + 8}px` }}
                                    >
                                        <Folder size={11} className={`shrink-0 ${folder.section === 'canon' ? 'text-emerald-500' : 'text-blue-500'}`} />
                                        <span className="truncate flex-1">{folder.name}</span>
                                        {folder.depth === 0 && (
                                            <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded shrink-0 ${
                                                folder.section === 'canon' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-blue-900/50 text-blue-400'
                                            }`}>
                                                {folder.section === 'canon' ? 'C' : 'R'}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Nombre de la carpeta
                        </label>
                        <input
                            type="text"
                            value={folderName}
                            onChange={e => setFolderName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) handleSubmit(); }}
                            placeholder="Ej. Personajes, Libro 2, Mapas..."
                            className="w-full bg-titanium-950 border border-titanium-700 rounded-lg px-4 py-3 text-titanium-100 placeholder:text-titanium-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                            autoFocus={itemType === 'folder'}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Sección
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['canon', 'resources'] as SectionType[]).map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => { setSectionType(s); setParentFolderId(null); }}
                                    className={`flex flex-col items-start p-3 rounded-lg border-2 transition-all ${
                                        sectionType === s
                                            ? s === 'canon' ? 'border-emerald-500 bg-emerald-900/20' : 'border-blue-500 bg-blue-900/20'
                                            : 'border-titanium-700 hover:border-titanium-500 bg-titanium-800/50'
                                    }`}
                                >
                                    <span className={`text-xs font-bold uppercase tracking-wider ${
                                        sectionType === s ? (s === 'canon' ? 'text-emerald-400' : 'text-blue-400') : 'text-titanium-400'
                                    }`}>
                                        {s === 'canon' ? 'CANON' : 'RESOURCES'}
                                    </span>
                                    <span className="text-[10px] text-titanium-500 mt-0.5">
                                        {s === 'canon' ? 'Contenido oficial' : 'Referencias'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Ubicación
                        </label>
                        <div className="flex flex-col gap-1 max-h-36 overflow-y-auto custom-scrollbar">
                            <button
                                type="button"
                                onClick={() => setParentFolderId(null)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left text-xs ${
                                    parentFolderId === null
                                        ? 'border-amber-500/50 bg-amber-900/20 text-amber-300'
                                        : 'border-titanium-700 hover:border-titanium-500 text-titanium-400 hover:text-titanium-200 bg-titanium-800/50'
                                }`}
                            >
                                <Folder size={12} className="shrink-0 text-titanium-400" />
                                <div>
                                    <div className="font-semibold">Raíz del proyecto</div>
                                    <div className="text-[9px] text-titanium-500">
                                        Se añade a {sectionType === 'canon' ? 'CANON' : 'RESOURCES'} y aparece en configuración
                                    </div>
                                </div>
                            </button>
                            {sectionFolders.map(f => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setParentFolderId(f.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left text-xs ${
                                        parentFolderId === f.id
                                            ? 'border-amber-500/50 bg-amber-900/20 text-amber-300'
                                            : 'border-titanium-700 hover:border-titanium-500 text-titanium-400 hover:text-titanium-200 bg-titanium-800/50'
                                    }`}
                                    style={{ paddingLeft: `${f.depth * 8 + 12}px` }}
                                >
                                    <Folder size={12} className={`shrink-0 ${sectionType === 'canon' ? 'text-emerald-500' : 'text-blue-500'}`} />
                                    <span className="truncate">{f.name}</span>
                                </button>
                            ))}
                            {sectionFolders.length === 0 && (
                                <p className="text-[10px] text-titanium-500 italic text-center py-2">
                                    Sin carpetas {sectionType === 'canon' ? 'CANON' : 'RESOURCES'}. Se creará en la raíz.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default CreateItemModal;
