import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import ForgeSourceSelector from './ForgeSourceSelector';
import ForgeContextDock from './ForgeContextDock';
import CharacterInspector from './CharacterInspector';
import ForgeChat from './ForgeChat';
import { Character } from '../types';

interface ForgeDashboardProps {
    folderId: string;
    accessToken: string | null;
    characterVaultId: string;
    activeContextFolderId: string | null;
}

type DashboardState = 'SELECT_SOURCE' | 'ANALYZING' | 'IDE';

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, characterVaultId, activeContextFolderId }) => {
    // STATE MACHINE
    const [state, setState] = useState<DashboardState>('SELECT_SOURCE');
    const [isLoading, setIsLoading] = useState(true);

    // SESSION VERSIONING (Forcing Refresh)
    const [sessionVersion, setSessionVersion] = useState(0);

    // DATA
    const [characters, setCharacters] = useState<Character[]>([]);
    const [detectedEntities, setDetectedEntities] = useState<any[]>([]); // Results from Analyzer
    const [initialReport, setInitialReport] = useState<string>("");

    // UI
    const [activeSourceFile, setActiveSourceFile] = useState<{ id: string, name: string } | null>(null);
    const [activeFocusChar, setActiveFocusChar] = useState<any | null>(null); // Character or Ghost
    const [inspectorData, setInspectorData] = useState<any | null>(null); // Open Inspector

    // --- 1. FETCH CHARACTERS (BACKGROUND SYNC) ---
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser) return;

        const db = getFirestore();
        const q = query(collection(db, "users", auth.currentUser.uid, "characters"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                chars.push({ id: doc.id, ...doc.data() } as Character);
            });
            // Filter logic if needed, or just store all
            setCharacters(chars);
        });

        return () => unsubscribe();
    }, []);

    // --- 2. HANDLE SOURCE SELECTION & ANALYSIS ---
    const handleSourceSelected = async (fileId: string, fileName: string) => {
        setActiveSourceFile({ id: fileId, name: fileName });
        setState('ANALYZING');

        try {
            const functions = getFunctions();
            const forgeAnalyzer = httpsCallable(functions, 'forgeAnalyzer');

            const existingNames = characters.map(c => c.name);

            const result: any = await forgeAnalyzer({
                fileId,
                accessToken,
                existingCharacterNames: existingNames,
                characterSourceId: characterVaultId // 🟢 WIDE NET: Pass master vault ID
            });

            // Process Result
            let entities = result.data.entities || [];
            const report = result.data.report_summary || "Analysis complete.";

            // 🔍 INTELLIGENT MATCHING (GAMMA FIX)
            // Attach Real IDs to detected entities if they are 'EXISTING'
            entities = entities.map((e: any) => {
                if (e.status === 'EXISTING') {
                    // Try to find in characters list
                    const match = characters.find(c => c.name.toLowerCase() === e.name.toLowerCase());
                    if (match) {
                        return { ...e, id: match.id };
                    }
                }
                return e;
            });

            setDetectedEntities(entities);
            setInitialReport(report);

            setState('IDE');

        } catch (error) {
            console.error("Analysis failed:", error);
            toast.error("Deep Scan failed. Proceeding without analysis.");
            setState('IDE'); // Fallback
        }
    };

    // 🟢 ALPHA FIX: REFRESH HANDLER
    const handleRefresh = () => {
        if (activeSourceFile) {
            toast.info("Forzando re-análisis...");
            handleSourceSelected(activeSourceFile.id, activeSourceFile.name);
        }
    };

    // 🟢 NEW SESSION HANDLER
    const handleResetSession = () => {
        setSessionVersion(prev => prev + 1);
        toast.info("Nueva sesión iniciada.");
    };

    // --- 3. HANDLE FOCUS ---
    const handleCharacterSelect = (char: any) => {
        // If double click or specific action, open Inspector?
        // For now, let's say Single Click = Focus Chat, Double Click = Inspector
        // But to keep it simple: Click = Open Inspector?
        // The plan said: "Inspector... allows editing... click on name in right panel"
        setInspectorData(char);
    };

    // --- RENDER ---

    if (state === 'SELECT_SOURCE') {
        return <ForgeSourceSelector onSourceSelected={handleSourceSelected} accessToken={accessToken} />;
    }

    if (state === 'ANALYZING') {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-titanium-950 text-titanium-100 space-y-4 animate-fade-in">
                <Loader2 size={48} className="animate-spin text-accent-DEFAULT" />
                <h2 className="text-2xl font-bold">Deep Thinking Scan...</h2>
                <p className="text-titanium-400">Leyendo {activeSourceFile?.name || "archivo"}...</p>
                <p className="text-xs text-titanium-600">Analizando relaciones, detectando entidades y calculando consistencia.</p>
            </div>
        );
    }

    // IDE MODE (SPLIT VIEW)
    return (
        <div className="w-full h-full flex bg-titanium-950 overflow-hidden relative">

            {/* LEFT PANEL: CHAT / EDITOR (60%) */}
            <div className="w-[60%] h-full flex flex-col border-r border-titanium-800">
                <ForgeChat
                    sessionId={`session_${activeSourceFile?.id || 'general'}_v${sessionVersion}`}
                    sessionName={`Editor: ${activeSourceFile?.name || 'General'}`}
                    onBack={() => {}}
                    folderId={folderId}
                    accessToken={accessToken}
                    characterContext={""} // Global context handling
                    activeContextFile={activeSourceFile ? {
                        id: activeSourceFile.id,
                        name: activeSourceFile.name,
                        content: "" // Analyzer read it, Chat RAG will read it if needed
                    } : undefined}
                    initialReport={initialReport}
                    onReset={handleResetSession}
                />
            </div>

            {/* RIGHT PANEL: CONTEXT DOCK (40%) */}
            <div className="w-[40%] h-full flex flex-col">
                <ForgeContextDock
                    characters={characters}
                    detectedEntities={detectedEntities}
                    onCharacterSelect={handleCharacterSelect}
                    isLoading={false}
                    onRefresh={handleRefresh}
                />
            </div>

            {/* INSPECTOR OVERLAY */}
            {inspectorData && (
                <CharacterInspector
                    data={inspectorData}
                    onClose={() => setInspectorData(null)}
                    onMaterialize={(char) => {
                        // Optimistically update list or wait for sync
                        // The sync is automatic via Firestore listener for created chars.
                        // Detected entities list might need cleanup if we want to remove the ghost immediately
                        setDetectedEntities(prev => prev.map(e => e.name === char.name ? { ...e, status: 'EXISTING' } : e));
                    }}
                    folderId={activeContextFolderId || characterVaultId || folderId}
                    accessToken={accessToken}
                />
            )}
        </div>
    );
};

export default ForgeDashboard;
