import React, { useState, useEffect, useRef } from 'react';
import { Landmark, X, RefreshCw, Send, Loader2, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Lightbulb, Bot, User } from 'lucide-react';
import { useArquitecto, PendingItem } from '../hooks/useArquitecto';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArquitectoPanelProps {
    onClose: () => void;
    accessToken: string | null;
    folderId: string;
    onPendingItemsUpdate?: (items: PendingItem[]) => void;
}

// ── Componente de item de pendiente ──
const PendingItemCard: React.FC<{ item: PendingItem }> = ({ item }) => {
    const severityConfig = {
        critical: {
            bg: 'bg-red-950/30',
            border: 'border-red-500/40',
            text: 'text-red-400',
            icon: <AlertCircle size={12} />,
            badge: 'bg-red-900/50 text-red-300'
        },
        warning: {
            bg: 'bg-amber-950/20',
            border: 'border-amber-500/30',
            text: 'text-amber-400',
            icon: <AlertTriangle size={12} />,
            badge: 'bg-amber-900/50 text-amber-300'
        },
        suggestion: {
            bg: 'bg-blue-950/20',
            border: 'border-blue-500/20',
            text: 'text-blue-400',
            icon: <Lightbulb size={12} />,
            badge: 'bg-blue-900/50 text-blue-300'
        }
    };

    const cfg = severityConfig[item.severity];

    return (
        <div className={`${cfg.bg} border ${cfg.border} rounded-lg p-3`}>
            <div className="flex items-start gap-2 mb-1">
                <span className={`mt-0.5 ${cfg.text} shrink-0`}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${cfg.badge}`}>
                            {item.code}
                        </span>
                        <span className="text-xs font-semibold text-titanium-200 truncate">{item.title}</span>
                    </div>
                    <p className="text-[11px] text-titanium-400 mt-1 leading-relaxed">{item.description}</p>
                </div>
            </div>
        </div>
    );
};

// ── Panel principal ──
const ArquitectoPanel: React.FC<ArquitectoPanelProps> = ({ onClose, accessToken, folderId, onPendingItemsUpdate }) => {
    const [inputValue, setInputValue] = useState('');
    const [isPendingOpen, setIsPendingOpen] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        messages,
        pendingItems,
        projectSummary,
        isInitializing,
        isThinking,
        isAnalyzing,
        lastAnalyzedAt,
        hasInitialized,
        isOutdated,
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

    // Conteo de pendientes
    const criticalCount = pendingItems.filter(i => i.severity === 'critical').length;
    const warningCount = pendingItems.filter(i => i.severity === 'warning').length;
    const suggestionCount = pendingItems.filter(i => i.severity === 'suggestion').length;

    return (
        <div className="h-full w-full bg-titanium-950 flex flex-col overflow-hidden">

            {/* HEADER */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 bg-titanium-900/50 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-900/20 rounded-lg border border-emerald-500/20">
                        <Landmark size={18} className="text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-titanium-100 tracking-wide uppercase">
                            El Arquitecto
                        </h2>
                        <p className="text-[10px] text-titanium-500 font-mono">
                            Planificación Narrativa Estratégica
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Botón re-analizar */}
                    <button
                        onClick={reAnalyze}
                        disabled={isAnalyzing || isInitializing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-titanium-400 hover:text-emerald-400 bg-titanium-800/50 hover:bg-emerald-900/20 border border-titanium-700 hover:border-emerald-500/30 rounded-lg transition-all disabled:opacity-40"
                        title="Re-analizar proyecto"
                    >
                        <RefreshCw size={11} className={isAnalyzing ? 'animate-spin' : ''} />
                        Analizar
                    </button>

                    <button
                        onClick={onClose}
                        className="p-2 text-titanium-500 hover:text-titanium-200 hover:bg-titanium-800 rounded-lg transition-colors"
                        aria-label="Cerrar El Arquitecto"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* BANNER DE OUTDATED */}
            {isOutdated && !isAnalyzing && (
                <div className="bg-amber-950/40 border-b border-amber-900/50 px-6 py-2.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <AlertTriangle size={14} className="text-amber-500" />
                        <span className="text-xs font-medium text-amber-200/90 tracking-wide">
                            Tu proyecto ha cambiado desde el último análisis.
                        </span>
                    </div>
                    <button
                        onClick={reAnalyze}
                        className="text-[10px] font-bold uppercase tracking-wider text-amber-400 hover:text-amber-300 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 hover:border-amber-500/50 px-3 py-1.5 rounded-lg transition-all"
                    >
                        Re-analizar
                    </button>
                </div>
            )}

            {/* BODY: layout de dos columnas */}
            <div className="flex-1 flex min-h-0">

                {/* ── COLUMNA IZQUIERDA: PENDIENTES (colapsable) ── */}
                <div className={`
                    flex flex-col border-r border-titanium-800 transition-all duration-300 shrink-0
                    ${isPendingOpen ? 'w-80' : 'w-12'}
                `}>
                    {/* Header del panel de pendientes */}
                    <button
                        onClick={() => setIsPendingOpen(!isPendingOpen)}
                        className="flex items-center gap-2 px-3 py-3 bg-titanium-900/30 hover:bg-titanium-800/50 border-b border-titanium-800 transition-colors w-full text-left shrink-0"
                        title={isPendingOpen ? "Ocultar pendientes" : "Ver pendientes"}
                    >
                        {isPendingOpen ? (
                            <>
                                <ChevronDown size={14} className="text-titanium-400 shrink-0" />
                                <span className="text-[11px] font-bold text-titanium-300 uppercase tracking-wider">
                                    Pendientes
                                </span>
                                {/* Badges de conteo */}
                                <div className="flex gap-1 ml-auto">
                                    {criticalCount > 0 && (
                                        <span className="text-[9px] font-bold bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded">
                                            {criticalCount}
                                        </span>
                                    )}
                                    {warningCount > 0 && (
                                        <span className="text-[9px] font-bold bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded">
                                            {warningCount}
                                        </span>
                                    )}
                                    {suggestionCount > 0 && (
                                        <span className="text-[9px] font-bold bg-blue-900/60 text-blue-300 px-1.5 py-0.5 rounded">
                                            {suggestionCount}
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            // Colapsado: solo los badges verticales
                            <div className="flex flex-col gap-1 items-center w-full">
                                <ChevronUp size={12} className="text-titanium-500" />
                                {criticalCount > 0 && (
                                    <span className="text-[9px] font-bold bg-red-900/60 text-red-300 px-1 py-0.5 rounded w-full text-center">
                                        {criticalCount}
                                    </span>
                                )}
                                {warningCount > 0 && (
                                    <span className="text-[9px] font-bold bg-amber-900/60 text-amber-300 px-1 py-0.5 rounded w-full text-center">
                                        {warningCount}
                                    </span>
                                )}
                            </div>
                        )}
                    </button>

                    {/* Lista de pendientes */}
                    {isPendingOpen && (
                        <div className="flex-1 overflow-y-auto p-3 space-y-3">
                            {(!hasInitialized && isInitializing) ? (
                                <div className="flex flex-col items-center justify-center h-32 gap-2">
                                    <Loader2 size={20} className="animate-spin text-emerald-500" />
                                    <p className="text-[11px] text-titanium-500">Analizando proyecto...</p>
                                </div>
                            ) : (
                                <>
                                    {/* 📝 PROJECT SUMMARY (NEW) */}
                                    {projectSummary && (
                                        <div className="bg-emerald-900/5 border border-emerald-500/20 rounded-lg p-3.5 mb-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1 px-1.5 bg-emerald-900/40 rounded border border-emerald-500/30">
                                                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest leading-none">Resumen de Estado</span>
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-titanium-300 leading-relaxed">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {projectSummary}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    )}

                                    {pendingItems.length === 0 && !isAnalyzing ? (
                                        <div className="flex flex-col items-center justify-center h-32 gap-2 text-center py-8">
                                            <div className="p-3 bg-emerald-900/10 rounded-full">
                                                <Landmark size={20} className="text-emerald-500/50" />
                                            </div>
                                            <p className="text-[10px] text-titanium-500 max-w-[160px] mx-auto">
                                                {isOutdated ? "El análisis está desactualizado. Haz clic en 'Analizar' para actualizar misiones." : "Todo en orden. Sin misiones pendientes detectadas."}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Críticos */}
                                            {pendingItems.filter(i => i.severity === 'critical').map(item => (
                                                <PendingItemCard key={item.code} item={item} />
                                            ))}
                                            {/* Warnings */}
                                            {pendingItems.filter(i => i.severity === 'warning').map(item => (
                                                <PendingItemCard key={item.code} item={item} />
                                            ))}
                                            {/* Sugerencias */}
                                            {pendingItems.filter(i => i.severity === 'suggestion').map(item => (
                                                <PendingItemCard key={item.code} item={item} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── COLUMNA DERECHA: CHAT ── */}
                <div className="flex-1 flex flex-col min-w-0">

                    {/* Mensajes */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-5">
                        {(!hasInitialized && isInitializing) ? (
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <div className="p-5 bg-emerald-900/10 rounded-full border border-emerald-500/20 animate-pulse">
                                    <Landmark size={32} className="text-emerald-500/60" />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-titanium-300 mb-1">
                                        El Arquitecto está analizando tu proyecto
                                    </p>
                                    <p className="text-xs text-titanium-500">
                                        Leyendo Canon y Referencias...
                                    </p>
                                </div>
                            </div>
                        ) : (
                            messages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                >
                                    {/* Avatar */}
                                    {msg.role !== 'system' && (
                                        <div className={`
                                            w-8 h-8 rounded-full flex items-center justify-center shrink-0
                                            ${msg.role === 'user'
                                                ? 'bg-cyan-900/50 text-cyan-400'
                                                : 'bg-emerald-900/30 text-emerald-400'
                                            }
                                        `}>
                                            {msg.role === 'user'
                                                ? <User size={14} />
                                                : <Landmark size={14} />
                                            }
                                        </div>
                                    )}

                                    {/* Burbuja */}
                                    {msg.role === 'system' ? (
                                        <div className="mx-auto text-[10px] text-titanium-500 font-mono bg-titanium-900/30 px-3 py-1.5 rounded-full border border-titanium-800/50">
                                            {msg.text}
                                        </div>
                                    ) : (
                                        <div className={`
                                            p-3.5 rounded-xl text-sm max-w-[80%] leading-relaxed
                                            ${msg.role === 'user'
                                                ? 'bg-cyan-950/30 border border-cyan-900/50 text-cyan-100'
                                                : 'bg-titanium-900/50 border border-titanium-800 text-titanium-200'
                                            }
                                        `}>
                                            {/* Badge de modo si existe */}
                                            {msg.role === 'assistant' && msg.mode && msg.mode !== 'general' && (
                                                <div className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest mb-2 font-mono">
                                                    {msg.mode.replace(/_/g, ' ')}
                                                </div>
                                            )}
                                            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.text}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}

                        {/* Indicador de pensamiento */}
                        {isThinking && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-900/30 flex items-center justify-center shrink-0">
                                    <Landmark size={14} className="text-emerald-400 animate-pulse" />
                                </div>
                                <div className="bg-titanium-900/50 border border-titanium-800 rounded-xl px-4 py-3 flex items-center gap-2">
                                    <Loader2 size={12} className="animate-spin text-emerald-500" />
                                    <span className="text-xs text-titanium-500">El Arquitecto está pensando...</span>
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-titanium-800 bg-titanium-900/30 shrink-0">
                        <div className="relative">
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Pregunta al Arquitecto sobre tu worldbuilding, personajes o estructura..."
                                disabled={isInitializing || isThinking}
                                rows={1}
                                className="w-full pl-4 pr-12 py-3 bg-titanium-950 border border-titanium-700 rounded-xl text-titanium-200 placeholder-titanium-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all resize-none min-h-[48px] max-h-[140px] text-sm disabled:opacity-50"
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isThinking || isInitializing}
                                className="absolute right-2.5 bottom-2.5 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                aria-label="Enviar mensaje"
                            >
                                <Send size={14} />
                            </button>
                        </div>
                        {lastAnalyzedAt && (
                            <p className="text-[10px] text-titanium-600 mt-2 text-center font-mono">
                                Último análisis: {new Date(lastAnalyzedAt).toLocaleString()}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArquitectoPanel;
