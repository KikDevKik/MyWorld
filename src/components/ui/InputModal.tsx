import React, { useState, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface InputModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (value: string) => void;
    title: string;
    placeholder?: string;
    initialValue?: string;
    confirmText?: string;
    cancelText?: string;
}

const InputModal: React.FC<InputModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    placeholder = '',
    initialValue = '',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar'
}) => {
    const [value, setValue] = useState(initialValue);
    const [isShaking, setIsShaking] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setValue(initialValue);
            // Focus input on open
            setTimeout(() => {
                inputRef.current?.focus();
            }, 50);
        }
    }, [isOpen, initialValue]);

    // Handle Escape Key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!value.trim()) {
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            return;
        }
        onConfirm(value);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        aria-hidden="true"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                            x: isShaking ? [0, -10, 10, -10, 10, 0] : 0
                        }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ duration: 0.2, x: { duration: 0.4 } }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-md bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl overflow-hidden"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="input-modal-title"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-950/50">
                            <h3 id="input-modal-title" className="text-sm font-bold text-titanium-100 uppercase tracking-wider">
                                {title}
                            </h3>
                            <button
                                onClick={onClose}
                                className="text-titanium-500 hover:text-white transition-colors p-1 hover:bg-titanium-800 rounded-lg"
                                aria-label="Cerrar"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Body */}
                        <form onSubmit={handleSubmit} className="p-6">
                            <input
                                ref={inputRef}
                                type="text"
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                placeholder={placeholder}
                                className={`w-full bg-titanium-950 border rounded-lg px-4 py-3 text-sm text-titanium-100 placeholder-titanium-600 focus:outline-none focus:ring-1 transition-all mb-6 ${
                                    isShaking
                                        ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/20'
                                        : 'border-titanium-700 focus:border-cyan-500 focus:ring-cyan-500/50'
                                }`}
                                aria-label={title}
                            />

                            <div className="flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-xs font-bold text-titanium-400 hover:text-white hover:bg-titanium-800 rounded-lg transition-colors"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    type="submit"
                                    // Removed disabled state to allow clicking and triggering shake
                                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-cyan-900/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Check size={14} />
                                    {confirmText}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default InputModal;
