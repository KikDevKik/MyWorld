import React from 'react';
import { Sparkles, BookOpen, PenLine, ChevronRight, X } from 'lucide-react';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface PostGenesisPanelProps {
    projectName: string;
    filesCreated: number;
    premise?: string;
    onGoToCapitulo?: () => void;
    onGoToArquitecto: () => void;
    onDismiss: () => void;
}

export function PostGenesisPanel({
    projectName,
    filesCreated,
    onGoToCapitulo,
    onGoToArquitecto,
    onDismiss
}: PostGenesisPanelProps) {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tPG = t.postGenesis;

    return (
        <div className="flex flex-col items-center justify-center h-full px-8 py-12 text-center bg-titanium-950">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30
                flex items-center justify-center mb-6">
                <Sparkles size={28} className="text-cyan-400" />
            </div>

            <h2 className="text-xl font-semibold text-white mb-2">
                {tPG.ready.replace('{name}', projectName)}
            </h2>

            <p className="text-sm text-zinc-400 mb-8 max-w-xs leading-relaxed">
                {tPG.filesCreated.replace('{count}', String(filesCreated))}
            </p>

            <div className="w-full max-w-xs space-y-3">
                {onGoToCapitulo && (
                    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                        <div className="flex items-start gap-3 mb-3">
                            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30
                                flex items-center justify-center flex-shrink-0 mt-0.5">
                                <PenLine size={14} className="text-cyan-400" />
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-medium text-white mb-1">{tPG.writeNowTitle}</p>
                                <p className="text-xs text-zinc-400 leading-relaxed">{tPG.writeNowDesc}</p>
                            </div>
                        </div>
                        <button
                            onClick={onGoToCapitulo}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                                bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium
                                rounded-lg transition-colors"
                        >
                            {tPG.startWriting}
                            <ChevronRight size={14} />
                        </button>
                    </div>
                )}

                <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30
                            flex items-center justify-center flex-shrink-0 mt-0.5">
                            <BookOpen size={14} className="text-violet-400" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-medium text-white mb-1">{tPG.buildWorldTitle}</p>
                            <p className="text-xs text-zinc-400 leading-relaxed">
                                {t?.architect?.description || ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onGoToArquitecto}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                            bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium
                            rounded-lg transition-colors"
                    >
                        {tPG.openArchitect} {t?.architect?.toolName || 'El Arquitecto'}
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            <button
                onClick={onDismiss}
                className="mt-6 text-xs text-zinc-500 hover:text-zinc-300 transition-colors
                    flex items-center gap-1"
            >
                <X size={12} />
                {tPG.exploreLater}
            </button>
        </div>
    );
}
