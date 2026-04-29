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
            <p className="text-sm text-zinc-500 mb-6 max-w-xs leading-relaxed">
                {toolName} necesita tu API key de Google AI Studio para funcionar. Es gratuita y solo tarda 2 minutos.
            </p>
            <button
                onClick={showAPIKeyOnboarding}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
                Conectar mi API key
            </button>
            <button
                onClick={() => window.open('https://aistudio.google.com/apikey', '_blank')}
                className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2"
            >
                Obtener API key gratuita en Google AI Studio →
            </button>
        </div>
    );
}
