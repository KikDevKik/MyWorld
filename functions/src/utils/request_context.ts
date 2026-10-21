// Oct 2026: contexto por petición (uid) disponible en cualquier parte del código
// sin tener que pasarlo por cada función. Lo usa el enrutador de IA para decidir
// qué usuarios pueden usar Claude (lo paga MyWorld) y para registrar su gasto.
import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext { uid?: string; claudeQuality?: 'calidad' | 'economico'; }

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestUid(): string | undefined {
    return requestContext.getStore()?.uid;
}

export function getClaudeQuality(): 'calidad' | 'economico' {
    return requestContext.getStore()?.claudeQuality === 'economico' ? 'economico' : 'calidad';
}
