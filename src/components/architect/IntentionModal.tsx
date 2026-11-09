import React, { useState, useRef, useMemo } from 'react';
import { Send, Paperclip, X, FileText, Lightbulb } from 'lucide-react';
import { useProjectConfig } from '../../contexts/ProjectConfigContext';
import { readLastDoc } from '../../utils/lastDoc';
import { MiraSprite } from '../mira/MiraSprite';
import { toast } from 'sonner';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface Props {
    onConfirm: (goal: string, file?: {
        fileName: string;
        fileData: string;
        mimeType: string;
    }) => void;
    isLoading: boolean;
    /** Nov 2026: primera conversación con el Arquitecto en este proyecto (no hay sesiones anteriores). */
    isFirstTime?: boolean;
}

export default function IntentionModal({ onConfirm, isLoading, isFirstTime }: Props) {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tArch = t.architect;

    // Oct 2026: el Arquitecto es para ANTES de escribir: conectar ideas y mundo. La auditoría queda como una opción más.
    const isEn = currentLanguage === 'en';
    const SUGGESTION_CHIPS = isEn ? [
        { label: 'I have a new idea', value: 'I have a new idea and I want to see where it fits in my world: ' },
        { label: 'Connect loose pieces', value: "I have several loose ideas and I don't know how to connect them." },
        { label: 'Prepare what comes next', value: 'I want to prepare the next chapter: what has to happen and what is already decided.' },
        { label: "I'm stuck", value: "I'm stuck and I don't know how to move forward." },
        { label: 'Check for contradictions', value: 'I want to check my world for inconsistencies and contradictions.' },
    ] : [
        { label: 'Tengo una idea nueva', value: 'Tengo una idea nueva y quiero ver dónde encaja en mi mundo: ' },
        { label: 'Conectar piezas sueltas', value: 'Tengo varias ideas sueltas y no sé cómo conectarlas.' },
        { label: 'Preparar lo que sigue', value: 'Quiero preparar el próximo capítulo: qué tiene que pasar y qué ya está decidido.' },
        { label: 'Estoy atascado', value: 'Estoy atascado y no sé cómo avanzar.' },
        { label: 'Revisar contradicciones', value: 'Quiero revisar si hay inconsistencias y contradicciones en mi mundo.' },
    ];

    // Nov 2026: la primera vez, el Arquitecto propone cómo empezar según la situación del autor
    // (proyecto vacío, notas traídas de otra app, o ya escribiendo). La propuesta se puede editar antes de enviar.
    const { config, fileTree } = useProjectConfig() as any;
    const projectName = config?.projectName || (isEn ? 'my story' : 'mi historia');
    // Nov 2026: un proyecto recién creado ya tiene carpetas (Universo, Personajes…) pero ningún documento: cuenta
    // como vacío. Antes se le proponía la «sesión de cimientos» de alguien que ya escribe.
    const countDocs = (nodes: any[]): number => (nodes || []).reduce((n, x) => n + (x?.mimeType === 'application/vnd.google-apps.folder' || x?.type === 'folder' || Array.isArray(x?.children) && !x?.mimeType ? countDocs(x?.children || []) : 1), 0);
    const hasCanon = countDocs(fileTree || []) > 2;
    const isWriting = !!readLastDoc(config?.folderId);
    const proposal = useMemo(() => {
        if (!hasCanon) return isEn ? {
            title: 'Start your story from scratch',
            why: 'Your project is empty, so let’s find the premise first.',
            text: `I want to start "${projectName}" from scratch. Help me find the premise: ask me one question at a time about what it is about, who lives it and how it could end. When we have the essentials, put together a first spine of the story (theme, possible ending and 3 to 5 facts that won't change, marked FIXED).`,
        } : {
            title: 'Empezar tu historia desde cero',
            why: 'Tu proyecto está vacío: primero encontremos la premisa.',
            text: `Quiero empezar «${projectName}» desde cero. Ayúdame a encontrar la premisa: hazme una pregunta a la vez sobre de qué trata, quién la vive y cómo podría terminar. Cuando tengamos lo esencial, arma una primera columna de la historia (tema, final posible y de 3 a 5 hechos que no van a cambiar, marcados como FIJO).`,
        };
        const base = isEn
            ? `Let's do a foundations session for "${projectName}". I don't want a detailed map of everything; I want three layers: 1) the spine of the story on one page (theme, ending, order of books if there are several, and the facts that won't change, marked FIXED); 2) one paragraph per book or part, marked PROVISIONAL; 3) the first book in detail: three acts and what each chapter must achieve. For each book, ask me how it will be told if I haven't decided yet (point of view, who narrates and from when, tense), so it is saved as a decision of the book. Use all my canon and what we already decided. Before proposing, tell me which contradictions or gaps must be solved for layer 1, one question at a time.`
            : `Vamos a hacer una sesión de cimientos para «${projectName}». No quiero un mapa detallado de todo: quiero tres capas: 1) la columna de la historia en una página (tema, final, orden de los libros si hay varios y los hechos que no van a cambiar, marcados como FIJO); 2) un párrafo por libro o parte, marcado como PROVISIONAL; 3) el primer libro en detalle: tres actos y qué debe lograr cada capítulo. De cada libro, pregúntame cómo se va a contar si aún no lo decidí (punto de vista, quién narra y desde cuándo, tiempo verbal), para guardarlo como decisión del libro. Usa todo mi canon y lo que ya decidimos. Antes de proponer, dime qué contradicciones o huecos hay que resolver para la capa 1, una pregunta a la vez.`;
        return isWriting ? {
            title: isEn ? 'A foundations session' : 'Una sesión de cimientos',
            why: isEn ? 'You already have canon and you’re writing: let’s give it a direction without freezing everything.' : 'Ya tienes canon y estás escribiendo: démosle rumbo sin congelarlo todo.',
            text: base + (isEn ? ' At the end, give me the verdict on what I already wrote (keep / adjust / heavy edit / rewrite) and what to keep.' : ' Al final, dame el veredicto de lo que ya escribí (seguir / ajustar / editar a fondo / reescribir) y qué conservar.'),
        } : {
            title: isEn ? 'A foundations session' : 'Una sesión de cimientos',
            why: isEn ? 'You have notes and canon but haven’t started writing: a direction first.' : 'Tienes notas y canon pero aún no escribes: primero un rumbo.',
            text: base,
        };
    }, [hasCanon, isWriting, projectName, isEn]);

    const FILTER_CAMERA_TIP = tArch.filterCameraTip || '💡 Si un elemento no aparecerá constantemente en tu obra y es solo un acabado visual o una mención ocasional, no lo desarrolles en profundidad. Primero lo esencial.';

    const [goal, setGoal] = useState('');
    const [attachedFile, setAttachedFile] = useState<{
        fileName: string;
        fileData: string;
        mimeType: string;
    } | null>(null);
    const [isProcessingFile, setIsProcessingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileAttach = async (file: File) => {
        const allowedTypes = ['application/pdf', 'text/markdown', 'text/plain',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        
        if (!allowedTypes.includes(file.type) && !file.name.endsWith('.md')) {
            toast.error(isEn ? 'Only PDF, MD or DOCX files.' : 'Solo se aceptan archivos PDF, MD o DOCX.');
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            toast.error(isEn ? 'The file must be under 15 MB.' : 'El archivo no debe superar 15 MB.');
            return;
        }

        setIsProcessingFile(true);
        try {
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            setAttachedFile({
                fileName: file.name,
                fileData: base64,
                mimeType: file.type || 'text/plain'
            });
        } catch (e) {
            toast.error(isEn ? 'Could not read the file.' : 'No se pudo leer el archivo.');
        } finally {
            setIsProcessingFile(false);
        }
    };

    const handleConfirm = () => {
        const finalGoal = goal.trim() || 'Análisis general del proyecto';
        onConfirm(finalGoal, attachedFile || undefined);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (goal.trim() || attachedFile) handleConfirm();
        }
    };

    return (
        <div className="flex flex-col items-center justify-start px-6 py-10">
            <div className="w-full max-w-[700px] flex flex-col gap-5">
                {/* Encabezado en el lenguaje de la casa */}
                <div className="flex items-end gap-4">
                    <img src="/assets/objetos/planos.png" alt="" width={64} height={64} className="w-16 h-16 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div>
                        <h2 className="font-serif text-2xl font-semibold text-titanium-100">{isEn ? 'What shall we bring to the table today?' : '¿Qué traemos hoy a la mesa?'}</h2>
                        <p className="text-sm text-titanium-400 mt-1">{isEn ? 'The Architect knows your material and helps you connect it. It asks; you decide.' : 'El Arquitecto conoce tu material y te ayuda a conectarlo. Él pregunta; tú decides.'}</p>
                    </div>
                </div>

                {/* Primera vez: propuesta según la situación del autor */}
                {isFirstTime && (
                    <div className="relative mt-20">
                        <MiraSprite pose="sentada" label="Mira" className="absolute right-6 bottom-full -mb-[15px] pointer-events-none" />
                        <div className="rounded-2xl border border-mira/50 bg-mira-bg p-5 flex flex-col gap-2">
                            <div className="text-xs font-semibold text-mira">{isEn ? 'Shall we start here?' : '¿Empezamos por aquí?'}</div>
                            <div className="font-serif text-lg text-titanium-100">{proposal.title}</div>
                            <p className="text-sm text-titanium-300">{proposal.why}</p>
                            <p className="text-[13px] leading-relaxed text-titanium-200 bg-titanium-950/50 border border-titanium-700 rounded-xl px-3 py-2.5">{proposal.text}</p>
                            <div className="flex flex-wrap gap-2 pt-1">
                                <button type="button" onClick={() => onConfirm(proposal.text, attachedFile || undefined)} disabled={isLoading}
                                    className="px-4 py-2 rounded-xl bg-coral text-on-coral text-sm font-semibold hover:brightness-110 disabled:opacity-50">{isEn ? 'Start with this' : 'Empezar con esto'}</button>
                                <button type="button" onClick={() => setGoal(proposal.text)} disabled={isLoading}
                                    className="px-4 py-2 rounded-xl border border-titanium-600 text-sm text-titanium-100 hover:border-mira">{isEn ? 'Edit it first' : 'Editarla primero'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Otras formas de empezar */}
                <div>
                    <div className="text-xs font-semibold text-titanium-400 mb-2">{isFirstTime ? (isEn ? 'Or start another way' : 'O empieza de otra forma') : (isEn ? 'Ways to start' : 'Formas de empezar')}</div>
                    <div className="flex flex-wrap gap-2">
                        {!isFirstTime && (
                            <button onClick={() => setGoal(proposal.text)}
                                className={`px-3 py-1.5 text-[13px] rounded-full border transition-colors ${goal === proposal.text ? 'bg-mira-bg border-mira text-titanium-100' : 'border-titanium-700 text-titanium-300 hover:border-mira/60 hover:text-titanium-100'}`}>
                                {isEn ? 'Foundations session' : 'Sesión de cimientos'}
                            </button>
                        )}
                        {SUGGESTION_CHIPS.map(chip => (
                            <button key={chip.label} onClick={() => setGoal(chip.value)}
                                className={`px-3 py-1.5 text-[13px] rounded-full border transition-colors ${goal === chip.value ? 'bg-mira-bg border-mira text-titanium-100' : 'border-titanium-700 text-titanium-300 hover:border-mira/60 hover:text-titanium-100'}`}>
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Campo de texto */}
                <div className="w-full bg-titanium-900 border border-titanium-700 rounded-2xl overflow-hidden focus-within:border-mira/70 focus-within:ring-2 focus-within:ring-mira/15 transition-colors">
                    <label className="sr-only" htmlFor="arq-goal">{isEn ? 'What you want to achieve' : 'Qué quieres lograr'}</label>
                    <textarea
                        id="arq-goal"
                        value={goal}
                        onChange={e => setGoal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={isEn ? 'Tell the Architect what you want to achieve in this conversation…' : 'Cuéntale al Arquitecto qué quieres lograr en esta conversación…'}
                        className="w-full bg-transparent text-[15px] text-titanium-100 placeholder-titanium-500 px-4 pt-4 pb-2 resize-none focus:outline-none focus-visible:outline-none min-h-[96px] max-h-[220px]"
                        disabled={isLoading}
                    />
                    <div className="flex items-center justify-between gap-3 px-3 pb-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <input ref={fileInputRef} type="file" accept=".pdf,.md,.txt,.docx" className="hidden" onChange={e => e.target.files?.[0] && handleFileAttach(e.target.files[0])} />
                            {attachedFile ? (
                                <div className="flex items-center gap-1.5 bg-mira-bg border border-mira/40 rounded-lg px-2 py-1 min-w-0">
                                    <FileText size={12} className="text-mira shrink-0" />
                                    <span className="text-xs text-titanium-200 truncate max-w-[160px]">{attachedFile.fileName}</span>
                                    <button onClick={() => setAttachedFile(null)} className="text-titanium-400 hover:text-red-300 ml-1" aria-label={isEn ? 'Remove file' : 'Quitar archivo'}><X size={12} /></button>
                                </div>
                            ) : (
                                <button onClick={() => fileInputRef.current?.click()} disabled={isLoading || isProcessingFile}
                                    className="flex items-center gap-1.5 text-titanium-400 hover:text-titanium-100 transition-colors text-[13px] disabled:opacity-40"
                                    title={isEn ? 'Attach a reference (PDF, MD, DOCX)' : 'Adjuntar una referencia (PDF, MD, DOCX)'}>
                                    <Paperclip size={14} /><span>{isEn ? 'Attach a reference' : 'Adjuntar una referencia'}</span>
                                </button>
                            )}
                        </div>
                        <button onClick={handleConfirm} disabled={isLoading || isProcessingFile}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coral text-on-coral text-sm font-semibold hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {isLoading ? (<><div className="w-3.5 h-3.5 rounded-full border-2 border-on-coral border-t-transparent animate-spin" />{isEn ? 'Reading your canon…' : 'Leyendo tu canon…'}</>) : (<><Send size={14} />{isEn ? 'Start the conversation' : 'Empezar la conversación'}</>)}
                        </button>
                    </div>
                </div>

                <div className="flex items-start gap-2 text-[13px] text-titanium-400 leading-relaxed">
                    <Lightbulb size={14} className="text-logro shrink-0 mt-0.5" />
                    <p>{FILTER_CAMERA_TIP.replace(/^💡\s*/, '')}</p>
                </div>
            </div>
        </div>
    );
}
