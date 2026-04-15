import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Zap, Layers, MessageSquare, Info, X } from 'lucide-react';
import { PendingItem } from '../../types/roadmap';

interface Props {
    pendingItems: PendingItem[];
    isOpen: boolean;
    onToggle: () => void;
    onSelectItem?: (item: PendingItem) => void;
    activeItemCode?: string;
}

const LAYER_CONFIG = {
    MACRO: {
        label: 'MACRO',
        sublabel: 'Worldbuilding · Magia · Economía',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        dot: 'bg-red-500',
        icon: <Layers size={12} />
    },
    MESO: {
        label: 'MESO', 
        sublabel: 'Estructura · Facciones · Personajes',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        icon: <Zap size={12} />
    },
    MICRO: {
        label: 'MICRO',
        sublabel: 'Escenas · Diálogos · Detalles',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        dot: 'bg-blue-500',
        icon: <MessageSquare size={12} />
    }
};

export default function ContradiccionesDrawer({ pendingItems, isOpen, onToggle, onSelectItem, activeItemCode }: Props) {
    const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set(['MACRO']));
    const [detailItem, setDetailItem] = useState<PendingItem | null>(null);
    
    const pendingOnly = pendingItems.filter(i => !i.resolved);
    const resolvedCount = pendingItems.filter(i => i.resolved).length;
    
    // Agrupar por capa
    const byLayer = {
        MACRO: pendingOnly.filter(i => (i.layer || 'MACRO') === 'MACRO'),
        MESO: pendingOnly.filter(i => i.layer === 'MESO'),
        MICRO: pendingOnly.filter(i => i.layer === 'MICRO'),
    };

    const toggleLayer = (layer: string) => {
        setExpandedLayers(prev => {
            const next = new Set(prev);
            next.has(layer) ? next.delete(layer) : next.add(layer);
            return next;
        });
    };

    if (!isOpen) {
        // Versión colapsada — solo muestra contadores
        return (
            <div 
                onClick={onToggle}
                className="flex items-center justify-center gap-4 px-6 py-2 border-b border-titanium-800 bg-[#0a0a0a]/80 cursor-pointer hover:bg-titanium-950/50 transition-colors shrink-0"
            >
                {(['MACRO', 'MESO', 'MICRO'] as const).map(layer => {
                    const count = byLayer[layer].length;
                    if (count === 0) return null;
                    const cfg = LAYER_CONFIG[layer];
                    return (
                        <div key={layer} className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            <span className={`text-[11px] font-mono ${cfg.color}`}>{layer}</span>
                            <span className="text-[11px] text-titanium-500">{count}</span>
                        </div>
                    );
                })}
                {resolvedCount > 0 && (
                    <div className="flex items-center gap-1.5 opacity-50">
                        <CheckCircle2 size={11} className="text-emerald-500" />
                        <span className="text-[11px] text-titanium-600">{resolvedCount} resueltos</span>
                    </div>
                )}
                <ChevronDown size={14} className="text-titanium-600 ml-2" />
            </div>
        );
    }

    return (
        <>
            <div className="border-b border-titanium-800 bg-[#0a0a0c] shrink-0 max-h-[40vh] overflow-y-auto custom-scrollbar relative">
                {/* Header del drawer */}
                <div 
                    onClick={onToggle}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-titanium-950/30 sticky top-0 bg-[#0a0a0c] z-10 border-b border-titanium-800/50"
                >
                    <span className="text-[11px] font-mono text-titanium-500 uppercase tracking-wider">
                        Disonancias Activas — {pendingOnly.length} pendientes · {resolvedCount} resueltas
                    </span>
                    <ChevronUp size={14} className="text-titanium-600" />
                </div>

                {/* Grupos por capa */}
                {(['MACRO', 'MESO', 'MICRO'] as const).map(layer => {
                    const items = byLayer[layer];
                    if (items.length === 0) return null;
                    const cfg = LAYER_CONFIG[layer];
                    const isExpanded = expandedLayers.has(layer);

                    return (
                        <div key={layer} className="border-b border-titanium-800/30 last:border-0">
                            {/* Header de capa */}
                            <button
                                onClick={() => toggleLayer(layer)}
                                className={`w-full flex items-center justify-between px-6 py-2.5 hover:bg-titanium-900/30 transition-colors ${cfg.bg}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                    <span className={`text-[11px] font-mono font-semibold ${cfg.color}`}>{layer}</span>
                                    <span className="text-[10px] text-titanium-600">{cfg.sublabel}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                        {items.length}
                                    </span>
                                    {isExpanded ? <ChevronUp size={12} className="text-titanium-600" /> : <ChevronDown size={12} className="text-titanium-600" />}
                                </div>
                            </button>

                            {/* Items de la capa */}
                            {isExpanded && (
                                <div className="divide-y divide-titanium-800/20">
                                    {items.map((item, idx) => {
                                        const isActive = item.code === activeItemCode;
                                        const severityColor = item.severity === 'critical' ? 'text-red-400' : item.severity === 'warning' ? 'text-amber-400' : 'text-blue-400';
                                        
                                        return (
                                            <div key={`${item.code}-${idx}`} className={`w-full group flex flex-col px-6 py-3 transition-colors hover:bg-titanium-900/40 ${isActive ? 'bg-cyan-500/5 border-l-2 border-cyan-500' : ''}`}>
                                                <div 
                                                    className="flex items-start gap-2 cursor-pointer flex-1"
                                                    onClick={() => onSelectItem?.(item)}
                                                    onDoubleClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                                                >
                                                    <Circle size={12} className={`${severityColor} mt-0.5 shrink-0`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-mono text-titanium-600">{item.code}</span>
                                                                <span className={`text-[10px] font-mono ${severityColor}`}>{item.severity}</span>
                                                            </div>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setDetailItem(item); }}
                                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-titanium-800 rounded flex items-center gap-1 text-titanium-400 hover:text-white"
                                                                title="Ver detalle"
                                                            >
                                                                <Info size={12} />
                                                                <span className="text-[10px]">Detalle</span>
                                                            </button>
                                                        </div>
                                                        <p className="text-[13px] text-titanium-300 font-medium truncate pr-4">{item.title}</p>
                                                        <p className="text-[11px] text-titanium-600 line-clamp-1 mt-0.5">{item.description}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Resueltos (colapsados por defecto) */}
                {resolvedCount > 0 && (
                    <div className="px-6 py-3 flex items-center gap-2 opacity-50">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        <span className="text-[11px] text-titanium-600">{resolvedCount} contradicción(es) resuelta(s)</span>
                    </div>
                )}
            </div>

            {/* Modal de Detalle */}
            {detailItem && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="bg-[#0f0f13] border border-titanium-700/50 rounded-lg shadow-2xl max-w-lg w-full max-h-[90%] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-titanium-800/50">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-mono px-2 py-1 rounded bg-titanium-900 text-titanium-400">
                                    {detailItem.code}
                                </span>
                                <span className={`text-xs font-mono ${
                                    detailItem.severity === 'critical' ? 'text-red-400' : 
                                    detailItem.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'
                                }`}>
                                    {detailItem.severity.toUpperCase()}
                                </span>
                            </div>
                            <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-titanium-800 rounded text-titanium-400 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
                            <h3 className="text-lg font-medium text-titanium-100 mb-4">{detailItem.title}</h3>
                            <div className="bg-titanium-900/30 border border-titanium-800/50 rounded p-4">
                                <p className="text-sm text-titanium-300 leading-relaxed whitespace-pre-wrap">
                                    {detailItem.description}
                                </p>
                            </div>
                        </div>
                        <div className="p-4 border-t border-titanium-800/50 bg-[#0a0a0c] rounded-b-lg flex justify-end gap-3">
                            <button 
                                onClick={() => setDetailItem(null)}
                                className="px-4 py-2 text-xs font-medium text-titanium-400 hover:text-white transition-colors"
                            >
                                Cerrar
                            </button>
                            <button 
                                onClick={() => {
                                    onSelectItem?.(detailItem);
                                    setDetailItem(null);
                                }}
                                className="px-4 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
                            >
                                Enviar al chat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}