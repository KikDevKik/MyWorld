// Oct 2026: los 3 niveles de IA (Ajustes → Config IA). Ver hooks/aiLevel.ts.
import React, { useEffect, useState } from 'react';
import { Leaf, KeyRound, Sparkles, Check, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { AiLevel, getAiLevel, setAiLevelStored, getGeminiPaid, setGeminiPaidStored } from '../../hooks/aiLevel';

const usd = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 3 : 2 });
interface Status { myworldAvailable?: boolean; claudeActive?: boolean; monthCostUsd: number; calls: number; byokCostUsd?: number; byokCalls?: number; capUsd?: number; byFeature?: Record<string, number>; byTool?: Record<string, { costUsd?: number; calls?: number; ms?: number; inTok?: number; outTok?: number }>; byDay?: Record<string, number> }
// Nov 2026: en qué se fue el gasto del mes (se registra desde noviembre; lo anterior cuenta en el total).
const TOOL_NAMES: Record<string, string> = {
    WhatIf: 'Ideas: cada respuesta', WhatIfDistill: 'Ideas: preparar la nota', Director: 'Mira: cada respuesta', MemoryUpdate: 'Actualizar la memoria',
    ChapterReport: 'Reporte de capítulo', ChapterVoices: 'Reporte: voces', ChapterCanon: 'Reporte: canon', ChapterDoubt: 'Reporte: dudas',
    GuardianWatch: 'Vigilancia de canon', WorldNames: 'Nombres del mundo', ProfileExtract: 'Fichas de personaje', FactExtractor: 'Extraer hechos',
    ArquitectoModeDetect: 'Arquitecto: leer el mensaje', ArquitectoInitMessage: 'Arquitecto: abrir sesión', ArquitectoAnalyze: 'Arquitecto: análisis',
};
const FEATURE_NAMES: Record<string, string> = { arquitecto: 'La mesa del arquitecto', mira: 'Mira', estudio: 'El estudio (reportes)', mesa: 'Mapa, fichero y frasco', biblioteca: 'La biblioteca', otras: 'Tareas en segundo plano' };
interface Props { hasGeminiKey: boolean; hasAnthropicKey: boolean }

