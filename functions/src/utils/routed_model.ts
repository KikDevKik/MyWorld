// Oct 2026: sustituto de genAI.getGenerativeModel(...) para las herramientas que llamaban
// a Gemini directamente. Para usuarios autorizados responde con Claude, imitando la forma
// de la respuesta de Gemini (result.response.text()) para no tocar el código que la usa.
// Si Claude falla, usa Gemini como siempre.
import { GoogleGenerativeAI } from "@google/generative-ai";
import * as logger from "firebase-functions/logger";
import { claudeEnabledForCurrentUser, callClaude, CLAUDE_FICTION_SYSTEM, CLAUDE_HAIKU, CLAUDE_SONNET } from "./claude_router";
import { MODEL_PRO } from "../ai_config";

function partsToClaude(parts: any[]): any[] {
    const out: any[] = [];
    for (const p of parts) {
        if (typeof p === "string") out.push({ type: "text", text: p });
        else if (p?.text) out.push({ type: "text", text: p.text });
        else if (p?.inlineData?.mimeType?.startsWith("image/")) {
            out.push({ type: "image", source: { type: "base64", media_type: p.inlineData.mimeType, data: p.inlineData.data } });
        }
    }
    return out;
}

function inputToContent(input: any): any[] {
    if (typeof input === "string") return [{ type: "text", text: input }];
    if (Array.isArray(input)) return partsToClaude(input);
    if (input?.contents) return partsToClaude(input.contents.flatMap((c: any) => c.parts || []));
    return [{ type: "text", text: String(input) }];
}

function sysText(si: any): string {
    if (!si) return "";
    if (typeof si === "string") return si;
    if (si.parts) return si.parts.map((p: any) => p.text || "").join("\n");
    return "";
}

export function routedModel(genAI: GoogleGenerativeAI, params: any, requestOptions?: any, label = "RoutedModel") {
    const gemini = genAI.getGenerativeModel(params, requestOptions);
    if (!claudeEnabledForCurrentUser()) return gemini;

    const wantsJson = params?.generationConfig?.responseMimeType === "application/json";
    const isPro = params?.model === MODEL_PRO;
    const proxy: any = Object.create(gemini);
    proxy.generateContent = async (input: any) => {
        const content = inputToContent(input);
        const chars = content.reduce((n: number, b: any) => n + (b.text?.length || 0), 0);
        const model = isPro && chars <= 120_000 ? CLAUDE_SONNET : CLAUDE_HAIKU;
        if (wantsJson) content.push({ type: "text", text: "Responde ÚNICAMENTE con JSON válido, sin texto antes ni después y sin bloques de código." });
        const system = CLAUDE_FICTION_SYSTEM + (sysText(params?.systemInstruction) ? "\n\n" + sysText(params.systemInstruction) : "");
        const r = await callClaude({
            model,
            system: [{ text: system, cache: system.length > 1800 }],
            content,
            maxTokens: Math.max(params?.generationConfig?.maxOutputTokens ?? 8192, 1024),
            temperature: params?.generationConfig?.temperature,
            label,
        });
        if (r.ok && r.text) {
            let text = r.text;
            if (wantsJson) text = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
            return {
                response: {
                    text: () => text,
                    functionCalls: () => undefined,
                    candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }],
                    promptFeedback: undefined,
                    usageMetadata: undefined,
                },
            };
        }
        logger.warn(`↩️ [${label}] Claude no respondió; usando Gemini.`);
        return gemini.generateContent(input);
    };
    return proxy;
}
