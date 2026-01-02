import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Folder, Book, Clock } from 'lucide-react';
import { useProjectConfig } from './ProjectConfigContext';

interface ProjectSettingsModalProps {
    onClose: () => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ onClose }) => {
    const { config, updateConfig, loading } = useProjectConfig();

    // Local state for form handling
    const [canonPaths, setCanonPaths] = useState<string[]>([]);
    const [resourcePaths, setResourcePaths] = useState<string[]>([]);
    const [chronologyPath, setChronologyPath] = useState('');
    const [activeBookContext, setActiveBookContext] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Load initial values from context
    useEffect(() => {
        if (config) {
            setCanonPaths(config.canonPaths || []);
            setResourcePaths(config.resourcePaths || []);
            setChronologyPath(config.chronologyPath || '');
            setActiveBookContext(config.activeBookContext || '');
        }
    }, [config]);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await updateConfig({
                canonPaths,
                resourcePaths,
                chronologyPath,
                activeBookContext
            });
            onClose();
        } catch (error) {
            // Error handling is done in context
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to manage list inputs
    const addPath = (list: string[], setList: (l: string[]) => void, value: string) => {
        if (value && !list.includes(value)) {
            setList([...list, value]);
        }
    };

    const removePath = (list: string[], setList: (l: string[]) => void, index: number) => {
        const newList = [...list];
        newList.splice(index, 1);
        setList(newList);
    };

    const PathListInput: React.FC<{
        label: string;
        paths: string[];
        setPaths: (l: string[]) => void;
        placeholder: string;
        icon: React.ElementType;
    }> = ({ label, paths, setPaths, placeholder, icon: Icon }) => {
        const [inputValue, setInputValue] = useState('');

        return (
            <div className="mb-6">
                <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Icon size={14} /> {label}
                </label>
                <div className="flex gap-2 mb-3">
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={placeholder}
                        className="flex-1 bg-titanium-950 border border-titanium-700 rounded-md px-3 py-2 text-sm text-titanium-100 placeholder-titanium-600 focus:outline-none focus:border-accent-DEFAULT"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                addPath(paths, setPaths, inputValue);
                                setInputValue('');
                            }
                        }}
                    />
                    <button
                        onClick={() => {
                            addPath(paths, setPaths, inputValue);
                            setInputValue('');
                        }}
                        className="bg-titanium-700 hover:bg-titanium-600 text-titanium-100 p-2 rounded-md transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
                <div className="space-y-2">
                    {paths.map((path, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-titanium-800/50 px-3 py-2 rounded border border-titanium-700/50">
                            <span className="text-sm text-titanium-200 font-mono">{path}</span>
                            <button
                                onClick={() => removePath(paths, setPaths, idx)}
                                className="text-titanium-500 hover:text-red-400 transition-colors"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {paths.length === 0 && (
                        <div className="text-xs text-titanium-600 italic px-2">No hay rutas definidas.</div>
                    )}
                </div>
            </div>
        );
    };

    if (loading) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-titanium-900 border border-titanium-700 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-titanium-700/50 flex justify-between items-center bg-titanium-800/30">
                    <div>
                        <h2 className="text-xl font-bold text-titanium-100">Configuración del Proyecto</h2>
                        <p className="text-sm text-titanium-400 mt-1">Define la estructura semántica de tu mundo.</p>
                    </div>
                    <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-titanium-700 scrollbar-track-transparent">

                    {/* Active Book Context */}
                    <div className="mb-8">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Book size={14} /> Libro Activo
                        </label>
                        <input
                            type="text"
                            value={activeBookContext}
                            onChange={(e) => setActiveBookContext(e.target.value)}
                            className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT"
                            placeholder="Ej: Just Megu"
                        />
                        <p className="text-xs text-titanium-500 mt-2">
                            El contexto principal donde sucede la acción actual.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Canon Paths */}
                        <PathListInput
                            label="Rutas Canon (Verdad Absoluta)"
                            paths={canonPaths}
                            setPaths={setCanonPaths}
                            placeholder="Añadir carpeta (ej: MI HISTORIA)"
                            icon={Folder}
                        />

                        {/* Resource Paths */}
                        <PathListInput
                            label="Rutas de Recursos (Inspiración)"
                            paths={resourcePaths}
                            setPaths={setResourcePaths}
                            placeholder="Añadir carpeta (ej: _RESOURCES)"
                            icon={Folder}
                        />
                    </div>

                    {/* Chronology Path */}
                    <div className="mt-4">
                        <label className="text-xs font-semibold text-titanium-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Clock size={14} /> Ruta de Cronología
                        </label>
                        <input
                            type="text"
                            value={chronologyPath}
                            onChange={(e) => setChronologyPath(e.target.value)}
                            className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT"
                            placeholder="Ruta a la carpeta de línea de tiempo"
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-titanium-700/50 bg-titanium-800/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-titanium-300 hover:text-white hover:bg-titanium-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-DEFAULT text-white hover:bg-accent-hover transition-all shadow-lg shadow-accent-DEFAULT/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={16} />
                        {isSaving ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default ProjectSettingsModal;
