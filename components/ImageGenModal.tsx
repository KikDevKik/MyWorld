import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { getFunctions, httpsCallable } from "firebase/functions";
import { X, Sparkles, Image as ImageIcon, Download, Copy, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { ASPECT_RATIOS } from '../constants';
import type { AspectRatio } from '../types';

interface ImageGenModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessToken: string | null;
}

const ImageGenModal: React.FC<ImageGenModalProps> = ({ isOpen, onClose, accessToken }) => {
    const [prompt, setPrompt] = useState('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [isLoading, setIsLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!prompt) return;

        setIsLoading(true);
        setGeneratedImage(null);

        try {
            const functions = getFunctions();
            const generateImage = httpsCallable(functions, 'generateImage');

            const result = await generateImage({
                prompt,
                aspectRatio,
                accessToken
            });

            const data = result.data as { image: string };
            setGeneratedImage(`data:image/png;base64,${data.image}`);

        } catch (err: any) {
            console.error("Error generando imagen:", err);
            toast.error(`Error al generar imagen: ${err.message || 'Error desconocido'}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in">
            <div className="w-[900px] h-[600px] bg-[#09090b] border border-gray-800 rounded-2xl shadow-2xl flex overflow-hidden animate-slide-up relative">

                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors z-10">
                    <X size={20} />
                </button>

                {/* PANEL IZQUIERDO: CONTROLES */}
                <div className="w-1/3 border-r border-gray-800 p-6 flex flex-col gap-6 bg-gray-900/30">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Sparkles size={18} className="text-purple-400" />
                            <h2 className="text-lg font-bold text-white">Forja Visual</h2>
                        </div>
                        <p className="text-xs text-gray-500">Materializa tus ideas con Imagen 3</p>
                    </div>

                    <div className="flex-1 flex flex-col gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Prompt</label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="Describe tu visión..."
                                className="w-full h-32 bg-black border border-gray-700 rounded-xl p-3 text-sm text-gray-200 placeholder:text-gray-700 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none resize-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Formato</label>
                            <div className="grid grid-cols-3 gap-2">
                                {Object.entries(ASPECT_RATIOS).map(([ratio, label]) => (
                                    <button
                                        key={ratio}
                                        onClick={() => setAspectRatio(ratio as AspectRatio)}
                                        className={`
                                            px-2 py-2 rounded-lg text-xs font-medium border transition-all
                                            ${aspectRatio === ratio
                                                ? 'bg-purple-900/20 border-purple-500 text-purple-300'
                                                : 'bg-black border-gray-800 text-gray-500 hover:border-gray-600'}
                                        `}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || !prompt}
                        className={`
                            w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all
                            ${isLoading || !prompt
                                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                                : 'bg-white text-black hover:bg-gray-200 shadow-[0_0_15px_rgba(255,255,255,0.1)]'}
                        `}
                    >
                        {isLoading ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                Forjando...
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                Generar
                            </>
                        )}
                    </button>
                </div>

                {/* PANEL DERECHO: RESULTADO */}
                <div className="flex-1 bg-black flex items-center justify-center relative p-8">
                    {generatedImage ? (
                        <div className="relative group w-full h-full flex items-center justify-center">
                            <img
                                src={generatedImage}
                                alt="Generado"
                                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                            />
                            <div className="absolute bottom-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="p-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors">
                                    <Download size={18} />
                                </button>
                                <button className="p-2 bg-black/50 backdrop-blur-md border border-white/10 rounded-lg text-white hover:bg-white/20 transition-colors">
                                    <Copy size={18} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-gray-800 flex flex-col items-center gap-4">
                            <div className="w-20 h-20 rounded-full bg-gray-900/50 flex items-center justify-center border border-gray-800">
                                <ImageIcon size={32} className="opacity-50" />
                            </div>
                            <p className="text-sm font-medium">El lienzo está vacío</p>
                        </div>
                    )}
                </div>

            </div>
        </div>,
        document.body
    );
};

export default ImageGenModal;