import React, { useState, useEffect, useRef } from 'react';
import { Settings, Clock, Type, RefreshCw, ScanEye, Loader2, Pause, Square, Target, X, Check, Zap, Leaf } from 'lucide-react';
import { toast } from 'sonner';
import { useTier } from '../../hooks/useTier';
import { useQuotaTracker } from '../../hooks/useQuotaTracker';
import { AlertCircle } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { useArquitectoStore } from '../../stores/useArquitectoStore';
import { TRANSLATIONS } from '../../i18n/translations';
import { useMisionesEditor } from '../../hooks/useMisionesEditor';

interface StatusBarProps {
    content: string;
    className?: string;
    guardianStatus?: string;
    onGuardianClick?: () => void;
    onOpenSettings?: () => void;
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
    const date = new Date().toISOString().split('T')[0];
    return `myword_daily_${date}`;
};

const StatusBar: React.FC<StatusBarProps> = ({ content, className = '', guardianStatus, onGuardianClick, onOpenSettings, narratorControls }) => {
    const { tier, hasByok, isNormal } = useTier();
    const { quota, status: quotaStatus, usagePercent, limits } = useQuotaTracker();
    const { currentLanguage } = useLanguageStore();
    const arquitectoSessionId = useArquitectoStore(state => state.arquitectoSessionId);
    const t = TRANSLATIONS[currentLanguage].statusBar;

    // Escuchar actualizaciones manuales de cuota
    useEffect(() => {
        const handleQuotaUpdate = () => {
            // Forzar re-render leyendo de nuevo desde localStorage o confiando en hook internals
            // El hook ya tiene su estado interno, pero se actualiza en otra ventana? 
            // Esto solo es para que los tabs cambien (ya que usamos localstorage manual)
        };
        window.addEventListener('quota_updated', handleQuotaUpdate);
        return () => window.removeEventListener('quota_updated', handleQuotaUpdate);
    }, []);

    const { misiones, hasRoadmap, toggleMision, resetProgress, pendingCount } = useMisionesEditor(arquitectoSessionId);
    const [isMisionesExpanded, setIsMisionesExpanded] = useState(false);

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
    useEffect(() => {
        const currentCount = countWords(content);
        setWordCount(currentCount);
        setReadingTime(Math.ceil(currentCount / 200));

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

    }, [content]);

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

    return (
        <div className={`h-8 bg-titanium-950 border-t border-titanium-800 flex items-center justify-between px-4 text-[10px] text-titanium-400 select-none ${className}`}>

            {/* LEFT: METRICS & GUARDIAN */}
            <div className="flex items-center gap-4">
                {/* Badge de tier — siempre visible */}
                <button
                    onClick={onOpenSettings}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded 
                        transition-colors
                        ${!hasByok 
                            ? 'bg-red-500/10 hover:bg-red-500/20' 
                            : tier === 'ultra'
                                ? 'hover:bg-zinc-700/50'
                                : 'hover:bg-zinc-700/50'
                        }`}
                    title={
                        !hasByok 
                            ? 'Sin API Key — Click para configurar'
                            : isNormal 
                                ? `${quota.requestCount}/${limits.RPD} requests hoy` 
                                : `Modo Ultra — Click para cambiar`
                    }
                >
                    {!hasByok ? (
                        // Sin key: ícono de advertencia + texto
                        <>
                            <AlertCircle size={11} className="text-red-400" />
                            <span className="text-[10px] font-medium text-red-400">
                                Sin API Key
                            </span>
                        </>
                    ) : tier === 'ultra' ? (
                        // Ultra
                        <>
                            <Zap size={11} className="text-violet-400" />
                            <span className="text-[10px] font-medium text-violet-400">
                                Ultra
                            </span>
                        </>
                    ) : (
                        // Normal con mini barra de progreso
                        <>
                            {/* Mini barra de progreso */}
                            <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0 shadow-inner">
                                <div 
                                    className={`h-full rounded-full transition-all duration-500 shadow-[0_0_8px_currentColor]
                                        ${quotaStatus === 'critical' ? 'bg-red-500' :
                                          quotaStatus === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                    style={{ width: `${usagePercent}%` }}
                                />
                            </div>
                            <span className={`text-[10px] font-bold tracking-wide
                                ${quotaStatus === 'critical' ? 'text-red-400' :
                                  quotaStatus === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {Math.round(usagePercent)}%
                            </span>
                        </>
                    )}
                </button>

                <div className="h-3 w-px bg-titanium-800 mx-1" />

                {/* 🎯 MISIONES DEL ROADMAP */}
                {hasRoadmap && (
                    <>
                        <div className="relative flex items-center">
                            <button
                                onClick={() => setIsMisionesExpanded(v => !v)}
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded hover:bg-zinc-700/50 transition-colors"
                                title={pendingCount > 0
                                    ? `${pendingCount} misiones pendientes`
                                    : 'Todas las misiones completadas'}
                                aria-label={pendingCount > 0
                                    ? `${pendingCount} misiones pendientes`
                                    : 'Todas las misiones completadas'}
                            >
                                <Target size={12} className={pendingCount > 0 ? 'text-violet-400' : 'text-emerald-400'} />
                                {pendingCount > 0 && (
                                    <span className="font-medium text-violet-400">{pendingCount}</span>
                                )}
                                {pendingCount === 0 && misiones.length > 0 && (
                                    <span className="text-emerald-400">✓</span>
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
                                    <div className="absolute bottom-full left-0 mb-2 w-80 z-50 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden">
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                                            <div className="flex items-center gap-2">
                                                <Target size={13} className="text-violet-400" />
                                                <span className="text-xs font-medium text-zinc-300">Misiones del Roadmap</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-zinc-500">{pendingCount} pendientes</span>
                                                <button
                                                    onClick={() => setIsMisionesExpanded(false)}
                                                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                                                    aria-label="Cerrar"
                                                >
                                                    <X size={13} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Lista */}
                                        <div className="overflow-y-auto max-h-72 p-2 space-y-1">
                                            {misiones.length === 0 && (
                                                <p className="text-xs text-zinc-600 text-center py-4">
                                                    No hay misiones en el Roadmap actual.
                                                </p>
                                            )}
                                            {misiones.map(mision => (
                                                <button
                                                    key={mision.id}
                                                    onClick={() => toggleMision(mision.id)}
                                                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                                                        mision.completed ? 'opacity-50 hover:opacity-70' : 'hover:bg-zinc-800/60'
                                                    }`}
                                                >
                                                    <div className={`mt-0.5 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                                        mision.completed
                                                            ? 'bg-emerald-500/20 border-emerald-500/50'
                                                            : 'border-zinc-600'
                                                    }`}>
                                                        {mision.completed && <Check size={9} className="text-emerald-400" />}
                                                    </div>
                                                    <span className={`text-xs leading-relaxed ${
                                                        mision.completed ? 'line-through text-zinc-600' : 'text-zinc-300'
                                                    }`}>
                                                        {mision.text}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Footer */}
                                        {misiones.some(m => m.completed) && (
                                            <div className="border-t border-zinc-800 px-4 py-2">
                                                <button
                                                    onClick={resetProgress}
                                                    className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                                                >
                                                    Restablecer progreso
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
                                    guardianStatus === 'clean' ? 'text-zinc-500 hover:text-emerald-400' :
                                        'text-zinc-600 hover:text-zinc-400'}
                        `}
                        title={guardianStatus === 'scanning' ? t.tooltipArgosScan : guardianStatus === 'conflict' ? t.tooltipArgosConflict : t.tooltipArgosClean}
                        aria-label={guardianStatus === 'scanning' ? t.scanning : guardianStatus === 'conflict' ? t.conflict : t.argos}
                    >
                        <ScanEye size={12} />
                        <span className="font-bold tracking-wider">
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
                                {narratorControls.isLoading ? "Analizando..." : "Narrando"}
                            </span>

                            {!narratorControls.isLoading && (
                                <div className="flex items-center gap-1 ml-1">
                                    <button
                                        onClick={narratorControls.pause}
                                        className="hover:text-cyan-400 hover:bg-cyan-900/50 rounded p-0.5 transition-colors"
                                        title="Pausar"
                                        aria-label="Pausar"
                                    >
                                        <Pause size={10} fill="currentColor" />
                                    </button>
                                    <button
                                        onClick={narratorControls.stop}
                                        className="hover:text-red-400 hover:bg-red-900/50 rounded p-0.5 transition-colors"
                                        title="Detener"
                                        aria-label="Detener"
                                    >
                                        <Square size={10} fill="currentColor" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className="h-3 w-px bg-titanium-800 mx-1" />

                <div
                    className="flex items-center gap-1.5 hover:text-titanium-200 transition-colors cursor-help focus-visible:ring-2 focus-visible:ring-emerald-500/50 outline-none rounded px-1"
                    title={`${t.words}: ${wordCount.toLocaleString()}`}
                    role="status"
                    aria-label={`${wordCount.toLocaleString()} ${t.words}`}
                    tabIndex={0}
                >
                    <Type size={12} aria-hidden="true" />
                    <span>{wordCount.toLocaleString()} {t.words}</span>
                </div>
                <div
                    className="flex items-center gap-1.5 hover:text-titanium-200 transition-colors cursor-help focus-visible:ring-2 focus-visible:ring-emerald-500/50 outline-none rounded px-1"
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
            <div className="flex items-center gap-3 relative group">

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

                <div className="flex flex-col w-32 gap-1">
                    <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold">
                        <span className={dailyProgress >= dailyGoal ? "text-emerald-400" : "text-titanium-500"}>
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
                        title={`${t.dailyGoal}: ${Math.round(progressPercentage)}%`}
                    >
                        <div
                            className={`h-full transition-all duration-500 ${dailyProgress >= dailyGoal ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`}
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>

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
