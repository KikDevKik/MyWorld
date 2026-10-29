// Oct 2026: los 3 niveles de IA (Ajustes → Config IA). Ver hooks/aiLevel.ts.
import React, { useEffect, useState } from 'react';
import { Leaf, KeyRound, Sparkles, Check, Lock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { callFunction } from '../../services/api';
import { AiLevel, getAiLevel, setAiLevelStored, getGeminiPaid, setGeminiPaidStored } from '../../hooks/aiLevel';

const usd = (n: number) => n.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: n > 0 && n < 0.01 ? 3 : 2 });
interface Status { myworldAvailable?: boolean; claudeActive?: boolean; monthCostUsd: number; calls: number; byokCostUsd?: number; byokCalls?: number; capUsd?: number }
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
                className={`relative text-left rounded-xl border p-3.5 transition-colors ${active ? 'border-cyan-500/60 bg-cyan-950/20' : 'border-titanium-800 bg-titanium-950/40 hover:border-titanium-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="flex items-center gap-2">
                    <span className={active ? 'text-cyan-300' : 'text-titanium-400'}>{icon}</span>
                    <span className="text-sm font-medium text-titanium-100">{title}</span>
                    {active && <Check size={14} className="ml-auto text-cyan-300" />}
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
                    <p className="text-titanium-500">Aprox.: mensaje del Director US$ 0,02–0,04 · reporte de capítulo US$ 0,10.</p>
                    {level === 'propia' && status && (status.byokCalls || 0) > 0 && <p className="text-titanium-300">Este mes con tu clave: US$ {usd(status.byokCostUsd || 0)} en {status.byokCalls} llamadas.</p>}
                </Card>
                <Card id="myworld" icon={<Sparkles size={15} />} title="3 · MyWorld" price={status?.myworldAvailable ? 'Incluido en tu cuenta' : 'Próximamente · con suscripción'} disabled={!status?.myworldAvailable}>
                    <p>Claude incluido: no necesitas clave de pago. MyWorld paga la IA.</p>
                    {status?.myworldAvailable ? (
                        <p className="text-titanium-300">Este mes: US$ {usd(status.monthCostUsd)} en {status.calls} llamadas{status.capUsd ? ` · tope US$ ${status.capUsd} (al 80% pasa a Haiku)` : ''}.</p>
                    ) : <p className="text-titanium-500">Lo abriremos cuando estén listos los planes.</p>}
                </Card>
            </div>

            {level === 'propia' && (
                <label className="mt-3 flex items-center gap-2 text-[12px] text-titanium-300 cursor-pointer">
                    <input type="checkbox" checked={geminiPaid} onChange={e => { setGeminiPaidStored(e.target.checked); setGeminiPaid(e.target.checked); }} className="accent-cyan-500" />
                    Mi clave de Gemini tiene facturación activa (usar modelos Gemini Pro)
                </label>
            )}
            {(level === 'myworld' || (level === 'propia' && hasAnthropicKey)) && (
                <div className="mt-3 flex items-center gap-2 text-[12px]">
                    <span className="text-titanium-400">Director y Arquitecto:</span>
                    {([
                        { v: 'calidad', label: 'Calidad (Sonnet)', hint: '≈ US$ 0,02–0,04 por mensaje' },
                        { v: 'economico', label: 'Económico (Haiku)', hint: '≈ US$ 0,002 por mensaje' },
                    ] as const).map(opt => (
                        <button key={opt.v} type="button" title={opt.hint}
                            onClick={() => { try { localStorage.setItem('myworld_claude_quality', opt.v); } catch { /* */ } setQuality(opt.v); }}
                            className={`rounded-md border px-2.5 py-1 text-[11px] ${quality === opt.v ? 'border-purple-400 bg-purple-900/30 text-purple-200' : 'border-titanium-700 text-titanium-400 hover:text-titanium-200'}`}>
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}
            <p className="mt-2 text-[11px] text-titanium-500">En todos los niveles, la búsqueda en tu canon (encontrar lo relevante de tus archivos) usa tu clave de Gemini: no la borres.</p>
        </div>
    );
}
