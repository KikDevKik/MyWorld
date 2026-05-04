import { useState } from 'react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';

export type Tier = 'ultra' | 'normal';
export type TierMode = 'normal' | 'ultra';

export const TIER_MODE_KEY = 'myworld_tier_mode';

export function useTier() {
    const { customGeminiKey } = useProjectConfig();

    const [tierMode, setTierModeState] = useState<TierMode>(() => {
        const saved = localStorage.getItem(TIER_MODE_KEY);
        return (saved === 'ultra' ? 'ultra' : 'normal');
    });

    const tier: Tier = tierMode === 'ultra' ? 'ultra' : 'normal';

    const setTierMode = (mode: TierMode) => {
        localStorage.setItem(TIER_MODE_KEY, mode);
        setTierModeState(mode);
    };

    return {
        tier,
        tierMode,
        isUltra: tier === 'ultra',
        isNormal: tier === 'normal',
        hasByok: !!customGeminiKey,
        setTierMode,
    };
}
