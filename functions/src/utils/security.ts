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
