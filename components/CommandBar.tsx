import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, ArrowUp, Clapperboard, ShieldCheck } from 'lucide-react';
import { GemId } from '../types';

// Interfaz de props para comunicarse con App.tsx
interface CommandBarProps {
    onExecute: (message: string, tool: GemId) => void;
}

const CommandBar: React.FC<CommandBarProps> = ({ onExecute }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    // Usamos los IDs en minúscula para que coincidan con GemId
    const [selectedTool, setSelectedTool] = useState<GemId>('director');
    const [inputValue, setInputValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const newHeight = Math.min(textareaRef.current.scrollHeight, 200);
            textareaRef.current.style.height = `${newHeight}px`;
        }
    }, [inputValue]);

    // 🎹 SHORTCUT GLOBAL: Ctrl+K para enfocar
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                textareaRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    const handleSend = () => {
        if (!inputValue.trim()) return;

        // 🔥 DISPARO: Enviamos el texto y la herramienta seleccionada hacia arriba
        onExecute(inputValue, selectedTool);

        setInputValue(''); // Limpiamos cargador
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // Función auxiliar para cambiar herramienta y cerrar menú
    const selectTool = (tool: GemId) => {
        setSelectedTool(tool);
        setIsMenuOpen(false);
    };

    return (
        <div className="absolute bottom-12 left-0 right-0 mx-auto w-[600px] max-w-[90%] z-40 animate-slide-up-centered">

            {/* MENÚ FLOTANTE */}
            {isMenuOpen && (
                <div className="absolute bottom-full left-0 mb-3 bg-titanium-800 border border-titanium-700 rounded-xl shadow-2xl p-1 flex flex-col gap-1 w-52 animate-fade-in backdrop-blur-md">
                    <button
                        onClick={() => selectTool('director')}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-titanium-700 rounded-lg text-xs text-titanium-300 hover:text-titanium-100 text-left transition-colors group outline-none"
                    >
                        <Clapperboard size={16} className="text-titanium-500 group-hover:text-accent-DEFAULT transition-colors" />
                        <span className="font-medium tracking-wide">Director de Escena</span>
                    </button>
                    <button
                        onClick={() => selectTool('guardian')}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-titanium-700 rounded-lg text-xs text-titanium-300 hover:text-titanium-100 text-left transition-colors group outline-none"
                    >
                        <ShieldCheck size={16} className="text-titanium-500 group-hover:text-accent-DEFAULT transition-colors" />
                        <span className="font-medium tracking-wide">Guardián (Local)</span>
                    </button>
                </div>
            )}

            {/* BARRA PRINCIPAL */}
            <div className="relative flex items-end bg-titanium-950/90 backdrop-blur-xl border border-titanium-700/50 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] transition-colors focus-within:border-titanium-500 focus-within:ring-0 outline-none group overflow-hidden">

                <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="h-[56px] pl-4 pr-3 text-titanium-400 hover:text-titanium-200 transition-colors border-r border-titanium-800/50 flex items-center gap-2 outline-none focus:outline-none shrink-0"
                >
                    <div className="flex items-center gap-2 animate-fade-in">
                        {selectedTool === 'director' ? <Clapperboard size={18} className="text-accent-DEFAULT" /> : <ShieldCheck size={18} className="text-accent-DEFAULT" />}
                        <span className="text-xs font-bold uppercase tracking-widest text-titanium-200 hidden sm:block">
                            {selectedTool === 'director' ? 'Director' : 'Guardián'}
                        </span>
                    </div>
                </button>

                <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Instrucciones para el ${selectedTool === 'director' ? 'Director' : 'Guardián'}...`}
                    className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-titanium-100 placeholder:text-titanium-600 px-4 py-4 text-sm font-sans tracking-wide resize-none overflow-y-auto max-h-[200px] min-h-[56px] whitespace-pre-wrap break-words"
                    rows={1}
                    spellCheck={false}
                />

                <div className="h-[56px] flex items-center shrink-0">
                    <button
                        onClick={handleSend}
                        className="mr-2 p-2 bg-titanium-800/50 hover:bg-titanium-700 text-titanium-400 hover:text-titanium-100 rounded-xl transition-all border border-transparent hover:border-titanium-600 outline-none focus:outline-none"
                    >
                        <ArrowUp size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommandBar;