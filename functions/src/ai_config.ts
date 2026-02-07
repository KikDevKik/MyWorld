import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export const MODEL_HIGH_REASONING = "gemini-3-pro-preview";
export const MODEL_LOW_COST = "gemini-3-flash-preview";

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GLOBAL PERMISSIVE SETTINGS (MYWORLD CREATIVE FREEDOM - GOD MODE)
// We disable ALL safety blocks because MyWorld is a creative writing tool for ANY story.
// Filters hinder creativity and narrative freedom.
//
// DYNAMIC INJECTION:
// We now iterate over ALL available HarmCategory enums in the SDK to catch
// new or undocumented categories (like Medical, Violence, Unspecified) that
// might be causing silent blocks on Gemini 3.0.
export const SAFETY_SETTINGS_PERMISSIVE = Object.values(HarmCategory).map((category) => ({
    category: category,
    threshold: HarmBlockThreshold.BLOCK_NONE,
}));
