import React from 'react';
import { AlertTriangle, X, ShieldAlert, Sparkles } from 'lucide-react';

interface ReadinessModalProps {
    isOpen: boolean;
    warningMessage: string;
    missingElements: string[];
    isCrystallizing: boolean;
    onClose: () => void;
    onForce: () => void;
}

const ReadinessModal: React.FC<ReadinessModalProps> = ({
    isOpen,
    warningMessage,
    missingElements,
    isCrystallizing,
    onClose,
    onForce,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0f0f11] border border-amber-500/40 rounded-2xl shadow-[0_0_40px_rgba(245,158,11,0.15)] overflow-hidden animate-in slide-in-from-bottom-4 duration-300">

                {/* Header */}
                <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-500/20 bg-amber-950/20">
                    <ShieldAlert size={20} className="text-amber-400 shrink-0" />
                    <h2 className="text-amber-300 font-semibold font-mono tracking-wide flex-1">
                        El Guardián ha detectado pilares faltantes
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-titanium-600 hover:text-titanium-300 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">

                    {/* Warning message */}
                    <p className="text-titanium-300 text-[15px] leading-relaxed">
                        {warningMessage}
                    </p>

                    {/* Missing elements list */}
                    {missingElements.length > 0 && (
                        <div className="bg-amber-950/20 border border-amber-500/20 rounded-xl px-4 py-3 flex flex-col gap-2">
                            <p className="text-amber-400/70 text-xs font-mono uppercase tracking-wider mb-1">
                                Pilares sin definir:
                            </p>
                            {missingElements.map((el, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                                    <span className="text-amber-200/80 text-sm">{el}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-6 pb-5">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 rounded-xl border border-titanium-700/50 text-titanium-400 text-sm font-medium hover:bg-titanium-800/30 transition-colors"
                    >
                        Volver al Interrogatorio
                    </button>
                    <button
                        onClick={onForce}
                        disabled={isCrystallizing}
                        className="flex-1 py-2.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-sm font-medium hover:bg-red-950/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isCrystallizing ? (
                            <>
                                <span className="w-3.5 h-3.5 rounded-full border-2 border-red-400/40 border-t-red-400 animate-spin" />
                                Cristalizando...
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} />
                                Forzar Cristalización
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReadinessModal;
