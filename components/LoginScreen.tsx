import React, { useState } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { Shield, Lock, ChevronRight, AlertCircle } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: (user: User, token: string | null) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async () => {
        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        // IMPORTANTE: Este scope es vital para que nos den el token correcto
        provider.addScope('https://www.googleapis.com/auth/drive');
        provider.setCustomParameters({
            prompt: 'consent'
        });

        try {
            const result = await signInWithPopup(auth, provider);
            // 🟢 CAPTURAR EL TOKEN AQUÍ
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential?.accessToken;

            if (token) {
                // Guardar en localStorage para que sobreviva al F5 (Recarga)
                localStorage.setItem('google_drive_token', token);
            }

        } catch (error) {
            console.error("Login error:", error);
        }
    };

    return (
        <div className="h-screen w-screen bg-titanium-950 flex items-center justify-center relative overflow-hidden">
            {/* FONDO ANIMADO SUTIL */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-titanium-900/20 via-titanium-950 to-titanium-950 pointer-events-none" />

            <div className="w-full max-w-md p-8 relative z-10">
                <div className="flex flex-col items-center gap-6 text-center">

                    {/* LOGO / ICONO */}
                    <div className="w-16 h-16 bg-titanium-900 rounded-2xl flex items-center justify-center border border-titanium-800 shadow-2xl shadow-black/50">
                        <Shield size={32} className="text-titanium-100" />
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-3xl font-bold text-titanium-100 tracking-tight">Acceso Restringido</h1>
                        <p className="text-titanium-500 text-sm">Identifícate para acceder a la Bóveda Creativa.</p>
                    </div>

                    {/* BOTÓN DE LOGIN */}
                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="group relative w-full py-4 bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)] hover:shadow-[0_0_30px_rgba(56,189,248,0.4)] flex items-center justify-center gap-3 overflow-hidden"
                    >
                        {isLoading ? (
                            <span className="animate-pulse">Autenticando...</span>
                        ) : (
                            <>
                                <Lock size={18} className="group-hover:hidden transition-all" />
                                <ChevronRight size={18} className="hidden group-hover:block transition-all" />
                                <span>Iniciar Sesión con Google</span>
                            </>
                        )}
                    </button>

                    {/* MENSAJE DE ERROR */}
                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-900/10 p-3 rounded-lg border border-red-900/20 w-full justify-center animate-fade-in">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}

                    <p className="text-[10px] text-titanium-700 uppercase tracking-widest mt-8">
                        MyWorld Creative IDE v2.0
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
