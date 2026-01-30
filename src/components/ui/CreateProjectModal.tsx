import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string) => Promise<void>;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [projectName, setProjectName] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!projectName.trim()) return;

        setIsLoading(true);
        try {
            await onSubmit(projectName);
            onClose();
        } catch (error) {
            console.error("Error creating project:", error);
            // Error handling is expected to be done by the parent (toast)
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-800/30">
                    <h2 className="text-lg font-bold text-titanium-100 flex items-center gap-2">
                        <Sparkles className="text-cyan-500" size={18} />
                        Nuevo Universo
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-titanium-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="projectName" className="text-xs font-semibold text-titanium-400 uppercase tracking-wider">
                            Nombre del Proyecto
                        </label>
                        <input
                            id="projectName"
                            type="text"
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            placeholder="Ej. Crónicas de la Eternidad"
                            className="w-full px-4 py-3 bg-titanium-950 border border-titanium-700 rounded-lg text-titanium-100 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition-all"
                            autoFocus
                            disabled={isLoading}
                        />
                        <p className="text-[11px] text-titanium-500 leading-relaxed">
                            Crearemos automáticamente una estructura de carpetas optimizada (Canon, Personajes, Manuscrito) en tu Google Drive.
                        </p>
                    </div>

                    <div className="pt-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="px-4 py-2 text-sm font-medium text-titanium-400 hover:text-titanium-200 hover:bg-titanium-800/50 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={!projectName.trim() || isLoading}
                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-sm font-bold rounded-lg shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    Creando...
                                </>
                            ) : (
                                "Crear Universo"
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;
