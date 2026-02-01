export const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert to HSL for better neon colors (High Saturation, Lightness ~50-60%)
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 90%, 60%)`;
};
