import React, { useState } from 'react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';
import { MiraSprite } from '../mira/MiraSprite';

// Nov 2026: la mesa del arquitecto en el lenguaje de la casa. Mira se sienta sobre la tarjeta de la sesión,
// la acción principal es seguir donde quedamos y descartar queda como enlace.
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
    const es = currentLanguage !== 'en';

    const date = existingSession?.lastUpdatedAt
        ? new Date(existingSession.lastUpdatedAt).toLocaleDateString(es ? 'es' : 'en', { day: 'numeric', month: 'long' })
        : lastSessionDate || null;
    const pending = existingSession?.pendingCount ?? 0;
    const resolved = existingSession?.resolvedCount ?? 0;
    const line = existingSession
        ? (es
            ? (pending > 0 ? `La última vez quedaron ${pending} ${pending === 1 ? 'duda' : 'dudas'} por resolver. ¿Seguimos?` : 'La última vez no quedó nada pendiente. Podemos seguir o empezar otra cosa.')
            : (pending > 0 ? `Last time we left ${pending} open ${pending === 1 ? 'question' : 'questions'}. Shall we continue?` : 'Nothing was left open last time. We can continue or start something new.'))
        : (es ? 'Cuéntale al Arquitecto qué quieres planear: una parte del libro, un hilo de la trama o una duda.' : 'Tell the Architect what you want to plan: a part of the book, a plot thread or a question.');

    const ghost = 'px-4 py-2.5 rounded-xl border border-titanium-700 text-titanium-200 text-sm hover:border-mira/60 hover:text-titanium-100 transition-colors';
    return (
        <div className="flex flex-col items-center justify-center h-full px-6 py-10">
            <div className="relative w-full max-w-md mt-24">
                <MiraSprite pose="sentada" label="Mira, sentada en la mesa" className="absolute left-6 bottom-full -mb-[15px] pointer-events-none" />
                <div className="rounded-2xl border border-titanium-700 bg-titanium-900 px-6 pt-6 pb-5 shadow-[0_6px_0_rgba(0,0,0,0.25)]">
                    <div className="flex items-start gap-4">
                        <img src="/assets/objetos/planos.png" alt="" width={56} height={56} className="w-14 h-14 -mt-1 shrink-0" style={{ imageRendering: 'pixelated' }} />
                        <div className="min-w-0 text-left">
                            <h3 className="font-serif text-xl font-semibold text-titanium-100 leading-tight">{projectName}</h3>
                            <p className="text-[13px] text-titanium-400 mt-1">
                                {date ? (es ? `Última conversación: ${date}` : `Last conversation: ${date}`) : (es ? 'Todavía no hay conversaciones' : 'No conversations yet')}
                                {existingSession && <> · {resolved} {es ? (resolved === 1 ? 'resuelta' : 'resueltas') : 'resolved'} · {pending} {es ? (pending === 1 ? 'pendiente' : 'pendientes') : 'open'}</>}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 bg-mira-bg border border-mira/60 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-titanium-100 text-left leading-relaxed" role="status">
                        {line}
                    </div>

                    {discardStep === 0 && (
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            {existingSession ? (
                                <>
                                    <button onClick={onResume} className="px-5 py-2.5 rounded-xl bg-coral text-on-coral text-sm font-semibold hover:brightness-110 transition">
                                        {es ? 'Seguir donde quedamos' : 'Pick up where we left off'}
                                    </button>
                                    <button onClick={onStart} className={ghost}>{es ? 'Empezar otra' : 'Start another'}</button>
                                    <button onClick={() => setDiscardStep(1)} className="ml-auto text-[13px] text-titanium-400 hover:text-titanium-200 underline underline-offset-4">
                                        {es ? 'Descartar' : 'Discard'}
                                    </button>
                                </>
                            ) : (
                                <button onClick={onStart} className="px-5 py-2.5 rounded-xl bg-coral text-on-coral text-sm font-semibold hover:brightness-110 transition">
                                    {es ? 'Empezar con el Arquitecto' : 'Start with the Architect'}
                                </button>
                            )}
                        </div>
                    )}

                    {discardStep === 1 && (
                        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-titanium-700 bg-titanium-950/50 p-4 text-left">
                            <p className="text-sm text-titanium-200">{tArch.confirmDiscard || '¿Descartar la sesión anterior? Esta acción no se puede deshacer.'}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setDiscardStep(2)} className="px-4 py-2 rounded-lg border border-amber-500/40 text-amber-300 text-sm hover:bg-amber-500/10">{t.common?.yesDiscard || 'Sí, descartar'}</button>
                                <button onClick={() => setDiscardStep(0)} className="px-4 py-2 rounded-lg text-titanium-300 text-sm hover:bg-titanium-800">{t.common?.cancel || 'Cancelar'}</button>
                            </div>
                        </div>
                    )}

                    {discardStep === 2 && (
                        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-red-500/30 bg-titanium-950/50 p-4 text-left">
                            <p className="text-sm text-titanium-200">{es ? 'Se borran las dudas y el plan de esta conversación. ¿Seguro?' : 'This deletes the questions and plan from this conversation. Sure?'}</p>
                            <div className="flex gap-2">
                                <button onClick={() => { onDiscard(); setDiscardStep(0); }} className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 text-sm hover:bg-red-500/10">{t.common?.confirmDiscard || 'Confirmar descarte'}</button>
                                <button onClick={() => setDiscardStep(0)} className="px-4 py-2 rounded-lg text-titanium-300 text-sm hover:bg-titanium-800">{t.common?.cancel || 'Cancelar'}</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
