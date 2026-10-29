// Oct 2026: «Mapa» dentro de Preparar (antes: Nexus / World Engine).
// Tu mundo como mapa de conexiones. Lo que el texto establece se dibuja en línea sólida (con su
// archivo de origen); las conexiones que sugiere el Arquitecto, en ámbar punteado: son hipótesis.
// Los elementos sin archivo propio son «fantasmas» (anillo hueco). Lejos se ven los grandes; al
// acercarte aparecen todos los nombres.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';
import { Network, ScanSearch, Loader2, Sparkles, X, FileText, Ghost, Landmark, Users, Search } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';

interface MapNode { id: string; nombre: string; tipo: string; resumen: string; fileId: string | null; archivos: string[]; rol?: string; x?: number; y?: number }
interface MapLink { source: string | MapNode; target: string | MapNode; tipo: string; descripcion: string; fuente: string; sug?: boolean }
interface Sugerencia { de: string; a: string; source: string; target: string; idea: string; consecuencia: string; pregunta: string }

interface Props {
    onOpenFile?: (fileId: string) => void;
    onAskArquitecto?: (message: string) => void;
    onGoToPersonajes?: () => void;
}

const TIPOS: { id: string; label: string; color: string }[] = [
    { id: 'personaje', label: 'Personajes', color: '#22d3ee' },
    { id: 'criatura', label: 'Criaturas', color: '#2dd4bf' },
    { id: 'grupo', label: 'Grupos', color: '#60a5fa' },
    { id: 'faccion', label: 'Facciones', color: '#a78bfa' },
    { id: 'lugar', label: 'Lugares', color: '#4ade80' },
    { id: 'concepto', label: 'Leyes y conceptos', color: '#f472b6' },
    { id: 'objeto', label: 'Objetos', color: '#facc15' },
    { id: 'evento', label: 'Eventos', color: '#fb923c' },
];
const COLOR: Record<string, string> = Object.fromEntries(TIPOS.map(t => [t.id, t.color]));
const idOf = (v: string | MapNode) => (typeof v === 'string' ? v : v.id);

