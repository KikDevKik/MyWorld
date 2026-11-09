import React, { useState } from 'react';
import { User, Bot, AlertTriangle, ShieldAlert, Loader2, X, AlertCircle, FilePlus, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnalysisCard } from './AnalysisCard';
import { VerdictCard } from './VerdictCard';
import { ChatMessageData } from '../../../types/director';
import { parseThinking } from '../../../utils/thinking';
import { ThinkingBubble } from './ThinkingBubble';
import { MiraSprite, MiraPose } from '../../mira/MiraSprite';

// Etiqueta opcional al inicio de la respuesta: [mira:estado]. Se quita del texto y elige la cara de Mira.
const MOOD_FACE: Record<string, MiraPose> = { contenta: 'contenta', firme: 'firme', preocupada: 'preocupada', sorprendida: 'sorprendida', ojo: 'ojo', alerta: 'ojo', uy: 'uy', neutral: 'contenta', pensativa: 'contenta', celebrando: 'contenta' };
const STAND_POSE: Record<string, MiraPose> = { pensativa: 'pensativa', contenta: 'contenta', firme: 'firme', preocupada: 'preocupada', sorprendida: 'sorprendida', ojo: 'ojo', alerta: 'ojo', celebrando: 'celebrando', neutral: 'neutral', uy: 'uy' };
// Nov 2026: la línea final «Fuentes: a.md, b.md» se muestra como etiquetas de archivo.
function splitSources(text: string): { body: string; sources: string[] } {
    const m = /\n\s*(?:\*\*|_)?(?:Fuentes|Sources)(?:\*\*|_)?\s*:?\s*(?:\*\*|_)?\s*([^\n]+)\s*$/i.exec(text || '');
    if (!m) return { body: text, sources: [] };
    const sources = m[1].split(/,(?![^()]*\))/).map(s => s.replace(/[*_`]/g, '').trim()).filter(Boolean);
    if (!sources.length || sources.length > 12) return { body: text, sources: [] };
    return { body: text.slice(0, m.index).trimEnd(), sources };
}
function parseMiraMood(text: string): { mood: string; clean: string } {
    const m = /^\s*\[mira:([a-záéíóú]+)\]\s*/i.exec(text || '');
    if (!m) return { mood: 'neutral', clean: text };
    return { mood: m[1].toLowerCase(), clean: text.slice(m[0].length) };
}

interface ChatMessageProps {
    message: ChatMessageData;
    onRescue: (drift: any, id: string, category: string) => void;
    onPurge: (drift: any, id: string) => void;
    /** Nov 2026: guarda la respuesta como nota en Recursos (antes «Llevar al capítulo» la reescribía con IA dentro del manuscrito). */
    onInsert?: (text: string) => void | Promise<void>;
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
            <div className="mx-auto w-[90%] bg-mira/15 backdrop-blur-sm border border-mira/30 rounded-lg p-3 animate-in zoom-in-95 duration-200">
                <div className="flex items-center gap-2 text-mira font-bold text-xs uppercase mb-1">
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
                                        className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-mira/60 focus-visible:outline-none"
                                        aria-label={`Rescatar ${item.fileName || 'eco'}`}
                                    >
                                        {rescuingIds.has(`${message.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Rescatar"}
                                    </button>
                                    <button
                                        onClick={() => onPurge(item, `${message.id}-${subIdx}`)}
                                        disabled={purgingIds.has(`${message.id}-${subIdx}`)}
                                        className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-mira/60 focus-visible:outline-none"
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
                        className="flex-1 bg-titanium-800 hover:bg-titanium-700 text-titanium-300 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-mira/60 focus-visible:outline-none"
                        aria-label={`Rescatar eco: ${message.driftCategory || 'General'}`}
                    >
                        {isRescuing ? <Loader2 size={10} className="animate-spin" /> : "Rescatar"}
                    </button>
                    <button
                        onClick={() => onPurge(message.driftData, message.id)}
                        disabled={isPurging}
                        className="flex-1 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-mira/60 focus-visible:outline-none"
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
    const parsed = React.useMemo(() => parseThinking(message.text), [message.text]);
    const thinking = parsed.thinking;
    const { mood, clean: content } = React.useMemo(() => parseMiraMood(parsed.content), [parsed.content]);
    const { body: shownContent, sources } = React.useMemo(() => (message.role === 'assistant' ? splitSources(content) : { body: content, sources: [] as string[] }), [content, message.role]);

    const isAssistant = message.role === 'assistant';
    const isUser = message.role === 'user';

    const codeComponents = {
        code({node, inline, className, children, ...props}: any) {
            return inline
                ? <code className="bg-titanium-800 px-1 py-0.5 rounded text-xs font-mono text-mira" {...props}>{children}</code>
                : <code className="block bg-titanium-950 p-2 rounded text-xs font-mono my-2 overflow-x-auto text-mira" {...props}>{children}</code>;
        }
    };

    const proseBlock = (
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 break-words"
            style={isAssistant ? { fontFamily: 'var(--font-serif)', fontSize: '16px', lineHeight: '1.7' } : {}}>
            {isAssistant && thinking && <ThinkingBubble thought={thinking} />}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={codeComponents}>
                {shownContent}
            </ReactMarkdown>
            {sources.length > 0 && (
                <div className="not-prose mt-3 flex flex-wrap items-center gap-1.5" style={{ fontFamily: 'var(--font-display)' }}>
                    <span className="text-[11px] text-titanium-400 mr-0.5">Fuentes</span>
                    {sources.map(s => (
                        <span key={s} className="inline-flex items-center gap-1 max-w-full rounded-md bg-titanium-900/70 border border-titanium-700 px-1.5 py-0.5 text-[11px] leading-tight text-titanium-300">
                            <FileText size={11} className="shrink-0 text-mira" aria-hidden="true" />
                            <span className="truncate">{s.replace(/\.md$/i, '')}</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );

    const inner = (
            <>
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
                            style={{ background: 'linear-gradient(to top, var(--mw-mira-bg), transparent)' }} />
                    </div>
                ) : (
                    proseBlock
                )}

                {/* Expand/collapse toggle for old assistant messages */}
                {isAssistant && isOld && (
                    <button
                        onClick={() => onToggleExpand?.(message.id)}
                        className="mt-2 text-xs text-mira hover:underline transition-colors text-left">
                        {isExpanded ? 'Ver menos' : 'Leer la respuesta completa'}
                    </button>
                )}

                {/* Insert button — only when content is visible */}
                {isAssistant && onInsert && message.id !== 'intro' && (!isOld || isExpanded) && (
                    <div className="mt-3 pt-2 border-t border-mira/20 flex justify-end gap-2">
                        <button
                            onClick={() => {
                                if (!onInsert) return;
                                setIsTransforming(true);
                                Promise.resolve(onInsert(content)).finally(() => setIsTransforming(false));
                            }}
                            disabled={isTransforming}
                            className="flex items-center gap-1.5 text-xs font-medium text-mira hover:text-titanium-100 hover:bg-mira/10 px-2.5 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60"
                            title="Guarda esta respuesta como nota en Recursos → Ideas (no canon). Tu capítulo no cambia."
                        >
                            {isTransforming ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <FilePlus size={13} aria-hidden="true" />}
                            <span>{isTransforming ? 'Guardando…' : 'Guardar como nota'}</span>
                        </button>
                    </div>
                )}
            </>
    );

    if (isAssistant) {
        // Mira habla: su globo siempre lleva su sprite, que cambia de lugar (cara al lado, sentada encima o de pie al lado).
        // Nov 2026: la pose depende del largo. Las respuestas largas la llevan sentada encima y el globo usa todo el ancho;
        // de pie al lado solo en respuestas cortas (si no, el texto quedaba en tres palabras por línea).
        const len = (content || '').length;
        const hash = (message.id || '').split('').reduce((n, ch) => n + ch.charCodeAt(0), 0);
        const variant = isOld ? 0 : len > 420 ? 1 : len < 160 ? (hash % 2 ? 2 : 0) : (hash % 2 ? 1 : 0);
        const face = MOOD_FACE[mood] || 'contenta';
        const bubbleCls = `relative text-sm ${variant === 1 ? 'w-full' : 'max-w-[88%]'} leading-relaxed bg-mira-bg border border-mira/60 text-titanium-100 px-4 py-3`;
        if (variant === 1) {
            return (
                <div className="mb-6 pt-[92px]">
                    <div className={`${bubbleCls} rounded-2xl`}>
                        <MiraSprite pose="sentada" className="absolute left-4 bottom-full -mb-[15px] pointer-events-none" />
                        {inner}
                    </div>
                </div>
            );
        }
        if (variant === 2) {
            return (
                <div className="mb-6 flex items-end gap-1">
                    <div className={`${bubbleCls} rounded-2xl rounded-br-sm mb-10`}>{inner}</div>
                    <MiraSprite pose={STAND_POSE[mood] || 'pensativa'} label="Mira" />
                </div>
            );
        }
        return (
            <div className="mb-6 flex items-end gap-1">
                <MiraSprite pose={face} face scale={2} label="Mira" className="-ml-2 shrink-0" />
                <div className={`${bubbleCls} rounded-2xl rounded-bl-sm`}>{inner}</div>
            </div>
        );
    }

    return (
        <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} ${isUser ? 'mb-1' : ''}`}>
            {!isUser && (
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-red-900/50 text-red-400">
                    <X size={14} />
                </div>
            )}
            <div className={`
                p-3 text-sm max-w-[85%] leading-relaxed
                ${isUser
                    ? 'rounded-2xl rounded-br-sm bg-titanium-800 border border-titanium-700 text-titanium-100 overflow-hidden'
                    : 'rounded-xl bg-red-950/30 border border-red-900/50 text-red-200 overflow-hidden'}
            `}>
                {inner}
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
