import React, { useEffect, useState } from 'react';
import { CheckCircle2, PlusCircle, Search, Download, Loader2 } from 'lucide-react';
import { getFirestore, getDoc, doc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { callFunction } from '../../services/api';
import Markdown from 'react-markdown';
import { useLanguageStore } from '../../stores/useLanguageStore';
import { TRANSLATIONS } from '../../i18n/translations';

interface RoadmapFinal {
    changelog: string[];
    creationMissions: string[];
    researchMissions: string[];
}

interface Props {
    sessionId: string | null;
}

/**
 * RoadmapFinalView — el roadmap: misiones, lo resuelto y lo que hay que investigar.
 * Changelog + Misiones de Creación + Misiones de Investigación.
 * 
 * Se genera cuando todas las contradicciones MACRO están resueltas
 * o cuando el usuario lo solicita explícitamente.
 */
export default function RoadmapFinalView({ sessionId }: Props) {
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const [roadmap, setRoadmap] = useState<RoadmapFinal | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (!sessionId) return;
        // Intentar cargar un roadmap final ya generado
        const loadExisting = async () => {
            const auth = getAuth();
            const userId = auth.currentUser?.uid;
            if (!userId) return;
            
            const db = getFirestore();
            const roadmapDoc = await getDoc(
                doc(db, 'users', userId, 'forge_sessions', sessionId, 'architect', 'roadmapFinal')
            );
            if (roadmapDoc.exists()) {
                setRoadmap(roadmapDoc.data() as RoadmapFinal);
            }
        };
        loadExisting();
    }, [sessionId]);

    const handleGenerate = async () => {
        if (!sessionId) return;
        setIsGenerating(true);
        try {
            const data = await callFunction<RoadmapFinal>('arquitectoGenerateRoadmapFinal', { sessionId });
            if (data) setRoadmap(data);
        } catch (e) {
            // toast de error
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownload = () => {
        if (!roadmap) return;
        const md = `# Roadmap\n\n## 1. Changelog (Lo Resuelto)\n${(roadmap.changelog || []).map(i => `- ${i}`).join('\n')}\n\n## 2. Misiones de Creación (Lo Nuevo)\n${(roadmap.creationMissions || []).map(i => `- ${i}`).join('\n')}\n\n## 3. Misiones de Investigación (Contexto Externo)\n${(roadmap.researchMissions || []).map(i => `- ${i}`).join('\n')}`;
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Roadmap.md';
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!roadmap) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60 p-6">
                <div className="w-12 h-12 rounded-full border border-titanium-800 flex items-center justify-center">
                    <Search size={20} className="text-titanium-600" />
                </div>
                <p className="text-titanium-400 text-sm text-center">
                    El roadmap se arma cuando cierras una conversación con «Cerrar y resumir»: lo decidido pasa aquí y al escritorio.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-mira/30 border border-mira/30 text-mira text-sm rounded-lg hover:bg-mira/50 transition-colors disabled:opacity-50"
                >
                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {isGenerating ? (t.common?.generating || 'Generando...') : (t.common?.generateNow || 'Generar Ahora')}
                </button>
            </div>
        );
    }

    // Nov 2026: solo las columnas que tienen algo (las conversaciones nuevas dejan solo misiones), legibles y en una
    // columna en pantallas angostas.
    const cols = [
        { key: 'creationMissions', title: 'Misiones', hint: 'Lo que toca escribir, en orden', icon: <PlusCircle size={15} className="text-coral" aria-hidden="true" />, items: roadmap.creationMissions || [], numbered: true },
        { key: 'changelog', title: 'Lo resuelto', hint: 'Decisiones que ya quedaron', icon: <CheckCircle2 size={15} className="text-logro" aria-hidden="true" />, items: roadmap.changelog || [], numbered: false },
        { key: 'researchMissions', title: 'Por investigar', hint: 'Datos de fuera que conviene buscar', icon: <Search size={15} className="text-mira" aria-hidden="true" />, items: roadmap.researchMissions || [], numbered: false },
    ].filter(c => c.items.length > 0);
    const gridCols = cols.length >= 3 ? 'lg:grid-cols-3' : cols.length === 2 ? 'md:grid-cols-2' : '';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-titanium-800 shrink-0">
                <p className="text-sm text-titanium-400">Mira te recuerda la siguiente misión cuando vuelves a escribir.</p>
                <button onClick={handleDownload} className="shrink-0 inline-flex items-center gap-1.5 text-sm text-titanium-400 hover:text-titanium-100 transition-colors">
                    <Download size={14} aria-hidden="true" />
                    {t.common?.downloadMd || "Descargar .md"}
                </button>
            </div>
            <div className={`flex-1 grid grid-cols-1 ${gridCols} overflow-y-auto md:overflow-hidden md:divide-x divide-titanium-800`}>
                {cols.map(c => (
                    <section key={c.key} aria-label={c.title} className="flex flex-col md:overflow-hidden">
                        <div className="px-5 py-3 border-b border-titanium-800 flex items-center gap-2 shrink-0">
                            {c.icon}
                            <h3 className="font-serif text-[15px] text-titanium-100">{c.title}</h3>
                            <span className="text-xs text-titanium-500 tabular-nums">{c.items.length}</span>
                            <span className="ml-auto text-xs text-titanium-500 hidden sm:inline">{c.hint}</span>
                        </div>
                        <ol className={`flex-1 md:overflow-y-auto p-4 flex flex-col gap-2 ${cols.length === 1 ? 'max-w-[760px] w-full mx-auto' : ''}`}>
                            {c.items.map((item, i) => (
                                <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-titanium-200 bg-titanium-900/50 px-3.5 py-3 rounded-xl border border-titanium-800/60">
                                    {c.numbered && <span className="shrink-0 w-6 h-6 rounded-full bg-titanium-800 text-titanium-300 text-xs flex items-center justify-center tabular-nums mt-0.5">{i + 1}</span>}
                                    <div className="min-w-0 [&_p]:m-0"><Markdown>{item}</Markdown></div>
                                </li>
                            ))}
                        </ol>
                    </section>
                ))}
            </div>
        </div>
    );
}
