import React from 'react';
import { SoulEntity } from '../../types/forge';
import { Ghost, FileEdit, Anchor, ArrowRight, Zap, Database } from 'lucide-react';

interface ForgeCardProps {
    entity: SoulEntity;
    onAction: (entity: SoulEntity) => void;
}

const ForgeCard: React.FC<ForgeCardProps> = ({ entity, onAction }) => {

    // VARIANT A: GHOST (The Radar)
    if (entity.tier === 'GHOST') {
        return (
            <div className="group relative p-4 rounded-xl border border-dashed border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-900/30 hover:border-cyan-400/50 transition-all duration-300 backdrop-blur-sm">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-titanium-200 font-mono tracking-wide group-hover:text-cyan-300 transition-colors">
                        {entity.name}
                    </h3>
                    <Ghost size={14} className="text-cyan-500/50 group-hover:text-cyan-400" />
                </div>

                <p className="text-xs text-titanium-500 italic mb-4 line-clamp-3 font-serif leading-relaxed">
                    "{entity.sourceSnippet || "Sin contexto detectado..."}"
                </p>

                <button
                    onClick={() => onAction(entity)}
                    className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-500/80 border border-cyan-500/20 rounded hover:bg-cyan-500/10 hover:text-cyan-300 transition-all"
                >
                    <Zap size={12} />
                    Materializar
                </button>
            </div>
        );
    }

    // VARIANT B: LIMBO (The Workshop)
    if (entity.tier === 'LIMBO') {
        return (
            <div className="group p-4 rounded-xl border border-amber-500/30 bg-titanium-900/50 hover:bg-amber-950/10 hover:border-amber-500/60 transition-all duration-300 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-bold text-titanium-100 group-hover:text-amber-200 transition-colors">
                        {entity.name}
                    </h3>
                    <FileEdit size={14} className="text-amber-500/50 group-hover:text-amber-400" />
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-3">
                    {(entity.tags || []).slice(0, 3).map((tag, i) => (
                        <span key={i} className="text-[10px] bg-amber-900/30 text-amber-500/80 px-1.5 py-0.5 rounded border border-amber-500/10">
                            {tag}
                        </span>
                    ))}
                    {(!entity.tags || entity.tags.length === 0) && (
                        <span className="text-[10px] text-titanium-600 italic">Sin etiquetas</span>
                    )}
                </div>

                <p className="text-xs text-titanium-400 mb-4 line-clamp-2 leading-relaxed">
                   {entity.sourceSnippet || entity.role || "Borrador sin contenido previo."}
                </p>

                <button
                    onClick={() => onAction(entity)}
                    className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-amber-500 border border-amber-500/30 rounded hover:bg-amber-500 hover:text-titanium-950 transition-all"
                >
                    <ArrowRight size={12} />
                    Refinar
                </button>
            </div>
        );
    }

    // VARIANT C: ANCHOR (The Library)
    // Fallback to ANCHOR styling for anything else
    return (
        <div className="group relative p-5 rounded-xl border border-titanium-700 bg-gradient-to-br from-titanium-900 to-titanium-950 hover:border-emerald-500/50 hover:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all duration-300">
            {/* Metallic Shine Effect (Pseudo) */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

            <div className="relative z-10">
                <div className="flex items-start justify-between mb-1">
                    <h3 className="text-xl font-serif font-bold text-titanium-100 group-hover:text-emerald-300 transition-colors">
                        {entity.name}
                    </h3>
                    <Anchor size={16} className="text-titanium-600 group-hover:text-emerald-500 transition-colors" />
                </div>

                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/80 mb-3">
                    {entity.role || "PERSONAJE REGISTRADO"}
                </div>

                <div className="flex items-center gap-2 text-xs text-titanium-500 mb-4 font-mono">
                    <Database size={10} />
                    <span>Apariciones: {entity.occurrences || "?"}</span>
                </div>

                <button
                    onClick={() => onAction(entity)}
                    className="w-full py-2 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider text-titanium-400 bg-titanium-800/50 rounded hover:bg-emerald-600 hover:text-white transition-all"
                >
                    Editar Ficha
                </button>
            </div>
        </div>
    );
};

export default ForgeCard;
