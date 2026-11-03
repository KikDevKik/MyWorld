import React, { useEffect, useState } from 'react';
import { getThemePref, setThemePref, ThemePref } from '../../utils/theme';
import { getMiraPrefs, setMiraPrefs, MiraPrefs } from '../mira/tips';
import { MiraSprite } from '../mira/MiraSprite';

// Nov 2026: Apariencia y Mira dentro de Configuración (antes solo estaban en la barra de estado y en un menú escondido).
const Switch: React.FC<{ on: boolean; onChange: () => void; label: string; hint?: string }> = ({ on, onChange, label, hint }) => (
    <button type="button" role="switch" aria-checked={on} onClick={onChange}
        className="w-full flex items-center justify-between gap-4 py-2 text-left">
        <span>
            <span className="block text-sm text-titanium-200">{label}</span>
            {hint && <span className="block text-xs text-titanium-400 mt-0.5">{hint}</span>}
        </span>
        <span className={`relative w-10 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-coral' : 'bg-titanium-700'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-titanium-50 transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
    </button>
);

export default function SettingsAppearance({ lang }: { lang: string }) {
    const es = lang !== 'en';
    const [theme, setTheme] = useState<ThemePref>(getThemePref());
    const [mira, setMira] = useState<MiraPrefs>(getMiraPrefs());
    useEffect(() => {
        const on = (e: Event) => setMira({ ...getMiraPrefs(), ...(e as CustomEvent).detail });
        window.addEventListener('mw-mira-prefs', on);
        return () => window.removeEventListener('mw-mira-prefs', on);
    }, []);
    const pick = (p: ThemePref) => { setTheme(p); setThemePref(p); };
    const toggle = (k: keyof MiraPrefs) => { const v = !mira[k]; setMira(m => ({ ...m, [k]: v })); setMiraPrefs({ [k]: v }); };
    const opts: { id: ThemePref; es: string; en: string; sw: string }[] = [
        { id: 'sistema', es: 'Como el sistema', en: 'Match system', sw: 'linear-gradient(135deg,#14131B 50%,#F6F1EC 50%)' },
        { id: 'noche', es: 'Noche', en: 'Night', sw: '#14131B' },
        { id: 'papel', es: 'Papel', en: 'Paper', sw: '#F6F1EC' },
    ];
    return (
        <>
            <section className="space-y-3">
                <h4 className="text-sm font-semibold text-titanium-100">{es ? 'Apariencia' : 'Appearance'}</h4>
                <div role="radiogroup" aria-label={es ? 'Tema' : 'Theme'} className="grid grid-cols-3 gap-2">
                    {opts.map(o => (
                        <button key={o.id} type="button" role="radio" aria-checked={theme === o.id} onClick={() => pick(o.id)}
                            className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${theme === o.id ? 'border-mira bg-mira-bg text-titanium-100' : 'border-titanium-700 text-titanium-300 hover:border-titanium-500'}`}>
                            <span className="w-5 h-5 rounded-full border border-titanium-500 shrink-0" style={{ background: o.sw }} aria-hidden="true" />
                            {es ? o.es : o.en}
                        </button>
                    ))}
                </div>
            </section>

            <div className="h-px bg-titanium-800 my-2" />

            <section className="space-y-1">
                <div className="flex items-center gap-3 mb-1">
                    <MiraSprite pose="contenta" face label="Mira" />
                    <div>
                        <h4 className="text-sm font-semibold text-titanium-100">Mira</h4>
                        <p className="text-xs text-titanium-400">{es ? 'Tu compañera en el escritorio.' : 'Your companion at the desk.'}</p>
                    </div>
                </div>
                <Switch on={mira.visible} onChange={() => toggle('visible')} label={es ? 'Mostrar a Mira en el escritorio' : 'Show Mira at the desk'} hint={es ? 'Se duerme si dejas de escribir y despierta cuando vuelves.' : 'She naps when you stop writing and wakes up when you return.'} />
                <Switch on={mira.tipsOnWake} onChange={() => toggle('tipsOnWake')} label={es ? 'Un tip al despertar' : 'A tip when she wakes'} hint={es ? 'Un globo pequeño que se va en cuanto sigues escribiendo.' : 'A small bubble that fades as soon as you keep writing.'} />
                <Switch on={mira.ritual} onChange={() => toggle('ritual')} label={es ? 'Ritual antes de escribir' : 'Ritual before writing'} hint={es ? 'Teléfono lejos, agua cerca y la meta del día.' : 'Phone away, water nearby and the goal for today.'} />
            </section>

            <div className="h-px bg-titanium-800 my-2" />
        </>
    );
}
