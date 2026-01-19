import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    className?: string;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    className = ''
}) => {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={`
                    w-full max-w-2xl bg-titanium-900 border border-titanium-500 rounded-lg shadow-2xl
                    flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200
                    ${className}
                `}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-950/50 rounded-t-lg">
                    <h2 id="modal-title" className="text-lg font-bold text-titanium-100 uppercase tracking-wide">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-titanium-400 hover:text-white transition-colors p-1 rounded hover:bg-titanium-800"
                        aria-label="Close"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar text-titanium-200">
                    {children}
                </div>

                {/* Footer (Optional) */}
                {footer && (
                    <div className="p-4 border-t border-titanium-800 bg-titanium-950/30 rounded-b-lg flex justify-end gap-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
