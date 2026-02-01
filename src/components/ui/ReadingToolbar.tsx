import React from 'react';
import { Type, Monitor, Maximize, Minimize, AlignJustify, AlignCenter, Play, Pause, Loader2 } from 'lucide-react';

interface ReadingToolbarProps {
    fontFamily: 'serif' | 'sans';
    setFontFamily: (font: 'serif' | 'sans') => void;
    editorWidth: 'narrow' | 'wide';
    setEditorWidth: (width: 'narrow' | 'wide') => void;
    isZenMode: boolean;
    setIsZenMode: (isZen: boolean) => void;

    // 🟢 NARRATOR CONTROLS
    narratorControls?: {
        isPlaying: boolean;
        onPlayPause: () => void;
        isLoading: boolean;
    };
}

const ReadingToolbar: React.FC<ReadingToolbarProps> = ({
    fontFamily,
    setFontFamily,
    editorWidth,
    setEditorWidth,
    isZenMode,
    setIsZenMode,
    narratorControls
}) => {
    return (
        <div className={`
            flex items-center gap-2 p-1 bg-titanium-900/80 backdrop-blur-md border border-titanium-700/50 rounded-full shadow-lg
            transition-all duration-300
            ${isZenMode ? 'opacity-0 hover:opacity-100' : 'opacity-100'}
        `}>
            {/* 🟢 NARRATOR TOGGLE */}
            {narratorControls && (
                <>
                    <button
                        onClick={narratorControls.onPlayPause}
                        disabled={narratorControls.isLoading}
                        className={`
                            p-2 rounded-full transition-all border border-transparent flex items-center justify-center
                            ${narratorControls.isPlaying
                                ? 'bg-cyan-900/30 text-cyan-400 border-cyan-900/50 hover:bg-cyan-900/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]'
                                : 'text-titanium-400 hover:text-cyan-400 hover:bg-titanium-800'}
                        `}
                        title={narratorControls.isPlaying ? "Pausar Narración" : "Iniciar Narración (IA)"}
                    >
                        {narratorControls.isLoading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : narratorControls.isPlaying ? (
                            <Pause size={14} fill="currentColor" />
                        ) : (
                            <Play size={14} fill="currentColor" />
                        )}
                    </button>
                    <div className="w-px h-4 bg-titanium-700/50" />
                </>
            )}

            {/* FONT TOGGLE */}
            <div
                className="flex items-center bg-titanium-950/50 rounded-full p-0.5 border border-titanium-800"
                role="radiogroup"
                aria-label="Selección de fuente"
            >
                <button
                    role="radio"
                    aria-checked={fontFamily === 'serif'}
                    onClick={() => setFontFamily('serif')}
                    className={`p-2 rounded-full transition-all ${fontFamily === 'serif' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Serif (Novela)"
                    aria-label="Fuente Serif (Novela)"
                >
                    <span className="font-serif font-bold text-xs">Ag</span>
                </button>
                <button
                    role="radio"
                    aria-checked={fontFamily === 'sans'}
                    onClick={() => setFontFamily('sans')}
                    className={`p-2 rounded-full transition-all ${fontFamily === 'sans' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Sans (Digital)"
                    aria-label="Fuente Sans (Digital)"
                >
                    <span className="font-sans font-bold text-xs">Ag</span>
                </button>
            </div>

            <div className="w-px h-4 bg-titanium-700/50" />

            {/* WIDTH TOGGLE */}
            <div
                className="flex items-center bg-titanium-950/50 rounded-full p-0.5 border border-titanium-800"
                role="radiogroup"
                aria-label="Ancho del editor"
            >
                <button
                    role="radio"
                    aria-checked={editorWidth === 'narrow'}
                    onClick={() => setEditorWidth('narrow')}
                    className={`p-2 rounded-full transition-all ${editorWidth === 'narrow' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Ancho Libro"
                    aria-label="Ancho de texto: Libro"
                >
                    <AlignCenter size={14} />
                </button>
                <button
                    role="radio"
                    aria-checked={editorWidth === 'wide'}
                    onClick={() => setEditorWidth('wide')}
                    className={`p-2 rounded-full transition-all ${editorWidth === 'wide' ? 'bg-titanium-700 text-white shadow-sm' : 'text-titanium-500 hover:text-titanium-300'}`}
                    title="Ancho Pantalla"
                    aria-label="Ancho de texto: Pantalla"
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
                aria-label={isZenMode ? "Salir del Modo Zen" : "Entrar en Modo Zen"}
            >
                {isZenMode ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
        </div>
    );
};

export default ReadingToolbar;
