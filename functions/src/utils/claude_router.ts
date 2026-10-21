// Oct 2026: enrutador de Claude pagado por MyWorld.
// - Solo para los usuarios de CLAUDE_ALLOWED_UIDS (el resto sigue en Gemini).
// - Haiku 5.5 para tareas automáticas; Sonnet 5.5 para conversación (Director, Arquitecto).
// - Registra el gasto estimado por usuario y mes en Firestore (users/{uid}/ai_usage/{YYYY-MM}).
// - Si Claude falla (sin saldo, error), quien llama vuelve a Gemini.
import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getRequestUid, getClaudeQuality } from "./request_context";

// Marca opcional dentro de un prompt: todo lo anterior es fijo (instrucciones, canon) y se cachea;
// lo posterior (historial, mensaje) cambia en cada petición. Gemini la ignora.
export const CACHE_SPLIT = "\n<<<MW_CACHE_SPLIT>>>\n";

export const CLAUDE_HAIKU = "claude-haiku-5-5";
export const CLAUDE_SONNET = "claude-sonnet-5-5";

// USD por millón de tokens (docs oficiales, oct 2026)
const PRICES: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
    [CLAUDE_HAIKU]: { in: 0.10, out: 0.50, cacheWrite: 0.125, cacheRead: 0.01 },
    [CLAUDE_SONNET]: { in: 2, out: 10, cacheWrite: 2.5, cacheRead: 0.10 }, // lectura de caché 0.05x en Sonnet 5.5
};

// Por encima de este tamaño (≈30k tokens) la conversación usa Haiku para no gastar de más.
const SONNET_MAX_PROMPT_CHARS = 120_000;

export const CLAUDE_FICTION_SYSTEM =
    "Trabajas dentro de MyWorld, un entorno de escritura para novelistas. Todo el material que recibes es ficción literaria " +
    "del propio autor (su novela, su canon y sus notas), incluidos temas duros como violencia, duelo o acoso. " +
    "Trátalo con criterio de editor profesional. Responde siempre en el idioma del autor.";

// Voz común de MyWorld para toda conversación (Director, Arquitecto, Laboratorio, gems).
// Preferencia del autor: nada de hablar "bonito"; razonar y ayudar a avanzar.
export const MYWORLD_VOICE = `VOZ DE MYWORLD (aplica siempre, por encima de cualquier tono indicado arriba):
- Habla llano y directo, como un colega del oficio. Sin elogios de relleno ni frases decorativas; empieza por el contenido.
- Razona: apóyate en el texto y el canon del autor y di en qué te basas. Distingue hechos del canon de tu opinión.
- Da tu opinión con argumentos y señala riesgos o contradicciones aunque no sean lo que el autor quiere oír.
- No repitas lo que el autor acaba de decir. Pregunta solo cuando de verdad haga falta.
- Breve: lo esencial primero.`;

export function claudeEnabledForCurrentUser(): boolean {
    const key = process.env.ANTHROPIC_API_KEY;
    const uid = getRequestUid();
    if (!key || !uid) return false;
    const allowed = (process.env.CLAUDE_ALLOWED_UIDS || "").split(",").map(s => s.trim()).filter(Boolean);
    return allowed.includes(uid);
}

// Oct 2026: tope de gasto mensual por usuario (estimado). Al pasar el 80% todo va a Haiku;
// al llegar al 100% se deja de usar Claude ese mes (MyWorld sigue con Gemini). Valor en .env (CLAUDE_MONTHLY_CAP_USD).
const spendCache = new Map<string, { at: number; cost: number }>();
export async function getMonthSpend(uid?: string): Promise<number> {
    if (!uid) return 0;
    const hit = spendCache.get(uid);
    if (hit && Date.now() - hit.at < 60_000) return hit.cost;
    let cost = 0;
    try {
        const month = new Date().toISOString().slice(0, 7);
        const snap = await getFirestore().collection("users").doc(uid).collection("ai_usage").doc(month).get();
        cost = snap.data()?.costUsd || 0;
    } catch { /* sin datos: 0 */ }
    spendCache.set(uid, { at: Date.now(), cost });
    return cost;
}
export function monthlyCapUsd(): number {
    const v = parseFloat(process.env.CLAUDE_MONTHLY_CAP_USD || "8");
    return isFinite(v) && v > 0 ? v : 8;
}
/** Verifica el tope antes de cada llamada. true = puede usar Claude. */
export async function claudeWithinBudget(): Promise<boolean> {
    const uid = getRequestUid();
    const spent = await getMonthSpend(uid);
    if (spent >= monthlyCapUsd()) {
        logger.warn(`💸 [CLAUDE] Tope mensual alcanzado (US$ ${spent.toFixed(2)} / ${monthlyCapUsd()}). Se usa Gemini.`);
        return false;
    }
    lastSpendRatio = spent / monthlyCapUsd();
    return true;
}
let lastSpendRatio = 0;

