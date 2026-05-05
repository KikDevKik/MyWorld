import React, { useState, useEffect } from 'react';
import { X, Scale, Gavel, Feather, Skull, Loader2, FileText, Type, Maximize2, Minimize2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { callFunction } from '../services/api';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface TribunalPanelProps {
    onClose: () => void;
    initialText?: string;
    currentFileId?: string | null;
    accessToken?: string | null;
}

interface JudgeVerdict {
    verdict: string;
    critique: string;
    score: number;
}

interface TribunalResult {
    architect: JudgeVerdict;
    bard: JudgeVerdict;
    hater: JudgeVerdict;
}

const JUDGE_COLORS = {
    architect: '#fbbf24',
    bard: '#67e8f9',
    hater: '#fc6464',
} as const;

const newsreaderStyle: React.CSSProperties = { fontFamily: "'Newsreader', Georgia, serif" };

const TribunalPanel: React.FC<TribunalPanelProps> = ({ onClose, initialText = '', currentFileId, accessToken }) => {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].tribunal;

    const [text, setText] = useState(initialText);
    const [context, setContext] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<TribunalResult | null>(null);
    const [mode, setMode] = useState<'manual' | 'file'>('manual');
    const [isExpanded, setIsExpanded] = useState(false);
    const [expandedCritiques, setExpandedCritiques] = useState<Set<string>>(new Set());

    // ESC collapses expanded mode
    useEffect(() => {
        if (!isExpanded) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsExpanded(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isExpanded]);

    const toggleCritique = (judge: string) => {
        setExpandedCritiques(prev => {
            const next = new Set(prev);
            if (next.has(judge)) next.delete(judge); else next.add(judge);
            return next;
        });
    };

    const handleSummon = async () => {
        if (mode === 'manual' && !text.trim()) {
            toast.error(t.errorEmpty);
            return;
        }
        if (mode === 'file' && !currentFileId) {
            toast.error(t.errorNoFile);
            return;
        }
        setIsLoading(true);
        try {
            const payload = mode === 'manual'
                ? { text, context }
                : { fileId: currentFileId, accessToken, context, text: '' };
            const verdict = await callFunction<TribunalResult>('summonTheTribunal', payload, { timeout: 300000 });
            setResult(verdict);
            toast.success(t.success);
        } catch (error: any) {
            console.error("Error summoning tribunal:", error);
            if (!error.message?.includes('INVALID_CUSTOM_KEY')) {
                toast.error("El Tribunal está en receso (Error).");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Renders a single judge card with score hierarchy, collapsible critique, and overflow fix
    const renderJudgeCard = (
        judge: 'architect' | 'bard' | 'hater',
        verdict: JudgeVerdict,
        Icon: React.ComponentType<{ size?: number; className?: string }>,
        name: string,
        role: string,
        color: string,
        hoverBorderClass: string
    ) => {
        const isCritiqueVisible = isExpanded || expandedCritiques.has(judge);
        return (
            <div key={judge}
                className={`bg-titanium-900 border border-titanium-700 rounded-xl p-6 shadow-lg relative ${hoverBorderClass} transition-colors flex flex-col`}
                style={{ overflow: 'hidden', maxWidth: '100%' }}>

                {/* Background watermark */}
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Icon size={100} />
                </div>

                {/* Judge identity */}
                <div className="flex items-center gap-3 mb-4 relative z-10 min-w-0">
                    <div className="p-2 rounded-lg shrink-0" style={{ background: `${color}1a`, color }}>
                        <Icon size={20} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-bold text-base text-titanium-100">{name}</h3>
                        <p className="text-xs uppercase tracking-wider" style={{ color }}>{role}</p>
                    </div>
                </div>

                {/* Score — most prominent element */}
                <div className="relative z-10 mb-2"
                    style={{ ...newsreaderStyle, fontSize: '48px', fontWeight: 400, color, lineHeight: 1 }}>
                    {verdict.score}/10
                </div>

                {/* Verdict — italic quote below score */}
                <div className="relative z-10 mb-3"
                    style={{ ...newsreaderStyle, fontStyle: 'italic', fontSize: '14px', color: 'rgba(224,224,224,0.6)', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                    "{verdict.verdict}"
                </div>

                {/* Critique — hidden in normal mode, visible when expanded or toggled */}
                {isCritiqueVisible && (
                    <div className="relative z-10 prose prose-invert prose-sm max-w-none"
                        style={{ ...newsreaderStyle, fontSize: '14px', lineHeight: 1.7, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{verdict.critique}</ReactMarkdown>
                    </div>
                )}

                {/* Collapse toggle — only in normal mode */}
                {!isExpanded && (
                    <button
                        onClick={() => toggleCritique(judge)}
                        className="mt-2 pt-1 text-[11px] font-mono uppercase tracking-wider relative z-10 text-left transition-colors"
                        style={{ color: `${color}80` }}>
                        {expandedCritiques.has(judge) ? 'Colapsar ↑' : 'Leer análisis completo ↓'}
                    </button>
                )}
            </div>
        );
    };

    // Input panel — stacks vertically in normal mode, fixed sidebar in expanded mode
    const inputSection = (
        <div style={{ background: '#111114' }} className={`flex flex-col p-6 gap-4 overflow-y-auto shrink-0 ${
            isExpanded
                ? 'w-[340px] border-r border-titanium-800'
                : 'border-b border-titanium-800'
        }`}>
            {/* Mode toggle */}
            <div className="flex bg-titanium-900 p-1 rounded-lg border border-titanium-800"
                role="radiogroup" aria-label="Selector de modo de entrada">
                <button
                    onClick={() => setMode('manual')}
                    role="radio"
                    aria-checked={mode === 'manual'}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        mode === 'manual' ? 'bg-titanium-800 text-white shadow-sm' : 'text-titanium-400 hover:text-titanium-200'
                    }`}>
                    <Type size={16} />
                    {t.manualText}
                </button>
                <button
                    onClick={() => setMode('file')}
                    role="radio"
                    aria-checked={mode === 'file'}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        mode === 'file' ? 'bg-titanium-800 text-white shadow-sm' : 'text-titanium-400 hover:text-titanium-200'
                    }`}>
                    <FileText size={16} />
                    {t.currentFile}
                </button>
            </div>

            {/* Main input area */}
            <div className="flex flex-col gap-2" style={{ minHeight: isExpanded ? '200px' : '180px' }}>
                <label className="text-xs font-bold text-titanium-400 uppercase tracking-widest">
                    {mode === 'manual' ? t.textLabel : t.fileLabel}
                </label>
                {mode === 'manual' ? (
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={t.manualPlaceholder}
                        className="bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl p-4 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none font-mono text-sm leading-relaxed"
                        style={{ height: isExpanded ? '240px' : '160px' }}
                        aria-label="Texto a juzgar"
                    />
                ) : (
                    <div className="bg-titanium-900 border border-titanium-700 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-3">
                        {currentFileId ? (
                            <>
                                <div className="w-12 h-12 bg-titanium-800 rounded-full flex items-center justify-center text-green-500 animate-pulse">
                                    <FileText size={24} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-titanium-100">{t.linkedDoc}</h3>
                                    <p className="text-titanium-400 text-[10px] mt-1 font-mono" style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}>{currentFileId}</p>
                                </div>
                                <p className="text-xs text-titanium-300">{t.fileWarning}</p>
                            </>
                        ) : (
                            <>
                                <div className="w-12 h-12 bg-titanium-800 rounded-full flex items-center justify-center text-red-500">
                                    <X size={24} />
                                </div>
                                <h3 className="text-sm font-bold text-titanium-100">{t.noFile}</h3>
                                <p className="text-xs text-titanium-400">{t.noFileDesc}</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Context field */}
            <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-titanium-400 uppercase tracking-widest">{t.contextLabel}</label>
                <textarea
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder={t.contextPlaceholder}
                    aria-label="Contexto adicional para el tribunal"
                    className="h-20 bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 transition-all resize-none text-sm"
                />
            </div>

            {/* Summon button */}
            <button
                onClick={handleSummon}
                disabled={isLoading || (mode === 'manual' && !text.trim()) || (mode === 'file' && !currentFileId)}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-900/20 hover:shadow-red-900/40 transform hover:-translate-y-0.5">
                {isLoading ? <Loader2 className="animate-spin" /> : <Gavel size={20} />}
                <span className="tracking-widest">{isLoading ? t.deliberating : t.summonButton}</span>
            </button>
        </div>
    );

    // Verdicts — stacked in normal mode, 3-column grid in expanded mode
    const verdictsSection = (
        <div className="flex-1 p-6 overflow-y-auto"
            style={{ overflowX: 'hidden', minWidth: 0, background: '#111114' }}
            aria-live="polite">
            {!result ? (
                <div className="h-full flex flex-col items-center justify-center text-titanium-600 opacity-50">
                    <Scale size={64} className="mb-4" />
                    <p className="text-lg font-medium">{t.emptyState}</p>
                    <p className="text-sm">{t.emptyDesc}</p>
                </div>
            ) : (
                <div className={isExpanded ? undefined : 'flex flex-col gap-5'}
                    style={isExpanded
                        ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }
                        : {}}>
                    {renderJudgeCard('architect', result.architect, Scale, t.architect, t.architectRole, JUDGE_COLORS.architect, 'hover:border-amber-500/30')}
                    {renderJudgeCard('bard', result.bard, Feather, t.bard, t.bardRole, JUDGE_COLORS.bard, 'hover:border-cyan-500/30')}
                    {renderJudgeCard('hater', result.hater, Skull, t.hater, t.haterRole, JUDGE_COLORS.hater, 'hover:border-red-500/30')}
                </div>
            )}
        </div>
    );

    const panelContent = (
        <div className="w-full h-full flex flex-col text-titanium-100"
            style={{ overflow: 'hidden', maxWidth: '100%', background: '#0c0c0e' }}>
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900 shadow-md z-10 shrink-0">
                <div className="flex items-center gap-3 text-red-500">
                    <Gavel size={24} />
                    <h2 className="font-bold text-xl text-titanium-100 tracking-wider">{t.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExpanded(v => !v)}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                        aria-label={isExpanded ? 'Contraer tribunal' : 'Expandir tribunal'}
                        title={isExpanded ? 'Contraer (ESC)' : 'Expandir vista'}>
                        {isExpanded ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                        aria-label="Cerrar tribunal">
                        <X size={24} />
                    </button>
                </div>
            </div>

            {/* Content — vertical stack in normal mode, horizontal split in expanded mode */}
            <div className={`flex-1 overflow-hidden ${isExpanded ? 'flex flex-row' : 'flex flex-col'}`}>
                {inputSection}
                {verdictsSection}
            </div>
        </div>
    );

    // Expanded overlay
    if (isExpanded) {
        return (
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center"
                style={{ background: 'rgba(0,0,0,0.88)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setIsExpanded(false); }}>
                <div className="w-[92vw] h-[92vh] rounded-xl shadow-2xl overflow-hidden tribunal-expand-anim" style={{ background: '#0c0c0e' }}>
                    {panelContent}
                </div>
            </div>
        );
    }

    return panelContent;
};

export default TribunalPanel;
