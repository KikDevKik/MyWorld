import React from 'react';
import { X } from 'lucide-react';

interface SlideUpPanelProps {
    isOpen: boolean;
    title: string;
    icon: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * SlideUpPanel — Drawer inferior reutilizable.
 * Sube suavemente sobre el chat cuando isOpen === true.
 * z-50 garantiza que queda sobre el chat (z-20) y la toolbar (z-20).
 */
const SlideUpPanel: React.FC<SlideUpPanelProps> = ({ isOpen, title, icon, onClose, children }) => {
    return (
        <>
            {/* Backdrop blur cuando está abierto (HERMANO, NO HIJO) */}
            <div
                className={`
                    absolute inset-0 z-40
                    bg-black/40 backdrop-blur-sm
                    transition-opacity duration-500
                    ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Contenedor deslizable */}
            <div
                className={`
                    absolute bottom-0 left-0 w-full z-50
                    transition-all duration-300 overflow-hidden
                    ${isOpen ? 'max-h-[90vh] opacity-100 pointer-events-auto' : 'max-h-0 opacity-0 pointer-events-none'}
                `}
                aria-hidden={!isOpen}
            >
                {/* Panel principal */}
                <div className="relative bg-[#0f0f11] border-t border-titanium-800 rounded-t-2xl shadow-2xl flex flex-col pointer-events-auto" style={{ height: '460px' }}>

                    {/* Handle visual */}
                    <div className="flex justify-center pt-3 pb-1 shrink-0">
                        <div className="w-10 h-1 rounded-full bg-titanium-700" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-3 border-b border-titanium-800/60 shrink-0">
                        <div className="flex items-center gap-2.5 text-titanium-300">
                            <span className="text-cyan-500">{icon}</span>
                            <h2 className="text-sm font-semibold uppercase tracking-widest font-mono">{title}</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-7 h-7 flex items-center justify-center rounded-full text-titanium-500 hover:text-titanium-300 hover:bg-titanium-800/50 transition-colors"
                            aria-label="Cerrar panel"
                        >
                            <X size={15} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
};

export default SlideUpPanel;
