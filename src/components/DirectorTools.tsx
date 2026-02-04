import React from 'react';
import { Search, BrainCircuit, Gavel } from 'lucide-react';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface DirectorToolsProps {
    mode: 'sentinel' | 'strategist' | 'war-room';
    onInspector: () => void;
    onTribunal: () => void;
    onContext: () => void;
    isThinking: boolean;
}

export const DirectorTools: React.FC<DirectorToolsProps> = ({ mode, onInspector, onTribunal, onContext, isThinking }) => {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].director;

    // In Sentinel Mode (Small), tools might be hidden or in a dropdown (handled by parent or simplified)
    if (mode === 'sentinel') return null;

    return (
        <div className={`
            flex gap-2
            ${mode === 'war-room' ? 'flex-col w-full h-full' : 'flex-col w-12 border-l border-titanium-800/50 pl-2'}
        `}>
            {/* INSPECTOR */}
            <button
                onClick={onInspector}
                disabled={isThinking}
                aria-label={t.inspector}
                className={`
                    group flex items-center justify-center rounded transition-all
                    ${mode === 'war-room'
                        ? 'p-4 bg-titanium-800/20 hover:bg-amber-900/20 border border-titanium-700/50 hover:border-amber-500/50 gap-3 justify-start'
                        : 'w-10 h-10 hover:bg-amber-900/20 text-titanium-400 hover:text-amber-400'}
                `}
                title={`${t.inspector} (${t.analyzeCast})`}
            >
                <Search size={mode === 'war-room' ? 18 : 16} className={mode === 'war-room' ? 'text-amber-500' : ''} />
                {mode === 'war-room' && (
                    <div className="text-left">
                        <div className="text-sm font-bold text-amber-100">{t.inspector}</div>
                        <div className="text-[10px] text-titanium-500 uppercase">{t.analyzeCast}</div>
                    </div>
                )}
            </button>

            {/* TRIBUNAL */}
            <button
                onClick={onTribunal}
                disabled={isThinking}
                aria-label={t.tribunal}
                className={`
                    group flex items-center justify-center rounded transition-all
                    ${mode === 'war-room'
                        ? 'p-4 bg-titanium-800/20 hover:bg-purple-900/20 border border-titanium-700/50 hover:border-purple-500/50 gap-3 justify-start'
                        : 'w-10 h-10 hover:bg-purple-900/20 text-titanium-400 hover:text-purple-400'}
                `}
                title={`${t.tribunal} (${t.summonJudges})`}
            >
                <Gavel size={mode === 'war-room' ? 18 : 16} className={mode === 'war-room' ? 'text-purple-500' : ''} />
                {mode === 'war-room' && (
                    <div className="text-left">
                        <div className="text-sm font-bold text-purple-100">{t.tribunal}</div>
                        <div className="text-[10px] text-titanium-500 uppercase">{t.summonJudges}</div>
                    </div>
                )}
            </button>

            {/* CONTEXT RECALL */}
            <button
                onClick={onContext}
                disabled={isThinking}
                aria-label={t.memory}
                className={`
                    group flex items-center justify-center rounded transition-all
                    ${mode === 'war-room'
                        ? 'p-4 bg-titanium-800/20 hover:bg-cyan-900/20 border border-titanium-700/50 hover:border-cyan-500/50 gap-3 justify-start'
                        : 'w-10 h-10 hover:bg-cyan-900/20 text-titanium-400 hover:text-cyan-400'}
                `}
                title={`${t.memory} (${t.forceRead})`}
            >
                <BrainCircuit size={mode === 'war-room' ? 18 : 16} className={mode === 'war-room' ? 'text-cyan-500' : ''} />
                {mode === 'war-room' && (
                    <div className="text-left">
                        <div className="text-sm font-bold text-cyan-100">{t.memory}</div>
                        <div className="text-[10px] text-titanium-500 uppercase">{t.forceRead}</div>
                    </div>
                )}
            </button>
        </div>
    );
};
