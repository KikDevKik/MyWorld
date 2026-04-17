import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';

type WriterProfile = 'novice' | 'experienced' | null;

export interface GenesisAnswers {
    profile?: string;
    readerAge?: string;
    readerReads?: string;
    premise?: string;
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

const QUESTION_BLOCKS = [
    {
        id: 'profile',
        title: '¿Cuál es tu perfil como escritor?',
        description: null,
        type: 'choice' as const,
        options: [
            { label: 'Soy nuevo escribiendo', value: 'novice', description: 'Quiero que me guíen paso a paso' },
            { label: 'Ya tengo experiencia', value: 'experienced', description: 'Prefiero trabajar a mi manera' }
        ]
    },
    {
        id: 'reader',
        title: '¿Para quién escribes?',
        description: 'Conocer a tu lector ideal te ayuda a tomar decisiones de estilo y tono.',
        type: 'fields' as const,
        fields: [
            {
                key: 'readerAge',
                label: '¿Qué edad tiene tu lector ideal?',
                placeholder: 'Ej: Jóvenes adultos de 18-30 años',
                tip: 'No tienes que ser exacto. "Cualquiera" no funciona — la especificidad es lo que conecta.'
            },
            {
                key: 'readerReads',
                label: '¿Qué otros libros o sagas le gustan?',
                placeholder: 'Ej: Harry Potter, The Witcher, Dune...',
                tip: 'Esto define el género y las convenciones que tu lector espera encontrar.'
            }
        ]
    },
    {
        id: 'premise',
        title: 'La premisa',
        description: 'Una sola oración que contenga quién es tu protagonista, qué quiere, y qué se lo impide.',
        type: 'fields' as const,
        fields: [
            {
                key: 'premise',
                label: 'En una oración: ¿de qué trata tu historia?',
                placeholder: 'Ej: Una maga sin poderes descubre que su ciudad es una prisión y debe escapar antes de que le borren la memoria.',
                tip: 'Si no puedes resumirla en una oración, la historia todavía no está clara. No importa si es imperfecta ahora.',
                multiline: true
            }
        ]
    },
    {
        id: 'protagonist',
        title: 'El protagonista',
        description: 'Los personajes memorables no son perfectos — son contradictorios y están rotos de formas específicas.',
        type: 'fields' as const,
        fields: [
            {
                key: 'protagonistDesire',
                label: '¿Qué desea más que nada en el mundo?',
                placeholder: 'Ej: Ser aceptada por su familia, recuperar su reino perdido...',
                tip: 'El deseo mueve la trama. Sin deseo, no hay historia.'
            },
            {
                key: 'protagonistObstacle',
                label: '¿Qué le impide obtenerlo?',
                placeholder: 'Ej: Su propio miedo al fracaso, un enemigo poderoso, una ley injusta...',
                tip: 'Puede ser externo (un villano, una guerra) o interno (una fobia, una mentira que se cree).'
            },
            {
                key: 'protagonistMisbelief',
                label: '¿Qué creencia errónea tiene sobre sí mismo o el mundo?',
                placeholder: 'Ej: Cree que no merece ser amada, que la violencia es la única solución...',
                tip: 'Esta "mentira" que se cree el protagonista es lo que la historia desmantela. Es el corazón emocional de la obra.'
            }
        ]
    },
    {
        id: 'world',
        title: 'El mundo',
        description: 'El escenario no es solo telón de fondo — debe presionar al protagonista y reflejar sus conflictos internos.',
        type: 'fields' as const,
        fields: [
            {
                key: 'worldType',
                label: '¿En qué tipo de mundo se desarrolla?',
                placeholder: 'Ej: Fantasía épica medieval, futuro distópico, realidad contemporánea...',
                tip: 'El género define las convenciones que tu lector espera. Puedes subvertirlas, pero primero debes conocerlas.'
            },
            {
                key: 'worldRule',
                label: '¿Cuál es la regla más importante de ese mundo?',
                placeholder: 'Ej: La magia consume la vida del usuario, los viajes en el tiempo crean paradojas...',
                tip: 'Si tu mundo no tiene reglas claras, la magia puede resolver cualquier problema — y eso mata la tensión.'
            }
        ]
    },
    {
        id: 'conflict',
        title: 'El conflicto y el final',
        description: 'No necesitas tener el final exacto. Pero sí necesitas saber la dirección emocional.',
        type: 'fields' as const,
        fields: [
            {
                key: 'antagonist',
                label: '¿Quién o qué se opone al protagonista?',
                placeholder: 'Ej: Una facción corrupta, su propio pasado, la naturaleza misma...',
                tip: 'El mejor antagonista tiene sus propias razones lógicas. No necesita ser malvado — solo querer algo incompatible con tu protagonista.'
            },
            {
                key: 'emotionalEnding',
                label: '¿Cómo termina emocionalmente la historia?',
                placeholder: 'Ej: Victoria costosa, tragedia que revela la verdad, ambiguo pero esperanzador...',
                tip: 'No tienes que saber el final exacto. Solo la dirección: ¿el protagonista crece o cae?'
            }
        ]
    },
    {
        id: 'style',
        title: '¿Cómo escribes?',
        description: 'Conocer tu estilo te ayuda a planificar sin frustrarte.',
        type: 'choice' as const,
        options: [
            { label: 'Plotter — Necesito planificarlo todo primero', value: 'plotter', description: 'Prefieres tener un mapa antes de empezar a escribir.' },
            { label: 'Pantser — Descubro la historia escribiendo', value: 'pantser', description: 'Las mejores ideas te llegan mientras escribes, no antes.' },
            { label: 'Híbrido — Tengo un esqueleto pero improviso', value: 'hybrid', description: 'Planificas los momentos clave pero dejas espacio para sorprenderte.' }
        ]
    }
];

export default function StartingAssistant({ onClose, onStartGenesis, projectName }: Props) {
    const [currentBlock, setCurrentBlock] = useState(0);
    const [writerProfile, setWriterProfile] = useState<WriterProfile>(null);
    const [answers, setAnswers] = useState<GenesisAnswers>({});
    const [isGenerating, setIsGenerating] = useState(false);

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
        return true;
    };

