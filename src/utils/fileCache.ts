export const FileCache = {
    prefix: 'myworld_cache_',

    get: (fileId: string): string | null => {
        try {
            return localStorage.getItem(`${FileCache.prefix}${fileId}`);
        } catch (e) {
            console.warn("FileCache Read Error:", e);
            return null;
        }
    },

    set: (fileId: string, content: string): void => {
        try {
            localStorage.setItem(`${FileCache.prefix}${fileId}`, content);
        } catch (e) {
            console.warn("FileCache Write Error (Quota Exceeded?):", e);
            // Optional: Clear old items if quota exceeded (LRU not implemented for simplicity yet)
        }
    },

    remove: (fileId: string): void => {
        localStorage.removeItem(`${FileCache.prefix}${fileId}`);
    },

    clear: (): void => {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(FileCache.prefix)) {
                localStorage.removeItem(key);
            }
        });
    }
};
