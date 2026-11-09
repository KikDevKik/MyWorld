// Nov 2026: una sola puerta para las herramientas que antes solo funcionaban con Claude
// (Mapa, Personajes, Ideas, Reporte del capítulo, chat de dudas y Memoria). Con Claude activo
// (nivel MyWorld o clave propia de Anthropic) responde Claude; en el nivel gratis responde Gemini
// con la clave del autor. Antes, en el nivel gratis estas herramientas mostraban «usa Claude y
// todavía no está activo para tu cuenta», y la memoria no se guardaba nunca.
import * as logger from "firebase-functions/logger";
import { GoogleGenerativeAI } from "./genai";
import { claudeEnabledForCurrentUser, callClaude } from "./claude_router";
import { smartGenerateContent } from "./smart_generate";
import { getRequestGeminiKey } from "./request_context";

export interface AiTextResult { ok: boolean; text?: string; error?: string; noCredit?: boolean; refusal?: boolean; stopReason?: string }

export async function aiText(opts: any): Promise<AiTextResult> {
    if (claudeEnabledForCurrentUser()) return callClaude(opts);
    const key = getRequestGeminiKey();
    if (!key) return { ok: false, error: "NO_GEMINI_KEY" };
    const system = (opts.system || []).map((b: any) => String(b?.text || "")).filter(Boolean).join("\n\n");
    const prompt = (opts.content || []).filter((c: any) => c?.type === "text").map((c: any) => String(c.text || "")).join("\n\n");
    const wantsJson = /SOLO (con )?(el )?JSON|ÚNICAMENTE con JSON|Responde SOLO JSON/i.test(prompt + system);
    try {
        const r = await smartGenerateContent(new GoogleGenerativeAI(key), prompt, {
            systemInstruction: system,
            _tier: "normal",
            taskType: "standard",
            thinkingBudget: 2048,
            maxOutputTokens: Math.max(Number(opts.maxTokens) || 4096, 4096),
            temperature: 0.6,
            jsonMode: wantsJson,
            contextLabel: `${opts.label || "AiText"}_Gemini`,
        });
        if (r.text) return { ok: true, text: r.text };
        logger.warn(`[AI_TEXT] ${opts.label}: Gemini sin texto (${r.error || ""} ${r.details || ""})`);
        return { ok: false, error: r.error || "GEMINI_EMPTY" };
    } catch (e: any) {
        logger.warn(`[AI_TEXT] ${opts.label}: Gemini falló: ${e?.message}`);
        return { ok: false, error: String(e?.message || e) };
    }
}
