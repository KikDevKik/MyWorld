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
 * RoadmapFinalView — Las 3 columnas del Roadmap Final del AI Studio.
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
        const md = `# Mega-Roadmap: Plan de Implementación Definitivo\n\n## 1. Changelog (Lo Resuelto)\n${roadmap.changelog.map(i => `- ${i}`).join('\n')}\n\n## 2. Misiones de Creación (Lo Nuevo)\n${roadmap.creationMissions.map(i => `- ${i}`).join('\n')}\n\n## 3. Misiones de Investigación (Contexto Externo)\n${roadmap.researchMissions.map(i => `- ${i}`).join('\n')}`;
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Mega-Roadmap.md';
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
                    El Roadmap Final se genera cuando el interrogatorio socrático llega a su conclusión.
                </p>
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 text-sm rounded-lg hover:bg-cyan-950/50 transition-colors disabled:opacity-50"
                >
                    {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    {isGenerating ? (t.common?.generating || 'Generando...') : (t.common?.generateNow || 'Generar Ahora')}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex justify-end px-4 py-2 border-b border-titanium-800 shrink-0">
                <button
                    onClick={handleDownload}
                    className="flex items-center gap-1.5 text-[11px] text-titanium-500 hover:text-titanium-300 transition-colors"
                >
                    <Download size={12} />
                    {t.common?.downloadMd || "Descargar .md"}
                </button>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-0 overflow-hidden divide-x divide-titanium-800">
                {/* Changelog */}
                <div className="flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-titanium-800 bg-emerald-950/10 flex items-center gap-2 shrink-0">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="text-xs font-medium text-emerald-300">Changelog</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {roadmap.changelog.map((item, i) => (
                            <div key={i} className="text-[12px] text-titanium-300 bg-titanium-900/50 p-2.5 rounded-lg border border-titanium-800/50">
                                <Markdown>{item}</Markdown>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Misiones de Creación */}
                <div className="flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-titanium-800 bg-amber-950/10 flex items-center gap-2 shrink-0">
                        <PlusCircle size={14} className="text-amber-500" />
                        <span className="text-xs font-medium text-amber-300">{t.architect?.creationMissions || "Misiones de Creación"}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {roadmap.creationMissions.map((item, i) => (
                            <div key={i} className="text-[12px] text-titanium-300 bg-titanium-900/50 p-2.5 rounded-lg border border-titanium-800/50">
                                <Markdown>{item}</Markdown>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Misiones de Investigación */}
                <div className="flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-titanium-800 bg-blue-950/10 flex items-center gap-2 shrink-0">
                        <Search size={14} className="text-blue-500" />
                        <span className="text-xs font-medium text-blue-300">{t.common?.research || "Investigación"}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                        {roadmap.researchMissions.map((item, i) => (
                            <div key={i} className="text-[12px] text-titanium-300 bg-titanium-900/50 p-2.5 rounded-lg border border-titanium-800/50">
                                <Markdown>{item}</Markdown>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}