import React, { useEffect } from 'react';
import { X, LayoutTemplate } from 'lucide-react';

// Nov 2026: la bienvenida de Mira, con los colores de la app y lo que hace hoy.
// Ya no se cierra sola: cada quien la lee a su ritmo.

interface DirectorWelcomeOverlayProps {
    onDismiss: () => void;
}

const HistorialIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
    </svg>
);

const CAPABILITIES = [
    'Cuéntale en qué parte vas o dónde te trabaste: te pregunta lo justo para que encuentres tu próxima escena.',
    'Conoce tu canon y lo que has decidido. Si algo que escribes choca con eso, te lo dice.',
    'Puedes compartirle imágenes, documentos o un fragmento de tu capítulo.',
    'Nunca escribe por ti. Si le pides un ejemplo, lo marca como ejemplo: la voz es tuya.',
];

export function DirectorWelcomeOverlay({ onDismiss }: DirectorWelcomeOverlayProps) {
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onDismiss(); } };
        window.addEventListener('keydown', k, true);
        return () => window.removeEventListener('keydown', k, true);
    }, [onDismiss]);

    return (
        <div
            role="dialog"
            aria-label="Cómo trabaja Mira"
            className="absolute top-3 right-3 left-3 sm:left-auto sm:w-[300px] z-20 max-h-[calc(100%-24px)] overflow-y-auto rounded-2xl border border-titanium-700 bg-titanium-900 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        >
            <div className="p-4">
                <button onClick={onDismiss} aria-label="Cerrar" className="absolute top-2.5 right-2.5 p-1 rounded-md text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800">
                    <X size={15} aria-hidden="true" />
                </button>

                <div className="flex items-center gap-3 mb-3 pr-6">
                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div>
                        <h3 className="font-serif text-[15px] text-titanium-50 leading-tight">Hola, soy Mira</h3>
                        <p className="text-xs text-titanium-400">Te acompaño mientras escribes</p>
                    </div>
                </div>

                <ul className="flex flex-col gap-2 mb-3">
                    {CAPABILITIES.map((cap, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-titanium-200 leading-snug">
                            <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-mira shrink-0" aria-hidden="true" />
                            <span>{cap}</span>
                        </li>
                    ))}
                </ul>

                <div className="border-t border-titanium-800 pt-3 mb-4 flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center gap-2 text-titanium-300"><span className="text-titanium-400 w-4 flex justify-center"><HistorialIcon /></span>Tus conversaciones anteriores</div>
                    <div className="flex items-center gap-2 text-titanium-300"><span className="text-titanium-400 w-4 flex justify-center"><LayoutTemplate size={14} aria-hidden="true" /></span>Ampliar la ventana</div>
                </div>

                <button onClick={onDismiss} className="w-full py-2 rounded-lg text-sm font-medium bg-coral text-on-coral hover:brightness-110">
                    Entendido
                </button>
            </div>
        </div>
    );
}
