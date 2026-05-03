import React from 'react';
import { Landmark, AlertCircle, AlertTriangle, Lightbulb, ArrowLeft, X } from 'lucide-react';
import { PendingItem } from '../types/roadmap';
import { useLayoutStore } from '../stores/useLayoutStore';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface ArquitectoPendingWidgetProps {
    pendingItems: PendingItem[];
    onOpenArquitecto: () => void;
    onClose?: () => void;
    isAnalyzing?: boolean;
    hideHeader?: boolean;
}

const ArquitectoPendingWidget: React.FC<ArquitectoPendingWidgetProps> = ({
    pendingItems,
    onOpenArquitecto,
    onClose,
    isAnalyzing = false,
    hideHeader = false,
}) => {
    const setArquitectoWidgetVisible = useLayoutStore(state => state.setArquitectoWidgetVisible);
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const criticals = pendingItems.filter(i => i.severity === 'critical');
    const warnings = pendingItems.filter(i => i.severity === 'warning');
    const suggestions = pendingItems.filter(i => i.severity === 'suggestion');

    return (
        <div className="w-full bg-[#0a0a0a] border-b border-titanium-800 transition-all duration-300 ease-in-out z-20 shadow-lg shadow-black/50">
            <div className="max-w-7xl mx-auto flex flex-col">
                {/* Header interno — solo cuando se usa standalone, no como drawer */}
                {!hideHeader && (
                    <header className="flex items-center justify-between px-6 py-4 border-b border-titanium-800 shrink-0">
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 text-titanium-500 hover:text-titanium-300 transition-colors cursor-pointer group"
                        >
                            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                            <span className="font-medium text-sm">{t?.architect?.toolName || 'El Arquitecto'}</span>
                        </button>

                        <div className="text-titanium-500 text-sm font-medium tracking-wide">
                            Proyecto: Nebulosa
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={onOpenArquitecto}
                                disabled={isAnalyzing}
                                className="flex items-center justify-center rounded px-4 py-1.5 border border-cyan-500 text-cyan-500 text-sm font-semibold hover:bg-cyan-500/10 transition-colors cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAnalyzing ? 'Analizando...' : 'Analizar'}
                            </button>
                            <button
                                onClick={() => setArquitectoWidgetVisible(false)}
                                className="p-1.5 ml-4 rounded hover:bg-titanium-800 text-titanium-500 hover:text-titanium-300 transition-colors"
                                aria-label="Cerrar widget"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </header>
                )}

                {/* Analysis Content */}
                <div className="py-6 px-6 pb-8 bg-[#0a0a0a]">
                    <div className="grid grid-cols-3 gap-6">

                        {/* Column 1: Critical */}
                        <div className="flex flex-col">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-red-500 mb-4 uppercase tracking-wider">
                                <AlertCircle size={16} />
                                Rojo / Crítico
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 custom-scrollbar max-h-80">
                                {criticals.length === 0 ? (
                                    <p className="text-xs text-titanium-600 font-mono">Sin problemas críticos detectados.</p>
                                ) : (
                                    criticals.map(item => (
                                        <div key={item.code} className="bg-titanium-900 border border-titanium-800 rounded-lg p-3 border-l-4 border-l-red-500 hover:bg-titanium-800/50 cursor-pointer transition-colors group">
                                            <div className="font-mono text-xs text-titanium-500 mb-1 group-hover:text-cyan-400 transition-colors">{item.code}</div>
                                            <p className="text-sm text-titanium-300 leading-relaxed">{item.title}: {item.description}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Column 2: Warning */}
                        <div className="flex flex-col">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-500 mb-4 uppercase tracking-wider">
                                <AlertTriangle size={16} />
                                Amarillo / Aviso
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 custom-scrollbar max-h-80">
                                {warnings.length === 0 ? (
                                    <p className="text-xs text-titanium-600 font-mono">Sin advertencias detectadas.</p>
                                ) : (
                                    warnings.map(item => (
                                        <div key={item.code} className="bg-titanium-900 border border-titanium-800 rounded-lg p-3 border-l-4 border-l-amber-500 hover:bg-titanium-800/50 cursor-pointer transition-colors group">
                                            <div className="font-mono text-xs text-titanium-500 mb-1 group-hover:text-cyan-400 transition-colors">{item.code}</div>
                                            <p className="text-sm text-titanium-300 leading-relaxed">{item.title}: {item.description}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Column 3: Suggestion */}
                        <div className="flex flex-col">
                            <h3 className="flex items-center gap-2 text-sm font-semibold text-titanium-500 mb-4 uppercase tracking-wider">
                                <Lightbulb size={16} />
                                Gris / Sugerencia
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-2 pb-4 custom-scrollbar max-h-80">
                                {suggestions.length === 0 ? (
                                    <p className="text-xs text-titanium-600 font-mono">Sin sugerencias pendientes.</p>
                                ) : (
                                    suggestions.map(item => (
                                        <div key={item.code} className="bg-titanium-900 border border-titanium-800 rounded-lg p-3 border-l-4 border-l-titanium-600 hover:bg-titanium-800/50 cursor-pointer transition-colors group">
                                            <div className="font-mono text-xs text-titanium-500 mb-1 group-hover:text-cyan-400 transition-colors">{item.code}</div>
                                            <p className="text-sm text-titanium-300 leading-relaxed">{item.title}: {item.description}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArquitectoPendingWidget;
