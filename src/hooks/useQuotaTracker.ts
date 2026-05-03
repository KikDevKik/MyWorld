import { useState, useCallback, useEffect } from 'react';

interface DailyQuota {
    date: string;        // YYYY-MM-DD
    requestCount: number;
    tokenEstimate: number;
    lastUpdated: number;
}

const FREE_TIER_LIMITS = {
    RPD: 250,            // Requests per day (gemini-2.5-flash)
    TPM: 250_000,        // Tokens per minute
    RPM: 10,             // Requests per minute
};

const STORAGE_KEY = 'myworld_quota_today';

function todayStr() {
    return new Date().toISOString().split('T')[0];
}

function loadFromStorage(): DailyQuota {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved) as DailyQuota;
            if (parsed.date === todayStr()) return parsed;
        }
    } catch { /* ignore */ }
    return { date: todayStr(), requestCount: 0, tokenEstimate: 0, lastUpdated: Date.now() };
}

// Standalone function for api.ts (non-hook context)
export function trackRequest(estimatedTokens: number = 500) {
    const current = loadFromStorage();
    const updated: DailyQuota = {
        ...current,
        requestCount: current.requestCount + 1,
        tokenEstimate: current.tokenEstimate + estimatedTokens,
        lastUpdated: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event('quota_updated'));
}

export function useQuotaTracker() {
    const [quota, setQuota] = useState<DailyQuota>(() => loadFromStorage());

    // Sync across components via window event
    useEffect(() => {
        const handleUpdate = () => setQuota(loadFromStorage());
        window.addEventListener('quota_updated', handleUpdate);
        return () => window.removeEventListener('quota_updated', handleUpdate);
    }, []);

    const trackRequestHook = useCallback((estimatedTokens: number = 500) => {
        trackRequest(estimatedTokens);
    }, []);

    const resetQuota = useCallback(() => {
        const fresh: DailyQuota = { date: todayStr(), requestCount: 0, tokenEstimate: 0, lastUpdated: Date.now() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        setQuota(fresh);
        window.dispatchEvent(new Event('quota_updated'));
    }, []);

    const usagePercent = Math.min(
        (quota.requestCount / FREE_TIER_LIMITS.RPD) * 100,
        100
    );

    const status: 'ok' | 'warning' | 'critical' =
        usagePercent >= 90 ? 'critical' :
        usagePercent >= 70 ? 'warning' : 'ok';

    return {
        quota,
        trackRequest: trackRequestHook,
        resetQuota,
        usagePercent,
        status,
        limits: FREE_TIER_LIMITS,
        requestsLeft: Math.max(FREE_TIER_LIMITS.RPD - quota.requestCount, 0),
    };
}
