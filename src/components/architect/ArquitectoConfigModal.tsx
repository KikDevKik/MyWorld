import React, { useState } from 'react';
import { X, ShieldAlert, Sparkles, BrainCircuit, BookOpen, Users, LayoutDashboard, Flame, Loader2 } from 'lucide-react';
import { useArquitectoStore } from '../../stores/useArquitectoStore';
import { collection, doc, writeBatch, getDocs, getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface ArquitectoConfigModalProps {
    sessionId: string | null;
    onClose: () => void;
    onPanicResolved: () => void; // Para resetear la vista completa
    onReinitialize?: () => void;
}

const ArquitectoConfigModal: React.FC<ArquitectoConfigModalProps> = ({ sessionId, onClose, onPanicResolved, onReinitialize }) => {
    const { implacableMode, setImplacableMode, ragFilters, setRagFilters, setIsPurging } = useArquitectoStore();
    const [isDeleting, setIsDeleting] = useState(false);
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const tArch = t.architect;

    const handlePanic = async () => {
        const userId = getAuth().currentUser?.uid;
        if (!sessionId || !userId) return;

        const confirmMsg = "¿Estás 100% seguro de purgar el Roadmap de esta sesión? Esto destruirá todas las tarjetas y el objetivo, forzando un reinicio desde el Triage/Inquisidor.";
        if (!window.confirm(confirmMsg)) return;

        setIsDeleting(true);
        setIsPurging(true); // 🟢 BLOQUEO: Evitar rehidratación fantasma
        toast.loading("Purgando el rito de inicialización...", { id: 'panic' });

        try {
            const db = getFirestore();
            const batch = writeBatch(db);
            const sessionRef = doc(db, 'users', userId, 'forge_sessions', sessionId);
            const roadmapRef = doc(sessionRef, 'architect', 'roadmap');
            const cardsRef = collection(roadmapRef, 'cards');

            // 1. Obtener todas las tarjetas
            const cardsSnapshot = await getDocs(cardsRef);
            cardsSnapshot.forEach((cardDoc) => {
                batch.delete(cardDoc.ref);
            });

            // 2. Eliminar el documento roadmap
            batch.delete(roadmapRef);

            // 3. Opcional: limpiar pendingItems en la sesión para empezar limpios
            // Usamos set con merge: true para evitar error NOT_FOUND si la sesión no existe o fue purgada
            batch.set(sessionRef, { pendingItems: [] }, { merge: true });

            // 4. Exorcismo de Fantasmas: limpiar project_config (firestore)
            const projectConfigRef = doc(db, 'users', userId, 'profile', 'project_config');
            batch.set(projectConfigRef, {
                arquitectoCachedPendingItems: [],
                lastArquitectoAnalysis: null
            }, { merge: true });

            await batch.commit();

            // 5. Limpiar caché Zustand
            useArquitectoStore.getState().setArquitectoPendingItems([]);
            useArquitectoStore.getState().setArquitectoHasInitialized(false);

            toast.success("Rito de inicialización purgado.", { id: 'panic' });
            onPanicResolved(); // Esto debe gatillar una re-evaluación en el parent
            onClose();

        } catch (error) {
            console.error("Error en panic button:", error);
            toast.error("Error al purgar los datos.", { id: 'panic' });
        } finally {
            setIsDeleting(false);
            setIsPurging(false); // 🟢 DESBLOQUEO
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="w-full max-w-[440px] bg-[#141416] border border-titanium-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-titanium-800/50">
                    <div className="flex items-center gap-2 text-titanium-200">
                        <BrainCircuit size={18} className="text-cyan-400" />
                        <h2 className="font-semibold tracking-wide">{tArch.settings || "Configuración Multiversal"}</h2>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-titanium-300 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-6 p-6 overflow-y-auto">

                    {/* Sección Personalidad */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-[11px] font-mono tracking-wider uppercase text-titanium-500">{tArch.architectPersonality || "Personalidad del Arquitecto"}</h3>
                        
                        {/* 
                            TODO: Implementar como temperature=0.0 + prompt de crítico literario cuando esté activo 
                            Se oculta de la UI por falta de implementación en el backend.
                        */}
                        <p className="text-[12px] text-titanium-600 italic">
                            Ajustes avanzados de personalidad se habilitarán en futuras actualizaciones.
                        </p>
                    </div>

                    <div className="h-px bg-titanium-800/50 w-full" />

                    {/* Sección Filtros RAG */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-[11px] font-mono tracking-wider uppercase text-titanium-500">{tArch.ragFilters || "Filtros de Conocimiento (RAG)"}</h3>
                        
                        {/* TODO: Implementar filtrado RAG real antes de mostrar */}
                        <p className="text-[12px] text-titanium-600 italic leading-snug">
                            El Arquitecto actualmente utiliza todo el canon disponible para garantizar la máxima coherencia.
                        </p>
                    </div>

                    <div className="h-px bg-titanium-800/50 w-full" />

                    {/* Sección Zona de Peligro */}
                    <div className="flex flex-col gap-3">
                        <h3 className="text-[11px] font-mono tracking-wider uppercase text-red-500/80">{t.common?.dangerZone || "Zona de Peligro"}</h3>

                        <div className="bg-red-950/20 border border-red-900/30 rounded-xl p-4 flex flex-col gap-3">
                            <p className="text-[12px] text-red-300/80 leading-snug">
                                Elimina todo el progreso de esta sesión y reinicia el Arquitecto desde cero. Esta acción no se puede deshacer.
                            </p>
                            <button
                                onClick={() => {
                                    if (window.confirm(tArch.confirmReinit || "¿Estás seguro de reiniciar?")) {
                                        if (onReinitialize) {
                                            onReinitialize();
                                            onClose();
                                        } else {
                                            handlePanic();
                                        }
                                    }
                                }}
                                disabled={isDeleting}
                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-950/50 border border-red-500/50 text-red-400 text-sm font-medium hover:bg-red-900/50 transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? (
                                    <><Loader2 size={14} className="animate-spin" /> {t.common?.purgingData || "Purgando datos..."}</>
                                ) : (
                                    <><Flame size={14} /> {"Reiniciar Sesión del Arquitecto"}</>
                                )}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default ArquitectoConfigModal;
