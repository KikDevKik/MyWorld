import React, { useState, useEffect, useRef } from 'react';
import { Landmark, RefreshCw, Send, Loader2, User, ArrowLeft, Network, Users, Map, Book, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useArquitecto, PendingItem } from '../hooks/useArquitecto';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ArquitectoPendingWidget from './ArquitectoPendingWidget';
import EfectoDomino from './architect/EfectoDomino';
import PersonajesHerramienta from './architect/PersonajesHerramienta';

interface ArquitectoPanelProps {
    onClose: () => void;
    accessToken: string | null;
    folderId: string;
    onPendingItemsUpdate?: (items: PendingItem[]) => void;
}

type ActiveTool = 'none' | 'domino' | 'personajes' | 'map' | 'lore' | 'settings';

const ArquitectoPanel: React.FC<ArquitectoPanelProps> = ({ onClose, accessToken, folderId, onPendingItemsUpdate }) => {
    const { config } = useProjectConfig();
    const projectName = config?.projectName || 'Mi Proyecto';
    const [inputValue, setInputValue] = useState('');
    const [isPendingDrawerOpen, setIsPendingDrawerOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<ActiveTool>('none');

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        messages,
        pendingItems,
        isInitializing,
        isThinking,
        isAnalyzing,
        lastAnalyzedAt,
        hasInitialized,
        initialize,
        sendMessage,
        reAnalyze
    } = useArquitecto({ accessToken, folderId });

    // Auto-inicializar al abrir
    useEffect(() => {
        if (!hasInitialized) {
            initialize();
        }
    }, [hasInitialized, initialize]);

    // Sincronizar store
    useEffect(() => {
        if (pendingItems.length > 0 && onPendingItemsUpdate) {
            onPendingItemsUpdate(pendingItems);
        }
    }, [pendingItems, onPendingItemsUpdate]);

    // 🟢 Fix Bug 1: Abrir drawer automáticamente si hay pendingItems restaurados del cache
    useEffect(() => {
        if (pendingItems.length > 0 && messages.length <= 1) {
            setIsPendingDrawerOpen(true);
        }
    }, [pendingItems.length, messages.length]);

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

    const handleSend = () => {
        if (!inputValue.trim() || isThinking) return;
        sendMessage(inputValue.trim());
        setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleAnalyze = () => {
        reAnalyze();
        setIsPendingDrawerOpen(true);
    };

    return (
        <div className="h-full w-full bg-[#0a0a0a] bg-[radial-gradient(circle_at_50%_30%,#1c1c1e_0%,#0f0f10_80%)] flex flex-col overflow-hidden relative selection:bg-cyan-500/30 font-display">

            {/* Top Drawer: Pendientes (Analysis View) */}
            <div className={`w-full shrink-0 z-30 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${isPendingDrawerOpen ? 'max-h-[55vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                <ArquitectoPendingWidget
                    pendingItems={pendingItems}
                    onOpenArquitecto={reAnalyze}
                    onClose={() => setIsPendingDrawerOpen(false)}
                    isAnalyzing={isAnalyzing}
                    hideHeader={true}
                />
            </div>

            {/* HEADER — siempre visible */}
            <header className="h-14 border-b border-titanium-800 flex items-center justify-between px-6 shrink-0 bg-[#0a0a0a]/80 backdrop-blur-md z-30 relative">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-titanium-500 hover:text-titanium-300 transition-colors group"
                    aria-label="Cerrar Arquitecto"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">El Arquitecto</span>
                </button>

                <div className="text-titanium-500 text-sm font-medium uppercase tracking-wider font-mono">
                    Proyecto: {projectName}
                </div>

                <div className="w-[100px] flex justify-end">
                    <button
                        onClick={handleAnalyze}
                        disabled={isAnalyzing || isInitializing}
                        className="text-cyan-500 text-sm font-medium border border-cyan-500/30 px-3 py-1 rounded hover:bg-cyan-500/10 transition-colors shadow-[0_0_10px_rgba(6,182,212,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? 'Analizando...' : 'Analizar'}
                    </button>
                </div>
            </header>

            {/* Chevron toggle — abre/cierra el drawer de misiones */}
            {pendingItems.length > 0 && (
                <div className="flex justify-center shrink-0 z-30 bg-[#0a0a0a]/60">
                    <button
                        onClick={() => setIsPendingDrawerOpen(v => !v)}
                        className="flex items-center gap-1.5 px-4 py-1 text-titanium-500 hover:text-cyan-400 transition-colors text-xs font-mono tracking-wider group"
                        aria-label={isPendingDrawerOpen ? 'Cerrar misiones' : 'Ver misiones pendientes'}
                        title={isPendingDrawerOpen ? 'Cerrar misiones' : 'Ver misiones pendientes'}
                    >
                        {isPendingDrawerOpen
                            ? <ChevronUp size={14} className="group-hover:scale-110 transition-transform" />
                            : <ChevronDown size={14} className="group-hover:scale-110 transition-transform" />}
                    </button>
                </div>
            )}

            {/* Main Workspace Area */}
            <main className={`flex-1 relative flex justify-center w-full overflow-hidden transition-all duration-300 ${activeTool !== 'none' ? 'opacity-70 blur-[1px]' : 'opacity-100'}`}>

                {/* Chat Feed Container */}
                <div className="w-full max-w-[720px] h-full flex flex-col pt-8 pb-[100px] px-4 overflow-y-auto z-10 scroll-smooth">

                    {/* Messages List */}
                    <div className="flex flex-col gap-6 w-full mt-auto">

                        {(!hasInitialized && isInitializing) ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-60">
                                <Landmark size={48} className="text-titanium-600 mb-4 animate-pulse" />
                                <p className="text-lg font-medium text-titanium-300">Inicializando Arquitectura...</p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center pb-20 opacity-60">
                                <Landmark size={48} className="text-titanium-600 mb-4" />
                                <p className="text-lg font-medium text-titanium-300">¿Qué estructura construiremos hoy?</p>
                            </div>
                        ) : (
                            messages.map(msg => (
                                <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end self-end' : 'items-start'}`}>
                                    <div className={`
                                        border px-5 py-4 rounded-xl text-[15px] leading-[1.6]
                                        ${msg.role === 'user'
                                            ? 'bg-emerald-950/20 border-titanium-800/50 rounded-br-none text-titanium-300 shadow-sm'
                                            : 'bg-titanium-900 border-titanium-800 rounded-bl-none text-titanium-200 shadow-sm'
                                        }
                                    `}>
                                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-cyan-500">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <span className={`text-[11px] text-titanium-600 mt-1 uppercase font-mono tracking-widest ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                                        {msg.role === 'user' ? 'Tú' : 'Arquitecto'}
                                    </span>
                                </div>
                            ))
                        )}

                        {/* Architect Message (Thinking/Loading state) */}
                        {isThinking && (
                            <div className="flex flex-col items-start max-w-[85%] mt-2">
                                <div className="bg-titanium-900 border border-titanium-800 px-5 py-4 rounded-xl rounded-bl-none flex items-center gap-2 h-[56px]">
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Floating Toolbar (Left) */}
                <div className="absolute left-8 bottom-8 z-20">
                    <div className="bg-titanium-900/70 backdrop-blur-xl border border-titanium-800 rounded-full p-2 flex flex-col gap-3 shadow-2xl">

                        <button
                            onClick={() => setActiveTool(activeTool === 'domino' ? 'none' : 'domino')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'domino' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Network size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Efecto Dominó
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'personajes' ? 'none' : 'personajes')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'personajes' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Users size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Personajes
                            </span>
                        </button>

                        <button className="w-10 h-10 flex items-center justify-center rounded-full text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50 transition-all group relative">
                            <Map size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Mundo
                            </span>
                        </button>

                        <button className="w-10 h-10 flex items-center justify-center rounded-full text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50 transition-all group relative">
                            <Book size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Lore
                            </span>
                        </button>

                        <button className="w-10 h-10 flex items-center justify-center rounded-full text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50 transition-all group relative">
                            <Settings size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Ajustes
                            </span>
                        </button>

                    </div>
                </div>

                {/* Chat Input Area */}
                <div className="absolute bottom-6 w-full max-w-[720px] px-4 z-20">
                    <div className="relative flex items-center w-full bg-titanium-950 border border-titanium-600 rounded-xl overflow-hidden shadow-2xl">
                        <textarea
                            ref={textareaRef}
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isInitializing || isThinking}
                            className="w-full bg-transparent border-none text-titanium-300 text-[15px] placeholder:text-titanium-600 focus:ring-0 resize-none py-4 pl-4 pr-14 max-h-[120px]"
                            placeholder="Instruye al Arquitecto..."
                            rows={1}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isThinking || isInitializing}
                            className="absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center rounded-lg text-cyan-500 hover:bg-cyan-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Enviar mensaje"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-titanium-600 font-mono uppercase tracking-widest">
                            El Arquitecto procesa la lógica, tú pones el alma.
                        </span>
                    </div>
                </div>
            </main>

            {/* Overlays - Tools */}
            {activeTool === 'domino' && (
                <EfectoDomino onClose={() => setActiveTool('none')} />
            )}

            {activeTool === 'personajes' && (
                <PersonajesHerramienta onClose={() => setActiveTool('none')} />
            )}

        </div>
    );
};

export default ArquitectoPanel;
