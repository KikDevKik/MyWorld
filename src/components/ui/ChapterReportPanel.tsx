// Oct 2026: Reporte de capítulo — panel lateral del editor.
// Pide a Claude un reporte del capítulo abierto; cada punto trae la cita exacta para ubicarlo
// ("Ir"), la ortografía se puede corregir con un clic y los puntos se marcan como hechos.
import React, { useEffect, useMemo, useState } from 'react';
import { X, FileSearch, Loader2, LocateFixed, Check, RefreshCw, BookOpen, Sparkles, AlertTriangle, SpellCheck } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { textHash } from '../../utils/textHash';
import { locateQuote } from '../../utils/locateQuote';

interface Strength { titulo: string; explicacion: string; cita?: string }
interface Problem { tipo: string; gravedad: 'alta' | 'media' | 'baja'; titulo: string; explicacion: string; sugerencia: string; citas?: string[] }
interface Spelling { original: string; correccion: string; cita?: string; nota?: string }
interface Reading { titulo: string; autor: string; deSusReferencias?: boolean; porque: string }
interface Report { resumen: string; fortalezas: Strength[]; problemas: Problem[]; ortografia: Spelling[]; lecturas: Reading[]; siguientePaso?: string }

interface Props {
    fileId: string;
    fileName: string;
    getText: () => string;
    reveal: (from: number, to: number) => void;
    replace: (from: number, to: number, text: string) => void;
    onClose: () => void;
}

const GRAVEDAD: Record<string, string> = {
    alta: 'bg-red-500/15 text-red-300 border-red-500/30',
    media: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    baja: 'bg-titanium-700/40 text-titanium-300 border-titanium-600/40',
};

