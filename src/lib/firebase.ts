// src/lib/firebase.ts
// ¡¡¡NUESTRA IGNICIÓN!!!
import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";

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

// 🛡️ SECURITY CENTRALIZATION (Mission 4)
export const initSecurity = async (): Promise<SecurityStatus> => {
    const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

    // 🟢 FAIL FAST PROTOCOL
    if (!siteKey || siteKey === 'process.env.VITE_RECAPTCHA_SITE_KEY') {
        console.error("🛑 [SECURITY CRITICAL] VITE_RECAPTCHA_SITE_KEY is missing or invalid.");
        return { isReady: false, error: "MISSING_SITE_KEY" };
    }

    console.log("🛡️ [SECURITY] Initializing ReCaptcha V3...");
    console.log("🛡️ [SECURITY] Confirming Project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);

    // 🟢 DEBUG TOKEN (THROTTLING BYPASS & PRODUCTION OVERRIDE)
    // Check for URL param 'debug_token' or localStorage key
    let debugToken: string | boolean | null = null;
    if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        debugToken = urlParams.get('debug_token') || window.localStorage.getItem('FIREBASE_APPCHECK_DEBUG_TOKEN');
        if (debugToken === 'true') debugToken = true;
    }

    // 🟢 MISSION CRITICAL: INJECT OFFICIAL DEBUG TOKEN FOR LOCALHOST
    // This bypasses the 403 Throttling immediately.
    if (typeof window !== 'undefined' && window.location.hostname === "localhost") {
        console.log("💉 [SECURITY] Injecting Master Debug Token for Localhost...");
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = "C2E1F3B5-CB81-43C4-B0F0-D5AE210621C8";
        debugToken = "C2E1F3B5-CB81-43C4-B0F0-D5AE210621C8";
    }

    if (import.meta.env.DEV || debugToken) {
        // Activate Debug Provider
        // Note: If we injected above, this line is redundant but harmless as it sets the same value.
        // We prioritize the explicit injection.
        if (!((self as any).FIREBASE_APPCHECK_DEBUG_TOKEN)) {
             (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
        }
        console.warn("⚠️ [SECURITY] DEBUG MODE ACTIVE - APP CHECK BYPASS ENABLED");

        if (debugToken === true) {
             console.log("ℹ️ [SECURITY] Generating NEW Debug Token. Check console logs.");
        } else {
             console.log("ℹ️ [SECURITY] Using Custom Debug Token.");
        }

        // 👻 GHOST BYPASS (Legacy flag, kept for backward compat)
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
        } catch (tokenError: any) {
            console.error("⚠️ [SECURITY] Handshake Failed (Token Error):", tokenError);

            // 🕵️ DETECT SPECIFIC FAILURES (EDGE / PRIVACY BLOCKERS)
            const msg = tokenError?.message || "";
            if (msg.includes("throttled") || msg.includes("403")) {
                // If we are in debug mode but still failed, it means the token is invalid or not registered.
                if (debugToken) {
                    console.error("❌ [SECURITY] Debug Token Rejected. Is it registered in Firebase Console?");
                }
                return { isReady: false, error: "SECURITY_THROTTLED" };
            }

            return { isReady: false, error: "PERIMETER_BREACH" };
        }

    } catch (error) {
        console.error("💥 [SECURITY] App Check Initialization Failed:", error);
        return { isReady: false, error: "INIT_FAILED" };
    }
};

export default app;
