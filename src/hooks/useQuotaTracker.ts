import { useState, useCallback } from 'react';

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

export function useQuotaTracker() {
    const storageKey = 'myworld_quota_today';
    const today = new Date().toISOString().split('T')[0];

    const [quota, setQuota] = useState<DailyQuota>(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Si es de otro día, resetear
            if (parsed.date !== today) {
                return { date: today, requestCount: 0, tokenEstimate: 0, lastUpdated: Date.now() };
            }
            return parsed;
        }
        return { date: today, requestCount: 0, tokenEstimate: 0, lastUpdated: Date.now() };
    });

    // Llamar esto después de cada request a Gemini
    const trackRequest = useCallback((estimatedTokens: number = 500) => {
        setQuota(prev => {
            const updated = {
                ...prev,
                requestCount: prev.requestCount + 1,
                tokenEstimate: prev.tokenEstimate + estimatedTokens,
                lastUpdated: Date.now(),
            };
            localStorage.setItem(storageKey, JSON.stringify(updated));
            return updated;
        });
    }, []);

    const resetQuota = useCallback(() => {
        const fresh = { date: today, requestCount: 0, tokenEstimate: 0, lastUpdated: Date.now() };
        localStorage.setItem(storageKey, JSON.stringify(fresh));
        setQuota(fresh);
    }, [today]);

    const usagePercent = Math.min(
        (quota.requestCount / FREE_TIER_LIMITS.RPD) * 100, 
        100
    );

    const status: 'ok' | 'warning' | 'critical' = 
        usagePercent >= 90 ? 'critical' :
        usagePercent >= 70 ? 'warning' : 'ok';

    return {
        quota,
        trackRequest,
        resetQuota,
        usagePercent,
        status,
        limits: FREE_TIER_LIMITS,
        requestsLeft: Math.max(FREE_TIER_LIMITS.RPD - quota.requestCount, 0),
    };
}
