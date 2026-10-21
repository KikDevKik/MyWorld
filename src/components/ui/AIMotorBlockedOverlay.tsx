import React from 'react';
import { Unplug } from 'lucide-react';
import { showAPIKeyOnboarding } from '../../utils/settingsEvents';

interface Props {
    toolName: string;
}

export function AIMotorBlockedOverlay({ toolName }: Props) {
    return (
        <div className="flex flex-col items-center justify-center h-full px-8 py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mb-5">
                <Unplug size={22} className="text-zinc-500" />
            </div>
            <h3 className="text-base font-medium text-zinc-300 mb-2">
                Motor de IA desconectado
            </h3>
            <p className="text-sm text-zinc-400 mb-6 max-w-sm leading-relaxed">
                {toolName} necesita que configures al menos una API key (Google Gemini o Anthropic Claude) en Ajustes para funcionar.
            </p>
            <button
                onClick={showAPIKeyOnboarding}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-violet-500/20"
            >
                Configurar mi API Key
            </button>
            <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                <button
                    onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                    className="hover:text-cyan-400 transition-colors underline underline-offset-2"
                >
                    Gemini Gratis →
                </button>
                <span>•</span>
                <button
                    onClick={() => window.open('https://console.anthropic.com/settings/keys', '_blank')}
                    className="hover:text-amber-400 transition-colors underline underline-offset-2"
                >
                    Anthropic Claude →
                </button>
            </div>
        </div>
    );
}
