// Oct 2026: los 3 niveles de IA de MyWorld (Ajustes → Config IA).
//  - gratis:  tu clave gratis de Gemini. Gratis, pero Google puede usar lo que envías para mejorar sus modelos.
//  - propia:  tu clave de pago (Gemini con facturación y/o Claude de Anthropic). Pagas tú, directo al proveedor;
//             en las APIs de pago tu escritura no se usa para entrenar.
//  - myworld: Claude incluido, lo paga MyWorld (cuentas habilitadas; para todos, con suscripción, más adelante).
export type AiLevel = 'gratis' | 'propia' | 'myworld';
export const AI_LEVEL_KEY = 'myworld_ai_level';
export const GEMINI_PAID_KEY = 'myworld_gemini_paid';

export function getAiLevel(): AiLevel | null {
    try {
        const v = localStorage.getItem(AI_LEVEL_KEY);
        return v === 'gratis' || v === 'propia' || v === 'myworld' ? v : null;
    } catch { return null; }
}
export function setAiLevelStored(level: AiLevel) {
    try {
        localStorage.setItem(AI_LEVEL_KEY, level);
        // Compatibilidad: el resto de la app lee el modo Normal/Ultra (modelos de Gemini).
        localStorage.setItem('myworld_tier_mode', level === 'propia' && getGeminiPaid() ? 'ultra' : 'normal');
    } catch { /* sin almacenamiento */ }
}
export function getGeminiPaid(): boolean {
    try { return localStorage.getItem(GEMINI_PAID_KEY) === '1'; } catch { return false; }
}
export function setGeminiPaidStored(v: boolean) {
    try {
        localStorage.setItem(GEMINI_PAID_KEY, v ? '1' : '0');
        if (getAiLevel() === 'propia') localStorage.setItem('myworld_tier_mode', v ? 'ultra' : 'normal');
    } catch { /* sin almacenamiento */ }
}
