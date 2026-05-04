import { getFunctions, httpsCallable as firebaseHttpsCallable, HttpsCallableOptions } from 'firebase/functions';
import { toast } from 'sonner';

// Limpiar keys residuales del sistema de cuota anterior
try { localStorage.removeItem('myworld_quota_today'); } catch { /* ignore */ }

export class QuotaExceededError extends Error {
    constructor() {
        super('QUOTA_EXCEEDED');
        this.name = 'QuotaExceededError';
    }
}

export function getQuotaMessage(): string {
    const lang = localStorage.getItem('myworld_language_preference') || 'es';
    const messages: Record<string, string> = {
        es: `⚠️ **Tu API key de Gemini ha alcanzado su límite por ahora.**\n\nGoogle AI Studio restablece las cuotas automáticamente. Puedes continuar escribiendo en el editor mientras tanto.\n\n[→ Revisar cuota en AI Studio](https://aistudio.google.com)`,
        en: `⚠️ **Your Gemini API key has reached its limit for now.**\n\nGoogle AI Studio resets quotas automatically. You can keep writing in the editor in the meantime.\n\n[→ Check quota on AI Studio](https://aistudio.google.com)`,
        ja: `⚠️ **Gemini APIキーの上限に達しました。**\n\nGoogle AI Studioはクォータを自動的にリセットします。それまでの間、エディターで書き続けることができます。\n\n[→ AI Studioでクォータを確認](https://aistudio.google.com)`,
        ko: `⚠️ **Gemini API 키가 한도에 도달했습니다.**\n\nGoogle AI Studio는 할당량을 자동으로 재설정합니다. 그 동안 편집기에서 계속 쓸 수 있습니다.\n\n[→ AI Studio에서 할당량 확인](https://aistudio.google.com)`,
        zh: `⚠️ **您的 Gemini API 密钥已达到限制。**\n\nGoogle AI Studio 会自动重置配额。与此同时，您可以继续在编辑器中写作。\n\n[→ 在 AI Studio 查看配额](https://aistudio.google.com)`,
    };
    return messages[lang] ?? messages.es;
}

/**
 * Wrapper for Firebase Cloud Functions that injects custom BYOK keys.
 * Implements the "Injection Protocol" for secure key transport.
 */
export const callFunction = async <T>(name: string, data: any = {}, options?: HttpsCallableOptions): Promise<T | null> => {
    const functions = getFunctions();

    // Emulador desactivado — usar funciones en producción
    // if (import.meta.env.DEV && window.location.hostname === 'localhost') {
    //     try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch (e) { }
    // }

    // BYOK: Only inject the user's personal key if they explicitly provided one.
    // The server uses its own Gemini key from Firebase Secret Manager.
    // NEVER inject VITE_GOOGLE_API_KEY here — that would expose the server key from the client bundle.
    const customKey = sessionStorage.getItem('myworld_custom_gemini_key') || localStorage.getItem('myworld_custom_gemini_key');
    const tierMode = localStorage.getItem('myworld_tier_mode');
    const tier: 'normal' | 'ultra' = tierMode === 'ultra' ? 'ultra' : 'normal';
    const currentLang = localStorage.getItem('myworld_language_preference') || 'es';
    const payload = customKey
        ? { ...data, _authOverride: customKey, _userTier: tier, _lang: currentLang }
        : { ...data, _userTier: tier, _lang: currentLang };

    const fn = firebaseHttpsCallable(functions, name, options);

    try {
        const result = await fn(payload);
        return result.data as T;
    } catch (error: any) {
        // Cuota agotada (429 / RESOURCE_EXHAUSTED)
        const isQuotaError =
            error?.message?.includes('429') ||
            error?.message?.includes('RESOURCE_EXHAUSTED') ||
            error?.message?.toLowerCase().includes('quota') ||
            error?.code === 'resource-exhausted';

        if (isQuotaError) {
            throw new QuotaExceededError();
        }

        // Manejo de Errores (Safety Net)
        // Detectamos el código específico INVALID_CUSTOM_KEY que envía el backend
        if (error.message && (error.message.includes('INVALID_CUSTOM_KEY') || error.message.includes('API key not valid'))) {
            toast.error("Tu llave personal no funciona. Revisa en Ajustes o bórrala para usar la del sistema.", {
                duration: 10000,
                action: {
                    label: 'Ajustes',
                    onClick: () => {
                        // Dispatch custom event to open settings if possible, or just let user know
                        window.dispatchEvent(new CustomEvent('OPEN_SETTINGS_MODAL'));
                    }
                }
            });
        }

        // Nuevo manejo de errores de red (CORS/Network Error)
        // Si es un error de red o fetch fallido, retornamos null para evitar crash
        if (error.code === 'unavailable' || error.message?.includes('network') || error.message?.includes('Failed to fetch')) {
            console.error("🚨 Error de Red Crítico en callFunction:", {
                functionName: name,
                details: error.message,
                code: error.code
            });
            // Retornamos null para que la UI pueda manejarlo (mostrando un estado de error o reintentar)
            return null;
        }

        // Para otros errores (lógica de negocio), seguimos re-lanzando para manejo específico si es necesario
        // O retornamos null si queremos ser consistentes.
        // Siguiendo instrucciones explícitas: "Si el bloque catch atrapa un error de red ... retorne null explícitamente"
        // Pero el usuario también dijo "ERR_FAILED o error de Firebase".
        // Vamos a ser más agresivos en el catch y retornar null para errores operativos, pero mantener el re-throw para errores de lógica si es necesario?
        // El usuario dijo: "Si el bloque catch atrapa un error de red ... retorne null explícitamente".
        // Asumiré que para errores de lógica del backend (que lanzan HttpsError) todavía queremos que el caller lo sepa,
        // pero para errores de *conexión* (que es el contexto del problema CORS), retornamos null.

        console.error(`❌ Error en Cloud Function [${name}]:`, error);

        // En lugar de tragar el error y retornar null (lo que causa falsos positivos), lanzamos el error
        // a menos que sea un error crítico de red que debe manejarse en silencio (rare case).
        throw error;
    }
}
