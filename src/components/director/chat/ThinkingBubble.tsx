import React, { useState } from 'react';
import { BrainCircuit, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';

interface ThinkingBubbleProps {
    thought: string | null;
}

export const ThinkingBubble: React.FC<ThinkingBubbleProps> = ({ thought }) => {
    const [isOpen, setIsOpen] = useState(false);

    if (!thought) return null;

    return (
        <div className="mb-3 max-w-[90%] animate-in fade-in slide-in-from-top-2 duration-300">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
                    group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all w-full text-left
                    ${isOpen
                        ? 'bg-titanium-900/80 text-emerald-400 border border-titanium-800'
                        : 'bg-titanium-950/50 text-titanium-500 hover:text-emerald-400 hover:bg-titanium-900 border border-transparent hover:border-titanium-800'}
                `}
                title="Ver proceso de pensamiento de la IA"
            >
                <div className={`
                    p-1 rounded-md transition-colors
                    ${isOpen ? 'bg-emerald-900/20 text-emerald-400' : 'bg-titanium-900 text-titanium-600 group-hover:text-emerald-400'}
                `}>
                    <BrainCircuit size={14} />
                </div>

                <span className="flex-1 truncate opacity-90 group-hover:opacity-100">
                    {isOpen ? 'Pensamiento del Director' : 'Analizando contexto...'}
                </span>

                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {isOpen && (
                <div className="mt-2 pl-2 border-l-2 border-emerald-900/30 ml-3 animate-in slide-in-from-top-1 duration-200">
                    <div className="bg-titanium-950/80 p-3 rounded-r-lg rounded-bl-lg text-xs font-mono text-titanium-400 whitespace-pre-wrap leading-relaxed border border-titanium-800/50 shadow-inner max-h-60 overflow-y-auto custom-scrollbar">
                        {thought}
                    </div>
                </div>
            )}
        </div>
    );
};
