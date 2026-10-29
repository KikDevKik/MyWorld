// Oct 2026: la Imprenta rediseñada. Eliges qué entra y en qué orden, el diseño (plantilla, página,
// tipografías, interlineado, sangría, capitular, separador de escenas, números de página…) y ves el
// libro mientras lo ajustas. Exporta a PDF, EPUB y Word sin pasar por el servidor.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, ChevronRight, ChevronDown, Folder, FileText, Loader2, ArrowUp, ArrowDown, X, Download, BookOpen, FileType2, Award, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectConfig } from '../../contexts/ProjectConfigContext';
import { callFunction } from '../../services/api';
import { DEFAULT_DESIGN, Design, FONTS, PAGES, TEMPLATES, BookMeta, toChapters, bookHtml, buildEpub, buildDocx, PageSize } from '../../utils/imprenta/build';

interface Node { id: string; name: string; mimeType: string; children?: Node[] }
const FOLDER = 'application/vnd.google-apps.folder';
const isFolder = (n: Node) => n.mimeType === FOLDER;

interface Props { folderId: string; accessToken: string | null; onClose: () => void; onOpenCertificate?: () => void }

function flatten(nodes: Node[], out: Node[] = []): Node[] {
    for (const n of nodes) { if (!isFolder(n)) out.push(n); if (n.children) flatten(n.children, out); }
    return out;
}

const TreeItem: React.FC<{ node: Node; depth: number; sel: Set<string>; toggle: (ids: string[], on: boolean) => void }> = ({ node, depth, sel, toggle }) => {
    const [open, setOpen] = useState(depth < 1);
    const folder = isFolder(node);
    const ids = useMemo(() => (folder ? flatten(node.children || []).map(n => n.id) : [node.id]), [node, folder]);
    const n = ids.filter(id => sel.has(id)).length;
    const all = n > 0 && n === ids.length, some = n > 0 && !all;
    if (!folder && !/\.(md|txt)$/i.test(node.name) && node.mimeType !== 'application/vnd.google-apps.document') return null;
    return (
        <div>
            <div className="flex items-center gap-1.5 rounded px-1.5 py-1 hover:bg-titanium-800/60 cursor-pointer" style={{ paddingLeft: depth * 14 + 6 }} onClick={() => (folder ? setOpen(!open) : toggle(ids, !all))}>
                <span className="w-3.5 text-titanium-500">{folder ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}</span>
                <input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = some; }} onClick={e => e.stopPropagation()} onChange={() => toggle(ids, !all)} className="accent-amber-600" />
                {folder ? <Folder size={12} className="text-titanium-500" /> : <FileText size={12} className="text-titanium-600" />}
                <span className="truncate text-[12px] text-titanium-200">{node.name.replace(/\.md$/i, '')}</span>
            </div>
            {folder && open && (node.children || []).map(c => <TreeItem key={c.id} node={c} depth={depth + 1} sel={sel} toggle={toggle} />)}
        </div>
    );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <label className="block"><span className="mb-1 block text-[10px] uppercase tracking-wider text-titanium-500">{label}</span>{children}</label>
);
const inputCls = 'w-full rounded-md border border-titanium-700 bg-titanium-950 px-2 py-1.5 text-[12px] text-titanium-100 outline-none focus:border-amber-700';
const Toggle: React.FC<{ on: boolean; set: (v: boolean) => void; label: string }> = ({ on, set, label }) => (
    <button onClick={() => set(!on)} className="flex w-full items-center justify-between py-1 text-[12px] text-titanium-300">
        <span>{label}</span>
        <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${on ? 'bg-amber-600' : 'bg-titanium-700'}`}><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`} /></span>
    </button>
);

