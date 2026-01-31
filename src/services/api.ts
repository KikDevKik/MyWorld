import { getFunctions, httpsCallable as firebaseHttpsCallable, HttpsCallableOptions } from 'firebase/functions';
import { toast } from 'sonner';

/**
 * Wrapper for Firebase Cloud Functions that injects custom BYOK keys.
 * Implements the "Injection Protocol" for secure key transport.
 */
export const callFunction = async <T>(name: string, data: any = {}, options?: HttpsCallableOptions): Promise<T> => {
    const functions = getFunctions();
    const customKey = localStorage.getItem('myworld_custom_gemini_key');

    // Inyección: Si existe la llave, la enviamos en el cuerpo con la bandera _authOverride
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
        // Re-lanzamos el error para que el componente maneje su estado local (loading, etc)
        throw error;
    }
}
