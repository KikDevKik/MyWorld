import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles, Database, Loader2 } from 'lucide-react';
import { Character } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import MarkdownRenderer from './MarkdownRenderer';

// Define a unified interface for display
interface InspectorData {
    id?: string; // Only existing chars have ID
    name: string;
    role: string;
    description?: string;
    status: 'EXISTING' | 'DETECTED';
}

interface CharacterInspectorProps {
    data: InspectorData | null;
    onClose: () => void;
    onMaterialize: (char: InspectorData) => void;
    folderId: string;
    accessToken: string | null;
}

const CharacterInspector: React.FC<CharacterInspectorProps> = ({ data, onClose, onMaterialize, folderId, accessToken }) => {
    const [isSaving, setIsSaving] = useState(false);
    const [realData, setRealData] = useState<any | null>(null);
    const [isLoadingReal, setIsLoadingReal] = useState(false);

    // 🟢 GAMMA FIX: Fetch Real Data if EXISTING
    useEffect(() => {
        if (data && data.status === 'EXISTING' && data.id) {
            const fetchRealData = async () => {
                setIsLoadingReal(true);
                try {
                    const auth = getAuth();
                    if (!auth.currentUser) return;

                    const db = getFirestore();
                    const docRef = doc(db, "users", auth.currentUser.uid, "characters", data.id!);
                    const snapshot = await getDoc(docRef);

                    if (snapshot.exists()) {
                        setRealData(snapshot.data());
                    }
                } catch (e) {
                    console.error("Failed to fetch real character data:", e);
                } finally {
                    setIsLoadingReal(false);
                }
            };
            fetchRealData();
        } else {
            setRealData(null); // Reset if switching to ghost
        }
    }, [data]);

    if (!data) return null;

    const isGhost = data.status === 'DETECTED';

    const handleMaterialize = async () => {
        setIsSaving(true);
        const functions = getFunctions();
        const forgeToolExecution = httpsCallable(functions, 'forgeToolExecution');

        try {
            // Generate basic content template
            const content = `# ${data.name}

**Role:** ${data.role}

## Overview
(Generated from Analysis)
${data.description || "No specific details detected yet."}

## Traits
- [ ] Undefined

## Notes
Materialized from Deep Scan.
`;

            // Call backend to create file
            await forgeToolExecution({
                title: data.name,
                content: content,
                folderId: folderId,
                accessToken: accessToken
            });

            toast.success(`${data.name} materialized successfully!`);
            onMaterialize(data); // Notify parent to update list/state
            onClose();

        } catch (error) {
            console.error("Materialization failed:", error);
            toast.error("Failed to materialize character.");
        } finally {
            setIsSaving(false);
        }
    };

    // 🟢 RENDER LOGIC: PRIORITY TO REAL DATA
    const displayRole = realData?.role || data.role;

    // Construct Display Bio
    let displayBio = "";
    if (realData) {
        // Option A: Use snippets if available
        if (realData.snippets && realData.snippets.length > 0) {
            displayBio = realData.snippets[0].text;
        } else if (realData.bio) {
            displayBio = realData.bio;
        } else if (realData.content) {
            displayBio = realData.content;
        } else {
             displayBio = "_Ficha cargada, pero sin biografía textual disponible en la base de datos._";
        }
    } else {
        displayBio = data.description || "No detailed description available from the scan.";
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
            <div
                className="w-full max-w-4xl max-h-[85vh] flex flex-col bg-titanium-950 border border-titanium-700 shadow-2xl rounded-2xl overflow-hidden transform transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                {/* HEADER (Sticky) */}
                <div className="shrink-0 h-20 px-8 flex items-center justify-between border-b border-titanium-800 bg-titanium-900/90 backdrop-blur">
                    {/* Left: Identity */}
                    <div className="flex items-center gap-4">
                        <h2 className="text-3xl font-bold text-titanium-100 font-serif tracking-wide">{data.name}</h2>

                        <div className="flex items-center gap-2">
                             {/* Status Badge */}
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${isGhost ? 'bg-purple-900/20 border-purple-500/30 text-purple-300' : 'bg-cyan-900/20 border-cyan-500/30 text-cyan-300'}`}>
                                {isGhost ? 'Detected' : 'Existing'}
                             </span>

                             {/* Role Badge (Moved from body) */}
                             {displayRole && (
                                 <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-titanium-800/50 border-titanium-600/30 text-titanium-300">
                                     {displayRole}
                                 </span>
                             )}
                        </div>
                    </div>

                    {/* Right: Close X */}
                    <button onClick={onClose} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors">
                        <X size={28} />
                    </button>
                </div>

                {/* CONTENT BODY (Scrollable) */}
                <div className="flex-1 overflow-y-auto p-10 bg-gradient-to-b from-titanium-950 to-titanium-900/30">

                    {/* Loading State */}
                    {isLoadingReal && (
                        <div className="flex flex-col items-center justify-center py-20 text-titanium-500 gap-3">
                            <Loader2 className="animate-spin text-accent-DEFAULT" size={32} />
                            <span className="text-sm font-mono animate-pulse">Retrieving Vault Data...</span>
                        </div>
                    )}

                    {/* Bio Content */}
                    {!isLoadingReal && (
                        <div className="max-w-none animate-fade-in">
                            {realData && (
                                <div className="mb-6 flex items-center gap-2 text-xs font-bold text-titanium-600 uppercase tracking-widest border-b border-titanium-800/50 pb-2">
                                    <Database size={12} className="text-accent-DEFAULT" />
                                    <span>Official Database Record</span>
                                </div>
                            )}

                            {/* The Reader View */}
                            <div className="min-h-[200px]">
                                <MarkdownRenderer content={displayBio} mode="full" />
                            </div>
                        </div>
                    )}

                    {/* Scan Notes (Secondary / Append) */}
                    {realData && data.description && (
                         <div className="mt-16 pt-8 border-t border-titanium-800/30">
                             <h4 className="text-xs font-bold text-purple-400/70 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Sparkles size={12} />
                                Analysis Vector (Current Session)
                             </h4>
                             <p className="text-titanium-500 text-sm italic leading-relaxed">
                                {data.description}
                             </p>
                         </div>
                    )}
                </div>

                {/* FOOTER (Sticky) */}
                <div className="shrink-0 h-20 px-8 flex items-center justify-between border-t border-titanium-800 bg-titanium-900/90 backdrop-blur">
                    {/* Metadata */}
                     <div className="text-xs text-titanium-600 font-mono flex items-center gap-2">
                         <span>ID:</span>
                         <span className="text-titanium-500">{data.id || 'UNREGISTERED_ENTITY'}</span>
                     </div>

                    {/* Actions */}
                     <div className="flex items-center gap-4">
                         <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-lg font-bold text-titanium-400 hover:text-white hover:bg-titanium-800 transition-colors"
                         >
                             Close
                         </button>

                         {isGhost && (
                             <button
                                onClick={handleMaterialize}
                                disabled={isSaving}
                                className="px-8 py-2.5 bg-purple-600 hover:bg-purple-500 hover:scale-105 active:scale-95 text-white font-bold rounded-lg shadow-lg shadow-purple-900/20 flex items-center gap-2 transition-all"
                             >
                                {isSaving ? <Sparkles className="animate-spin" size={18} /> : <Save size={18} />}
                                <span>{isSaving ? 'Forging...' : 'Materialize Entity'}</span>
                             </button>
                         )}
                     </div>
                </div>
            </div>
        </div>
    );
};

export default CharacterInspector;
