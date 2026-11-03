import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { MiraSprite } from './MiraSprite';
import { getTips, getMiraPrefs, setMiraPrefs, MiraPrefs } from './tips';
import { useLanguageStore } from '../../stores/useLanguageStore';

/** Rincón de tips: dos estantes (escribir y enfocarse) y cuándo Mira muestra tips. Se abre con el evento OPEN_TIPS. */
const COLORS = { escribir: ['#F5697E', '#FF9638', '#E8B06A', '#D97A8A'], enfocarse: ['#7FB8A4', '#8FA7D6', '#B9AEE0', '#6FA3B8'] };

export default function TipsCorner() {
    const lang = useLanguageStore(s => s.currentLanguage) === 'es' ? 'es' : 'en';
    const tips = getTips(lang);
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(tips[4].id);
    const [moved, setMoved] = useState(false);
    const [prefs, setPrefs] = useState<MiraPrefs>(getMiraPrefs);
    useEffect(() => {
        const on = () => { setOpen(true); setMoved(false); setPrefs(getMiraPrefs()); };
        window.addEventListener('OPEN_TIPS', on);
        return () => window.removeEventListener('OPEN_TIPS', on);
    }, []);
    useEffect(() => {
        if (!open) return;
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [open]);
    if (!open) return null;
    const tip = tips.find(t => t.id === sel)!;
    const L = lang === 'es'
        ? { title: 'Rincón de tips', sub: 'Para escribir mejor y no perderte', escribir: 'Escribir', enfocarse: 'Enfocarse', when: 'Cuándo te muestra tips Mira', o1: 'Al despertar a Mira, en una burbuja que se va al escribir', o2: 'Antes de empezar, con el ritual del escritorio', close: 'Cerrar' }
        : { title: 'Tips corner', sub: 'To write better and stay on track', escribir: 'Writing', enfocarse: 'Focus', when: 'When Mira shows tips', o1: 'When Mira wakes up, in a bubble that fades as you type', o2: 'Before you start, with the desk ritual', close: 'Close' };

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
            <div role="dialog" aria-modal="true" aria-label={L.title} className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-titanium-900 border border-titanium-700 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row gap-8">
                <button type="button" onClick={() => setOpen(false)} aria-label={L.close} className="absolute right-4 top-4 w-11 h-11 rounded-full border border-titanium-700 flex items-center justify-center text-titanium-300 hover:text-titanium-100"><X size={16} /></button>
                <section className="flex-1 min-w-0 flex flex-col gap-6">
                    <div>
                        <div className="text-sm text-titanium-400">{L.sub}</div>
                        <h2 className="font-serif text-3xl font-semibold text-titanium-100 mt-1">{L.title}</h2>
                    </div>
                    {(['escribir', 'enfocarse'] as const).map(shelf => (
                        <div key={shelf}>
                            <div className="font-semibold text-titanium-100 mb-3">{L[shelf]}</div>
                            <div className="flex items-end gap-2.5 px-3 h-[160px] border-b-[10px] border-[#3E2C2A]" style={{ marginTop: moved && tip.shelf === shelf ? 84 : 0 }}>
                                {tips.filter(t => t.shelf === shelf).map((t, i) => {
                                    const on = t.id === sel;
                                    return (
                                        <button key={t.id} type="button" aria-pressed={on} aria-label={t.title} onClick={() => { setSel(t.id); setMoved(true); }}
                                            className="relative rounded-t-[3px] text-[12px] font-semibold text-[#14131B] py-2 transition-transform"
                                            style={{ width: 44 + (i % 2) * 8, height: 118 + (i % 3) * 14, background: COLORS[shelf][i % 4], writingMode: 'vertical-rl', transform: on ? 'translateY(-12px)' : undefined }}>
                                            {t.short}
                                            {on && moved && <MiraSprite pose="sentada" className="absolute -left-[50px] bottom-full -mb-[15px] pointer-events-none" style={{ writingMode: 'horizontal-tb' }} />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </section>
                <section className="md:w-[340px] flex flex-col gap-4">
                    <div className="rounded-2xl bg-titanium-800 border border-titanium-700 p-6">
                        <div className="text-xs text-titanium-400">{L[tip.shelf]}</div>
                        <div className="font-serif text-xl text-titanium-100 mt-1 leading-snug">{tip.title}</div>
                        <p className="text-[15px] text-titanium-300 mt-2 leading-relaxed">{tip.text}</p>
                    </div>
                    <div className="rounded-2xl bg-titanium-800 border border-titanium-700 p-4">
                        <div className="font-semibold text-titanium-100 text-sm mb-2">{L.when}</div>
                        {([['tipsOnWake', L.o1], ['ritual', L.o2]] as const).map(([k, l]) => (
                            <button key={k} type="button" role="switch" aria-checked={prefs[k]} onClick={() => setPrefs(setMiraPrefs({ [k]: !prefs[k] }))} className="w-full flex items-center gap-3 min-h-[44px] text-left text-sm text-titanium-100">
                                <span className={`w-10 h-[22px] rounded-full relative shrink-0 ${prefs[k] ? 'bg-coral' : 'bg-titanium-600'}`}><span className={`absolute top-[3px] w-4 h-4 rounded-full bg-[#FFF4F4] ${prefs[k] ? 'left-[21px]' : 'left-[3px]'}`} /></span>
                                {l}
                            </button>
                        ))}
                    </div>
                    {!moved && <MiraSprite pose="leyendo" scale={2} className="self-end hidden md:block" label="Mira lee un tip" />}
                </section>
            </div>
        </div>
    );
}
