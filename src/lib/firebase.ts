// src/lib/firebase.ts
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";

// ¡¡¡TU "TESORO" VA AQUÍ!!!
// (Ahora cargado desde variables de entorno para seguridad)
export const fallbackConfig = {
    // 🛡️ SENTINEL: API KEY REMOVED (See .env.example)
    authDomain: "myword-67b03.firebaseapp.com",
    projectId: "myword-67b03",
    storageBucket: "myword-67b03.firebasestorage.app",
    messagingSenderId: "479346922706",
    appId: "1:479346922706:web:af7d76f5f6f707d75f090b",
    measurementId: "G-3PEQ1BGFZF",
    siteKey: "6LeBFk0sAAAAAGHkzwAi71U7RLIjJazekWzjUEdL"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || fallbackConfig.appId,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || fallbackConfig.measurementId
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

// 🛡️ SECURITY CENTRALIZATION (Mission 4)
export const initSecurity = async (): Promise<SecurityStatus> => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || fallbackConfig.siteKey;

    // 🟢 FAIL FAST PROTOCOL
    if (!siteKey || siteKey === 'process.env.VITE_RECAPTCHA_SITE_KEY') {
        console.error("🛑 [SECURITY CRITICAL] VITE_RECAPTCHA_SITE_KEY is missing or invalid.");
        return { isReady: false, error: "MISSING_SITE_KEY" };
    }

    console.log("🛡️ [SECURITY] Initializing ReCaptcha V3...");
    console.log("🛡️ [SECURITY] Confirming Project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);

    // 🟢 DEBUG TOKEN (THROTTLING BYPASS)
    if (import.meta.env.DEV) {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
        console.warn("⚠️ [SECURITY] DEBUG MODE ACTIVE - DO NOT LEAVE IN PRODUCTION");

        // 👻 GHOST BYPASS
        if (import.meta.env.VITE_JULES_MODE === 'true') {
             console.log("👻 [GHOST PROTOCOL] Skipping AppCheck validation.");
             return { isReady: true, error: null };
        }
    }

    try {
        // Initialize App Check with ReCAPTCHA V3
        const appCheck = initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(siteKey),
            isTokenAutoRefreshEnabled: true
        });
        console.log("✅ [SECURITY] App Check Instance Created.");

        // 🟢 CIRCUIT BREAKER: Force Token Fetch to Confirm Readiness
        try {
            await getToken(appCheck);
            console.log("✅ [SECURITY] Handshake Validated (Token Received).");
            return { isReady: true, error: null };
        } catch (tokenError) {
            console.error("⚠️ [SECURITY] Handshake Failed (Token Error):", tokenError);
            return { isReady: false, error: "PERIMETER_BREACH" };
        }

    } catch (error) {
        console.error("💥 [SECURITY] App Check Initialization Failed:", error);
        return { isReady: false, error: "INIT_FAILED" };
    }
};

export default app;