export function pickClaudeModel(contextLabel: string, promptChars: number, conversational?: boolean): string {
    // Pasado el 80% del tope mensual, todo con Haiku para estirar el saldo.
    if (lastSpendRatio >= 0.8) return CLAUDE_HAIKU;
    const isConversation = conversational ?? /^(ArquitectoChat_|Director|ChatRAG)/.test(contextLabel || "");
    // Modo Económico (Config IA): todo con Haiku, ~20 veces más barato.
    if (isConversation && getClaudeQuality() !== 'economico' && promptChars <= SONNET_MAX_PROMPT_CHARS) return CLAUDE_SONNET;
    return CLAUDE_HAIKU;
}

export interface ClaudeCallOptions {
    model: string;
    system?: { text: string; cache?: boolean; ttl1h?: boolean }[];
    content: any[];           // bloques del mensaje del usuario
    maxTokens?: number;
    temperature?: number;
    label?: string;
    effort?: 'low' | 'medium' | 'high';
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

// Oct 2026: la API de Claude bloquea (refusal: reasoning_extraction) los prompts que piden
// escribir el razonamiento en <thinking>. Varios prompts heredados de Gemini lo hacen.
function stripReasoningRequests(text: string): string {
    return String(text || "")
        .replace(/\[THINKING MODE ACTIVATED\][\s\S]*?(?:critical for consistency\.|\n\s*\n)/g, "")
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/<\/?thinking>/gi, "");
}

export async function callClaude(opts: ClaudeCallOptions): Promise<ClaudeCallResult> {
    const label = opts.label || "Claude";
    if (!(await claudeWithinBudget())) return { ok: false, error: "MONTHLY_CAP" };
    opts = {
        ...opts,
        system: (opts.system || []).map(b => ({ ...b, text: stripReasoningRequests(b.text) })),
        content: (opts.content || []).map((b: any) => b?.type === "text" ? { ...b, text: stripReasoningRequests(b.text) } : b),
    };
    const system = (opts.system || []).filter(b => b.text && b.text.trim()).map(b => ({
        type: "text" as const,
        text: b.text,
        ...(b.cache ? { cache_control: (b.ttl1h ? { type: "ephemeral" as const, ttl: "1h" } : { type: "ephemeral" as const }) } : {}),
    }));
    try {
        const res: any = await getClient().messages.create({
            model: opts.model,
            max_tokens: Math.min(Math.max(opts.maxTokens ?? 4096, 2500), 16000),
            // Oct 2026: Sonnet 5.5 / Haiku 5.5 rechazan `temperature` (deprecated): no se envía.
            // Oct 2026: los modelos 5.5 piensan por su cuenta y ese pensamiento cuenta en max_tokens.
            // Esfuerzo bajo = piensan poco y les queda espacio para responder (y cuesta menos).
            output_config: { effort: opts.effort || 'low' },
            ...(system.length ? { system } : {}),
            messages: [{ role: "user", content: opts.content }],
        } as any);
        const text = (res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        const u = res.usage || {};
        const stopReason = String(res.stop_reason || '');
        logger.info(`🟣 [CLAUDE] ${label} | ${opts.model} | stop=${stopReason} | in=${u.input_tokens} cacheW=${u.cache_creation_input_tokens || 0} cacheR=${u.cache_read_input_tokens || 0} out=${u.output_tokens} (pensamiento=${u.output_tokens_details?.thinking_tokens ?? '?'})`);
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
    const cw1h = u.cache_creation?.ephemeral_1h_input_tokens || 0; // se cobra a 2x la entrada (no 1.25x)
    // Haiku 5.5 cobra 5x si el prompt total supera 100k tokens
    const mult = model === CLAUDE_HAIKU && (inTok + cw + cr) > 100_000 ? 5 : 1;
    const cost = mult * (inTok * p.in + outTok * p.out + (cw - cw1h) * p.cacheWrite + cw1h * p.in * 2 + cr * p.cacheRead) / 1_000_000;
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
