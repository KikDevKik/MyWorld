import React from 'react';
import { Archive, Trash2, Calendar, AlertTriangle, MessageSquare, Loader2 } from 'lucide-react';

interface ForgeSession {
    id: string;
    name: string;
    updatedAt: string;
    type: string;
    lastMessageSnippet?: string;
    messageCount?: number;
}

interface SessionListProps {
    sessions: ForgeSession[];
    activeSessionId: string | null;
    onSessionSelect: (id: string | null) => void;
    onDeleteSession?: (e: React.MouseEvent, id: string) => void;
    isLoading?: boolean;
    isDeleting?: string | null;
    embedded?: boolean; // New prop for integrated mode
}

export const SessionList: React.FC<SessionListProps> = ({
    sessions,
    activeSessionId,
    onSessionSelect,
    onDeleteSession,
    isLoading,
    isDeleting,
    embedded = false
}) => {

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

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-titanium-500 gap-3">
                <Loader2 className="animate-spin" size={32} />
                <span className="text-xs uppercase tracking-wider">Accediendo a la Forja...</span>
            </div>
        );
    }

    if (sessions.length === 0) {
        return (
            <div className="text-center py-12 text-titanium-500 italic">
                No hay registros de memoria disponibles.
            </div>
        );
    }

    return (
        <div className={`space-y-6 ${embedded ? 'overflow-y-auto pr-2 custom-scrollbar' : ''}`}>
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
                                    onClick={() => onSessionSelect(session.id)}
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

                                        {onDeleteSession && (
                                            <button
                                                onClick={(e) => onDeleteSession(e, session.id)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-titanium-500 hover:text-red-400 hover:bg-red-950/30 rounded focus:opacity-100"
                                                title="Eliminar permanentemente"
                                                disabled={isDeleting === session.id}
                                            >
                                                {isDeleting === session.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
