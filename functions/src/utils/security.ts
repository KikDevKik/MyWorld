import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

/**
 * 🛡️ SENTINEL: Secure Error Handler
 * Prevents leaking internal stack traces or sensitive info to the client.
 * Logs the full error server-side for debugging.
 *
 * @param error The error object caught in the try/catch block
 * @param contextLabel A string to identify where the error occurred (e.g., function name)
 * @returns An HttpsError that is safe to return to the client
 */
export function handleSecureError(error: any, contextLabel: string): HttpsError {
    // 1. If it's already a controlled HttpsError, re-throw it (it's safe).
    if (error instanceof HttpsError) {
        return error;
    }

    // 2. Log the raw error (Server-Side Only)
    // We include the contextLabel to know which function failed.
    logger.error(`💥 [SECURE_ERROR_TRAP] in ${contextLabel}:`, error);

    // 3. Return a sanitized error to the client
    // We do NOT include error.message as it might contain file paths or DB queries.
    return new HttpsError(
        "internal",
        "Ocurrió un error interno en el sistema. Por favor, intente más tarde."
    );
}

/**
 * 🔑 KEYMASTER: AI Key Resolver
 * Prioritizes BYOK (Bring Your Own Key) from client, falls back to System Key.
 *
 * @param requestData The request.data object from the Callable Function
 * @param systemKeyValue The value of the system-defined secret (googleApiKey.value())
 */
export function getAIKey(requestData: any, systemKeyValue: string): string {
    const override = requestData?._authOverride;

    if (override && typeof override === 'string' && override.startsWith("AIza")) {
        // Basic validation: Google Keys usually start with AIza
        // We log (masked) that we are using an override
        logger.info("🔑 [KEYMASTER] Using BYOK (Custom Key) for this request.");
        return override;
    }

    // Fallback to System
    // logger.info("🔑 [KEYMASTER] Using System Key."); // Too verbose for every call
    return systemKeyValue;
}

/**
 * 🛡️ SENTINEL: URL Validator
 * Checks if a URL is safe to fetch (prevents SSRF).
 * Blocks private IPs, localhost, and metadata services.
 * Note: Node's URL parser normalizes Hex/Octal IPs to dotted decimal (e.g., 0x7f000001 -> 127.0.0.1),
 * so we rely on that for obfuscation detection.
 */
export function isSafeUrl(url: string): boolean {
    try {
        const parsed = new URL(url);

        // Protocol Check
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

        let hostname = parsed.hostname.toLowerCase();

        // Strip trailing dot (DNS root)
        if (hostname.endsWith('.')) hostname = hostname.slice(0, -1);

        // Strip square brackets for IPv6
        if (hostname.startsWith('[') && hostname.endsWith(']')) {
            hostname = hostname.slice(1, -1);
        }

        // 1. Block Localhost & Metadata
        if (hostname === 'localhost' || hostname === 'metadata.google.internal') return false;

        // 2. Block numeric private IPs (IPv4)
        // 0.0.0.0/8
        if (hostname.startsWith('0.')) return false;
        // 127.0.0.0/8
        if (hostname.startsWith('127.')) return false;
        // 169.254.0.0/16
        if (hostname.startsWith('169.254.')) return false;
        // 10.0.0.0/8
        if (hostname.startsWith('10.')) return false;
        // 192.168.0.0/16
        if (hostname.startsWith('192.168.')) return false;
        // 172.16.0.0/12 (172.16 - 172.31)
        if (hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)) return false;

        // 3. Block IPv6 localhost/private
        if (hostname === '::1') return false;
        // Unique Local (fc00::/7)
        if (hostname.startsWith('fc') || hostname.startsWith('fd')) return false;
        // Link Local (fe80::/10)
        if (hostname.startsWith('fe80:')) return false;

        return true;
    } catch (e) {
        return false;
    }
}
