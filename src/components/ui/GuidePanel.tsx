import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { MiraSprite } from '../mira/MiraSprite';
import ConoceTuCasa from '../../tour/ConoceTuCasa';

// Nov 2026: la guía usa la casa (un cuarto por herramienta, con su objeto pixel) en vez de las herramientas antiguas.
interface GuidePanelProps {
    onClose: () => void;
}


export default function GuidePanel({ onClose }: GuidePanelProps) {
    const { currentLanguage } = useLanguageStore();
    const es = currentLanguage === 'es';
    const closeRef = useRef<HTMLButtonElement>(null);
    useEffect(() => {
        closeRef.current?.focus();
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div role="dialog" aria-modal="true" aria-labelledby="casa-title"
                className="relative w-full max-w-xl bg-titanium-900 border border-titanium-700 rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex justify-end px-3 pt-3">
                    <button ref={closeRef} onClick={onClose} aria-label={es ? 'Cerrar' : 'Close'}
                        className="p-2 rounded-lg text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 transition-colors">
                        <X size={18} />
                    </button>
                </div>
                {/* Nov 2026: la guía es «Conoce tu casa» (los cuartos descubiertos y «Muéstrame»), la misma de la biblioteca. */}
                <div className="px-6 pb-5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    <ConoceTuCasa onNavigate={onClose} />
                </div>

                <div className="flex items-center gap-3 px-6 py-4 border-t border-titanium-800 bg-titanium-950/40">
                    <MiraSprite pose="contenta" face label="Mira" className="shrink-0" />
                    <p className="text-sm text-titanium-300 flex-1">{es ? '¿Buscas consejos para escribir o enfocarte?' : 'Looking for writing or focus tips?'}</p>
                    <button type="button" onClick={() => { onClose(); window.dispatchEvent(new Event('OPEN_TIPS')); }}
                        className="text-sm font-semibold text-mira hover:underline underline-offset-4">
                        {es ? 'Abrir el rincón de tips' : 'Open the tips corner'}
                    </button>
                </div>
            </div>
        </div>
    );
}
