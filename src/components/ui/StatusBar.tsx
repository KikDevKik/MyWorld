import React, { useState, useEffect, useRef } from 'react';
import { Settings, Clock, Type, RefreshCw, ScanEye, Loader2, Pause, Square, Target, X, Check, Zap, Leaf, FileSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useTier } from '../../hooks/useTier';
import { getAiLevel } from '../../hooks/aiLevel';
import { AlertCircle, Moon, Sun } from 'lucide-react';
import { resolvedTheme, setThemePref } from '../../utils/theme';
import { getMiraPrefs, setMiraPrefs } from '../mira/tips';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { useArquitectoStore } from '../../stores/useArquitectoStore';
import { TRANSLATIONS } from '../../i18n/translations';
import { useMisionesEditor } from '../../hooks/useMisionesEditor';
import { useCraftFocus, openBiblioteca } from '../../hooks/useCraft';
import { localDayKey } from '../../utils/dayKey';
import { useAiUsage, fmtReset } from '../../hooks/useAiUsage';

interface StatusBarProps {
    content: string;
    fileId?: string | null; // Nov 2026: al cambiar de archivo no se cuenta como escritura
    className?: string;
    guardianStatus?: string;
    onGuardianClick?: () => void;
    onOpenSettings?: () => void;
    onOpenReport?: () => void; // Oct 2026: Reporte de capítulo
    reportPending?: number; // Nov 2026: puntos del reporte sin resolver
    /** Nov 2026: el autor tiene que ver que su texto está a salvo en Drive. */
    saveState?: 'saved' | 'pending' | 'saving' | 'error' | 'conflict' | null;
    narratorControls?: {
        isPlaying: boolean;
        isLoading: boolean;
        pause: () => void;
        stop: () => void;
        play: () => void;
        currentSegmentIndex?: number;
    };
}

// HELPERS
const countWords = (html: string) => {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').length : 0;
};

const getTodayKey = () => {
    const date = localDayKey();
    return `myword_daily_${date}`;
};

