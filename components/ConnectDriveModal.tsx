import React, { useState } from 'react';
import { HardDrive, X, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface ConnectDriveModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (id: string) => void;
}

const ConnectDriveModal: React.FC<ConnectDriveModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [inputId, setInputId] = useState('');

    if (!isOpen) return null;

    // 🧠 LÓGICA DE EXTRACCIÓN INTELIGENTE
    const extractId = (text: string) => {
        // Si el usuario pega una URL completa, buscamos lo que va después de "folders/"
        const urlMatch = text.match(/folders\/([a-zA-Z0-9-_]+)/);
        if (urlMatch) return urlMatch[1];
        // Si no parece URL, asumimos que es el ID limpio
        return text.trim();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanId = extractId(inputId);

        if (cleanId) {
            onSubmit(cleanId);
            toast.success("Carpeta conectada");
            onClose();
        } else {
            toast.warning("ID o enlace inválido");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
            <div className="w-[450px] bg-[#09090b] border border-gray-800 rounded-2xl shadow-2xl p-6 relative animate-slide-up">

                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors outline-none">
                    <X size={20} />
                </button>

                <div className="flex flex-col gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-800">
                            <HardDrive size={24} className="text-gray-200" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white">Conexión Neuronal</h2>
                            <p className="text-xs text-gray-400">Enlaza tu Google Drive</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">
                                ID de la Carpeta o Enlace
                            </label>

                            <input
                                type="text"
                                autoFocus
                                value={inputId}
                                onChange={(e) => setInputId(e.target.value)}
                                placeholder="Pega el enlace o el ID aquí..."
                                className="w-full appearance-none bg-slate-800 text-white placeholder:text-gray-400 border border-slate-700 px-4 py-3 rounded-xl outline-none focus:outline-none focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT transition-all font-mono text-sm"
                                style={{ colorScheme: 'dark' }}
                            />

                            {/* Recordatorio Táctico */}
                            <div className="flex gap-2 items-start bg-gray-900/50 p-2 rounded-lg border border-gray-800">
                                <AlertTriangle size={12} className="text-yellow-500 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-gray-500 leading-tight">
                                    Asegúrate de haber compartido la carpeta con el correo del robot (Service Account) o dará error 404.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white rounded-xl text-sm font-medium transition-colors outline-none"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-3 bg-white hover:bg-gray-200 text-black rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2 outline-none shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                            >
                                <Check size={16} />
                                Conectar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ConnectDriveModal;
