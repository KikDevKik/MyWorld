import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Loader2, Send, Wand2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from '../../contexts/ProjectConfigContext';
import { callFunction } from '../../services/api';
import { useLanguageStore } from '../../stores/useLanguageStore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { remarkThinking } from '../../utils/remarkThinking';

const REMARK_PLUGINS = [remarkGfm, remarkBreaks, remarkThinking];

interface IdeaGenesisModalProps {
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

function deriveIdeaName(messages: Message[]): string {
    const firstUser = messages.find(m => m.role === 'user');
    if (!firstUser) return 'nueva-idea';
    return firstUser.message
        .slice(0, 48)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9áéíóúüñ\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+$/, '') || 'nueva-idea';
}

const IdeaGenesisModal: React.FC<IdeaGenesisModalProps> = ({
    isOpen, onClose, folderId, accessToken, onRefreshTokens
}) => {
    const { user } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();

    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isCrystallizing, setIsCrystallizing] = useState(false);
    const [isReadyToCrystallize, setIsReadyToCrystallize] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const greeting = currentLanguage === 'es'
        ? '¿Qué idea quieres explorar hoy? Puede ser una escena, un personaje, una sensación, una pregunta sin respuesta... cuéntame.'
        : "What idea do you want to explore today? It can be a scene, a character, a feeling, an unanswered question... tell me.";

    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{ role: 'model', message: greeting }]);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setMessages([]);
            setInputValue('');
            setIsReadyToCrystallize(false);
        }
    }, [isOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    if (!isOpen) return null;

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return;

        const currentInput = inputValue.trim();
        const userMsg: Message = { role: 'user', message: currentInput };
        const newHistory = [...messages, userMsg];
        setMessages(newHistory);
        setInputValue('');
        setIsLoading(true);

        try {
            const lang = currentLanguage === 'es' ? 'español' : 'English';
            const systemInstruction = `
Eres un asistente creativo que ayuda a desarrollar ideas narrativas.
OBJETIVO: Ayuda al usuario a explorar y enriquecer su idea de forma conversacional.

COMPORTAMIENTO:
- Haz preguntas que profundicen: sensaciones, motivaciones, conflictos, imágenes.
- Propón conexiones inesperadas cuando sean relevantes.
- Mantén respuestas breves y conversacionales (máx. 2 párrafos cortos).
- No estructures la historia todavía; solo explora la semilla.
- Idioma: responde siempre en ${lang}.

Cuando la idea esté bien desarrollada, añade exactamente "[IDEA_LISTA]" al final de tu respuesta.
`.trim();

            const data = await callFunction<any>('chatWithGem', {
                query: currentInput,
                history: newHistory.slice(0, -1),
                systemInstruction,
                accessToken,
                isFallbackContext: true,
            });

            if (data.response) {
                let text: string = data.response;
                if (text.includes('[IDEA_LISTA]')) {
                    setIsReadyToCrystallize(true);
                    text = text.replace('[IDEA_LISTA]', '').trim();
                }
                setMessages(prev => [...prev, { role: 'model', message: text }]);
            }
        } catch (err) {
            console.error('IdeaGenesis chat error:', err);
            toast.error('Error de conexión. Inténtalo de nuevo.');
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

    const handleCrystallize = async () => {
        if (isCrystallizing) return;
        setIsCrystallizing(true);
        toast.info('Cristalizando idea...');

        const freshToken = await onRefreshTokens();
        const tokenToUse = freshToken || accessToken;

        if (!tokenToUse) {
            toast.error('Sesión expirada. Vuelve a iniciar sesión.');
            setIsCrystallizing(false);
            return;
        }

        const ideaName = deriveIdeaName(messages);
        const chatHistoryText = messages
            .map(m => `${m.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${m.message}`)
            .join('\n\n');

        try {
            await callFunction('scribeCreateFile', {
                entityId: ideaName,
                entityData: {
                    name: ideaName.replace(/-/g, ' '),
                    type: 'concept',
                    tags: ['idea', 'laboratorio'],
                },
                chatContent: chatHistoryText,
                folderId,
                accessToken: tokenToUse,
                synthesize: true,
            });

            toast.success(currentLanguage === 'es' ? '¡Idea cristalizada en Recursos!' : 'Idea crystallized in Resources!');
            onClose();
        } catch (err: any) {
            console.error('IdeaGenesis crystallize error:', err);
            toast.error('Error al cristalizar: ' + err.message);
        } finally {
            setIsCrystallizing(false);
        }
    };

    const userTurns = messages.filter(m => m.role === 'user').length;
    const showCrystallize = userTurns >= 2 || isReadyToCrystallize;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-2xl bg-titanium-950 border border-titanium-700 rounded-2xl shadow-2xl flex flex-col h-[600px] overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 flex items-center gap-2">
                            <FlaskConical size={20} className="text-emerald-400" />
                            {currentLanguage === 'es' ? 'Nueva Idea' : 'New Idea'}
                        </h2>
                        <p className="text-xs text-titanium-400 mt-1">
                            {currentLanguage === 'es'
                                ? 'Explora la idea, luego cristalízala como recurso'
                                : 'Explore the idea, then crystallize it as a resource'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                {/* Chat Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[82%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-titanium-800 text-titanium-100 border border-titanium-700'
                                    : 'bg-gradient-to-br from-emerald-950/30 to-teal-950/20 text-emerald-100 border border-emerald-900/30'
                            }`}>
                                {msg.role === 'model' && <Sparkles size={13} className="mb-2 text-emerald-400 opacity-60" />}
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown
                                        remarkPlugins={REMARK_PLUGINS}
                                        components={{
                                            details: ({ node, ...props }) => <details {...props} />,
                                            summary: ({ node, ...props }) => <summary {...props} />,
                                        }}
                                    >
                                        {msg.message}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-titanium-900/50 rounded-2xl px-4 py-3 flex items-center gap-2 border border-titanium-800">
                                <Loader2 size={14} className="animate-spin text-emerald-500" />
                                <span className="text-xs text-titanium-500">Pensando...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Footer */}
                <div className="p-4 bg-titanium-900 border-t border-titanium-800 space-y-3">

                    {showCrystallize && (
                        <div className="flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <button
                                onClick={handleCrystallize}
                                disabled={isCrystallizing || isLoading}
                                className={`
                                    group relative flex items-center gap-3 px-8 py-2.5
                                    text-white font-bold rounded-full shadow-lg transition-all
                                    active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed
                                    ${isReadyToCrystallize
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 shadow-emerald-900/30 animate-pulse'
                                        : 'bg-gradient-to-r from-emerald-700 to-teal-600 hover:from-emerald-600 hover:to-teal-500'
                                    }
                                `}
                            >
                                {isCrystallizing ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        <span>Cristalizando...</span>
                                    </>
                                ) : (
                                    <>
                                        <Wand2 size={16} className="transition-transform group-hover:rotate-12" />
                                        <span>{currentLanguage === 'es' ? 'Cristalizar Idea' : 'Crystallize Idea'}</span>
                                    </>
                                )}
                                {isReadyToCrystallize && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                                )}
                            </button>
                        </div>
                    )}

                    <div className="relative">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={currentLanguage === 'es' ? 'Explora tu idea...' : 'Explore your idea...'}
                            className="w-full pl-5 pr-12 py-4 bg-titanium-950 border border-titanium-700 rounded-xl text-titanium-200 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all shadow-inner resize-none min-h-[56px] max-h-[200px]"
                            autoFocus
                            disabled={isCrystallizing}
                            rows={1}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={!inputValue.trim() || isCrystallizing || isLoading}
                            className="absolute right-3 bottom-3 p-2 bg-titanium-800 hover:bg-emerald-600 text-titanium-400 hover:text-white rounded-lg transition-all disabled:opacity-0"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IdeaGenesisModal;
