import React, { useEffect, useState } from 'react';
import { Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';

// Nov 2026: Revisión del canon con Mira. Tres pestañas:
//  · Nombres: un concepto escrito con dos nombres (incluye títulos de documentos).
//  · Documentos repetidos: copias casi iguales y dos fichas del mismo tema.
//  · Cambiar un nombre: renombrar algo a mano en todo el canon.
// Las decisiones llegan al Arquitecto y a la memoria, así ninguna IA lo trata como dos cosas.

export interface VariantFile { fileId: string; fileName: string; count: number; sample: string }
export interface Variant { name: string; total: number; files: VariantFile[]; titles?: { fileId: string; fileName: string }[] }
export interface NameGroup { id: string; variants: Variant[]; suggested: string; reason: string; kind: 'renombre' | 'ortografia' | 'manual' }
export interface NameDecision { canonical: string; others: string[]; kind: 'mismo' | 'distintos'; at: string; applied?: number }
export interface DocInfo { fileId: string; name: string; folder: string; words: number; reach: number; modifiedTime?: string; uniqueWords: number; uniqueSample: string }
export interface DocPair { id: string; kind: 'copia' | 'mismo_tema'; overlap: number; a: DocInfo; b: DocInfo }
export interface NamesState { groups: NameGroup[]; decisions: NameDecision[]; docs?: DocPair[]; docDecisions?: any[]; checkedAt?: string; noIndex?: boolean }
interface PreviewFile { fileId: string; fileName: string; count: number; links: number; googleDoc: boolean; samples: string[] }
interface Renameable { fileId: string; fileName: string; newName: string }

export const DOCS_CHANGED_EVENT = 'mw-docs-changed';
export const NAMES_CHANGED_EVENT = 'mw-names-changed';
export const reviewCount = (s?: NamesState | null) => (s?.groups?.length || 0) + (s?.docs?.length || 0);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es')} ${n === 1 ? one : many}`;
const docsOf = (v: Variant) => plural(v.files.length, 'documento', 'documentos');
const stem = (n: string) => n.replace(/\.(md|txt|markdown)$/i, '');
const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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

export async function scanWorldNames(accessToken?: string | null): Promise<NamesState | null> {
    return await callFunction<NamesState>('worldNames', { mode: 'scan', accessToken: accessToken || undefined });
}

const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60';
const btnSecondary = 'inline-flex items-center gap-2 px-4 py-2 text-sm text-titanium-100 rounded-lg border border-titanium-700 hover:border-titanium-500 disabled:opacity-50';
const btnGhost = 'px-3 py-2 text-sm text-titanium-400 hover:text-titanium-100 rounded-lg disabled:opacity-50';

type Tab = 'nombres' | 'documentos' | 'cambiar';

export default function WorldNamesPanel({ accessToken, initialState, onStateChange, onOpenDocument, initialTab }: {
    accessToken: string | null;
    initialState?: NamesState | null;
    onStateChange?: (s: NamesState) => void;
    onOpenDocument?: (fileId: string, quote: string) => void;
    initialTab?: Tab;
}) {
    const [state, setState] = useState<NamesState | null>(initialState || null);
    const [tab, setTab] = useState<Tab>(initialTab || ((initialState?.groups?.length || 0) === 0 && (initialState?.docs?.length || 0) > 0 ? 'documentos' : 'nombres'));
    const [scanning, setScanning] = useState(false);
    const [choice, setChoice] = useState<Record<string, string>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ groupId: string; canonical: string; files: PreviewFile[]; picked: Set<string>; renameable: Renameable[]; rename: Set<string>; canonicalFileExists: boolean } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [showDecided, setShowDecided] = useState(false);
    const [confirmKeep, setConfirmKeep] = useState<{ pairId: string; keep: DocInfo; drop: DocInfo } | null>(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const update = (s: NamesState | null) => {
        if (!s) return;
        setState(s); onStateChange?.(s);
        window.dispatchEvent(new CustomEvent(NAMES_CHANGED_EVENT, { detail: s }));
    };

    useEffect(() => {
        if (initialState) return;
        callFunction<NamesState>('worldNames', { mode: 'get' }).then(update).catch(() => { /* se muestra vacío */ });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scan = async () => {
        setScanning(true);
        try {
            const s = await scanWorldNames(accessToken);
            update(s);
            if (s?.noIndex) toast.info('Primero hay que indexar tu proyecto para que Mira pueda leerlo.');
            else if (s && !reviewCount(s)) toast.success('Mira no encontró nombres ni documentos repetidos.');
        } catch (e: any) {
            toast.error(e?.message || 'Mira no pudo revisar tu canon.');
        } finally { setScanning(false); }
    };

    const openPreview = async (groupId: string, canonical: string) => {
        if (!accessToken) { toast.error('Reconecta Google Drive para revisar tus documentos.'); return; }
        const r = await callFunction<{ files: PreviewFile[]; renameable: Renameable[]; canonicalFileExists: boolean }>('worldNames', { mode: 'preview', groupId, canonical, accessToken });
        const files = r?.files || [];
        const renameable = r?.renameable || [];
        if (!files.some(f => f.count > 0 || f.links > 0) && !renameable.length) {
            toast.info(`Tus documentos ya dicen «${canonical}». Lo dejo decidido.`);
            update(await callFunction<NamesState>('worldNames', { mode: 'decide', groupId, canonical }));
            return;
        }
        setPreview({
            groupId, canonical, files, renameable, canonicalFileExists: !!r?.canonicalFileExists,
            picked: new Set(files.filter(f => (f.count > 0 || f.links > 0) && !f.googleDoc).map(f => f.fileId)),
            rename: new Set(r?.canonicalFileExists ? [] : renameable.map(x => x.fileId)),
        });
    };

    const act = async (g: NameGroup, mode: 'decide' | 'distinct' | 'preview' | 'dismissManual') => {
        const canonical = choice[g.id] || g.suggested;
        setBusy(`${g.id}:${mode}`);
        try {
            if (mode === 'preview') { await openPreview(g.id, canonical); return; }
            const s = await callFunction<NamesState>('worldNames', { mode, groupId: g.id, canonical });
            update(s);
            if (mode === 'distinct') toast.success('Anotado: son conceptos distintos.');
            else if (mode === 'decide') toast.success(`Anotado: se usa «${canonical}». El Arquitecto lo sabrá.`);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar.');
        } finally { setBusy(null); }
    };

    const apply = async () => {
        if (!preview) return;
        setBusy('apply');
        try {
            const r = await callFunction<NamesState & { changed: { fileId: string; fileName: string; count: number }[]; skipped: string[]; renamed: string[] }>('worldNames', {
                mode: 'apply', groupId: preview.groupId, canonical: preview.canonical, fileIds: [...preview.picked], renameFileIds: [...preview.rename], accessToken,
            });
            if (!r) return;
            update(r);
            const total = r.changed.reduce((a, c) => a + c.count, 0);
            toast.success(`Listo: ${plural(total, 'cambio', 'cambios')} en ${plural(r.changed.length, 'documento', 'documentos')}${r.renamed?.length ? ` y ${plural(r.renamed.length, 'documento renombrado', 'documentos renombrados')}` : ''}.`, {
                description: r.skipped.length ? `No pude cambiar: ${r.skipped.join(', ')}.` : 'Drive guarda la versión anterior de cada archivo.',
            });
            window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT, { detail: { fileIds: r.changed.map(c => c.fileId), renamed: (r.renamed || []).length > 0 } }));
            setPreview(null);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudieron cambiar los documentos.');
        } finally { setBusy(null); }
    };

    const forget = async (index: number) => {
        try { update(await callFunction<NamesState>('worldNames', { mode: 'forget', index })); } catch { toast.error('No se pudo olvidar.'); }
    };

    const docDistinct = async (pairId: string) => {
        setBusy(`${pairId}:distinct`);
        try { update(await callFunction<NamesState>('worldNames', { mode: 'docDistinct', pairId })); toast.success('Anotado: son documentos distintos.'); }
        catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setBusy(null); }
    };
    const docKeep = async () => {
        if (!confirmKeep) return;
        setBusy('keep');
        try {
            const r = await callFunction<NamesState & { trashed?: string }>('worldNames', { mode: 'docKeep', pairId: confirmKeep.pairId, keepId: confirmKeep.keep.fileId, accessToken });
            update(r);
            toast.success(`«${stem(confirmKeep.drop.name)}» está en la papelera de Drive.`, { description: 'Puedes recuperarlo desde Drive durante 30 días.' });
            window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT, { detail: { fileIds: [confirmKeep.drop.fileId], trashed: true } }));
            setConfirmKeep(null);
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo mover el documento.');
        } finally { setBusy(null); }
    };

    const startManual = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!from.trim() || !to.trim()) return;
        setBusy('manual');
        try {
            const r = await callFunction<NamesState & { groupId: string }>('worldNames', { mode: 'manual', from: from.trim(), to: to.trim() });
            if (!r) return;
            update(r);
            await openPreview(r.groupId, to.trim());
        } catch (err: any) {
            toast.error(err?.message || 'No se pudo buscar ese nombre.');
        } finally { setBusy(null); }
    };

    // ── Vista previa de los cambios de nombre ──
    if (preview) {
        const pickedCount = preview.files.filter(f => preview.picked.has(f.fileId)).reduce((a, f) => a + f.count, 0);
        const retarget = preview.canonicalFileExists || preview.rename.size > 0;
        const totalDocs = preview.picked.size + [...preview.rename].filter(id => !preview.picked.has(id)).length;
        return (
            <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
                <div className="max-w-[760px] mx-auto px-6 py-6 flex flex-col gap-5">
                    <div>
                        <h3 className="font-serif text-xl text-titanium-100">Cambiar a «{preview.canonical}»</h3>
                        <p className="text-sm text-titanium-300 mt-1">Revisa los documentos antes de cambiarlos. Drive guarda la versión anterior de cada archivo, así que puedes recuperarla.</p>
                    </div>

                    {preview.renameable.length > 0 && (
                        <div className="rounded-xl border border-mira/30 bg-mira/10 px-4 py-3 flex flex-col gap-2">
                            {preview.renameable.map(r => (
                                <label key={r.fileId} className="flex items-start gap-3 cursor-pointer">
                                    <input type="checkbox" className="mt-1 accent-[var(--color-coral)] w-4 h-4" disabled={preview.canonicalFileExists}
                                        checked={preview.rename.has(r.fileId)}
                                        onChange={() => setPreview(p => { if (!p) return p; const n = new Set(p.rename); if (n.has(r.fileId)) n.delete(r.fileId); else n.add(r.fileId); return { ...p, rename: n }; })} />
                                    <span className="text-[15px] text-titanium-100">
                                        Renombrar también el documento «{r.fileName}» a «{r.newName}»
                                        {preview.canonicalFileExists && <span className="block text-sm text-amber-200 mt-1">Ya existe un documento llamado «{preview.canonical}»: decide tú cuál se queda.</span>}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}

                    <ul className="flex flex-col gap-3">
                        {preview.files.map(f => {
                            const disabled = f.googleDoc || (f.count === 0 && !(f.links > 0 && retarget));
                            const checked = preview.picked.has(f.fileId);
                            return (
                                <li key={f.fileId} className="rounded-xl border border-titanium-700 bg-titanium-900 px-4 py-3">
                                    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
                                        <input type="checkbox" className="mt-1 accent-[var(--color-coral)] w-4 h-4" disabled={disabled} checked={checked && !disabled}
                                            onChange={() => setPreview(p => { if (!p) return p; const n = new Set(p.picked); if (n.has(f.fileId)) n.delete(f.fileId); else n.add(f.fileId); return { ...p, picked: n }; })} />
                                        <span className="min-w-0 flex-1">
                                            <span className="text-[15px] text-titanium-100">{f.fileName}</span>
                                            <span className="text-sm text-titanium-400"> · {plural(f.count, 'cambio', 'cambios')}{f.links ? ` · ${plural(f.links, 'enlace', 'enlaces')}` : ''}</span>
                                            {f.googleDoc && <span className="block text-sm text-amber-200 mt-1">Es un Google Doc: cámbialo a mano.</span>}
                                            {f.links > 0 && (retarget
                                                ? <span className="block text-sm text-titanium-300 mt-1">Sus enlaces [[ ]] también pasan a [[{preview.canonical}]].</span>
                                                : <span className="block text-sm text-titanium-400 mt-1">Tiene {plural(f.links, 'enlace', 'enlaces')} [[ ]] con el nombre viejo: no los toco porque apuntan a un documento que se sigue llamando así.</span>)}
                                            {f.samples.map((s, i) => <span key={i} className="block font-serif text-[15px] text-titanium-300 mt-2 leading-relaxed"><Sample text={s} replaceWith={preview.canonical} /></span>)}
                                        </span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                        <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-titanium-300 hover:text-titanium-100 rounded-lg">Volver</button>
                        <button onClick={apply} disabled={(!preview.picked.size && !preview.rename.size) || busy === 'apply'} className={btnPrimary}>
                            {busy === 'apply' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                            {pickedCount > 0 ? `Hacer ${plural(pickedCount, 'cambio', 'cambios')} en ${plural(totalDocs, 'documento', 'documentos')}` : 'Aplicar el cambio'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const groups = state?.groups || [];
    const docs = state?.docs || [];
    const TABS: { id: Tab; label: string; n?: number }[] = [
        { id: 'nombres', label: 'Nombres', n: groups.length },
        { id: 'documentos', label: 'Documentos repetidos', n: docs.length },
        { id: 'cambiar', label: 'Cambiar un nombre' },
    ];

    return (
        <div className="h-full overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="max-w-[760px] mx-auto px-6 py-6 flex flex-col gap-6">
                <div className="flex items-start gap-4">
                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-titanium-200 leading-relaxed">
                            Reviso tu canon antes de que escribas o hables con el Arquitecto: conceptos que se llaman distinto según el documento, y documentos repetidos o casi iguales que pueden confundirlo.
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                            <button onClick={scan} disabled={scanning} className={btnPrimary}>
                                {scanning && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                {scanning ? 'Leyendo tus documentos…' : state?.checkedAt ? 'Revisar otra vez' : 'Revisar mis documentos'}
                            </button>
                            {state?.checkedAt && !scanning && <span className="text-sm text-titanium-400">Última revisión: {timeAgo(state.checkedAt)}</span>}
                        </div>
                    </div>
                </div>

                <div role="tablist" aria-label="Qué revisar" className="flex flex-wrap gap-1 border-b border-titanium-800">
                    {TABS.map(t => (
                        <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                            className={`px-3 py-2 -mb-px text-sm border-b-2 transition-colors ${tab === t.id ? 'border-mira text-titanium-50' : 'border-transparent text-titanium-400 hover:text-titanium-100'}`}>
                            {t.label}{t.n ? <span className="ml-1.5 inline-flex min-w-5 h-5 px-1.5 items-center justify-center rounded-full bg-mira/20 text-mira text-xs tabular-nums">{t.n}</span> : null}
                        </button>
                    ))}
                </div>

                {/* ── Nombres ── */}
                {tab === 'nombres' && (
                    <>
                        {state?.checkedAt && groups.length === 0 && <p className="text-[15px] text-titanium-300">No encontré conceptos con dos nombres. Si cambiaste el nombre de algo, usa «Cambiar un nombre».</p>}
                        <ul className="flex flex-col gap-4">
                            {groups.map(g => {
                                const canonical = choice[g.id] || g.suggested;
                                const isOpen = expanded === g.id;
                                return (
                                    <li key={g.id} className="rounded-2xl border border-titanium-700 bg-titanium-900 px-5 py-4">
                                        <h3 className="font-serif text-lg text-titanium-100 text-pretty">{g.variants.map(v => `«${v.name}»`).join(' y ')}</h3>
                                        <p className="text-sm text-titanium-400 mt-0.5">{g.kind === 'manual' ? 'Cambio de nombre que pediste' : g.kind === 'ortografia' ? 'Se escribe de dos formas' : 'Parece un cambio de nombre a medias'}</p>
                                        {g.reason && g.kind !== 'manual' && <p className="text-[15px] text-titanium-200 mt-2 leading-relaxed">{g.reason}</p>}

                                        <fieldset className="mt-3">
                                            <legend className="text-sm text-titanium-300 mb-2">¿Cuál nombre queda?</legend>
                                            <div className="flex flex-col gap-2">
                                                {g.variants.map(v => (
                                                    <label key={v.name} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${canonical === v.name ? 'border-mira/60 bg-mira/10' : 'border-titanium-700 hover:border-titanium-500'}`}>
                                                        <input type="radio" name={`nombre-${g.id}`} className="accent-[var(--color-mira)] w-4 h-4" checked={canonical === v.name} onChange={() => setChoice(c => ({ ...c, [g.id]: v.name }))} />
                                                        <span className="text-[15px] text-titanium-100">{v.name}</span>
                                                        <span className="text-sm text-titanium-400 ml-auto tabular-nums">
                                                            {v.total ? `${plural(v.total, 'vez', 'veces')} en ${docsOf(v)}` : 'no aparece en el texto'}
                                                            {v.titles?.length ? ` · título de ${v.titles.map(t => `«${t.fileName}»`).join(', ')}` : ''}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>

                                        {g.variants.some(v => v.files.length) && (
                                            <button onClick={() => setExpanded(isOpen ? null : g.id)} aria-expanded={isOpen} className="mt-3 inline-flex items-center gap-1 text-sm text-mira hover:text-titanium-50">
                                                {isOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />} {isOpen ? 'Ocultar dónde aparece' : 'Ver dónde aparece'}
                                            </button>
                                        )}
                                        {isOpen && (
                                            <div className="mt-3 flex flex-col gap-3">
                                                {g.variants.filter(v => v.files.length).map(v => (
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
                                            <button onClick={() => act(g, 'preview')} disabled={!!busy} className={btnPrimary}>
                                                {busy === `${g.id}:preview` && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                                Unificar en mis documentos
                                            </button>
                                            <button onClick={() => act(g, 'decide')} disabled={!!busy} title="No cambia tus documentos: la IA sabrá que son lo mismo" className={btnSecondary}>Solo dejarlo decidido</button>
                                            {g.kind === 'manual'
                                                ? <button onClick={() => act(g, 'dismissManual')} disabled={!!busy} className={btnGhost}>Descartar</button>
                                                : <button onClick={() => act(g, 'distinct')} disabled={!!busy} className={btnGhost}>Son cosas distintas</button>}
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
                    </>
                )}

                {/* ── Documentos repetidos ── */}
                {tab === 'documentos' && (
                    <>
                        {state?.checkedAt && docs.length === 0 && <p className="text-[15px] text-titanium-300">No encontré documentos repetidos.</p>}
                        {!state?.checkedAt && <p className="text-[15px] text-titanium-300">Pulsa «Revisar mis documentos» para buscarlos.</p>}
                        <ul className="flex flex-col gap-4">
                            {docs.map(p => {
                                const topic = stem(p.a.name).replace(/^ficha\s+(de\s+)?/i, '');
                                const aHas = p.a.uniqueWords > 30, bHas = p.b.uniqueWords > 30;
                                const advice = p.kind === 'copia'
                                    ? (!aHas && bHas) ? `«${stem(p.b.name)}» ya tiene todo lo de «${stem(p.a.name)}» y más: «${stem(p.a.name)}» parece la copia vieja.`
                                        : (aHas && !bHas) ? `«${stem(p.a.name)}» ya tiene todo lo de «${stem(p.b.name)}» y más: «${stem(p.b.name)}» parece la copia vieja.`
                                            : (aHas && bHas) ? 'Los dos tienen partes que el otro no tiene. Pasa lo que falte al que se queda antes de mandar el otro a la papelera.'
                                                : 'Son prácticamente iguales: quédate con uno.'
                                    : `Hay dos documentos sobre «${topic}». Si los dos lo describen, el Arquitecto puede leer datos distintos: deja una sola versión oficial y pasa a ella lo que falte.`;
                                const confirming = confirmKeep?.pairId === p.id;
                                return (
                                    <li key={p.id} className="rounded-2xl border border-titanium-700 bg-titanium-900 px-5 py-4">
                                        <h3 className="font-serif text-lg text-titanium-100 text-pretty">
                                            {p.kind === 'copia' ? 'Dos documentos casi iguales' : `Dos documentos sobre «${topic}»`}
                                        </h3>
                                        <p className="text-sm text-titanium-400 mt-0.5">{p.kind === 'copia' ? `Comparten el ${p.overlap}% del texto` : p.overlap > 10 ? `Comparten el ${p.overlap}% del texto` : 'Tienen el mismo tema en el nombre'}</p>
                                        <p className="text-[15px] text-titanium-200 mt-2 leading-relaxed">{advice}</p>

                                        <div className="grid gap-3 mt-4 sm:grid-cols-2">
                                            {[p.a, p.b].map((d, i) => {
                                                const other = i === 0 ? p.b : p.a;
                                                return (
                                                    <div key={d.fileId} className="rounded-xl border border-titanium-700 bg-titanium-950/40 px-4 py-3 flex flex-col gap-2 min-w-0">
                                                        <div className="min-w-0">
                                                            <p className="font-serif text-[16px] text-titanium-100 break-words">{stem(d.name)}</p>
                                                            {d.folder && <p className="text-sm text-titanium-400 break-words">{d.folder}</p>}
                                                        </div>
                                                        <ul className="text-sm text-titanium-300 flex flex-col gap-0.5">
                                                            {d.reach > 0 && <li>Llega al capítulo {d.reach}</li>}
                                                            <li className="tabular-nums">{plural(d.words, 'palabra', 'palabras')}</li>
                                                            {d.modifiedTime && <li>Editado el {fmtDate(d.modifiedTime)}</li>}
                                                            <li className={d.uniqueWords > 30 ? 'text-mira' : 'text-titanium-400'}>
                                                                {d.uniqueWords > 30 ? `Solo aquí: unas ${plural(d.uniqueWords, 'palabra', 'palabras')}` : 'No tiene nada que no esté en el otro'}
                                                            </li>
                                                        </ul>
                                                        {d.uniqueWords > 30 && d.uniqueSample && (
                                                            <blockquote className="font-serif text-[14px] text-titanium-300 leading-relaxed border-l-2 border-mira/60 pl-3 line-clamp-4">{d.uniqueSample}</blockquote>
                                                        )}
                                                        <div className="flex flex-wrap gap-2 mt-auto pt-1">
                                                            {onOpenDocument && <button onClick={() => onOpenDocument(d.fileId, d.uniqueSample?.replace(/…$/, '').slice(0, 120) || '')} className={btnSecondary}>Abrir</button>}
                                                            <button onClick={() => setConfirmKeep({ pairId: p.id, keep: d, drop: other })} disabled={!!busy} className={btnSecondary}>Quedarme con este</button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {confirming && confirmKeep && (
                                            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 flex flex-col gap-3">
                                                <p className="text-[15px] text-titanium-100 leading-relaxed">
                                                    «{stem(confirmKeep.drop.name)}» irá a la papelera de Drive y dejará de contar como canon. Puedes recuperarlo desde Drive durante 30 días.
                                                    {confirmKeep.drop.uniqueWords > 30 && <span className="block text-amber-200 mt-1">Ojo: tiene unas {plural(confirmKeep.drop.uniqueWords, 'palabra', 'palabras')} que no están en «{stem(confirmKeep.keep.name)}».</span>}
                                                    <span className="block text-sm text-titanium-400 mt-1">Si tu bóveda de Obsidian se sincroniza con Drive, también desaparecerá de allí.</span>
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    <button onClick={docKeep} disabled={busy === 'keep'} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-red-500/40 text-red-200 hover:bg-red-500/10 disabled:opacity-50">
                                                        {busy === 'keep' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                                        Mover «{stem(confirmKeep.drop.name)}» a la papelera
                                                    </button>
                                                    <button onClick={() => setConfirmKeep(null)} className={btnGhost}>Cancelar</button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-3">
                                            <button onClick={() => docDistinct(p.id)} disabled={!!busy} className={btnGhost}>Son distintos, déjalos</button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}

                {/* ── Cambiar un nombre ── */}
                {tab === 'cambiar' && (
                    <form onSubmit={startManual} className="flex flex-col gap-4">
                        <p className="text-[15px] text-titanium-200 leading-relaxed">
                            ¿Le cambiaste el nombre a una regla, un lugar o un personaje? Escríbelo aquí y lo cambio en todo tu canon: el texto, los enlaces [[ ]] y el título del documento que lo explica. Antes te muestro cada cambio.
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm text-titanium-300">Nombre actual</span>
                                <input name="nombre-actual" autoComplete="off" spellCheck={false} value={from} onChange={e => setFrom(e.target.value)} placeholder="Ej.: Anima Fusione…"
                                    className="rounded-xl bg-titanium-900 border border-titanium-700 px-3 py-2.5 text-[15px] text-titanium-100 placeholder:text-titanium-500 focus:border-mira/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/30" />
                            </label>
                            <label className="flex flex-col gap-1.5">
                                <span className="text-sm text-titanium-300">Nombre nuevo</span>
                                <input name="nombre-nuevo" autoComplete="off" spellCheck={false} value={to} onChange={e => setTo(e.target.value)} placeholder="Ej.: Fusione…"
                                    className="rounded-xl bg-titanium-900 border border-titanium-700 px-3 py-2.5 text-[15px] text-titanium-100 placeholder:text-titanium-500 focus:border-mira/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/30" />
                            </label>
                        </div>
                        <p className="text-sm text-titanium-400">Las mayúsculas y las tildes cuentan: escríbelo como aparece en tus documentos.</p>
                        <div>
                            <button type="submit" disabled={busy === 'manual'} className={btnPrimary}>
                                {busy === 'manual' && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                                {busy === 'manual' ? 'Buscando…' : 'Ver dónde cambia'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