export default function MapaView({ onOpenFile, onAskArquitecto, onGoToPersonajes }: Props) {
    const [nodes, setNodes] = useState<MapNode[]>([]);
    const [links, setLinks] = useState<MapLink[]>([]);
    const [sugs, setSugs] = useState<Sugerencia[]>([]);
    const [scannedAt, setScannedAt] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<'' | 'scan' | 'suggest'>('');
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [sel, setSel] = useState<string | null>(null);
    const [selSug, setSelSug] = useState<Sugerencia | null>(null);
    const [query, setQuery] = useState('');
    const [size, setSize] = useState({ w: 800, h: 600 });
    const boxRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);
    const posRef = useRef<Record<string, any>>({});
    const fittedRef = useRef(false);
    const radius = (deg: number) => 4 + Math.min(8, Math.sqrt(deg) * 2);

    useEffect(() => {
        callFunction<any>('mapaMundo', { mode: 'get' })
            .then(r => { setNodes(r?.nodes || []); setLinks(r?.links || []); setSugs(r?.sugerencias || []); setScannedAt(r?.scannedAt || null); })
            .catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const scan = async () => {
        setBusy('scan');
        try {
            const r = await callFunction<any>('mapaMundo', { mode: 'scan' }, { timeout: 540000 });
            setNodes(r.nodes || []); setLinks(r.links || []); setSugs([]); setScannedAt(r.scannedAt || null); setSel(null); setSelSug(null);
            toast.success(`Mapa listo: ${r.nodes?.length || 0} elementos y ${r.links?.length || 0} conexiones.`);
            fittedRef.current = false;
        } catch (e: any) { toast.error(e?.message || 'No pude escanear tu mundo.'); } finally { setBusy(''); }
    };

    const suggest = async () => {
        setBusy('suggest');
        try {
            const r = await callFunction<any>('mapaMundo', { mode: 'suggest' }, { timeout: 180000 });
            setSugs(r.sugerencias || []);
            if (r.sugerencias?.[0]) { setSelSug(r.sugerencias[0]); setSel(null); }
        } catch (e: any) { toast.error(e?.message || 'No pude sugerir conexiones.'); } finally { setBusy(''); }
    };

    // Fuerzas: más separación y sin solapes (los nombres necesitan aire).
    useEffect(() => {
        const fg = fgRef.current;
        if (!fg || !nodes.length) return;
        try {
            fg.d3Force('charge')?.strength(-140);
            fg.d3Force('link')?.distance(55);
            fg.d3Force('collide', forceCollide((n: any) => radius(degreeRef.current[n.id] || 0) + 10));
            fg.d3ReheatSimulation?.();
        } catch { /* versión sin d3Force */ }
    }, [nodes.length, links.length]);

    const degreeRef = useRef<Record<string, number>>({});
    const degree = useMemo(() => {
        const d: Record<string, number> = {};
        links.forEach(l => { const s = idOf(l.source), t = idOf(l.target); d[s] = (d[s] || 0) + 1; d[t] = (d[t] || 0) + 1; });
        degreeRef.current = d;
        return d;
    }, [links]);

    const data = useMemo(() => {
        const visible = nodes.filter(n => !hidden.has(n.tipo));
        const ids = new Set(visible.map(n => n.id));
        const ls: MapLink[] = links.filter(l => ids.has(idOf(l.source)) && ids.has(idOf(l.target))).map(l => ({ ...l, source: idOf(l.source), target: idOf(l.target) }));
        const ss: MapLink[] = sugs.filter(s => ids.has(s.source) && ids.has(s.target)).map(s => ({ source: s.source, target: s.target, tipo: 'posible', descripcion: s.idea, fuente: 'Sugerencia del Arquitecto', sug: true }));
        // Conservar posiciones entre redibujos (filtros, sugerencias) para que el mapa no salte.
        const prev = posRef.current;
        const ns = visible.map(n => { const p = prev[n.id]; return p ? { ...n, x: p.x, y: p.y, vx: 0, vy: 0 } : { ...n }; });
        const next: Record<string, any> = {};
        ns.forEach(n => { next[n.id] = n; });
        posRef.current = next;
        return { nodes: ns, links: [...ls, ...ss] };
    }, [nodes, links, sugs, hidden]);

    const neighbors = useMemo(() => {
        if (!sel) return null;
        const s = new Set<string>([sel]);
        data.links.forEach(l => { const a = idOf(l.source), b = idOf(l.target); if (a === sel) s.add(b); if (b === sel) s.add(a); });
        return s;
    }, [sel, data]);

    const cur = nodes.find(n => n.id === sel) || null;
    const curLinks = useMemo(() => cur ? links.filter(l => idOf(l.source) === cur.id || idOf(l.target) === cur.id) : [], [cur, links]);
    const name = (id: string) => nodes.find(n => n.id === id)?.nombre || id;
    const ghosts = nodes.filter(n => !n.fileId).length;

    const focus = (id: string) => {
        setSel(id); setSelSug(null);
        const n: any = data.nodes.find(x => x.id === id);
        if (n && typeof n.x === 'number') { fgRef.current?.centerAt(n.x, n.y, 600); fgRef.current?.zoom(2.2, 600); }
    };

    const searchHit = () => {
        const q = query.trim().toLowerCase();
        if (!q) return;
        const n = nodes.find(x => x.nombre.toLowerCase().includes(q));
        if (n) focus(n.id); else toast.info('No está en el mapa.');
    };

    return (
        <div className="h-full w-full flex flex-col overflow-hidden bg-[#08090b]">
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-titanium-800 px-4 py-2">
                <Network size={15} className="text-cyan-400" />
                <span className="text-sm text-titanium-100">Mapa de tu mundo</span>
                {scannedAt && <span className="text-[10px] text-titanium-600">· {nodes.length} elementos · {links.length} conexiones · {ghosts} sin archivo</span>}
                <div className="ml-auto flex items-center gap-2">
                    <div className="flex items-center gap-1 rounded-md border border-titanium-800 bg-titanium-950 px-2">
                        <Search size={12} className="text-titanium-600" />
                        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchHit()} placeholder="Buscar…" className="w-32 bg-transparent py-1 text-[12px] text-titanium-200 outline-none" />
                    </div>
                    <button onClick={suggest} disabled={!!busy || !nodes.length} className="inline-flex items-center gap-1.5 rounded-md bg-amber-800/60 hover:bg-amber-700/70 px-2.5 py-1 text-[11px] text-amber-50 disabled:opacity-40" title="El Arquitecto propone 5 conexiones posibles entre piezas sueltas (~US$0,03)">
                        {busy === 'suggest' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Sugerir conexiones
                    </button>
                    <button onClick={scan} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-md bg-titanium-800 hover:bg-titanium-700 px-2.5 py-1 text-[11px] text-titanium-100 disabled:opacity-50" title="Lee tu canon y dibuja el mapa (~US$0,03)">
                        {busy === 'scan' ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />} {nodes.length ? 'Actualizar mapa' : 'Dibujar mi mundo'}
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                <div ref={boxRef} className="relative flex-1 min-w-0 overflow-hidden">
                    {loading ? (
                        <div className="absolute inset-0 flex items-center justify-center text-titanium-600"><Loader2 size={18} className="animate-spin" /></div>
                    ) : !nodes.length ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-10 text-center">
                            <Network size={36} className="text-titanium-700" />
                            <p className="text-titanium-300">Dibuja tu mundo: leo tu canon y te muestro quién y qué se conecta con qué.</p>
                            <p className="max-w-md text-[12px] text-titanium-600">Cada conexión trae el archivo donde la estableciste. Después, el Arquitecto puede sugerirte conexiones posibles entre piezas sueltas.</p>
                            {busy === 'scan' && <p className="text-[12px] text-cyan-400/80">Leyendo tu canon… puede tardar uno o dos minutos.</p>}
                        </div>
                    ) : (
                        <ForceGraph2D
                            ref={fgRef}
                            width={size.w}
                            height={size.h}
                            graphData={data as any}
                            backgroundColor="#08090b"
                            cooldownTicks={160}
                            onEngineStop={() => { if (!fittedRef.current) { fittedRef.current = true; fgRef.current?.zoomToFit(500, 50); } }}
                            nodeRelSize={4}
                            nodeVal={(n: any) => 1 + Math.min(12, degree[n.id] || 0)}
                            linkColor={(l: any) => l.sug ? 'rgba(251,191,36,0.85)' : (neighbors && !(neighbors.has(idOf(l.source)) && neighbors.has(idOf(l.target))) ? 'rgba(120,120,130,0.08)' : 'rgba(150,160,175,0.35)')}
                            linkWidth={(l: any) => (l.sug ? 1.6 : (sel && (idOf(l.source) === sel || idOf(l.target) === sel) ? 1.6 : 0.8))}
                            linkLineDash={(l: any) => (l.sug ? [4, 3] : null)}
                            linkLabel={(l: any) => `${l.tipo}${l.descripcion ? ` — ${l.descripcion}` : ''}${l.fuente ? ` (${l.fuente})` : ''}`}
                            linkDirectionalArrowLength={(l: any) => (l.sug ? 0 : 2.5)}
                            linkDirectionalArrowRelPos={0.9}
                            onNodeClick={(n: any) => { setSel(n.id); setSelSug(null); }}
                            onLinkClick={(l: any) => { if (l.sug) { const s = sugs.find(x => x.source === idOf(l.source) && x.target === idOf(l.target)); if (s) { setSelSug(s); setSel(null); } } }}
                            onBackgroundClick={() => { setSel(null); setSelSug(null); }}
                            nodeCanvasObject={(n: any, ctx: CanvasRenderingContext2D, scale: number) => {
                                const deg = degree[n.id] || 0;
                                // Tamaño casi constante en pantalla: al acercarte no crecen hasta taparse.
                                const r = radius(deg) / Math.pow(Math.max(scale, 0.3), 0.75);
                                const dim = neighbors && !neighbors.has(n.id);
                                const color = COLOR[n.tipo] || '#94a3b8';
                                ctx.globalAlpha = dim ? 0.15 : 1;
                                ctx.beginPath();
                                ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
                                if (n.fileId) { ctx.fillStyle = color; ctx.fill(); }
                                else { ctx.setLineDash([3 / scale, 2.5 / scale]); ctx.lineWidth = 1.4 / scale; ctx.strokeStyle = color; ctx.stroke(); ctx.setLineDash([]); }
                                if (n.id === sel) { ctx.lineWidth = 2 / scale; ctx.strokeStyle = '#fff'; ctx.stroke(); }
                                // Nivel de detalle: lejos solo los nombres de los elementos grandes.
                                if (scale > 1.4 || deg >= 6 || n.id === sel || (neighbors && neighbors.has(n.id))) {
                                    const fs = Math.max(10 / scale, 2.5);
                                    ctx.font = `${fs}px ui-sans-serif, system-ui`;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'top';
                                    ctx.fillStyle = dim ? 'rgba(200,200,210,0.2)' : 'rgba(226,232,240,0.92)';
                                    ctx.fillText(n.nombre, n.x, n.y + r + 1.5);
                                }
                                ctx.globalAlpha = 1;
                            }}
                            nodePointerAreaPaint={(n: any, color: string, ctx: CanvasRenderingContext2D) => {
                                const r = radius(degree[n.id] || 0) + 2;
                                ctx.fillStyle = color; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, 2 * Math.PI); ctx.fill();
                            }}
                        />
                    )}
                    {!!nodes.length && (
                        <div className="absolute left-3 bottom-3 flex flex-wrap gap-1.5 max-w-[70%]">
                            {TIPOS.filter(t => nodes.some(n => n.tipo === t.id)).map(t => (
                                <button key={t.id} onClick={() => setHidden(h => { const n = new Set(h); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                                    className={`inline-flex items-center gap-1.5 rounded-full border border-titanium-800 bg-titanium-950/80 px-2 py-0.5 text-[11px] ${hidden.has(t.id) ? 'text-titanium-600 line-through' : 'text-titanium-300'}`}>
                                    <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />{t.label}
                                </button>
                            ))}
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-titanium-800 bg-titanium-950/80 px-2 py-0.5 text-[11px] text-titanium-400"><span className="h-2 w-2 rounded-full border border-dashed border-titanium-400" /> sin archivo</span>
                            {!!sugs.length && <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-900/50 bg-titanium-950/80 px-2 py-0.5 text-[11px] text-amber-300/90">┅ posible</span>}
                        </div>
                    )}
                </div>

                {(cur || selSug || sugs.length > 0) && (
                    <aside className="relative z-10 w-80 shrink-0 border-l border-titanium-800 bg-[#0b0c0e] overflow-y-auto">
                        {cur ? (
                            <div className="p-4 space-y-3 text-[12.5px] text-titanium-300">
                                <div className="flex items-start gap-2">
                                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLOR[cur.tipo] || '#94a3b8' }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base text-titanium-100">{cur.nombre}</p>
                                        <p className="text-[11px] text-titanium-500">{TIPOS.find(t => t.id === cur.tipo)?.label || cur.tipo}{cur.rol ? ` · ${cur.rol}` : ''}</p>
                                    </div>
                                    <button onClick={() => setSel(null)} className="text-titanium-600 hover:text-titanium-200"><X size={14} /></button>
                                </div>
                                {cur.resumen && <p>{cur.resumen}</p>}
                                {cur.fileId ? (
                                    <button onClick={() => onOpenFile?.(cur.fileId!)} className="inline-flex items-center gap-1.5 rounded-md border border-titanium-700 px-2.5 py-1 text-[11px] hover:bg-titanium-800"><FileText size={12} /> Abrir su archivo</button>
                                ) : (
                                    <div className="rounded-md border border-dashed border-titanium-700 p-2 text-[11px] text-titanium-400">
                                        <p className="flex items-center gap-1.5"><Ghost size={12} /> Aparece en tu historia pero no tiene archivo propio.</p>
                                        {['personaje', 'criatura', 'grupo'].includes(cur.tipo) && <button onClick={onGoToPersonajes} className="mt-1.5 inline-flex items-center gap-1 text-cyan-300 hover:underline"><Users size={11} /> Crear su ficha en Personajes</button>}
                                    </div>
                                )}
                                <button onClick={() => onAskArquitecto?.(`Quiero trabajar las conexiones de «${cur.nombre}» en mi mundo. Hoy se relaciona con: ${curLinks.map(l => `${name(idOf(l.source)) === cur.nombre ? name(idOf(l.target)) : name(idOf(l.source))} (${l.tipo})`).join(', ') || 'casi nada'}. ¿Qué me falta decidir?`)}
                                    className="inline-flex items-center gap-1.5 rounded-md bg-cyan-900/50 hover:bg-cyan-800/60 px-2.5 py-1 text-[11px] text-cyan-100"><Landmark size={12} /> Hablarlo con el Arquitecto</button>
                                <div>
                                    <p className="mb-1 text-[10px] uppercase tracking-wider text-titanium-500">Conexiones ({curLinks.length})</p>
                                    {!curLinks.length ? <p className="text-titanium-600">Ninguna en tu texto todavía.</p> : (
                                        <ul className="space-y-1.5">
                                            {curLinks.map((l, i) => {
                                                const other = idOf(l.source) === cur.id ? idOf(l.target) : idOf(l.source);
                                                const out = idOf(l.source) === cur.id;
                                                return (
                                                    <li key={i} className="rounded-md bg-titanium-900/50 p-2">
                                                        <button onClick={() => focus(other)} className="text-left">
                                                            <span className="text-titanium-500">{out ? `${l.tipo} → ` : `← ${l.tipo} · `}</span><span className="text-titanium-100 hover:underline">{name(other)}</span>
                                                        </button>
                                                        {l.descripcion && <p className="mt-0.5 text-titanium-400">{l.descripcion}</p>}
                                                        {l.fuente && <p className="mt-0.5 text-[10px] text-titanium-600">{l.fuente}</p>}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        ) : selSug ? (
                            <div className="p-4 space-y-3 text-[12.5px] text-titanium-300">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={13} className="text-amber-400" />
                                    <p className="flex-1 text-titanium-100">{selSug.de} ┅ {selSug.a}</p>
                                    <button onClick={() => setSelSug(null)} className="text-titanium-600 hover:text-titanium-200"><X size={14} /></button>
                                </div>
                                <p>{selSug.idea}</p>
                                <p className="text-titanium-400"><b className="text-titanium-300">Consecuencia:</b> {selSug.consecuencia}</p>
                                <p className="text-amber-200/90"><b>Para decidir:</b> {selSug.pregunta}</p>
                                <p className="text-[11px] text-titanium-600">Es una hipótesis, no está en tu canon.</p>
                                <button onClick={() => onAskArquitecto?.(`El Mapa me sugirió conectar «${selSug.de}» con «${selSug.a}»: ${selSug.idea} ${selSug.pregunta}`)} className="inline-flex items-center gap-1.5 rounded-md bg-cyan-900/50 hover:bg-cyan-800/60 px-2.5 py-1 text-[11px] text-cyan-100"><Landmark size={12} /> Llevarla al Arquitecto</button>
                                <button onClick={() => { focus(selSug.source); }} className="ml-2 text-[11px] text-titanium-400 hover:underline">Ver en el mapa</button>
                            </div>
                        ) : (
                            <div className="p-4 space-y-2 text-[12.5px]">
                                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-400/80"><Sparkles size={11} /> Conexiones posibles</p>
                                {sugs.map((s, i) => (
                                    <button key={i} onClick={() => { setSelSug(s); setSel(null); }} className="w-full text-left rounded-md bg-titanium-900/50 p-2 hover:bg-titanium-800/60">
                                        <p className="text-titanium-100">{s.de} ┅ {s.a}</p>
                                        <p className="mt-0.5 line-clamp-2 text-titanium-400">{s.idea}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
}
