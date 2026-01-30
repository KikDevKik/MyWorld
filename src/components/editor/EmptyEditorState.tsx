import React from 'react';
import { FilePlus, Sparkles } from 'lucide-react';

interface EmptyEditorStateProps {
    onCreate: () => void;
    onGenesis?: () => void;
}

const EmptyEditorState: React.FC<EmptyEditorStateProps> = ({ onCreate, onGenesis }) => {
    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-titanium-950/50 text-titanium-400 p-8">
            <div className="mb-6 p-6 bg-titanium-900/50 rounded-full border border-titanium-800 shadow-xl shadow-black/20">
                <FilePlus size={48} className="text-titanium-500" />
            </div>

            <h2 className="text-xl font-bold text-titanium-200 mb-2 tracking-wide">
                Espacio de Trabajo Vacío
            </h2>

            <p className="text-sm text-titanium-500 max-w-md text-center mb-8 leading-relaxed">
                No veo que hayas seleccionado un archivo. ¿Te gustaría comenzar a escribir algo nuevo?
            </p>

            <div className="flex flex-col gap-3 w-full max-w-xs">
                {/* Standard Creation */}
                <button
                    onClick={onCreate}
                    className="group w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-titanium-800 to-titanium-700 hover:from-titanium-700 hover:to-titanium-600 border border-titanium-600 rounded-lg text-titanium-100 font-medium transition-all shadow-lg hover:shadow-cyan-900/20 active:scale-95"
                >
                    <FilePlus size={18} className="text-cyan-500 group-hover:scale-110 transition-transform" />
                    <span>Crear Nuevo Archivo</span>
                </button>

                {/* Genesis Protocol Trigger */}
                {onGenesis && (
                    <button
                        onClick={onGenesis}
                        className="group w-full flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-purple-900/20 to-cyan-900/20 hover:from-purple-900/40 hover:to-cyan-900/40 border border-titanium-700 hover:border-purple-500/50 rounded-lg text-purple-200 hover:text-white font-medium transition-all shadow-lg hover:shadow-purple-900/20 active:scale-95"
                    >
                        <Sparkles size={18} className="text-purple-400 group-hover:text-cyan-300 group-hover:rotate-12 transition-all" />
                        <span>¿Tienes una Chispa?</span>
                    </button>
                )}
            </div>
        </div>
    );
};

export default EmptyEditorState;
