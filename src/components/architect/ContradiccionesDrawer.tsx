import React, { useState } from 'react';
import { ChevronDown, ChevronUp, CheckCircle2, Circle, Zap, Layers, MessageSquare, Info, X } from 'lucide-react';
import { PendingItem } from '../../types/roadmap';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface Props {
    pendingItems: PendingItem[];
    isOpen: boolean;
    onToggle: () => void;
    onSelectItem?: (item: PendingItem) => void;
    activeItemCode?: string;
    onShowFallo?: (item: PendingItem) => void;
}

const getLayerConfig = (t: any) => ({
    MACRO: {
        label: 'Reglas del mundo',
        sublabel: 'Magia, historia, economía',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        dot: 'bg-red-500',
        icon: <Layers size={12} />
    },
    MESO: {
        label: 'Trama y personajes',
        sublabel: 'Estructura, facciones, arcos',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        icon: <Zap size={12} />
    },
    MICRO: {
        label: 'Escenas y detalles',
        sublabel: 'Diálogos y acciones concretas',
        color: 'text-mira',
        bg: 'bg-mira/10',
        border: 'border-mira/30',
        dot: 'bg-mira',
        icon: <MessageSquare size={12} />
    }
});

export default function ContradiccionesDrawer({ pendingItems, isOpen, onToggle, onSelectItem, activeItemCode, onShowFallo }: Props) {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tArch = t.architect;
    const LAYER_CONFIG = getLayerConfig(t);

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
                className="flex items-center justify-center gap-4 px-6 py-2 border-b border-titanium-800 bg-titanium-950/80 cursor-pointer hover:bg-titanium-950/50 transition-colors shrink-0"
            >
                {(['MACRO', 'MESO', 'MICRO'] as const).map(layer => {
                    const count = byLayer[layer].length;
                    if (count === 0) return null;
                    const cfg = LAYER_CONFIG[layer];
                    return (
                        <div key={layer} className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            <span className={`text-sm ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-sm text-titanium-500">{count}</span>
                        </div>
                    );
                })}
                {resolvedCount > 0 && (
                    <div className="flex items-center gap-1.5 opacity-50">
                        <CheckCircle2 size={11} className="text-emerald-500" />
                        <span className="text-sm text-titanium-400">{resolvedCount} {t.common?.resolved || 'resueltos'}</span>
                    </div>
                )}
                <ChevronDown size={14} className="text-titanium-400 ml-2" />
            </div>
        );
    }

    return (
        <>
            <div className="border-b border-titanium-800 bg-titanium-950 shrink-0 max-h-[40vh] overflow-y-auto custom-scrollbar relative">
                {/* Header del drawer */}
                <div 
                    onClick={onToggle}
                    className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-titanium-950/30 sticky top-0 bg-titanium-950 z-10 border-b border-titanium-800/50"
                >
                    <span className="text-sm text-titanium-500">
                        Dudas del canon: {pendingOnly.length} {pendingOnly.length === 1 ? 'abierta' : 'abiertas'}{resolvedCount ? ` · ${resolvedCount} ${resolvedCount === 1 ? 'resuelta' : 'resueltas'}` : ''}
                    </span>
                    <ChevronUp size={14} className="text-titanium-400" />
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
                                    <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                                    <span className="text-xs text-titanium-400">{cfg.sublabel}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                        {items.length}
                                    </span>
                                    {isExpanded ? <ChevronUp size={12} className="text-titanium-400" /> : <ChevronDown size={12} className="text-titanium-400" />}
                                </div>
                            </button>

                            {/* Items de la capa */}
                            {isExpanded && (
                                <div className="divide-y divide-titanium-800/20">
                                    {items.map((item, idx) => {
                                        const isActive = item.code === activeItemCode;
                                        const severityColor = item.severity === 'critical' ? 'text-red-400' : item.severity === 'warning' ? 'text-amber-400' : 'text-blue-400';
                                        
                                        return (
                                            <div key={`${item.code}-${idx}`} className={`w-full group flex flex-col px-6 py-3 transition-colors hover:bg-titanium-900/40 ${isActive ? 'bg-mira/5 border-l-2 border-mira' : ''}`}>
                                                <div 
                                                    className="flex items-start gap-2 cursor-pointer flex-1"
                                                    onClick={() => onSelectItem?.(item)}
                                                    onDoubleClick={(e) => { e.stopPropagation(); onShowFallo ? onShowFallo(item) : setDetailItem(item); }}
                                                >
                                                    <Circle size={12} className={`${severityColor} mt-0.5 shrink-0`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-titanium-400">{item.code}</span>
                                                                <span className={`text-xs ${severityColor}`}>{item.severity === 'critical' ? 'Rompe la historia' : item.severity === 'warning' ? 'Conviene resolverlo' : 'Sugerencia'}</span>
                                                            </div>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); onShowFallo ? onShowFallo(item) : setDetailItem(item); }}
                                                                className="shrink-0 px-2.5 py-1 rounded-lg border border-mira/30 hover:border-mira/60 flex items-center gap-1 text-mira hover:text-titanium-50 transition-colors"
                                                                title="Ver el pasaje del canon donde está el problema"
                                                            >
                                                                <Info size={13} />
                                                                <span className="text-xs">Ver fallo</span>
                                                            </button>
                                                        </div>
                                                        <p className="text-[15px] text-titanium-300 font-medium truncate pr-4">{item.title}</p>
                                                        <p className="text-sm text-titanium-400 line-clamp-1 mt-0.5">{item.description}</p>
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
                        <span className="text-sm text-titanium-400">{resolvedCount} {tArch.resolvedDissonancesCountDesc?.replace('{count}', String(resolvedCount)) || `${resolvedCount} contradicción(es) resuelta(s)`}</span>
                    </div>
                )}
            </div>

            {/* Modal de Detalle */}
            {detailItem && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="bg-titanium-900 border border-titanium-700/50 rounded-lg shadow-2xl max-w-lg w-full max-h-[90%] flex flex-col animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-4 border-b border-titanium-800/50">
                            <div className="flex items-center gap-3">
                                <span className="text-xs px-2 py-1 rounded bg-titanium-900 text-titanium-400">
                                    {detailItem.code}
                                </span>
                                <span className={`text-xs ${
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
                        <div className="p-4 border-t border-titanium-800/50 bg-titanium-950 rounded-b-lg flex justify-end gap-3">
                            <button 
                                onClick={() => setDetailItem(null)}
                                className="px-4 py-2 text-xs font-medium text-titanium-400 hover:text-white transition-colors"
                            >
                                {t.common?.close || "Cerrar"}
                            </button>
                            <button 
                                onClick={() => {
                                    onSelectItem?.(detailItem);
                                    setDetailItem(null);
                                }}
                                className="px-4 py-2 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded transition-colors"
                            >
                                {t.common?.sendToChat || "Enviar al chat"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}