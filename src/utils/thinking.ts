
const CLOSED_THINKING_REGEX = /<thinking>([\s\S]*?)<\/thinking>/g;

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

    // 1. Extract and remove complete <thinking>...</thinking> blocks in one pass
    // We use replace with a callback to extract content while removing the block
    let cleanText = text.replace(CLOSED_THINKING_REGEX, (_match, content) => {
        if (content && content.trim()) {
            thinkingParts.push(content.trim());
        }
        return ""; // Replace the block with empty string
    }).trim();

    // 2. Handle unclosed <thinking> tag (Streaming scenario)
    // If the text ends with an open thinking block that hasn't closed yet.
    // Note: Since we removed all closed blocks, any remaining <thinking> is unclosed.
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
