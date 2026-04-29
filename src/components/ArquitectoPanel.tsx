import React, { useState, useEffect, useRef } from 'react';
import { Landmark, RefreshCw, Send, Loader2, User, ArrowLeft, Network, Users, Map, Book, Settings, ChevronDown, ChevronUp, Paperclip, FileText, X, GitMerge } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useArquitecto } from '../hooks/useArquitecto';
import { PendingItem } from '../types/roadmap';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ContradiccionesDrawer from './architect/ContradiccionesDrawer';
import ColisionesMap from './architect/ColisionesMap';
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
import { ToolWelcomeCard } from './ToolWelcomeCard';
import { TOOL_WELCOMES } from '../config/toolWelcomes';
import { useToolWelcome } from '../hooks/useToolWelcome';
import { useTier } from '../hooks/useTier';
import { AIMotorBlockedOverlay } from './ui/AIMotorBlockedOverlay';

interface ArquitectoPanelProps {
    onClose: () => void;
    accessToken: string | null;
    folderId: string;
    onPendingItemsUpdate?: (items: PendingItem[]) => void;
}

type ActiveTool = 'none' | 'domino' | 'personajes' | 'patches' | 'map' | 'lore' | 'settings';
type PanelView = 'welcome' | 'intention' | 'chat' | 'reinitializing';

