// src/lib/firebase.ts
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp, getApp, getApps } from "firebase/app";
// firebase/app-check import removido — App Check bypassed hasta configurar dominio en reCAPTCHA Admin
import { getAnalytics } from "firebase/analytics";
import { initializeFirestore, CACHE_SIZE_UNLIMITED } from "firebase/firestore";

// ¡¡¡TU "TESORO" VA AQUÍ!!!
// (Ahora cargado desde variables de entorno para seguridad)
export const fallbackConfig = {
    // 🛡️ SENTINEL: API KEY REMOVED (See .env.example)
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    siteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY
};

const firebaseConfig = {
    apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID

};

// 🛡️ SENTINEL CHECK: Env Var Enforcement
if (!firebaseConfig.apiKey) {
    throw new Error("CRITICAL SECURITY: VITE_GOOGLE_API_KEY is missing in environment variables. See .env.example.");
}

// 🟢 TELEMETRÍA DE DIAGNÓSTICO (Protocolo Sutura V8.7)
console.log("[DEBUG] App Check attempt with ID:", firebaseConfig.appId);
console.log("[DEBUG] Firebase Project ID:", firebaseConfig.projectId);
// console.table(firebaseConfig); // Opcional para evitar ruido en consola

// ¡¡¡ARRANCAMOS EL COCHE!!!
// Singleton pattern to prevent re-initialization
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export interface SecurityStatus {
    isReady: boolean;
    error: string | null;
}

// 🛡️ SECURITY CENTRALIZATION
export const initSecurity = async (): Promise<SecurityStatus> => {
    // App Check está desactivado (enforceAppCheck: false en todas las Cloud Functions).
    // Habilitarlo causa error cascada en producción cuando el dominio no está autorizado
    // en reCAPTCHA Admin. Re-habilitar antes de Product Hunt configurando el dominio.
    console.log("🛡️ [SECURITY] App Check bypassed (enforceAppCheck: false en backend).");
    return { isReady: true, error: null };
};

// Inicializar Firestore explícitamente con la app.
// Esto registra el singleton — todos los getFirestore() posteriores
// devuelven esta misma instancia ya configurada.
export const db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
    cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

export default app;
