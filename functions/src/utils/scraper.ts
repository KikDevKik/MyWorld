import { JSDOM } from "jsdom";
import * as logger from "firebase-functions/logger";
import { isSafeUrl } from "./security";

/**
 * Extracts all URLs from a given text string.
 * @param text The input text to search for URLs.
 * @returns An array of found URLs.
 */
export function extractUrls(text: string): string[] {
    // Regex for standard URLs (http/https)
    // Matches http:// or https:// followed by non-whitespace characters
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = text.match(urlRegex);

    if (!matches) return [];

    // Clean trailing punctuation that might be captured (e.g., "Check this link: http://example.com.")
    return matches.map(url => url.replace(/[),;.?]$/, ""));
}

/**
 * Recursively extracts text from a DOM node, inserting newlines for block elements.
 * Improves upon .textContent which merges text from adjacent block elements.
 */
function extractReadableText(node: Node): string {
    if (node.nodeType === 3) { // TEXT_NODE
        return node.textContent || "";
    }

    if (node.nodeType === 1) { // ELEMENT_NODE
        const el = node as Element;
        const tagName = el.tagName.toLowerCase();

        // Skip clutter (Redundant check if already cleaned, but safe)
        if (['script', 'style', 'noscript', 'iframe', 'svg', 'img'].includes(tagName)) return "";
        if (tagName === 'br') return "\n";

        let text = "";

        // Block elements where we want to ensure separation
        const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'blockquote', 'pre'].includes(tagName);

        // Add a newline before block elements if there isn't one (simplistic approach)
        // We will just accumulate and then normalize whitespace later.
        // But to prevent "TitleText", we add a space or newline.

        if (isBlock) text += "\n";

        for (const child of Array.from(node.childNodes)) {
            text += extractReadableText(child);
        }

        if (isBlock) text += "\n";

        return text;
    }

    return "";
}

/**
 * Fetches the content of a URL and returns the visible text.
 * @param url The URL to scrape.
 * @returns An object with title and content, or null if failed.
 */
export async function fetchWebPageContent(url: string): Promise<{ url: string, title: string, content: string } | null> {
    try {
        logger.info(`🌐 Scraping URL: ${url}`);

        let currentUrl = url;
        let response: Response | null = null;
        let redirectCount = 0;
        const MAX_REDIRECTS = 5;

        while (redirectCount <= MAX_REDIRECTS) {
            // 🛡️ SECURITY: SSRF PREVENTION (Check every hop)
            if (!isSafeUrl(currentUrl)) {
                logger.warn(`🛡️ [SENTINEL] Blocked unsafe URL: ${currentUrl}`);
                return null;
            }

            // 1. Fetch with Manual Redirect handling
            response = await fetch(currentUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; MyWorldBot/1.0; +http://www.google.com/bot.html)'
                },
                signal: AbortSignal.timeout(8000),
                redirect: 'manual'
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (!location) {
                    return null;
                }

                try {
                    // Resolve relative URLs
                    currentUrl = new URL(location, currentUrl).toString();
                } catch (e) {
                    logger.warn(`Invalid redirect location: ${location}`);
                    return null;
                }

                redirectCount++;
                logger.info(`   -> Redirecting to: ${currentUrl}`);
                continue;
            }

            break; // Not a redirect, break loop
        }

        if (!response || !response.ok) {
            logger.warn(`Failed to fetch ${currentUrl}: ${response?.status} ${response?.statusText}`);
            return null;
        }

        const html = await response.text();
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        // 2. Remove clutter
        const clutterSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg',
            'nav', 'footer', 'header', 'aside', '.ad', '.ads',
            '.cookie-banner', '#cookie-banner', 'form'
        ];

        clutterSelectors.forEach(selector => {
            const elements = doc.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });

        const title = doc.title || "No Title";

        // 3. Extract Text Smartly
        const main = doc.querySelector('main') || doc.body;
        const rawText = extractReadableText(main);

        // 4. Normalize Whitespace
        // Collapse multiple newlines/spaces into single ones, but preserve paragraph breaks?
        // Let's keep it simple: Collapse runs of spaces to single space, runs of newlines to \n
        const cleanText = rawText
            .replace(/[ \t]+/g, ' ') // Collapse horizontal whitespace
            .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines
            .trim();

        // 5. Truncate
        const MAX_CHARS = 30000;
        const finalContent = cleanText.length > MAX_CHARS
            ? cleanText.substring(0, MAX_CHARS) + "... (TRUNCATED)"
            : cleanText;

        if (finalContent.length < 50) {
            logger.warn(`Scraped content from ${url} is too short (<50 chars).`);
        }

        return {
            url,
            title,
            content: finalContent
        };

    } catch (e: any) {
        if (e.name === 'TimeoutError') {
            logger.warn(`Scraping timeout for ${url}`);
        } else {
            logger.error(`Error scraping ${url}:`, e.message);
        }
        return null;
    }
}