export default function ChapterReportPanel({ fileId, fileName, getText, reveal, replace, onClose }: Props) {
    const [report, setReport] = useState<Report | null>(null);
    const [meta, setMeta] = useState<{ createdAt?: string; contentHash?: string }>({});
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const doneKey = `myworld_report_done_${fileId}`;
    const [done, setDone] = useState<Record<string, boolean>>(() => {
        try { return JSON.parse(localStorage.getItem(doneKey) || '{}'); } catch { return {}; }
    });

    useEffect(() => {
        let alive = true;
        setLoading(true);
        callFunction<any>('chapterReport', { mode: 'get', fileId })
            .then(r => { if (alive && r?.found) { setReport(r.report); setMeta({ createdAt: r.createdAt, contentHash: r.contentHash }); } })
            .catch(() => {})
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [fileId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const toggleDone = (k: string) => {
        setDone(prev => {
            const next = { ...prev, [k]: !prev[k] };
            try { localStorage.setItem(doneKey, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
            return next;
        });
    };

    const generate = async () => {
        const text = getText();
        if (text.trim().length < 300) { toast.warning('El capítulo es muy corto para un reporte.'); return; }
        setGenerating(true);
        try {
            const r = await callFunction<any>('chapterReport', { mode: 'generate', fileId, fileName, content: text }, { timeout: 300000 });
            if (!r) throw new Error('Sin respuesta del servidor.');
            setReport(r.report);
            setMeta({ createdAt: r.createdAt, contentHash: r.contentHash });
            setDone({});
            try { localStorage.removeItem(doneKey); } catch { /* sin almacenamiento */ }
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo generar el reporte.');
        } finally {
            setGenerating(false);
        }
    };

    const goTo = (quote?: string) => {
        if (!quote) { toast.info('Este punto no trae una cita para ubicarlo.'); return; }
        const pos = locateQuote(getText(), quote);
        if (!pos) { toast.warning('No encontré ese pasaje: puede que ya lo hayas cambiado.'); return; }
        reveal(pos.from, pos.to);
    };

    const fix = (s: Spelling, k: string) => {
        const text = getText();
        const area = s.cita ? locateQuote(text, s.cita) : null;
        let pos: { from: number; to: number } | null = null;
        if (area) {
            const inner = text.slice(area.from, area.to).indexOf(s.original);
            if (inner >= 0) pos = { from: area.from + inner, to: area.from + inner + s.original.length };
        }
        if (!pos) {
            const first = text.indexOf(s.original);
            if (first >= 0 && text.indexOf(s.original, first + 1) < 0) pos = { from: first, to: first + s.original.length };
        }
        if (!pos) { toast.warning(`No pude ubicar «${s.original}» con seguridad. Usa «Ir» y corrígelo a mano.`); return; }
        replace(pos.from, pos.to, s.correccion);
        if (!done[k]) toggleDone(k);
    };

    const stale = useMemo(() => !!(meta.contentHash && report && textHash(getText()) !== meta.contentHash), [meta.contentHash, report, getText]);
    const fecha = meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '';

    const Item = ({ k, children }: { k: string; children: React.ReactNode }) => (
        <div className={`rounded-lg border border-titanium-800 bg-titanium-950/60 p-3 transition-opacity ${done[k] ? 'opacity-45' : ''}`}>
            <div className="flex gap-2">
                <button onClick={() => toggleDone(k)} className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${done[k] ? 'bg-emerald-600 border-emerald-600' : 'border-titanium-600'}`} aria-label="Marcar como hecho">
                    {done[k] && <Check size={11} className="text-white" />}
                </button>
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );

    const GoBtn = ({ quote }: { quote?: string }) => (
        <button onClick={() => goTo(quote)} disabled={!quote} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-900/30 disabled:opacity-30" title="Ir al pasaje en el editor">
            <LocateFixed size={11} /> Ir
        </button>
    );

    return (
        <div className="fixed right-0 top-0 bottom-0 z-[150] w-[440px] max-w-[96vw] bg-titanium-900 border-l border-titanium-700 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-titanium-800">
                <div className="flex items-center gap-2 min-w-0">
                    <FileSearch size={16} className="text-purple-400 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-titanium-100">Reporte del capítulo</p>
                        <p className="text-[11px] text-titanium-500 truncate">{fileName}{fecha ? ` · ${fecha}` : ''}</p>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    {report && (
                        <button onClick={generate} disabled={generating} className="p-1.5 rounded text-titanium-400 hover:text-titanium-100 hover:bg-titanium-800 disabled:opacity-40" title="Generar de nuevo">
                            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} />
                        </button>
                    )}
                    <button onClick={onClose} className="p-1.5 rounded text-titanium-500 hover:text-titanium-200" aria-label="Cerrar"><X size={16} /></button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-xs text-titanium-300 leading-relaxed">
                {loading ? (
                    <div className="flex items-center gap-2 text-titanium-500"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
                ) : generating ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-center text-titanium-400">
                        <Loader2 size={22} className="animate-spin text-purple-400" />
                        <p>Leyendo el capítulo completo…<br /><span className="text-titanium-600">Tarda entre 30 segundos y 2 minutos.</span></p>
                    </div>
                ) : !report ? (
                    <div className="py-10 text-center space-y-3">
                        <p className="text-titanium-300">Cuando termines un capítulo, pide un reporte: qué funciona, qué corregir y dónde está cada cosa en tu texto, ortografía con corrección de un clic y lecturas apoyadas en tus referencias.</p>
                        <p className="text-titanium-600">Usa Claude · cuesta alrededor de US$0,10 por reporte.</p>
                        <button onClick={generate} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-purple-700/80 hover:bg-purple-600 px-4 py-2 text-xs font-medium text-white">
                            <Sparkles size={13} /> Generar reporte
                        </button>
                    </div>
                ) : (
                    <>
                        {stale && (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-900/10 p-2.5 text-amber-200/90">
                                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                <span>El texto cambió desde este reporte. Algunos «Ir» pueden no encontrar el pasaje. <button onClick={generate} className="underline">Generar de nuevo</button></span>
                            </div>
                        )}
                        <section>
                            <p className="text-titanium-100 text-[13px] leading-relaxed">{report.resumen}</p>
                            {report.siguientePaso && <p className="mt-2 text-purple-300"><b>Primer paso:</b> {report.siguientePaso}</p>}
                        </section>

                        {!!report.problemas?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Qué corregir ({report.problemas.length})</h3>
                                {report.problemas.map((p, i) => (
                                    <Item key={`p${i}`} k={`p${i}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={`rounded border px-1.5 py-px text-[10px] ${GRAVEDAD[p.gravedad] || GRAVEDAD.baja}`}>{p.gravedad}</span>
                                            <span className="text-[10px] text-titanium-500">{p.tipo}</span>
                                        </div>
                                        <p className="mt-1 font-medium text-titanium-100">{p.titulo}</p>
                                        <p className="mt-1">{p.explicacion}</p>
                                        <p className="mt-1 text-emerald-300/90"><b>Qué hacer:</b> {p.sugerencia}</p>
                                        {(p.citas || []).filter(Boolean).map((c, j) => (
                                            <div key={j} className="mt-1.5 flex items-start gap-1.5">
                                                <span className="flex-1 border-l-2 border-titanium-700 pl-2 italic text-titanium-400">«{c}»</span>
                                                <GoBtn quote={c} />
                                            </div>
                                        ))}
                                    </Item>
                                ))}
                            </section>
                        )}

                        {!!report.ortografia?.length && (
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><SpellCheck size={12} /> Ortografía y puntuación ({report.ortografia.length})</h3>
                                {report.ortografia.map((s, i) => (
                                    <Item key={`o${i}`} k={`o${i}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-red-300 line-through">{s.original}</span>
                                            <span className="text-titanium-600">→</span>
                                            <span className="text-emerald-300">{s.correccion}</span>
                                            <span className="ml-auto flex gap-1">
                                                <GoBtn quote={s.cita || s.original} />
                                                <button onClick={() => fix(s, `o${i}`)} disabled={!!done[`o${i}`]} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-30">
                                                    <Check size={11} /> Corregir
                                                </button>
                                            </span>
                                        </div>
                                        {s.nota && <p className="mt-1 text-titanium-500">{s.nota}</p>}
                                    </Item>
                                ))}
                            </section>
                        )}

                        {!!report.fortalezas?.length && (
                            <section className="space-y-2">
                                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-titanium-500">Lo que funciona</h3>
                                {report.fortalezas.map((f, i) => (
                                    <div key={i} className="rounded-lg border border-titanium-800 bg-titanium-950/40 p-3">
                                        <div className="flex items-start gap-2">
                                            <p className="flex-1 font-medium text-titanium-100">{f.titulo}</p>
                                            <GoBtn quote={f.cita} />
                                        </div>
                                        <p className="mt-1">{f.explicacion}</p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {!!report.lecturas?.length && (
                            <section className="space-y-2">
                                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-titanium-500"><BookOpen size={12} /> Para leer</h3>
                                {report.lecturas.map((l, i) => (
                                    <div key={i} className="rounded-lg border border-titanium-800 bg-titanium-950/40 p-3">
                                        <p className="text-titanium-100"><b>{l.titulo}</b> — {l.autor}
                                            {l.deSusReferencias && <span className="ml-2 rounded bg-purple-900/40 px-1.5 py-px text-[10px] text-purple-300">de tus referencias</span>}
                                        </p>
                                        <p className="mt-1">{l.porque}</p>
                                    </div>
                                ))}
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
