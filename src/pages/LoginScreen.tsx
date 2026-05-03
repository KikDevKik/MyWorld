import React, { useState, useCallback } from 'react';
import { getAuth, signInWithCustomToken, User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Lock, AlertCircle } from 'lucide-react';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface LoginScreenProps {
    onLoginSuccess: (user: User, token: string | null) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].login;

    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = useCallback(() => {
        if (isLoading) return;
        setIsLoading(true);
        setError(null);

        const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId) {
            setError(t.errorConfig);
            setIsLoading(false);
            return;
        }

        if (!(window as any).google?.accounts?.oauth2) {
            setError(t.errorGIS);
            setIsLoading(false);
            return;
        }

        const client = (window as any).google.accounts.oauth2.initCodeClient({
            client_id: clientId,
            // Request identity AND Drive in a single consent screen
            scope: [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/drive.file',
            ].join(' '),
            ux_mode: 'popup',
            prompt: 'consent', // Always show consent to guarantee refresh_token
            callback: async (response: { code?: string; error?: string }) => {
                if (!response.code) {
                    setIsLoading(false);
                    if (response.error && response.error !== 'popup_closed_by_user') {
                        setError(t.errorConnect);
                    }
                    return;
                }

                try {
                    // Step 1 — Send the code to the backend.
                    // loginWithGoogleCode exchanges the code server-side (where client_secret lives),
                    // creates/links the Firebase user, saves the refresh token, and returns a custom token.
                    const functions = getFunctions();
                    const loginFn = httpsCallable<
                        { code: string },
                        { success: boolean; customToken: string; accessToken: string; hasRefreshToken: boolean }
                    >(functions, 'loginWithGoogleCode');

                    const result = await loginFn({ code: response.code });
                    const data = result.data;

                    if (!data?.success || !data.customToken) {
                        throw new Error(t.errorToken);
                    }

                    // Step 2 — Sign into Firebase client-side using the custom token
                    const auth = getAuth();
                    const userCredential = await signInWithCustomToken(auth, data.customToken);

                    // Step 3 — Signal success with the Drive access token
                    onLoginSuccess(userCredential.user, data.accessToken || null);

                } catch (err: any) {
                    console.error('[Login] Unified login error:', err);
                    const msg = err?.message || t.errorGeneric;
                    if (msg.includes('popup_closed') || msg.includes('cancelled')) {
                        setError(t.errorCancelled);
                    } else {
                        setError(t.errorGeneric);
                    }
                    setIsLoading(false);
                }
            },
            error_callback: (err: any) => {
                console.error('[Login] GIS error:', err);
                setIsLoading(false);
                if (err?.type !== 'popup_closed') {
                    setError(t.errorConnect);
                }
            },
        });

        client.requestCode();
    }, [isLoading, onLoginSuccess]);

    return (
        <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
            {/* FONDO ANIMADO SUTIL - Radial Gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#0a0a0a] to-[#0a0a0a] pointer-events-none" />

            <div className="w-full max-w-md p-8 relative z-10 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl">
                <div className="flex flex-col items-center gap-6 text-center">

                    {/* LOGO */}
                    <div className="w-24 h-24 flex items-center justify-center">
                        <img src="/assets/myworld-logo.svg" alt="MyWorld Logo" className="w-full h-full" />
                    </div>

                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold text-white tracking-tight">MyWorld</h1>
                        <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Creative IDE</p>
                    </div>

                    {/* BOTÓN DE LOGIN */}
                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="group relative w-full py-3 bg-white hover:bg-gray-200 text-black rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-3 mt-4"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">{t.authenticating}</span>
                        ) : (
                            <>
                                <Lock size={16} className="text-gray-600 group-hover:text-black transition-colors" />
                                <span>{t.connectWithGoogle}</span>
                            </>
                        )}
                    </button>

                    {/* INFORMACIÓN DE ACCESO */}
                    <div className="flex flex-col gap-3 text-[11px] text-gray-500 leading-relaxed text-center max-w-sm mt-2">
                        <p>{t.ideDesc}</p>
                        <p className="bg-white/5 p-3 rounded-lg border border-white/5 text-gray-400">
                            {t.authWarning}
                        </p>
                        <p>{t.apiKeyNeeded}</p>
                    </div>

                    {/* MENSAJE DE ERROR */}
                    {error && (
                        <div
                            role="alert"
                            aria-live="assertive"
                            className="flex items-center gap-2 text-red-400 text-xs bg-red-900/10 p-3 rounded-lg border border-red-900/20 w-full justify-center animate-fade-in mt-2"
                        >
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>
            </div>
            <div style={{
                position: 'fixed',
                bottom: '24px',
                left: '0',
                right: '0',
                display: 'flex',
                justifyContent: 'center',
                gap: '24px'
            }}>
                <a href="/privacy"
                   style={{color: 'rgba(255,255,255,0.3)', fontSize: '12px',
                           textDecoration: 'none', fontFamily: 'monospace'}}>
                    Privacy Policy
                </a>
                <a href="/terms"
                   style={{color: 'rgba(255,255,255,0.3)', fontSize: '12px',
                           textDecoration: 'none', fontFamily: 'monospace'}}>
                    Terms of Service
                </a>
            </div>
        </div>
    );
};

export default LoginScreen;
