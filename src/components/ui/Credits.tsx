import React from 'react';
import { ExternalLink } from 'lucide-react';

const sponsors = {
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

    return (
        <div className="flex flex-col gap-6 p-5 border border-titanium-800/50 rounded-xl bg-titanium-900/20">
            <h4 className="text-sm font-bold text-titanium-100 uppercase tracking-wider">Hall of Fame</h4>
            
            <div className="flex flex-col gap-2">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }} className="uppercase text-violet-400 font-bold tracking-widest">Arquitectos Fundadores</span>
                {renderSponsorList(sponsors.arquitectoFundador, "Sé el primero en aparecer aquí →")}
            </div>

            <div className="flex flex-col gap-2">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }} className="uppercase text-cyan-400 font-bold tracking-widest">Cronistas</span>
                {renderSponsorList(sponsors.cronista, "Sé el primero en aparecer aquí →")}
            </div>

            <div className="flex flex-col gap-2">
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px' }} className="uppercase text-emerald-400/80 font-bold tracking-widest">Lectores</span>
                {renderSponsorList(sponsors.lector, "Sé el primero en aparecer aquí →")}
            </div>
        </div>
    );
};

export default Credits;
