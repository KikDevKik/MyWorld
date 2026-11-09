import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Send, Loader2, LayoutTemplate, RefreshCcw, AlertCircle } from 'lucide-react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { SessionManagerModal } from './SessionManagerModal';
// 🟢 LAZY LOAD: Break Circular Dependency
const DirectorTools = React.lazy(withNewVersionReload(() => import('./DirectorTools').then(module => ({ default: module.DirectorTools }))));
import { SessionList } from './ui/SessionList';
import { useDirectorChat } from '../hooks/useDirectorChat';
import { ChatMessage } from './director/chat/ChatMessage';
import { CreativeAuditService } from '../services/CreativeAuditService';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useContextStatus } from '../hooks/useContextStatus';
import { toast } from 'sonner';
import { callFunction } from '../services/api';
import { useTier } from '../hooks/useTier';
import { AIMotorBlockedOverlay } from './ui/AIMotorBlockedOverlay';
import ChatInput from './ui/ChatInput';
import { DirectorWelcomeOverlay } from './director/DirectorWelcomeOverlay';
import { useToolWelcome } from '../hooks/useToolWelcome';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';
import { MiraSprite } from './mira/MiraSprite';
import { withNewVersionReload } from '../utils/lazyView';

interface DirectorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    pendingMessage: string | null;
    onClearPendingMessage: () => void;
    activeFileContent?: string;
    activeFileName?: string;
    activeFileId?: string; // 🟢 Added for Inspector
    isFallbackContext?: boolean;
    folderId?: string;
    driftAlerts?: any;
    accessToken?: string | null;
    onInsertContent?: (text: string) => void;
    variant?: 'panel' | 'dialog';
}

