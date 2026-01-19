import React from 'react';
import { Gavel, Feather, Skull, Target } from 'lucide-react';

interface JudgeVerdict {
    verdict: string;
    critique: string;
    score: number;
}

interface TribunalData {
    architect: JudgeVerdict;
    bard: JudgeVerdict;
    hater: JudgeVerdict;
}

interface VerdictCardProps {
    data: TribunalData;
}

export const VerdictCard: React.FC<VerdictCardProps> = ({ data }) => {
    // Calculate Average Score
    const avgScore = ((data.architect.score + data.bard.score + data.hater.score) / 3).toFixed(1);

    const getScoreColor = (score: number) => {
        if (score >= 8) return "text-emerald-400";
        if (score >= 5) return "text-amber-400";
        return "text-red-400";
    };

    return (
        <div className="mx-auto w-[98%] bg-red-950/10 backdrop-blur-sm border border-red-500/50 rounded-lg p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 shadow-lg shadow-red-900/10">
            {/* HEADER */}
            <div className="flex items-center justify-between p-3 bg-red-900/20 border-b border-red-500/30">
                <div className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase tracking-wider">
                    <Gavel size={16} />
                    <span>Veredicto del Tribunal</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-purple-300 uppercase opacity-70">Puntuación Global</span>
                    <span className={`text-lg font-bold ${getScoreColor(parseFloat(avgScore))}`}>{avgScore}</span>
                </div>
            </div>

            {/* COLUMNS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-red-500/20">

                {/* ARCHITECT */}
                <div className="p-3 bg-titanium-900/30">
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <Target size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">El Arquitecto</span>
                        <span className="ml-auto text-xs font-bold text-blue-300">{data.architect.score}/10</span>
                    </div>
                    <div className="min-h-[40px] mb-2">
                        <p className="text-[11px] font-bold text-titanium-200 leading-tight">"{data.architect.verdict}"</p>
                    </div>
                    <p className="text-[10px] text-titanium-400 italic border-l border-blue-500/30 pl-2 leading-relaxed">
                        {data.architect.critique}
                    </p>
                </div>

                {/* BARD */}
                <div className="p-3 bg-titanium-900/30">
                    <div className="flex items-center gap-2 mb-2 text-pink-400">
                        <Feather size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">El Bardo</span>
                        <span className="ml-auto text-xs font-bold text-pink-300">{data.bard.score}/10</span>
                    </div>
                    <div className="min-h-[40px] mb-2">
                        <p className="text-[11px] font-bold text-titanium-200 leading-tight">"{data.bard.verdict}"</p>
                    </div>
                    <p className="text-[10px] text-titanium-400 italic border-l border-pink-500/30 pl-2 leading-relaxed">
                        {data.bard.critique}
                    </p>
                </div>

                {/* HATER */}
                <div className="p-3 bg-titanium-900/30">
                    <div className="flex items-center gap-2 mb-2 text-red-400">
                        <Skull size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-widest">El Crítico</span>
                        <span className="ml-auto text-xs font-bold text-red-300">{data.hater.score}/10</span>
                    </div>
                    <div className="min-h-[40px] mb-2">
                        <p className="text-[11px] font-bold text-titanium-200 leading-tight">"{data.hater.verdict}"</p>
                    </div>
                    <p className="text-[10px] text-titanium-400 italic border-l border-red-500/30 pl-2 leading-relaxed">
                        {data.hater.critique}
                    </p>
                </div>

            </div>
        </div>
    );
};
