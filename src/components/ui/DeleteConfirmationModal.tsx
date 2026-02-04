import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface DeleteConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    count: number;
    isDeleting: boolean;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm, count, isDeleting }) => {
    const [step, setStep] = useState(1);
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];

    // Reset step when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            setStep(1);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleFirstConfirm = () => {
        setStep(2);
    };

    const handleFinalConfirm = async () => {
        await onConfirm();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-red-900/10">
                    <h2 className="text-lg font-bold text-titanium-100 flex items-center gap-2">
                        <Trash2 className="text-red-500" size={18} />
                        {step === 1 ? t.common.confirmDeleteStep1 : t.common.confirmDeleteTitle}
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="text-titanium-400 hover:text-white transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {step === 1 ? (
                        <>
                            <div className="flex flex-col items-center text-center gap-3">
                                <div className="p-3 bg-red-900/20 rounded-full text-red-500">
                                    <Trash2 size={32} />
                                </div>
                                <h3 className="text-titanium-100 font-semibold text-base">
                                    ¿Estás seguro de eliminar {count} elemento{count !== 1 ? 's' : ''}?
                                </h3>
                                <p className="text-titanium-400 text-sm leading-relaxed">
                                    Los archivos seleccionados serán movidos a la <strong>Papelera de Google Drive</strong>. Podrás recuperarlos desde allí si es necesario.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-2 text-sm font-medium text-titanium-300 hover:bg-titanium-800 rounded-lg transition-colors border border-transparent hover:border-titanium-700"
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={handleFirstConfirm}
                                    className="flex-1 py-2 bg-titanium-800 hover:bg-red-900/30 text-red-400 hover:text-red-300 border border-titanium-700 hover:border-red-500/50 rounded-lg text-sm font-bold transition-all"
                                >
                                    {t.common.yesDelete}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex flex-col items-center text-center gap-3">
                                <div className="p-3 bg-yellow-900/20 rounded-full text-yellow-500 animate-pulse">
                                    <AlertTriangle size={32} />
                                </div>
                                <h3 className="text-titanium-100 font-semibold text-base">
                                    {t.common.securityConfirmation}
                                </h3>
                                <p className="text-titanium-400 text-sm leading-relaxed">
                                    Esta acción eliminará {count} elemento{count !== 1 ? 's' : ''} de la vista del proyecto. Confirma nuevamente para proceder.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                                <button
                                    onClick={onClose}
                                    disabled={isDeleting}
                                    className="flex-1 py-2 text-sm font-medium text-titanium-300 hover:bg-titanium-800 rounded-lg transition-colors border border-transparent hover:border-titanium-700 disabled:opacity-50"
                                >
                                    {t.common.cancel}
                                </button>
                                <button
                                    onClick={handleFinalConfirm}
                                    disabled={isDeleting}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-500 text-white border border-red-400 hover:border-red-300 rounded-lg text-sm font-bold transition-all shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            {t.common.deleting}
                                        </>
                                    ) : (
                                        t.common.confirmDelete
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeleteConfirmationModal;
