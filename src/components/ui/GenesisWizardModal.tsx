import React, { useState, useRef, useEffect } from 'react';
import { X, Sparkles, Send, Loader2, Zap } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface GenesisWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

interface Message {
    role: 'user' | 'model';
    text: string;
}

const GenesisWizardModal: React.FC<GenesisWizardModalProps> = ({ isOpen, onClose, folderId, accessToken }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial Greeting
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    role: 'model',
                    text: "Detecto una chispa creativa. ⚡\n\nSoy el Arquitecto Socrático. No te daré respuestas, te haré preguntas para dar forma a tu idea.\n\n¿Qué imagen, personaje o conflicto tienes en mente?"
                }
            ]);
        }
    }, [isOpen]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading || isMaterializing) return;

        const userText = input;
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setIsLoading(true);

        try {
            const functions = getFunctions();
            const chatWithGem = httpsCallable(functions, 'chatWithGem');

            const systemPrompt = `
                You are a Socratic Architect for a creative writing tool.
                GOAL: Help the user define the core pillars of their story: Protagonist, Setting, and Conflict.
                METHOD: Ask 1 (one) provocative question at a time. Dig deeper.
                TONE: Mysterious, professional, encouraging.
                LANGUAGE: Match the user's language (Spanish/English).
                CONSTRAINT: Keep responses under 50 words. Do not suggest ideas, extract them from the user.
            `;

            const historyForAi = messages.map(m => ({ role: m.role, message: m.text }));
            // Add user's latest message to history for the call (since state update is async/batched)
            // Actually, chatWithGem takes 'history' separate from 'query'.
            // So we pass previous messages as history, and current userText as query.

            const result = await chatWithGem({
                query: userText,
                systemInstruction: systemPrompt,
                history: historyForAi,
                accessToken: accessToken // Optional but good practice
            });

            const data = result.data as any;
            setMessages(prev => [...prev, { role: 'model', text: data.response }]);

        } catch (error: any) {
            console.error("Genesis Chat Error:", error);
            toast.error("Error de conexión con el Arquitecto.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMaterialize = async () => {
        if (messages.length < 3) {
            toast.error("Necesitamos profundizar más antes de materializar.");
            return;
        }

        setIsMaterializing(true);
        const toastId = toast.loading("Analizando estructura narrativa... (El Big Bang)");

        try {
            const functions = getFunctions();
            const genesisManifest = httpsCallable(functions, 'genesisManifest');

            const result = await genesisManifest({
                chatHistory: messages,
                folderId: folderId,
                accessToken: accessToken
            });

            const data = result.data as any;

            if (data.success) {
                toast.success(`¡Mundo Materializado! Se crearon ${data.files.length} archivos.`, { id: toastId });
                // Delay close to let user see success
                setTimeout(() => {
                    onClose();
                    window.location.reload(); // Refresh to show new files
                }, 1500);
            } else {
                throw new Error("La materialización falló sin error explícito.");
            }

        } catch (error: any) {
            console.error("Genesis Manifest Error:", error);
            toast.error(`Error al crear el mundo: ${error.message}`, { id: toastId });
            setIsMaterializing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-titanium-950 border border-titanium-700 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col h-[80vh] overflow-hidden relative">

                {/* Header */}
                <div className="p-4 border-b border-titanium-800 flex items-center justify-between bg-gradient-to-r from-titanium-900 to-titanium-950">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <Sparkles className="text-amber-400" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-titanium-100 tracking-wide">Protocolo Génesis</h2>
                            <p className="text-[10px] text-titanium-400 uppercase tracking-widest font-mono">Modo: Interrogatorio Socrático</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-titanium-700">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div
                                className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed shadow-md ${
                                    msg.role === 'user'
                                    ? 'bg-titanium-800 text-titanium-100 rounded-br-none border border-titanium-700'
                                    : 'bg-titanium-900 text-amber-50 rounded-bl-none border border-amber-500/20 shadow-amber-900/10'
                                }`}
                            >
                                <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-titanium-900 rounded-2xl px-4 py-3 border border-titanium-800">
                                <Loader2 size={16} className="animate-spin text-titanium-500" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer / Input */}
                <div className="p-4 border-t border-titanium-800 bg-titanium-900">
                    <div className="flex flex-col gap-3">
                        <div className="relative flex items-end gap-2">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSendMessage();
                                    }
                                }}
                                placeholder="Describe tu idea..."
                                disabled={isLoading || isMaterializing}
                                className="w-full bg-titanium-950 text-titanium-100 border border-titanium-700 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:border-amber-500/50 transition-all resize-none h-[50px] max-h-[120px]"
                                autoFocus
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!input.trim() || isLoading || isMaterializing}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-titanium-400 hover:text-amber-400 disabled:opacity-30 transition-colors"
                            >
                                <Send size={18} />
                            </button>
                        </div>

                        {/* Action Bar */}
                        <div className="flex justify-between items-center pt-2">
                            <span className="text-[10px] text-titanium-500">
                                {messages.length > 2 ? "Suficiente información recopilada." : "Continúa la conversación..."}
                            </span>

                            <button
                                onClick={handleMaterialize}
                                disabled={messages.length < 3 || isLoading || isMaterializing}
                                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-lg ${
                                    messages.length >= 3
                                    ? 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-amber-900/20'
                                    : 'bg-titanium-800 text-titanium-600 cursor-not-allowed'
                                }`}
                            >
                                {isMaterializing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                {isMaterializing ? 'Forjando Realidad...' : 'Materializar Mundo'}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default GenesisWizardModal;
