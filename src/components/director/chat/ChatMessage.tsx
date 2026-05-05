import React, { useState } from 'react';
import { User, Bot, AlertTriangle, ShieldAlert, Loader2, X, AlertCircle, FilePlus, Wand2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnalysisCard } from './AnalysisCard';
import { VerdictCard } from './VerdictCard';
import { callFunction } from '../../../services/api';
import { ChatMessageData } from '../../../types/director';
import { parseThinking } from '../../../utils/thinking';
import { ThinkingBubble } from './ThinkingBubble';

interface ChatMessageProps {
    message: ChatMessageData;
    onRescue: (drift: any, id: string, category: string) => void;
    onPurge: (drift: any, id: string) => void;
    onInsert?: (text: string) => void;
    rescuingIds: Set<string>;
    purgingIds: Set<string>;
    isOld?: boolean;
    isExpanded?: boolean;
    onToggleExpand?: (id: string) => void;
}

export const ChatMessage = React.memo(({
    message,
    onRescue,
    onPurge,
    onInsert,
    rescuingIds,
    purgingIds,
    isOld = false,
    isExpanded = false,
    onToggleExpand,
}: ChatMessageProps) => {
    // 🟢 State for transformation
    const [isTransforming, setIsTransforming] = useState(false);

    // 1. INSPECTOR CARD
    if (message.type === 'analysis_card' && message.inspectorData) {
        return <AnalysisCard data={message.inspectorData} />;
    }

    // 2. VERDICT CARD
    if (message.type === 'verdict_card' && message.verdictData) {
        return <VerdictCard data={message.verdictData} />;
    }

    // 3. SYSTEM ALERT (Client Side Context)
    if (message.type === 'system_alert') {
        return (
            <div className="mx-auto w-[90%] bg-cyan-950/20 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-3 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase mb-1">
                    <AlertCircle size={14} />
                    <span>Sistema</span>
                </div>
                <div className="text-titanium-300 text-xs italic opacity-90">
                    {message.text}
                </div>
            </div>
        );
    }

    // 4. DRIFT ALERT (Legacy support logic moved inside component)
    if (message.isDriftAlert && message.driftData) {
        // GROUP ALERT
        if (message.driftData.isGroup) {
            return (
                <div className="mx-auto w-[95%] bg-amber-950/20 border border-amber-500/50 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center gap-2 mb-2 text-amber-400 font-bold text-xs uppercase">
                        <AlertTriangle size={14} />
                        <span>Grupo de Conflicto: {message.driftData.category}</span>
                        <span className="ml-auto bg-amber-900/50 px-1.5 py-0.5 rounded text-[10px] text-white">
                            {message.driftData.count} Ecos
                        </span>
                    </div>
                    <p className="text-titanium-300 text-xs mb-3">{message.text}</p>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {message.driftData.items.map((item: any, subIdx: number) => (
                            <div key={subIdx} className="bg-titanium-900/50 p-2 rounded border border-titanium-800/50">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="text-[10px] text-red-400 font-mono font-bold">Drift: {item.drift_score?.toFixed(2)}</span>
                                    <span className="text-[10px] text-titanium-500 truncate max-w-[100px]">{item.fileName}</span>
                                </div>
                                <p className="text-[10px] text-titanium-400 italic mb-2 line-clamp-2">"{item.snippet}"</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onRescue(item, `${message.id}-${subIdx}`, message.driftData.category)}
                                        disabled={rescuingIds.has(`${message.id}-${subIdx}`)}
                                        className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                        aria-label={`Rescatar ${item.fileName || 'eco'}`}
                                    >
                                        {rescuingIds.has(`${message.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Rescatar"}
                                    </button>
                                    <button
                                        onClick={() => onPurge(item, `${message.id}-${subIdx}`)}
                                        disabled={purgingIds.has(`${message.id}-${subIdx}`)}
                                        className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                                        aria-label={`Purgar ${item.fileName || 'eco'}`}
                                    >
                                        {purgingIds.has(`${message.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Purgar"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        // SINGLE ALERT
        const isPurging = purgingIds.has(message.id);
        const isRescuing = rescuingIds.has(message.id);

        return (
            <div className="mx-auto w-[90%] bg-red-950/20 border border-red-500/50 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2 mb-2 text-red-400 font-bold text-xs uppercase">
                    <ShieldAlert size={14} className="animate-pulse" />
                    <span>Eco Crítico: {message.driftCategory || 'General'}</span>
                    <span className="ml-auto bg-red-900/50 px-1.5 py-0.5 rounded text-[10px] text-white">
                        Drift: {message.driftData.drift_score?.toFixed(2) || '?.??'}
                    </span>
                </div>

                <p className="text-titanium-300 text-xs italic mb-3 border-l-2 border-red-800 pl-2 line-clamp-3">
                    "{message.driftData.snippet || message.driftData.reason || '...'}"
                </p>

                {message.driftData.fileName && (
                    <div className="text-[10px] text-titanium-500 font-mono mb-3 truncate">
                        Archivo: {message.driftData.fileName}
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={() => onRescue(message.driftData, message.id, message.driftCategory || 'General')}
                        disabled={isRescuing}
                        className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                        aria-label={`Rescatar eco: ${message.driftCategory || 'General'}`}
                    >
                        {isRescuing ? <Loader2 size={10} className="animate-spin" /> : "Rescatar"}
                    </button>
                    <button
                        onClick={() => onPurge(message.driftData, message.id)}
                        disabled={isPurging}
                        className="flex-1 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                        aria-label={`Purgar eco: ${message.driftCategory || 'General'}`}
                    >
                        {isPurging ? <Loader2 size={10} className="animate-spin" /> : <AlertTriangle size={10} />}
                        Purgar Eco
                    </button>
                </div>
            </div>
        );
    }

    // 5. QUOTA ERROR MESSAGE
    if (message.isQuota) {
        return (
            <div className="mx-auto w-[90%] bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-a:text-amber-400 prose-strong:text-amber-200 text-amber-200 text-xs leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                </div>
            </div>
        );
    }

    // 6. STANDARD MESSAGE (Text with Markdown)
    const { thinking, content } = React.useMemo(() => parseThinking(message.text), [message.text]);

    const isAssistant = message.role === 'assistant';
    const isUser = message.role === 'user';

    const codeComponents = {
        code({node, inline, className, children, ...props}: any) {
            return inline
                ? <code className="bg-titanium-800 px-1 py-0.5 rounded text-xs font-mono text-cyan-300" {...props}>{children}</code>
                : <code className="block bg-titanium-950 p-2 rounded text-xs font-mono my-2 overflow-x-auto text-cyan-100" {...props}>{children}</code>;
        }
    };

    const proseBlock = (
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 break-words"
            style={isAssistant ? { fontFamily: "'Newsreader', Georgia, serif", fontSize: '16px', lineHeight: '1.75' } : {}}>
            {isAssistant && thinking && <ThinkingBubble thought={thinking} />}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={codeComponents}>
                {content}
            </ReactMarkdown>
        </div>
    );

    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${isAssistant ? 'mb-5' : isUser ? 'mb-1' : ''}`}>
            <div className={`
                w-8 h-8 rounded-full flex items-center justify-center shrink-0
                ${isUser ? 'bg-cyan-900/50 text-cyan-400' :
                message.role === 'system' ? 'bg-red-900/50 text-red-400' : 'bg-emerald-900/50 text-emerald-400'}
            `}>
                {isUser ? <User size={14} /> : message.role === 'system' ? <X size={14} /> : <Bot size={14} />}
            </div>
            <div className={`
                p-3 text-sm max-w-[85%] leading-relaxed
                ${isUser
                    ? 'rounded-xl bg-cyan-950/30 border border-cyan-900/50 text-cyan-100 overflow-hidden'
                    : message.role === 'system'
                    ? 'rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 overflow-hidden'
                    : 'text-titanium-200'}
            `}
            style={isAssistant ? {
                background: 'rgba(129, 140, 248, 0.02)',
                borderLeft: '2px solid rgba(129, 140, 248, 0.08)',
                borderRadius: '0 8px 8px 0',
                paddingLeft: '16px',
            } : {}}>
                {/* Attachment preview */}
                {message.attachmentPreview && (
                    <div className="mb-2 rounded-lg overflow-hidden border border-white/10">
                        {message.attachmentType === 'audio' ? (
                            <audio controls src={message.attachmentPreview} className="w-full" />
                        ) : (
                            <img src={message.attachmentPreview} alt="Attachment" className="max-w-full h-auto max-h-60 object-cover" />
                        )}
                    </div>
                )}

                {/* Collapsed view for old assistant messages */}
                {isAssistant && isOld && !isExpanded ? (
                    <div className="relative">
                        <div className="overflow-hidden" style={{ maxHeight: '84px' }}>
                            {proseBlock}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                            style={{ background: 'linear-gradient(to top, rgba(28,28,30,0.97), transparent)' }} />
                    </div>
                ) : (
                    proseBlock
                )}

                {/* Expand/collapse toggle for old assistant messages */}
                {isAssistant && isOld && (
                    <button
                        onClick={() => onToggleExpand?.(message.id)}
                        className="mt-2 text-[11px] font-mono uppercase tracking-wider transition-colors text-left"
                        style={{ color: 'rgba(129, 140, 248, 0.6)' }}>
                        {isExpanded ? 'Colapsar ↑' : 'Leer respuesta completa ↓'}
                    </button>
                )}

                {/* Insert button — only when content is visible */}
                {isAssistant && onInsert && message.id !== 'intro' && (!isOld || isExpanded) && (
                    <div className="mt-3 pt-2 border-t border-titanium-800/50 flex justify-end gap-2">
                        <button
                            onClick={() => {
                                setIsTransforming(true);
                                callFunction<{text: string}>('transformToGuide', { text: message.text })
                                    .then((res) => { if (onInsert) onInsert(res.text); })
                                    .catch(() => { if (onInsert) onInsert(message.text); })
                                    .finally(() => setIsTransforming(false));
                            }}
                            disabled={isTransforming}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 hover:text-emerald-300 bg-emerald-900/10 hover:bg-emerald-900/30 px-2 py-1.5 rounded transition-all uppercase tracking-wider"
                            title="Transformar en Guía e Insertar (Magia)"
                            aria-label="Transformar respuesta en guía e insertar"
                        >
                            {isTransforming ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                            <span>{isTransforming ? 'Transformando...' : 'Insertar (Guía)'}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}, (prev, next) => {
    if (prev.message !== next.message) return false;
    if (prev.onInsert !== next.onInsert) return false;
    if (prev.isOld !== next.isOld) return false;
    if (prev.isExpanded !== next.isExpanded) return false;
    if (prev.onToggleExpand !== next.onToggleExpand) return false;

    const isDrift = next.message.isDriftAlert || next.message.driftData?.isGroup;
    if (!isDrift) return true;

    if (prev.rescuingIds !== next.rescuingIds) return false;
    if (prev.purgingIds !== next.purgingIds) return false;
    if (prev.onRescue !== next.onRescue) return false;
    if (prev.onPurge !== next.onPurge) return false;

    return true;
});
