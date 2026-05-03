import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTier } from '../../hooks/useTier';
import { AIMotorBlockedOverlay } from '../ui/AIMotorBlockedOverlay';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

type WriterProfile = 'novice' | 'experienced' | null;

export interface GenesisAnswers {
    profile?: string;
    readerAge?: string;
    readerReads?: string;
    premise?: string;
    protagonistName?: string;
    protagonistDesire?: string;
    protagonistObstacle?: string;
    protagonistMisbelief?: string;
    worldType?: string;
    worldRule?: string;
    antagonist?: string;
    emotionalEnding?: string;
    writerStyle?: 'plotter' | 'pantser' | 'hybrid';
}

interface Props {
    onClose: () => void;
    onStartGenesis: (answers: GenesisAnswers) => Promise<void>;
    projectName: string;
}

function getQuestionBlocks(tSA: any) {
    return [
        {
            id: 'profile',
            title: tSA.profileTitle,
            description: null,
            type: 'choice' as const,
            options: [
                { label: tSA.profileNoviceLabel, value: 'novice', description: tSA.profileNoviceDesc },
                { label: tSA.profileExpLabel, value: 'experienced', description: tSA.profileExpDesc }
            ]
        },
        {
            id: 'reader',
            title: tSA.readerTitle,
            description: tSA.readerDesc,
            type: 'fields' as const,
            fields: [
                { key: 'readerAge', label: tSA.readerAgeLabel, placeholder: tSA.readerAgePlaceholder, tip: tSA.readerAgeTip },
                { key: 'readerReads', label: tSA.readerReadsLabel, placeholder: tSA.readerReadsPlaceholder, tip: tSA.readerReadsTip }
            ]
        },
        {
            id: 'premise',
            title: tSA.premiseTitle,
            description: tSA.premiseDesc,
            type: 'fields' as const,
            fields: [
                { key: 'premise', label: tSA.premiseLabel, placeholder: tSA.premisePlaceholder, tip: tSA.premiseTip, multiline: true }
            ]
        },
        {
            id: 'protagonist',
            title: tSA.protagonistTitle,
            description: tSA.protagonistDesc,
            type: 'fields' as const,
            fields: [
                { key: 'protagonistName', label: tSA.protagonistNameLabel, placeholder: tSA.protagonistNamePlaceholder, tip: tSA.protagonistNameTip, required: true, maxLength: 60 },
                { key: 'protagonistDesire', label: tSA.protagonistDesireLabel, placeholder: tSA.protagonistDesirePlaceholder, tip: tSA.protagonistDesireTip },
                { key: 'protagonistObstacle', label: tSA.protagonistObstacleLabel, placeholder: tSA.protagonistObstaclePlaceholder, tip: tSA.protagonistObstacleTip },
                { key: 'protagonistMisbelief', label: tSA.protagonistMisbeliefLabel, placeholder: tSA.protagonistMisbeliefPlaceholder, tip: tSA.protagonistMisbeliefTip }
            ]
        },
        {
            id: 'world',
            title: tSA.worldTitle,
            description: tSA.worldDesc,
            type: 'fields' as const,
            fields: [
                { key: 'worldType', label: tSA.worldTypeLabel, placeholder: tSA.worldTypePlaceholder, tip: tSA.worldTypeTip },
                { key: 'worldRule', label: tSA.worldRuleLabel, placeholder: tSA.worldRulePlaceholder, tip: tSA.worldRuleTip }
            ]
        },
        {
            id: 'conflict',
            title: tSA.conflictTitle,
            description: tSA.conflictDesc,
            type: 'fields' as const,
            fields: [
                { key: 'antagonist', label: tSA.antagonistLabel, placeholder: tSA.antagonistPlaceholder, tip: tSA.antagonistTip },
                { key: 'emotionalEnding', label: tSA.endingLabel, placeholder: tSA.endingPlaceholder, tip: tSA.endingTip }
            ]
        },
        {
            id: 'style',
            title: tSA.styleTitle,
            description: tSA.styleDesc,
            type: 'choice' as const,
            options: [
                { label: tSA.stylePlotterLabel, value: 'plotter', description: tSA.stylePlotterDesc },
                { label: tSA.stylePantserLabel, value: 'pantser', description: tSA.stylePantserDesc },
                { label: tSA.styleHybridLabel, value: 'hybrid', description: tSA.styleHybridDesc }
            ]
        }
    ];
}

