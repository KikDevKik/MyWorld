import React from 'react';
import { PendingItem } from '../../types/roadmap';
import { Layers, Zap, MessageSquare, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
    pendingItems: PendingItem[];
    onSelectItem?: (item: PendingItem) => void;
}

/**
 * ColisionesMap — MindMap visual de contradicciones organizadas por capa.
 * Equivalente al MindMap del AI Studio, adaptado al estilo Titanium.
 */
export default function ColisionesMap({ pendingItems, onSelectItem }: Props) {
    const macro = pendingItems.filter(i => (i.layer || 'MACRO') === 'MACRO');
    const meso = pendingItems.filter(i => i.layer === 'MESO');
    const micro = pendingItems.filter(i => i.layer === 'MICRO');
    
    const renderGroup = (
        items: PendingItem[], 
        label: string, 
        icon: React.ReactNode,
        colorClass: string,
        borderClass: string,
        bgClass: string
    ) => (
        <div className="flex flex-col gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${bgClass} border ${borderClass}`}>
                {icon}
                <span className={`text-[11px] font-mono font-bold ${colorClass}`}>{label}</span>
                <span className={`text-[10px] ${colorClass} opacity-60`}>{items.length} disonancia{items.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-col gap-1.5 pl-4 border-l border-titanium-800">
                {items.length === 0 ? (
                    <div className="flex items-center gap-2 py-2 opacity-40">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        <span className="text-[11px] text-titanium-600">Sin disonancias en esta capa</span>
                    </div>
                ) : (
                    items.map(item => {
                        const isResolved = item.resolved;
                        const severityColor = item.severity === 'critical' 
                            ? 'border-red-500/40 bg-red-500/5' 
                            : item.severity === 'warning' 
                                ? 'border-amber-500/40 bg-amber-500/5'
                                : 'border-titanium-700 bg-titanium-900/30';
                        
                        return (
                            <button
                                key={item.code}
                                onClick={() => !isResolved && onSelectItem?.(item)}
                                disabled={isResolved}
                                className={`
                                    text-left p-3 rounded-lg border transition-all
                                    ${isResolved 
                                        ? 'opacity-40 cursor-default border-titanium-800 bg-titanium-900/20' 
                                        : `${severityColor} hover:border-cyan-500/30 hover:bg-cyan-500/5 cursor-pointer`
                                    }
                                `}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-mono text-titanium-600">{item.code}</span>
                                    {isResolved && <CheckCircle2 size={11} className="text-emerald-500" />}
                                    {!isResolved && item.severity === 'critical' && (
                                        <AlertTriangle size={11} className="text-red-400" />
                                    )}
                                </div>
                                <p className={`text-[12px] font-medium mt-0.5 ${isResolved ? 'text-titanium-600 line-through' : 'text-titanium-300'}`}>
                                    {item.title}
                                </p>
                                {!isResolved && (
                                    <p className="text-[10px] text-titanium-600 mt-0.5 line-clamp-2">
                                        {item.description}
                                    </p>
                                )}
                                {isResolved && item.resolutionText && (
                                    <p className="text-[10px] text-emerald-700 mt-0.5 italic line-clamp-1">
                                        ✓ {item.resolutionText}
                                    </p>
                                )}
                            </button>
                        );
                    })
                )}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-6 p-4 overflow-y-auto custom-scrollbar h-full">
            <div className="text-[11px] font-mono text-titanium-600 uppercase tracking-wider pb-2 border-b border-titanium-800">
                Topología de Disonancias — {pendingItems.filter(i => !i.resolved).length} activas
            </div>
            {renderGroup(macro, 'MACRO', <Layers size={11} className="text-red-400" />, 'text-red-400', 'border-red-500/30', 'bg-red-500/5')}
            {renderGroup(meso, 'MESO', <Zap size={11} className="text-amber-400" />, 'text-amber-400', 'border-amber-500/30', 'bg-amber-500/5')}
            {renderGroup(micro, 'MICRO', <MessageSquare size={11} className="text-blue-400" />, 'text-blue-400', 'border-blue-500/30', 'bg-blue-500/5')}
        </div>
    );
}