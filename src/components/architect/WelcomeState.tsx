import React, { useState } from 'react';
import { Landmark, Sparkles } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface ExistingSession {
    id: string;
    name: string;
    lastUpdatedAt: string;
    resolvedCount: number;
    pendingCount: number;
}

interface Props {
    projectName: string;
    onStart: () => void;
    onResume: () => void;
    onDiscard: () => void;
    lastSessionDate?: string;
    existingSession?: ExistingSession | null;
}

export default function WelcomeState({ projectName, onStart, onResume, onDiscard, lastSessionDate, existingSession }: Props) {
    const [discardStep, setDiscardStep] = useState<0 | 1 | 2>(0);
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tArch = t.architect;

    const formattedDate = existingSession?.lastUpdatedAt
        ? new Date(existingSession.lastUpdatedAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
          })
        : null;

    return (
        <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
            <div className="w-16 h-16 rounded-full border border-titanium-700 flex items-center justify-center">
                <Landmark size={28} className="text-titanium-500" />
            </div>

            <div>
                <h3 className="text-lg font-medium text-titanium-200 mb-1">
                    {projectName}
                </h3>
                <p className="text-sm text-titanium-600">
                    {lastSessionDate
                        ? `Última sesión: ${lastSessionDate}`
                        : 'Sin sesiones previas'
                    }
                </p>
            </div>

            <button
                onClick={onStart}
                className="flex items-center gap-2 px-6 py-3 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition-all shadow-[0_0_20px_rgba(6,182,212,0.08)]"
            >
                <Sparkles size={16} />
                {tArch.startSession || 'Iniciar sesión con El Arquitecto'}
            </button>

            {existingSession && (
                <>
                    <div className="w-full max-w-sm border-t border-titanium-800" />

                    <div className="w-full max-w-sm flex flex-col gap-3">
                        <p className="text-[11px] text-titanium-500 uppercase tracking-wider font-mono">
                            {tArch.previousSessionFound || 'Sesión anterior encontrada'}
                        </p>
                        <p className="text-[12px] text-titanium-400 leading-relaxed">
                            {existingSession.name}
                            {' · '}
                            <span className="text-emerald-500">{existingSession.resolvedCount} {t.common?.resolved || 'resueltas'}</span>
                            {' · '}
                            <span className="text-amber-400">{existingSession.pendingCount} {t.common?.pending || 'pendientes'}</span>
                            {formattedDate && (
                                <> · {t.common?.lastActivity || 'última actividad'}: {formattedDate}</>
                            )}
                        </p>

                        {discardStep === 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={onResume}
                                    className="flex-1 py-2 bg-titanium-800/50 border border-titanium-700 text-titanium-300 text-[13px] font-medium rounded-lg hover:bg-titanium-700/50 hover:text-titanium-100 transition-all"
                                >
                                    {tArch.resumeSession || 'Retomar sesión'}
                                </button>
                                <button
                                    onClick={() => setDiscardStep(1)}
                                    className="px-4 py-2 text-titanium-600 border border-titanium-800 text-[12px] rounded-lg hover:text-titanium-400 hover:border-titanium-700 transition-all"
                                >
                                    {t.common?.discard || 'Descartar'}
                                </button>
                            </div>
                        )}

                        {discardStep === 1 && (
                            <div className="flex flex-col gap-2 bg-titanium-900/50 border border-titanium-800 rounded-xl p-4">
                                <p className="text-[12px] text-titanium-300 text-left">
                                    {tArch.confirmDiscard || '¿Descartar la sesión anterior? Esta acción no se puede deshacer.'}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setDiscardStep(2)}
                                        className="flex-1 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] rounded-lg hover:bg-amber-500/20 transition-colors"
                                    >
                                        {t.common?.yesDiscard || 'Sí, descartar'}
                                    </button>
                                    <button
                                        onClick={() => setDiscardStep(0)}
                                        className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                    >
                                        {t.common?.cancel || 'Cancelar'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {discardStep === 2 && (
                            <div className="flex flex-col gap-2 bg-titanium-900/50 border border-red-500/20 rounded-xl p-4">
                                <p className="text-[12px] text-titanium-300 text-left mb-1">
                                    {tArch.confirmSureLoss || '¿Estás completamente seguro? Perderás todas las disonancias y el roadmap generado.'}
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { onDiscard(); setDiscardStep(0); }}
                                        className="flex-1 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] rounded-lg hover:bg-red-500/20 transition-colors"
                                    >
                                        {t.common?.confirmDiscard || 'Confirmar descarte'}
                                    </button>
                                    <button
                                        onClick={() => setDiscardStep(0)}
                                        className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                    >
                                        {t.common?.cancel || 'Cancelar'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <p className="text-[11px] text-titanium-700 font-mono uppercase tracking-wider">
                {tArch.motto?.toUpperCase() || 'EL ARQUITECTO PROCESA LA LÓGICA - TÚ PONES EL ALMA'}
            </p>
        </div>
    );
}
