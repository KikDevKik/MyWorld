// Nov 2026: una sola puerta para las herramientas que antes solo funcionaban con Claude
// (Mapa, Personajes, Ideas, Reporte del capítulo, chat de dudas y Memoria). Con Claude activo
// (nivel MyWorld o clave propia de Anthropic) responde Claude; en el nivel gratis responde Gemini
// con la clave del autor. Antes, en el nivel gratis estas herramientas mostraban «usa Claude y
// todavía no está activo para tu cuenta», y la memoria no se guardaba nunca.
import * as logger from "firebase-functions/logger";
import { HttpsError } from "firebase-functions/v2/https";
import { GoogleGenerativeAI } from "./genai";
import { claudeEnabledForCurrentUser, callClaude } from "./claude_router";
import { smartGenerateContent } from "./smart_generate";
import { getRequestGeminiKey } from "./request_context";

export interface AiTextResult { ok: boolean; text?: string; error?: string; noCredit?: boolean; refusal?: boolean; stopReason?: string }

export async function aiText(opts: any): Promise<AiTextResult> {
    const key = getRequestGeminiKey();
    if (claudeEnabledForCurrentUser()) {
        const c = await callClaude(opts);
        // Nov 2026: al llegar al tope mensual de Claude, sigue con Gemini si el autor tiene su clave.
        if (c.ok || c.error !== "MONTHLY_CAP" || !key) return c;
        logger.info(`[AI_TEXT] ${opts.label}: tope de Claude alcanzado; sigue con Gemini.`);
    }
    // Nov 2026: errores del nivel gratis con un mensaje claro (antes salían como «internal»).
    if (!key) throw new HttpsError("failed-precondition", "Para usar la IA gratis falta tu clave de Gemini. Agrégala en Ajustes → Config IA.");
    const system = (opts.system || []).map((b: any) => String(b?.text || "")).filter(Boolean).join("\n\n");
    const prompt = (opts.content || []).filter((c: any) => c?.type === "text").map((c: any) => String(c.text || "")).join("\n\n");
    // Nov 2026: Gemini recibe una sola imagen por petición: la más reciente (la última del mensaje).
    const lastImage = [...(opts.content || [])].reverse().find((c: any) => c?.type === "image" && c?.source?.data);
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
            ...(lastImage ? { mediaPayload: { inlineData: { mimeType: lastImage.source.media_type, data: lastImage.source.data } } } : {}),
            contextLabel: `${opts.label || "AiText"}_Gemini`,
        });
        if (r.text) return { ok: true, text: r.text };
        logger.warn(`[AI_TEXT] ${opts.label}: Gemini sin texto (${r.error || ""} ${r.details || ""})`);
        if (r.error === "QUOTA_EXCEEDED") throw new HttpsError("resource-exhausted", "Tu clave gratis de Gemini llegó a su límite por ahora. Espera unos minutos (o hasta mañana) o cambia de nivel en Ajustes → Config IA.");
        if (/timed? ?out|abort|deadline/i.test(String(r.details || ""))) throw new HttpsError("deadline-exceeded", "Gemini tardó demasiado en responder. Intenta otra vez en un momento.");
        return { ok: false, error: r.error || "GEMINI_EMPTY" };
    } catch (e: any) {
        if (e instanceof HttpsError) throw e;
        logger.warn(`[AI_TEXT] ${opts.label}: Gemini falló: ${e?.message}`);
        return { ok: false, error: String(e?.message || e) };
    }
}
