import React from 'react';
import { FilePlus } from 'lucide-react';

interface EmptyEditorStateProps {
    onCreate: () => void;
}

const EmptyEditorState: React.FC<EmptyEditorStateProps> = ({ onCreate }) => {
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

            <button
                onClick={onCreate}
                className="group flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-titanium-800 to-titanium-700 hover:from-titanium-700 hover:to-titanium-600 border border-titanium-600 rounded-lg text-titanium-100 font-medium transition-all shadow-lg hover:shadow-cyan-900/20 active:scale-95"
            >
                <FilePlus size={18} className="text-cyan-500 group-hover:scale-110 transition-transform" />
                <span>Crear Nuevo Archivo</span>
            </button>
        </div>
    );
};

export default EmptyEditorState;
