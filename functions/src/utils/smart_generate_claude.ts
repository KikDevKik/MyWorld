import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { LITERARY_FICTION_PROTOCOL } from "../ai_config";

// ─────────────────────────────────────────────────────────────────────────────
// CATÁLOGO DE MODELOS CLAUDE
// inputCost / outputCost: USD por millón de tokens (solo referencia para UI)
// ─────────────────────────────────────────────────────────────────────────────
export const CLAUDE_MODELS = {
    cheap: {
        id:          'claude-haiku-4-5-20251001',
        label:       'Haiku 4.5',
        inputCost:   1,
        outputCost:  5,
        description: 'Uso diario económico — respuestas rápidas y baratas',
        usageHint:   '~$0.01–0.02 por sesión',
    },
    balanced: {
        id:          'claude-sonnet-5',
        label:       'Sonnet 5',
        inputCost:   2,
        outputCost:  10,
        description: 'Recomendado — balance ideal entre calidad y coste',
        usageHint:   '~$0.02–0.05 por sesión',
    },
    premium: {
        id:          'claude-opus-5',
        label:       'Opus 5',
        inputCost:   5,
        outputCost:  25,
        description: 'Sesiones complejas y razonamiento profundo',
        usageHint:   '~$0.05–0.15 por sesión',
    },
    maximum: {
        id:          'claude-fable-5-1',
        label:       'Fable 5.1',
        inputCost:   10,
        outputCost:  50,
        description: 'Casos extremos — máxima capacidad disponible',
        usageHint:   '~$0.10–0.30 por sesión',
    },
} as const;

export type ClaudeReasoningLevel = keyof typeof CLAUDE_MODELS;

// ─────────────────────────────────────────────────────────────────────────────
// SHAPE DE RESULTADO — idéntico a SmartGenerateResult de smart_generate.ts
// para ser intercambiable sin modificar el código consumidor
// ─────────────────────────────────────────────────────────────────────────────
export interface SmartGenerateClaudeResult {
    text: string;
    modelUsed: string;
    error?: string;
    isQuotaExhausted?: boolean;
}

interface SmartGenerateClaudeOptions {
    reasoningLevel?:  ClaudeReasoningLevel;
    thinkingBudget?:  number;    // tokens de extended thinking (0 = desactivado)
    temperature?:     number;
    maxTokens?:       number;
    contextLabel?:    string;
}

/**
 * Wrapper de generación con Anthropic Claude.
 *
 * - reasoningLevel mapea al modelo (cheap → haiku, balanced → sonnet-5, etc.)
 * - thinkingBudget > 0 activa el extended thinking del SDK de Anthropic.
 *   NOTA: Anthropic requiere temperature = 1 cuando extended thinking está activo.
 * - El shape de retorno es idéntico a SmartGenerateResult de Gemini para
 *   ser intercambiable sin tocar el código que lo consume.
 *
 * @param apiKey  - Clave de la API de Anthropic (desde el secret ANTHROPIC_API_KEY)
 * @param prompt  - Texto del prompt del usuario
 * @param options - Opciones de nivel de razonamiento, thinking budget, etc.
 */
