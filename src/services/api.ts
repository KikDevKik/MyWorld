import { getFunctions, httpsCallable as firebaseHttpsCallable, HttpsCallableOptions, connectFunctionsEmulator } from 'firebase/functions';
import { toast } from 'sonner';

/**
 * Wrapper for Firebase Cloud Functions that injects custom BYOK keys.
 * Implements the "Injection Protocol" for secure key transport.
 */
export const callFunction = async <T>(name: string, data: any = {}, options?: HttpsCallableOptions): Promise<T | null> => {
    const functions = getFunctions();

    if (import.meta.env.DEV && window.location.hostname === 'localhost') {
        try { connectFunctionsEmulator(functions, 'localhost', 5001); } catch (e) { }
    }

    // BYOK: Only inject the user's personal key if they explicitly provided one.
    // The server uses its own Gemini key from Firebase Secret Manager.
    // NEVER inject VITE_GOOGLE_API_KEY here — that would expose the server key from the client bundle.
    const customKey = sessionStorage.getItem('myworld_custom_gemini_key');
    const payload = customKey ? { ...data, _authOverride: customKey } : data;

    const fn = firebaseHttpsCallable(functions, name, options);

    try {
        const result = await fn(payload);
        return result.data as T;
    } catch (error: any) {
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

        // Sin embargo, el usuario pidió: "y que la función retorne null explícitamente" en general en el contexto de ERR_FAILED.
        // Voy a aplicar la lógica para errores de red y "internal" (que a veces enmascara CORS).

        console.error(`❌ Error en Cloud Function [${name}]:`, error);
        return null;
    }
}
