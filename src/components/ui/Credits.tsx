import React from 'react';
import { ExternalLink } from 'lucide-react';

const sponsors: Record<'arquitectoFundador' | 'cronista' | 'lector', { name: string; url: string }[]> = {
    arquitectoFundador: [
        // { name: "Nombre", url: "https://red-social.com" }
    ],
    cronista: [],
    lector: []
};

const Credits: React.FC = () => {
    const renderSponsorList = (list: { name: string, url: string }[], emptyText: string) => {
        if (list.length === 0) {
            return (
                <a href="https://github.com/sponsors/KikDevKik" target="_blank" rel="noopener noreferrer" className="text-titanium-500 hover:text-titanium-300 transition-colors flex items-center gap-1" style={{ fontSize: '13px' }}>
                    {emptyText}
                </a>
            );
        }
        return (
            <div className="flex flex-wrap gap-4">
                {list.map((s, i) => (
                    <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-1 text-titanium-200 hover:text-white transition-all">
                        <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: '16px' }} className="group-hover:underline decoration-1 underline-offset-4">{s.name}</span>
                        <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity text-titanium-400" />
                    </a>
                ))}
            </div>
        );
    };

    // Nov 2026: mientras no haya nadie, un solo bloque con el frasco (antes tres «Sé el primero» vacíos).
    const empty = !sponsors.arquitectoFundador.length && !sponsors.cronista.length && !sponsors.lector.length;
    if (empty) {
        return (
            <div className="flex items-center gap-4 p-5 border border-titanium-800 rounded-xl bg-titanium-900/40">
                <img src="/assets/objetos/frasco_monedas.png" alt="" width={56} height={56} className="w-14 h-14 shrink-0" style={{ imageRendering: 'pixelated' }} />
                <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-titanium-100">Salón de la fama</h4>
                    <p className="text-[13px] text-titanium-400 mt-0.5">Quienes apoyan MyWorld aparecen aquí: arquitectos fundadores, cronistas y lectores.</p>
                    <a href="https://github.com/sponsors/KikDevKik" target="_blank" rel="noopener noreferrer" className="inline-block mt-1.5 text-[13px] font-medium text-mira hover:underline underline-offset-4">Sé el primero</a>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-5 border border-titanium-800/50 rounded-xl bg-titanium-900/20">
            <h4 className="text-sm font-semibold text-titanium-100">Salón de la fama</h4>
            <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-mira">Arquitectos fundadores</span>
                {renderSponsorList(sponsors.arquitectoFundador, "Sé el primero en aparecer aquí")}
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-mira">Cronistas</span>
                {renderSponsorList(sponsors.cronista, "Sé el primero en aparecer aquí")}
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-mira">Lectores</span>
                {renderSponsorList(sponsors.lector, "Sé el primero en aparecer aquí")}
            </div>
        </div>
    );
};

export default Credits;
