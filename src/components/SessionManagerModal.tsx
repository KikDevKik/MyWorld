import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { toast } from 'sonner';
import { Modal } from './ui/Modal';
import { Loader2, Trash2, Calendar, AlertTriangle, Zap, MessageSquare } from 'lucide-react';

interface SessionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
}

interface ForgeSession {
    id: string;
    name: string;
    updatedAt: string;
    type: string;
    lastMessageSnippet?: string;
    messageCount?: number;
}

export const SessionManagerModal: React.FC<SessionManagerModalProps> = ({
    isOpen,
    onClose,
    activeSessionId,
    onSessionSelect
}) => {
    const [sessions, setSessions] = useState<ForgeSession[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [isPurging, setIsPurging] = useState(false);

    const functions = getFunctions();
    const getForgeSessions = httpsCallable(functions, 'getForgeSessions');
    const deleteForgeSession = httpsCallable(functions, 'deleteForgeSession');
    const purgeEmptySessions = httpsCallable(functions, 'purgeEmptySessions');

    useEffect(() => {
        if (isOpen) {
            loadSessions();
        }
    }, [isOpen]);

    const loadSessions = async () => {
        setIsLoading(true);
        try {
            const result = await getForgeSessions({ type: 'director' });
            // Sort by updatedAt desc to ensure correct order
            const fetched = (result.data as ForgeSession[]).sort((a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            setSessions(fetched);
        } catch (error) {
            console.error("Failed to load sessions:", error);
            toast.error("Error cargando historial de sesiones.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation(); // Prevent selection
        if (!confirm("¿Eliminar esta sesión permanentemente?")) return;

        setIsDeleting(sessionId);
        try {
            await deleteForgeSession({ sessionId });
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            toast.success("Sesión eliminada.");
            if (activeSessionId === sessionId) {
                onSessionSelect(null);
            }
        } catch (error) {
            console.error("Failed to delete session:", error);
            toast.error("Error eliminando sesión.");
        } finally {
            setIsDeleting(null);
        }
    };

    const handlePurge = async () => {
        if (!confirm("⚠ PROTOCOLO JANITOR ⚠\n\n¿Estás seguro de purgar TODAS las sesiones vacías?\nEsta acción es irreversible.")) return;

        setIsPurging(true);
        const toastId = toast.loading("Ejecutando protocolo de limpieza...");

        try {
            const result = await purgeEmptySessions();
            const data = result.data as { deletedCount: number, message: string };

            toast.success(`Limpieza completada: ${data.deletedCount} sesiones purgadas.`, { id: toastId });
            loadSessions(); // Reload list
        } catch (error: any) {
            console.error("Purge failed:", error);
            toast.error(`Error en la purga: ${error.message}`, { id: toastId });
        } finally {
            setIsPurging(false);
        }
    };

    // --- GROUPING LOGIC ---
    const groupedSessions = sessions.reduce((groups, session) => {
        const date = new Date(session.updatedAt);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

        let key = 'Historial Antiguo';
        if (diffDays === 0) key = 'Activo (Hoy)';
        else if (diffDays === 1) key = 'Ayer';

        if (!groups[key]) groups[key] = [];
        groups[key].push(session);
        return groups;
    }, {} as Record<string, ForgeSession[]>);

    const groupOrder = ['Activo (Hoy)', 'Ayer', 'Historial Antiguo'];

    const getRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

        if (diffHours < 1) return 'Hace un momento';
        if (diffHours < 24) return `Hace ${diffHours}h`;
        return date.toLocaleDateString();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Archivos de Memoria"
            footer={
                <div className="w-full flex justify-between items-center">
                    <button
                        onClick={handlePurge}
                        disabled={isPurging || isLoading}
                        className="text-red-400 hover:text-red-300 text-xs font-bold uppercase flex items-center gap-2 px-2 py-1 rounded hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                        {isPurging ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                        Purgar Sesiones Vacías
                    </button>

                    <button
                        onClick={() => {
                            onSessionSelect(null);
                            onClose();
                        }}
                        className="bg-emerald-900/20 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-900/50 py-1.5 px-4 rounded text-sm font-bold uppercase flex items-center gap-2 transition-colors"
                    >
                        <Zap size={14} /> Nueva Sesión
                    </button>
                </div>
            }
        >
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-titanium-500 gap-3">
                    <Loader2 className="animate-spin" size={32} />
                    <span className="text-xs uppercase tracking-wider">Accediendo a la Forja...</span>
                </div>
            ) : sessions.length === 0 ? (
                <div className="text-center py-12 text-titanium-500 italic">
                    No hay registros de memoria disponibles.
                </div>
            ) : (
                <div className="space-y-6">
                    {groupOrder.map(group => {
                        const groupSessions = groupedSessions[group];
                        if (!groupSessions || groupSessions.length === 0) return null;

                        return (
                            <div key={group} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <h3 className="text-xs font-bold text-titanium-400 uppercase tracking-widest mb-3 border-b border-titanium-800 pb-1 flex items-center gap-2">
                                    <Calendar size={12} /> {group}
                                </h3>
                                <div className="space-y-2">
                                    {groupSessions.map(session => (
                                        <div
                                            key={session.id}
                                            onClick={() => {
                                                onSessionSelect(session.id);
                                                onClose();
                                            }}
                                            className={`
                                                group relative w-full text-left p-3 rounded-lg border transition-all cursor-pointer
                                                ${activeSessionId === session.id
                                                    ? 'bg-cyan-950/20 border-cyan-900/50 hover:bg-cyan-950/30'
                                                    : 'bg-titanium-950/30 border-titanium-800 hover:border-titanium-600 hover:bg-titanium-900'}
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className={`font-bold text-sm truncate pr-8 ${activeSessionId === session.id ? 'text-cyan-300' : 'text-titanium-200'}`}>
                                                    {session.name}
                                                </h4>
                                                <span className="text-[10px] text-titanium-500 font-mono whitespace-nowrap">
                                                    {getRelativeTime(session.updatedAt)}
                                                </span>
                                            </div>

                                            <p className="text-xs text-titanium-400 line-clamp-2 mb-2 min-h-[1.5em] italic">
                                                "{session.lastMessageSnippet || '...'}"
                                            </p>

                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-[10px] text-titanium-600 bg-titanium-950/50 px-1.5 py-0.5 rounded flex items-center gap-1">
                                                    <MessageSquare size={10} />
                                                    {session.messageCount !== undefined ? session.messageCount : '-'} msgs
                                                </span>

                                                <button
                                                    onClick={(e) => handleDelete(e, session.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-titanium-500 hover:text-red-400 hover:bg-red-950/30 rounded focus:opacity-100"
                                                    title="Eliminar permanentemente"
                                                    disabled={isDeleting === session.id}
                                                >
                                                    {isDeleting === session.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
};
