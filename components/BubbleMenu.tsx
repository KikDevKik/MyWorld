import React from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Maximize2, CheckCircle, Bold, Italic, Heading1, Heading2 } from 'lucide-react';
import { Editor } from '@tiptap/react';

interface BubbleMenuProps {
    visible: boolean;
    x: number;
    y: number;
    onAction: (action: string) => void;
    editor: Editor | null;
}

const BubbleMenu: React.FC<BubbleMenuProps> = ({ visible, x, y, onAction, editor }) => {
    if (!visible || !editor) return null;

    // 🛡️ EL BLINDAJE: Usamos createPortal para teletransportarlo al BODY
    // Esto lo saca del editor y lo pone en la capa superior absoluta del navegador.
    return createPortal(
        <div
            className="fixed flex items-center gap-1 p-1 rounded-lg shadow-2xl animate-fade-in border border-titanium-700"
            style={{
                left: x,
                top: y - 10, // Un poco más arriba del cursor
                transform: 'translate(-50%, -100%)', // Centrado y hacia arriba
                zIndex: 99999, // 🚀 Z-Index Nivel Dios
                backgroundColor: '#09090b', // 🖤 Negro Titanium Sólido (Hex directo para asegurar opacidad)
                pointerEvents: 'auto',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.8)'
            }}
            onMouseDown={(e) => {
                // 🛑 ESTO ES CRÍTICO: Evita que al hacer clic en el menú se pierda la selección de texto
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            {/* --- FORMATTING SECTION --- */}

            {/* BOLD */}
            <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={`p-2 rounded-md transition-colors ${editor.isActive('bold') ? 'text-white bg-titanium-700' : 'text-titanium-300 hover:text-white hover:bg-titanium-800'}`}
                title="Negrita"
            >
                <Bold size={16} />
            </button>

            {/* ITALIC */}
            <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={`p-2 rounded-md transition-colors ${editor.isActive('italic') ? 'text-white bg-titanium-700' : 'text-titanium-300 hover:text-white hover:bg-titanium-800'}`}
                title="Cursiva"
            >
                <Italic size={16} />
            </button>

            {/* H1 */}
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={`p-2 rounded-md transition-colors ${editor.isActive('heading', { level: 1 }) ? 'text-white bg-titanium-700' : 'text-titanium-300 hover:text-white hover:bg-titanium-800'}`}
                title="Título 1"
            >
                <Heading1 size={16} />
            </button>

            {/* H2 */}
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={`p-2 rounded-md transition-colors ${editor.isActive('heading', { level: 2 }) ? 'text-white bg-titanium-700' : 'text-titanium-300 hover:text-white hover:bg-titanium-800'}`}
                title="Título 2"
            >
                <Heading2 size={16} />
            </button>

            {/* SEPARADOR */}
            <div className="w-px h-4 bg-titanium-700 mx-0.5" />

            {/* --- AI SECTION --- */}

            {/* BOTÓN MEJORAR */}
            <button
                onClick={() => onAction('mejorar')}
                className="p-2 text-titanium-300 hover:text-accent-DEFAULT hover:bg-titanium-800 rounded-md transition-colors group relative"
                title="Mejorar prosa"
            >
                <Sparkles size={16} />
            </button>

            {/* BOTÓN EXPANDIR */}
            <button
                onClick={() => onAction('expandir')}
                className="p-2 text-titanium-300 hover:text-purple-400 hover:bg-titanium-800 rounded-md transition-colors"
                title="Expandir escena"
            >
                <Maximize2 size={16} />
            </button>

            {/* BOTÓN CORREGIR */}
            <button
                onClick={() => onAction('corregir')}
                className="p-2 text-titanium-300 hover:text-green-400 hover:bg-titanium-800 rounded-md transition-colors"
                title="Corregir gramática"
            >
                <CheckCircle size={16} />
            </button>

            {/* FLECHITA DECORATIVA (Triángulo abajo) */}
            <div
                className="absolute left-1/2 bottom-[-5px] w-2.5 h-2.5 bg-[#09090b] border-r border-b border-titanium-700 transform -translate-x-1/2 rotate-45"
                style={{ zIndex: -1 }} // Detrás del menú
            />
        </div>,
        document.body // 📍 Destino del Portal
    );
};

export default BubbleMenu;