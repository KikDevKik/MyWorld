import { createPortal } from 'react-dom';
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
    closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    className = '',
    closeOnBackdropClick = true
}) => {
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
            // 🎨 PALETTE: Auto-focus modal content for accessibility
            contentRef.current?.focus();
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Nov 2026: en un portal (abierto desde el cajón de documentos quedaba encerrado en él) y con el estilo de la app.
    return createPortal(
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-titanium-950/60 backdrop-blur-[2px] animate-in fade-in duration-200"
            onClick={closeOnBackdropClick ? onClose : undefined}
        >
            <div
                ref={contentRef}
                tabIndex={-1} // 🎨 PALETTE: Make focusable
                onClick={(e) => e.stopPropagation()} // 🎨 PALETTE: Prevent closing when clicking inside
                className={`
                    w-full max-w-2xl bg-titanium-900 border border-titanium-700 rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.55)]
                    flex flex-col max-h-[85dvh] overscroll-contain animate-in zoom-in-95 duration-200 focus:outline-none
                    ${className}
                `}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-titanium-800">
                    <h2 id="modal-title" className="font-serif text-lg text-titanium-50 flex items-center gap-2">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-titanium-400 hover:text-titanium-100 transition-colors p-1.5 rounded-lg hover:bg-titanium-800"
                        aria-label="Cerrar"
                    >
                        <X size={20} aria-hidden="true" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar text-titanium-200">
                    {children}
                </div>

                {/* Footer (Optional) */}
                {footer && (
                    <div className="px-5 py-4 border-t border-titanium-800 flex justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
