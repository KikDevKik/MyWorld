// Nov 2026: YA NO SE USA. La importación pasó al selector de archivos de Google (utils/drivePicker.ts),
// que no necesita el permiso restringido drive.readonly. Se deja por si hay que volver atrás.
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const IMPORT_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/**
 * Solicita scope drive.readonly de forma incremental.
 * Solo muestra el consentimiento si el usuario no lo ha concedido aún.
 * Retorna el accessToken con el scope adicional.
 */
export async function requestImportScope(): Promise<string> {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    
    // Solicitar SOLO el scope adicional — Google hace el merge con los existentes
    provider.addScope(IMPORT_SCOPE);
    
    // Nov 2026: sin forzar la pantalla de permisos; Google solo la muestra si todavía no lo concediste.
    provider.setCustomParameters({ include_granted_scopes: 'true' });
    
    try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        
        if (!credential?.accessToken) {
            throw new Error('No se pudo obtener el token de importación');
        }
        
        // Guardar en sessionStorage — solo dura esta sesión
        sessionStorage.setItem('import_access_token', credential.accessToken);
        
        return credential.accessToken;
    } catch (error) {
        console.error('[ImportAuth] Error al solicitar scope:', error);
        throw error;
    }
}

export function getImportToken(): string | null {
    return sessionStorage.getItem('import_access_token');
}

export function clearImportToken(): void {
    sessionStorage.removeItem('import_access_token');
}