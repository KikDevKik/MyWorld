import React, { useState, useEffect } from 'react';
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, User, setPersistence, browserLocalPersistence } from 'firebase/auth';

// Nov 2026: en el iPhone, con MyWorld agregado a la pantalla de inicio, la ventana emergente de Google
// se abre aparte y nunca devuelve la sesión: el botón se quedaba en «Entrando…». Ahí se entra por redirección
// (Google y vuelta a la app, en la misma ventana). Funciona porque authDomain es el propio myworldhistory.site.
function isStandaloneApp(): boolean {
    try {
        return (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    } catch { return false; }
}
import { AlertCircle, Loader2 } from 'lucide-react';
import { MiraSprite } from '../components/mira/MiraSprite';

interface LoginScreenProps {
    onLoginSuccess: (user: User, token: string | null) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Staggered mount reveal
        const t = setTimeout(() => setMounted(true), 80);
        return () => clearTimeout(t);
    }, []);

    const handleLogin = async () => {
        setIsLoading(true);
        setError(null);

        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        // Nov 2026: antes se forzaba la pantalla de permisos (prompt: 'consent') en cada inicio de sesión,
        // y Google mostraba «MyWorld quiere acceder a tu cuenta» aunque ya los hubieras dado. Ahora solo
        // aparece la primera vez; después basta con elegir la cuenta. (Firebase ya maneja el parámetro state.)
        provider.setCustomParameters({ prompt: 'select_account' });

        try {
            await setPersistence(auth, browserLocalPersistence);
            if (isStandaloneApp()) {
                await signInWithRedirect(auth, provider);
                return; // la página se va a Google y vuelve; App recoge el resultado
            }
            const result = await signInWithPopup(auth, provider);

            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken ?? null;
            onLoginSuccess(result.user, token);
        } catch (err: any) {
            if (err.code === 'auth/popup-closed-by-user') {
                setError('Inicio de sesión cancelado.');
            } else {
                setError('Error al iniciar sesión. Intenta nuevamente.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Nov 2026: la pantalla de entrada con el estilo de la app (Mira, colores del tema) y un aviso de datos que dice la verdad.
    return (
        <main className="min-h-[100dvh] w-full bg-titanium-950 text-titanium-100 flex items-center justify-center px-4 py-10 relative overflow-hidden">
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_35%,var(--color-titanium-900)_0%,var(--color-titanium-950)_70%)]" />
            <div
                className={`relative z-10 w-full max-w-[400px] flex flex-col items-center text-center transition-all duration-700 motion-reduce:transition-none ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
            >
                <MiraSprite pose="saludo" scale={2} label="Mira te saluda" />

                <h1 className="mt-4 font-serif text-[40px] leading-none text-titanium-50">MyWorld</h1>
                <p className="mt-3 text-[15px] text-titanium-300 leading-relaxed text-pretty">Tu mesa de escritura. Mira te acompaña mientras escribes y el Arquitecto te ayuda a planear.</p>

                <button
                    onClick={handleLogin}
                    disabled={isLoading}
                    className="mt-8 w-full h-12 inline-flex items-center justify-center gap-3 rounded-xl bg-white text-[#1f1f1f] text-[15px] font-medium border border-[#dadce0] shadow-sm hover:bg-[#f8f9fa] active:bg-[#f1f3f4] disabled:opacity-70 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira focus-visible:ring-offset-2 focus-visible:ring-offset-titanium-950 transition-colors"
                >
                    {isLoading ? (
                        <><Loader2 size={18} className="animate-spin text-[#5f6368]" aria-hidden="true" /> Entrando…</>
                    ) : (
                        <>
                            {/* Logo oficial de Google (sus colores no se cambian) */}
                            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                            </svg>
                            Continuar con Google
                        </>
                    )}
                </button>

                {error && (
                    <p role="alert" className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-titanium-100">
                        <AlertCircle size={15} className="text-coral shrink-0" aria-hidden="true" /> {error}
                    </p>
                )}

                <div className="mt-6 w-full rounded-xl border border-titanium-800 bg-titanium-900/60 px-4 py-3 text-left text-[13px] leading-relaxed text-titanium-300">
                    <p>Tus documentos se guardan en tu Google Drive: MyWorld solo crea y edita las carpetas de tu proyecto.</p>
                    <p className="mt-1.5">Para buscar en tu canon, MyWorld guarda fragmentos de tus textos, y también tus conversaciones con Mira y el Arquitecto. Puedes borrarlos cuando quieras desde Ajustes.</p>
                    <p className="mt-1.5 text-titanium-400">Para usar la IA hace falta una clave gratuita de Google Gemini. Te ayudamos a crearla al entrar.</p>
                    <p className="mt-1.5 text-titanium-400">La primera vez, Google te pide permiso para que MyWorld use tu Drive. Es el permiso más pequeño que existe: solo ve los archivos que MyWorld crea, nunca el resto de tu Drive.</p>
                </div>

                <nav aria-label="Información legal" className="mt-6 flex items-center gap-4 text-sm text-titanium-400">
                    <a href="/privacy" className="hover:text-titanium-100 underline-offset-4 hover:underline">Privacidad</a>
                    <span aria-hidden="true">·</span>
                    <a href="/terms" className="hover:text-titanium-100 underline-offset-4 hover:underline">Términos</a>
                    <span aria-hidden="true">·</span>
                    <a href="/" className="hover:text-titanium-100 underline-offset-4 hover:underline">Qué es MyWorld</a>
                </nav>
            </div>
        </main>
    );
};

export default LoginScreen;
