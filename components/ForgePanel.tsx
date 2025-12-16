import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Trash2, Plus, Hammer, X, Loader2, Image as ImageIcon } from 'lucide-react'; // 👈 AÑADIDO IMAGEICON
import { toast } from 'sonner';
import ForgeChat from './ForgeChat';

interface ForgeSession {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
}

interface ForgePanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
    onOpenImageGen: () => void;
}

// 👇 AÑADIDO onOpenImageGen A LA DESESTRUCTURACIÓN
const ForgePanel: React.FC<ForgePanelProps> = ({ onClose, folderId, accessToken, onOpenImageGen }) => {
    const [sessions, setSessions] = useState<ForgeSession[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newSessionName, setNewSessionName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [activeSession, setActiveSession] = useState<ForgeSession | null>(null);

    const fetchSessions = async () => {
        setIsLoading(true);
        const functions = getFunctions();
        const getForgeSessions = httpsCallable(functions, 'getForgeSessions');

        try {
            const result = await getForgeSessions();
            setSessions(result.data as ForgeSession[]);
        } catch (error) {
            console.error("Error fetching sessions:", error);
            toast.error("Error al cargar las sesiones.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    const handleCreateSession = async () => {
        if (!newSessionName.trim()) return;

        setIsCreating(true);
        const functions = getFunctions();
        const createForgeSession = httpsCallable(functions, 'createForgeSession');

        try {
            const result = await createForgeSession({ name: newSessionName });
            const newSession = result.data as ForgeSession;
            setSessions(prev => [newSession, ...prev]);
            setNewSessionName('');
            toast.success("Sesión creada.");
            setActiveSession(newSession); // Auto-open
        } catch (error) {
            console.error("Error creating session:", error);
            toast.error("Error al crear la sesión.");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("¿Eliminar esta sesión permanentemente?")) return;

        const functions = getFunctions();
        const deleteForgeSession = httpsCallable(functions, 'deleteForgeSession');

        try {
            await deleteForgeSession({ sessionId });
            toast.success("Sesión eliminada.");
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (activeSession?.id === sessionId) setActiveSession(null);
        } catch (error) {
            console.error("Error deleting session:", error);
            toast.error("Error al eliminar la sesión.");
        }
    };

    // 🟢 RENDER: ACTIVE CHAT (FULL SCREEN IN MAIN STAGE)
    if (activeSession) {
        return (
            <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
                <ForgeChat
                    sessionId={activeSession.id}
                    sessionName={activeSession.name}
                    onBack={() => setActiveSession(null)}
                    folderId={folderId}
                    accessToken={accessToken}
                    onOpenImageGen={onOpenImageGen} // ✅ AHORA SÍ EXISTE
                />
            </div>
        );
    }

    // 🟢 RENDER: SESSION LIST (FULL SCREEN IN MAIN STAGE)
    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in">
            {/* HEADER */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900">
                <div className="flex items-center gap-3 text-accent-DEFAULT">
                    <Hammer size={24} />
                    <h2 className="font-bold text-xl text-titanium-100">Forja de Almas</h2>

                    {/* BOTÓN DE IMAGEN RÁPIDO (Opcional en la lista, pero útil) */}
                    <button
                        onClick={onOpenImageGen}
                        className="ml-4 p-2 text-titanium-400 hover:text-accent-DEFAULT hover:bg-titanium-700 rounded-lg transition-colors border border-titanium-700/50"
                        title="Generar Imagen de Referencia"
                    >
                        <ImageIcon size={18} />
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                >
                    <X size={24} />
                </button>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full space-y-8">

                {/* CREATE NEW */}
                <div className="bg-titanium-900 p-6 rounded-2xl border border-titanium-800 shadow-lg">
                    <label className="block text-sm font-bold text-titanium-400 uppercase mb-4 tracking-wider">Nueva Sesión de Forjado</label>
                    <div className="flex gap-4">
                        <input
                            value={newSessionName}
                            onChange={(e) => setNewSessionName(e.target.value)}
                            placeholder="Nombre del Personaje o Elemento..."
                            className="flex-1 bg-titanium-950 border border-titanium-700 rounded-xl px-4 py-3 text-titanium-100 placeholder-titanium-500 focus:outline-none focus:border-accent-DEFAULT focus:ring-2 focus:ring-accent-DEFAULT/50 transition-all"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateSession()}
                        />
                        <button
                            onClick={handleCreateSession}
                            disabled={isCreating || !newSessionName.trim()}
                            className="bg-accent-DEFAULT hover:bg-accent-hover text-titanium-950 px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent-DEFAULT/20"
                        >
                            {isCreating ? <Loader2 className="animate-spin" /> : <Plus size={20} />}
                            <span>Crear</span>
                        </button>
                    </div>
                </div>

                {/* SESSION LIST */}
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-titanium-200">Sesiones Activas</h3>

                    {isLoading ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-accent-DEFAULT" size={32} />
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="text-center py-12 text-titanium-500 bg-titanium-900/50 rounded-2xl border border-titanium-800 border-dashed">
                            <Hammer size={48} className="mx-auto mb-4 opacity-20" />
                            <p>No hay sesiones activas. Crea una para comenzar.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sessions.map(session => (
                                <div
                                    key={session.id}
                                    onClick={() => setActiveSession(session)}
                                    className="group bg-titanium-900 hover:bg-titanium-800 border border-titanium-800 hover:border-accent-dim/50 rounded-xl p-5 cursor-pointer transition-all hover:shadow-xl hover:-translate-y-1 relative overflow-hidden"
                                >
                                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => handleDeleteSession(session.id, e)}
                                            className="p-2 hover:bg-red-900/30 text-titanium-500 hover:text-red-400 rounded-lg transition-colors"
                                            title="Eliminar sesión"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-titanium-950 flex items-center justify-center text-accent-DEFAULT border border-titanium-800 group-hover:border-accent-dim/30 transition-colors">
                                            <Hammer size={20} />
                                        </div>
                                        <h4 className="font-bold text-titanium-100 truncate pr-8">{session.name}</h4>
                                    </div>
                                    <p className="text-xs text-titanium-500">
                                        Actualizado: {new Date(session.updatedAt).toLocaleDateString()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgePanel;