import React, { useState, useEffect } from 'react';
import { Settings, Target, Clock, Type, RefreshCw, ScanEye } from 'lucide-react';
import { toast } from 'sonner';
import { GuardianStatus } from '../../hooks/useGuardian';

interface StatusBarProps {
    content: string;
    className?: string;
    guardianStatus?: string; // 🟢 FIX TYPE
    onGuardianClick?: () => void;    // 🟢 NEW PROP
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

const StatusBar: React.FC<StatusBarProps> = ({ content, className = '', guardianStatus, onGuardianClick }) => {
    // METRICS STATE
    // 🟢 FIX: Initialize with current count to avoid "delta = total - 0" on mount
    const [wordCount, setWordCount] = useState(() => countWords(content));
    const [readingTime, setReadingTime] = useState(() => Math.ceil(countWords(content) / 200));

    // DAILY GOAL STATE
    const [dailyGoal, setDailyGoal] = useState(1000);
    const [dailyProgress, setDailyProgress] = useState(0);

    // 🟢 FIX: Initialize prevWordCount with current count
    const [prevWordCount, setPrevWordCount] = useState(() => countWords(content));

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

        // Calculate Delta for Daily Goal (Only positive progress counts!)
        const delta = currentCount - prevWordCount;

        if (delta !== 0) {
            // 🟢 HEURISTIC: Ignore massive jumps (> 50 words) if prev was 0 (initial load async issue)
            // or just generally if it looks like a paste/load (e.g. > 100 words in 1 tick?)
            // Let's be conservative: If delta > 50, it's likely a paste or load, NOT typing.
            // Unless the user types REALLY fast. 50 words is a lot for one render cycle.

            const isLikelyPasteOrLoad = delta > 50;

            if (delta > 0 && !isLikelyPasteOrLoad) {
                // Use functional update to ensure we have the latest dailyProgress
                setDailyProgress(prev => {
                    const newProgress = prev + delta;
                    localStorage.setItem(getTodayKey(), newProgress.toString());
                    return newProgress;
                });
            }

            // Update previous count to current
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
        toast.success("Progreso diario reiniciado");
    };

    const progressPercentage = Math.min(100, (dailyProgress / dailyGoal) * 100);

    return (
        <div className={`h-8 bg-titanium-950 border-t border-titanium-800 flex items-center justify-between px-4 text-[10px] text-titanium-400 select-none ${className}`}>

            {/* LEFT: METRICS & GUARDIAN */}
            <div className="flex items-center gap-4">
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
                        title="Estado del Canon (Clic para forzar auditoría)"
                    >
                        <ScanEye size={12} />
                        <span className="font-bold tracking-wider">
                            {guardianStatus === 'scanning' ? 'ESCANEO...' :
                             guardianStatus === 'conflict' ? 'CONFLICTO' : 'ARGOS'}
                        </span>
                    </button>
                )}

                <div className="h-3 w-px bg-titanium-800 mx-1" />

                <div className="flex items-center gap-1.5 hover:text-titanium-200 transition-colors">
                    <Type size={12} />
                    <span>{wordCount.toLocaleString()} palabras</span>
                </div>
                <div className="flex items-center gap-1.5 hover:text-titanium-200 transition-colors">
                    <Clock size={12} />
                    <span>~{readingTime} min</span>
                </div>
            </div>

            {/* CENTER/RIGHT: DAILY GOAL (LA JOYA) */}
            <div className="flex items-center gap-3 relative group">

                {/* SETTINGS POPOVER */}
                {isSettingsOpen && (
                    <div className="absolute bottom-10 right-0 bg-titanium-950 border border-titanium-700 p-3 rounded-lg shadow-2xl w-48 z-50 animate-in fade-in slide-in-from-bottom-2">
                        <div className="mb-3">
                            <label className="block text-xs font-bold text-titanium-100 mb-2">Meta Diaria</label>
                            <input
                                type="number"
                                value={dailyGoal}
                                onChange={handleGoalChange}
                                className="w-full bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded px-2 py-1 text-xs focus:border-emerald-500 outline-none"
                            />
                        </div>

                        <button
                            onClick={handleResetProgress}
                            className="w-full flex items-center justify-center gap-2 px-2 py-1.5 bg-titanium-800 hover:bg-red-900/30 text-titanium-300 hover:text-red-400 rounded transition-colors text-xs"
                        >
                            <RefreshCw size={12} />
                            Reiniciar Progreso
                        </button>
                    </div>
                )}

                <div className="flex flex-col w-32 gap-1">
                    <div className="flex justify-between text-[9px] uppercase tracking-wider font-bold">
                        <span className={dailyProgress >= dailyGoal ? "text-emerald-400" : "text-titanium-500"}>
                            {dailyProgress >= dailyGoal ? "¡Objetivo Cumplido!" : "Objetivo Diario"}
                        </span>
                        <span className="text-titanium-400">{dailyProgress} / {dailyGoal}</span>
                    </div>
                    <div className="h-1 w-full bg-titanium-800 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${dailyProgress >= dailyGoal ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`}
                            style={{ width: `${progressPercentage}%` }}
                        />
                    </div>
                </div>

                <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="p-1 hover:bg-titanium-800 rounded text-titanium-500 hover:text-white transition-colors"
                >
                    <Settings size={12} />
                </button>
            </div>
        </div>
    );
};

export default StatusBar;
