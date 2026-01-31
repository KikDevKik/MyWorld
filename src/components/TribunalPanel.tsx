import React, { useState } from 'react';
import { X, Scale, Gavel, Feather, Skull, Loader2, FileText, Type } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { callFunction } from '../services/api';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';

interface TribunalPanelProps {
    onClose: () => void;
    initialText?: string;
    currentFileId?: string | null; // 👈 New prop
    accessToken?: string | null;   // 👈 New prop
}

interface JudgeVerdict {
    verdict: string;
    critique: string;
    score: number;
}

interface TribunalResult {
    architect: JudgeVerdict;
    bard: JudgeVerdict;
    hater: JudgeVerdict;
}

const TribunalPanel: React.FC<TribunalPanelProps> = ({ onClose, initialText = '', currentFileId, accessToken }) => {
    const [text, setText] = useState(initialText);
    const [context, setContext] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<TribunalResult | null>(null);
    const [mode, setMode] = useState<'manual' | 'file'>('manual'); // 👈 New state

    const handleSummon = async () => {
        // Validation based on mode
        if (mode === 'manual' && !text.trim()) {
            toast.error("El Tribunal exige un texto para juzgar.");
            return;
        }
        if (mode === 'file' && !currentFileId) {
            toast.error("No hay ningún archivo seleccionado para juzgar.");
            return;
        }

        setIsLoading(true);

        try {
            // 🟢 Send different payload based on mode
            const payload = mode === 'manual'
                ? { text, context }
                : { fileId: currentFileId, accessToken, context, text: '' }; // Send empty text if file mode

            const verdict = await callFunction<TribunalResult>('summonTheTribunal', payload, { timeout: 540000 });
            setResult(verdict);
            toast.success("El Tribunal ha dictado sentencia.");
        } catch (error: any) {
            console.error("Error summoning tribunal:", error);
            if (!error.message?.includes('INVALID_CUSTOM_KEY')) {
                toast.error("El Tribunal está en receso (Error).");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 8) return 'text-green-400';
        if (score >= 5) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in text-titanium-100">
            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shadow-md z-10">
                <div className="flex items-center gap-3 text-red-500">
                    <Gavel size={24} />
                    <h2 className="font-bold text-xl text-titanium-100 tracking-wider">TRIBUNAL LITERARIO</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                    aria-label="Cerrar tribunal"
                >
                    <X size={24} />
                </button>
            </div>

            {/* CONTENT */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* LEFT COLUMN: INPUT */}
                <div className="flex-1 flex flex-col p-6 gap-4 border-b border-titanium-800 bg-titanium-950/50 overflow-y-auto">

                    {/* 🟢 MODE TOGGLE */}
                    <div
                        className="flex bg-titanium-900 p-1 rounded-lg border border-titanium-800"
                        role="radiogroup"
                        aria-label="Selector de modo de entrada"
                    >
                        <button
                            onClick={() => setMode('manual')}
                            role="radio"
                            aria-checked={mode === 'manual'}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'manual'
                                    ? 'bg-titanium-800 text-white shadow-sm'
                                    : 'text-titanium-400 hover:text-titanium-200'
                                }`}
                        >
                            <Type size={16} />
                            Texto Manual
                        </button>
                        <button
                            onClick={() => setMode('file')}
                            role="radio"
                            aria-checked={mode === 'file'}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${mode === 'file'
                                    ? 'bg-titanium-800 text-white shadow-sm'
                                    : 'text-titanium-400 hover:text-titanium-200'
                                }`}
                        >
                            <FileText size={16} />
                            Archivo Actual
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                        <label className="text-xs font-bold text-titanium-400 uppercase tracking-widest">
                            {mode === 'manual' ? 'Texto a Juzgar' : 'Documento Seleccionado'}
                        </label>

                        {mode === 'manual' ? (
                            <textarea
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder="Pega aquí tu escena, capítulo o fragmento..."
                                className="flex-1 bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
                                aria-label="Texto a juzgar"
                            />
                        ) : (
                            <div className="flex-1 bg-titanium-900 border border-titanium-700 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-4">
                                {currentFileId ? (
                                    <>
                                        <div className="w-16 h-16 bg-titanium-800 rounded-full flex items-center justify-center text-green-500 animate-pulse">
                                            <FileText size={32} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-titanium-100">Documento Vinculado</h3>
                                            <p className="text-titanium-400 text-xs mt-1 font-mono">{currentFileId}</p>
                                        </div>
                                        <p className="text-sm text-titanium-300 max-w-xs">
                                            El Tribunal leerá directamente este archivo desde Google Drive. Esto puede tardar unos segundos más.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 bg-titanium-800 rounded-full flex items-center justify-center text-red-500">
                                            <X size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-titanium-100">No hay archivo</h3>
                                        <p className="text-sm text-titanium-400">
                                            Abre un documento desde la barra lateral para analizarlo.
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="h-32 flex flex-col gap-2">
                        <label className="text-xs font-bold text-titanium-400 uppercase tracking-widest">Contexto (Opcional)</label>
                        <textarea
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="¿Qué está pasando? ¿Quiénes son los personajes? (Ayuda a los jueces a entender)"
                            aria-label="Contexto adicional para el tribunal"
                            className="flex-1 bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none text-sm"
                        />
                    </div>

                    <button
                        onClick={handleSummon}
                        disabled={isLoading || (mode === 'manual' && !text.trim()) || (mode === 'file' && !currentFileId)}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-900/20 hover:shadow-red-900/40 transform hover:-translate-y-0.5"
                    >
                        {isLoading ? <Loader2 className="animate-spin" /> : <Gavel size={20} />}
                        <span className="tracking-widest">
                            {isLoading ? 'DELIBERANDO...' : 'INVOCAR AL TRIBUNAL'}
                        </span>
                    </button>
                </div>

                {/* RIGHT COLUMN: VERDICTS */}
                <div className="flex-1 p-6 overflow-y-auto bg-titanium-900/30" aria-live="polite">
                    {!result ? (
                        <div className="h-full flex flex-col items-center justify-center text-titanium-600 opacity-50">
                            <Scale size={64} className="mb-4" />
                            <p className="text-lg font-medium">El estrado está vacío.</p>
                            <p className="text-sm">Presenta tu evidencia para recibir juicio.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">

                            {/* THE ARCHITECT */}
                            <div className="bg-titanium-900 border border-titanium-700 rounded-xl p-6 shadow-lg relative overflow-hidden group hover:border-blue-500/30 transition-colors">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Scale size={100} />
                                </div>
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-900/20 rounded-lg text-blue-400">
                                            <Scale size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-blue-100">El Arquitecto</h3>
                                            <p className="text-xs text-blue-400 uppercase tracking-wider">Lógica y Estructura</p>
                                        </div>
                                    </div>
                                    <div className={`text-2xl font-black ${getScoreColor(result.architect.score)}`}>
                                        {result.architect.score}/10
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <div className="font-bold text-titanium-100 mb-2 italic">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {`"${result.architect.verdict}"`}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="text-titanium-300 text-sm leading-relaxed">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {result.architect.critique}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                            {/* THE BARD */}
                            <div className="bg-titanium-900 border border-titanium-700 rounded-xl p-6 shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-colors">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Feather size={100} />
                                </div>
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-900/20 rounded-lg text-purple-400">
                                            <Feather size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-purple-100">El Bardo</h3>
                                            <p className="text-xs text-purple-400 uppercase tracking-wider">Estética y Emoción</p>
                                        </div>
                                    </div>
                                    <div className={`text-2xl font-black ${getScoreColor(result.bard.score)}`}>
                                        {result.bard.score}/10
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <div className="font-bold text-titanium-100 mb-2 italic">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {`"${result.bard.verdict}"`}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="text-titanium-300 text-sm leading-relaxed">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {result.bard.critique}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                            {/* THE HATER */}
                            <div className="bg-titanium-900 border border-titanium-700 rounded-xl p-6 shadow-lg relative overflow-hidden group hover:border-red-500/30 transition-colors">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Skull size={100} />
                                </div>
                                <div className="flex items-center justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-red-900/20 rounded-lg text-red-500">
                                            <Skull size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-red-100">El Hater</h3>
                                            <p className="text-xs text-red-400 uppercase tracking-wider">Mercado y Cinismo</p>
                                        </div>
                                    </div>
                                    <div className={`text-2xl font-black ${getScoreColor(result.hater.score)}`}>
                                        {result.hater.score}/10
                                    </div>
                                </div>
                                <div className="relative z-10">
                                    <div className="font-bold text-titanium-100 mb-2 italic">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {`"${result.hater.verdict}"`}
                                        </ReactMarkdown>
                                    </div>
                                    <div className="text-titanium-300 text-sm leading-relaxed">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-invert prose-sm max-w-none">
                                            {result.hater.critique}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TribunalPanel;
