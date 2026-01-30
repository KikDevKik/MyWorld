import { useProjectConfig } from '../contexts/ProjectConfigContext';

export interface ContextStatus {
    needsReindex: boolean;
    lastUpdate: Date | null;
    lastIndex: Date | null;
}

export const useContextStatus = (): ContextStatus => {
    const { config } = useProjectConfig();

    if (!config) {
        return { needsReindex: false, lastUpdate: null, lastIndex: null };
    }

    const lastSignificantUpdate = config.lastSignificantUpdate ? new Date(config.lastSignificantUpdate) : null;
    const lastIndexed = config.lastIndexed ? new Date(config.lastIndexed) : null;

    let needsReindex = false;

    if (lastSignificantUpdate) {
        if (!lastIndexed) {
            // Updated but never indexed -> Needs index
            needsReindex = true;
        } else {
            // Check if update is newer than index
            needsReindex = lastSignificantUpdate.getTime() > lastIndexed.getTime();
        }
    }

    return {
        needsReindex,
        lastUpdate: lastSignificantUpdate,
        lastIndex: lastIndexed
    };
};
