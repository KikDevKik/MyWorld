import React, { useState, useRef } from 'react';
import { Send, Paperclip, X, FileText, Lightbulb } from 'lucide-react';

interface Props {
    onConfirm: (goal: string, file?: {
        fileName: string;
        fileData: string;
        mimeType: string;
    }) => void;
    isLoading: boolean;
}

const SUGGESTION_CHIPS = [
    { label: 'Trazar el camino siguiente', value: 'No tengo claro cómo continuar mi obra. Ayúdame a definir el siguiente paso concreto.' },
    { label: 'Revisar consistencia', value: 'Quiero revisar si hay inconsistencias en mi worldbuilding y sistemas actuales.' },
    { label: 'Desarrollar personajes', value: 'Mis personajes necesitan motivaciones y arcos más claros.' },
    { label: 'Desbloquear el Acto 2', value: 'Estoy atascado en la mitad de mi historia y no sé cómo avanzar.' },
    { label: 'Auditoría de sistema de magia', value: 'Quiero revisar si mi sistema de magia tiene lagunas lógicas.' },
    { label: 'Integrar cultura real', value: 'Quiero inspirarme en una cultura real para enriquecer mi obra.' },
];

const FILTER_CAMERA_TIP = '💡 Si un elemento no aparecerá constantemente en tu obra y es solo un acabado visual o una mención ocasional, no lo desarrolles en profundidad. Primero lo esencial.';

export default function IntentionModal({ onConfirm, isLoading }: Props) {
    const [goal, setGoal] = useState('');
    const [attachedFile, setAttachedFile] = useState<{
        fileName: string;
        fileData: string;
        mimeType: string;
    } | null>(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileAttach = async (file: File) => {
        const allowedTypes = ['application/pdf', 'text/markdown', 'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
            alert('Solo se aceptan archivos PDF, MD o DOCX como referencia cultural.');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            alert('El archivo no debe superar 15MB.');
            return;
        }

        setIsProcessingFile(true);
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            setAttachedFile({
                fileName: file.name,
                fileData: base64,
                mimeType: file.type || 'text/plain'
            });
        } catch (e) {
            alert('Error al procesar el archivo.');
        } finally {
            setIsProcessingFile(false);
        }
    };

    const handleConfirm = () => {
        const finalGoal = goal.trim() || 'Análisis general del proyecto';
        onConfirm(finalGoal, attachedFile || undefined);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (goal.trim() || attachedFile) handleConfirm();
        }
    };

    return (
        <div className="flex flex-col items-center justify-center h-full px-6 py-8 max-w-[680px] mx-auto">
            
            {/* Header */}
            <div className="text-center mb-8">
                <h2 className="text-xl font-medium text-titanium-100 mb-2">
                    ¿Qué necesitas resolver hoy?
                </h2>
                <p className="text-sm text-titanium-500">
                    El Arquitecto analizará tu proyecto con ese objetivo en mente.
                </p>
            </div>

            {/* Chips de sugerencia */}
            <div className="flex flex-wrap gap-2 mb-6 justify-center">
                {SUGGESTION_CHIPS.map(chip => (
                    <button
                        key={chip.label}
                        onClick={() => setGoal(chip.value)}
                        className={`px-3 py-1.5 text-[12px] rounded-full border transition-all ${
                            goal === chip.value
                                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                                : 'bg-titanium-900/50 border-titanium-700 text-titanium-400 hover:border-titanium-500 hover:text-titanium-300'
                        }`}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Campo de texto */}
            <div className="w-full bg-titanium-950 border border-titanium-700 rounded-xl overflow-hidden mb-4 focus-within:border-cyan-500/50 transition-colors">
                <textarea
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe qué quieres lograr en esta sesión... (o elige una sugerencia arriba)"
                    className="w-full bg-transparent text-[14px] text-titanium-200 placeholder-titanium-600 px-4 pt-4 pb-2 resize-none focus:outline-none min-h-[80px] max-h-[160px]"
                    disabled={isLoading}
                />

                {/* Footer del textarea */}
                <div className="flex items-center justify-between px-3 pb-3">
                    
                    {/* Archivo adjunto */}
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.md,.txt,.docx"
                            className="hidden"
                            onChange={e => e.target.files?.[0] && handleFileAttach(e.target.files[0])}
                        />
                        {attachedFile ? (
                            <div className="flex items-center gap-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg px-2 py-1">
                                <FileText size={11} className="text-cyan-400" />
                                <span className="text-[11px] text-cyan-400 max-w-[140px] truncate">
                                    {attachedFile.fileName}
                                </span>
                                <button
                                    onClick={() => setAttachedFile(null)}
                                    className="text-titanium-500 hover:text-red-400 ml-1"
                                >
                                    <X size={11} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading || isProcessingFile}
                                className="flex items-center gap-1.5 text-titanium-500 hover:text-titanium-300 transition-colors text-[12px] disabled:opacity-40"
                                title="Adjuntar documento de referencia cultural (PDF, MD, DOCX)"
                            >
                                <Paperclip size={14} />
                                <span>Adjuntar referencia cultural</span>
                            </button>
                        )}
                    </div>

                    {/* Botón de envío */}
                    <button
                        onClick={handleConfirm}
                        disabled={isLoading || isProcessingFile}
                        className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[13px] font-medium rounded-lg hover:bg-cyan-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-3 h-3 rounded-full border border-cyan-400 border-t-transparent animate-spin" />
                                Analizando...
                            </>
                        ) : (
                            <>
                                <Send size={13} />
                                Iniciar sesión
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Tip del Filtro de Cámara */}
            <div className="w-full flex items-start gap-2 bg-titanium-900/30 border border-titanium-800/50 rounded-lg px-4 py-3">
                <Lightbulb size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-titanium-500 leading-relaxed">
                    {FILTER_CAMERA_TIP}
                </p>
            </div>
        </div>
    );
}