const StatusBar: React.FC<StatusBarProps> = ({ content, fileId, className = '', guardianStatus, onGuardianClick, onOpenSettings, onOpenReport, reportPending = 0, narratorControls, saveState = null }) => {
    const { tier, hasByok, isNormal } = useTier();
    const aiLevel = getAiLevel();
    const levelLabel = aiLevel === 'gratis' ? 'IA gratis' : aiLevel === 'propia' ? 'IA con tu clave' : aiLevel === 'myworld' ? 'IA de MyWorld' : null;
    // Nov 2026: cuánto Claude queda este mes (solo en el nivel MyWorld).
    const usage = useAiUsage();
    const showUsage = !!usage?.myworldAvailable && aiLevel === 'myworld';
    const usagePct = showUsage ? Math.min(100, Math.round((usage!.ratio) * 100)) : 0;
    const { currentLanguage } = useLanguageStore();
    const arquitectoSessionId = useArquitectoStore(state => state.arquitectoSessionId);
    const t = TRANSLATIONS[currentLanguage].statusBar;

    const { misiones, hasRoadmap, toggleMision, resetProgress, pendingCount } = useMisionesEditor(arquitectoSessionId);
    const [isMisionesExpanded, setIsMisionesExpanded] = useState(false);
    const focos = useCraftFocus(); // Nov 2026: lo que conviene practicar (biblioteca → Para ti)

    // METRICS STATE
    const [wordCount, setWordCount] = useState(() => countWords(content));
    const [readingTime, setReadingTime] = useState(() => Math.ceil(countWords(content) / 200));

    // DAILY GOAL STATE
    const [dailyGoal, setDailyGoal] = useState(1000);
    const [dailyProgress, setDailyProgress] = useState(0);

    const [prevWordCount, setPrevWordCount] = useState(() => countWords(content));

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsButtonRef = useRef<HTMLButtonElement>(null);
    const isFirstRun = useRef(true);

    // 🟢 PALETTE: Restore focus to settings button when popover closes
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        if (!isSettingsOpen) {
            settingsButtonRef.current?.focus();
        }
    }, [isSettingsOpen]);

    // 🟢 INITIALIZE & LOAD DATA
    useEffect(() => {
        // Load Goal
        const savedGoal = localStorage.getItem('myword_daily_goal');
        if (savedGoal) setDailyGoal(parseInt(savedGoal));

        // Load Today's Progress
        const todayKey = getTodayKey();
        const savedProgress = localStorage.getItem(todayKey);
        if (savedProgress) setDailyProgress(parseInt(savedProgress));
    }, []);

    // 🟢 TRACK CHANGES & UPDATE METRICS
    // Nov 2026: abrir otro archivo cambia el conteo, pero no es escribir. Al cambiar de archivo solo se reinicia la base.
    const lastFileRef = React.useRef(fileId);
    useEffect(() => {
        const currentCount = countWords(content);
        setWordCount(currentCount);
        setReadingTime(Math.ceil(currentCount / 200));
        if (lastFileRef.current !== fileId) {
            lastFileRef.current = fileId;
            setPrevWordCount(currentCount);
            return;
        }

        // Calculate Delta for Daily Goal (Positive adds, Negative removes, Bulk ignored)
        const delta = currentCount - prevWordCount;

        if (delta !== 0) {
            // Ignore changes larger than 50 words (likely paste, load, or bulk delete)
            const isBulkChange = Math.abs(delta) > 50;

            if (!isBulkChange) {
                setDailyProgress(prev => {
                    const newProgress = Math.max(0, prev + delta);
                    localStorage.setItem(getTodayKey(), newProgress.toString());
                    return newProgress;
                });
            }

            setPrevWordCount(currentCount);
        }

    }, [content, fileId]);

    const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseInt(e.target.value);
        if (!isNaN(val) && val > 0) {
            setDailyGoal(val);
            localStorage.setItem('myword_daily_goal', val.toString());
        }
    };

    const handleResetProgress = () => {
        setDailyProgress(0);
        localStorage.setItem(getTodayKey(), '0');
        toast.success(t.resetSuccess);
    };

    const progressPercentage = Math.min(100, (dailyProgress / dailyGoal) * 100);
    const [theme, setTheme] = useState<'noche' | 'papel'>(() => resolvedTheme());
    const [miraOn, setMiraOn] = useState(() => getMiraPrefs().visible);
    useEffect(() => {
        const on = (e: Event) => setMiraOn((e as CustomEvent).detail.visible);
        window.addEventListener('mw-mira-prefs', on);
        return () => window.removeEventListener('mw-mira-prefs', on);
    }, []);
    useEffect(() => {
        const on = (e: Event) => setTheme((e as CustomEvent).detail);
        window.addEventListener('mw-theme', on);
        return () => window.removeEventListener('mw-theme', on);
    }, []);

    return (
        <div className={`h-9 bg-titanium-950 border-t border-titanium-800 flex items-center justify-between gap-2 px-2 sm:px-4 text-xs text-titanium-400 select-none whitespace-nowrap overflow-hidden ${className}`}>

            {/* LEFT: METRICS & GUARDIAN */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 overflow-hidden">
                {/* Badge de tier — siempre visible */}
                <button
                    onClick={onOpenSettings}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors
                        ${!hasByok ? 'bg-red-500/10 hover:bg-red-500/20' : 'hover:bg-titanium-800'}`}
                    title={!hasByok ? t.noApiKeyTooltip : showUsage ? `Claude este mes: US$ ${usage!.spent.toFixed(2)} de US$ ${usage!.cap} (${usagePct} %)${usagePct >= 100 ? ' · agotado: MyWorld usa Gemini' : usagePct >= 80 ? ' · ahora con Haiku para estirarlo' : ''} · se renueva el ${fmtReset(usage!.resetsOn, currentLanguage)}` : levelLabel ? `Nivel de IA: ${levelLabel} — click para cambiar` : tier === 'ultra' ? t.ultraModeTooltip : t.normalModeTooltip}
                    aria-label={showUsage ? `Claude este mes: ${usagePct} por ciento usado` : undefined}
                >
                    {!hasByok ? (
                        <>
                            <AlertCircle size={11} className="text-red-400" />
                            <span className="text-xs font-medium text-red-400">{t.noApiKey}</span>
                        </>
                    ) : tier === 'ultra' ? (
                        <>
                            <Zap size={11} className="text-mira" />
                            <span className="text-xs font-medium text-mira">{levelLabel || 'Ultra'}</span>
                        </>
                    ) : showUsage ? (
                        <>
                            <Leaf size={12} className={usagePct >= 100 ? 'text-red-400' : usagePct >= 80 ? 'text-amber-300' : 'text-titanium-400'} />
                            <span className={`hidden sm:inline text-xs whitespace-nowrap ${usagePct >= 100 ? 'text-red-300' : usagePct >= 80 ? 'text-amber-200' : 'text-titanium-300'}`}>
                                {usagePct >= 100 ? 'Claude agotado' : levelLabel}
                            </span>
                            <span className="relative hidden sm:block w-12 h-1.5 rounded-full bg-titanium-800 overflow-hidden" aria-hidden="true">
                                <span className={`absolute inset-y-0 left-0 rounded-full ${usagePct >= 100 ? 'bg-red-400' : usagePct >= 80 ? 'bg-amber-300' : 'bg-mira'}`} style={{ width: `${Math.max(3, usagePct)}%` }} />
                            </span>
                            <span className="text-xs tabular-nums text-titanium-400">{usagePct} %</span>
                        </>
                    ) : (
                        <>
                            <Leaf size={12} className="text-titanium-400" />
                            <span className="text-xs text-titanium-300">{levelLabel || 'Normal'}</span>
                        </>
                    )}
                </button>

                <div className="h-3 w-px bg-titanium-800 mx-1" />

                {/* 🎯 MISIONES DEL ROADMAP (+ lo que conviene practicar) */}
                {(hasRoadmap || focos.length > 0) && (
                    <>
                        <div className="relative flex items-center">
                            <button
                                onClick={() => setIsMisionesExpanded(v => !v)}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-titanium-800 transition-colors"
                                title={pendingCount > 0
                                    ? `${pendingCount} ${t.pendingMissionsCount}`
                                    : t.allMissionsCompleted}
                                aria-label={pendingCount > 0
                                    ? `${pendingCount} ${t.pendingMissionsCount}`
                                    : t.allMissionsCompleted}
                            >
                                <Target size={12} className={pendingCount > 0 ? 'text-mira' : 'text-logro'} />
                                {pendingCount > 0 && (
                                    <span className="font-medium text-mira">{pendingCount}</span>
                                )}
                                {pendingCount === 0 && misiones.length > 0 && (
                                    <span className="text-logro">✓</span>
                                )}
                            </button>

                            {/* Panel flotante */}
                            {isMisionesExpanded && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setIsMisionesExpanded(false)}
                                        aria-hidden="true"
                                    />
                                    <div className="absolute bottom-full left-0 mb-2 w-80 z-50 bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl overflow-hidden">
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-titanium-800">
                                            <div className="flex items-center gap-2">
                                                <Target size={13} className="text-mira" />
                                                <span className="text-sm font-medium text-titanium-100">{t.roadmapMissions}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-titanium-400">{pendingCount} {t.pending}</span>
                                                <button
                                                    onClick={() => setIsMisionesExpanded(false)}
                                                    className="text-titanium-500 hover:text-titanium-200 transition-colors"
                                                    aria-label={t.close}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Lista */}
                                        <div className="overflow-y-auto max-h-72 p-2 space-y-1">
                                            {misiones.length === 0 && (
                                                <p className="text-xs text-titanium-500 text-center py-4">
                                                    {t.noMissions}
                                                </p>
                                            )}
                                            {misiones.map(mision => (
                                                <button
                                                    key={mision.id}
                                                    onClick={() => toggleMision(mision.id)}
                                                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                                        mision.completed ? 'opacity-50 hover:opacity-70' : 'hover:bg-titanium-800/60'
                                                    }`}
                                                >
                                                    <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                                        mision.completed
                                                            ? 'bg-logro/20 border-logro/50'
                                                            : 'border-titanium-500'
                                                    }`}>
                                                        {mision.completed && <Check size={9} className="text-logro" />}
                                                    </div>
                                                    <span className={`text-sm leading-relaxed ${
                                                        mision.completed ? 'line-through text-titanium-500' : 'text-titanium-200'
                                                    }`}>
                                                        {mision.text}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Nov 2026: para practicar (no son misiones del libro: son tu oficio) */}
                                        {focos.length > 0 && (
                                            <div className="border-t border-titanium-800 p-2">
                                                <p className="px-3 pt-1 pb-1.5 text-xs text-titanium-400">Para practicar</p>
                                                {focos.slice(0, 3).map(f => (
                                                    <button key={f.id} onClick={() => { setIsMisionesExpanded(false); openBiblioteca('parati'); }}
                                                        className="w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left hover:bg-titanium-800/60 transition-colors">
                                                        <img src="/assets/objetos/icono/libros.png" alt="" width={16} height={16} className="w-4 h-4 mt-0.5 shrink-0" style={{ imageRendering: 'pixelated' }} />
                                                        <span className="text-sm leading-snug text-titanium-200">{f.tema}<span className="block text-xs text-titanium-400">En la biblioteca: lección y práctica</span></span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Footer */}
                                        {misiones.some(m => m.completed) && (
                                            <div className="border-t border-titanium-800 px-4 py-2">
                                                <button
                                                    onClick={resetProgress}
                                                    className="text-xs text-titanium-500 hover:text-titanium-200 transition-colors"
                                                >
                                                    {t.resetProgress}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="h-3 w-px bg-titanium-800 mx-1" />
                    </>
                )}

                {/* 🛡️ EYE OF ARGOS (GUARDIAN TRIGGER) */}
                {guardianStatus && (
                    <button
                        onClick={onGuardianClick}
                        className={`
                            flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-300
                            ${guardianStatus === 'scanning' ? 'text-amber-400 bg-amber-900/20 animate-pulse' :
                                guardianStatus === 'conflict' ? 'text-red-400 bg-red-900/20 animate-pulse' :
                                    guardianStatus === 'clean' ? 'text-titanium-400 hover:text-logro' :
                                        'text-titanium-500 hover:text-titanium-200'}
                        `}
                        title={guardianStatus === 'scanning' ? t.tooltipArgosScan : guardianStatus === 'conflict' ? t.tooltipArgosConflict : t.tooltipArgosClean}
                        aria-label={guardianStatus === 'scanning' ? t.scanning : guardianStatus === 'conflict' ? t.conflict : t.argos}
                    >
                        <ScanEye size={12} aria-hidden="true" />
                        <span className="font-medium hidden sm:inline">
                            {guardianStatus === 'scanning' ? t.scanning :
                                guardianStatus === 'conflict' ? t.conflict : t.argos}
                        </span>
                    </button>
                )}

                {/* 🟢 NARRATOR CONTROLS (NEW) */}
                {(narratorControls?.isPlaying || narratorControls?.isLoading) && (
                    <>
                        <div className="h-3 w-px bg-titanium-800 mx-1" />
                        <div className="flex items-center gap-2 px-2 py-0.5 rounded bg-cyan-950/30 border border-cyan-900/30">
                            {narratorControls.isLoading ? (
                                <Loader2 size={12} className="animate-spin text-cyan-400" />
                            ) : (
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                                </span>
                            )}

                            <span className="text-cyan-200 font-bold tracking-wide">
                                {narratorControls.isLoading ? t.analyzing : t.narrating}
                            </span>

                            {!narratorControls.isLoading && (
                                <div className="flex items-center gap-1 ml-1">
                                    <button
                                        onClick={narratorControls.pause}
                                        className="hover:text-cyan-400 hover:bg-cyan-900/50 rounded p-0.5 transition-colors"
                                        title={t.pause}
                                        aria-label={t.pause}
                                    >
                                        <Pause size={10} fill="currentColor" />
                                    </button>
                                    <button
                                        onClick={narratorControls.stop}
                                        className="hover:text-red-400 hover:bg-red-900/50 rounded p-0.5 transition-colors"
                                        title={t.stop}
                                        aria-label={t.stop}
                                    >
                                        <Square size={10} fill="currentColor" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="h-3 w-px bg-titanium-800 mx-1" />

                {saveState && (
                    <span
                        role="status"
                        aria-live="polite"
                        className={`flex items-center gap-1 px-1 whitespace-nowrap ${saveState === 'error' || saveState === 'conflict' ? 'text-red-300' : 'text-titanium-400'}`}
                        title={saveState === 'saved' ? 'Todo lo que escribiste está guardado en tu Drive.' : saveState === 'error' ? 'No se pudo guardar. Se vuelve a intentar al seguir escribiendo; no cierres la pestaña.' : saveState === 'conflict' ? 'El archivo cambió en Drive. Elige con qué versión te quedas.' : 'Guardando en tu Drive…'}
                    >
                        {saveState === 'saved' ? <Check size={12} aria-hidden="true" /> : saveState === 'error' || saveState === 'conflict' ? <AlertCircle size={12} aria-hidden="true" /> : <Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                        <span className={saveState === 'saved' ? 'hidden sm:inline' : ''}>
                            {saveState === 'saved' ? 'Guardado' : saveState === 'error' ? 'Sin guardar' : saveState === 'conflict' ? 'Elige versión' : 'Guardando…'}
                        </span>
                    </span>
                )}

                <div
                    className="flex items-center gap-1.5 hover:text-titanium-200 transition-colors cursor-help focus-visible:ring-2 focus-visible:ring-emerald-500/50 outline-none rounded px-1"
                    title={`${t.words}: ${wordCount.toLocaleString()}`}
                    role="status"
                    aria-label={`${wordCount.toLocaleString()} ${t.words}`}
                    tabIndex={0}
                >
                    <Type size={12} aria-hidden="true" />
                    <span>{wordCount.toLocaleString()}<span className="hidden sm:inline"> {t.words}</span></span>
                </div>
                <div
                    className="hidden md:flex items-center gap-1.5 hover:text-titanium-200 transition-colors cursor-help focus-visible:ring-2 focus-visible:ring-emerald-500/50 outline-none rounded px-1"
                    title={`${t.minutes}: ~${readingTime}`}
                    role="status"
                    aria-label={`${readingTime} ${t.minutes}`}
                    tabIndex={0}
                >
                    <Clock size={12} aria-hidden="true" />
                    <span>~{readingTime} {t.minutes}</span>
                </div>
            </div>

            {/* CENTER/RIGHT: DAILY GOAL (LA JOYA) */}
            <div className="flex items-center gap-1.5 sm:gap-3 relative group shrink-0">

                {/* SETTINGS POPOVER */}
                {isSettingsOpen && (
                    <>
                        {/* 🎨 PALETTE: Invisible Backdrop for Click-Outside */}
                        <div
                            className="fixed inset-0 z-40 bg-transparent cursor-default"
                            onClick={() => setIsSettingsOpen(false)}
                            aria-hidden="true"
                        />

                        <div
                            className="absolute bottom-10 right-0 bg-titanium-950 border border-titanium-700 p-3 rounded-lg shadow-2xl w-48 z-50 animate-in fade-in slide-in-from-bottom-2 outline-none"
                            role="dialog"
                            aria-label={t.tooltipSettings}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    e.stopPropagation();
                                    setIsSettingsOpen(false);
                                }
                            }}
                        >
                            <div className="mb-3">
                                <label htmlFor="daily-goal-input" className="block text-xs font-bold text-titanium-100 mb-2">{t.dailyTarget}</label>
                                <input
                                    id="daily-goal-input"
                                    type="number"
                                    value={dailyGoal}
                                    onChange={handleGoalChange}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') setIsSettingsOpen(false);
                                    }}
                                    className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded px-2 py-1 text-xs focus:border-emerald-500 outline-none focus:ring-1 focus:ring-emerald-500"
                                    autoFocus // 🎨 PALETTE: Auto-focus for accessibility
                                />
                            </div>

                            <button
                                onClick={handleResetProgress}
                                className="w-full flex items-center justify-center gap-2 px-2 py-1.5 bg-titanium-800 hover:bg-red-900/30 text-titanium-300 hover:text-red-400 rounded transition-colors text-xs focus-visible:ring-2 focus-visible:ring-red-500/50 outline-none"
                                aria-label={t.resetProgress}
                                title={t.tooltipReset}
                            >
                                <RefreshCw size={12} />
                                {t.resetProgress}
                            </button>
                        </div>
                    </>
                )}

                <div className="flex flex-col w-16 sm:w-32 gap-1">
                    <div className="flex justify-between gap-2 text-[11px] font-medium">
                        <span className={`hidden sm:inline ${dailyProgress >= dailyGoal ? "text-logro" : "text-titanium-400"}`}>
                            {dailyProgress >= dailyGoal ? t.goalMet : t.dailyGoal}
                        </span>
                        <span className="text-titanium-400">{dailyProgress} / {dailyGoal}</span>
                    </div>
                    <div
                        className="h-1 w-full bg-titanium-800 rounded-full overflow-hidden"
                        role="progressbar"
                        aria-valuenow={dailyProgress}
                        aria-valuemin={0}
                        aria-valuemax={dailyGoal}
                        aria-label={`${t.dailyGoal}: ${Math.round(progressPercentage)}%`}
                        title={`${t.dailyGoal}: ${Math.round(progressPercentage)}%. Cuenta lo que escribes aquí; un bloque pegado de golpe (más de 50 palabras) no suma.`}
                    >
                        <div
                            className={`h-full transition-all duration-500 ${dailyProgress >= dailyGoal ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`}
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>

                {onOpenReport && (
                    <button
                        onClick={onOpenReport}
                        className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-purple-300 hover:bg-purple-900/30 transition-colors sm:ml-2"
                        aria-label="Reporte"
                        title={reportPending ? `Reporte del capítulo: ${reportPending} ${reportPending === 1 ? 'punto pendiente' : 'puntos pendientes'}` : 'Reporte del capítulo: qué corregir y dónde'}
                    >
                        <FileSearch size={12} aria-hidden="true" /><span className="hidden sm:inline">Reporte</span>
                        {reportPending > 0 && <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-coral text-on-coral text-[11px] font-bold leading-[18px] text-center">{reportPending}</span>}
                    </button>
                )}

                {!miraOn && (
                    <button
                        onClick={() => setMiraPrefs({ visible: true })}
                        className="hidden md:inline rounded px-2 py-0.5 text-xs font-medium text-mira hover:bg-titanium-800 transition-colors"
                        title="Mostrar a Mira en el escritorio"
                    >
                        Mostrar a Mira
                    </button>
                )}
                <button
                    onClick={() => window.dispatchEvent(new Event('OPEN_TIPS'))}
                    className="hidden sm:inline rounded px-2 py-0.5 text-xs font-medium text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 transition-colors"
                    title="Rincón de tips"
                >
                    Tips
                </button>
                <button
                    onClick={() => setThemePref(theme === 'noche' ? 'papel' : 'noche')}
                    className="flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 transition-colors"
                    title={theme === 'noche' ? 'Cambiar a modo papel' : 'Cambiar a modo noche'}
                    aria-label={theme === 'noche' ? 'Cambiar a modo papel' : 'Cambiar a modo noche'}
                >
                    {theme === 'noche' ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}<span className="hidden sm:inline">{theme === 'noche' ? 'Papel' : 'Noche'}</span>
                </button>


                <button
                    ref={settingsButtonRef}
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="p-1 hover:bg-titanium-800 rounded text-titanium-500 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/50 outline-none"
                    title={t.tooltipSettings}
                    aria-label={t.tooltipSettings}
                    aria-expanded={isSettingsOpen}
                    aria-haspopup="true"
                >
                    <Settings size={12} />
                </button>
            </div>
        </div>
    );
};

export default StatusBar;
