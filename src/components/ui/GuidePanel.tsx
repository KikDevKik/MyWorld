import React from 'react';
import { X, PenLine, Compass, Clapperboard, Shield, Gavel, FlaskConical } from 'lucide-react';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface GuidePanelProps {
    onClose: () => void;
}

const TOOLS = [
    {
        icon: PenLine,
        color: 'text-cyan-400',
        bg: 'bg-cyan-900/20 border-cyan-500/20',
        nameKey: 'editor' as const,
        descKey: 'editorDesc' as const,
    },
    {
        icon: Compass,
        color: 'text-amber-400',
        bg: 'bg-amber-900/20 border-amber-500/20',
        nameKey: 'architect' as const,
        descKey: 'architectDesc' as const,
    },
    {
        icon: Clapperboard,
        color: 'text-purple-400',
        bg: 'bg-purple-900/20 border-purple-500/20',
        nameKey: 'director' as const,
        descKey: 'directorDesc' as const,
    },
    {
        icon: Shield,
        color: 'text-emerald-400',
        bg: 'bg-emerald-900/20 border-emerald-500/20',
        nameKey: 'guardian' as const,
        descKey: 'guardianDesc' as const,
    },
    {
        icon: Gavel,
        color: 'text-rose-400',
        bg: 'bg-rose-900/20 border-rose-500/20',
        nameKey: 'tribunal' as const,
        descKey: 'tribunalDesc' as const,
    },
    {
        icon: FlaskConical,
        color: 'text-sky-400',
        bg: 'bg-sky-900/20 border-sky-500/20',
        nameKey: 'lab' as const,
        descKey: 'labDesc' as const,
    },
];

const GUIDE_STRINGS: Record<string, Record<string, string>> = {
    es: {
        title: 'Herramientas de MyWorld',
        subtitle: 'Tu arsenal creativo',
        editor: 'El Editor',
        editorDesc: 'Escribe y edita tus documentos con asistencia de IA contextual.',
        architect: 'El Arquitecto',
        architectDesc: 'Analiza tu narrativa, detecta inconsistencias y genera un roadmap de misiones.',
        director: 'Director de Escena',
        directorDesc: 'Gestiona personajes, entidades y la lógica interna de tu mundo.',
        guardian: 'Canon Guardian',
        guardianDesc: 'Detecta contradicciones entre lo que escribes y el canon establecido.',
        tribunal: 'El Tribunal',
        tribunalDesc: 'Evalúa la calidad literaria de tu manuscrito con criterios profesionales.',
        lab: 'Laboratorio de Ideas',
        labDesc: 'Explora referencias culturales e inspiración para enriquecer tu universo.',
    },
    en: {
        title: 'MyWorld Tools',
        subtitle: 'Your creative arsenal',
        editor: 'The Editor',
        editorDesc: 'Write and edit your documents with contextual AI assistance.',
        architect: 'The Architect',
        architectDesc: 'Analyze your narrative, detect inconsistencies, and generate a mission roadmap.',
        director: 'Scene Director',
        directorDesc: 'Manage characters, entities, and the internal logic of your world.',
        guardian: 'Canon Guardian',
        guardianDesc: 'Detects contradictions between what you write and the established canon.',
        tribunal: 'The Tribunal',
        tribunalDesc: 'Evaluates the literary quality of your manuscript with professional criteria.',
        lab: 'Ideas Lab',
        labDesc: 'Explore cultural references and inspiration to enrich your universe.',
    },
    ja: {
        title: 'MyWorldツール',
        subtitle: 'あなたのクリエイティブ武器庫',
        editor: 'エディター',
        editorDesc: 'コンテキストAIアシスタントでドキュメントを執筆・編集。',
        architect: 'アーキテクト',
        architectDesc: 'ナラティブを分析し、矛盾を検出し、ミッションロードマップを生成。',
        director: 'シーンディレクター',
        directorDesc: 'キャラクター、エンティティ、世界の内部ロジックを管理。',
        guardian: 'カノンガーディアン',
        guardianDesc: '執筆内容と確立されたカノンの矛盾を検出。',
        tribunal: 'トリビューナル',
        tribunalDesc: 'プロの基準で原稿の文学的品質を評価。',
        lab: 'アイデアラボ',
        labDesc: '宇宙を豊かにする文化的参照とインスピレーションを探索。',
    },
    ko: {
        title: 'MyWorld 도구',
        subtitle: '당신의 창작 무기고',
        editor: '에디터',
        editorDesc: '컨텍스트 AI 지원으로 문서를 작성하고 편집합니다.',
        architect: '아키텍트',
        architectDesc: '내러티브를 분석하고 불일치를 감지하며 미션 로드맵을 생성합니다.',
        director: '씬 디렉터',
        directorDesc: '캐릭터, 엔티티, 세계의 내부 논리를 관리합니다.',
        guardian: '캐논 가디언',
        guardianDesc: '작성 내용과 확립된 캐논 간의 모순을 감지합니다.',
        tribunal: '트리뷰널',
        tribunalDesc: '전문적인 기준으로 원고의 문학적 품질을 평가합니다.',
        lab: '아이디어 랩',
        labDesc: '우주를 풍요롭게 할 문화적 참고자료와 영감을 탐색합니다.',
    },
    zh: {
        title: 'MyWorld 工具',
        subtitle: '您的创意武器库',
        editor: '编辑器',
        editorDesc: '借助上下文AI辅助撰写和编辑文档。',
        architect: '架构师',
        architectDesc: '分析叙事，检测不一致，并生成任务路线图。',
        director: '场景导演',
        directorDesc: '管理角色、实体和世界的内部逻辑。',
        guardian: '典籍守护者',
        guardianDesc: '检测您的写作与既定典籍之间的矛盾。',
        tribunal: '评审团',
        tribunalDesc: '以专业标准评估手稿的文学质量。',
        lab: '创意实验室',
        labDesc: '探索文化参考和灵感，丰富您的宇宙。',
    },
};

export default function GuidePanel({ onClose }: GuidePanelProps) {
    const { currentLanguage } = useLanguageStore();
    const s = GUIDE_STRINGS[currentLanguage] ?? GUIDE_STRINGS.es;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-[#0d0d10] border border-titanium-800 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-titanium-800">
                    <div>
                        <h2 className="text-sm font-semibold text-titanium-100">{s.title}</h2>
                        <p className="text-xs text-titanium-500 mt-0.5">{s.subtitle}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-titanium-500 hover:text-titanium-200 hover:bg-titanium-800 transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Tool list */}
                <div className="p-3 space-y-1.5 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {TOOLS.map(({ icon: Icon, color, bg, nameKey, descKey }) => (
                        <div
                            key={nameKey}
                            className={`flex items-start gap-3 p-3 rounded-xl border ${bg}`}
                        >
                            <div className={`mt-0.5 shrink-0 ${color}`}>
                                <Icon size={16} />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-titanium-100">{s[nameKey]}</p>
                                <p className="text-[11px] text-titanium-500 mt-0.5 leading-relaxed">{s[descKey]}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
