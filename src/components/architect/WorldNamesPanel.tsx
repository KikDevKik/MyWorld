import React, { useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';

// Nov 2026: Nombres del mundo. Mira encuentra un concepto escrito con dos nombres (un renombre que quedó a
// medias, o una variante de escritura) y el autor elige cuál queda. Puede unificarlo en sus documentos o solo
// dejarlo decidido: la decisión llega al Arquitecto y a la memoria, así ninguna IA lo trata como dos cosas.

export interface VariantFile { fileId: string; fileName: string; count: number; sample: string }
export interface Variant { name: string; total: number; files: VariantFile[] }
export interface NameGroup { id: string; variants: Variant[]; suggested: string; reason: string; kind: 'renombre' | 'ortografia' }
export interface NameDecision { canonical: string; others: string[]; kind: 'mismo' | 'distintos'; at: string; applied?: number }
export interface NamesState { groups: NameGroup[]; decisions: NameDecision[]; checkedAt?: string; noIndex?: boolean }
interface PreviewFile { fileId: string; fileName: string; count: number; links: number; googleDoc: boolean; samples: string[] }

export const DOCS_CHANGED_EVENT = 'mw-docs-changed';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const docsOf = (v: Variant) => plural(v.files.length, 'documento', 'documentos');

/** Muestra el fragmento con la palabra marcada (el servidor la envuelve en ⟦ ⟧). */
function Sample({ text, replaceWith }: { text: string; replaceWith?: string }) {
    const m = text.match(/^(.*?)⟦(.*?)⟧(.*)$/s);
    if (!m) return <span>{text}</span>;
    return (
        <span>
            {m[1]}
            {replaceWith
                ? <><del className="text-red-300/90 decoration-red-300/70">{m[2]}</del> <ins className="no-underline text-logro">{replaceWith}</ins></>
                : <mark className="bg-mira/20 text-titanium-50 rounded px-0.5">{m[2]}</mark>}
            {m[3]}
        </span>
    );
}

function timeAgo(iso?: string) {
    if (!iso) return '';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 2) return 'hace un momento';
    if (min < 60) return `hace ${min} minutos`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${plural(h, 'hora', 'horas')}`;
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long' });
}

export async function scanWorldNames(): Promise<NamesState | null> {
    return await callFunction<NamesState>('worldNames', { mode: 'scan' });
}

export default function WorldNamesPanel({ accessToken, initialState, onStateChange }: {
    accessToken: string | null;
    initialState?: NamesState | null;
    onStateChange?: (s: NamesState) => void;
}) {
    const [state, setState] = useState<NamesState | null>(initialState || null);
    const [scanning, setScanning] = useState(false);
    const [choice, setChoice] = useState<Record<string, string>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ groupId: string; canonical: string; files: PreviewFile[]; picked: Set<string> } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [showDecided, setShowDecided] = useState(false);

    const update = (s: NamesState | null) => { if (!s) return; setState(s); onStateChange?.(s); };

    useEffect(() => {
        if (initialState) return;
        callFunction<NamesState>('worldNames', { mode: 'get' }).then(update).catch(() => { /* se muestra vacío */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scan = async () => {
        setScanning(true);
        try {
            const s = await scanWorldNames();
            update(s);
            if (s?.noIndex) toast.info('Primero hay que indexar tu proyecto para que Mira pueda leerlo.');
            else if (s && !s.groups.length) toast.success('Mira no encontró conceptos con dos nombres.');
        } catch (e: any) {
            toast.error(e?.message || 'Mira no pudo revisar los nombres.');
        } finally { setScanning(false); }
    };

    const act = async (g: NameGroup, mode: 'decide' | 'distinct' | 'preview') => {
        const canonical = choice[g.id] || g.suggested;
        setBusy(`${g.id}:${mode}`);
        try {
            if (mode === 'preview') {
                if (!accessToken) { toast.error('Reconecta Google Drive para revisar tus documentos.'); return; }
                const r = await callFunction<{ files: PreviewFile[] }>('worldNames', { mode: 'preview', groupId: g.id, canonical, accessToken });
                const files = r?.files || [];
                if (!files.some(f => f.count > 0)) {
                    toast.info(`Tus documentos ya dicen «${canonical}». Lo dejo decidido.`);
                    update(await callFunction<NamesState>('worldNames', { mode: 'decide', groupId: g.id, canonical }));
                    return;
                }
                setPreview({ groupId: g.id, canonical, files, picked: new Set(files.filter(f => f.count > 0 && !f.googleDoc).map(f => f.fileId)) });
                return;
            }
            const s = await callFunction<NamesState>('worldNames', { mode, groupId: g.id, canonical });
            update(s);
            toast.success(mode === 'distinct' ? 'Anotado: son conceptos distintos.' : `Anotado: se usa «${canonical}». El Arquitecto lo sabrá.`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar.');
        } finally { setBusy(null); }
    };

    const apply = async () => {
        if (!preview) return;
        setBusy('apply');
        try {
            const r = await callFunction<NamesState & { changed: { fileId: string; fileName: string; count: number }[]; skipped: string[] }>('worldNames', {
                mode: 'apply', groupId: preview.groupId, canonical: preview.canonical, fileIds: [...preview.picked], accessToken,
            });
            if (!r) return;
            update(r);
            const total = r.changed.reduce((a, c) => a + c.count, 0);
            toast.success(`Listo: ${plural(total, 'cambio', 'cambios')} en ${plural(r.changed.length, 'documento', 'documentos')}.`, {
                description: r.skipped.length ? `No pude cambiar: ${r.skipped.join(', ')}.` : 'Drive guarda la versión anterior de cada archivo.',
            });
            window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT, { detail: { fileIds: r.changed.map(c => c.fileId) } }));
            setPreview(null);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron cambiar los documentos.');
        } finally { setBusy(null); }
    };

    const forget = async (index: number) => {
        try { update(await callFunction<NamesState>('worldNames', { mode: 'forget', index })); } catch { toast.error('No se pudo olvidar.'); }
    };

    // ── Vista previa de los cambios ──
    if (preview) {
        const pickedCount = preview.files.filter(f => preview.picked.has(f.fileId)).reduce((a, f) => a + f.count, 0);
        return (
            <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="max-w-[760px] mx-auto px-6 py-6 flex flex-col gap-5">
                    <div>
                        <h3 className="font-serif text-xl text-titanium-100">Cambiar a «{preview.canonical}»</h3>
                        <p className="text-sm text-titanium-300 mt-1">Revisa los documentos antes de cambiarlos. Drive guarda la versión anterior de cada archivo, así que puedes recuperarla.</p>
                    </div>
                    <ul className="flex flex-col gap-3">
                        {preview.files.map(f => {
                            const disabled = f.googleDoc || f.count === 0;
                            const checked = preview.picked.has(f.fileId);
                            return (
                                <li key={f.fileId} className="rounded-xl border border-titanium-700 bg-titanium-900 px-4 py-3">
                                    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                                        <input type="checkbox" className="mt-1 accent-[var(--color-coral)] w-4 h-4" disabled={disabled} checked={checked && !disabled}
                                            onChange={() => setPreview(p => { if (!p) return p; const n = new Set(p.picked); if (n.has(f.fileId)) n.delete(f.fileId); else n.add(f.fileId); return { ...p, picked: n }; })} />
                                        <span className="min-w-0 flex-1">
                                            <span className="text-[15px] text-titanium-100">{f.fileName}</span>
                                            <span className="text-sm text-titanium-400"> · {plural(f.count, 'cambio', 'cambios')}</span>
                                            {f.googleDoc && <span className="block text-sm text-amber-200 mt-1">Es un Google Doc: cámbialo a mano.</span>}
                                            {f.links > 0 && <span className="block text-sm text-titanium-400 mt-1">Tiene {plural(f.links, 'enlace', 'enlaces')} [[ ]] con el nombre viejo: no los toco, porque apuntan a un archivo. Renombra ese archivo en Obsidian o en Drive.</span>}
                                            {f.samples.map((s, i) => <span key={i} className="block font-serif text-[15px] text-titanium-300 mt-2 leading-relaxed"><Sample text={s} replaceWith={preview.canonical} /></span>)}
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-titanium-300 hover:text-titanium-100 rounded-lg">Volver</button>
                        <button onClick={apply} disabled={!preview.picked.size || busy === 'apply'}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                            {busy === 'apply' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                            Hacer {plural(pickedCount, 'cambio', 'cambios')} en {plural(preview.picked.size, 'documento', 'documentos')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const groups = state?.groups || [];
    return (
        <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="max-w-[760px] mx-auto px-6 py-6 flex flex-col gap-6">
                <div className="flex items-start gap-4">
                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-titanium-200 leading-relaxed">
                            Busco conceptos que se llaman distinto según el documento: un nombre que cambiaste y quedó a medias, o una forma distinta de escribirlo. Si los unificas antes de hablar con el Arquitecto, no los confundirá.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            <button onClick={scan} disabled={scanning}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                {scanning && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                {scanning ? 'Leyendo tus documentos…' : state?.checkedAt ? 'Revisar otra vez' : 'Revisar mis documentos'}
                            </button>
                            {state?.checkedAt && !scanning && <span className="text-sm text-titanium-400">Última revisión: {timeAgo(state.checkedAt)}</span>}
                        </div>
                    </div>
                </div>

                {state?.checkedAt && groups.length === 0 && (
                    <p className="text-[15px] text-titanium-300">No encontré conceptos con dos nombres.</p>
                )}

                <ul className="flex flex-col gap-4">
                    {groups.map(g => {
                        const canonical = choice[g.id] || g.suggested;
                        const isOpen = expanded === g.id;
                        return (
                            <li key={g.id} className="rounded-2xl border border-titanium-700 bg-titanium-900 px-5 py-4">
                                <h3 className="font-serif text-lg text-titanium-100 text-pretty">
                                    {g.variants.map(v => `«${v.name}»`).join(' y ')}
                                </h3>
                                <p className="text-sm text-titanium-400 mt-0.5">{g.kind === 'ortografia' ? 'Se escribe de dos formas' : 'Parece un cambio de nombre a medias'}</p>
                                {g.reason && <p className="text-[15px] text-titanium-200 mt-2 leading-relaxed">{g.reason}</p>}

                                <fieldset className="mt-3">
                                    <legend className="text-sm text-titanium-300 mb-2">¿Cuál nombre queda?</legend>
                                    <div className="flex flex-col gap-2">
                                        {g.variants.map(v => (
                                            <label key={v.name} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${canonical === v.name ? 'border-mira/60 bg-mira/10' : 'border-titanium-700 hover:border-titanium-500'}`}>
                                                <input type="radio" name={`nombre-${g.id}`} className="accent-[var(--color-mira)] w-4 h-4" checked={canonical === v.name} onChange={() => setChoice(c => ({ ...c, [g.id]: v.name }))} />
                                                <span className="text-[15px] text-titanium-100">{v.name}</span>
                                                <span className="text-sm text-titanium-400 ml-auto tabular-nums">{plural(v.total, 'vez', 'veces')} en {docsOf(v)}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>

                                <button onClick={() => setExpanded(isOpen ? null : g.id)} aria-expanded={isOpen}
                                    className="mt-3 inline-flex items-center gap-1 text-sm text-mira hover:text-titanium-50">
                                    {isOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />} {isOpen ? 'Ocultar dónde aparece' : 'Ver dónde aparece'}
                                </button>
                                {isOpen && (
                                    <div className="mt-3 flex flex-col gap-3">
                                        {g.variants.map(v => (
                                            <div key={v.name}>
                                                <p className="text-sm text-titanium-300 mb-1.5">«{v.name}»</p>
                                                <ul className="flex flex-col gap-1.5">
                                                    {v.files.slice(0, 8).map(f => (
                                                        <li key={f.fileId} className="text-sm text-titanium-400 leading-relaxed">
                                                            <span className="text-titanium-200">{f.fileName}</span> · {f.count} — <span className="font-serif text-titanium-300"><Sample text={f.sample} /></span>
                                                        </li>
                                                    ))}
                                                    {v.files.length > 8 && <li className="text-sm text-titanium-500">y {plural(v.files.length - 8, 'documento más', 'documentos más')}</li>}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 mt-4">
                                    <button onClick={() => act(g, 'preview')} disabled={!!busy}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                        {busy === `${g.id}:preview` && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                        Unificar en mis documentos
                                    </button>
                                    <button onClick={() => act(g, 'decide')} disabled={!!busy} title="No cambia tus documentos: la IA sabrá que son lo mismo"
                                        className="px-4 py-2 text-sm text-titanium-100 rounded-lg border border-titanium-700 hover:border-titanium-500 disabled:opacity-50">
                                        Solo dejarlo decidido
                                    </button>
                                    <button onClick={() => act(g, 'distinct')} disabled={!!busy}
                                        className="px-3 py-2 text-sm text-titanium-400 hover:text-titanium-100 rounded-lg disabled:opacity-50">
                                        Son cosas distintas
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>

                {(state?.decisions?.length || 0) > 0 && (
                    <div className="border-t border-titanium-800 pt-4">
                        <button onClick={() => setShowDecided(v => !v)} aria-expanded={showDecided} className="inline-flex items-center gap-1 text-sm text-titanium-300 hover:text-titanium-100">
                            {showDecided ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />} Lo que ya decidiste ({state!.decisions.length})
                        </button>
                        {showDecided && (
                            <ul className="mt-3 flex flex-col gap-2">
                                {state!.decisions.map((d, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-titanium-300">
                                        <span className="flex-1 leading-relaxed">
                                            {d.kind === 'distintos'
                                                ? <>«{d.canonical}» y {d.others.map(o => `«${o}»`).join(', ')} son cosas distintas.</>
                                                : <>Se usa «{d.canonical}» en vez de {d.others.map(o => `«${o}»`).join(', ')}{d.applied ? ` (${plural(d.applied, 'cambio', 'cambios')} en tus documentos)` : ''}.</>}
                                        </span>
                                        <button onClick={() => forget(i)} className="text-titanium-500 hover:text-titanium-200 shrink-0">Olvidar</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
