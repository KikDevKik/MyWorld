import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

export const MODEL_HIGH_REASONING = "gemini-3-pro-preview";
export const MODEL_LOW_COST = "gemini-3-flash-preview";

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GLOBAL PERMISSIVE SETTINGS (MYWORLD CREATIVE FREEDOM - GOD MODE)
// We disable all safety blocks because MyWorld is a creative writing tool for ANY story.
// Filters hinder creativity and narrative freedom.

// 1. Define the "Must Have" categories (The Big 4)
const CORE_SAFETY_SETTINGS = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// 2. Define "Ghost/Advanced" categories (Politics, Medical, Violence)
// We treat these as optional to prevent SDK crashes if they are deprecated in your version.
const ADVANCED_CATEGORIES = [
    "HARM_CATEGORY_CIVIC_INTEGRITY", // Politics/Religion
    "HARM_CATEGORY_DANGEROUS",       // Alternate Danger tag
    "HARM_CATEGORY_MEDICAL",         // Gore/Forensic descriptions
    "HARM_CATEGORY_VIOLENCE",        // Graphic violence
    "HARM_CATEGORY_UNSPECIFIED"      // Catch-all
];

// 3. Dynamic Injection Logic
// This ensures we only add categories that actually exist in the imported HarmCategory enum
const EXTENDED_SAFETY_SETTINGS = [...CORE_SAFETY_SETTINGS];

ADVANCED_CATEGORIES.forEach((catName) => {
    // Type assertion to access enum by string key safely
    if (HarmCategory[catName as keyof typeof HarmCategory]) {
        EXTENDED_SAFETY_SETTINGS.push({
            category: HarmCategory[catName as keyof typeof HarmCategory],
            threshold: HarmBlockThreshold.BLOCK_NONE,
        });
    }
});

// 4. Export the final combined list
export const SAFETY_SETTINGS_PERMISSIVE = EXTENDED_SAFETY_SETTINGS;
