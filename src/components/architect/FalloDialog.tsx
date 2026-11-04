import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, MessageSquare } from 'lucide-react';
import { PendingItem } from '../../types/roadmap';

const LAYER_LABEL: Record<string, string> = { MACRO: 'Reglas del mundo', MESO: 'Trama y personajes', MICRO: 'Escenas y detalles' };
const SEVERITY_LABEL: Record<string, { text: string; cls: string }> = {
    critical: { text: 'Rompe la historia', cls: 'text-red-300 bg-red-500/10 border-red-500/30' },
    warning: { text: 'Conviene resolverlo', cls: 'text-amber-200 bg-amber-500/10 border-amber-500/30' },
    suggestion: { text: 'Sugerencia', cls: 'text-titanium-300 bg-titanium-800 border-titanium-700' },
};

/**
 * Nov 2026: «Ver fallo». El aviso del Arquitecto con el pasaje exacto de tu canon donde se ve el
 * problema, para no tener que buscarlo. Las citas se comprueban en el servidor contra el archivo real.
 */
export default function FalloDialog({ item, onClose, onOpenDocument, onDiscuss }: {
    item: PendingItem;
    onClose: () => void;
    onOpenDocument?: (fileId: string, quote: string) => void;
    onDiscuss?: (item: PendingItem) => void;
}) {
    const boxRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const prev = document.activeElement as HTMLElement | null;
        boxRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', onKey, true);
        return () => { window.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
    }, [onClose]);

    const evidence = item.evidence || [];
    const sev = SEVERITY_LABEL[item.severity] || SEVERITY_LABEL.suggestion;

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-titanium-950/55 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
            <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fallo-title"
                className="focus-visible:outline-none relative w-full max-w-[680px] max-h-[86vh] flex flex-col rounded-2xl border border-titanium-700 bg-titanium-950 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
                <div className="flex items-start gap-3 px-6 pt-5 pb-4 border-b border-titanium-800">
                    <img src="/assets/objetos/planos.png" alt="" width={40} height={40} className="w-10 h-10 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-titanium-400">
                            <span className={`px-2 py-0.5 rounded-full border ${sev.cls}`}>{sev.text}</span>
                            {item.layer && <span>{LAYER_LABEL[item.layer] || item.layer}</span>}
                            <span className="text-titanium-500 tabular-nums">{item.code}</span>
                        </div>
                        <h2 id="fallo-title" className="font-serif text-xl text-titanium-100 mt-1.5 text-pretty">{item.title}</h2>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar"
                        className="p-1.5 -mr-1 rounded-lg text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>

                <div className="overflow-y-auto overscroll-contain px-6 py-5 flex flex-col gap-5">
                    <p className="text-[15px] leading-relaxed text-titanium-200">{item.description}</p>

                    {evidence.length > 0 ? (
                        <div className="flex flex-col gap-3">
                            <h3 className="text-sm text-titanium-300">Dónde está en tu canon</h3>
                            {evidence.map((e, i) => (
                                <figure key={i} className="rounded-xl border border-titanium-700 bg-titanium-900 overflow-hidden">
                                    <figcaption className="flex items-center gap-2 px-4 py-2 border-b border-titanium-800 text-sm text-titanium-300">
                                        <FileText size={14} className="text-mira shrink-0" aria-hidden="true" />
                                        <span className="truncate">{e.file}</span>
                                    </figcaption>
                                    <blockquote className="px-4 py-3 font-serif text-[15px] leading-relaxed text-titanium-100 border-l-2 border-mira/70 ml-4 my-3 pl-3">
                                        <span className="underline decoration-wavy decoration-amber-300/70 underline-offset-4">{e.quote}</span>
                                    </blockquote>
                                    {e.issue && (
                                        <p className="px-4 pb-3 text-sm text-mira leading-relaxed">
                                            <span className="text-titanium-400">Lo que falla aquí: </span>{e.issue}
                                        </p>
                                    )}
                                    {onOpenDocument && e.fileId && (
                                        <div className="px-4 pb-3">
                                            <button onClick={() => onOpenDocument(e.fileId!, e.quote)}
                                                className="text-sm text-titanium-200 hover:text-titanium-50 border border-titanium-700 hover:border-titanium-500 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                                Abrir en el documento
                                            </button>
                                        </div>
                                    )}
                                </figure>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-titanium-800 bg-titanium-900/60 px-4 py-3 text-sm text-titanium-400 leading-relaxed">
                            {item.relatedFiles?.length
                                ? <>Archivos relacionados: <span className="text-titanium-200">{item.relatedFiles.join(', ')}</span>. </>
                                : null}
                            Este aviso no trae el pasaje exacto: es de antes de que el Arquitecto marcara dónde está cada fallo. Busca dudas en tu canon otra vez para verlo.
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-6 py-4 border-t border-titanium-800">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-titanium-300 hover:text-titanium-100 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">Cerrar</button>
                    {onDiscuss && !item.resolved && (
                        <button onClick={() => { onDiscuss(item); onClose(); }}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                            <MessageSquare size={15} aria-hidden="true" /> Resolverlo con el Arquitecto
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
