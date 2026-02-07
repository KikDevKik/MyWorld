import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export const MODEL_HIGH_REASONING = "gemini-3-pro-preview";
export const MODEL_LOW_COST = "gemini-3-flash-preview";

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GLOBAL PERMISSIVE SETTINGS (MYWORLD CREATIVE FREEDOM - GOD MODE)
// We disable all safety blocks because MyWorld is a creative writing tool for ANY story.
// Filters hinder creativity and narrative freedom.

// Define STRICTLY SUPPORTED categories for Gemini 3 Flash Preview.
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
