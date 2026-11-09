// Nov 2026: «Para ti». Lo que conviene reforzar, según lo que Mira y el Arquitecto notaron en tus conversaciones
// (o lo que tú quieres mejorar). Cada tema trae un punto de partida, una lección hecha para tu historia y una práctica.
import React, { useState } from 'react';
import { Loader2, Check, X, Plus, BookOpen, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { useCraftFocus, CraftFocus } from '../../hooks/useCraft';
import { Lesson } from './lessons';

const SOURCE: Record<string, string> = { mira: 'Lo notó Mira', arquitecto: 'Lo notó el Arquitecto', autor: 'Lo pediste tú', reporte: 'Salió en un reporte' };

export interface GeneratedLesson { titulo: string; resumen: string; bloques: { h: string; p: string }[]; ejemplos: { label: string; text: string }[]; practica: string }

export function toLesson(f: { id: string; tema: string }, g: GeneratedLesson): Lesson {
    return {
        id: `craft-${f.id}`, craftId: f.id, topic: 'sorpresa', hint: g.practica || `Practicar: ${f.tema}`,
        title: g.titulo || f.tema, summary: g.resumen,
        body: (g.bloques || []).map(b => ({ h: b.h, p: b.p })),
        example: (g.ejemplos || []).map(e => ({ label: e.label, text: e.text })),
    };
}

interface Props {
    onPractice: (hint: string) => void;
    onOpenLesson: (l: Lesson) => void;
    btnPrimary: string; btnSecondary: string; card: string; inputCls: string;
}

export default function ParaTi({ onPractice, onOpenLesson, btnPrimary, btnSecondary, card, inputCls }: Props) {
    const items = useCraftFocus();
    const [tema, setTema] = useState('');
    const [adding, setAdding] = useState(false);
    const [loading, setLoading] = useState<string | null>(null);

    const add = async () => {
        const t = tema.trim();
        if (t.length < 3) return;
        setAdding(true);
        try { await callFunction('miraTaller', { mode: 'craftAdd', tema: t }); setTema(''); toast.success('Anotado. Pídele la lección cuando quieras.'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo anotar.'); }
        finally { setAdding(false); }
    };

    const lesson = async (f: CraftFocus) => {
        if (f.leccion) { onOpenLesson(toLesson(f, f.leccion)); return; }
        setLoading(f.id);
        try {
            const r = await callFunction<{ lesson: GeneratedLesson }>('miraTaller', { mode: 'lesson', id: f.id });
            if (r?.lesson) onOpenLesson(toLesson(f, r.lesson));
        } catch (e: any) { toast.error(e?.message || 'Mira no pudo preparar la lección.'); }
        finally { setLoading(null); }
    };

    const setState = async (f: CraftFocus, estado: 'hecho' | null) => {
        try { await callFunction('miraTaller', { mode: 'craftState', id: f.id, ...(estado ? { estado } : { forget: true }) }); }
        catch { toast.error('No se pudo cambiar.'); }
    };

    return (
        <div className="flex flex-col gap-5">
            <p className="text-[15px] text-titanium-200 leading-relaxed">
                Lo que conviene reforzar en tu escritura. Aparece cuando Mira o el Arquitecto lo notan en lo que escribes, o cuando tú lo anotas. Cada tema trae por dónde empezar, una lección hecha para tu historia y una práctica.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="craft-add" className="sr-only">Algo que quieres mejorar</label>
                <input id="craft-add" value={tema} onChange={e => setTema(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
                    placeholder="Quiero mejorar en… (p. ej. tercera persona cercana)" className={inputCls} maxLength={80} />
                <button onClick={add} disabled={adding || tema.trim().length < 3} className={`${btnSecondary} shrink-0 justify-center`}>
                    {adding ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />} Anotar
                </button>
            </div>

            {items.length === 0 ? (
                <div className={`${card} text-[15px] text-titanium-300 leading-relaxed`}>
                    Todavía no hay nada anotado. Cuando hables con Mira o con el Arquitecto y noten algo que te cueste, te darán un punto de partida y lo verás aquí. También puedes anotarlo tú.
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {items.map(f => (
                        <li key={f.id} className={`${card} flex flex-col gap-2`}>
                            <div className="flex items-start gap-3">
                                <h2 className="flex-1 font-serif text-lg text-titanium-50 text-pretty">{f.tema}</h2>
                                <span className="text-xs text-titanium-400 shrink-0 mt-1.5">{SOURCE[f.source || ''] || ''}</span>
                            </div>
                            {f.porque && f.source !== 'autor' && <p className="text-[15px] text-titanium-300 leading-relaxed">{f.porque}</p>}
                            {f.paso && <p className="text-[15px] text-titanium-100 leading-relaxed"><span className="text-mira">Por dónde empezar: </span>{f.paso}</p>}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button onClick={() => lesson(f)} disabled={loading === f.id} className={btnPrimary}>
                                    {loading === f.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <BookOpen size={15} aria-hidden="true" />}
                                    {loading === f.id ? 'Mira prepara tu lección…' : f.leccion ? 'Leer la lección' : 'Una lección para mí'}
                                </button>
                                <button onClick={() => onPractice(`Practicar: ${f.tema}.${f.paso ? ` ${f.paso}` : ''}`)} className={btnSecondary}>
                                    <PenLine size={15} aria-hidden="true" /> Practicar esto
                                </button>
                                <span className="flex-1" />
                                <button onClick={() => setState(f, 'hecho')} className="inline-flex items-center gap-1 text-sm text-titanium-400 hover:text-logro px-2 py-1 rounded-lg" title="Ya lo tengo: sale de tus pendientes">
                                    <Check size={15} aria-hidden="true" /> Ya lo tengo
                                </button>
                                <button onClick={() => setState(f, null)} aria-label={`Quitar «${f.tema}»`} title="Quitar" className="p-1.5 text-titanium-500 hover:text-titanium-100 rounded-lg">
                                    <X size={15} aria-hidden="true" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
