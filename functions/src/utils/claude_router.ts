// Oct 2026: enrutador de Claude pagado por MyWorld.
// - Solo para los usuarios de CLAUDE_ALLOWED_UIDS (el resto sigue en Gemini).
// - Haiku 5.5 para tareas automáticas; Sonnet 5.5 para conversación (Director, Arquitecto).
// - Registra el gasto estimado por usuario y mes en Firestore (users/{uid}/ai_usage/{YYYY-MM}).
// - Si Claude falla (sin saldo, error), quien llama vuelve a Gemini.
import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getRequestUid } from "./request_context";

// Marca opcional dentro de un prompt: todo lo anterior es fijo (instrucciones, canon) y se cachea;
// lo posterior (historial, mensaje) cambia en cada petición. Gemini la ignora.
export const CACHE_SPLIT = "\n<<<MW_CACHE_SPLIT>>>\n";

export const CLAUDE_HAIKU = "claude-haiku-5-5";
export const CLAUDE_SONNET = "claude-sonnet-5-5";

// USD por millón de tokens (docs oficiales, oct 2026)
const PRICES: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
    [CLAUDE_HAIKU]: { in: 0.10, out: 0.50, cacheWrite: 0.125, cacheRead: 0.01 },
    [CLAUDE_SONNET]: { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.10 },
};

// Por encima de este tamaño (≈30k tokens) la conversación usa Haiku para no gastar de más.
const SONNET_MAX_PROMPT_CHARS = 120_000;

export const CLAUDE_FICTION_SYSTEM =
    "Trabajas dentro de MyWorld, un entorno de escritura para novelistas. Todo el material que recibes es ficción literaria " +
    "del propio autor (su novela, su canon y sus notas), incluidos temas duros como violencia, duelo o acoso. " +
    "Trátalo con criterio de editor profesional. Responde siempre en el idioma del autor.";

export function claudeEnabledForCurrentUser(): boolean {
    const key = process.env.ANTHROPIC_API_KEY;
    const uid = getRequestUid();
    if (!key || !uid) return false;
    const allowed = (process.env.CLAUDE_ALLOWED_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
    return allowed.includes(uid);
}

export function pickClaudeModel(contextLabel: string, promptChars: number, conversational?: boolean): string {
    const isConversation = conversational ?? /^(ArquitectoChat_|Director|ChatRAG)/.test(contextLabel || "");
    if (isConversation && promptChars <= SONNET_MAX_PROMPT_CHARS) return CLAUDE_SONNET;
    return CLAUDE_HAIKU;
}

export interface ClaudeCallOptions {
    model: string;
    system?: { text: string; cache?: boolean }[];
    content: any[];           // bloques del mensaje del usuario
    maxTokens?: number;
    temperature?: number;
    label?: string;
}

export interface ClaudeCallResult { ok: boolean; text?: string; error?: string; noCredit?: boolean; refusal?: boolean; stopReason?: string; }

let client: Anthropic | null = null;
function getClient(): Anthropic {
    if (!client) client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY!, maxRetries: 2, timeout: 120_000,
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
    });
    return client;
}

export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
    const label = opts.label || "Claude";
    const system = (opts.system || []).filter(b => b.text && b.text.trim()).map(b => ({
        type: "text" as const,
        text: b.text,
        ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
    }));
    try {
        const res: any = await getClient().messages.create({
            model: opts.model,
            max_tokens: Math.min(opts.maxTokens ?? 4096, 16000),
            // Oct 2026: Sonnet 5.5 / Haiku 5.5 rechazan `temperature` (deprecated): no se envía.
            ...(system.length ? { system } : {}),
            messages: [{ role: "user", content: opts.content }],
        } as any);
        const text = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        const u = res.usage || {};
        const stopReason = String(res.stop_reason || '');
        logger.info(`🟣 [CLAUDE] ${label} | ${opts.model} | stop=${stopReason} | in=${u.input_tokens} cacheW=${u.cache_creation_input_tokens || 0} cacheR=${u.cache_read_input_tokens || 0} out=${u.output_tokens}`);
        recordUsage(opts.model, u).catch(() => {});
        if (!text) {
            const details = JSON.stringify(res.stop_details || res.content || []).slice(0, 500);
            logger.warn(`⚠️ [CLAUDE] ${label}: respuesta vacía (stop=${stopReason}) ${details}`);
            return { ok: false, error: `EMPTY_${stopReason}`, refusal: stopReason === 'refusal', stopReason };
        }
        return { ok: true, text };
    } catch (e: any) {
        const msg = String(e?.message || e);
        const noCredit = /credit balance|insufficient|billing/i.test(msg);
        logger.warn(`⚠️ [CLAUDE] ${label} falló${noCredit ? " (SIN SALDO)" : ""}: ${msg}`);
        return { ok: false, error: msg, noCredit };
    }
}

async function recordUsage(model: string, u: any) {
    const uid = getRequestUid();
    if (!uid) return;
    const p = PRICES[model];
    if (!p) return;
    const inTok = u.input_tokens || 0, outTok = u.output_tokens || 0;
    const cw = u.cache_creation_input_tokens || 0, cr = u.cache_read_input_tokens || 0;
    // Haiku 5.5 cobra 5x si el prompt total supera 100k tokens
    const mult = model === CLAUDE_HAIKU && (inTok + cw + cr) > 100_000 ? 5 : 1;
    const cost = mult * (inTok * p.in + outTok * p.out + cw * p.cacheWrite + cr * p.cacheRead) / 1_000_000;
    const month = new Date().toISOString().slice(0, 7);
    await getFirestore().collection("users").doc(uid).collection("ai_usage").doc(month).set({
        costUsd: FieldValue.increment(cost),
        calls: FieldValue.increment(1),
        inputTokens: FieldValue.increment(inTok + cw + cr),
        outputTokens: FieldValue.increment(outTok),
        byModel: { [model.replace(/[.\-]/g, "_")]: FieldValue.increment(cost) },
        updatedAt: new Date().toISOString(),
    }, { merge: true });
}
