import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Archive, LayoutTemplate, RefreshCcw, AlertCircle } from 'lucide-react';
import { useLayoutStore } from '../stores/useLayoutStore';
import { SessionManagerModal } from './SessionManagerModal';
import { DirectorTools } from './DirectorTools';
import { SessionList } from './ui/SessionList';
import { useDirectorChat } from '../hooks/useDirectorChat';
import { ChatMessage } from './director/chat/ChatMessage';
import { CreativeAuditService } from '../services/CreativeAuditService';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useContextStatus } from '../hooks/useContextStatus';
import { toast } from 'sonner';
import { callFunction } from '../services/api';
import ChatInput from './ui/ChatInput';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';

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
}

const DirectorPanel: React.FC<DirectorPanelProps> = ({
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
    onInsertContent
}) => {
    // 🟢 GLOBAL STORE
    const { isArsenalWide, toggleArsenalWidth, directorWidth } = useLayoutStore();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage].director;

    // 🟢 RESPONSIVE LAYOUT MODES
    const isSentinelMode = directorWidth < 500;
    const isStrategistMode = directorWidth >= 500 && directorWidth < 900;
    const isWarRoomMode = directorWidth >= 900;

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
        accessToken
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [isSessionManagerOpen, setIsSessionManagerOpen] = useState(false);

    // 🟢 LOAD WAR ROOM SESSIONS
    const [embeddedSessions, setEmbeddedSessions] = useState<any[]>([]);
    const [isSessionsLoading, setIsSessionsLoading] = useState(false);
    const { user, config } = useProjectConfig();

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

    if (!isOpen) return null;

    return (
        <div className="w-full h-full bg-titanium-950/95 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 relative">

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

            {/* HEADER */}
            <div className="flex items-center justify-between p-4 border-b border-titanium-800 bg-titanium-900/50">
                <div className="flex items-center gap-3">
                    <div>
                         <h2 className="text-sm font-bold uppercase tracking-widest text-titanium-100 leading-none">{t.title}</h2>
                         <div className="text-[9px] text-titanium-500 uppercase tracking-wider mt-0.5">
                             {activeSessionId ? t.activeSession : t.standby}
                         </div>
                    </div>
                </div>

                <div className="flex gap-1">
                    <button
                        onClick={() => setIsSessionManagerOpen(true)}
                        className="p-1.5 text-titanium-300 hover:text-cyan-400 transition-colors rounded hover:bg-titanium-800"
                        title={t.sessionFiles}
                    >
                        <Archive size={16} />
                    </button>
                    <button
                        onClick={toggleArsenalWidth}
                        className={`p-1.5 transition-colors rounded hover:bg-titanium-800 ${isArsenalWide ? 'text-cyan-400' : 'text-titanium-400 hover:text-white'}`}
                        title={t.strategistMode}
                    >
                        <LayoutTemplate size={16} />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 text-titanium-400 hover:text-red-400 transition-colors rounded hover:bg-titanium-800 ml-2"
                        aria-label="Close Director"
                    >
                        <X size={16} />
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

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
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
                                    onInsert={onInsertContent}
                                />
                            ))
                        )}

                        {isThinking && (
                            <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center shrink-0">
                                    <Loader2 size={14} className="animate-spin text-emerald-400" />
                                </div>
                                <div className="bg-titanium-900/50 border border-titanium-800 rounded-xl p-3 text-xs text-titanium-500 italic">
                                    {t.analyzing}
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="pt-4 px-4 pb-10 border-t border-titanium-800 bg-titanium-900/30 shrink-0">
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
                            disabled={isThinking}
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
                                <DirectorTools
                                    mode={isWarRoomMode ? 'war-room' : 'strategist'}
                                    onInspector={() => handleInspector(activeFileId)}
                                    onTribunal={() => handleTribunal(null)} // Pass null to rely on fallback for now (No selection state yet)
                                    onContext={handleContextSync}
                                    isThinking={isThinking}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DirectorPanel;
