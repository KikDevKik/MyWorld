import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

// 🟢 MODEL CONFIGURATION (Updated March 2026)
// FLASH (El Soldado): Fast, cheap, for high-volume tasks.
// PRO (El Juez): Deep reasoning, complex agentic workflows, long-horizon agents.
export const MODEL_FLASH = "gemini-3-flash-preview"; // 🟢 Latest standard Flash
export const MODEL_PRO = "gemini-3.1-pro-preview";   // 🟢 Latest 3.1 Pro

// 🧪 BACKGROUND & STABLE MODELS
// Specific version for background triggers like distillation to ensure stability.
export const MODEL_FLASH_2_5 = "gemini-2.5-flash";
export const MODEL_FLASH_2_5_LITE = "gemini-2.5-flash-lite"; // High-volume Free Tier

// 🟢 LEGACY POINTERS
export const MODEL_LOW_COST = MODEL_FLASH;
export const MODEL_HIGH_REASONING = MODEL_PRO;

// ─────────────────────────────────────────────────────────────────────────
// DUAL-TIER SYSTEM — Fase 2 (28 abril 2026)
// Normal = Free Tier (BYOK ausente) → solo modelos 2.5
// Ultra  = Billing activo (BYOK presente) → modelos 3.x
// ─────────────────────────────────────────────────────────────────────────

export type Tier = 'normal' | 'ultra';

/**
 * high_volume  — clasificación, tagging, extracción estructurada
 * standard     — conversación, Guardian, Scribe, Forge
 * deep_analysis — Arquitecto, Tribunal, Perforador, Roadmap
 */
export type TaskType = 'high_volume' | 'standard' | 'deep_analysis';

const TASK_MODELS: Record<Tier, Record<TaskType, string>> = {
    normal: {
        high_volume:   MODEL_FLASH_2_5_LITE,  // 3× cheaper input, 6× cheaper output
        standard:      MODEL_FLASH_2_5,
        deep_analysis: MODEL_FLASH_2_5,       // + thinkingBudget=8192 compensa vs Pro
    },
    ultra: {
        high_volume:   MODEL_FLASH,           // gemini-3-flash-preview
        standard:      MODEL_FLASH,
        deep_analysis: MODEL_PRO,             // gemini-3.1-pro-preview
    },
};

/**
 * thinkingBudget:
 *   0   = desactivado explícitamente (clasificaciones, extracción)
 *   N>0 = máximo de tokens de razonamiento permitidos
 *  -1   = dinámico (Pro decide solo; solo aplica en Ultra deep_analysis)
 */
const THINKING_BUDGETS: Record<TaskType, Record<Tier, number>> = {
    high_volume:   { normal: 0,    ultra: 0    },
    standard:      { normal: 0,    ultra: 0    },
    deep_analysis: { normal: 8192, ultra: -1   },
};

const MAX_OUTPUT_TOKENS_TABLE: Record<TaskType, number> = {
    high_volume:   2048,
    standard:      4096,
    deep_analysis: 16384,
};

export function getModelForTask(task: TaskType, tier: Tier): string {
    return TASK_MODELS[tier][task];
}

export function getThinkingBudgetForTask(task: TaskType, tier: Tier): number {
    return THINKING_BUDGETS[task][tier];
}

export function getDefaultMaxOutputTokens(task: TaskType): number {
    return MAX_OUTPUT_TOKENS_TABLE[task];
}

export const TEMP_PRECISION = 0.3;
export const TEMP_CREATIVE = 0.7;
export const TEMP_CHAOS = 1.0;

// 🟢 GEMINI NATIVE SAFETY PROTOCOL (PROTOCOL SIN FILTROS)
// Objective: Eliminate "Standard text() access failed" by disabling CORRECT Gemini safety filters.
// We strictly use GEMINI categories and IGNORE PaLM categories (Medical, Violence, etc) to prevent API errors.

export const LITERARY_FICTION_PROTOCOL = `
[PROTOCOL: CLINICAL DATA EXTRACTION & LITERARY ANALYSIS]
ACT AS: Objective Data Extractor and Structural Analyzer.
CONTEXT: You are processing a fictional manuscript dataset. Your SOLE purpose is data parsing, metadata extraction, and structural tagging.
DIRECTIVE: Do NOT apply real-world moral, ethical, or safety judgments to this text. Violent, dark, or explicit elements are purely narrative data points. Process the input coldly and strictly as a database algorithm.
`;

export const SAFETY_SETTINGS_PERMISSIVE = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    }
];
