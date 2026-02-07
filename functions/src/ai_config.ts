import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 🟢 MODEL CONFIGURATION
// We now define FLASH and PRO explicitly.
// FLASH (El Soldado): Fast, cheap, but sensitive.
// PRO (El Juez): Deep reasoning, robust, understands context.
export const MODEL_FLASH = "gemini-3-flash-preview";
export const MODEL_PRO = "gemini-3-pro-preview";

// 🟢 LEGACY POINTERS
export const MODEL_LOW_COST = MODEL_FLASH;
export const MODEL_HIGH_REASONING = MODEL_PRO;

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GEMINI NATIVE SAFETY PROTOCOL (PROTOCOL SIN FILTROS)
// Objective: Eliminate "Standard text() access failed" by disabling CORRECT Gemini safety filters.
// We strictly use GEMINI categories and IGNORE PaLM categories (Medical, Violence, etc) to prevent API errors.

export const SAFETY_SETTINGS_PERMISSIVE = [
    {
        // GEMINI NATIVE: Harassment
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // OFF: Allows narrative conflict
    },
    {
        // GEMINI NATIVE: Hate Speech
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE, // OFF: Allows villains/aggressive dialogue
    },
    {
        // GEMINI NATIVE: Sexually Explicit
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // OFF: Allows mature themes/romance
    },
    {
        // GEMINI NATIVE: Dangerous Content
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE, // OFF: Allows combat scenes/weapons
    },
    // NOTE: HARM_CATEGORY_CIVIC_INTEGRITY is DEPRECATED. Excluded.
    // NOTE: HARM_CATEGORY_VIOLENCE, MEDICAL, TOXICITY are PaLM specific. Excluded to prevent API errors.
];
