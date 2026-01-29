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
