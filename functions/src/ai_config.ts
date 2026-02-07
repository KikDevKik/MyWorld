import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 🟢 MODEL CONFIGURATION
// We now define FLASH and PRO explicitly.
// FLASH (El Soldado): Fast, cheap, but sensitive.
// PRO (El Juez): Deep reasoning, robust, understands context.
export const MODEL_FLASH = "gemini-3-flash-preview";
export const MODEL_PRO = "gemini-3-pro-preview";

// 🟢 LEGACY POINTERS (For backwards compatibility if needed, though we will refactor)
// MODEL_LOW_COST is now explicitly FLASH, but wrapped in Smart Fallback logic.
export const MODEL_LOW_COST = MODEL_FLASH;
// MODEL_HIGH_REASONING is PRO.
export const MODEL_HIGH_REASONING = MODEL_PRO;

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GLOBAL PERMISSIVE SETTINGS (MYWORLD CREATIVE FREEDOM - GOD MODE)
// We disable all safety blocks because MyWorld is a creative writing tool for ANY story.
// Filters hinder creativity and narrative freedom.

// Define STRICTLY SUPPORTED categories for Gemini 3 Preview models.
// This prevents 400 Bad Request errors caused by unsupported categories (Medical, Violence, Unspecified).
export const SAFETY_SETTINGS_PERMISSIVE = [
    // 1. Harassment
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    // 2. Hate Speech
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    // 3. Sexually Explicit
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    // 4. Dangerous Content
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    // 5. Civic Integrity (Politics/Elections) - EXPLICITLY SUPPORTED
    {
        category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];
