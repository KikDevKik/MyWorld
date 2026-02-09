import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as dns from 'dns';
import { promisify } from 'util';
import * as net from 'net';

const lookup = promisify(dns.lookup);

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

        // 2. If it is an IP, check if it is private
        if (net.isIP(hostname)) {
            return !isPrivateIp(hostname);
        }

        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Checks if an IP address is private (IPv4/IPv6).
 */
export function isPrivateIp(ip: string): boolean {
    const family = net.isIP(ip);
    if (family === 0) return false;

    // Block IPv4-mapped IPv6 addresses (::ffff:...) to prevent obfuscation bypass
    if (family === 6 && ip.toLowerCase().startsWith('::ffff:')) {
        return true;
    }

    if (family === 4) {
        return /^(0|10|127)\./.test(ip) ||
               ip.startsWith('169.254.') ||
               ip.startsWith('192.168.') ||
               /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip);
    }

    if (family === 6) {
        return ip === '::1' || /^(fc|fd)/i.test(ip) || /^fe80:/i.test(ip);
    }
    return false;
}

/**
 * 🛡️ SENTINEL: DNS-Validated URL Check
 * Resolves hostname to IP to prevent DNS rebinding/obfuscation.
 */
export async function validateUrlDns(url: string): Promise<boolean> {
    if (!isSafeUrl(url)) return false;
    try {
        const { hostname } = new URL(url);
        // If hostname is IP, check it directly
        if (net.isIP(hostname)) return !isPrivateIp(hostname);

        // Resolve DNS
        const { address } = await lookup(hostname);
        if (!address || isPrivateIp(address)) {
            logger.warn(`🛡️ [SENTINEL] Blocked private IP: ${address} for ${hostname}`);
            return false;
        }
        return true;
    } catch (e) {
        logger.warn(`🛡️ [SENTINEL] DNS Resolution failed for ${url}:`, e);
        return false;
    }
}
