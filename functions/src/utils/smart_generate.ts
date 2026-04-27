import { GoogleGenerativeAI } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { MODEL_FLASH, MODEL_PRO, SAFETY_SETTINGS_PERMISSIVE, LITERARY_FICTION_PROTOCOL } from "../ai_config";

export interface SmartResponse {
    text?: string;
    error?: string;
    reason?: string;
    modelUsed: string;
    details?: string;
}

export interface SmartConfig {
    useFlash?: boolean; // If true, tries Flash first, then Pro. If false, Pro only.
    systemInstruction?: string;
    temperature?: number;
    jsonMode?: boolean;
    contextLabel?: string;
    maxOutputTokens?: number;
    mediaPayload?: {
        inlineData: {
            mimeType: string;
            data: string;
        }
    };
}

/**
 * 🛡️ SMART GENERATE (El Estratega)
 * Implements the "Smart Fallback" logic:
 * 1. Tries the requested model (Flash or Pro).
 * 2. If blocked (Safety) or empty (Silent Block), retries with Pro (if Flash was used).
 * 3. Uses "God Mode" candidate extraction to bypass soft blocks.
 */
export async function smartGenerateContent(
    genAI: GoogleGenerativeAI,
    prompt: string,
    config: SmartConfig
): Promise<SmartResponse> {
    const contextLabel = config.contextLabel || "SmartGenerate";
    const useFlash = config.useFlash ?? false; // Default to Pro if not specified (Safe default)

    // Determine initial model
    const primaryModelName = useFlash ? MODEL_FLASH : MODEL_PRO;

    try {
        // ATTEMPT 1: Primary Model
        const result = await _executeGeneration(genAI, primaryModelName, prompt, config);

        if (result.success) {
            return {
                text: result.text,
                modelUsed: primaryModelName
            };
        }

        // If we used Pro and failed, we can't fallback (Pro is the last line of defense).
        if (!useFlash) {
            return {
                error: result.error,
                reason: result.reason,
                details: result.details,
                modelUsed: primaryModelName
            };
        }

        // ATTEMPT 2: FALLBACK TO PRO (The Judge)
        logger.warn(`⚠️ [SMART_GENERATE] Flash failed (${result.reason || result.error}). Escalating to PRO for ${contextLabel}.`);

        const fallbackResult = await _executeGeneration(genAI, MODEL_PRO, prompt, config);

        if (fallbackResult.success) {
            return {
                text: fallbackResult.text,
                modelUsed: MODEL_PRO
            };
        }

        // Both failed
        return {
            error: fallbackResult.error || "ALL_MODELS_FAILED",
            reason: fallbackResult.reason || "Escalation Failed",
            details: fallbackResult.details,
            modelUsed: "BOTH"
        };

    } catch (e: any) {
        logger.error(`💥 [SMART_GENERATE] Critical System Failure in ${contextLabel}:`, e);
        return {
            error: "SYSTEM_ERROR",
            details: e.message,
            modelUsed: "UNKNOWN"
        };
    }
}

// 🛡️ BLINDAJE DE EXTRACCIÓN (El Escudo)
// Internal Helper: Executes a single generation attempt with "God Mode" extraction
async function _executeGeneration(
    genAI: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    config: SmartConfig
): Promise<{ success: boolean; text?: string; error?: string; reason?: string; details?: string }> {

    try {
        const finalSystemInstruction = LITERARY_FICTION_PROTOCOL + "\n\n" + (config.systemInstruction || "");

        const model = genAI.getGenerativeModel({
            model: modelName,
            safetySettings: SAFETY_SETTINGS_PERMISSIVE,
            systemInstruction: finalSystemInstruction,
            generationConfig: {
                temperature: config.temperature ?? 0.7,
                responseMimeType: config.jsonMode ? "application/json" : "text/plain",
                maxOutputTokens: config.maxOutputTokens
            } as any
        });

        const result = await model.generateContent(prompt);
        const response = result.response;

        // A. Verificación de Seguridad (Safety Check)
        // Check for explicit Block Reason FIRST
        if (response.promptFeedback?.blockReason) {
             // 🟢 GOD MODE: Even if blocked, we check for candidates.
             // Sometimes Gemini flags content but still returns it in parts.
             if (response.candidates && response.candidates.length > 0) {
                 const firstCandidate = response.candidates[0];
                 if (firstCandidate.content && firstCandidate.content.parts && firstCandidate.content.parts.length > 0) {
                      const manualText = firstCandidate.content.parts.map((p: any) => p.text).join('');
                      if (manualText) {
                          logger.warn(`🛡️ [SMART_GENERATE] Safety Warning in ${config.contextLabel} (Bypassed per God Mode):`, response.promptFeedback);
                          return { success: true, text: manualText };
                      }
                 }
             }

             // If no manual text found, respect the block
             logger.warn(`🛡️ [GUARDIAN] Bloqueo detectado: ${response.promptFeedback.blockReason}`, {
                 safetyRatings: response.promptFeedback.safetyRatings
             });
             return { success: false, error: 'CONTENT_BLOCKED', reason: response.promptFeedback.blockReason };
        }

        // B. Verificación de Candidatos (Candidate Check)
        // Detect "Silent Block" or Network Error (No Manual Candidates Found)
        if (!response.candidates || response.candidates.length === 0) {
             logger.warn(`🛡️ [GUARDIAN] Respuesta vacía (Silent Block) en ${config.contextLabel}.`);
             return { success: false, error: 'SILENT_BLOCK', reason: 'Empty Response/No Candidates' };
        }

        // C. Extracción Segura
        // Now it is safe to call .text() because we verified candidates exist.
        try {
            const text = response.text();
            if (text) return { success: true, text };
        } catch (textError) {
             // Fallback: If .text() throws despite candidates existing (rare, usually finishReason mismatch)
             // We try manual extraction again
             const firstCandidate = response.candidates[0];
             const manualText = firstCandidate.content?.parts?.map((p: any) => p.text).join('') || "";
             if (manualText) return { success: true, text: manualText };
        }

        // Final catch-all if text is empty but candidates existed (e.g., pure tool call? unlikely here)
        return { success: false, error: 'GENERATION_FAILED', reason: 'Text extraction returned empty string.' };

    } catch (e: any) {
        // Handle Specific API Errors
        if (e.message?.includes('RECITATION') || e.response?.promptFeedback?.blockReason === 'RECITATION') {
             return { success: false, error: 'RECITATION_DETECTED', reason: 'COPYRIGHT' };
        }
        if (e.message?.includes('PROHIBITED_CONTENT') || e.message?.includes('Text not available')) {
             logger.warn(`🛡️ [GUARDIAN] Bloqueo PROHIBITED_CONTENT en ${config.contextLabel}.`, {
                 details: e.message,
                 response: e.response // Often contains safety details in API error
             });
             return { success: false, error: 'CONTENT_BLOCKED', reason: 'PROHIBITED_CONTENT' };
        }

        logger.error(`🔥 [FATAL] Error crítico en _executeGeneration (${config.contextLabel}):`, e);
        return { success: false, error: 'GENERATION_FAILED', details: e.message };
    }
}
