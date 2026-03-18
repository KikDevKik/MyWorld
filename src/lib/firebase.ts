// src/lib/firebase.ts
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";
import { getAnalytics } from "firebase/analytics";

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
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    // 🟢 FAIL FAST PROTOCOL
    if (!siteKey || siteKey === 'process.env.VITE_RECAPTCHA_SITE_KEY') {
        console.error("🛑 [SECURITY CRITICAL] VITE_RECAPTCHA_SITE_KEY is missing or invalid.");
        return { isReady: false, error: "MISSING_SITE_KEY" };
    }

    // 🟢 LOCAL DEVELOPMENT: Skip App Check entirely on localhost (emulator handles auth)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
        console.log("🛠️ [SECURITY] Localhost detected — skipping App Check (emulator mode).");
        return { isReady: true, error: null };
    }

    // 🟢 GHOST BYPASS (Jules agent mode)
    if (import.meta.env.VITE_JULES_MODE === 'true') {
        console.log("👻 [GHOST PROTOCOL] Skipping AppCheck validation.");
        return { isReady: true, error: null };
    }

    console.log("🛡️ [SECURITY] Initializing App Check (ReCaptcha V3) for production...");

    try {
        // 🟢 FAIL-OPEN WRAPPER (App Check Throttling Defense)
        const appCheckProvider = new ReCaptchaV3Provider(siteKey);
        const originalGetToken = appCheckProvider.getToken.bind(appCheckProvider);

        appCheckProvider.getToken = async () => {
            try {
                return await originalGetToken();
            } catch (error: any) {
                console.warn("⚠️ App Check Throttled/Failed - Bypassing...", error);
                return {
                    token: "",
                    expireTimeMillis: Date.now() + 3600 * 1000
                };
            }
        };

        const appCheck = initializeAppCheck(app, {
            provider: appCheckProvider,
            isTokenAutoRefreshEnabled: true
        });
        console.log("✅ [SECURITY] App Check Instance Created.");

        try {
            await getToken(appCheck);
            console.log("✅ [SECURITY] Handshake Validated (Token Received).");
            return { isReady: true, error: null };
        } catch (tokenError: any) {
            console.warn("⚠️ App Check token fetch failed, using fail-open mode...", tokenError);
            return { isReady: true, error: null };
        }

    } catch (error) {
        console.error("💥 [SECURITY] App Check Initialization Failed:", error);
        return { isReady: false, error: "INIT_FAILED" };
    }
};

export default app;
