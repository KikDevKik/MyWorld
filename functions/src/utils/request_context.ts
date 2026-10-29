// Oct 2026: contexto por petición (uid) disponible en cualquier parte del código
// sin tener que pasarlo por cada función. Lo usa el enrutador de IA para decidir
// qué usuarios pueden usar Claude (lo paga MyWorld) y para registrar su gasto.
import { AsyncLocalStorage } from "async_hooks";

// aiLevel (Config IA, oct 2026): 'gratis' = clave gratis de Gemini; 'propia' = clave de pago del autor
// (Gemini con facturación y/o Anthropic); 'myworld' = Claude incluido, lo paga MyWorld.
export type AiLevel = 'gratis' | 'propia' | 'myworld';
export interface RequestContext { uid?: string; claudeQuality?: 'calidad' | 'economico'; aiLevel?: AiLevel; anthropicKey?: string; }

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestUid(): string | undefined {
    return requestContext.getStore()?.uid;
}

export function getAiLevel(): AiLevel | undefined {
    return requestContext.getStore()?.aiLevel;
}

/** Clave de Anthropic del propio autor (solo en el nivel «propia»). */
export function getUserAnthropicKey(): string | undefined {
    const s = requestContext.getStore();
    return s?.aiLevel === 'propia' && s.anthropicKey ? s.anthropicKey : undefined;
}

export function getClaudeQuality(): 'calidad' | 'economico' {
    return requestContext.getStore()?.claudeQuality === 'economico' ? 'economico' : 'calidad';
}
