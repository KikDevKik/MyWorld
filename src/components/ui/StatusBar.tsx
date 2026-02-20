import React, { useState, useEffect, useRef } from 'react';
import { Settings, Clock, Type, RefreshCw, ScanEye, Key, AlertTriangle, Loader2, Pause, Square, Play } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface StatusBarProps {
    content: string;
    className?: string;
    guardianStatus?: string;
    onGuardianClick?: () => void;
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

const StatusBar: React.FC<StatusBarProps> = ({ content, className = '', guardianStatus, onGuardianClick, narratorControls }) => {
    const { customGeminiKey } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].statusBar;

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
                {/* 🟢 BYOK INDICATOR */}
                <div
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded cursor-help transition-colors ${
                        customGeminiKey
                            ? 'text-purple-400 bg-purple-900/20 hover:bg-purple-900/30'
                            : 'text-amber-400 bg-amber-900/20 hover:bg-amber-900/30'
                    }`}
                    title={customGeminiKey ? t.tooltipPro : t.tooltipDemo}
                >
                   {customGeminiKey ? <Key size={12} /> : <AlertTriangle size={12} />}
                   <span className="font-bold tracking-wider">
                       {customGeminiKey ? t.proKey : t.demoMode}
                   </span>
                </div>

                <div className="h-3 w-px bg-titanium-800 mx-1" />

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
