import React from 'react';
import { Type, Monitor, Maximize, Minimize, AlignJustify, AlignCenter } from 'lucide-react';

interface ReadingToolbarProps {
    fontFamily: 'serif' | 'sans';
    setFontFamily: (font: 'serif' | 'sans') => void;
    editorWidth: 'narrow' | 'wide';
    setEditorWidth: (width: 'narrow' | 'wide') => void;
    isZenMode: boolean;
    setIsZenMode: (isZen: boolean) => void;
}

const ReadingToolbar: React.FC<ReadingToolbarProps> = ({
    fontFamily,
    setFontFamily,
    editorWidth,
    setEditorWidth,
    isZenMode,
    setIsZenMode
}) => {
    return (
        <div className={`
            flex items-center gap-2 p-1 bg-titanium-900/80 backdrop-blur-md border border-titanium-700/50 rounded-full shadow-lg
            transition-all duration-300
            ${isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}
        `}>
            {/* FONT TOGGLE */}
            <div className="flex items-center bg-titanium-950/50 rounded-full p-0.5 border border-titanium-800">
                <button
                    onClick={() => setFontFamily('serif')}
                    className={`p-2 rounded-full transition-all ${fontFamily === 'serif' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Serif (Novela)"
                >
                    <span className="font-serif font-bold text-xs">Ag</span>
                </button>
                <button
                    onClick={() => setFontFamily('sans')}
                    className={`p-2 rounded-full transition-all ${fontFamily === 'sans' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Sans (Digital)"
                >
                    <span className="font-sans font-bold text-xs">Ag</span>
                </button>
            </div>

            <div className="w-px h-4 bg-titanium-700/50" />

            {/* WIDTH TOGGLE */}
            <div className="flex items-center bg-titanium-950/50 rounded-full p-0.5 border border-titanium-800">
                <button
                    onClick={() => setEditorWidth('narrow')}
                    className={`p-2 rounded-full transition-all ${editorWidth === 'narrow' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Ancho Libro"
                >
                    <AlignCenter size={14} />
                </button>
                <button
                    onClick={() => setEditorWidth('wide')}
                    className={`p-2 rounded-full transition-all ${editorWidth === 'wide' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Ancho Pantalla"
                >
                    <AlignJustify size={14} />
                </button>
            </div>

            <div className="w-px h-4 bg-titanium-700/50" />

            {/* ZEN MODE */}
            <button
                onClick={() => setIsZenMode(!isZenMode)}
                className={`
                    p-2 rounded-full transition-all border border-transparent
                    ${isZenMode
                        ? 'bg-emerald-900/30 text-emerald-400 border-emerald-900/50 hover:bg-emerald-900/50'
                        : 'text-titanium-400 hover:text-white hover:bg-titanium-800'}
                `}
                title={isZenMode ? "Salir del Modo Zen" : "Entrar en Modo Zen"}
            >
                {isZenMode ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
        </div>
    );
};

export default ReadingToolbar;
