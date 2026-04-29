import React from 'react';
import { X } from 'lucide-react';
import { ToolAccentColor } from '../config/toolWelcomes';

interface ToolWelcomeCardProps {
    icon: React.ReactNode;
    toolName: string;
    tagline: string;
    description: string;
    tips: string[];
    accentColor: ToolAccentColor;
    onDismiss: () => void;
}

const COLOR_CLASSES: Record<ToolAccentColor, {
    wrapper: string;
    iconBox: string;
    tagline: string;
    arrow: string;
}> = {
    violet: {
        wrapper: 'border-violet-500/20 bg-violet-500/5',
        iconBox: 'bg-violet-500/20 border-violet-500/30',
        tagline: 'text-violet-400',
        arrow: 'text-violet-400',
    },
    cyan: {
        wrapper: 'border-cyan-500/20 bg-cyan-500/5',
        iconBox: 'bg-cyan-500/20 border-cyan-500/30',
        tagline: 'text-cyan-400',
        arrow: 'text-cyan-400',
    },
    amber: {
        wrapper: 'border-amber-500/20 bg-amber-500/5',
        iconBox: 'bg-amber-500/20 border-amber-500/30',
        tagline: 'text-amber-400',
        arrow: 'text-amber-400',
    },
    emerald: {
        wrapper: 'border-emerald-500/20 bg-emerald-500/5',
        iconBox: 'bg-emerald-500/20 border-emerald-500/30',
        tagline: 'text-emerald-400',
        arrow: 'text-emerald-400',
    },
    zinc: {
        wrapper: 'border-zinc-500/20 bg-zinc-500/5',
        iconBox: 'bg-zinc-500/20 border-zinc-500/30',
        tagline: 'text-zinc-400',
        arrow: 'text-zinc-400',
    },
};

export function ToolWelcomeCard({
    icon,
    toolName,
    tagline,
    description,
    tips,
    accentColor,
    onDismiss,
}: ToolWelcomeCardProps) {
    const c = COLOR_CLASSES[accentColor] ?? COLOR_CLASSES.zinc;

    return (
        <div className={`relative mx-4 mb-4 mt-2 rounded-xl border ${c.wrapper} p-4`}>
            {/* Botón cerrar */}
            <button
                onClick={onDismiss}
                className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Cerrar guía"
            >
                <X size={14} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-3 pr-6">
                <div className={`w-9 h-9 rounded-lg ${c.iconBox} border flex items-center justify-center text-base flex-shrink-0`}>
                    {icon}
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-white">{toolName}</h3>
                    <p className={`text-xs ${c.tagline}`}>{tagline}</p>
                </div>
            </div>

            {/* Descripción */}
            <p className="text-xs text-zinc-400 leading-relaxed mb-3">
                {description}
            </p>

            {/* Tips */}
            <div className="space-y-1">
                {tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                        <span className={`${c.arrow} text-xs mt-0.5 flex-shrink-0`}>→</span>
                        <span className="text-xs text-zinc-500">{tip}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