export default function AiLevelSelector({ hasGeminiKey, hasAnthropicKey }: Props) {
    const [status, setStatus] = useState<Status | null>(null);
    const [stored, setStored] = useState<AiLevel | null>(getAiLevel);
    const [geminiPaid, setGeminiPaid] = useState(getGeminiPaid);
    const [quality, setQuality] = useState<'calidad' | 'economico'>(() => {
        try { return localStorage.getItem('myworld_claude_quality') === 'economico' ? 'economico' : 'calidad'; } catch { return 'calidad'; }
    });

    useEffect(() => { callFunction<Status>('getAIStatus', {}).then(r => r && setStatus(r)).catch(() => {}); }, [stored]);

    const level: AiLevel = stored ?? (status?.myworldAvailable ? 'myworld' : hasAnthropicKey ? 'propia' : 'gratis');
    const choose = (l: AiLevel) => {
        if (l === 'myworld' && !status?.myworldAvailable) return;
        if (l === 'propia' && !hasAnthropicKey && !hasGeminiKey) { toast.info('Agrega tu clave de pago abajo (Gemini con facturación o Anthropic).'); }
        setAiLevelStored(l);
        setStored(l);
        toast.success(l === 'gratis' ? 'Nivel Gratis activado' : l === 'propia' ? 'Nivel Tu clave de pago activado' : 'Nivel MyWorld activado');
    };

    const Card = ({ id, icon, title, price, children, disabled }: { id: AiLevel; icon: React.ReactNode; title: string; price: string; children: React.ReactNode; disabled?: boolean }) => {
        const active = level === id;
        return (
            <button type="button" onClick={() => choose(id)} disabled={disabled}
                className={`relative text-left rounded-xl border p-3.5 transition-colors ${active ? 'border-mira/60 bg-mira/15' : 'border-titanium-800 bg-titanium-950/40 hover:border-titanium-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-mira' : 'text-titanium-400'}>{icon}</span>
                    <span className="text-sm font-medium text-titanium-100">{title}</span>
                    {active && <Check size={14} className="ml-auto text-mira" />}
                    {disabled && <Lock size={12} className="ml-auto text-titanium-500" />}
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-titanium-400">{price}</p>
                <div className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-titanium-400">{children}</div>
            </button>
        );
    };

    return (
        <div className="mb-6">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">Nivel de IA</h4>
            <div className="grid grid-cols-3 gap-3">
                <Card id="gratis" icon={<Leaf size={15} />} title="1 · Gratis" price="US$ 0 · tu clave gratis de Gemini">
                    <p>Todo funciona con Gemini en su nivel gratuito, con los límites diarios de Google.</p>
                    <p className="flex gap-1 text-amber-300/80"><AlertTriangle size={12} className="mt-0.5 shrink-0" />En el nivel gratis, Google puede usar lo que envías para mejorar sus modelos.</p>
                    {!hasGeminiKey && <p className="text-red-300/80">Falta tu clave de Gemini (abajo).</p>}
                </Card>
                <Card id="propia" icon={<KeyRound size={15} />} title="2 · Tu clave de pago" price="Pagas tú, directo a Google o Anthropic">
                    <p className="flex gap-1 text-emerald-300/80"><ShieldCheck size={12} className="mt-0.5 shrink-0" />Con APIs de pago tu escritura no se usa para entrenar modelos.</p>
                    <p>{hasAnthropicKey ? 'Director, Arquitecto, Reporte y Personajes usan Claude con tu clave.' : 'Con una clave de Anthropic, la conversación usa Claude (lo más fino para narrativa).'}</p>
                    <p className="text-titanium-500">Aprox.: mensaje a Mira US$ 0,02–0,04 · reporte de capítulo US$ 0,10.</p>
                    {level === 'propia' && status && (status.byokCalls || 0) > 0 && <p className="text-titanium-300">Este mes con tu clave: US$ {usd(status.byokCostUsd || 0)} en {status.byokCalls} llamadas.</p>}
                </Card>
                <Card id="myworld" icon={<Sparkles size={15} />} title="3 · MyWorld" price={status?.myworldAvailable ? 'Incluido en tu cuenta' : 'Próximamente · con suscripción'} disabled={!status?.myworldAvailable}>
                    <p>Claude incluido: no necesitas clave de pago. MyWorld paga la IA.</p>
                    {status?.myworldAvailable ? (
                        <>
                            <div className="mt-1 h-1.5 rounded-full bg-titanium-800 overflow-hidden" aria-hidden="true">
                                <div className={`h-full rounded-full ${status.capUsd && status.monthCostUsd >= status.capUsd ? 'bg-red-400' : status.capUsd && status.monthCostUsd >= status.capUsd * 0.8 ? 'bg-amber-300' : 'bg-mira'}`} style={{ width: `${Math.min(100, Math.max(3, status.capUsd ? (status.monthCostUsd / status.capUsd) * 100 : 0))}%` }} />
                            </div>
                            <p className="text-titanium-300">Este mes: US$ {usd(status.monthCostUsd)} de US$ {status.capUsd || 8} en {status.calls} llamadas. Al 80 % pasa a Haiku; al 100 % sigue con Gemini hasta el 1 del mes siguiente.</p>
                            {status.byFeature && Object.keys(status.byFeature).length > 0 && (() => {
                                const rows = Object.entries(status.byFeature).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
                                const tracked = rows.reduce((s, [, v]) => s + v, 0);
                                const before = Math.max(0, status.monthCostUsd - tracked);
                                return (
                                    <div className="mt-1">
                                        <p className="text-titanium-400">En qué se usó:</p>
                                        <ul className="mt-1 flex flex-col gap-0.5">
                                            {rows.map(([k, v]) => (
                                                <li key={k} className="flex justify-between gap-3 text-titanium-300"><span>{FEATURE_NAMES[k] || k}</span><span className="tabular-nums">US$ {usd(v)}</span></li>
                                            ))}
                                            {before >= 0.01 && <li className="flex justify-between gap-3 text-titanium-500"><span>Antes de separar por herramienta</span><span className="tabular-nums">US$ {usd(before)}</span></li>}
                                        </ul>
                                        {status.byTool && Object.keys(status.byTool).length > 0 && (() => {
                                            const tools = Object.entries(status.byTool!).map(([k, v]) => ({ k, cost: v.costUsd || 0, calls: v.calls || 0, ms: v.ms || 0 })).filter(t => t.calls > 0).sort((a, b) => b.cost - a.cost);
                                            const days = Object.entries(status.byDay || {}).sort((a, b) => b[1] - a[1]);
                                            return (
                                                <details className="mt-2">
                                                    <summary className="cursor-pointer text-titanium-400 hover:text-titanium-200">Detalle por tarea</summary>
                                                    <div className="mt-1.5 overflow-x-auto">
                                                        <table className="w-full text-left tabular-nums">
                                                            <thead><tr className="text-titanium-500"><th className="font-normal pr-2">Tarea</th><th className="font-normal px-2 text-right">Veces</th><th className="font-normal px-2 text-right">Espera</th><th className="font-normal px-2 text-right">Cada una</th><th className="font-normal pl-2 text-right">Total</th></tr></thead>
                                                            <tbody>
                                                                {tools.map(t => (
                                                                    <tr key={t.k} className="text-titanium-300">
                                                                        <td className="pr-2">{TOOL_NAMES[t.k] || t.k}</td>
                                                                        <td className="px-2 text-right">{t.calls}</td>
                                                                        <td className="px-2 text-right">{t.ms ? `${Math.round(t.ms / t.calls / 1000)} s` : '·'}</td>
                                                                        <td className="px-2 text-right">US$ {(t.cost / t.calls).toFixed(3)}</td>
                                                                        <td className="pl-2 text-right">US$ {usd(t.cost)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    {days.length > 0 && <p className="mt-1.5 text-titanium-500">Día más caro: el {Number(days[0][0])}, con US$ {usd(days[0][1])}. Cuenta desde que se activó este detalle.</p>}
                                                </details>
                                            );
                                        })()}
                                    </div>
                                );
                            })()}
                        </>
                    ) : <p className="text-titanium-500">Lo abriremos cuando estén listos los planes.</p>}
                </Card>
            </div>

            {level === 'propia' && (
                <label className="mt-3 flex items-center gap-2 text-[12px] text-titanium-300 cursor-pointer">
                    <input type="checkbox" checked={geminiPaid} onChange={e => { setGeminiPaidStored(e.target.checked); setGeminiPaid(e.target.checked); }} className="accent-[var(--color-mira)]" />
                    Mi clave de Gemini tiene facturación activa (usar modelos Gemini Pro)
                </label>
            )}
            {(level === 'myworld' || (level === 'propia' && hasAnthropicKey)) && (
                <div className="mt-3 flex items-center gap-2 text-[12px]">
                    <span className="text-titanium-400">Mira y el Arquitecto:</span>
                    {([
                        { v: 'calidad', label: 'Calidad (Sonnet)', hint: '≈ US$ 0,02–0,04 por mensaje' },
                        { v: 'economico', label: 'Económico (Haiku)', hint: '≈ US$ 0,002 por mensaje' },
                    ] as const).map(opt => (
                        <button key={opt.v} type="button" title={opt.hint}
                            onClick={() => { try { localStorage.setItem('myworld_claude_quality', opt.v); } catch { /* */ } setQuality(opt.v); }}
                            className={`rounded-md border px-2.5 py-1 text-[11px] ${quality === opt.v ? 'border-mira/30 bg-mira/15 text-mira' : 'border-titanium-700 text-titanium-400 hover:text-titanium-200'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
            <p className="mt-2 text-[11px] text-titanium-500">En todos los niveles, la búsqueda en tu canon (encontrar lo relevante de tus archivos) usa tu clave de Gemini: no la borres.</p>
        </div>
    );
}
