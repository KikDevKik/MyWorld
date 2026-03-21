import React, { useState } from 'react';
import { Landmark, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, Lightbulb } from 'lucide-react';
import { PendingItem } from '../hooks/useArquitecto';

interface ArquitectoPendingWidgetProps {
    pendingItems: PendingItem[];
    onOpenArquitecto: () => void;
}

const ArquitectoPendingWidget: React.FC<ArquitectoPendingWidgetProps> = ({
    pendingItems,
    onOpenArquitecto
}) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const criticals = pendingItems.filter(i => i.severity === 'critical');
    const warnings = pendingItems.filter(i => i.severity === 'warning');
    const suggestions = pendingItems.filter(i => i.severity === 'suggestion');

    const totalCount = pendingItems.length;

    if (totalCount === 0) return null;

    return (
        <div className="mx-2 my-1 rounded-lg border border-titanium-700/50 bg-titanium-900/40 overflow-hidden">
            {/* Header — siempre visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-titanium-800/30 transition-colors text-left"
                title={isExpanded ? "Colapsar pendientes" : "Ver pendientes del Arquitecto"}
            >
                <Landmark size={12} className="text-emerald-500/70 shrink-0" />
                <span className="text-[10px] font-bold text-titanium-400 uppercase tracking-wider flex-1">
                    Pendientes
                </span>

                {/* Badges compactos */}
                <div className="flex gap-1 items-center">
                    {criticals.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold bg-red-900/50 text-red-300 px-1 py-0.5 rounded">
                            <AlertCircle size={8} />
                            {criticals.length}
                        </span>
                    )}
                    {warnings.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold bg-amber-900/50 text-amber-300 px-1 py-0.5 rounded">
                            <AlertTriangle size={8} />
                            {warnings.length}
                        </span>
                    )}
                    {suggestions.length > 0 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold bg-blue-900/50 text-blue-300 px-1 py-0.5 rounded">
                            <Lightbulb size={8} />
                            {suggestions.length}
                        </span>
                    )}
                </div>

                {isExpanded
                    ? <ChevronUp size={11} className="text-titanium-500 shrink-0" />
                    : <ChevronDown size={11} className="text-titanium-500 shrink-0" />
                }
            </button>

            {/* Lista expandida */}
            {isExpanded && (
                <div className="border-t border-titanium-800/50 max-h-56 overflow-y-auto">
                    {/* Críticos */}
                    {criticals.map(item => (
                        <div
                            key={item.code}
                            className="flex items-start gap-2 px-2.5 py-2 border-b border-titanium-800/30 hover:bg-red-950/10 transition-colors"
                        >
                            <AlertCircle size={10} className="text-red-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <span className="text-[9px] font-mono text-red-400/70">{item.code} </span>
                                <span className="text-[10px] text-titanium-300 font-medium leading-tight">
                                    {item.title}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* Warnings */}
                    {warnings.map(item => (
                        <div
                            key={item.code}
                            className="flex items-start gap-2 px-2.5 py-2 border-b border-titanium-800/30 hover:bg-amber-950/10 transition-colors"
                        >
                            <AlertTriangle size={10} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <span className="text-[9px] font-mono text-amber-400/70">{item.code} </span>
                                <span className="text-[10px] text-titanium-300 font-medium leading-tight">
                                    {item.title}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* Sugerencias */}
                    {suggestions.map(item => (
                        <div
                            key={item.code}
                            className="flex items-start gap-2 px-2.5 py-2 border-b border-titanium-800/30 hover:bg-blue-950/10 transition-colors"
                        >
                            <Lightbulb size={10} className="text-blue-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <span className="text-[9px] font-mono text-blue-400/70">{item.code} </span>
                                <span className="text-[10px] text-titanium-300 font-medium leading-tight">
                                    {item.title}
                                </span>
                            </div>
                        </div>
                    ))}

                    {/* Botón ir al Arquitecto */}
                    <button
                        onClick={onOpenArquitecto}
                        className="w-full text-[10px] text-emerald-500/70 hover:text-emerald-400 py-2 font-semibold uppercase tracking-wider transition-colors hover:bg-emerald-950/10"
                    >
                        Abrir El Arquitecto →
                    </button>
                </div>
            )}
        </div>
    );
};

export default ArquitectoPendingWidget;
