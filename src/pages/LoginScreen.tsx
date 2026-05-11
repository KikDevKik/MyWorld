import React, { useState, useEffect, useRef } from 'react';
import { getAuth, signInWithPopup, GoogleAuthProvider, User, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { AlertCircle } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: (user: User, token: string | null) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [mounted, setMounted] = useState(false);
    const orbRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Staggered mount reveal
        const t = setTimeout(() => setMounted(true), 80);
        return () => clearTimeout(t);
    }, []);

    // Subtle orb parallax on mouse move
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!orbRef.current) return;
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const dx = (e.clientX - cx) / cx;
            const dy = (e.clientY - cy) / cy;
            orbRef.current.style.transform = `translate(${dx * 18}px, ${dy * 12}px)`;
        };
        window.addEventListener('mousemove', handleMove);
        return () => window.removeEventListener('mousemove', handleMove);
    }, []);

    const handleLogin = async () => {
        setIsLoading(true);
        setError(null);

        const auth = getAuth();
        const provider = new GoogleAuthProvider();
        
        const stateToken = crypto.randomUUID();
        sessionStorage.setItem('oauth_state', stateToken);
        
        provider.addScope('https://www.googleapis.com/auth/drive.file');
        provider.setCustomParameters({ 
            prompt: 'consent',
            state: stateToken
        });

        try {
            await setPersistence(auth, browserLocalPersistence);
            const result = await signInWithPopup(auth, provider);
            
            const savedState = sessionStorage.getItem('oauth_state');
            sessionStorage.removeItem('oauth_state');
            
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

    return (
        <div
            style={{ background: '#0a0a0f' }}
            className="h-screen w-screen flex items-center justify-center relative overflow-hidden"
        >
            {/* ── BG GRID ── */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(129,140,248,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(129,140,248,0.04) 1px, transparent 1px)
                    `,
                    backgroundSize: '48px 48px',
                }}
            />

            {/* ── AMBIENT GLOW ── */}
            <div
                ref={orbRef}
                className="absolute pointer-events-none"
                style={{
                    width: '600px',
                    height: '600px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(109,40,217,0.07) 0%, rgba(103,232,249,0.04) 45%, transparent 70%)',
                    top: '50%',
                    left: '50%',
                    marginTop: '-300px',
                    marginLeft: '-300px',
                    transition: 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                }}
            />

            {/* ── CARD ── */}
            <div
                className="relative z-10 w-full flex flex-col items-center"
                style={{
                    maxWidth: '400px',
                    padding: '0 24px',
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'translateY(0)' : 'translateY(16px)',
                    transition: 'opacity 0.7s ease, transform 0.7s ease',
                }}
            >
                {/* Logo */}
                <div
                    className="flex items-center justify-center mb-8"
                    style={{
                        width: '72px',
                        height: '72px',
                        borderRadius: '18px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(103,232,249,0.2)',
                        boxShadow: '0 0 32px rgba(103,232,249,0.06)',
                        overflow: 'hidden',
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'scale(1)' : 'scale(0.92)',
                        transition: 'opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s',
                    }}
                >
                    <img
                        src="/assets/myworld-logo.svg"
                        alt="MyWorld"
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                </div>

                {/* Title */}
                <div
                    className="text-center mb-10"
                    style={{
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'opacity 0.7s ease 0.15s, transform 0.7s ease 0.15s',
                    }}
                >
                    <h1
                        style={{
                            fontFamily: "'Newsreader', Georgia, serif",
                            fontSize: '40px',
                            fontWeight: '400',
                            letterSpacing: '-0.025em',
                            color: '#e2e8f0',
                            lineHeight: '1',
                            marginBottom: '8px',
                        }}
                    >
                        MyWorld
                    </h1>
                    <p
                        style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '10px',
                            letterSpacing: '0.2em',
                            textTransform: 'uppercase',
                            color: '#475569',
                        }}
                    >
                        Creative IDE
                    </p>
                </div>

                {/* Login button */}
                <div
                    className="w-full"
                    style={{
                        opacity: mounted ? 1 : 0,
                        transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                        transition: 'opacity 0.7s ease 0.22s, transform 0.7s ease 0.22s',
                    }}
                >
                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className="w-full group relative flex items-center justify-center gap-3"
                        style={{
                            padding: '14px 24px',
                            borderRadius: '10px',
                            background: isLoading
                                ? 'rgba(103,232,249,0.05)'
                                : 'linear-gradient(135deg, rgba(103,232,249,0.12), rgba(129,140,248,0.12))',
                            border: '1px solid rgba(103,232,249,0.25)',
                            color: '#67e8f9',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '13px',
                            fontWeight: '500',
                            letterSpacing: '0.02em',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            boxShadow: '0 0 24px rgba(103,232,249,0.06)',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => {
                            if (!isLoading) {
                                (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(103,232,249,0.2), rgba(129,140,248,0.2))';
                                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 32px rgba(103,232,249,0.15)';
                                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                            }
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, rgba(103,232,249,0.12), rgba(129,140,248,0.12))';
                            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 24px rgba(103,232,249,0.06)';
                            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                        }}
                    >
                        {isLoading ? (
                            <>
                                <span
                                    style={{
                                        width: '14px',
                                        height: '14px',
                                        border: '1.5px solid rgba(103,232,249,0.3)',
                                        borderTopColor: '#67e8f9',
                                        borderRadius: '50%',
                                        animation: 'spin 0.8s linear infinite',
                                        display: 'inline-block',
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ color: 'rgba(103,232,249,0.6)' }}>Autenticando...</span>
                            </>
                        ) : (
                            <>
                                {/* Google G icon */}
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                                    <path d="M15.68 8.18c0-.57-.05-1.11-.14-1.64H8v3.1h4.3a3.67 3.67 0 0 1-1.59 2.41v2h2.57c1.5-1.38 2.4-3.42 2.4-5.87z" fill="#67e8f9" opacity="0.9"/>
                                    <path d="M8 16c2.16 0 3.97-.72 5.29-1.94l-2.57-2a4.8 4.8 0 0 1-7.15-2.53H.96v2.06A8 8 0 0 0 8 16z" fill="#818cf8" opacity="0.9"/>
                                    <path d="M3.57 9.53A4.83 4.83 0 0 1 3.32 8c0-.53.09-1.04.25-1.53V4.41H.96A8.01 8.01 0 0 0 0 8c0 1.29.31 2.51.96 3.59l2.61-2.06z" fill="#34d399" opacity="0.9"/>
                                    <path d="M8 3.18c1.22 0 2.3.42 3.16 1.24l2.37-2.37A7.96 7.96 0 0 0 8 0 8 8 0 0 0 .96 4.41L3.57 6.47A4.77 4.77 0 0 1 8 3.18z" fill="#fbbf24" opacity="0.9"/>
                                </svg>
                                Iniciar sesión con Google
                            </>
                        )}
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div
                        className="w-full flex items-center gap-2 mt-4"
                        style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            background: 'rgba(252,100,100,0.06)',
                            border: '1px solid rgba(252,100,100,0.2)',
                            color: '#fc6464',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '12px',
                            animation: 'fadeIn 0.3s ease',
                        }}
                        role="alert"
                    >
                        <AlertCircle size={13} style={{ flexShrink: 0 }} />
                        {error}
                    </div>
                )}

                {/* Disclaimer */}
                <div
                    style={{
                        marginTop: '32px',
                        padding: '16px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(129,140,248,0.08)',
                        opacity: mounted ? 1 : 0,
                        transition: 'opacity 0.7s ease 0.35s',
                    }}
                >
                    <p
                        style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11px',
                            lineHeight: '1.7',
                            color: '#475569',
                            textAlign: 'center',
                        }}
                    >
                        Al iniciar sesión autorizas a MyWorld a crear carpetas y documentos en tu Drive.{' '}
                        <span style={{ color: '#64748b' }}>Nosotros no guardamos ni una sola letra de tu obra en nuestros servidores.</span>
                    </p>
                </div>

                {/* Gemini note */}
                <p
                    style={{
                        marginTop: '16px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '10px',
                        letterSpacing: '0.02em',
                        color: '#334155',
                        textAlign: 'center',
                        opacity: mounted ? 1 : 0,
                        transition: 'opacity 0.7s ease 0.4s',
                    }}
                >
                    También necesitarás una API Key de Google Gemini (gratuita) para activar la IA.
                </p>

                {/* Footer links */}
                <div
                    className="flex gap-6 mt-10"
                    style={{
                        opacity: mounted ? 0.4 : 0,
                        transition: 'opacity 0.7s ease 0.5s',
                    }}
                >
                    {['Privacy Policy', 'Terms of Service'].map(label => (
                        <a
                            key={label}
                            href={label === 'Privacy Policy' ? '/privacy' : '/terms'}
                            style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '10px',
                                letterSpacing: '0.08em',
                                color: '#475569',
                                textDecoration: 'none',
                                textTransform: 'uppercase',
                                transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                        >
                            {label}
                        </a>
                    ))}
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap');
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            `}</style>
        </div>
    );
};

export default LoginScreen;
