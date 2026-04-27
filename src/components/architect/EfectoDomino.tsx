import React from 'react';
import { ZoomIn } from 'lucide-react';
import { RoadmapCard } from '../../types/roadmap';
import DominoCanvas from './DominoCanvas';

interface EfectoDominoProps {
    onClose: () => void;
    roadmapCards?: RoadmapCard[];
}

/**
 * EfectoDomino — Wrapper que alimenta DominoCanvas con las tarjetas del Roadmap.
 *
 * Ahora vive dentro de <SlideUpPanel> (ArquitectoPanel.tsx),
 * por lo que ya NO necesita su propio contenedor absoluto ni header.
 * Solo renderiza la barra de herramientas interna y el Canvas.
 */
const EfectoDomino: React.FC<EfectoDominoProps> = ({ onClose, roadmapCards = [] }) => {

    return (
        <div className="flex flex-col h-full min-h-[300px]">

            {/* Sub-toolbar interna del Canvas */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-titanium-800/40 shrink-0 bg-[#0a0a0c]">
                <div className="flex items-center gap-3 text-[11px] font-mono text-titanium-600 uppercase tracking-wider">
                    <span>{roadmapCards.length} fase{roadmapCards.length !== 1 ? 's' : ''}</span>
                    {roadmapCards.length > 0 && (
                        <span className="text-titanium-700">·</span>
                    )}
                    {roadmapCards.length > 0 && (
                        <span className="text-cyan-600">
                            {roadmapCards.filter((c: any) => c.status === 'active').length} activa{roadmapCards.filter((c: any) => c.status === 'active').length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <button
                    disabled
                    title="Zoom — próximamente"
                    className="px-2 py-1 text-[10px] font-mono text-titanium-700 border border-titanium-800/50 rounded flex items-center gap-1 opacity-40 cursor-not-allowed"
                >
                    <ZoomIn size={11} />
                    100%
                </button>
            </div>

            {/* Canvas principal */}
            <div className="flex-1 overflow-hidden bg-[#0a0a0a] relative">
                {/* Grid de fondo sutil */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.025]">
                    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <pattern id="domino-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
                            </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#domino-grid)" className="text-titanium-100" />
                    </svg>
                </div>

                {/* Canvas dinámico */}
                <DominoCanvas
                    cards={roadmapCards}
                    onCardClick={(card) => {
                        console.log('[EfectoDomino] Card clicked:', card.id, card.title);
                    }}
                />
            </div>
        </div>
    );
};

export default EfectoDomino;
