import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MiraSprite } from './mira/MiraSprite';
import { DraftingCompass as Landmark, RefreshCw, Send, Loader2, User, ArrowLeft, Network, Users, Map, Book, Settings, ChevronDown, ChevronUp, Paperclip, FileText, X, GitMerge, HelpCircle, ListChecks, SpellCheck } from 'lucide-react';
import { callFunction } from '../services/api';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useArquitecto } from '../hooks/useArquitecto';
import { PendingItem } from '../types/roadmap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ContradiccionesDrawer from './architect/ContradiccionesDrawer';
import ColisionesMap from './architect/ColisionesMap';
import FalloDialog from './architect/FalloDialog';
import WorldNamesPanel, { scanWorldNames, reviewCount, type NamesState } from './architect/WorldNamesPanel';
import RoadmapFinalView from './architect/RoadmapFinalView';
import DrivePatches from './architect/DrivePatches';
import ArquitectoPendingWidget from './ArquitectoPendingWidget';
import EfectoDomino from './architect/EfectoDomino';
import PersonajesHerramienta from './architect/PersonajesHerramienta';
import ArquitectoConfigModal from './architect/ArquitectoConfigModal';
import SlideUpPanel from './architect/SlideUpPanel';
import IntentionModal from './architect/IntentionModal';
import WelcomeState from './architect/WelcomeState';
import { useArquitectoStore } from '../stores/useArquitectoStore';
import ArquitectoFocusSelector, { FOCUS_OPTIONS } from './architect/ArquitectoFocusSelector';
import { toast } from 'sonner';
import { useToolWelcome } from '../hooks/useToolWelcome';
import { ArquitectoWelcomeOverlay } from './architect/ArquitectoWelcomeOverlay';
import { useTier } from '../hooks/useTier';
import { AIMotorBlockedOverlay } from './ui/AIMotorBlockedOverlay';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

interface ArquitectoPanelProps {
    onClose: () => void;
    accessToken: string | null;
    folderId: string;
    onPendingItemsUpdate?: (items: PendingItem[]) => void;
    genesisContext?: string | null;
    onGenesisContextConsumed?: () => void;
    // Oct 2026: mensajes que llegan desde el Mapa de Preparar
    handoff?: { text: string; nonce: number } | null;
    onHandoffConsumed?: () => void;
    // Nov 2026: «Ver fallo» → abrir el documento en el pasaje exacto
    onOpenDocument?: (fileId: string, quote: string) => void;
    // Nov 2026: abrir una herramienta al entrar (p. ej. la revisión del canon desde el aviso de Mira en el escritorio)
    openTool?: { tool: 'names'; nonce: number } | null;
}

type ActiveTool = 'none' | 'domino' | 'personajes' | 'patches' | 'map' | 'lore' | 'settings' | 'names';
type PanelView = 'welcome' | 'intention' | 'chat' | 'reinitializing';