export default function ImprentaView({ folderId, accessToken, onClose, onOpenCertificate }: Props) {
    const { config, fileTree } = useProjectConfig();
    const KEY = `myworld_imprenta_${folderId}`;
    const saved = useMemo(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }, [KEY]);
    const [design, setDesign] = useState<Design>({ ...DEFAULT_DESIGN, ...(saved.design || {}) });
    const [meta, setMeta] = useState<BookMeta>({ title: saved.meta?.title || config?.projectName || '', subtitle: saved.meta?.subtitle || '', author: saved.meta?.author || '', dedication: saved.meta?.dedication || '' });
    const [sel, setSel] = useState<Set<string>>(new Set(saved.sel || []));
    const [order, setOrder] = useState<string[]>(saved.order || []);
    const [contents, setContents] = useState<Record<string, { name: string; content: string }>>({});
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [html, setHtml] = useState('');
    const [exporting, setExporting] = useState<'' | 'pdf' | 'epub' | 'docx'>('');
    const [tab, setTab] = useState<'contenido' | 'diseno'>('contenido');
    const printRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ design, meta, sel: [...sel], order })); } catch { /* sin almacenamiento */ } }, [design, meta, sel, order, KEY]);

    // El árbol del proyecto trae solo las carpetas raíz: se cargan sus hijos (como en el Explorador).
    const [tree, setTree] = useState<Node[] | null>(null);
    useEffect(() => {
        if (!fileTree) return;
        let alive = true;
        const roots: Node[] = ((fileTree as any) as Node[]).map(n => ({ ...n, children: n.children && n.children.length ? n.children : undefined }));
        (async () => {
            const load = async (n: Node, depth: number): Promise<void> => {
                if (!isFolder(n) || depth > 6) return;
                if (!n.children) {
                    try {
                        const r = await callFunction<any>('getFileSystemNodes', { folderId: n.id, accessToken });
                        n.children = (Array.isArray(r) ? r : r?.files || []).map((c: any) => ({ id: c.id, name: c.name, mimeType: c.mimeType }));
                    } catch { n.children = []; }
                }
                for (let k = 0; k < n.children!.length; k += 4) await Promise.all(n.children!.slice(k, k + 4).map(c => load(c, depth + 1)));
            };
            await Promise.all(roots.map(r => load(r, 0)));
            if (alive) setTree(roots);
        })();
        return () => { alive = false; };
    }, [fileTree, accessToken]);

    const allFiles = useMemo(() => flatten(tree || []), [tree]);
    const ordered = useMemo(() => {
        const treeOrder = allFiles.map(f => f.id).filter(id => sel.has(id));
        const kept = order.filter(id => sel.has(id));
        return [...kept, ...treeOrder.filter(id => !kept.includes(id))];
    }, [allFiles, sel, order]);
    const nameOf = (id: string) => allFiles.find(f => f.id === id)?.name.replace(/\.md$/i, '') || contents[id]?.name || id;

    const toggle = (ids: string[], on: boolean) => setSel(prev => { const n = new Set(prev); ids.forEach(id => on ? n.add(id) : n.delete(id)); return n; });
    const move = (id: string, dir: -1 | 1) => {
        const list = [...ordered];
        const i = list.indexOf(id), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        setOrder(list);
    };

    // Traer de Drive lo que falte (de a 4)
    useEffect(() => {
        const missing = ordered.filter(id => !contents[id] && !loadingIds.has(id));
        if (!missing.length || !accessToken) return;
        setLoadingIds(prev => new Set([...prev, ...missing]));
        let alive = true;
        (async () => {
            for (let k = 0; k < missing.length; k += 4) {
                const batch = missing.slice(k, k + 4);
                const res = await Promise.all(batch.map(id => callFunction<any>('getDriveFileContent', { fileId: id, accessToken }).then(r => [id, r] as const).catch(() => [id, null] as const)));
                if (!alive) return;
                setContents(prev => { const n = { ...prev }; res.forEach(([id, r]) => { if (r) n[id] = { name: r.name || nameOf(id), content: r.content || '' }; }); return n; });
                setLoadingIds(prev => { const n = new Set(prev); batch.forEach(id => n.delete(id)); return n; });
            }
        })();
        return () => { alive = false; };
    }, [ordered.join('|'), accessToken]);

    const chapters = useMemo(() => toChapters(ordered.filter(id => contents[id]).map(id => contents[id]), design), [ordered, contents, design]);
    useEffect(() => {
        const t = setTimeout(() => setHtml(bookHtml(chapters, design, { ...meta, title: meta.title || 'Sin título', author: meta.author || '' })), 350);
        return () => clearTimeout(t);
    }, [chapters, design, meta]);

    const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign(d => ({ ...d, [k]: v, template: k === 'template' ? (v as string) : d.template }));
    const applyTemplate = (id: string) => setDesign(d => ({ ...d, ...TEMPLATES[id].design, template: id }));

    const ready = () => {
        if (!ordered.length) { toast.info('Elige al menos un archivo.'); return false; }
        if (!meta.title.trim() || !meta.author.trim()) { toast.info('Escribe el título y el autor.'); setTab('contenido'); return false; }
        if (loadingIds.size) { toast.info('Espera: todavía estoy trayendo archivos de Drive.'); return false; }
        return true;
    };
    const fileBase = (meta.title || 'libro').replace(/[\\/:*?"<>|]/g, ' ').trim();
    const download = (blob: Blob, name: string) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    };

    const exportPdf = async () => {
        if (!ready()) return;
        setExporting('pdf');
        try {
            const f = printRef.current!;
            f.srcdoc = bookHtml(chapters, design, meta);
            await new Promise<void>(res => { f.onload = () => res(); });
            const doc = f.contentDocument!;
            try { await (doc as any).fonts?.ready; } catch { /* sin API de fuentes */ }
            await new Promise(r => setTimeout(r, 300));
            toast.info('En la ventana de impresión elige «Guardar como PDF» y desactiva «Encabezados y pies de página».', { duration: 9000 });
            f.contentWindow!.focus();
            f.contentWindow!.print();
        } catch (e: any) { toast.error(e?.message || 'No pude preparar el PDF.'); } finally { setExporting(''); }
    };
    const exportFile = (kind: 'epub' | 'docx') => {
        if (!ready()) return;
        setExporting(kind);
        try {
            if (kind === 'epub') download(buildEpub(chapters, design, meta), `${fileBase}.epub`);
            else download(buildDocx(chapters, design, meta), `${fileBase}.docx`);
            toast.success(kind === 'epub' ? 'EPUB listo.' : 'Documento de Word listo.');
        } catch (e: any) { toast.error(e?.message || 'No pude generar el archivo.'); } finally { setExporting(''); }
    };

    const words = useMemo(() => ordered.reduce((s, id) => s + (contents[id]?.content.split(/\s+/).filter(Boolean).length || 0), 0), [ordered, contents]);
    const fontOpts = (kinds: string[]) => FONTS.filter(f => kinds.includes(f.kind)).map(f => <option key={f.name} value={f.name}>{f.name}</option>);

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-[#0b0a09]">
            <header className="shrink-0 flex items-center gap-3 border-b border-titanium-800 px-4 py-2.5">
                <button onClick={onClose} className="flex items-center gap-1.5 text-titanium-500 hover:text-titanium-200"><ArrowLeft size={16} /></button>
                <Printer size={16} className="text-amber-400" />
                <span className="text-sm text-titanium-100">La Imprenta</span>
                <span className="text-[11px] text-titanium-600">{ordered.length} archivo(s) · {words.toLocaleString()} palabras</span>
                <div className="ml-auto flex items-center gap-2">
                    {onOpenCertificate && <button onClick={onOpenCertificate} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] text-titanium-400 hover:bg-titanium-800 hover:text-titanium-100" title="Certificado de autoría y registro creativo"><Award size={12} /> Autoría</button>}
                    <button onClick={() => exportFile('docx')} disabled={!!exporting} className="inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-3 py-1.5 text-[12px] text-titanium-100 disabled:opacity-40"><FileType2 size={13} /> Word</button>
                    <button onClick={() => exportFile('epub')} disabled={!!exporting} className="inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-3 py-1.5 text-[12px] text-titanium-100 disabled:opacity-40"><BookOpen size={13} /> EPUB</button>
                    <button onClick={exportPdf} disabled={!!exporting} className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 hover:bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40">{exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} PDF</button>
                </div>
            </header>

            <div className="flex-1 flex min-h-0">
                {/* Panel izquierdo: contenido y diseño */}
                <aside className="w-[320px] shrink-0 border-r border-titanium-800 flex flex-col">
                    <div className="flex border-b border-titanium-800 text-[12px]">
                        {(['contenido', 'diseno'] as const).map(t => (
                            <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 ${tab === t ? 'text-amber-200 border-b-2 border-amber-600' : 'text-titanium-500 hover:text-titanium-200'}`}>{t === 'contenido' ? 'Contenido' : 'Diseño'}</button>
                        ))}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {tab === 'contenido' ? (<>
                            <Field label="Título"><input className={inputCls} value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} /></Field>
                            <Field label="Subtítulo (opcional)"><input className={inputCls} value={meta.subtitle} onChange={e => setMeta({ ...meta, subtitle: e.target.value })} /></Field>
                            <Field label="Autor"><input className={inputCls} value={meta.author} onChange={e => setMeta({ ...meta, author: e.target.value })} placeholder="Tu nombre o seudónimo" /></Field>
                            <Field label="Dedicatoria (opcional)"><textarea className={inputCls} rows={2} value={meta.dedication} onChange={e => setMeta({ ...meta, dedication: e.target.value })} /></Field>
                            {!!ordered.length && (
                                <div>
                                    <p className="mb-1 text-[10px] uppercase tracking-wider text-titanium-500">Orden del libro</p>
                                    <ol className="space-y-0.5">
                                        {ordered.map((id, i) => (
                                            <li key={id} className="group flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-titanium-200 hover:bg-titanium-800/60">
                                                <span className="w-5 text-titanium-600">{i + 1}</span>
                                                <span className="flex-1 truncate">{nameOf(id)}</span>
                                                {loadingIds.has(id) && <Loader2 size={11} className="animate-spin text-titanium-500" />}
                                                <button onClick={() => move(id, -1)} className="opacity-0 group-hover:opacity-100 text-titanium-500 hover:text-titanium-100"><ArrowUp size={11} /></button>
                                                <button onClick={() => move(id, 1)} className="opacity-0 group-hover:opacity-100 text-titanium-500 hover:text-titanium-100"><ArrowDown size={11} /></button>
                                                <button onClick={() => toggle([id], false)} className="opacity-0 group-hover:opacity-100 text-titanium-500 hover:text-red-300"><X size={11} /></button>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}
                            <div>
                                <p className="mb-1 text-[10px] uppercase tracking-wider text-titanium-500">Qué entra</p>
                                {!tree ? <p className="flex items-center gap-1.5 text-[12px] text-titanium-600"><Loader2 size={11} className="animate-spin" /> Cargando tus archivos…</p> : tree.map(n => <TreeItem key={n.id} node={n} depth={0} sel={sel} toggle={toggle} />)}
                            </div>
                        </>) : (<>
                            <div>
                                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-titanium-500">Plantilla</p>
                                <div className="grid grid-cols-1 gap-1.5">
                                    {Object.entries(TEMPLATES).map(([id, t]) => (
                                        <button key={id} onClick={() => applyTemplate(id)} className={`rounded-md border px-2.5 py-1.5 text-left ${design.template === id ? 'border-amber-600 bg-amber-950/30' : 'border-titanium-800 hover:border-titanium-600'}`}>
                                            <p className="text-[12px] text-titanium-100" style={{ fontFamily: `'${t.design.headFont}', serif` }}>{t.label}</p>
                                            <p className="text-[10.5px] text-titanium-500">{t.hint}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <Field label="Tamaño de página"><select className={inputCls} value={design.page} onChange={e => set('page', e.target.value as PageSize)}>{Object.entries(PAGES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}</select></Field>
                            <Field label="Tipografía del texto"><select className={inputCls} value={design.bodyFont} onChange={e => set('bodyFont', e.target.value)}>{fontOpts(['serif', 'mono', 'sans'])}</select></Field>
                            <Field label="Tipografía de títulos"><select className={inputCls} value={design.headFont} onChange={e => set('headFont', e.target.value)}>{fontOpts(['display', 'serif', 'sans', 'mono'])}</select></Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={`Tamaño · ${design.size} pt`}><input type="range" min={9} max={14} step={0.5} value={design.size} onChange={e => set('size', Number(e.target.value))} className="w-full accent-amber-600" /></Field>
                                <Field label={`Interlineado · ${design.leading}`}><input type="range" min={1.15} max={2} step={0.05} value={design.leading} onChange={e => set('leading', Number(e.target.value))} className="w-full accent-amber-600" /></Field>
                            </div>
                            <Field label="Márgenes"><select className={inputCls} value={design.margin} onChange={e => set('margin', e.target.value as Design['margin'])}><option value="estrecho">Estrechos</option><option value="normal">Normales</option><option value="amplio">Amplios</option></select></Field>
                            <Field label="Títulos de capítulo"><select className={inputCls} value={design.chapterStyle} onChange={e => set('chapterStyle', e.target.value as Design['chapterStyle'])}><option value="numero-titulo">Número y título</option><option value="titulo">Solo título</option><option value="numero">Solo número</option></select></Field>
                            <Field label="Palabra para el número"><input className={inputCls} value={design.chapterWord} onChange={e => set('chapterWord', e.target.value)} /></Field>
                            <Field label="Separador de escenas">
                                <div className="flex flex-wrap gap-1">
                                    {['⁂', '✦', '❦', '◆', '* * *', '#', '~'].map(s => <button key={s} onClick={() => set('sceneBreak', s)} className={`rounded border px-2 py-0.5 text-[13px] ${design.sceneBreak === s ? 'border-amber-600 text-amber-200' : 'border-titanium-700 text-titanium-300'}`}>{s}</button>)}
                                </div>
                            </Field>
                            <div className="divide-y divide-titanium-800/70">
                                <Toggle on={design.justify} set={v => set('justify', v)} label="Texto justificado" />
                                <Toggle on={design.indent} set={v => set('indent', v)} label="Sangría (si no, párrafos separados)" />
                                <Toggle on={design.dropCap} set={v => set('dropCap', v)} label="Letra capitular" />
                                <Toggle on={design.pageNumbers} set={v => set('pageNumbers', v)} label="Números de página" />
                                <Toggle on={design.runningHead} set={v => set('runningHead', v)} label="Título arriba de cada página" />
                                <Toggle on={design.cover} set={v => set('cover', v)} label="Portada" />
                                <Toggle on={design.toc} set={v => set('toc', v)} label="Índice" />
                                <Toggle on={design.useFileName} set={v => set('useFileName', v)} label="Usar el nombre del archivo si no tiene título" />
                            </div>
                        </>)}
                    </div>
                </aside>

                {/* Vista previa */}
                <main className="flex-1 min-w-0 relative">
                    {!ordered.length ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-10">
                            <Printer size={34} className="text-titanium-700" />
                            <p className="text-titanium-300">Elige en «Qué entra» los capítulos de tu libro.</p>
                            <p className="text-[12px] text-titanium-600">Verás aquí cómo queda mientras ajustas el diseño.</p>
                        </div>
                    ) : (
                        <iframe title="Vista previa del libro" srcDoc={html} className="h-full w-full border-0" sandbox="allow-same-origin" />
                    )}
                    <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[10.5px] text-titanium-400">La paginación exacta (números, encabezados, páginas izquierda y derecha) se aplica al exportar a PDF.</p>
                </main>
            </div>
            <iframe ref={printRef} title="Impresión" className="fixed -left-[9999px] top-0 h-[1px] w-[1px]" />
        </div>
    );
}
