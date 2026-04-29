import React, { useState } from 'react';
import { X, Eye, EyeOff, ExternalLink, Check } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';

interface Props {
    onClose: () => void;
}

const STEPS = [
    {
        icon: '🌐',
        title: 'Ve a Google AI Studio',
        description: 'Google ofrece una capa completamente gratuita para Gemini Flash. No necesitas tarjeta de crédito.',
        hint: 'Haz clic en el botón de abajo para ir a AI Studio en una nueva pestaña.',
    },
    {
        icon: '🔑',
        title: 'Crea tu API Key',
        steps: [
            'Inicia sesión con tu cuenta de Google',
            'Haz clic en "Create API Key"',
            'Selecciona o crea un proyecto',
            'Copia el código (empieza con "AIza")',
        ],
    },
    {
        icon: '⚡',
        title: 'Pega tu key aquí',
        isInputStep: true,
    },
] as const;

export function APIKeyOnboarding({ onClose }: Props) {
    const { setCustomGeminiKey } = useProjectConfig();
    const [step, setStep] = useState(0);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isLastStep = step === STEPS.length - 1;
    const currentStep = STEPS[step];

    const handleConnect = () => {
        const trimmed = apiKey.trim();
        if (!trimmed.startsWith('AIza') || trimmed.length < 20) {
            setError('La key debe empezar con "AIza" y tener al menos 20 caracteres.');
            return;
        }
        setCustomGeminiKey(trimmed);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md mx-4">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
                    <div>
                        <h2 className="text-base font-semibold text-zinc-100">Conecta tu motor de IA</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">MyWorld usa tu propia API key de Google — gratis</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2 px-6 py-3">
                    {STEPS.map((_, i) => (
                        <React.Fragment key={i}>
                            <div className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold transition-colors ${
                                i < step ? 'bg-emerald-500 text-white' :
                                i === step ? 'bg-violet-600 text-white' :
                                'bg-zinc-800 text-zinc-500'
                            }`}>
                                {i < step ? <Check size={12} /> : i + 1}
                            </div>
                            {i < STEPS.length - 1 && (
                                <div className={`flex-1 h-px transition-colors ${i < step ? 'bg-emerald-500/40' : 'bg-zinc-800'}`} />
                            )}
                        </React.Fragment>
                    ))}
                    <span className="text-xs text-zinc-500 ml-1">Paso {step + 1} de {STEPS.length}</span>
                </div>

                {/* Step content */}
                <div className="px-6 py-4 min-h-[180px]">
                    <div className="text-3xl mb-3">{currentStep.icon}</div>
                    <h3 className="text-sm font-semibold text-zinc-200 mb-2">{currentStep.title}</h3>

                    {step === 0 && (
                        <>
                            <p className="text-sm text-zinc-400 leading-relaxed mb-4">{STEPS[0].description}</p>
                            <p className="text-xs text-zinc-500 mb-4">{STEPS[0].hint}</p>
                            <button
                                onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                                className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                            >
                                <ExternalLink size={14} />
                                Abrir Google AI Studio →
                            </button>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <ol className="space-y-2 mb-4">
                                {STEPS[1].steps.map((s, i) => (
                                    <li key={i} className="flex items-start gap-2.5">
                                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs text-zinc-400 font-medium">
                                            {i + 1}
                                        </span>
                                        <span className="text-sm text-zinc-300 leading-relaxed">{s}</span>
                                    </li>
                                ))}
                            </ol>
                            <button
                                onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                                className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <ExternalLink size={12} />
                                Abrir AI Studio de nuevo
                            </button>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <div className="relative mb-2">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => { setApiKey(e.target.value); setError(null); }}
                                    placeholder="AIzaSy..."
                                    autoFocus
                                    className="w-full bg-zinc-800 text-white placeholder-zinc-600 border border-zinc-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2.5 pr-10 font-mono text-sm outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    aria-label={showKey ? 'Ocultar' : 'Mostrar'}
                                >
                                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
                            <div className="flex items-start gap-1.5 mt-3">
                                <span className="text-xs text-zinc-600">🔒</span>
                                <p className="text-xs text-zinc-600 leading-relaxed">
                                    Se guarda solo en tu navegador. Nunca en nuestros servidores.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 pb-5 pt-2">
                    <button
                        onClick={onClose}
                        className="text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                        Omitir
                    </button>
                    <div className="flex gap-2">
                        {step > 0 && (
                            <button
                                onClick={() => setStep(s => s - 1)}
                                className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                                ← Atrás
                            </button>
                        )}
                        {isLastStep ? (
                            <button
                                onClick={handleConnect}
                                disabled={!apiKey.trim()}
                                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                ✓ Conectar y empezar
                            </button>
                        ) : (
                            <button
                                onClick={() => setStep(s => s + 1)}
                                className="px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
                            >
                                Siguiente →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
