import React, { useState, useEffect } from 'react';
import { FolderPlus, Folder, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { useProjectConfig } from '../../contexts/ProjectConfigContext';
import { callFunction } from '../../services/api';
import { toast } from 'sonner';

type SectionType = 'canon' | 'resources';

interface NewFolderWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessToken: string | null;
    onFolderCreated: () => void;
}

const NewFolderWizardModal: React.FC<NewFolderWizardModalProps> = ({
    isOpen,
    onClose,
    accessToken,
    onFolderCreated,
}) => {
    const { config, updateConfig } = useProjectConfig();

    const [step, setStep] = useState<1 | 2>(1);
    const [folderName, setFolderName] = useState('');
    const [sectionType, setSectionType] = useState<SectionType>('canon');
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);

    const canonPaths = config?.canonPaths || [];
    const resourcePaths = config?.resourcePaths || [];
    const currentPaths = sectionType === 'canon' ? canonPaths : resourcePaths;

    useEffect(() => {
        if (!isOpen) return;
        setStep(1);
        setFolderName('');
        setSectionType('canon');
        setSelectedParentId(null);
    }, [isOpen]);

    // Reset parent selection when section type changes
    useEffect(() => {
        setSelectedParentId(null);
    }, [sectionType]);

    const handleNext = () => {
        if (!folderName.trim()) {
            toast.error("Escribe un nombre para la carpeta.");
            return;
        }
        setStep(2);
    };

    const handleCreate = async () => {
        if (!folderName.trim() || !accessToken || !config?.folderId) return;

        const parentId = selectedParentId || config.folderId;

        setIsCreating(true);
        try {
            const result = await callFunction<{ id: string; name: string; success: boolean }>(
                'createDriveFolder',
                { accessToken, parentId, folderName: folderName.trim() }
            );

            // If parent is the project root, register in config paths
            if (!selectedParentId && result?.id) {
                const newPath = { id: result.id, name: folderName.trim() };
                if (sectionType === 'canon') {
                    await updateConfig({
                        ...config,
                        canonPaths: [...(config.canonPaths || []), newPath],
                    } as any);
                } else {
                    await updateConfig({
                        ...config,
                        resourcePaths: [...(config.resourcePaths || []), newPath],
                    } as any);
                }
            }

            toast.success(`Carpeta "${folderName.trim()}" creada correctamente.`);
            onFolderCreated();
            onClose();
        } catch (e: any) {
            toast.error("Error al crear carpeta: " + e.message);
        } finally {
            setIsCreating(false);
        }
    };

    const sectionLabel = sectionType === 'canon' ? 'CANON' : 'RESOURCES';
    const sectionColor = sectionType === 'canon' ? 'emerald' : 'blue';

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            closeOnBackdropClick={false}
            className="max-w-sm"
            title={
                <span className="flex items-center gap-2">
                    <FolderPlus size={18} className="text-amber-400" />
                    Nueva Carpeta
                    <span className="text-titanium-500 text-sm font-normal ml-1">
                        Paso {step} de 2
                    </span>
                </span>
            }
            footer={
                step === 1 ? (
                    <>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-titanium-400 hover:text-white hover:bg-titanium-700 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!folderName.trim()}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            Siguiente
                            <ChevronRight size={14} />
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            onClick={() => setStep(1)}
                            disabled={isCreating}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-titanium-400 hover:text-white hover:bg-titanium-700 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <ChevronLeft size={14} />
                            Atrás
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={isCreating}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                        >
                            {isCreating
                                ? <><Loader2 size={14} className="animate-spin" />Creando...</>
                                : <><FolderPlus size={14} />Crear Carpeta</>
                            }
                        </button>
                    </>
                )
            }
        >
            {step === 1 ? (
                <div className="space-y-5">
                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Nombre de la carpeta
                        </label>
                        <input
                            type="text"
                            value={folderName}
                            onChange={e => setFolderName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleNext(); }}
                            placeholder="Ej. Personajes, Mundos, Libro 2..."
                            className="w-full bg-titanium-950 border border-titanium-700 rounded-lg px-4 py-3 text-titanium-100 placeholder:text-titanium-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
                            autoFocus
                        />
                    </div>

                    {/* Section Type */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Tipo de sección
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setSectionType('canon')}
                                className={`flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left ${
                                    sectionType === 'canon'
                                        ? 'border-emerald-500 bg-emerald-900/20'
                                        : 'border-titanium-700 hover:border-titanium-500 bg-titanium-800/50'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${sectionType === 'canon' ? 'border-emerald-500' : 'border-titanium-500'}`}>
                                        {sectionType === 'canon' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                                    </div>
                                    <span className={`text-xs font-bold uppercase tracking-wider ${sectionType === 'canon' ? 'text-emerald-400' : 'text-titanium-400'}`}>
                                        CANON
                                    </span>
                                </div>
                                <span className="text-[10px] text-titanium-500 leading-snug">
                                    Contenido narrativo oficial
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setSectionType('resources')}
                                className={`flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left ${
                                    sectionType === 'resources'
                                        ? 'border-blue-500 bg-blue-900/20'
                                        : 'border-titanium-700 hover:border-titanium-500 bg-titanium-800/50'
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${sectionType === 'resources' ? 'border-blue-500' : 'border-titanium-500'}`}>
                                        {sectionType === 'resources' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                    </div>
                                    <span className={`text-xs font-bold uppercase tracking-wider ${sectionType === 'resources' ? 'text-blue-400' : 'text-titanium-400'}`}>
                                        RESOURCES
                                    </span>
                                </div>
                                <span className="text-[10px] text-titanium-500 leading-snug">
                                    Referencias e inspiración
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-titanium-800/50 rounded-lg border border-titanium-700">
                        <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            sectionType === 'canon' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-blue-900/50 text-blue-400'
                        }`}>
                            {sectionLabel}
                        </div>
                        <span className="text-sm font-semibold text-white truncate">"{folderName}"</span>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Ubicación
                        </label>
                        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                            {/* Root option */}
                            <button
                                type="button"
                                onClick={() => setSelectedParentId(null)}
                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                    selectedParentId === null
                                        ? 'border-amber-500 bg-amber-900/20'
                                        : 'border-titanium-700 hover:border-titanium-500 bg-titanium-800/50'
                                }`}
                            >
                                <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedParentId === null ? 'border-amber-500' : 'border-titanium-500'}`}>
                                    {selectedParentId === null && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-titanium-200">Raíz del proyecto</div>
                                    <div className="text-[10px] text-titanium-500">
                                        Se registra en {sectionLabel} y aparece en configuración
                                    </div>
                                </div>
                            </button>

                            {/* Existing section folders */}
                            {currentPaths.map(path => (
                                <button
                                    key={path.id}
                                    type="button"
                                    onClick={() => setSelectedParentId(path.id)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                                        selectedParentId === path.id
                                            ? 'border-amber-500 bg-amber-900/20'
                                            : 'border-titanium-700 hover:border-titanium-500 bg-titanium-800/50'
                                    }`}
                                >
                                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedParentId === path.id ? 'border-amber-500' : 'border-titanium-500'}`}>
                                        {selectedParentId === path.id && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                                    </div>
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Folder size={13} className={sectionColor === 'emerald' ? 'text-emerald-500 shrink-0' : 'text-blue-500 shrink-0'} />
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-titanium-200 truncate">{path.name}</div>
                                            <div className="text-[10px] text-titanium-500">Subcarpeta dentro de {path.name}</div>
                                        </div>
                                    </div>
                                </button>
                            ))}

                            {currentPaths.length === 0 && (
                                <p className="text-xs text-titanium-500 italic text-center py-3">
                                    No hay carpetas {sectionLabel} configuradas. Se creará en la raíz.
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default NewFolderWizardModal;
