import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Modal } from './ui/Modal';
import { Loader2, AlertTriangle, Zap } from 'lucide-react';
import { SessionList } from './ui/SessionList';
import { callFunction } from '../services/api';

interface SessionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
}

// Re-export this interface for usage in other components (or import from SessionList if exported there, but for now we redefined it there)
// We need to match the type expected by SessionList
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

    useEffect(() => {
        if (isOpen) {
            loadSessions();
        }
    }, [isOpen]);

    const loadSessions = async () => {
        setIsLoading(true);
        try {
            const fetched = await callFunction<ForgeSession[]>('getForgeSessions', { type: 'director' });
            // Sort by updatedAt desc to ensure correct order
            const sorted = fetched.sort((a, b) =>
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
            setSessions(sorted);
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
            await callFunction('deleteForgeSession', { sessionId });
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
            const data = await callFunction<{ deletedCount: number, message: string }>('purgeEmptySessions');

            toast.success(`Limpieza completada: ${data.deletedCount} sesiones purgadas.`, { id: toastId });
            loadSessions(); // Reload list
        } catch (error: any) {
            console.error("Purge failed:", error);
            toast.error(`Error en la purga: ${error.message}`, { id: toastId });
        } finally {
            setIsPurging(false);
        }
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
            <SessionList
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSessionSelect={(id) => {
                    onSessionSelect(id);
                    onClose();
                }}
                onDeleteSession={handleDelete}
                isLoading={isLoading}
                isDeleting={isDeleting}
            />
        </Modal>
    );
};
