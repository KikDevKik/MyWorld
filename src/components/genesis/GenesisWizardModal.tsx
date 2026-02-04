import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, Send, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { CreativeAuditService } from '../../services/CreativeAuditService';
import { callFunction } from '../../services/api';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface GenesisWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    accessToken: string | null;
    onRefreshTokens: () => Promise<string | null>;
}

interface Message {
    role: 'user' | 'model'; // 'model' matches Gemini API, we map to 'system'/'assistant' logically
    message: string;
}

const GenesisWizardModal: React.FC<GenesisWizardModalProps> = ({ isOpen, onClose, accessToken, onRefreshTokens }) => {
    const { user, config } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].genesis;

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isMaterializing, setIsMaterializing] = useState(false);
    const [isReadyToMaterialize, setIsReadyToMaterialize] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Initial Greeting
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                { role: 'model', message: t.initialMessage }
            ]);
        }
    }, [isOpen, t.initialMessage]);

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
                return <strong key={index} className="font-bold text-cyan-200">{part.slice(2, -2)}</strong>;
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

        // 🟢 AUDIT: Log User Injection
        const projectId = config?.folderId || "genesis_session";
        if (user && projectId) {
            CreativeAuditService.logCreativeEvent({
                projectId,
                userId: user.uid,
                component: 'GenesisWizard',
                actionType: 'INJECTION',
                description: 'User Socratic Input',
                payload: {
                    content: currentInput,
                    step: newHistory.length
                }
            });
        }

        try {
            // Map current language code to full English name for the prompt
            const languageNameMap: Record<string, string> = {
                es: "Spanish",
                en: "English",
                jp: "Japanese",
                ko: "Korean",
                zh: "Chinese"
            };
            const targetLangName = languageNameMap[currentLanguage] || "English";

            // Construct specific system prompt for this context
            const systemInstruction = `
                You are a Socratic Architect (El Arquitecto Socrático).
                GOAL: Guide the user to define the Protagonist, the Setting (Location), and the Inciting Incident (Chapter 1 concept).
                STRATEGY:
                - Ask ONE or TWO focused questions at a time.
                - Do not write the story.
                - Be concise, mysterious, and encouraging.
                - Language: ALWAYS respond in ${targetLangName}.

                PROTOCOL:
                - If you have gathered enough information (Protagonist, Setting, Inciting Incident), append exactly "[GENESIS_READY]" at the very end of your response.
                - Otherwise, just ask the next question.
            `;

            const data = await callFunction<any>('chatWithGem', {
                query: userMsg.message,
                history: newHistory.slice(0, -1), // Send previous history
                systemInstruction: systemInstruction,
                accessToken: accessToken, // Pass token just in case (though not strictly needed for chat)
                isFallbackContext: true // Treat as isolated context
            });

            if (data.response) {
                let responseText = data.response;
                let readyDetected = false;

                // 1. Check for explicit tag
                if (responseText.includes('[GENESIS_READY]')) {
                    readyDetected = true;
                    responseText = responseText.replace('[GENESIS_READY]', '').trim();
                }

                // 2. Check for semantic phrases (Backup mechanism)
                // "The simulation is ready to begin", "La simulación está lista", etc.
                const readyPatterns = [
                    /simulation is ready/i,
                    /ready to begin/i,
                    /ready to materialize/i,
                    /simulaci[óo]n est[áa] lista/i,
                    /listo para comenzar/i,
                    /listo para materializar/i
                ];

                if (!readyDetected && readyPatterns.some(pattern => pattern.test(responseText))) {
                    readyDetected = true;
                }

                if (readyDetected) {
                    setIsReadyToMaterialize(true);
                }

                setMessages(prev => [...prev, { role: 'model', message: responseText }]);
            }

        } catch (error) {
            console.error("Genesis Chat Error:", error);
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

    const handleMaterialize = async () => {
        if (isMaterializing) return;
        setIsMaterializing(true);
        toast.info(t.materializeStart);

        // 🟢 1. REFRESH TOKEN (CRITICAL)
        // Ensure we have a fresh token for Drive operations
        const freshToken = await onRefreshTokens();
        const tokenToUse = freshToken || accessToken;

        if (!tokenToUse) {
            toast.error(t.errorSession);
            setIsMaterializing(false);
            return;
        }

        // 🟢 AUDIT: Log Final Materialization
        const projectId = config?.folderId || "genesis_session";
        if (user && projectId) {
            CreativeAuditService.logCreativeEvent({
                projectId,
                userId: user.uid,
                component: 'GenesisWizard',
                actionType: 'STRUCTURE',
                description: 'Genesis Materialization Triggered',
                payload: {
                    messageCount: messages.length,
                    readySignal: isReadyToMaterialize
                }
            });
        }

        try {
            const data = await callFunction<any>('genesisManifest', {
                chatHistory: messages,
                accessToken: tokenToUse // Use Fresh Token
            });

            if (data.success) {
                toast.success(data.message || t.success);
                onClose();
                setTimeout(() => window.location.reload(), 1500);
            }

        } catch (error: any) {
            console.error("Genesis Materialize Error:", error);
            toast.error(t.errorMaterialize + error.message);
        } finally {
            setIsMaterializing(false);
        }
    };

    // Show Materialize button if we have at least 3 turns (User + Model pairs)
    // OR if the AI has explicitly signaled it is ready.
    const hasMinInteractions = messages.filter(m => m.role === 'user').length >= 3;
    const showMaterialize = hasMinInteractions || isReadyToMaterialize;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-titanium-950 border border-titanium-700 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 flex items-center gap-2">
                            <Sparkles size={20} className="text-cyan-400" />
                            {t.title}
                        </h2>
                        <p className="text-xs text-titanium-400 mt-1">{t.subtitle}</p>
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
                                {formatMessage(msg.message)}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="bg-titanium-900/50 rounded-2xl px-4 py-3 flex items-center gap-2 border border-titanium-800">
                                <Loader2 size={14} className="animate-spin text-cyan-500" />
                                <span className="text-xs text-titanium-500">{t.thinking}</span>
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
                                className={`
                                    group relative flex items-center gap-3 px-8 py-3
                                    text-white font-bold rounded-full shadow-lg transition-all
                                    active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                                    ${isReadyToMaterialize
                                        ? 'bg-gradient-to-r from-purple-500 to-cyan-400 hover:from-purple-400 hover:to-cyan-300 shadow-cyan-500/50 animate-pulse'
                                        : 'bg-gradient-to-r from-titanium-700 to-titanium-600 hover:from-purple-600 hover:to-cyan-600'
                                    }
                                `}
                            >
                                {isMaterializing ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        {t.materializing}
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={18} className={`transition-transform ${isReadyToMaterialize ? 'group-hover:rotate-12' : ''}`} />
                                        <span>{t.materializeButton}</span>
                                    </>
                                )}
                                {isReadyToMaterialize && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
                                )}
                            </button>
                        </div>
                    )}

                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={t.placeholder}
                            className="w-full pl-5 pr-12 py-4 bg-titanium-950 border border-titanium-700 rounded-xl text-titanium-200 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50 transition-all shadow-inner resize-none min-h-[56px] max-h-[200px]"
                            autoFocus
                            disabled={isMaterializing || isLoading}
                            rows={1}
                        />
                        <button
                            onClick={() => handleSendMessage()}
                            disabled={!inputValue.trim() || isMaterializing || isLoading}
                            className="absolute right-3 bottom-3 p-2 bg-titanium-800 hover:bg-cyan-600 text-titanium-400 hover:text-white rounded-lg transition-all disabled:opacity-0"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default GenesisWizardModal;
