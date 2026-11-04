import React, { useState } from 'react';
import { PendingItem } from '../../types/roadmap';
import { CheckCircle2 } from 'lucide-react';
import FalloDialog from './FalloDialog';

interface Props {
    pendingItems: PendingItem[];
    onSelectItem?: (item: PendingItem) => void;
    onOpenDocument?: (fileId: string, quote: string) => void;
}

const LAYERS: { key: 'MACRO' | 'MESO' | 'MICRO'; title: string; hint: string; dot: string }[] = [
    { key: 'MACRO', title: 'Reglas del mundo', hint: 'Magia, historia, economía y cosmología. Si estas fallan, lo demás tiembla.', dot: 'bg-red-400' },
    { key: 'MESO', title: 'Trama y personajes', hint: 'Facciones, arcos y la estructura de la historia.', dot: 'bg-amber-300' },
    { key: 'MICRO', title: 'Escenas y detalles', hint: 'Diálogos, acciones concretas y huecos pequeños.', dot: 'bg-mira' },
];

const SEVERITY: Record<string, string> = { critical: 'Rompe la historia', warning: 'Conviene resolverlo', suggestion: 'Sugerencia' };

/**
 * Mapa de dudas: las contradicciones del canon agrupadas por capa.
 * Nov 2026: letra legible (antes 10–12 px), etiquetas en español y «Ver fallo» con el pasaje exacto.
 */
export default function ColisionesMap({ pendingItems, onSelectItem, onOpenDocument }: Props) {
    const [open, setOpen] = useState<PendingItem | null>(null);
    const active = pendingItems.filter(i => !i.resolved).length;

    return (
        <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-8">
                <p className="text-[15px] text-titanium-300">
                    {active === 0 ? 'No quedan dudas abiertas.' : `${active} ${active === 1 ? 'duda abierta' : 'dudas abiertas'}. Empieza por las reglas del mundo: resolverlas suele resolver otras.`}
                </p>

                {LAYERS.map(layer => {
                    const items = pendingItems.filter(i => (i.layer || 'MACRO') === layer.key);
                    return (
                        <section key={layer.key} aria-labelledby={`capa-${layer.key}`} className="flex flex-col gap-3">
                            <header className="flex items-baseline gap-3">
                                <span className={`w-2 h-2 rounded-full ${layer.dot} shrink-0 translate-y-[-2px]`} aria-hidden="true" />
                                <h3 id={`capa-${layer.key}`} className="font-serif text-lg text-titanium-100">{layer.title}</h3>
                                <span className="text-sm text-titanium-400 tabular-nums">{items.length}</span>
                            </header>
                            <p className="text-sm text-titanium-400 -mt-2 ml-5">{layer.hint}</p>

                            {items.length === 0 ? (
                                <div className="ml-5 flex items-center gap-2 text-sm text-titanium-400">
                                    <CheckCircle2 size={15} className="text-logro" aria-hidden="true" /> Nada pendiente en esta capa.
                                </div>
                            ) : (
                                <ul className="ml-5 flex flex-col gap-2.5">
                                    {items.map(item => (
                                        <li key={item.code}
                                            className={`rounded-xl border px-4 py-3.5 ${item.resolved ? 'border-titanium-800 bg-titanium-900/40' : item.severity === 'critical' ? 'border-red-500/30 bg-titanium-900' : 'border-titanium-700 bg-titanium-900'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className={`text-[15px] font-medium leading-snug ${item.resolved ? 'text-titanium-400 line-through' : 'text-titanium-100'}`}>{item.title}</p>
                                                    {!item.resolved && <p className="text-sm text-titanium-300 mt-1 leading-relaxed line-clamp-2">{item.description}</p>}
                                                    {item.resolved && item.resolutionText && <p className="text-sm text-logro mt-1 line-clamp-2">Resuelto: {item.resolutionText}</p>}
                                                    <p className="text-xs text-titanium-500 mt-2">
                                                        {SEVERITY[item.severity] || ''}
                                                        {item.evidence?.[0]?.file ? ` · ${item.evidence[0].file}` : item.relatedFiles?.[0] ? ` · ${item.relatedFiles[0]}` : ''}
                                                    </p>
                                                </div>
                                                {item.resolved
                                                    ? <CheckCircle2 size={16} className="text-logro shrink-0 mt-0.5" aria-label="Resuelto" />
                                                    : (
                                                        <button onClick={() => setOpen(item)}
                                                            className="shrink-0 text-sm text-mira hover:text-titanium-50 border border-mira/30 hover:border-mira/60 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                                            Ver fallo
                                                        </button>
                                                    )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    );
                })}
            </div>
            {open && <FalloDialog item={open} onClose={() => setOpen(null)} onOpenDocument={onOpenDocument} onDiscuss={onSelectItem} />}
        </div>
    );
}
