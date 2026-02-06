import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, Send, Wand2, Lightbulb } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { CreativeAuditService } from '../../services/CreativeAuditService';
import { callFunction } from '../../services/api';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import InputModal from '../ui/InputModal';

interface IdeaWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
    onRefreshTokens: () => Promise<string | null>;
}

interface Message {
    role: 'user' | 'model';
    message: string;
}

const IdeaWizardModal: React.FC<IdeaWizardModalProps> = ({ isOpen, onClose, folderId, accessToken, onRefreshTokens }) => {
    const { user, config } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].genesis; // Reuse Genesis translations for common UI

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);

    // Idea Wizard Specific State
    const [ideaName, setIdeaName] = useState<string | null>(null);
    const [isNameModalOpen, setIsNameModalOpen] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initial Greeting - The Muse
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            const initialGreeting = currentLanguage === 'es'
                ? "Soy tu Musa. ¿Qué chispa de idea tienes hoy? Puede ser una escena, un objeto, o simplemente una sensación..."
                : "I am your Muse. What spark of an idea do you have today? It can be a scene, an object, or just a feeling...";

            setMessages([
                { role: 'model', message: initialGreeting }
            ]);
        }
    }, [isOpen, currentLanguage]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    if (!isOpen) return null;

    const formatMessage = (text: string) => {
        const parts = text.split(/(\*\*[^*]+\*\*)/g);
        return parts.map((part, index) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={index} className="font-bold text-emerald-200">{part.slice(2, -2)}</strong>;
            }
            return part;
        });
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const currentInput = inputValue;
        const userMsg: Message = { role: 'user', message: currentInput };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputValue('');
        setIsLoading(true);

        try {
            const systemInstruction = `
                You are "The Muse" (La Musa).
                GOAL: Help the user explore a vague idea or inspiration for their story.
                CONTEXT: The user is in the "Idea Laboratory".

                BEHAVIOR:
                - Be curious, playful, and inspiring.
                - Ask sensory questions ("What does it smell like?", "How does the light hit it?").
                - Ask emotional questions ("Why does this matter to the protagonist?", "What is the hidden fear here?").
                - Do NOT try to structure a full story yet. Just explore the "Idea".
                - Keep responses short and conversational (1 paragraph max).
                - Language: Respond in the user's language (${currentLanguage}).

                If the user seems satisfied or the idea feels solid, ask: "Shall we crystallize this idea now?"
            `;

            const data = await callFunction<any>('chatWithGem', {
                query: userMsg.message,
                history: newHistory.slice(0, -1),
                systemInstruction: systemInstruction,
                accessToken: accessToken,
                isFallbackContext: true
            });

            if (data.response) {
                setMessages(prev => [...prev, { role: 'model', message: data.response }]);
            }

        } catch (error) {
            console.error("Muse Chat Error:", error);
            toast.error(t.errorConnection);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const handleMaterializeClick = async () => {
        setIsNameModalOpen(true);
    };

    const performMaterialization = async (name: string) => {
        setIdeaName(name);
        if (isMaterializing) return;
        setIsMaterializing(true);
        toast.info(t.materializeStart);

        const freshToken = await onRefreshTokens();
        const tokenToUse = freshToken || accessToken;

        if (!tokenToUse) {
            toast.error(t.errorSession);
            setIsMaterializing(false);
            return;
        }

        // Gather full context
        const chatHistoryText = messages.map(m => `${m.role.toUpperCase()}: ${m.message}`).join('\n\n');

        try {
            await callFunction('scribeCreateFile', {
                entityId: name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                entityData: {
                    name: name,
                    type: 'concept',
                    tags: ['idea', 'laboratory']
                },
                chatContent: chatHistoryText,
                folderId: folderId,
                accessToken: tokenToUse,
                synthesize: true // 🟢 ENABLE AI SYNTHESIS
            });

            toast.success(currentLanguage === 'es' ? "¡Idea Cristalizada!" : "Idea Crystallized!");
            onClose();
            // No reload needed thanks to updateFirestoreTree!

        } catch (error: any) {
            console.error("Idea Materialize Error:", error);
            toast.error(t.errorMaterialize + error.message);
        } finally {
            setIsMaterializing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-titanium-950 border border-titanium-700 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center gap-2">
                            <Lightbulb size={20} className="text-emerald-400" />
                            {currentLanguage === 'es' ? "Laboratorio de Ideas" : "Idea Laboratory"}
                        </h2>
                        <p className="text-xs text-titanium-400 mt-1">
                            {currentLanguage === 'es' ? "Conversa con la Musa" : "Chat with the Muse"}
                        </p>
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
                                    : 'bg-gradient-to-br from-emerald-950/30 to-teal-950/20 text-emerald-100 border border-emerald-900/30'
                            }`}>
                                {msg.role === 'model' && <Sparkles size={14} className="mb-2 text-emerald-500 opacity-70" />}
                                {formatMessage(msg.message)}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="bg-titanium-900/50 rounded-2xl px-4 py-3 flex items-center gap-2 border border-titanium-800">
                                <Loader2 size={14} className="animate-spin text-emerald-500" />
                                <span className="text-xs text-titanium-500">{t.thinking}</span>
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer / Input */}
                <div className="p-4 bg-titanium-900 border-t border-titanium-800 space-y-4">

                    {/* Materialize Action - Always visible to allow early exit */}
                    <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <button
                            onClick={handleMaterializeClick}
                            disabled={isMaterializing || isLoading}
                            className={`
                                group relative flex items-center gap-3 px-8 py-3
                                text-white font-bold rounded-full shadow-lg transition-all
                                active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                                bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-900/20
                            `}
                        >
                            {isMaterializing ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    {t.materializing}
                                </>
                            ) : (
                                <>
                                    <Wand2 size={18} className="transition-transform group-hover:rotate-12" />
                                    <span>{currentLanguage === 'es' ? "Cristalizar Idea" : "Crystallize Idea"}</span>
                                </>
                            )}
                        </button>
                    </div>

                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={currentLanguage === 'es' ? "Explora tu idea..." : "Explore your idea..."}
                            className="w-full pl-5 pr-12 py-4 bg-titanium-950 border border-titanium-700 rounded-xl text-titanium-200 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all shadow-inner resize-none min-h-[56px] max-h-[200px]"
                            autoFocus
                            disabled={isMaterializing || isLoading}
                            rows={1}
                        />
                        <button
                            onClick={() => handleSendMessage()}
                            disabled={!inputValue.trim() || isMaterializing || isLoading}
                            className="absolute right-3 bottom-3 p-2 bg-titanium-800 hover:bg-emerald-600 text-titanium-400 hover:text-white rounded-lg transition-all disabled:opacity-0"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>

            </div>

            <InputModal
                isOpen={isNameModalOpen}
                onClose={() => setIsNameModalOpen(false)}
                onConfirm={performMaterialization}
                title={currentLanguage === 'es' ? "Cristalizar Idea" : "Crystallize Idea"}
                placeholder={currentLanguage === 'es' ? "Nombre de la Idea..." : "Idea Name..."}
                confirmText={currentLanguage === 'es' ? "Materializar" : "Materialize"}
                cancelText={currentLanguage === 'es' ? "Cancelar" : "Cancel"}
            />
        </div>
    );
};

export default IdeaWizardModal;