const ArquitectoPanel: React.FC<ArquitectoPanelProps> = ({ onClose, accessToken, folderId, onPendingItemsUpdate }) => {
    const { config } = useProjectConfig();
    const { hasByok } = useTier();
    const projectName = config?.projectName || 'Mi Proyecto';
    
    // Panel View State
    const [panelView, setPanelView] = useState<PanelView>('welcome');
    const [reinitStep, setReinitStep] = useState<0 | 1 | 2>(0);
    const [showReinitConfirm, setShowReinitConfirm] = useState(false);

    const [inputValue, setInputValue] = useState('');
    const [isPendingDrawerOpen, setIsPendingDrawerOpen] = useState(false);
    const [activeTool, setActiveTool] = useState<ActiveTool>('none');
    const arquitectoSessionId = useArquitectoStore(state => state.arquitectoSessionId);
    const isPurging = useArquitectoStore(state => state.isPurging); // 🟢 Fetch isPurging flag

    // Welcome card (primera visita)
    const [showWelcome, dismissWelcome] = useToolWelcome('arquitecto', folderId);

    // File Attachment State
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isUploadingFile, setIsUploadingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
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
        sessionResolved,
        generateRoadmap,
    } = useArquitecto({ accessToken, folderId });

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

    const handleIntentionConfirm = async (goal: string, culturalFile?: {
        fileName: string;
        fileData: string;
        mimeType: string;
    }) => {
        setPanelView('intention'); // Muestra loading state en el modal
        
        try {
            await initialize({
                implementationGoal: goal,
                culturalDocument: culturalFile || null
            });
            setPanelView('chat');
        } catch (e) {
            setPanelView('welcome');
            toast.error('Error al iniciar la sesión. Intenta de nuevo.');
        }
    };

    const handleReinitStart = () => setReinitStep(1);

    const handleReinitConfirm1 = () => setReinitStep(2);

    const handleReinitConfirm2 = async () => {
        setReinitStep(0);
        setPanelView('reinitializing');
        await reinitialize();
        setPanelView('welcome');
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

    if (!hasByok) return <AIMotorBlockedOverlay toolName="El Arquitecto" />;

    return (
        <div className="h-full w-full bg-[#0a0a0a] bg-[radial-gradient(circle_at_50%_30%,#1c1c1e_0%,#0f0f10_80%)] flex flex-col overflow-hidden relative selection:bg-cyan-500/30 font-display">

            {/* Top Drawer: Pendientes — solo en estado chat */}
            {panelView === 'chat' && (
                <div className={`w-full shrink-0 z-30 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out ${isPendingDrawerOpen ? 'max-h-[55vh] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                    {pendingItems.length > 0 && (
                        <ContradiccionesDrawer
                            pendingItems={pendingItems}
                            isOpen={isPendingDrawerOpen}
                            onToggle={() => setIsPendingDrawerOpen(v => !v)}
                            activeItemCode={undefined}
                            onSelectItem={(item) => {
                                sendMessage(`[Retomar disonancia: ${item.code}] ${item.title}`);
                                setIsPendingDrawerOpen(false);
                            }}
                        />
                    )}
                </div>
            )}

            {/* HEADER — siempre visible */}
            <header className="h-14 border-b border-titanium-800 flex items-center justify-between px-6 shrink-0 bg-[#0a0a0a]/80 backdrop-blur-md z-30 relative">
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 text-titanium-500 hover:text-titanium-300 transition-colors group"
                    aria-label="Cerrar Arquitecto"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">El Arquitecto</span>
                </button>

                <div className="text-titanium-500 text-sm font-medium uppercase tracking-wider font-mono">
                    Proyecto: {projectName}
                </div>

                <div className="w-[150px] flex justify-end">
                    {panelView === 'chat' && (
                        <div className="relative">
                            <button
                                onClick={handleReinitStart}
                                className="text-titanium-500 hover:text-titanium-300 text-[12px] font-mono uppercase tracking-wider transition-colors"
                            >
                                Nueva Sesión
                            </button>

                            {/* Primera confirmación */}
                            {reinitStep === 1 && (
                                <div className="absolute right-0 top-full mt-2 bg-titanium-950 border border-titanium-700 rounded-xl p-4 w-64 z-[60] shadow-2xl">
                                    <p className="text-[13px] text-titanium-300 mb-3">
                                        ¿Iniciar una nueva sesión? El progreso actual se preserva pero comenzarás desde cero.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReinitConfirm1}
                                            className="flex-1 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] rounded-lg hover:bg-amber-500/20 transition-colors"
                                        >
                                            Continuar
                                        </button>
                                        <button
                                            onClick={handleReinitCancel}
                                            className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Segunda confirmación */}
                            {reinitStep === 2 && (
                                <div className="absolute right-0 top-full mt-2 bg-titanium-950 border border-red-500/30 rounded-xl p-4 w-64 z-[60] shadow-2xl">
                                    <p className="text-[13px] text-titanium-300 mb-1">
                                        ¿Estás seguro?
                                    </p>
                                    <p className="text-[11px] text-titanium-600 mb-3">
                                        El chat actual no se puede recuperar.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleReinitConfirm2}
                                            className="flex-1 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] rounded-lg hover:bg-red-500/20 transition-colors"
                                        >
                                            Sí, nueva sesión
                                        </button>
                                        <button
                                            onClick={handleReinitCancel}
                                            className="flex-1 py-1.5 text-titanium-500 border border-titanium-700 text-[12px] rounded-lg hover:bg-titanium-800/30 transition-colors"
                                        >
                                            Cancelar
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
                <div className="flex justify-center shrink-0 z-30 bg-[#0a0a0a]/60">
                    <button
                        onClick={() => setIsPendingDrawerOpen(v => !v)}
                        className="flex items-center gap-1.5 px-4 py-1 text-titanium-500 hover:text-cyan-400 transition-colors text-xs font-mono tracking-wider group"
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
                <div className="flex items-center justify-between px-6 py-2 border-b border-titanium-800/50 bg-titanium-950/50 shrink-0 text-[11px] font-mono">
                    <div className="flex items-center gap-2">
                        {pendingItems.length === 0 ? (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                                <span className="text-cyan-500 uppercase tracking-wider">Modo Exploración</span>
                                <span className="text-titanium-700 mx-1">·</span>
                                <span className="text-titanium-600">Sin análisis formal activo</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <span className="text-amber-500 uppercase tracking-wider">Modo Auditoría</span>
                                <span className="text-titanium-700 mx-1">·</span>
                                <span className="text-titanium-600">
                                    {pendingItems.filter(i => !i.resolved).length} disonancia(s) activa(s)
                                </span>
                            </div>
                        )}
                    </div>
                    {pendingItems.length === 0 && hasInitialized && (
                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className="flex items-center gap-1.5 text-titanium-500 hover:text-cyan-400 transition-colors disabled:opacity-40"
                            title="Solicitar análisis formal de disonancias"
                        >
                            {isAnalyzing
                                ? <Loader2 size={11} className="animate-spin" />
                                : <RefreshCw size={11} />
                            }
                            <span>Analizar disonancias</span>
                        </button>
                    )}
                </div>
            )}

            {/* Progreso de sesión */}
            {panelView === 'chat' && hasInitialized && sessionResolved > 0 && (
                <div className="px-6 py-1.5 border-b border-titanium-800/50 bg-titanium-950/30 shrink-0 flex items-center gap-3">
                    <span className="text-[10px] font-mono text-titanium-600 whitespace-nowrap">
                        {sessionResolved} resuelta{sessionResolved !== 1 ? 's' : ''} esta sesión
                    </span>
                    <div className="flex-1 h-1 bg-titanium-800 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-cyan-700 to-cyan-400 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min((sessionResolved / 10) * 100, 100)}%` }}
                        />
                    </div>
                    <span className={`text-[10px] font-mono whitespace-nowrap ${sessionResolved >= 10 ? 'text-cyan-500' : 'text-titanium-700'}`}>
                        {Math.min(sessionResolved, 10)}/10
                    </span>
                </div>
            )}

            {/* Welcome card — primera visita */}
            {showWelcome && (
                <ToolWelcomeCard
                    {...TOOL_WELCOMES.arquitecto}
                    onDismiss={dismissWelcome}
                />
            )}

            {/* Main Workspace Area */}
            <main className={`flex-1 relative flex justify-center w-full overflow-hidden transition-all duration-300 ${activeTool !== 'none' ? 'opacity-70 blur-[1px]' : 'opacity-100'}`}>

                {/* ESTADO: BIENVENIDA */}
                {panelView === 'welcome' && (
                    <WelcomeState
                        projectName={projectName}
                        onStart={() => setPanelView('intention')}
                        onResume={handleResume}
                        onDiscard={handleDiscard}
                        lastSessionDate={lastAnalyzedAt
                            ? new Date(lastAnalyzedAt).toLocaleDateString()
                            : undefined
                        }
                        existingSession={existingSession}
                    />
                )}

                {/* ESTADO: MODAL DE INTENCIÓN */}
                {panelView === 'intention' && (
                    <IntentionModal
                        onConfirm={handleIntentionConfirm}
                        isLoading={isInitializing}
                    />
                )}

                {/* ESTADO: REINICIALIZANDO */}
                {panelView === 'reinitializing' && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60">
                        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                        <p className="text-sm text-titanium-400">Iniciando nueva sesión...</p>
                    </div>
                )}

                {/* ESTADO: CHAT */}
                {panelView === 'chat' && (
                <>

                {/* Chat Feed Container */}
                <div className="w-full max-w-[720px] h-full flex flex-col pt-8 pb-[100px] px-4 overflow-y-auto z-10 scroll-smooth">

                    {/* Messages List */}
                    <div className="flex flex-col gap-6 w-full mt-auto">

                        {(!hasInitialized && isInitializing) ? (
                            <div className="flex flex-col items-center justify-center py-24 opacity-90 w-full">
                                {/* Núcleo de Escaneo */}
                                <div className="relative flex items-center justify-center w-24 h-24 mb-8">
                                    <div className="absolute inset-0 border-2 border-cyan-500/20 rounded-full animate-ping" style={{ animationDuration: '2s' }}></div>
                                    <div className="absolute inset-3 border border-titanium-700 border-t-cyan-500/50 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
                                    <Landmark size={36} className="text-cyan-400 animate-pulse relative z-10" />
                                </div>

                                <div className="text-xl font-medium text-titanium-100 tracking-wide mb-3">
                                    Auditoría Estructural en Curso
                                </div>
                                
                                <div className="text-xs text-cyan-500/80 font-mono mb-8 animate-pulse flex items-center gap-2">
                                    <span className="inline-block w-2 h-2 bg-cyan-500 rounded-full"></span>
                                    MINERÍA MULTI-HOP: EXTRAYENDO CANON
                                </div>
                                {/* Barra de Asimilación (Simulada) */}
                                <div className="w-72 h-1.5 bg-titanium-900 rounded-full overflow-hidden relative shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
                                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-700 to-cyan-400 rounded-full animate-pulse" 
                                         style={{ width: '85%', transition: 'width 8s cubic-bezier(0.1, 0.5, 0.1, 1)' }}>
                                    </div>
                                </div>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center pb-20 opacity-60 gap-3">
                                <Landmark size={40} className="text-titanium-700" />
                                <p className="text-sm font-medium text-titanium-400">
                                    Sesión en modo Exploración
                                </p>
                                <p className="text-[12px] text-titanium-600 max-w-[320px] leading-relaxed">
                                    El Arquitecto está listo para conversar.
                                    Si quieres un análisis formal de tu proyecto,
                                    usa el botón "Analizar disonancias" arriba.
                                </p>
                            </div>
                        ) : (
                            messages.map(msg => {
                                if (msg.role === 'system') {
                                    return (
                                        <div key={msg.id} className="flex justify-center w-full my-1">
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
                                return (
                                <div key={msg.id} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end self-end' : 'items-start'}`}>
                                    <div className={`
                                        border px-5 py-4 rounded-xl text-[15px] leading-[1.6]
                                        ${msg.role === 'user'
                                            ? 'bg-emerald-950/20 border-titanium-800/50 rounded-br-none text-titanium-300 shadow-sm'
                                            : 'bg-titanium-900 border-titanium-800 rounded-bl-none text-titanium-200 shadow-sm'
                                        }
                                    `}>
                                        <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-a:text-cyan-500">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                    <span className={`text-[11px] text-titanium-600 mt-1 uppercase font-mono tracking-widest ${msg.role === 'user' ? 'mr-1' : 'ml-1'}`}>
                                        {msg.role === 'user' ? 'Tú' : 'Arquitecto'}
                                    </span>

                                    {msg.role === 'assistant' && lastDetectedIntent && msg.id === messages[messages.length - 1]?.id && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            {lastDetectedIntent === 'RESOLUCION' && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    ✓ RESOLUCIÓN
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'REFUTACION' && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                    ⚡ REFUTACIÓN
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'CONSULTA' && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                    📖 CONSULTA
                                                </span>
                                            )}
                                            {lastDetectedIntent === 'DEBATE' && (
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-titanium-800 text-titanium-500 border border-titanium-700">
                                                    ⚔ DEBATE
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
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                                    </div>
                                    <span className="text-xs text-titanium-400 font-mono">El Arquitecto está procesando la estructura...</span>
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
                                        className="flex items-center gap-2 px-3 py-1.5 bg-cyan-950/30 border border-cyan-800/50 hover:bg-cyan-900/50 hover:border-cyan-700 rounded-lg text-cyan-400 text-sm font-medium transition-all"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Floating Toolbar (Left) */}
                <div className="absolute left-8 bottom-8 z-20">
                    <div className="bg-titanium-900/70 backdrop-blur-xl border border-titanium-800 rounded-full p-2 flex flex-col gap-3 shadow-2xl">

                        <button
                            onClick={() => setActiveTool(activeTool === 'domino' ? 'none' : 'domino')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'domino' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Network size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Efecto Dominó
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'personajes' ? 'none' : 'personajes')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'personajes' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Users size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30">
                                Personajes
                            </span>
                        </button>

                        <button
                            onClick={() => setActiveTool(activeTool === 'patches' ? 'none' : 'patches')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'patches' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <GitMerge size={20} />
                            
                            {/* Badge para patches */}
                            {pendingDrivePatches.filter(p => p.status === 'pending').length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[9px] font-bold rounded-full flex items-center justify-center z-10">
                                    {pendingDrivePatches.filter(p => p.status === 'pending').length > 9 ? '9+' : pendingDrivePatches.filter(p => p.status === 'pending').length}
                                </span>
                            )}

                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30">
                                Parches de Canon
                            </span>
                        </button>

                        <button 
                            onClick={() => setActiveTool(activeTool === 'map' ? 'none' : 'map')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'map' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Map size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Mundo
                            </span>
                        </button>

                        <button 
                            onClick={() => setActiveTool(activeTool === 'lore' ? 'none' : 'lore')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'lore' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Book size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Lore
                            </span>
                        </button>

                        <button 
                            onClick={() => setActiveTool(activeTool === 'settings' ? 'none' : 'settings')}
                            className={`w-10 h-10 flex items-center justify-center rounded-full transition-all group relative ${activeTool === 'settings' ? 'text-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(7,182,213,0.15)]' : 'text-titanium-500 hover:text-cyan-500 hover:bg-titanium-800/50'}`}
                        >
                            <Settings size={20} />
                            <span className="absolute left-full ml-4 px-2 py-1 bg-titanium-950 border border-titanium-800 rounded text-[11px] font-mono uppercase tracking-wider text-titanium-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                                Ajustes
                            </span>
                        </button>

                    </div>
                </div>

                {/* Chat Input Area */}
                <div className="absolute bottom-6 w-full max-w-[720px] px-4 z-20 flex flex-col gap-2">
                    <div className="relative flex flex-col w-full bg-titanium-950 border border-titanium-600 rounded-xl overflow-hidden shadow-2xl">
                        {/* Indicador de archivo adjunto */}
                        {attachedFile && (
                            <div className="flex items-center gap-2 bg-titanium-900 border-b border-titanium-800 px-3 py-2 text-xs text-cyan-400">
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
                                placeholder={attachedFile ? "Agrega un mensaje a tu documento..." : "Instruye al Arquitecto..."}
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
                                    className="w-10 h-10 flex items-center justify-center rounded-lg text-titanium-500 hover:text-cyan-400 hover:bg-titanium-800/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Adjuntar documento de referencia cultural (PDF)"
                                    aria-label="Adjuntar PDF"
                                >
                                    <Paperclip size={18} />
                                </button>

                                <button
                                    onClick={handleSendWithFile}
                                    disabled={(!inputValue.trim() && !attachedFile) || isThinking || isInitializing || isUploadingFile}
                                    className="w-10 h-10 flex items-center justify-center rounded-lg text-cyan-500 hover:bg-cyan-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    aria-label="Enviar mensaje"
                                >
                                    {isUploadingFile ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="text-center mt-2">
                        <span className="text-[10px] text-titanium-600 font-mono uppercase tracking-widest">
                            El Arquitecto procesa la lógica, tú pones el alma.
                        </span>
                    </div>
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
                {activeTool === 'domino' && <EfectoDomino onClose={() => setActiveTool('none')} />}
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
                title="Mapa de Colisiones"
                icon={<Map size={16} />}
                onClose={() => setActiveTool('none')}
            >
                {activeTool === 'map' && (
                    <ColisionesMap 
                        pendingItems={pendingItems}
                        onSelectItem={(item) => {
                            setActiveTool('none');
                            setIsPendingDrawerOpen(true);
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

            {activeTool === 'settings' && (
                <ArquitectoConfigModal 
                    sessionId={useArquitectoStore.getState().arquitectoSessionId} 
                    onClose={() => setActiveTool('none')} 
                    onPanicResolved={() => setActiveTool('none')} 
                    onReinitialize={reinitialize}
                />
            )}

        </div>
    );
};

export default ArquitectoPanel;
