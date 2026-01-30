import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, Send, Wand2, MessageSquare } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';

interface GenesisWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessToken: string | null;
}

interface Message {
    role: 'user' | 'model'; // 'model' matches Gemini API, we map to 'system'/'assistant' logically
    message: string;
}

const GenesisWizardModal: React.FC<GenesisWizardModalProps> = ({ isOpen, onClose, accessToken }) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial Greeting
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                { role: 'model', message: "Veo una chispa en ti. Cuéntame, ¿qué idea tienes en mente? ¿Quién es el protagonista o en qué mundo sucede?" }
            ]);
        }
    }, [isOpen]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!isOpen) return null;

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMsg: Message = { role: 'user', message: inputValue };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputValue('');
        setIsLoading(true);

        try {
            const functions = getFunctions();
            const chatWithGem = httpsCallable(functions, 'chatWithGem');

            // Construct specific system prompt for this context
            const systemInstruction = `
                You are a Socratic Architect (El Arquitecto Socrático).
                GOAL: Guide the user to define the Protagonist, the Setting (Location), and the Inciting Incident (Chapter 1 concept).
                STRATEGY:
                - Ask ONE or TWO focused questions at a time.
                - Do not write the story.
                - Be concise, mysterious, and encouraging.
                - Language: Detect user's language (Spanish/English) and reply in the same.
            `;

            const result = await chatWithGem({
                query: userMsg.message,
                history: newHistory.slice(0, -1), // Send previous history
                systemInstruction: systemInstruction,
                accessToken: accessToken, // Pass token just in case (though not strictly needed for chat)
                isFallbackContext: true // Treat as isolated context
            });

            const data = result.data as any;
            if (data.response) {
                setMessages(prev => [...prev, { role: 'model', message: data.response }]);
            }

        } catch (error) {
            console.error("Genesis Chat Error:", error);
            toast.error("Error conectando con el Arquitecto.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleMaterialize = async () => {
        if (isMaterializing) return;
        setIsMaterializing(true);
        toast.info("Iniciando el Big Bang...");

        try {
            const functions = getFunctions();
            const genesisManifest = httpsCallable(functions, 'genesisManifest');

            const result = await genesisManifest({
                chatHistory: messages,
                accessToken: accessToken
            });

            const data = result.data as any;

            if (data.success) {
                toast.success(data.message || "¡Mundo Materializado!");
                onClose();
                // Optionally trigger a file tree refresh?
                // The backend updates TDB_Index, and VaultSidebar listens to it if configured,
                // but a page reload or explicit refresh might be needed to see files in FileTree immediately if it's not real-time.
                // VaultSidebar uses onSnapshot for TDB_Index/files, so it should handle it?
                // Actually VaultSidebar listens to "files" collection if "isSecurityReady".
                // Wait, VaultSidebar logic for fileTree is complex.
                // Let's assume the user will see them or refresh.

                // Force reload to be safe/simple as per user preference for "Create Project"
                setTimeout(() => window.location.reload(), 1500);
            }

        } catch (error: any) {
            console.error("Genesis Materialize Error:", error);
            toast.error("Error al materializar: " + error.message);
        } finally {
            setIsMaterializing(false);
        }
    };

    // Show Materialize button if we have at least 3 turns (User + Model pairs)
    // 3 user messages means we likely have Protagonist, Setting, Incident info.
    const showMaterialize = messages.filter(m => m.role === 'user').length >= 2;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-titanium-950 border border-titanium-700 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 flex items-center gap-2">
                            <Sparkles size={20} className="text-cyan-400" />
                            Protocolo Génesis
                        </h2>
                        <p className="text-xs text-titanium-400 mt-1">El Arquitecto Socrático</p>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-titanium-800 text-titanium-100 border border-titanium-700'
                                    : 'bg-gradient-to-br from-cyan-950/30 to-purple-950/20 text-cyan-100 border border-cyan-900/30'
                            }`}>
                                {msg.role === 'model' && <Wand2 size={14} className="mb-2 text-cyan-500 opacity-70" />}
                                {msg.message}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="bg-titanium-900/50 rounded-2xl px-4 py-3 flex items-center gap-2 border border-titanium-800">
                                <Loader2 size={14} className="animate-spin text-cyan-500" />
                                <span className="text-xs text-titanium-500">El Arquitecto está pensando...</span>
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer / Input */}
                <div className="p-4 bg-titanium-900 border-t border-titanium-800 space-y-4">

                    {/* Materialize Action */}
                    {showMaterialize && (
                        <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <button
                                onClick={handleMaterialize}
                                disabled={isMaterializing || isLoading}
                                className="group relative flex items-center gap-3 px-8 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold rounded-full shadow-lg shadow-purple-900/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isMaterializing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Materializando...
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={18} className="group-hover:rotate-12 transition-transform" />
                                        <span>Materializar Mundo</span>
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    <form onSubmit={handleSendMessage} className="relative">
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Responde al Arquitecto..."
                            className="w-full pl-5 pr-12 py-4 bg-titanium-950 border border-titanium-700 rounded-xl text-titanium-200 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all shadow-inner"
                            autoFocus
                            disabled={isMaterializing || isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || isMaterializing || isLoading}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-titanium-800 hover:bg-cyan-600 text-titanium-400 hover:text-white rounded-lg transition-all disabled:opacity-0"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
};

export default GenesisWizardModal;
