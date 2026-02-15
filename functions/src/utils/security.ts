import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as dns from 'dns';
import { promisify } from 'util';
import * as net from 'net';
import * as https from 'https';
import * as http from 'http';

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
 * 🛡️ SENTINEL: Safe DNS Lookup
 * Resolves hostname to IP and blocks private IPs immediately.
 * Used by safeFetch to prevent DNS Rebinding (TOCTOU).
 */
function safeLookup(hostname: string, options: any, callback: (err: NodeJS.ErrnoException | null, address: string | any, family: number) => void): void {
    dns.lookup(hostname, options, (err, address, family) => {
        if (err) return callback(err, address as string, family);

        // Handle array result (if all: true)
        if (Array.isArray(address)) {
             const anyPrivate = address.some((addr: any) => isPrivateIp(addr.address));
             if (anyPrivate) {
                 return callback(new Error(`DNS Blocked: ${hostname} resolves to private IP(s)`), address as any, family);
             }
        } else if (address && typeof address === 'string' && isPrivateIp(address)) {
            // Log warning but return error to block connection
            return callback(new Error(`DNS Blocked: ${address} is private`), address as string, family);
        }
        callback(null, address as string, family);
    });
}

/**
 * 🛡️ SENTINEL: Safe Fetch
 * Atomic fetch wrapper that prevents TOCTOU/DNS Rebinding attacks.
 * Uses a custom lookup function to ensure the IP validated is the exact same one used for the connection.
 * Returns a Promise that resolves to a Response-like object compatible with the Fetch API.
 */
export function safeFetch(url: string, options: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch (e) {
            return reject(new Error(`Invalid URL: ${url}`));
        }

        // Protocol Check
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return reject(new Error(`Invalid protocol: ${parsedUrl.protocol}`));
        }

        // 🛡️ SECURITY: Direct IP Check (http.request skips lookup for IPs)
        if (net.isIP(parsedUrl.hostname) !== 0 && isPrivateIp(parsedUrl.hostname)) {
            return reject(new Error(`DNS Blocked: ${parsedUrl.hostname} is private`));
        }

        const lib = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            method: options.method || 'GET',
            headers: options.headers || {},
            lookup: safeLookup, // 🛡️ The Critical Fix: Atomic DNS Check
            signal: options.signal,
            timeout: 10000, // 10s default timeout
        };

        const req = lib.request(parsedUrl, requestOptions, (res) => {
            const chunks: Buffer[] = [];

            res.on('data', (chunk) => chunks.push(chunk));

            res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const text = buffer.toString('utf-8');

                resolve({
                    ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    headers: res.headers,
                    // Helper methods to mimic Fetch Response
                    text: async () => text,
                    json: async () => {
                        try {
                            return JSON.parse(text);
                        } catch (e) {
                            throw new Error('Failed to parse JSON');
                        }
                    }
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timed out'));
        });

        // Handle AbortSignal if provided
        if (options.signal) {
           options.signal.addEventListener('abort', () => {
               req.destroy();
               reject(new Error('Request aborted'));
           });
        }

        req.end();
    });
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
