import React from 'react';
import { BookOpen, Compass, Clapperboard } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface ContinueCardProps {
    projectName: string;
    onGoToArquitecto: () => void;
    onGoToDirector: () => void;
}

const STRINGS: Record<string, Record<string, string>> = {
    es: {
        title: 'Tu mundo ya tiene historia.',
        subtitle: '¿Por dónde quieres continuar?',
        architect: 'Hablar con El Arquitecto',
        director: 'Abrir El Director',
    },
    en: {
        title: 'Your world already has a story.',
        subtitle: 'Where do you want to continue?',
        architect: 'Talk to The Architect',
        director: 'Open The Director',
    },
    ja: {
        title: 'あなたの世界にはすでに物語があります。',
        subtitle: 'どこから続けますか？',
        architect: 'アーキテクトに話す',
        director: 'ディレクターを開く',
    },
    ko: {
        title: '당신의 세계에는 이미 이야기가 있습니다.',
        subtitle: '어디서부터 계속하시겠습니까?',
        architect: '아키텍트와 대화',
        director: '디렉터 열기',
    },
    zh: {
        title: '您的世界已经有了故事。',
        subtitle: '您想从哪里继续？',
        architect: '与架构师交谈',
        director: '打开导演',
    },
};

export default function ContinueCard({ projectName, onGoToArquitecto, onGoToDirector }: ContinueCardProps) {
    const { currentLanguage } = useLanguageStore();
    const s = STRINGS[currentLanguage] ?? STRINGS.es;

    return (
        <div className="flex-1 flex items-center justify-center bg-titanium-950 p-6">
            <div className="w-full max-w-sm text-center space-y-6">
                {/* Icon */}
                <div className="flex justify-center">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-900/20 border border-cyan-500/20 flex items-center justify-center">
                        <BookOpen size={24} className="text-cyan-400" />
                    </div>
                </div>

                {/* Text */}
                <div className="space-y-1.5">
                    <h2 className="text-titanium-100 text-base font-semibold">{s.title}</h2>
                    <p className="text-titanium-500 text-sm">{s.subtitle}</p>
                    {projectName && (
                        <p className="text-titanium-600 text-xs font-mono mt-2 truncate">
                            {projectName}
                        </p>
                    )}
                </div>

                {/* Buttons */}
                <div className="flex flex-col gap-2.5">
                    <button
                        onClick={onGoToArquitecto}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-500/25 text-amber-300 text-sm font-medium hover:bg-amber-900/35 hover:border-amber-500/40 transition-all"
                    >
                        <Compass size={15} />
                        {s.architect}
                    </button>
                    <button
                        onClick={onGoToDirector}
                        className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-purple-900/20 border border-purple-500/25 text-purple-300 text-sm font-medium hover:bg-purple-900/35 hover:border-purple-500/40 transition-all"
                    >
                        <Clapperboard size={15} />
                        {s.director}
                    </button>
                </div>
            </div>
        </div>
    );
}
