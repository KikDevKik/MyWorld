import React, { useState } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider, User, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { LayoutGrid, Lock, ChevronRight, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: (user: User, token: string | null) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        setIsLoading(true);
        setError(null);

        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        // IMPORTANTE: Este scope es vital para que nos den el token correcto
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.addScope('https://www.googleapis.com/auth/drive.readonly');
        provider.setCustomParameters({
            prompt: 'consent'
        });

        try {
            // 🟢 CONFIGURAR PERSISTENCIA DE SESIÓN (SOLO PESTAÑA)
            await setPersistence(auth, browserSessionPersistence);

            const result = await signInWithPopup(auth, provider);
            // 🟢 CAPTURAR EL TOKEN AQUÍ
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;

            if (token) {
                // Guardar en localStorage para que sobreviva al F5 (Recarga)
                localStorage.setItem('google_drive_token', token);
            }

        } catch (error: any) {
            console.error("Login error:", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setError("Inicio de sesión cancelado.");
            } else {
                setError("Error al iniciar sesión. Intenta nuevamente.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="h-screen w-screen bg-[#0a0a0a] flex items-center justify-center relative overflow-hidden">
            {/* FONDO ANIMADO SUTIL - Radial Gradient */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#0a0a0a] to-[#0a0a0a] pointer-events-none" />

            <div className="w-full max-w-md p-8 relative z-10 bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl">
                <div className="flex flex-col items-center gap-6 text-center">

                    {/* LOGO / ICONO - Simple stylized geometric shape */}
                    <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg">
                        <LayoutGrid size={32} className="text-white opacity-80" />
                    </div>

                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold text-white tracking-tight">MyWorld</h1>
                        <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Creative IDE</p>
                    </div>

                    {/* BOTÓN DE LOGIN - Minimal */}
                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="group relative w-full py-3 bg-white hover:bg-gray-200 text-black rounded-lg font-medium transition-all shadow-lg flex items-center justify-center gap-3 mt-4"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Authenticating...</span>
                        ) : (
                            <>
                                <Lock size={16} className="text-gray-600 group-hover:text-black transition-colors" />
                                <span>Sign in with Google</span>
                            </>
                        )}
                    </button>

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

            {/* FOOTER */}
            <div className="absolute bottom-8 text-[10px] text-gray-700 font-mono tracking-wider">
                SYSTEM STATUS: ONLINE | PROJECT TITANIUM
            </div>
        </div>
    );
};

export default LoginScreen;