export const DirectorPanel: React.FC<DirectorPanelProps> = ({
    isOpen,
    onClose,
    activeSessionId,
    onSessionSelect,
    pendingMessage,
    onClearPendingMessage,
    activeFileContent,
    activeFileName,
    activeFileId,
    isFallbackContext,
    folderId,
    accessToken,
    driftAlerts,
    onInsertContent,
    variant = 'panel'
}) => {
    // 🟢 GLOBAL STORE
    const { isArsenalWide, toggleArsenalWidth, directorWidth } = useLayoutStore();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].director;
    const { hasByok } = useTier();

    // 🟢 RESPONSIVE LAYOUT MODES
    const isSentinelMode = directorWidth < 500;
    const isStrategistMode = directorWidth >= 500 && directorWidth < 900;
    const isWarRoomMode = directorWidth >= 900;

    // 🟢 MOVED UP: USER CONTEXT (Prevents ReferenceError)
    const { user, config } = useProjectConfig();

    // 🟢 HOOK REFACTOR: USE DIRECTOR CHAT
    const {
        messages,
        isThinking,
        isLoadingHistory,
        rescuingIds,
        purgingIds,
        handleSendMessage,
        handleInspector,
        handleTribunal,
        handleContextSync,
        handleRescue,
        handlePurge
    } = useDirectorChat({
        activeSessionId,
        onSessionSelect,
        activeFileContent,
        activeFileName,
        isFallbackContext,
        driftAlerts,
        accessToken,
        folderId,
        userId: user?.uid
    });

    const [showWelcome, dismissWelcome] = useToolWelcome('director', folderId);

    // Nov 2026: lo que dice Mira se guarda como nota en Recursos, nunca dentro del manuscrito.
    // (Antes «Llevar al capítulo» lo reescribía con IA y lo pegaba en el capítulo: la voz tiene que ser del autor.)
    const saveAsNote = useCallback(async (text: string) => {
        if (!accessToken) { toast.error('Conecta tu Drive para guardar notas.'); return; }
        const first = String(text || '').replace(/[#*_>`\[\]]/g, '').split(/(?<=[.!?])\s|\n/).map(s => s.trim()).find(Boolean) || 'Nota de Mira';
        const titulo = `Mira · ${first.slice(0, 60)}${first.length > 60 ? '…' : ''}`;
        try {
            await callFunction('whatIf', { mode: 'saveIdea', titulo, cuerpo: text, origen: 'Mira', accessToken }, { timeout: 120000 });
            toast.success('Nota guardada en Recursos → Ideas (no canon).');
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar la nota.');
        }
    }, [accessToken]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSessionManagerOpen, setIsSessionManagerOpen] = useState(false);

    // Auto-collapse old assistant messages (2+ exchanges behind latest)
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

    const oldAssistantMessageIds = useMemo(() => {
        const exchangeMessages = messages.filter(m =>
            (m.role === 'user' || m.role === 'assistant') &&
            !m.isDriftAlert &&
            m.type !== 'analysis_card' &&
            m.type !== 'verdict_card' &&
            m.type !== 'system_alert'
        );
        const ids = new Set<string>();
        exchangeMessages.forEach((m, i) => {
            if (m.role === 'assistant' && i < exchangeMessages.length - 4) {
                ids.add(m.id);
            }
        });
        return ids;
    }, [messages]);

    const toggleMessageExpanded = useCallback((id: string) => {
        setExpandedMessages(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    // 🟢 LOAD WAR ROOM SESSIONS
    const [embeddedSessions, setEmbeddedSessions] = useState<any[]>([]);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);

    // 🟢 CONTEXT STATUS CHECK
    const { needsReindex } = useContextStatus();
    const [isIndexing, setIsIndexing] = useState(false);

    const handleQuickIndex = async () => {
        if (!config) return;
        setIsIndexing(true);

        const allPaths = [...(config.canonPaths || []), ...(config.resourcePaths || [])];
        const folderIds = allPaths.map(p => p.id);

        try {
            toast.promise(
                callFunction('indexTDB', {
                    folderIds: folderIds,
                    projectId: config.folderId || folderId,
                    accessToken: accessToken, // Passed from prop
                    forceFullReindex: false
                }),
                {
                    loading: t.indexing,
                    success: t.memoryUpdated,
                    error: t.indexError
                }
            );
            // State update will happen via Firestore listener automatically
        } catch (error) {
            console.error("Index Error:", error);
        } finally {
            setIsIndexing(false);
        }
    };

    useEffect(() => {
        if (isWarRoomMode && isOpen) {
            const loadSessions = async () => {
                setIsSessionsLoading(true);
                try {
                    const result = await callFunction<any[]>('getForgeSessions', { type: 'director' });
                    const fetched = result.sort((a, b) =>
                        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                    );
                    setEmbeddedSessions(fetched);
                } catch (e) { console.error("WR Session List Error", e); }
                finally { setIsSessionsLoading(false); }
            };
            loadSessions();
        }
    }, [isWarRoomMode, isOpen]);

    // 🟢 HANDLE PENDING MESSAGE (HANDOFF)
    useEffect(() => {
        if (pendingMessage && isOpen) {
            handleSendMessage(pendingMessage);

            // ⚖️ AUDIT: THE SEED (Director Prompt - Handoff)
            if (user && folderId) {
                CreativeAuditService.logCreativeEvent({
                    projectId: folderId,
                    userId: user.uid,
                    component: 'DirectorPanel',
                    actionType: 'INJECTION',
                    description: 'User sent directive (handoff)',
                    payload: {
                        promptContent: pendingMessage,
                        promptLength: pendingMessage.length,
                        sessionId: activeSessionId
                    }
                });
            }

            onClearPendingMessage();
        }
    }, [pendingMessage, isOpen]);

    // 🟢 AUTO-SCROLL
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isThinking, isLoadingHistory]);

    // Nov 2026: si la respuesta tarda, decirlo (en la prueba con la IA gratis una respuesta tardó 80 s y solo se veía
    // «Revisando tu canon…»).
    const [thinkingSecs, setThinkingSecs] = useState(0);
    useEffect(() => {
        if (!isThinking) { setThinkingSecs(0); return; }
        const t0 = Date.now();
        const id = window.setInterval(() => setThinkingSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
        return () => window.clearInterval(id);
    }, [isThinking]);
    const es = currentLanguage === 'es';
    const thinkingLabel = thinkingSecs < 12 ? (es ? 'Revisando tu canon…' : 'Checking your canon…')
        : thinkingSecs < 35 ? (es ? 'Pensando la respuesta…' : 'Thinking it through…')
            : (es ? 'Está tardando más de lo normal. Puedes cerrar y seguir escribiendo: la respuesta queda aquí.' : 'This is taking longer than usual. You can close this and keep writing: the answer will be here.');

    if (!isOpen) return null;
    if (!hasByok) return <AIMotorBlockedOverlay toolName="El Director" />;

    return (
        <div className={`w-full h-full bg-titanium-950/95 flex flex-col overflow-hidden relative ${variant === 'dialog' ? '' : 'animate-in slide-in-from-right duration-300'}`}>

            <SessionManagerModal
                isOpen={isSessionManagerOpen}
                onClose={() => setIsSessionManagerOpen(false)}
                activeSessionId={activeSessionId}
                onSessionSelect={onSessionSelect}
            />

            {/* 🟢 RE-INDEX ALERT BANNER */}
            {needsReindex && (
                <div className="bg-amber-900/20 border-b border-amber-500/30 p-2 px-4 flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2 text-amber-200/80 text-xs">
                        <AlertCircle size={14} className="text-amber-500" />
                        <span>{t.changesDetected}</span>
                    </div>
                    <button
                        onClick={handleQuickIndex}
                        disabled={isIndexing}
                        className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-[10px] text-amber-300 transition-colors uppercase tracking-wider font-bold"
                    >
                        {isIndexing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCcw size={10} />}
                        {isIndexing ? t.indexing : t.sync}
                    </button>
                </div>
            )}

            {/* HEADER — Nov 2026: nombre de Mira y un estado humano (antes «MIRA / STANDBY»). */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-titanium-800 bg-titanium-900/50">
                <div className="min-w-0">
                    <h2 className="font-serif text-[17px] font-semibold text-titanium-100 leading-tight">{t.title}</h2>
                    <div className="text-xs text-titanium-400 mt-0.5 truncate" aria-live="polite">
                        {isThinking ? thinkingLabel : (activeSessionId && messages.length > 0 ? t.activeSession : t.standby)}
                    </div>
                </div>

                <div className="flex gap-1">
                    <button
                        onClick={() => setIsSessionManagerOpen(true)}
                        className="p-2 text-titanium-400 hover:text-mira transition-colors rounded-lg hover:bg-titanium-800"
                        title={currentLanguage === 'es' ? 'Conversaciones anteriores' : 'Past conversations'}
                        aria-label={currentLanguage === 'es' ? 'Conversaciones anteriores' : 'Past conversations'}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                            width="18" height="18" aria-hidden="true">
                            <circle cx="12" cy="12" r="9"/>
                            <polyline points="12 7 12 12 15.5 14"/>
                        </svg>
                    </button>
                    <button
                        onClick={toggleArsenalWidth}
                        className={`hidden lg:inline-flex p-2 transition-colors rounded-lg hover:bg-titanium-800 ${isArsenalWide ? 'text-mira' : 'text-titanium-400 hover:text-mira'}`}
                        title={t.strategistMode}
                        aria-label={t.strategistMode}
                        aria-pressed={isArsenalWide}
                    >
                        <LayoutTemplate size={18} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 text-titanium-400 hover:text-titanium-100 transition-colors rounded-lg hover:bg-titanium-800"
                        aria-label={currentLanguage === 'es' ? 'Cerrar Mira' : 'Close Mira'}
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            <div className={`flex-1 h-full overflow-hidden relative ${isWarRoomMode ? 'grid grid-cols-[250px_1fr_250px]' : 'flex flex-col'}`}>

                {/* COL 1: SESSIONS (WAR ROOM ONLY) */}
                {isWarRoomMode && (
                    <div className="h-full border-r border-titanium-800 bg-titanium-900/30 flex flex-col min-w-0 overflow-hidden">
                        <div className="p-3 border-b border-titanium-800 text-xs font-bold text-titanium-400 uppercase tracking-wider bg-titanium-900/50">
                            {t.archives}
                        </div>
                        <div className="flex-1 overflow-hidden p-2">
                            {isSessionsLoading ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-titanium-600" /></div>
                            ) : (
                                <SessionList
                                    sessions={embeddedSessions}
                                    activeSessionId={activeSessionId}
                                    onSessionSelect={onSessionSelect}
                                    embedded={true}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* COL 2: CHAT STREAM (CENTER) */}
                <div className="flex-1 h-full flex flex-col min-w-0 overflow-hidden relative">

                    {/* First-visit overlay — upper right, non-blocking */}
                    {showWelcome && (
                        <DirectorWelcomeOverlay onDismiss={dismissWelcome} />
                    )}

                    <div className="director-chat-container flex-1 overflow-y-auto p-4 space-y-2">
                        {isLoadingHistory ? (
                            <div className="flex justify-center items-center h-full text-titanium-500">
                                <Loader2 className="animate-spin" />
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <ChatMessage
                                    key={msg.id}
                                    message={msg}
                                    onRescue={handleRescue}
                                    onPurge={handlePurge}
                                    rescuingIds={rescuingIds}
                                    purgingIds={purgingIds}
                                    onInsert={accessToken ? saveAsNote : undefined}
                                    isOld={oldAssistantMessageIds.has(msg.id)}
                                    isExpanded={expandedMessages.has(msg.id)}
                                    onToggleExpand={toggleMessageExpanded}
                                />
                            ))
                        )}

                        {/* Nov 2026: al empezar, tres preguntas tocables para no quedar ante una pantalla vacía. */}
                        {!isLoadingHistory && !isThinking && !messages.some(m => m.role === 'user') && (
                            <div className="flex flex-wrap gap-2 pl-1 -mt-2">
                                {(currentLanguage === 'es'
                                    ? ['¿Qué sabes de mi protagonista?', '¿Qué dudas tiene mi historia ahora?', 'Dame tres ideas para la próxima escena']
                                    : ['What do you know about my main character?', 'What open questions does my story have?', 'Give me three ideas for the next scene']
                                ).map(q => (
                                    <button key={q} type="button" onClick={() => handleSendMessage(q)}
                                        className="text-left text-[13px] leading-snug px-3 py-2 rounded-xl border border-titanium-700 bg-titanium-900 text-titanium-200 hover:border-mira/60 hover:text-titanium-100 transition-colors">
                                        {q}
                                    </button>
                                ))}
                            </div>
                        )}

                        {isThinking && (
                            <div className="flex items-end" role="status">
                                <MiraSprite pose="escribiendo" className="-ml-4 shrink-0" />
                                <div className="-ml-8 mb-8 bg-mira-bg border border-dashed border-mira/60 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-mira">
                                    {thinkingLabel}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className={`pt-3 sm:pt-4 px-3 sm:px-4 ${variant === 'dialog' ? 'pb-3 sm:pb-4' : 'pb-10'} shrink-0 bg-titanium-950/95 backdrop-blur-xl border-t border-titanium-800`}>
                        <ChatInput
                            onSend={(text, attachment) => {
                                handleSendMessage(text, attachment || undefined);

                                // ⚖️ AUDIT: THE SEED (Director Prompt)
                                if (user && folderId) {
                                    CreativeAuditService.logCreativeEvent({
                                        projectId: folderId,
                                        userId: user.uid,
                                        component: 'DirectorPanel',
                                        actionType: 'INJECTION',
                                        description: 'User sent directive',
                                        payload: {
                                            promptContent: text,
                                            promptLength: text.length,
                                            sessionId: activeSessionId,
                                            hasAttachment: !!attachment
                                        }
                                    });
                                }
                            }}
                            placeholder={t.writePlaceholder}
                            isLoading={isThinking}
                            autoFocus
                        />
                    </div>
                </div>

                {/* COL 3 / SIDEBAR: TOOLS (STRATEGIST & WAR ROOM) */}
                {(isStrategistMode || isWarRoomMode) && (
                    <div className={`
                        ${isWarRoomMode ? 'h-full border-l border-titanium-800 bg-titanium-900/30 overflow-hidden' : 'absolute right-0 top-0 bottom-0 z-10 py-14 pr-2 pointer-events-none'}
                    `}>
                        <div className={`${isWarRoomMode ? 'h-full flex flex-col overflow-hidden' : 'pointer-events-auto'}`}>
                            {isWarRoomMode && (
                                <div className="p-3 border-b border-titanium-800 text-xs font-bold text-titanium-400 uppercase tracking-wider bg-titanium-900/50">
                                    {t.tools}
                                </div>
                            )}

                            <div className={`${isWarRoomMode ? 'p-2' : ''}`}>
                                <React.Suspense fallback={<div className="p-4 flex justify-center"><Loader2 className="animate-spin text-titanium-600" size={20} /></div>}>
                                    <DirectorTools
                                        mode={isWarRoomMode ? 'war-room' : 'strategist'}
                                        onInspector={() => handleInspector(activeFileId)}
                                        onTribunal={() => handleTribunal(null)} // Pass null to rely on fallback for now (No selection state yet)
                                        onContext={handleContextSync}
                                        isThinking={isThinking}
                                    />
                                </React.Suspense>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