    return (
        <div className="flex-1 flex flex-col items-center justify-center h-full w-full px-6 py-8 overflow-y-auto bg-titanium-950">
            <div className="w-full max-w-[520px] flex flex-col gap-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-cyan-400" />
                        <span className="text-[11px] font-mono text-titanium-500 uppercase tracking-wider">
                            Asistente de Inicio
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-titanium-700 hover:text-titanium-400 transition-colors text-[11px] font-mono"
                    >
                        Trabajar sin guía →
                    </button>
                </div>

                {/* Progress bar */}
                <div className="h-0.5 bg-titanium-800 rounded-full">
                    <div
                        className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                        style={{ width: `${((currentBlock + 1) / QUESTION_BLOCKS.length) * 100}%` }}
                    />
                </div>

                {/* Title and description */}
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

                {/* Block content */}
                <div className="flex flex-col gap-3">
                    {/* Choice block */}
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

                    {/* Fields block */}
                    {block.type === 'fields' && (
                        <div className="flex flex-col gap-4">
                            {block.fields!.map(field => (
                                <div key={field.key}>
                                    <label className="text-[12px] text-titanium-400 mb-1.5 block">
                                        {field.label}
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

                {/* Navigation */}
                <div className="flex items-center justify-between pt-2">
                    {currentBlock > 0 ? (
                        <button
                            onClick={() => setCurrentBlock(prev => prev - 1)}
                            className="text-[12px] text-titanium-600 hover:text-titanium-400 flex items-center gap-1 transition-colors"
                        >
                            ← Atrás
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
                                Generando...
                            </>
                        ) : currentBlock === 0 && writerProfile === 'experienced' ? (
                            'Trabajar solo →'
                        ) : isLastBlock ? (
                            'Crear mi proyecto ✦'
                        ) : (
                            'Siguiente →'
                        )}
                    </button>
                </div>

                {/* Footer */}
                <p className="text-center text-[10px] text-titanium-800 font-mono uppercase tracking-widest">
                    EL ARQUITECTO PROCESA LA LÓGICA · TÚ PONES EL ALMA
                </p>

            </div>
        </div>
    );
}