export default function StartingAssistant({ onClose, onStartGenesis, projectName }: Props) {
    const { currentLanguage } = useLanguageStore();
    const tSA = TRANSLATIONS[currentLanguage].startingAssistant;

    const [currentBlock, setCurrentBlock] = useState(0);
    const [writerProfile, setWriterProfile] = useState<WriterProfile>(null);
    const [answers, setAnswers] = useState<GenesisAnswers>({});
    const [isGenerating, setIsGenerating] = useState(false);
    const [genesisComplete, setGenesisComplete] = useState(false);
    const { hasByok } = useTier();

    const QUESTION_BLOCKS = getQuestionBlocks(tSA);

    const handleAnswer = (key: string, value: string) => {
        setAnswers(prev => ({ ...prev, [key]: value }));
    };

    const handleNext = async () => {
        if (currentBlock === 0 && writerProfile === 'experienced') {
            onClose();
            return;
        }
        if (currentBlock < QUESTION_BLOCKS.length - 1) {
            setCurrentBlock(prev => prev + 1);
        } else {
            setIsGenerating(true);
            try {
                await onStartGenesis(answers);
                setGenesisComplete(true);
            } catch (e) {
                console.error('Genesis failed:', e);
            } finally {
                setIsGenerating(false);
            }
        }
    };

    const block = QUESTION_BLOCKS[currentBlock];
    const isLastBlock = currentBlock === QUESTION_BLOCKS.length - 1;

    const canAdvance = () => {
        if (block.type === 'choice') {
            if (block.id === 'profile') return writerProfile !== null;
            if (block.id === 'style') return !!answers.writerStyle;
        }
        if (block.type === 'fields') {
            const requiredFields = block.fields!.filter((f: any) => f.required);
            return requiredFields.every((f: any) => (answers as any)[f.key]?.trim().length > 0);
        }
        return true;
    };

    if (genesisComplete) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full w-full px-6 py-8 overflow-y-auto bg-titanium-950">
                <div className="w-full max-w-[520px] flex flex-col gap-6">
                    <div className="flex flex-col items-center gap-3">
                        <div className="text-4xl">✦</div>
                        <h2 className="text-[22px] font-medium text-titanium-100">
                            {tSA.projectExists}
                        </h2>
                        <p className="text-[14px] text-titanium-500 leading-relaxed text-center">
                            {tSA.projectCreated}
                        </p>
                    </div>

                    <div className="bg-titanium-900/40 border border-titanium-800 rounded-xl p-4 text-left">
                        <p className="text-[11px] font-mono text-titanium-600 uppercase tracking-wider mb-3">
                            {tSA.whatYouCreated}
                        </p>
                        <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-2">
                                <span className="text-cyan-500 text-[12px] mt-0.5">→</span>
                                <p className="text-[12px] text-titanium-300">{tSA.premisaCreated}</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-cyan-500 text-[12px] mt-0.5">→</span>
                                <p className="text-[12px] text-titanium-300">{tSA.protagonistCreated}</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-cyan-500 text-[12px] mt-0.5">→</span>
                                <p className="text-[12px] text-titanium-300">{tSA.chapterCreated}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
                        <p className="text-[13px] text-cyan-300 font-medium mb-1">{tSA.whatNow}</p>
                        <p className="text-[12px] text-titanium-500 leading-relaxed">{tSA.openChapter}</p>
                    </div>

                    <div className="flex items-start gap-2 opacity-60">
                        <span className="text-amber-400 text-[12px] shrink-0">💡</span>
                        <p className="text-[11px] text-titanium-600 leading-relaxed italic">{tSA.pedagogicTip}</p>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 font-medium rounded-xl hover:bg-cyan-500/25 transition-all text-[14px]"
                    >
                        {tSA.startWriting}
                    </button>

                    <p className="text-center text-[10px] text-titanium-800 font-mono uppercase tracking-widest">
                        {tSA.footer}
                    </p>
                </div>
            </div>
        );
    }

    if (!hasByok) return <AIMotorBlockedOverlay toolName="El Génesis" />;

    return (
        <div className="flex-1 flex flex-col items-center justify-center h-full w-full px-6 py-8 overflow-y-auto bg-titanium-950">
            <div className="w-full max-w-[520px] flex flex-col gap-6">

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-cyan-400" />
                        <span className="text-[11px] font-mono text-titanium-500 uppercase tracking-wider">
                            {tSA.header}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-titanium-700 hover:text-titanium-400 transition-colors text-[11px] font-mono"
                    >
                        {tSA.workAlone}
                    </button>
                </div>

                <div className="h-0.5 bg-titanium-800 rounded-full">
                    <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${((currentBlock + 1) / QUESTION_BLOCKS.length) * 100}%` }}
                    />
                </div>

                <div>
                    <h2 className="text-[20px] font-medium text-titanium-100 mb-2">
                        {block.title}
                    </h2>
                    {block.description && (
                        <p className="text-[13px] text-titanium-500 leading-relaxed">
                            {block.description}
                        </p>
                    )}
                </div>

                <div className="flex flex-col gap-3">
                    {block.type === 'choice' && block.options!.map(option => {
                        const isSelected = block.id === 'profile'
                            ? writerProfile === option.value
                            : answers.writerStyle === option.value;
                        return (
                            <button
                                key={option.value}
                                onClick={() => {
                                    if (block.id === 'profile') {
                                        setWriterProfile(option.value as WriterProfile);
                                        handleAnswer('profile', option.value);
                                    } else {
                                        handleAnswer('writerStyle', option.value);
                                    }
                                }}
                                className={`w-full text-left p-4 rounded-xl border transition-all ${
                                    isSelected
                                        ? 'bg-cyan-500/10 border-cyan-500/40 text-titanium-200'
                                        : 'bg-titanium-900/40 border-titanium-800 text-titanium-400 hover:border-titanium-600 hover:bg-titanium-900/60'
                                }`}
                            >
                                <p className="text-[14px] font-medium mb-0.5">{option.label}</p>
                                <p className="text-[12px] opacity-60">{option.description}</p>
                            </button>
                        );
                    })}

                    {block.type === 'fields' && (
                        <div className="flex flex-col gap-4">
                            {block.fields!.map((field: any) => (
                                <div key={field.key}>
                                    <label className="text-[12px] text-titanium-400 mb-1.5 block">
                                        {field.label}
                                        {field.required && <span className="text-red-400 ml-1">*</span>}
                                    </label>
                                    {'multiline' in field && field.multiline ? (
                                        <textarea
                                            value={(answers as any)[field.key] || ''}
                                            onChange={e => handleAnswer(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            className="w-full bg-titanium-900 border border-titanium-700 rounded-xl px-4 py-3 text-[13px] text-titanium-200 placeholder-titanium-700 focus:outline-none focus:border-cyan-500/50 resize-none min-h-[90px]"
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={(answers as any)[field.key] || ''}
                                            onChange={e => handleAnswer(field.key, e.target.value)}
                                            placeholder={field.placeholder}
                                            maxLength={field.maxLength}
                                            className="w-full bg-titanium-900 border border-titanium-700 rounded-xl px-4 py-3 text-[13px] text-titanium-200 placeholder-titanium-700 focus:outline-none focus:border-cyan-500/50"
                                        />
                                    )}
                                    {field.tip && (
                                        <p className="text-[11px] text-titanium-700 mt-1.5 leading-relaxed italic">
                                            💡 {field.tip}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between pt-2">
                    {currentBlock > 0 ? (
                        <button
                            onClick={() => setCurrentBlock(prev => prev - 1)}
                            className="text-[12px] text-titanium-600 hover:text-titanium-400 flex items-center gap-1 transition-colors"
                        >
                            {tSA.back}
                        </button>
                    ) : <div />}

                    <button
                        onClick={handleNext}
                        disabled={isGenerating || !canAdvance()}
                        className="flex items-center gap-2 px-6 py-2.5 bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[13px] font-medium rounded-xl hover:bg-cyan-500/25 transition-all disabled:opacity-40"
                    >
                        {isGenerating ? (
                            <>
                                <div className="w-3 h-3 rounded-full border border-cyan-400 border-t-transparent animate-spin" />
                                {tSA.generating}
                            </>
                        ) : currentBlock === 0 && writerProfile === 'experienced' ? (
                            tSA.workSolo
                        ) : isLastBlock ? (
                            tSA.create
                        ) : (
                            tSA.next
                        )}
                    </button>
                </div>

                <p className="text-center text-[10px] text-titanium-800 font-mono uppercase tracking-widest">
                    {tSA.footer}
                </p>
            </div>
        </div>
    );
}