export async function smartGenerateContentClaude(
    apiKey: string,
    prompt: string,
    options: SmartGenerateClaudeOptions = {}
): Promise<SmartGenerateClaudeResult> {
    const reasoningLevel  = options.reasoningLevel  ?? 'balanced';
    const thinkingBudget  = options.thinkingBudget  ?? 0;
    const label           = options.contextLabel    ?? 'SmartGenerateClaude';
    const modelEntry      = CLAUDE_MODELS[reasoningLevel];
    const modelId         = modelEntry.id;

    // Si hay extended thinking activo, la temperatura DEBE ser 1 (requisito de Anthropic)
    const extendedThinkingActive = thinkingBudget > 0;
    const temperature = extendedThinkingActive ? 1 : (options.temperature ?? 0.7);

    // maxTokens debe ser > thinkingBudget; usamos el mayor entre el mínimo necesario y la opción del caller
    const baseMaxTokens = extendedThinkingActive ? Math.max(thinkingBudget + 4096, 16000) : 4096;
    const maxTokens = options.maxTokens ?? baseMaxTokens;

    logger.info(
        `🤖 [${label}] Claude ${modelEntry.label} | ` +
        `reasoningLevel: ${reasoningLevel} | ` +
        `extended_thinking: ${extendedThinkingActive} (budget: ${thinkingBudget})`
    );

    // Anteponer el protocolo de ficción literaria (mismo patrón que Gemini)
    const safePrompt = `${LITERARY_FICTION_PROTOCOL}\n\n${prompt}`;

    const client = new Anthropic({ apiKey });

    try {
        let responseText = '';

        if (extendedThinkingActive) {
            // ── MODO EXTENDED THINKING ───────────────────────────────────────
            // El SDK de Anthropic expone el parámetro como `thinking: { type: 'enabled', budget_tokens: N }`
            // dentro del objeto de la llamada a messages.create().
            // temperature debe ser exactamente 1 (forzado arriba).
            const response = await client.messages.create({
                model:       modelId,
                max_tokens:  maxTokens,
                temperature: 1,
                thinking: {
                    type:         'enabled',
                    budget_tokens: thinkingBudget,
                },
                messages: [{ role: 'user', content: safePrompt }],
            } as any);  // `as any` necesario porque el tipo `thinking` puede no estar tipado en todas las versiones del SDK

            // Extraer solo los bloques de tipo 'text'; los bloques 'thinking' son internos
            for (const block of response.content) {
                if (block.type === 'text') {
                    responseText += block.text;
                }
            }
        } else {
            // ── MODO NORMAL ──────────────────────────────────────────────────
            const response = await client.messages.create({
                model:       modelId,
                max_tokens:  maxTokens,
                temperature,
                messages: [{ role: 'user', content: safePrompt }],
            });

            for (const block of response.content) {
                if (block.type === 'text') {
                    responseText += block.text;
                }
            }
        }

        logger.info(`✅ [${label}] Claude generation successful (${modelId})`);

        return { text: responseText, modelUsed: modelId };

    } catch (e: any) {
        logger.error(`❌ [${label}] Error generating with Claude model ${modelId}:`, e);

        // Detección de cuota / rate limit de Anthropic
        const isQuota =
            e?.status === 429 ||
            e?.message?.includes('rate_limit')  ||
            e?.message?.includes('overloaded')  ||
            e?.message?.toLowerCase().includes('quota') ||
            e?.message?.includes('Too Many Requests');

        if (isQuota) {
            logger.warn(`⚠️ [${label}] Anthropic API rate limit hit for model ${modelId}`);
            return { text: '', modelUsed: modelId, error: 'RESOURCE_EXHAUSTED', isQuotaExhausted: true };
        }

        // Reintento con el modelo más ligero si el modelo objetivo no era ya el más barato
        if (reasoningLevel !== 'cheap') {
            const fallbackId = CLAUDE_MODELS.cheap.id;
            logger.info(`🔄 [${label}] Attempting fallback to ${fallbackId}`);
            try {
                const fallbackResponse = await client.messages.create({
                    model:       fallbackId,
                    max_tokens:  4096,
                    temperature: options.temperature ?? 0.7,
                    messages:    [{ role: 'user', content: safePrompt }],
                });

                let fallbackText = '';
                for (const block of fallbackResponse.content) {
                    if (block.type === 'text') fallbackText += block.text;
                }

                logger.info(`✅ [${label}] Claude fallback (${fallbackId}) successful`);
                return { text: fallbackText, modelUsed: fallbackId };

            } catch (fallbackErr: any) {
                logger.error(`❌ [${label}] Fallback Claude model also failed:`, fallbackErr);
            }
        }

        return { text: '', modelUsed: modelId, error: e?.message || 'Claude generation failed' };
    }
}
