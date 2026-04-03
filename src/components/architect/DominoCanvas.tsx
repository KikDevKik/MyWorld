import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RoadmapCard } from '../../types/roadmap';
import DominoNode from './DominoNode';

interface DominoCanvasProps {
    cards: RoadmapCard[];
    onCardClick?: (card: RoadmapCard) => void;
}

interface BezierPath {
    d: string;
    isActive: boolean;
}

const BEZIER_OFFSET = 80; // Distancia horizontal del punto de control

/**
 * DominoCanvas — Motor de renderizado del Roadmap.
 *
 * Arquitectura:
 * - Un contenedor con scroll horizontal contiene los DominoNode de izquierda a derecha.
 * - Un <svg> absoluto detrás de los nodos renderiza las curvas Bezier que los conectan.
 * - Un useEffect recalcula las posiciones leyendo data-node-id del DOM cada vez que
 *   cambian las cards o se redimensiona la ventana.
 */
const DominoCanvas: React.FC<DominoCanvasProps> = ({ cards, onCardClick }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [paths, setPaths] = useState<BezierPath[]>([]);
    const [activeCardId, setActiveCardId] = useState<string | null>(null);

    const calculatePaths = useCallback(() => {
        if (!containerRef.current || cards.length < 2) {
            setPaths([]);
            return;
        }

        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const newPaths: BezierPath[] = [];

        for (let i = 0; i < cards.length - 1; i++) {
            const fromCard = cards[i];
            const toCard = cards[i + 1];

            const fromEl = container.querySelector(`[data-node-id="${fromCard.id}"]`);
            const toEl = container.querySelector(`[data-node-id="${toCard.id}"]`);

            if (!fromEl || !toEl) continue;

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();

            // Centro-derecho del nodo origen
            const startX = fromRect.right - containerRect.left + container.scrollLeft;
            const startY = fromRect.top - containerRect.top + fromRect.height / 2;

            // Centro-izquierdo del nodo destino
            const endX = toRect.left - containerRect.left + container.scrollLeft;
            const endY = toRect.top - containerRect.top + toRect.height / 2;

            // Curva Bezier cúbica S-Curve
            const d = `M ${startX} ${startY} C ${startX + BEZIER_OFFSET} ${startY}, ${endX - BEZIER_OFFSET} ${endY}, ${endX} ${endY}`;

            const isActive = fromCard.status === 'active' || toCard.status === 'active';
            newPaths.push({ d, isActive });
        }

        setPaths(newPaths);
    }, [cards]);

    // Recalcular al montar, al cambiar cards, y al redimensionar ventana
    useEffect(() => {
        // Pequeño delay para garantizar que el DOM ya pintó los nodos
        const rafId = requestAnimationFrame(() => {
            calculatePaths();
        });
        return () => cancelAnimationFrame(rafId);
    }, [calculatePaths]);

    useEffect(() => {
        const handleResize = () => calculatePaths();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calculatePaths]);

    const handleCardClick = (card: RoadmapCard) => {
        setActiveCardId(prev => prev === card.id ? null : card.id);
        onCardClick?.(card);
    };

    if (cards.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-10 opacity-60">
                <div className="w-16 h-16 rounded-full border border-titanium-800 flex items-center justify-center mb-4">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-titanium-600">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                    </svg>
                </div>
                <p className="text-titanium-400 text-sm">
                    El Roadmap se generará al inicializar El Arquitecto.
                </p>
                <p className="text-titanium-600 text-xs font-mono mt-1">
                    Presiona "Analizar" para crear la Línea de Escritura.
                </p>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full overflow-x-auto overflow-y-hidden canvas-scroll"
            style={{ minHeight: '220px' }}
        >
            {/* SVG de conexiones — detrás de los nodos */}
            <svg
                className="absolute inset-0 pointer-events-none z-0"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
                aria-hidden="true"
            >
                <defs>
                    {/* Gradiente para líneas activas */}
                    <linearGradient id="activeLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#0891b2" stopOpacity="0.3" />
                    </linearGradient>
                    {/* Gradiente para líneas inactivas */}
                    <linearGradient id="inactiveLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#404040" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#303030" stopOpacity="0.2" />
                    </linearGradient>
                </defs>

                {paths.map((p, i) => (
                    <g key={i}>
                        {/* Sombra suave de la línea */}
                        {p.isActive && (
                            <path
                                d={p.d}
                                fill="none"
                                stroke="rgba(6,182,212,0.08)"
                                strokeWidth="8"
                                strokeLinecap="round"
                            />
                        )}
                        {/* Línea principal */}
                        <path
                            d={p.d}
                            fill="none"
                            stroke={p.isActive ? 'url(#activeLineGrad)' : 'url(#inactiveLineGrad)'}
                            strokeWidth={p.isActive ? 1.5 : 1}
                            strokeLinecap="round"
                            strokeDasharray={p.isActive ? undefined : '4 4'}
                        />
                        {/* Punto de llegada */}
                        <circle
                            r="3"
                            fill={p.isActive ? '#06b6d4' : '#404040'}
                            style={{
                                offsetPath: `path('${p.d}')`,
                                offsetDistance: '100%',
                                position: 'relative',
                            }}
                        />
                    </g>
                ))}
            </svg>

            {/* Nodos — sobre el SVG */}
            <div className="relative z-10 flex gap-20 items-center px-10 py-8 min-w-max h-full">
                {cards.map(card => (
                    <DominoNode
                        key={card.id}
                        card={card}
                        isActive={activeCardId === card.id}
                        onClick={handleCardClick}
                    />
                ))}
            </div>
        </div>
    );
};

export default DominoCanvas;