const ArquitectoPanel: React.FC<ArquitectoPanelProps> = ({ onClose, accessToken, folderId, onPendingItemsUpdate, genesisContext, onGenesisContextConsumed, handoff, onHandoffConsumed, onOpenDocument, openTool }) => {
    const { config } = useProjectConfig();
    const { hasByok } = useTier();
    const projectName = config?.projectName || 'Mi Proyecto';
    
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tArch = t.architect;

    // Panel View State
    const [panelView, setPanelView] = useState<PanelView>('welcome');
    const [reinitStep, setReinitStep] = useState<0 | 1 | 2>(0);
    const [showReinitConfirm, setShowReinitConfirm] = useState(false);

    const [inputValue, setInputValue] = useState('');
    const [isPendingDrawerOpen, setIsPendingDrawerOpen] = useState(false);
    // Nov 2026: «Ver fallo» y Nombres del mundo
    const [falloItem, setFalloItem] = useState<PendingItem | null>(null);
    const [namesState, setNamesState] = useState<NamesState | null>(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await callFunction<NamesState>('worldNames', { mode: 'get' });
                if (!alive || !s) return;
                setNamesState(s);
                // Mira revisa sola una vez al día, en silencio; solo avisa si encuentra algo.
                const stale = !s.checkedAt || Date.now() - new Date(s.checkedAt).getTime() > 24 * 3600 * 1000;
                if (stale) {
                    const fresh = await scanWorldNames(accessToken).catch(() => null);
                    if (alive && fresh && !fresh.noIndex) setNamesState(fresh);
                }
            } catch { /* sin nombres: no pasa nada */ }
        })();
        return () => { alive = false; };
    }, [folderId]);
    const openNames = reviewCount(namesState);
    useEffect(() => { if (openTool?.tool === 'names') setActiveTool('names'); }, [openTool?.nonce]);
    // Nov 2026: si ignoró el aviso, se lo recuerda una vez más justo antes de hablar con el Arquitecto.
    const [reviewGate, setReviewGate] = useState<null | (() => void)>(null);
    const ackKey = `mw-review-ack-${folderId}`;
    const guardReview = (run: () => void) => {
        let acked = false;
        try { acked = sessionStorage.getItem(ackKey) === '1'; } catch { /* sin almacenamiento */ }
        if (openNames > 0 && !acked) setReviewGate(() => run);
        else run();
    };
    const [activeTool, setActiveTool] = useState<ActiveTool>('none');
    const arquitectoSessionId = useArquitectoStore(state => state.arquitectoSessionId);
    const isPurging = useArquitectoStore(state => state.isPurging); // 🟢 Fetch isPurging flag

    // Welcome card (primera visita)
    const [showWelcome, dismissWelcome] = useToolWelcome('arquitecto', folderId);
    const [forceShowOverlay, setForceShowOverlay] = useState(false);
    const [tourHighlightedTool, setTourHighlightedTool] = useState<string | null>(null);

    // File Attachment State
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Message collapse & accordion state (changes 1 & 4)
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
    const [expandedAccordions, setExpandedAccordions] = useState<Set<string>>(new Set());

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isClosing, setIsClosing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const {
        messages,
        pendingItems,
        isInitializing,
        isThinking,
        isAnalyzing,
        lastAnalyzedAt,
        hasInitialized,
        initialize,
        sendMessage,
        reAnalyze,
        currentObjective,
        setCurrentObjective,
        lastDetectedIntent,
        pendingDrivePatches,
        focusMode,
        setFocusMode,
        reinitialize,
        existingSession,
        resumeSession,
        discardSession,
        archiveSession,
        sessionResolved,
        generateRoadmap,
        appendAssistantMessage,
        roadmapCards,
    } = useArquitecto({ accessToken, folderId });

    // Compute which assistant messages are "old" (2+ exchanges from the latest)
    const oldAssistantMessageIds = useMemo(() => {
        const nonSystem = messages.filter(m => m.role !== 'system');
        const ids = new Set<string>();
        nonSystem.forEach((m, i) => {
            if (m.role === 'assistant' && i < nonSystem.length - 4) {
                ids.add(m.id);
            }
        });
        return ids;
    }, [messages]);

    const toggleMessageExpanded = (id: string) => {
        setExpandedMessages(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const toggleAccordion = (id: string) => {
        setExpandedAccordions(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    // Sincronizar store
    useEffect(() => {
        if (pendingItems.length > 0 && onPendingItemsUpdate) {
            onPendingItemsUpdate(pendingItems);
        }
    }, [pendingItems, onPendingItemsUpdate]);

    // Cambiar a 'chat' solo cuando el usuario pasó explícitamente por el IntentionModal.
    // La condición panelView === 'intention' evita que el onSnapshot de messages (que
    // carga historial al hacer resumeSession) dispare este efecto desde 'welcome'.
    useEffect(() => {
        if (hasInitialized && messages.length > 0 && panelView === 'intention') {
            setPanelView('chat');
        }
    }, [hasInitialized, messages.length, panelView]);

    // Auto-initialize from Genesis context — skips welcome/intention screens entirely
    useEffect(() => {
        if (!genesisContext || panelView !== 'welcome') return;
        const run = async () => {
            setPanelView('intention');
            try {
                await initialize({ implementationGoal: genesisContext });
                setPanelView('chat');
                // Send genesis context as first user message so the Arquitecto
                // analyzes it directly. initialize() may have restored an existing
                // session (ignoring implementationGoal), so we always send explicitly.
                await sendMessage(genesisContext);
            } catch {
                setPanelView('welcome');
                toast.error('Error al iniciar la sesión con el contexto del Génesis.');
            } finally {
                onGenesisContextConsumed?.();
            }
        };
        run();
    }, [genesisContext]);

    // Oct 2026: el Mapa manda un tema al Arquitecto. Con sesión abierta se envía como mensaje;
    // si no, abre una sesión «Conectar» con ese tema.
    useEffect(() => {
        if (!handoff?.text) return;
        const run = async () => {
            try {
                if (panelView === 'chat' && hasInitialized) {
                    await sendMessage(handoff.text);
                } else {
                    setPanelView('intention');
                    await initialize({ implementationGoal: handoff.text });
                    setPanelView('chat');
                }
            } catch {
                toast.error('No pude llevar eso al Arquitecto.');
            } finally {
                onHandoffConsumed?.();
            }
        };
        run();
    }, [handoff?.nonce]);

    const handleIntentionConfirm = async (goal: string, culturalFile?: {
        fileName: string;
        fileData: string;
        mimeType: string;
    }) => {
        setPanelView('intention'); // Muestra loading state en el modal
        try { localStorage.setItem(`mw-arq-started-${folderId}`, '1'); } catch { /* sin almacenamiento */ }
        
        try {
            await initialize({
                implementationGoal: goal,
                culturalDocument: culturalFile || null,
                forceNew: true, // el autor eligió empezar: no restaurar la conversación anterior
            });
            setPanelView('chat');
        } catch (e) {
            setPanelView('welcome');
            toast.error('Error al iniciar la sesión. Intenta de nuevo.');
        }
    };

    const handleReinitStart = () => setReinitStep(1);

    const handleReinitConfirm1 = () => setReinitStep(2);

    // Nov 2026: antes de empezar otra, se guarda el resumen de la anterior (decisiones y dudas) para que no se pierda.
    const summarizeInBackground = (sid?: string | null) => {
        if (!sid) return;
        callFunction('arquitectoCerrarSesion', { sessionId: sid, accessToken }, { timeout: 180000 }).catch(() => { /* si falla, la conversación sigue guardada */ });
    };
    const handleReinitConfirm2 = async () => {
        setReinitStep(0);
        setPanelView('reinitializing');
        const prevId = arquitectoSessionId;
        summarizeInBackground(prevId);
        await archiveSession(prevId);
        await reinitialize();
        setPanelView('intention');
    };
    const handleStartFresh = async () => {
        const prevId = existingSession?.id;
        summarizeInBackground(prevId);
        await archiveSession(prevId);
        await reinitialize();
        setPanelView('intention');
    };

    const handleReinitCancel = () => setReinitStep(0);

    const handleResume = async () => {
        await resumeSession();
        setPanelView('chat');
    };

    const handleDiscard = async () => {
        await discardSession();
        setPanelView('intention');
    };

    // Nov 2026: los códigos de los avisos (ARQ-003) se vuelven un botón «Ver fallo» con el pasaje exacto.
    const itemsByCode = useMemo(() => new globalThis.Map(pendingItems.map(i => [i.code, i] as const)), [pendingItems]);
    const renderArq = (text: string) => {
        const withLinks = text.replace(/[(\[]?\b(ARQ-\d{2,4})\b[)\]]?/g, (_m, code: string) => itemsByCode.has(code) ? ` [Ver fallo](#fallo-${code})` : '');
        return (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                a: ({ href, children }) => {
                    const m = String(href || '').match(/^#fallo-(ARQ-\d+)$/);
                    if (m) {
                        const it = itemsByCode.get(m[1]);
                        return (
                            <button type="button" onClick={() => it && setFalloItem(it)}
                                className="not-prose inline-flex items-center align-baseline mx-0.5 px-2 py-px rounded-md border border-mira/40 text-mira hover:text-titanium-50 hover:border-mira/70 text-[13px] font-sans leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">
                                {children}
                            </button>
                        );
                    }
                    return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                },
            }}>{withLinks}</ReactMarkdown>
        );
    };

    // 🟢 Fix Bug 1: Abrir drawer automáticamente si hay pendingItems restaurados del cache
    useEffect(() => {
        if (pendingItems.length > 0 && messages.length <= 1) {
            setIsPendingDrawerOpen(true);
        }
    }, [pendingItems.length, messages.length]);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [inputValue]);

    const handleFileAttach = async (file: File) => {
        if (!file || file.type !== 'application/pdf') {
            toast.error("Solo se aceptan archivos PDF como referencia cultural.");
            return;
        }
        
        if (file.size > 10 * 1024 * 1024) { // 10MB max
            toast.error("El archivo no debe superar 10MB.");
            return;
        }
        
        setAttachedFile(file);
        toast.success(`📎 "${file.name}" listo para enviar con tu próximo mensaje.`);
    };

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = (reader.result as string).split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleSendWithFile = async () => {
        if (!inputValue.trim() && !attachedFile) return;
        if (isThinking || isUploadingFile) return;
        
        const currentInput = inputValue.trim();
        const currentFile = attachedFile;

        // Limpiar inmediatamente para feedback UX
        setInputValue('');
        setAttachedFile(null);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        if (currentFile) {
            setIsUploadingFile(true);
            try {
                // Convertir a base64 para enviar al backend
                const base64 = await fileToBase64(currentFile);
                
                // Enviar mensaje con archivo
                await sendMessage(currentInput, {
                    fileName: currentFile.name,
                    fileData: base64,
                    mimeType: 'application/pdf'
                });
            } catch (e) {
                toast.error("Error al procesar el archivo.");
                // Opcional: restaurar el input si falla, pero el requerimiento pide limpiar
            } finally {
                setIsUploadingFile(false);
            }
        } else {
            await sendMessage(currentInput);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendWithFile();
        }
    };

    // Oct 2026: cerrar la sesión con un resumen (llega al chat por el listener de mensajes).
    const handleCloseSession = async () => {
        if (!arquitectoSessionId || isClosing) return;
        // Evitar resúmenes duplicados: si lo último ya es el resumen, confirmar antes de gastar otro.
        const lastMsg = messages.filter(m => m.role !== 'system').slice(-1)[0];
        if (lastMsg?.role === 'assistant' && /##\s*(Ideas sueltas|Conexiones que decidiste|Por decidir)/.test(lastMsg.text || '')
            && !window.confirm('Ya resumiste esta sesión y no has escrito nada nuevo desde entonces. ¿Resumir otra vez? (crea otra nota en Recursos)')) return;
        setIsClosing(true);
        try {
            const r = await callFunction<{ summary: string; savedAs?: string | null }>('arquitectoCerrarSesion', { sessionId: arquitectoSessionId, accessToken }, { timeout: 180000 });
            if (r?.summary) appendAssistantMessage(r.summary);
            toast.success('Sesión resumida.', { description: r?.savedAs ? `Guardada en ${r.savedAs}.` : undefined });
        } catch (e: any) {
            toast.error(e?.message || 'No pude resumir la sesión.');
        } finally {
            setIsClosing(false);
        }
    };

    const handleAnalyze = () => {
        reAnalyze();
        setIsPendingDrawerOpen(true);
    };

    const lastAiMessageObj = messages.filter(m => m.role === 'assistant').pop();
    const lastAiMessage = lastAiMessageObj?.text || '';
    
    // Triage chips reactive logic
    const availableChips = FOCUS_OPTIONS.filter(opt => 
        lastAiMessage.toLowerCase().includes(opt.label.toLowerCase()) || 
        lastAiMessage.toLowerCase().includes(opt.shortName.toLowerCase())
    );

    const handleChipClick = (opt: any) => {
        setCurrentObjective(opt.label);
        sendMessage(`He elegido: ${opt.label}`);
    };

    if (!hasByok) return <AIMotorBlockedOverlay toolName={tArch.toolName || "El Arquitecto"} />;

    return (
        <div className="h-full w-full bg-titanium-950 bg-[radial-gradient(circle_at_50%_30%,#1c1c1e_0%,#0f0f10_80%)] flex flex-col overflow-hidden relative selection:bg-mira/30 font-display">

            {/* Top Drawer: Pendientes — solo en estado chat */}
            {panelView === 'chat' && (
                <div className={`w-full shrink-0 z-30 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${isPendingDrawerOpen ? 'max-h-[55vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                    {pendingItems.length > 0 && (
                        <ContradiccionesDrawer
                            pendingItems={pendingItems}
                            isOpen={isPendingDrawerOpen}
                            onToggle={() => setIsPendingDrawerOpen(v => !v)}
                            activeItemCode={undefined}
                            onShowFallo={setFalloItem}
                            onSelectItem={(item) => {
                                sendMessage(`[Retomar disonancia: ${item.code}] ${item.title}`);
                                setIsPendingDrawerOpen(false);
                            }}
                        />
                    )}
                </div>
            )}

            {/* HEADER — siempre visible */}
            <header className="h-14 border-b border-titanium-800 flex items-center justify-between px-6 shrink-0 bg-titanium-950/80 backdrop-blur-md z-30 relative">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-titanium-500 hover:text-titanium-300 transition-colors group"
                    aria-label="Cerrar Arquitecto"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm">{currentLanguage === 'en' ? 'Back to the desk' : 'Volver al escritorio'}</span>
                </button>

                <div className="font-serif text-[15px] text-titanium-300 truncate px-4">
                    {projectName}
                </div>

                <div className="w-[190px] flex justify-end">
                    {/* Nov 2026: acceso fijo a la revisión del canon fuera del chat (en el chat está en el riel). */}
                    {panelView !== 'chat' && (
                        <button
                            onClick={() => setActiveTool('names')}
                            className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-titanium-700 hover:border-mira/60 text-[13px] text-titanium-200 hover:text-titanium-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60"
                        >
                            <SpellCheck size={15} aria-hidden="true" className="text-mira" />
                            Revisar el canon
                            {openNames > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-mira text-titanium-950 text-xs font-bold inline-flex items-center justify-center tabular-nums">{openNames}</span>}
                        </button>
                    )}
                    {panelView === 'chat' && (
                        <div className="relative">
                                <button
                                    onClick={handleReinitStart}
                                    className="text-titanium-400 hover:text-titanium-100 text-[13px] transition-colors"
                                >
                                    {currentLanguage === 'en' ? 'New conversation' : 'Nueva conversación'}
                                </button>

                            {/* Primera confirmación */}
                            {reinitStep === 1 && (
                            <div className="absolute right-0 top-full mt-2 bg-titanium-950 border border-titanium-700 rounded-xl p-4 w-64 z-[60] shadow-2xl">
                                    <p className="text-[13px] text-titanium-300 mb-3">
                                        {tArch.confirmReinit}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReinitConfirm1}
                                            className="flex-1 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] rounded-lg hover:bg-amber-500/20 transition-colors"
                                        >
                                            {t.common.confirm}
                                        </button>
                                        <button
                                            onClick={handleReinitCancel}
                                            className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                        >
                                            {t.common.cancel}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Segunda confirmación */}
                            {reinitStep === 2 && (
                                <div className="absolute right-0 top-full mt-2 bg-titanium-950 border border-red-500/30 rounded-xl p-4 w-64 z-[60] shadow-2xl">
                                    <p className="text-[13px] text-titanium-300 mb-1">
                                        {tArch.confirmSure}
                                    </p>
                                    <p className="text-xs text-titanium-600 mb-3">
                                        {tArch.irrecoverableChat}
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReinitConfirm2}
                                            className="flex-1 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] rounded-lg hover:bg-red-500/20 transition-colors"
                                        >
                                            {tArch.yesNewSession}
                                        </button>
                                        <button
                                            onClick={handleReinitCancel}
                                            className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                        >
                                            {t.common.cancel}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            {/* Chevron toggle — solo en estado chat */}
            {panelView === 'chat' && pendingItems.length > 0 && (
                <div className="flex justify-center shrink-0 z-30 bg-titanium-950/60">
                    <button
                        onClick={() => setIsPendingDrawerOpen(v => !v)}
                        className="flex items-center gap-1.5 px-4 py-1 text-titanium-500 hover:text-mira transition-colors text-xs group"
                        aria-label={isPendingDrawerOpen ? 'Cerrar misiones' : 'Ver misiones pendientes'}
                        title={isPendingDrawerOpen ? 'Cerrar misiones' : 'Ver misiones pendientes'}
                    >
                        {isPendingDrawerOpen
                            ? <ChevronUp size={14} className="group-hover:scale-110 transition-transform" />
                            : <ChevronDown size={14} className="group-hover:scale-110 transition-transform" />}
                    </button>
                </div>
            )}

            {/* Barra de modo — solo en estado chat */}
            {panelView === 'chat' && (
                <div className="flex items-center justify-between px-6 py-2 border-b border-titanium-800/50 bg-titanium-950/50 shrink-0 text-xs">
                    <div className="flex items-center gap-2">
                        {pendingItems.length === 0 ? (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-mira animate-pulse" />
                                <span className="text-titanium-200">Conversación</span>
                                <span className="text-titanium-700 mx-1">·</span>
                                <span className="text-titanium-600">El Arquitecto pregunta; tú decides</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <span className="text-amber-200">Revisando dudas</span>
                                <span className="text-titanium-700 mx-1">·</span>
                                <span className="text-titanium-600">
                                    {(() => { const n = pendingItems.filter(i => !i.resolved).length; return `${n} ${n === 1 ? 'duda abierta' : 'dudas abiertas'}`; })()}
                                </span>
                            </div>
                        )}
                    </div>
                    {hasInitialized && arquitectoSessionId && messages.some(m => m.role === 'user') && (
                        <button
                            onClick={handleCloseSession}
                            disabled={isClosing || isThinking}
                            className="ml-auto mr-4 flex items-center gap-1.5 text-titanium-400 hover:text-mira transition-colors disabled:opacity-40"
                            title="Resumen: ideas sueltas, conexiones que decidiste, lo que falta y una escena que ya puedes escribir"
                        >
                            {isClosing ? <Loader2 size={11} className="animate-spin" /> : <ListChecks size={11} />}
                            <span>Cerrar y resumir</span>
                        </button>
                    )}
                    {pendingItems.length === 0 && hasInitialized && (
                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="flex items-center gap-1.5 text-titanium-500 hover:text-mira transition-colors disabled:opacity-40"
                            title="Solicitar análisis formal de disonancias"
                        >
                            {isAnalyzing
                                ? <Loader2 size={11} className="animate-spin" />
                                : <RefreshCw size={11} />
                            }
                            <span>Buscar dudas en mi canon</span>
                        </button>
                    )}
                </div>
            )}

            {/* Progreso de sesión */}
            {panelView === 'chat' && hasInitialized && sessionResolved > 0 && (
                <div className="px-6 py-1.5 border-b border-titanium-800/50 bg-titanium-950/30 shrink-0 flex items-center gap-3">
                    <span className="text-xs text-titanium-600 whitespace-nowrap">
                        {sessionResolved} resuelta{sessionResolved !== 1 ? 's' : ''} esta sesión
                    </span>
                    <div className="flex-1 h-1 bg-titanium-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-mira/60 to-mira rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((sessionResolved / 10) * 100, 100)}%` }}
                        />
                    </div>
                    <span className={`text-xs whitespace-nowrap ${sessionResolved >= 10 ? 'text-mira' : 'text-titanium-700'}`}>
                        {Math.min(sessionResolved, 10)}/10
                    </span>
                </div>
            )}

            {/* Main Workspace Area */}
            <main className={`flex-1 relative flex flex-col w-full overflow-hidden transition-all duration-300 ${activeTool !== 'none' ? 'opacity-70 blur-[1px]' : 'opacity-100'}`}>

                {/* ESTADO: BIENVENIDA */}
                {panelView === 'welcome' && (
                    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar flex flex-col">
                        {/* Nov 2026: el aviso de Mira también al entrar (antes solo salía después de crear o descartar un chat) */}
                        {openNames > 0 && <NamesBanner state={namesState!} onOpen={() => setActiveTool('names')} />}
                        <div className="flex-1 flex items-center justify-center w-full py-8">
                        <WelcomeState
                            projectName={projectName}
                            onStart={() => guardReview(() => (existingSession ? handleStartFresh() : setPanelView('intention')))}
                            onResume={() => guardReview(handleResume)}
                            onDiscard={handleDiscard}
                            lastSessionDate={lastAnalyzedAt
                                ? new Date(lastAnalyzedAt).toLocaleDateString(currentLanguage === 'en' ? 'en' : 'es', { day: 'numeric', month: 'long' })
                                : undefined
                            }
                            existingSession={existingSession}
                        />
                        </div>
                    </div>
                )}

                {/* ESTADO: MODAL DE INTENCIÓN */}
                {panelView === 'intention' && (
                    <div className="flex-1 min-h-0 w-full overflow-y-auto custom-scrollbar">
                        {openNames > 0 && <NamesBanner state={namesState!} onOpen={() => setActiveTool('names')} />}
                        <IntentionModal
                            onConfirm={(goal, file) => guardReview(() => handleIntentionConfirm(goal, file))}
                            isLoading={isInitializing}
                            isFirstTime={!existingSession && (() => { try { return !localStorage.getItem(`mw-arq-started-${folderId}`); } catch { return false; } })()}
                        />
                    </div>
                )}

                {/* ESTADO: REINICIALIZANDO */}
                {panelView === 'reinitializing' && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60">
                        <div className="w-8 h-8 rounded-full border-2 border-mira border-t-transparent animate-spin" />
                        <p className="text-sm text-titanium-400">Iniciando nueva sesión...</p>
                    </div>
                )}

                {/* ESTADO: CHAT */}
                {panelView === 'chat' && (
                <>
                {/* Scrollable content area — full width so scrollbar sits at page edge */}
                <div className="flex-1 relative overflow-hidden">
                <div className="architect-chat-container h-full w-full overflow-y-auto scroll-smooth">

                    {/* Centered content with breathing room */}
                    <div className="max-w-[800px] mx-auto px-10 pt-8 pb-6 flex flex-col min-h-full">

                    {openNames > 0 && (
                        <div className="-mx-6 mb-4"><NamesBanner state={namesState!} onOpen={() => setActiveTool('names')} /></div>
                    )}

                    {/* Messages List */}
                    <div className="flex flex-col gap-0 w-full mt-auto">

                        {(!hasInitialized && isInitializing) ? (
                            <div className="flex flex-col items-center justify-center py-24 opacity-90 w-full">
                                {/* Núcleo de Escaneo */}
                                <div className="flex items-end gap-2 mb-6">
                                    <img src="/assets/objetos/planos.png" alt="" width={72} height={72} className="w-[72px] h-[72px] mb-2" />
                                    <MiraSprite pose="escribiendo" label="Mira toma notas" />
                                </div>

                                <div className="text-xl font-medium text-titanium-100 tracking-wide mb-3">
                                    {currentLanguage === 'en' ? 'Reading your material…' : 'Leyendo tu material…'}
                                </div>
                                
                                <div className="text-xs text-mira mb-8 animate-pulse flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 bg-mira rounded-full"></span>
                                    {currentLanguage === 'en' ? 'Looking for what connects with what you brought' : 'Buscando lo que se conecta con lo que traes'}
                                </div>
                                {/* Barra de Asimilación (Simulada) */}
                                <div className="w-72 h-1.5 bg-titanium-900 rounded-full overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-mira/60 to-mira rounded-full animate-pulse" 
                                         style={{ width: '85%', transition: 'width 8s cubic-bezier(0.1, 0.5, 0.1, 1)' }}>
                                    </div>
                                </div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center pb-20 opacity-60 gap-3">
                                <Landmark size={40} className="text-titanium-700" />
                                <p className="text-sm font-medium text-titanium-400">
                                    {tArch.explorationMode}
                                </p>                                <p className="text-[12px] text-titanium-600 max-w-[320px] leading-relaxed">
                                    {tArch.readyToTalk || "El Arquitecto está listo para conversar."}
                                    {tArch.useFormalAnalysis || "Si quieres un análisis formal de tu proyecto, usa el botón 'Analizar disonancias' arriba."}
                                </p>
                            </div>
                        ) : (
                            messages.map(msg => {
                                if (msg.role === 'system') {
                                    return (
                                        <div key={msg.id} className="flex justify-center w-full my-3">
                                            {msg.mode === 'break_reminder' && (
                                                <div className="max-w-[85%] bg-titanium-900/50 border border-titanium-700/40 rounded-xl px-5 py-3.5 text-center">
                                                    <p className="text-xs text-titanium-400 leading-relaxed">{msg.text}</p>
                                                </div>
                                            )}
                                            {msg.mode === 'roadmap_reminder' && (
                                                <div className="max-w-[85%] bg-violet-950/20 border border-violet-800/30 rounded-xl px-5 py-3.5 text-center">
                                                    <p className="text-xs text-titanium-400 leading-relaxed mb-3">{msg.text}</p>
                                                    <button
                                                        onClick={generateRoadmap}
                                                        className="text-xs px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
                                                    >
                                                        Cristalizar Roadmap
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                }
                                // USER message
                                if (msg.role === 'user') {
                                    return (
                                        <div key={msg.id} className="flex flex-col max-w-[85%] items-end self-end mb-1">
                                            <div className="border px-5 py-3.5 rounded-2xl rounded-br-sm text-[15px] leading-[1.6] bg-titanium-800 border-titanium-700 text-titanium-100">
                                                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                                                </div>
                                            </div>
                                            <span className="text-xs text-titanium-400 mt-1 mr-1">Tú</span>
                                        </div>
                                    );
                                }
                                // ASSISTANT message — changes 1, 2, 3, 4
                                const isOld = oldAssistantMessageIds.has(msg.id);
                                const isExpanded = expandedMessages.has(msg.id);
                                const wordCount = msg.text.split(/\s+/).filter(Boolean).length;
                                const isLong = !isOld && wordCount > 350;
                                const isAccordionExpanded = expandedAccordions.has(msg.id);
                                const paragraphs = msg.text.split(/\n\n+/);
                                const firstTwoParagraphs = paragraphs.slice(0, 2).join('\n\n');
                                const restParagraphs = paragraphs.slice(2).join('\n\n');
                                const restWordCount = restParagraphs.split(/\s+/).filter(Boolean).length;
                                const newsreaderStyle: React.CSSProperties = { fontFamily: 'var(--font-serif)', fontSize: '16px', lineHeight: '1.75' };
                                return (
                                <div key={msg.id} className="flex flex-col max-w-[88%] items-start mb-7">
                                    <div className="flex items-center gap-2 mb-1.5 ml-1">
                                        <img src="/assets/objetos/planos.png" alt="" width={28} height={28} className="w-7 h-7" />
                                        <span className="font-serif text-sm text-titanium-300">El Arquitecto</span>
                                    </div>
                                    <div className="px-5 py-4 text-titanium-100 w-full rounded-2xl rounded-tl-sm bg-titanium-900 border border-titanium-700">
                                        {isOld && !isExpanded ? (
                                            // Change 1: collapsed old message — show first 3 lines
                                            <div className="relative">
                                                <div className="overflow-hidden" style={{ maxHeight: '84px' }}>
                                                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira" style={newsreaderStyle}>
                                                        {renderArq(msg.text)}
                                                    </div>
                                                </div>
                                                <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
                                                    style={{ background: 'linear-gradient(to top, rgba(28,28,30,0.97), transparent)' }} />
                                            </div>
                                        ) : isLong && !isAccordionExpanded ? (
                                            // Change 4: accordion for long recent messages — show first 2 paragraphs
                                            <div>
                                                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira" style={newsreaderStyle}>
                                                    {renderArq(firstTwoParagraphs)}
                                                </div>
                                                <button onClick={() => toggleAccordion(msg.id)}
                                                    className="mt-3 text-xs text-mira hover:text-mira transition-colors uppercase tracking-wider">
                                                    Ver todo ({restWordCount} palabras más)
                                                </button>
                                            </div>
                                        ) : isLong && isAccordionExpanded ? (
                                            // Change 4: accordion expanded
                                            <div>
                                                <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira" style={newsreaderStyle}>
                                                    {renderArq(firstTwoParagraphs)}
                                                </div>
                                                <div style={{ maxHeight: '5000px', overflow: 'hidden', transition: 'max-height 300ms ease' }}>
                                                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira" style={newsreaderStyle}>
                                                        {renderArq(restParagraphs)}
                                                    </div>
                                                </div>
                                                <button onClick={() => toggleAccordion(msg.id)}
                                                    className="mt-3 text-xs text-mira hover:text-mira transition-colors uppercase tracking-wider">
                                                    Ver menos
                                                </button>
                                            </div>
                                        ) : (
                                            // Normal full display
                                            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-mira" style={newsreaderStyle}>
                                                {renderArq(msg.text)}
                                            </div>
                                        )}
                                    </div>
                                    {isOld && (
                                        <button onClick={() => toggleMessageExpanded(msg.id)}
                                            className="mb-2 text-xs text-mira hover:text-mira transition-colors uppercase tracking-wider">
                                            {isExpanded ? 'Ver menos' : 'Leer la respuesta completa'}
                                        </button>
                                    )}
                                    {lastDetectedIntent && msg.id === messages[messages.length - 1]?.id && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            {lastDetectedIntent === 'RESOLUCION' && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Resolución
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'REFUTACION' && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    Refutación
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'CONSULTA' && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    Consulta
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'DEBATE' && (
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-titanium-800 text-titanium-500 border border-titanium-700">
                                                    Debate
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                );
                            })
                        )}

                        {/* Architect Message (Thinking/Loading state) */}
                        {isThinking && (
                            <div className="flex flex-col items-start max-w-[85%] mt-2">
                                <div className="bg-titanium-900 border border-titanium-800 px-5 py-4 rounded-xl rounded-bl-none flex items-center gap-3 h-[56px]">
                                    <div className="flex gap-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-mira animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-mira animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-mira animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                    <span className="text-xs text-titanium-400">{currentLanguage === 'en' ? 'The Architect is reading your canon…' : 'El Arquitecto revisa tu canon…'}</span>
                                </div>
                            </div>
                        )}

                        {/* Triage Chips Reactivos */}
                        {!currentObjective && availableChips.length > 0 && !isThinking && (
                            <div className="flex flex-wrap gap-2 mt-4 max-w-[85%] self-start animate-in fade-in duration-300">
                                {availableChips.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleChipClick(opt)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-mira-bg border border-mira/40 hover:border-mira rounded-lg text-mira text-sm font-medium transition-all"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    </div>{/* end centered content */}
                </div>{/* end architect-chat-container */}

                {/* Step tour overlay — positioned to the right of the toolbar */}
                {(showWelcome || forceShowOverlay) && (
                    <ArquitectoWelcomeOverlay
                        onDismiss={() => { dismissWelcome(); setForceShowOverlay(false); setTourHighlightedTool(null); }}
                        onHighlight={setTourHighlightedTool}
                    />
                )}

                {/* Floating Toolbar — absolute inside the outer wrapper, never scrolls */}
                <div className="absolute left-6 bottom-4 z-20">
                    <div className="bg-titanium-900/70 backdrop-blur-xl border border-titanium-800 rounded-full p-2 flex flex-col gap-3 shadow-2xl">

                        <button
                            onClick={() => setActiveTool(activeTool === 'domino' ? 'none' : 'domino')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'domino' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'} ${tourHighlightedTool === 'domino' ? 'ring-2 ring-mira/70 ring-offset-1 ring-offset-[#111]' : ''}`}
                        >
                            <Network size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Efecto dominó: qué cambia si cambias algo
                            </span>
                        </button>

                        {/* Nov 2026: «Personajes» quitado: era un marcador vacío. Los personajes viven en El fichero. */}

                        <button
                            onClick={() => setActiveTool(activeTool === 'patches' ? 'none' : 'patches')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'patches' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'} ${tourHighlightedTool === 'patches' ? 'ring-2 ring-mira/70 ring-offset-1 ring-offset-[#111]' : ''}`}
                        >
                            <GitMerge size={20} />
                            
                            {/* Badge para patches */}
                            {pendingDrivePatches.filter(p => p.status === 'pending').length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center z-10">
                                    {pendingDrivePatches.filter(p => p.status === 'pending').length > 9 ? '9+' : pendingDrivePatches.filter(p => p.status === 'pending').length}
                                </span>
                            )}

                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30">
                                Cambios propuestos al canon
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'names' ? 'none' : 'names')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'names' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'}`}
                            aria-label="Revisión del canon"
                        >
                            <SpellCheck size={20} />
                            {openNames > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-mira text-titanium-950 text-[10px] font-bold rounded-full flex items-center justify-center z-10">{openNames}</span>
                            )}
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30">
                                Revisión del canon: nombres y documentos repetidos
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'map' ? 'none' : 'map')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'map' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'} ${tourHighlightedTool === 'map' ? 'ring-2 ring-mira/70 ring-offset-1 ring-offset-[#111]' : ''}`}
                        >
                            <Map size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Mapa de dudas por capa
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'lore' ? 'none' : 'lore')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'lore' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'} ${tourHighlightedTool === 'lore' ? 'ring-2 ring-mira/70 ring-offset-1 ring-offset-[#111]' : ''}`}
                        >
                            <Book size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                El plan (roadmap)
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'settings' ? 'none' : 'settings')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'settings' ? 'text-mira bg-mira/10' : 'text-titanium-500 hover:text-mira hover:bg-titanium-800/50'} ${tourHighlightedTool === 'settings' ? 'ring-2 ring-mira/70 ring-offset-1 ring-offset-[#111]' : ''}`}
                        >
                            <Settings size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Ajustes
                            </span>
                        </button>

                        <div className="w-full h-px bg-titanium-800/60 mx-auto" style={{ width: '60%', marginLeft: '20%' }} />

                        <button
                            onClick={() => setForceShowOverlay(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-full transition-all group relative text-titanium-600 hover:text-mira hover:bg-titanium-800/50"
                        >
                            <HelpCircle size={18} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-xs text-titanium-200 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Tour del panel
                            </span>
                        </button>

                    </div>
                </div>
                </div>{/* end outer scroll wrapper */}

                {/* Chat Input Area — flex sibling, never scrolls */}
                <div className="shrink-0 w-full"
                    style={{ background: 'rgba(10, 12, 18, 0.97)', backdropFilter: 'blur(20px)', borderTop: '1px solid rgba(103, 232, 249, 0.08)' }}>
                    <div className="max-w-[800px] mx-auto px-6 py-4">
                    <div className="relative flex flex-col w-full bg-titanium-900 border border-titanium-800 rounded-xl overflow-hidden shadow-2xl">
                        {/* Indicador de archivo adjunto */}
                        {attachedFile && (
                            <div className="flex items-center gap-2 bg-titanium-900 border-b border-titanium-800 px-3 py-2 text-xs text-mira">
                                <FileText size={14} />
                                <span className="flex-1 truncate">{attachedFile.name}</span>
                                <button 
                                    onClick={() => setAttachedFile(null)}
                                    className="text-titanium-500 hover:text-red-400 ml-1 p-1"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center relative">
                            <textarea
                                ref={textareaRef}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                onKeyDown={handleKeyDown}
                                disabled={isInitializing || isThinking || isUploadingFile}
                                className="w-full bg-transparent border-none text-titanium-300 text-[15px] placeholder:text-titanium-600 focus:ring-0 resize-none py-4 pl-4 pr-24 max-h-[120px]"
                                placeholder={attachedFile ? "Agrega un mensaje a tu documento…" : "Escríbele al Arquitecto…"}
                                rows={1}
                            />
                            
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileAttach(e.target.files[0])}
                            />

                            <div className="absolute right-2 bottom-2 flex gap-1 items-center">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isThinking || isInitializing || isUploadingFile}
                                    className="w-10 h-10 flex items-center justify-center rounded-lg text-titanium-500 hover:text-mira hover:bg-titanium-800/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Adjuntar documento de referencia cultural (PDF)"
                                    aria-label="Adjuntar PDF"
                                >
                                    <Paperclip size={18} />
                                </button>

                                <button
                                    onClick={handleSendWithFile}
                                    disabled={(!inputValue.trim() && !attachedFile) || isThinking || isInitializing || isUploadingFile}
                                    className="w-10 h-10 flex items-center justify-center rounded-lg text-mira hover:bg-mira/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Enviar mensaje"
                                >
                                    {isUploadingFile ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                    </div>{/* end max-w input centering */}
                </div>
                </>
                )}
            </main>

            {/* Overlays - Tools */}
            <SlideUpPanel
                isOpen={activeTool === 'domino'}
                title="Efecto Dominó"
                icon={<Network size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'domino' && <EfectoDomino onClose={() => setActiveTool('none')} roadmapCards={roadmapCards} />}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'personajes'}
                title="Herramienta de Personajes"
                icon={<Users size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'personajes' && <PersonajesHerramienta onClose={() => setActiveTool('none')} />}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'patches'}
                title="Parches de Canon"
                icon={<GitMerge size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'patches' && (
                    <DrivePatches
                        patches={pendingDrivePatches}
                        sessionId={arquitectoSessionId}
                        accessToken={accessToken}
                        onPatchesUpdate={() => {
                            // El onSnapshot actualiza automáticamente
                        }}
                    />
                )}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'map'}
                title="Mapa de dudas"
                icon={<Map size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'map' && (
                    <ColisionesMap
                        pendingItems={pendingItems}
                        onOpenDocument={onOpenDocument}
                        onSelectItem={(item) => {
                            setActiveTool('none');
                            sendMessage(`[Retomar disonancia: ${item.code}] ${item.title}`);
                        }}
                    />
                )}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'lore'}
                title="Roadmap Final"
                icon={<Book size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'lore' && (
                    <RoadmapFinalView sessionId={arquitectoSessionId} />
                )}
            </SlideUpPanel>

            <SlideUpPanel
                isOpen={activeTool === 'names'}
                title="Revisión del canon"
                icon={<SpellCheck size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'names' && (
                    <WorldNamesPanel accessToken={accessToken} initialState={namesState} onStateChange={setNamesState} onOpenDocument={onOpenDocument} />
                )}
            </SlideUpPanel>

            {reviewGate && namesState && (
                <ReviewGate
                    state={namesState}
                    onReview={() => { setReviewGate(null); setActiveTool('names'); }}
                    onContinue={() => { try { sessionStorage.setItem(ackKey, '1'); } catch { /* sin almacenamiento */ } const run = reviewGate; setReviewGate(null); run(); }}
                    onClose={() => setReviewGate(null)}
                />
            )}

            {falloItem && (
                <FalloDialog
                    item={falloItem}
                    onClose={() => setFalloItem(null)}
                    onOpenDocument={onOpenDocument}
                    onDiscuss={(item) => sendMessage(`[Retomar disonancia: ${item.code}] ${item.title}`)}
                />
            )}

            {activeTool === 'settings' && (
                <ArquitectoConfigModal 
                    sessionId={useArquitectoStore.getState().arquitectoSessionId} 
                    onClose={() => setActiveTool('none')} 
                    onPanicResolved={() => setActiveTool('none')} 
                />
            )}

        </div>
    );
};

/** Nov 2026: lo que Mira encontró en el canon, en una frase. */
function reviewSummary(state: NamesState) {
    const g = state.groups?.[0];
    const nG = state.groups?.length || 0;
    const nD = state.docs?.length || 0;
    const parts: string[] = [];
    if (g) parts.push(nG === 1 ? `${g.variants.map(v => `«${v.name}»`).join(' y ')} parecen ser lo mismo con dos nombres` : `hay ${nG} conceptos con dos nombres, como ${g.variants.map(v => `«${v.name}»`).join(' y ')}`);
    if (nD) parts.push(nD === 1 ? 'hay dos documentos casi iguales o sobre el mismo tema' : `hay ${nD} pares de documentos repetidos o casi iguales`);
    const text = parts.join(', y ');
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Aviso de Mira arriba de la mesa. */
function NamesBanner({ state, onOpen }: { state: NamesState; onOpen: () => void }) {
    return (
        <div className="max-w-[700px] mx-auto mt-6 px-6">
            <div className="flex items-center gap-3 rounded-2xl border border-mira/30 bg-mira/10 px-4 py-3">
                <img src="/assets/mira/mira_cara_icono.png" alt="" width={36} height={36} className="w-9 h-9 shrink-0" style={{ imageRendering: 'pixelated' }} />
                <p className="flex-1 text-sm text-titanium-100 leading-relaxed">
                    {reviewSummary(state)}. Resuélvelo antes de hablar con el Arquitecto para que no se confunda.
                </p>
                <button onClick={onOpen} className="shrink-0 px-3 py-1.5 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">Revisar</button>
            </div>
        </div>
    );
}

/** Segundo aviso, justo antes de empezar o seguir la conversación, si el primero se ignoró. */
function ReviewGate({ state, onReview, onContinue, onClose }: { state: NamesState; onReview: () => void; onContinue: () => void; onClose: () => void }) {
    useEffect(() => {
        const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', k);
        return () => window.removeEventListener('keydown', k);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-titanium-950/55 backdrop-blur-[2px]" onMouseDown={onClose} aria-hidden="true" />
            <div role="alertdialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-desc"
                className="relative w-full max-w-[520px] rounded-2xl border border-titanium-700 bg-titanium-950 shadow-[0_30px_80px_rgba(0,0,0,0.55)] p-6 flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <img src="/assets/mira/mira_cara_icono.png" alt="" width={48} height={48} className="w-12 h-12 shrink-0" style={{ imageRendering: 'pixelated' }} />
                    <div className="min-w-0">
                        <h2 id="gate-title" className="font-serif text-xl text-titanium-100">Antes de hablar con el Arquitecto</h2>
                        <p id="gate-desc" className="text-[15px] text-titanium-200 leading-relaxed mt-2">
                            {reviewSummary(state)}. Si el Arquitecto lee las dos versiones, puede tomar una como verdad y construir sobre la equivocada. Te toma un par de minutos.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button onClick={onContinue} className="px-4 py-2 text-sm text-titanium-200 hover:text-titanium-50 rounded-lg border border-titanium-700 hover:border-titanium-500">Hablar igual</button>
                    <button autoFocus onClick={onReview} className="px-4 py-2 text-sm font-medium rounded-lg bg-coral text-on-coral hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira/60">Revisarlo ahora</button>
                </div>
            </div>
        </div>
    );
}

export default ArquitectoPanel;
