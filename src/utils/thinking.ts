
/**
 * Parses text to extract <thinking>...</thinking> blocks.
 * Handles both complete blocks and unclosed blocks (streaming).
 *
 * @param text The input text containing potential thinking blocks.
 * @returns An object with the combined thinking content (if any) and the cleaned text.
 */
export function parseThinking(text: string): { thinking: string | null; content: string } {
    if (!text) return { thinking: null, content: "" };

    const thinkingParts: string[] = [];
    let cleanText = text;

    // 1. Extract complete <thinking>...</thinking> blocks
    // Note: We use a loop to handle multiple blocks if present
    const closedRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
    let match;
    while ((match = closedRegex.exec(text)) !== null) {
        if (match[1].trim()) {
            thinkingParts.push(match[1].trim());
        }
    }

    // Remove all closed blocks from the text
    cleanText = cleanText.replace(closedRegex, "").trim();

    // 2. Handle unclosed <thinking> tag (Streaming scenario)
    // If the text ends with an open thinking block that hasn't closed yet.
    const openTagIndex = cleanText.indexOf("<thinking>");
    if (openTagIndex !== -1) {
        const trailingThought = cleanText.substring(openTagIndex + 10).trim();
        if (trailingThought) {
            thinkingParts.push(trailingThought);
        }
        // Remove the unclosed block from content to prevent leakage
        cleanText = cleanText.substring(0, openTagIndex).trim();
    }

    return {
        thinking: thinkingParts.length > 0 ? thinkingParts.join("\n\n---\n\n") : null,
        content: cleanText
    };
}
