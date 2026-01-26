import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { X, CalendarClock, FileText, Clock, Calendar, Sparkles, Check, Trash2, AlertCircle } from 'lucide-react';
import { TimelineEvent } from '../types';
import { toast } from 'sonner';
import { useProjectConfig } from '../contexts/ProjectConfigContext';

interface TimelinePanelProps {
    onClose: () => void;
    userId: string | null;
    onFileSelect: (fileId: string) => void;
    currentFileId?: string | null;
    accessToken: string | null;
    isSecurityReady?: boolean; // 👈 Circuit Breaker Prop
}

const TimelinePanel: React.FC<TimelinePanelProps> = ({ onClose, userId, onFileSelect, currentFileId, accessToken, isSecurityReady = false }) => {
    const { config } = useProjectConfig(); // 🟢 GET CONFIG FOR SYNC
    const [events, setEvents] = useState<TimelineEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false); // 🟢 RESTORE STATE

    // Configuration State
    const [currentYear, setCurrentYear] = useState<number>(3050);
    const [eraName, setEraName] = useState<string>('Era Común');

    // 🟢 1. FETCH EVENTS (LISTENER)
    useEffect(() => {
        if (!userId) return;

        // 🟢 CIRCUIT BREAKER: Block Listener
        if (!isSecurityReady) {
            console.log("🛡️ [CIRCUIT BREAKER] TimelinePanel waiting for App Check...");
            setLoading(true);
            return;
        }

        const db = getFirestore();
        const eventsRef = collection(db, 'TDB_Timeline', userId, 'events');
        const q = query(eventsRef, orderBy('absoluteYear', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const loadedEvents: TimelineEvent[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                loadedEvents.push({
                    id: doc.id,
                    ...data
                } as TimelineEvent);
            });
            setEvents(loadedEvents);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching timeline:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, isSecurityReady]);

    // 🟢 2. AUTO-SYNC LOGIC (MOUNT ONLY)
    // DEPRECATED: Chronology Path removed. This logic is dormant until future "Auto-Extraction" feature.
    /*
    useEffect(() => {
        const checkAndRestore = async () => {
            // Only run if loaded, empty, and config exists
            if (!loading && events.length === 0 && accessToken && !isRestoring) {
                console.log("⏳ [TIME ANCHOR] Timeline Empty. Attempting restore from Master...");
                setIsRestoring(true);

                try {
                    const functions = getFunctions();
                    const restoreTimelineFromMaster = httpsCallable(functions, 'restoreTimelineFromMaster');

                    const result = await restoreTimelineFromMaster({ accessToken });
                    const data = result.data as any;

                    if (data.count > 0) {
                        toast.success(`Historial Restaurado: ${data.count} eventos recuperados de Drive.`);
                    } else {
                        console.log("ℹ️ [TIME ANCHOR] No history found in Drive.");
                    }
                } catch (error) {
                    console.error("Error restoring timeline:", error);
                    // Silent fail is okay, maybe just a log
                } finally {
                    setIsRestoring(false);
                }
            }
        };

        // Trigger with a small delay to ensure 'events' state is stable
        const timer = setTimeout(() => {
             checkAndRestore();
        }, 1000);

        return () => clearTimeout(timer);
    }, [loading, events.length, config, accessToken]); // careful with deps
    */

    const handleAnalyze = async () => {
        if (!currentFileId) {
            toast.warning("Abre un archivo en el editor para analizarlo.");
            return;
        }

        if (!accessToken) {
            toast.error("Falta token de acceso. Recarga la página.");
            return;
        }

        setAnalyzing(true);
        const functions = getFunctions();
        const extractTimelineEvents = httpsCallable(functions, 'extractTimelineEvents');
        const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');

        try {
            const contentResult = await getDriveFileContent({
                fileId: currentFileId,
                accessToken: accessToken
            });
            const content = (contentResult.data as any).content;

            const result = await extractTimelineEvents({
                fileId: currentFileId,
                content: content,
                currentYear,
                eraName,
                accessToken // 🟢 REQUIRED FOR DUAL-WRITE
            });

            const data = result.data as any;
            toast.success(`¡Cronista finalizado! ${data.count} eventos encontrados.`);

        } catch (error: any) {
            console.error("Error analyzing timeline:", error);
            toast.error(`Error del Cronista: ${error.message}`);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleApprove = async (eventId: string) => {
        if (!userId) return;
        const db = getFirestore();
        const eventRef = doc(db, 'TDB_Timeline', userId, 'events', eventId);
        try {
            await updateDoc(eventRef, { status: 'confirmed' });
            toast.success("Evento confirmado");
        } catch (error) {
            toast.error("Error al confirmar");
        }
    };

    const handleDiscard = async (eventId: string) => {
        if (!userId) return;
        const db = getFirestore();
        const eventRef = doc(db, 'TDB_Timeline', userId, 'events', eventId);
        try {
            await deleteDoc(eventRef);
            toast.success("Evento descartado");
        } catch (error) {
            toast.error("Error al descartar");
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-titanium-950 animate-fade-in text-titanium-100 border-l border-titanium-800 shadow-2xl">
            {/* HEADER & CONFIG */}
            <div className="flex flex-col border-b border-titanium-800 bg-titanium-900 shadow-md z-10">
                <div className="h-16 flex items-center justify-between px-6">
                    <div className="flex items-center gap-3 text-orange-500">
                        <CalendarClock size={24} />
                        <h2 className="font-bold text-xl text-titanium-100 tracking-wider">CRONOGRAMA</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                        aria-label="Cerrar cronograma"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* CONTROLS */}
                <div className="px-6 pb-4 flex items-center gap-4 text-sm">
                    <div className="flex flex-col gap-1">
                        <label htmlFor="timeline-current-year" className="text-titanium-500 text-xs uppercase font-bold">Año Actual</label>
                        <input
                            id="timeline-current-year"
                            type="number"
                            value={currentYear}
                            onChange={(e) => setCurrentYear(parseInt(e.target.value) || 0)}
                            className="bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded px-2 py-1 w-24 focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none"
                        />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label htmlFor="timeline-era-name" className="text-titanium-500 text-xs uppercase font-bold">Era</label>
                        <input
                            id="timeline-era-name"
                            type="text"
                            value={eraName}
                            onChange={(e) => setEraName(e.target.value)}
                            className="bg-slate-800 text-white placeholder-gray-400 border border-slate-700 rounded px-2 py-1 w-full focus:border-accent-DEFAULT focus:ring-1 focus:ring-accent-DEFAULT outline-none"
                        />
                    </div>
                    <div className="flex flex-col justify-end">
                        <button
                            onClick={handleAnalyze}
                            disabled={analyzing || !currentFileId}
                            className={`
                                flex items-center gap-2 px-4 py-1.5 rounded-lg font-medium transition-all
                                ${analyzing || !currentFileId
                                    ? 'bg-titanium-800 text-titanium-500 cursor-not-allowed'
                                    : 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg hover:shadow-orange-500/20'}
                            `}
                        >
                            {analyzing ? <Clock size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {analyzing ? 'Analizando...' : 'Analizar Archivo'}
                        </button>
                    </div>
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-y-auto p-8 relative">
                {loading || isRestoring ? (
                    // 🟢 TITANIUM SKELETON (CIRCUIT BREAKER VISUAL)
                    <div className="relative max-w-3xl mx-auto h-full flex flex-col justify-center gap-12 py-8 animate-pulse">
                        {isRestoring && (
                            <div className="absolute inset-0 flex items-center justify-center z-50">
                                <div className="bg-titanium-900/90 px-6 py-3 rounded-xl border border-orange-500/50 shadow-2xl flex items-center gap-3">
                                    <Clock className="animate-spin text-orange-500" />
                                    <span className="text-orange-100 font-bold tracking-wider">RESTAURANDO HISTORIA...</span>
                                </div>
                            </div>
                        )}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-titanium-800/50 transform -translate-x-1/2" />

                        {/* Skeleton Item Left */}
                        <div className="flex items-center w-full flex-row">
                            <div className="w-[45%] text-right pr-8">
                                <div className="h-32 bg-titanium-900/50 border border-titanium-800/50 rounded-xl"></div>
                            </div>
                            <div className="relative z-10 w-4 h-4 rounded-full bg-titanium-800 flex-shrink-0" />
                            <div className="w-[45%]" />
                        </div>

                        {/* Skeleton Item Right */}
                        <div className="flex items-center w-full flex-row-reverse">
                            <div className="w-[45%] text-left pl-8">
                                <div className="h-32 bg-titanium-900/50 border border-titanium-800/50 rounded-xl"></div>
                            </div>
                            <div className="relative z-10 w-4 h-4 rounded-full bg-titanium-800 flex-shrink-0" />
                            <div className="w-[45%]" />
                        </div>
                    </div>
                ) : events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-titanium-600 opacity-50">
                        <CalendarClock size={64} className="mb-4" />
                        <p>No hay eventos registrados.</p>
                        <p className="text-sm mt-2">Configura el año y pulsa "Analizar Archivo" para que la IA extraiga la historia.</p>
                    </div>
                ) : (
                    <div className="relative max-w-3xl mx-auto">
                        {/* Central Line */}
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-titanium-800 transform -translate-x-1/2" />

                        <div className="flex flex-col gap-12 py-8">
                            {events.map((event, index) => {
                                const isLeft = index % 2 === 0;
                                const isSuggested = event.status === 'suggested';

                                return (
                                    <div key={event.id} className={`flex items-center w-full ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>

                                        {/* Card */}
                                        <div className={`w-[45%] ${isLeft ? 'text-right pr-8' : 'text-left pl-8'}`}>
                                            <div
                                                className={`
                                                    relative p-4 rounded-xl transition-all group
                                                    ${isSuggested
                                                        ? 'bg-titanium-900/50 border-2 border-dashed border-yellow-500/30 hover:border-yellow-500/60'
                                                        : 'bg-titanium-900 border border-titanium-800 shadow-lg hover:border-orange-500/50'}
                                                `}
                                            >
                                                {/* Status Badge */}
                                                {isSuggested && (
                                                    <div className={`absolute -top-3 ${isLeft ? 'right-4' : 'left-4'} bg-yellow-500/20 text-yellow-500 text-[10px] px-2 py-0.5 rounded-full border border-yellow-500/30 flex items-center gap-1`}>
                                                        <AlertCircle size={10} /> SUGERIDO
                                                    </div>
                                                )}

                                                <div className={`flex items-center gap-2 mb-1 font-mono text-sm ${isLeft ? 'justify-end' : 'justify-start'} ${isSuggested ? 'text-yellow-500' : 'text-orange-400'}`}>
                                                    <Calendar size={14} />
                                                    Año {event.absoluteYear}
                                                </div>

                                                <h3 className="font-bold text-lg text-titanium-100 group-hover:text-orange-200 transition-colors">
                                                    {event.eventName}
                                                </h3>
                                                <p className="text-sm text-titanium-400 mt-2 line-clamp-3 italic">
                                                    "{event.description}"
                                                </p>

                                                {/* Actions */}
                                                <div className={`flex items-center justify-between mt-4 ${isLeft ? 'flex-row-reverse' : 'flex-row'}`}>
                                                    {/* Source Link (Always visible) */}
                                                    <button
                                                        onClick={() => onFileSelect(event.sourceFileId)}
                                                        className="flex items-center gap-1 text-titanium-500 text-xs hover:text-orange-400 transition-colors"
                                                        title="Ver documento fuente"
                                                    >
                                                        <FileText size={12} />
                                                        <span>Ver Fuente</span>
                                                    </button>

                                                    {/* Approve/Discard (Only for suggested) */}
                                                    {isSuggested && (
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleApprove(event.id)}
                                                                className="p-1.5 rounded bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                                                                title="Confirmar"
                                                                aria-label="Confirmar evento"
                                                            >
                                                                <Check size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDiscard(event.id)}
                                                                className="p-1.5 rounded bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                                                                title="Descartar"
                                                                aria-label="Descartar evento"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Node */}
                                        <div className={`
                                            relative z-10 w-4 h-4 rounded-full flex-shrink-0
                                            ${isSuggested
                                                ? 'bg-titanium-950 border-2 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.3)]'
                                                : 'bg-titanium-950 border-2 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'}
                                        `} />

                                        {/* Spacer for the other side */}
                                        <div className="w-[45%]" />
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TimelinePanel;
