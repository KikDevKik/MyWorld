import { GoogleGenerativeAI } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { MODEL_FLASH, MODEL_PRO, SAFETY_SETTINGS_PERMISSIVE } from "../ai_config";

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

// Internal Helper: Executes a single generation attempt with "God Mode" extraction
async function _executeGeneration(
    genAI: GoogleGenerativeAI,
    modelName: string,
    prompt: string,
    config: SmartConfig
): Promise<{ success: boolean; text?: string; error?: string; reason?: string; details?: string }> {

    try {
        const model = genAI.getGenerativeModel({
            model: modelName,
            safetySettings: SAFETY_SETTINGS_PERMISSIVE,
            generationConfig: {
                temperature: config.temperature ?? 0.7,
                responseMimeType: config.jsonMode ? "application/json" : "text/plain",
                maxOutputTokens: config.maxOutputTokens
            } as any
        });

        const result = await model.generateContent(prompt);

        // 🟢 GOD MODE: PRIORITY EXTRACTION (Code Pattern: Content > Safety)
        // Check candidates FIRST. If text exists, take it, ignoring finishReason.
        if (result.response.candidates && result.response.candidates.length > 0) {
            const firstCandidate = result.response.candidates[0];
            if (firstCandidate.content && firstCandidate.content.parts && firstCandidate.content.parts.length > 0) {
                 const manualText = firstCandidate.content.parts.map((p: any) => p.text).join('');
                 if (manualText) {
                     // Log warning if flagged but text exists
                     if (result.response.promptFeedback?.blockReason) {
                        logger.warn(`🛡️ [SMART_GENERATE] Safety Warning in ${config.contextLabel} (Bypassed per God Mode):`, result.response.promptFeedback);
                     }
                     return { success: true, text: manualText };
                 }
            }
        }

        // Standard text retrieval (Fallback)
        try {
            const text = result.response.text();
            if (text) return { success: true, text };
        } catch (textError) {
             // Expected if blocked
        }

        // If we are here, we have no text.
        if (result.response.promptFeedback?.blockReason) {
             return { success: false, error: 'CONTENT_BLOCKED', reason: result.response.promptFeedback.blockReason };
        }

        // SILENT BLOCK DETECTION (Empty response, no error)
        return { success: false, error: 'SILENT_BLOCK', reason: 'Empty Response' };

    } catch (e: any) {
        // Handle Specific API Errors
        if (e.message?.includes('RECITATION') || e.response?.promptFeedback?.blockReason === 'RECITATION') {
             return { success: false, error: 'RECITATION_DETECTED', reason: 'COPYRIGHT' };
        }
        if (e.message?.includes('PROHIBITED_CONTENT') || e.message?.includes('Text not available')) {
             return { success: false, error: 'CONTENT_BLOCKED', reason: 'PROHIBITED_CONTENT' };
        }

        return { success: false, error: 'GENERATION_FAILED', details: e.message };
    }
}
