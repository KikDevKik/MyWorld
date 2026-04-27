import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FlaskConical, Search, FileText, Image as ImageIcon, Music, Book, MoreHorizontal, Tag, Filter, Loader2, FilePlus, History, Plus, Trash2, RefreshCw, AlertCircle, ShieldAlert, X } from 'lucide-react';
import { DriveFile, Gem } from '../types';
import { toast } from 'sonner';
import ChatPanel from './ChatPanel';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { callFunction } from '../services/api';
import { EntityService } from '../services/EntityService';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';
import IdeaWizardModal from './laboratory/IdeaWizardModal';
import { MuseSessionService, MuseSession } from '../services/MuseSessionService';

interface LaboratoryPanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
    onRefreshTokens: () => Promise<string | null>;
}

const SMART_TAGS = ['LORE', 'CIENCIA', 'INSPIRACIÓN', 'VISUAL', 'AUDIO', 'OTROS'];

const LaboratoryPanel: React.FC<LaboratoryPanelProps> = ({ onClose, folderId, accessToken, onRefreshTokens }) => {
    const { user, config, customGeminiKey } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];

    const [indexedFiles, setIndexedFiles] = useState<DriveFile[]>([]);
    const [fileStatus, setFileStatus] = useState<Record<string, string>>({});
    const [fileTags, setFileTags] = useState<Record<string, string[]>>({});
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // 🟢 SESSION STATE
    const [sessions, setSessions] = useState<MuseSession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
    const [showHistory, setShowHistory] = useState(false);
    const [isCreatingSession, setIsCreatingSession] = useState(false);

    // 🟢 IDEA WIZARD STATE
    const [isIdeaWizardOpen, setIsIdeaWizardOpen] = useState(false);

    // 🟢 BACKFILL STATE
    const [isSyncing, setIsSyncing] = useState(false);
    const hasSyncedRef = useRef(false);

    // 🟢 DISTILLATION STATE
    const [distillingId, setDistillingId] = useState<string | null>(null);
    const [isRetryingGlobal, setIsRetryingGlobal] = useState(false);
    const [hideSafetyWarning, setHideSafetyWarning] = useState(false);

    // 🟢 0. FETCH SESSIONS
    useEffect(() => {
        if (!user) return;
        return MuseSessionService.subscribeToSessions(user.uid, (data) => {
            setSessions(data);
        });
    }, [user]);

    useEffect(() => {
        if (!user || !config?.folderId) {
            console.log("🧪 [LAB_DEBUG] Missing user or config:", { hasUser: !!user, hasConfig: !!config, folderId: config?.folderId });
            return;
        }

        console.log("🧪 [LAB_DEBUG] Initiating subscription:", { uid: user.uid, folderId: config.folderId });

        const unsubscribe = EntityService.subscribeToAllEntities(
            user.uid,
            config.folderId,
            (entities) => {
                console.log("🧪 [LAB_DEBUG] Snapshot received! Count:", entities.length);
                const files: DriveFile[] = [];
                const tagsMap: Record<string, string[]> = {};
                const statusMap: Record<string, string> = {};

                entities.forEach(entity => {
                    if (entity.category === 'RESOURCE') {
                        files.push({
                            id: entity.id,
                            name: entity.name || "Entidad sin nombre",
                            driveFileName: (entity as any).driveFileName,
                            mimeType: "text/markdown",
                            category: "reference"
                        } as any);

                        statusMap[entity.id] = entity.status || 'active';

                        if (entity.modules?.forge?.smartTags) {
                            tagsMap[entity.id] = entity.modules.forge.smartTags;
                        } else if (entity.modules?.forge?.tags) {
                            tagsMap[entity.id] = entity.modules.forge.tags;
                        }
                    }
                });

                setIndexedFiles(files);
                setFileTags(tagsMap);
                setFileStatus(statusMap);
            }
        );

        return () => unsubscribe();
    }, [user, config?.folderId]);

    // 🟢 INDIVIDUAL RETRY HANDLER
    const handleRetryIndividual = async (e: React.MouseEvent, fileId: string) => {
        e.stopPropagation();
        if (distillingId || !accessToken) return;

        setDistillingId(fileId);
        try {
            await callFunction('distillResource', {
                entityId: fileId,
                accessToken,
                byokApiKey: customGeminiKey
            });
            toast.success("Reintento iniciado...");
        } catch (err) {
            console.error("Retry failed:", err);
            toast.error("Fallo al reintentar el recurso.");
        } finally {
            setDistillingId(null);
        }
    };

    // 🟢 GLOBAL RETRY HANDLER (Sequential)
    const handleRetryAllFailed = async () => {
        const failedFiles = indexedFiles.filter(f => ['failed', 'blocked_by_safety'].includes(fileStatus[f.id]));
        if (failedFiles.length === 0 || !accessToken) return;

        setIsRetryingGlobal(true);
        toast.info(`Iniciando recuperación de ${failedFiles.length} recursos...`);

        for (const file of failedFiles) {
            setDistillingId(file.id);
            try {
                await callFunction('distillResource', {
                    entityId: file.id,
                    accessToken,
                    byokApiKey: customGeminiKey
                });
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (err) {
                console.error(`Sequential retry failed for ${file.id}:`, err);
            }
        }

        setDistillingId(null);
        setIsRetryingGlobal(false);
        toast.success("Proceso de recuperación completado.");
    };

    // 🟢 HANDLE SYNC
    const handleSync = React.useCallback(async () => {
        if (!accessToken) return;
        setIsSyncing(true);

        try {
            const result: any = await callFunction('backfillResourcesFromDrive', {
                accessToken,
                _authOverride: customGeminiKey
            });
            setIsSyncing(false);
            if (result && result.processed > 0) {
                toast.success(`Sincronización completada: ${result.processed} recursos procesados.`);
            } else if (result && result.created > 0) {
                toast.success(`Cola de procesamiento actualizada: ${result.created} encolados.`);
            }
        } catch (err) {
            setIsSyncing(false);
            console.error("Backfill Call Error:", err);
            toast.error('Error al iniciar la sincronización.');
        }
    }, [accessToken, customGeminiKey]);

    // 🟢 AUTO-SYNC ON MOUNT
    useEffect(() => {
        if (hasSyncedRef.current) return;
        if (!accessToken || !user || !config?.folderId) return;
        if (indexedFiles.length > 0) {
            hasSyncedRef.current = true;
            return;
        }
        hasSyncedRef.current = true;
        callFunction('backfillResourcesFromDrive', {
            accessToken,
            _authOverride: customGeminiKey
        }).catch(() => { hasSyncedRef.current = false; });
    }, [accessToken, user, config, customGeminiKey, indexedFiles.length]);

    // 🟢 AUTO-DISTILLATION QUEUE
    useEffect(() => {
        const pendingFiles = indexedFiles.filter(f => fileStatus[f.id] === 'pending');
        if (pendingFiles.length === 0 || distillingId || !accessToken) return;

        const targetId = pendingFiles[0].id;
        setDistillingId(targetId);

        callFunction('distillResource', {
            entityId: targetId,
            accessToken,
            byokApiKey: customGeminiKey
        })
            .then(() => { setDistillingId(null); })
            .catch(() => { setDistillingId(null); });
    }, [indexedFiles, fileStatus, distillingId, accessToken, customGeminiKey]);

    // 🟢 FILTERED VIEW
    const visibleFiles = useMemo(() => {
        let filtered = indexedFiles;
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            filtered = filtered.filter(f => f.name.toLowerCase().includes(lower));
        }
        if (activeTag) {
            filtered = filtered.filter(f => (fileTags[f.id] || []).includes(activeTag));
        }
        return filtered.sort((a, b) => a.name.localeCompare(b.name));
    }, [indexedFiles, fileTags, activeTag, searchQuery]);

    // 🟢 UI HELPERS
    const handleDragStart = (e: React.DragEvent, file: DriveFile) => {
        e.dataTransfer.setData("application/json", JSON.stringify(file));
        e.dataTransfer.effectAllowed = "copy";
    };

    const getIcon = (mime: string) => {
        if (!mime) return <FileText size={16} className="text-blue-400" />;
        if (mime.includes('image')) return <ImageIcon size={16} className="text-purple-400" />;
        if (mime.includes('audio')) return <Music size={16} className="text-pink-400" />;
        if (mime.includes('pdf')) return <Book size={16} className="text-red-400" />;
        return <FileText size={16} className="text-blue-400" />;
    };

    const handleCreateResource = () => setIsIdeaWizardOpen(true);

    const handleSelectSession = (id: string) => {
        setCurrentSessionId(id);
        setShowHistory(false);
    };

    const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation();
        if (!user) return;
        const ok = window.confirm('¿Eliminar esta conversación? Esta acción no se puede deshacer.');
        if (!ok) return;
        try {
            await MuseSessionService.deleteSession(user.uid, sessionId);
            if (currentSessionId === sessionId) setCurrentSessionId(undefined);
        } catch (err) {
            console.error('Delete session failed:', err);
            toast.error('Error al eliminar la conversación.');
        }
    };

    const handleFirstMessage = async (text: string) => {
        if (!user || currentSessionId) return "";
        setIsCreatingSession(true);
        try {
            const newId = await MuseSessionService.createSession(user.uid, text);
            setCurrentSessionId(newId);
            return newId;
        } finally {
            setIsCreatingSession(false);
        }
    };

    // 🟢 VIRTUAL GEM: THE LIBRARIAN
    const librarianGem: Gem = useMemo(() => ({
        id: 'laboratorio',
        name: t.tools.laboratorio,
        model: 'gemini-3.1-flash-lite-preview',
        color: 'emerald',
        backgroundImage: '',
        systemInstruction: t.laboratory.systemInstruction
    }), [t]);

    const hasBlockedFiles = useMemo(() => indexedFiles.some(f => fileStatus[f.id] === 'blocked_by_safety'), [indexedFiles, fileStatus]);

    return (
        <div className="w-full h-full flex bg-titanium-950 animate-fade-in overflow-hidden">

            {/* SIDEBAR */}
            <div className="w-80 flex-shrink-0 border-r border-titanium-800 bg-titanium-950 flex flex-col">
                <div className="p-4 border-b border-titanium-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-emerald-500">
                            <FlaskConical size={20} />
                            <h2 className="font-bold tracking-wider text-sm">{t.folderNames.resources}</h2>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleRetryAllFailed}
                                disabled={isSyncing || isRetryingGlobal || !indexedFiles.some(f => ['failed', 'blocked_by_safety'].includes(fileStatus[f.id]))}
                                className={`p-1.5 rounded-md transition-colors ${isRetryingGlobal ? 'animate-spin text-emerald-600' : 'hover:bg-titanium-800 text-titanium-400 hover:text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                                title="Reintentar todos los fallidos"
                            >
                                <RefreshCw size={16} />
                            </button>

                            <button
                                onClick={() => setShowHistory(!showHistory)}
                                className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-titanium-800 text-titanium-400'}`}
                            >
                                <History size={16} />
                            </button>
                            <button onClick={handleCreateResource} className="p-1.5 rounded-md hover:bg-titanium-800 text-titanium-400 hover:text-emerald-400">
                                <FilePlus size={16} />
                            </button>
                        </div>
                    </div>

                    {!showHistory && (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-titanium-500" />
                                <input
                                    type="text"
                                    placeholder={t.common.filterPlaceholder}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-titanium-900 border border-titanium-800 rounded-lg py-2 pl-9 pr-3 text-xs text-titanium-200 focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <button onClick={() => setActiveTag(null)} className={`px-2 py-1 rounded text-[10px] font-bold border ${!activeTag ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-titanium-900 border-titanium-800 text-titanium-500'}`}>
                                    {t.common.allCaps}
                                </button>
                                {SMART_TAGS.map(tag => (
                                    <button key={tag} onClick={() => setActiveTag(tag === activeTag ? null : tag)} className={`px-2 py-1 rounded text-[10px] font-bold border ${activeTag === tag ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-titanium-900 border-titanium-800 text-titanium-500'}`}>
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {/* SAFETY WARNING BANNER */}
                    {hasBlockedFiles && !hideSafetyWarning && !showHistory && (
                        <div className="mb-2 p-2 bg-red-900/20 border border-red-500/30 rounded-lg relative animate-in fade-in slide-in-from-top-1">
                            <div className="flex gap-2">
                                <ShieldAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-red-200 leading-tight pr-4">
                                    Archivo bloqueado por contenido explícito (Filtros de Google). Si quieres, ingresa un resumen manual sin la violencia explícita desde el chat.
                                </p>
                            </div>
                            <button
                                onClick={() => setHideSafetyWarning(true)}
                                className="absolute top-1 right-1 p-0.5 hover:bg-red-500/20 rounded text-red-400"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {showHistory ? (
                        <div className="space-y-2">
                            {sessions.length === 0 && (
                                <p className="text-[10px] text-titanium-500 text-center py-4">Sin conversaciones guardadas.</p>
                            )}
                            {sessions.map(session => (
                                <div key={session.id} onClick={() => handleSelectSession(session.id)} className={`group relative p-3 rounded-lg border cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-titanium-900/50 border-titanium-800 hover:border-titanium-700'}`}>
                                    <h3 className="text-[11px] font-bold truncate text-titanium-300 pr-6">{session.title}</h3>
                                    <p className="text-[10px] text-titanium-500 line-clamp-2 mt-1">{session.preview}</p>
                                    <button
                                        onClick={(e) => handleDeleteSession(e, session.id)}
                                        className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-titanium-500 hover:text-red-400 hover:bg-red-500/10"
                                        title="Eliminar conversación"
                                        aria-label="Eliminar conversación"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {isSyncing && visibleFiles.length === 0 && (
                                <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                                    <Loader2 size={24} className="animate-spin text-emerald-500" />
                                    <p className="text-[10px] text-titanium-500 font-mono">ESCANEANDO DRIVE...</p>
                                </div>
                            )}

                            {!isSyncing && visibleFiles.length === 0 && (
                                <div className="flex flex-col items-center justify-center p-8 text-center gap-3 opacity-40">
                                    <Search size={24} className="text-titanium-500" />
                                    <p className="text-[10px] text-titanium-500">Sin recursos encontrados.</p>
                                </div>
                            )}

                            {visibleFiles.map(file => {
                                const status = fileStatus[file.id];
                                const isPending = status === 'pending';
                                const isFailed = status === 'failed';
                                const isBlocked = status === 'blocked_by_safety';
                                const isIgnored = status === 'ignored';
                                const isActivelyDistilling = (isPending || isFailed || isBlocked) && distillingId === file.id;
                                const tags = fileTags[file.id] || [];

                                return (
                                    <div key={file.id} draggable={!isPending && !isActivelyDistilling} onDragStart={(e) => !isPending && !isActivelyDistilling && handleDragStart(e, file)} className={`group flex items-center gap-3 p-2 rounded-lg border border-transparent transition-all ${(isPending || isActivelyDistilling) ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:bg-titanium-900 cursor-grab active:cursor-grabbing hover:border-titanium-800'}`}>
                                        <div className="w-8 h-8 rounded bg-titanium-950 flex items-center justify-center border border-titanium-800">
                                            {isActivelyDistilling ? <Loader2 size={16} className="animate-spin text-emerald-500" /> : getIcon(file.mimeType)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className="text-xs font-medium text-titanium-300 truncate"
                                                title={`Original: ${(file as any).driveFileName || file.name}`}
                                            >
                                                {file.name}
                                            </p>
                                            <div className="flex gap-1 mt-1">
                                                {isActivelyDistilling ? (
                                                    <span className="text-[9px] text-emerald-500 animate-pulse font-bold">Destilando esencia...</span>
                                                ) : isPending ? (
                                                    <span className="text-[9px] text-titanium-500">En cola para análisis...</span>
                                                ) : (isFailed || isBlocked) ? (
                                                    <button
                                                        onClick={(e) => handleRetryIndividual(e, file.id)}
                                                        className={`flex items-center gap-1 text-[9px] font-bold transition-colors cursor-pointer ${isBlocked ? 'text-red-500 hover:text-red-400' : 'text-red-400 hover:text-red-300'}`}
                                                    >
                                                        <AlertCircle size={10} />
                                                        <span>{isBlocked ? 'Censurado' : 'Falló análisis'} (Reintentar)</span>
                                                    </button>
                                                ) : isIgnored ? (
                                                    <span className="text-[9px] text-yellow-500">Ignorado (Vacío)</span>
                                                ) : tags.map(tag => (
                                                    <span key={tag} className="text-[9px] px-1 rounded bg-titanium-800 text-titanium-500">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN CHAT AREA */}
            <div className="flex-1 h-full relative">
                <ChatPanel
                    isOpen={true} onClose={() => { }} activeGemId={null} customGem={librarianGem} isFullWidth={true}
                    categoryFilter="reference" folderId={folderId} accessToken={accessToken} sessionId={currentSessionId}
                    isCreatingSession={isCreatingSession} onFirstMessage={handleFirstMessage}
                />
            </div>

            <IdeaWizardModal
                isOpen={isIdeaWizardOpen} onClose={() => setIsIdeaWizardOpen(false)}
                folderId={config?.resourcePaths?.[0]?.id || folderId} accessToken={accessToken} onRefreshTokens={onRefreshTokens}
            />
        </div>
    );
};

export default LaboratoryPanel;
