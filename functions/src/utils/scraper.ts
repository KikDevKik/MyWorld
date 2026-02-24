import { JSDOM } from "jsdom";
import * as logger from "firebase-functions/logger";
import { safeFetch } from "./security";

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
 * Iteratively extracts text from a DOM node, inserting newlines for block elements.
 * 🛡️ SENTINEL: Replaced recursion with stack-based iteration to prevent Stack Overflow (DoS).
 */
export function extractReadableText(root: Node): string {
    let text = "";
    // Stack stores nodes to visit.
    // We need to process opening tag (enter) and closing tag (leave) logic.
    // 'enter': Push text, handle block start newline, push children.
    // 'leave': Handle block end newline.
    const stack: { node: Node, phase: 'enter' | 'leave' }[] = [{ node: root, phase: 'enter' }];

    while (stack.length > 0) {
        const item = stack.pop()!;
        const currentNode = item.node;
        const phase = item.phase;

        if (currentNode.nodeType === 3) { // TEXT_NODE
            if (phase === 'enter') {
                 text += currentNode.textContent || "";
            }
            continue;
        }

        if (currentNode.nodeType === 1) { // ELEMENT_NODE
            const el = currentNode as Element;
            const tagName = el.tagName.toLowerCase();

            // Skip clutter
            if (['script', 'style', 'noscript', 'iframe', 'svg', 'img'].includes(tagName)) continue;

            if (tagName === 'br') {
                if (phase === 'enter') text += "\n";
                continue;
            }

            const isBlock = ['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'article', 'section', 'blockquote', 'pre'].includes(tagName);

            if (phase === 'enter') {
                if (isBlock) text += "\n";

                // Re-push for 'leave' phase (post-order logic)
                stack.push({ node: currentNode, phase: 'leave' });

                // Push children in reverse order so they are popped in correct order
                const children = currentNode.childNodes;
                for (let i = children.length - 1; i >= 0; i--) {
                    stack.push({ node: children[i], phase: 'enter' });
                }
            } else if (phase === 'leave') {
                if (isBlock) text += "\n";
            }
        }
    }

    return text;
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
        let response: any = null;
        let redirectCount = 0;
        const MAX_REDIRECTS = 5;

        while (redirectCount <= MAX_REDIRECTS) {
            // 1. Safe Fetch with Atomic DNS Check (replaces validateUrlDns + fetch)
            // This prevents TOCTOU attacks by pinning the DNS resolution to the connection.
            try {
                response = await safeFetch(currentUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; MyWorldBot/1.0; +http://www.google.com/bot.html)'
                    },
                    signal: AbortSignal.timeout(8000),
                    maxSizeBytes: 5 * 1024 * 1024, // Limit to 5MB to prevent DoS
                });
            } catch (e: any) {
                if (e.message && e.message.includes('DNS Blocked')) {
                    logger.warn(`🛡️ [SENTINEL] Blocked unsafe URL (DNS Atomic check): ${currentUrl}`);
                    return null;
                }
                throw e; // Propagate other errors
            }

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers['location'];
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
        // 🛡️ SENTINEL: Use iterative extraction
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
