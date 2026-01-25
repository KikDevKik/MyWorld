import React from 'react';
import { User, Bot, AlertTriangle, ShieldAlert, Loader2, X, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnalysisCard } from './AnalysisCard';
import { VerdictCard } from './VerdictCard';

export interface ChatMessageData {
    id: string;
    role: 'user' | 'assistant' | 'system';
    text: string;
    timestamp?: any;

    // 🟢 HYBRID TYPES
    type?: 'text' | 'analysis_card' | 'verdict_card' | 'system_alert';

    // 🟢 DATA PAYLOADS
    inspectorData?: any;
    verdictData?: any;
    driftData?: any;
    driftCategory?: string;

    // 🟢 FLAGS (Legacy/Aux)
    isError?: boolean;
    isDriftAlert?: boolean;
}

interface ChatMessageProps {
    message: ChatMessageData;
    onRescue: (drift: any, id: string, category: string) => void;
    onPurge: (drift: any, id: string) => void;
    rescuingIds: Set<string>;
    purgingIds: Set<string>;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    onRescue,
    onPurge,
    rescuingIds,
    purgingIds
}) => {

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
                                    >
                                        {rescuingIds.has(`${message.id}-${subIdx}`) ? <Loader2 size={9} className="animate-spin mx-auto"/> : "Rescatar"}
                                    </button>
                                    <button
                                        onClick={() => onPurge(item, `${message.id}-${subIdx}`)}
                                        disabled={purgingIds.has(`${message.id}-${subIdx}`)}
                                        className="flex-1 bg-red-900/30 hover:bg-red-900/50 text-red-300 py-1 rounded text-[9px] uppercase focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
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
                    >
                        {isRescuing ? <Loader2 size={10} className="animate-spin" /> : "Rescatar"}
                    </button>
                    <button
                        onClick={() => onPurge(message.driftData, message.id)}
                        disabled={isPurging}
                        className="flex-1 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 py-1.5 rounded text-[10px] font-bold uppercase transition-colors flex items-center justify-center gap-1 focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:outline-none"
                    >
                        {isPurging ? <Loader2 size={10} className="animate-spin" /> : <AlertTriangle size={10} />}
                        Purgar Eco
                    </button>
                </div>
            </div>
        );
    }

    // 5. STANDARD MESSAGE (Text with Markdown)
    return (
        <div className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`
                w-8 h-8 rounded-full flex items-center justify-center shrink-0
                ${message.role === 'user' ? 'bg-cyan-900/50 text-cyan-400' :
                message.role === 'system' ? 'bg-red-900/50 text-red-400' : 'bg-emerald-900/50 text-emerald-400'}
            `}>
                {message.role === 'user' ? <User size={14} /> : message.role === 'system' ? <X size={14} /> : <Bot size={14} />}
            </div>
            <div className={`
                p-3 rounded-xl text-sm max-w-[85%] leading-relaxed overflow-hidden
                ${message.role === 'user'
                    ? 'bg-cyan-950/30 border border-cyan-900/50 text-cyan-100'
                    : message.role === 'system'
                    ? 'bg-red-950/30 border border-red-900/50 text-red-200'
                    : 'bg-titanium-900/50 border border-titanium-800 text-titanium-200'}
            `}>
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 break-words">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        // Optional: Custom renderer overrides if needed for specific aesthetic
                        code({node, inline, className, children, ...props}: any) {
                             return inline
                               ? <code className="bg-titanium-800 px-1 py-0.5 rounded text-xs font-mono text-cyan-300" {...props}>{children}</code>
                               : <code className="block bg-titanium-950 p-2 rounded text-xs font-mono my-2 overflow-x-auto text-cyan-100" {...props}>{children}</code>
                        }
                    }}
                >
                    {message.text}
                </ReactMarkdown>
                </div>
            </div>
        </div>
    );
};
