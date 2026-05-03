import React from 'react';
import { RoadmapCard } from '../../types/roadmap';
import { Lock, Zap, CheckCircle2 } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface DominoNodeProps {
    card: RoadmapCard;
    isActive?: boolean;
    onClick?: (card: RoadmapCard) => void;
}

const PHASE_LABELS: Record<string, string> = {
    fundacion: 'Fundación',
    conflicto: 'Conflicto',
    desarrollo: 'Desarrollo',
    climax: 'Clímax',
    resolucion: 'Resolución',
};

const PHASE_COLORS: Record<string, string> = {
    fundacion: 'text-sky-400   border-sky-500/30   bg-sky-900/20',
    conflicto: 'text-rose-400  border-rose-500/30  bg-rose-900/20',
    desarrollo: 'text-amber-400 border-amber-500/30 bg-amber-900/20',
    climax: 'text-purple-400 border-purple-500/30 bg-purple-900/20',
    resolucion: 'text-emerald-400 border-emerald-500/30 bg-emerald-900/20',
};

/**
 * DominoNode — Tarjeta visual de una fase del Roadmap.
 * El atributo data-node-id es CRÍTICO para que DominoCanvas
 * calcule las posiciones de las líneas Bezier en el DOM.
 */
const DominoNode: React.FC<DominoNodeProps> = ({ card, isActive, onClick }) => {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];

    const phaseKey = card.phase?.toLowerCase() ?? 'fundacion';
    const phaseLabel = PHASE_LABELS[phaseKey] ?? card.phase;
    const phaseColor = PHASE_COLORS[phaseKey] ?? PHASE_COLORS.fundacion;

    const statusStyles: Record<string, string> = {
        active: 'border-cyan-500/60 shadow-[0_0_24px_rgba(6,182,212,0.12)] bg-[#0d1a1f]',
        completed: 'border-titanium-700/50 bg-[#0d0d10]',
        locked: 'border-titanium-800/40 bg-[#0a0a0c] opacity-50',
    };

    const StatusIcon = () => {
        if (card.status === 'locked') return <Lock size={12} className="text-titanium-600" />;
        if (card.status === 'completed') return <CheckCircle2 size={12} className="text-emerald-500" />;
        return <Zap size={12} className="text-cyan-400 animate-pulse" />;
    };

    return (
        <div
            id={`node-${card.id}`}
            data-node-id={card.id}
            onClick={() => card.status !== 'locked' && onClick?.(card)}
            className={`
                relative w-52 shrink-0 rounded-xl border p-4 z-10
                transition-all duration-300
                ${statusStyles[card.status] ?? statusStyles.locked}
                ${card.status !== 'locked' ? 'cursor-pointer hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.18)]' : 'cursor-not-allowed'}
                ${isActive ? 'ring-2 ring-cyan-400/60 ring-offset-2 ring-offset-[#0a0a0a]' : ''}
            `}
            role={card.status !== 'locked' ? 'button' : undefined}
            aria-label={`${t.common?.phase || 'Fase'} ${phaseLabel}: ${card.title}`}
        >
            {/* Phase Badge */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border mb-3 ${phaseColor}`}>
                {phaseLabel}
            </span>

            {/* Status icon */}
            <div className="absolute top-3 right-3">
                <StatusIcon />
            </div>

            {/* Title */}
            <h3 className="text-titanium-100 text-sm font-semibold leading-snug mb-1.5 pr-4">
                {card.title}
            </h3>

            {/* Description */}
            <p className="text-titanium-500 text-[12px] leading-relaxed line-clamp-3">
                {card.description}
            </p>

            {/* Missions indicator */}
            {card.missions && card.missions.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-titanium-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-titanium-600 uppercase tracking-wider">
                        {t.common?.missions || "Misiones"}
                    </span>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${card.status === 'active'
                            ? 'text-cyan-400 bg-cyan-900/30'
                            : 'text-titanium-500 bg-titanium-800/30'
                        }`}>
                        {card.missions.length}
                    </span>
                </div>
            )}

            {/* Impact score bar */}
            {card.impactScore > 0 && (
                <div className="mt-2">
                    <div className="h-0.5 w-full bg-titanium-800/60 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-700 ${card.impactScore > 70 ? 'bg-rose-500' :
                                    card.impactScore > 40 ? 'bg-amber-500' : 'bg-cyan-500'
                                }`}
                            style={{ width: `${Math.min(card.impactScore, 100)}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default DominoNode;
