import React, { useState, useEffect } from 'react';
import { X, Save, Sparkles, Database } from 'lucide-react';
import { Character } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';

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
    let displayBio = null;
    if (realData) {
        // Option A: Use snippets if available
        if (realData.snippets && realData.snippets.length > 0) {
            displayBio = realData.snippets[0].text;
        } else if (realData.bio) {
            displayBio = realData.bio;
        } else if (realData.content) {
            displayBio = realData.content;
        } else {
             displayBio = "Ficha cargada, pero sin biografía textual.";
        }
    } else {
        displayBio = data.description || "No detailed description available from the scan.";
    }

    return (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end animate-fade-in" onClick={onClose}>
            <div
                className="w-full max-w-md h-full bg-titanium-950 border-l border-titanium-700 shadow-2xl flex flex-col transform transition-transform duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-900">
                    <div>
                        <h2 className="text-xl font-bold text-titanium-100">{data.name}</h2>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${isGhost ? 'bg-purple-900 text-purple-300' : 'bg-accent-DEFAULT/10 text-accent-DEFAULT'}`}>
                            {isGhost ? 'DETECTED ENTITY' : 'ESTABLISHED CHARACTER'}
                        </span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">

                    {/* ROLE SECTION */}
                    <div>
                        <label className="text-xs font-bold text-titanium-500 uppercase">Role</label>
                        <p className="text-titanium-200 mt-1 text-lg">{displayRole}</p>
                    </div>

                    {/* BIO SECTION */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <label className="text-xs font-bold text-titanium-500 uppercase">
                                {realData ? "Official Database Record" : "Analysis Summary"}
                             </label>
                             {realData && <Database size={12} className="text-accent-DEFAULT" />}
                        </div>

                        {isLoadingReal ? (
                            <div className="p-4 bg-titanium-900 rounded-lg border border-titanium-800 animate-pulse text-titanium-500 text-sm">
                                Fetching Vault Data...
                            </div>
                        ) : (
                            <div className={`p-4 rounded-lg border text-sm leading-relaxed ${realData ? 'bg-accent-DEFAULT/5 border-accent-DEFAULT/20 text-titanium-100' : 'bg-titanium-900 border-titanium-800 text-titanium-300'}`}>
                                {displayBio}
                            </div>
                        )}
                    </div>

                    {/* SCAN NOTES (If Existing but Analysis has new info) */}
                    {realData && data.description && (
                         <div className="mt-4">
                             <label className="text-xs font-bold text-purple-400 uppercase flex items-center gap-2">
                                <Sparkles size={12} />
                                Notes from Current Scan
                             </label>
                             <div className="p-3 bg-purple-900/10 border border-purple-500/20 rounded-lg mt-1 text-titanium-400 text-xs italic">
                                 {data.description}
                             </div>
                         </div>
                    )}

                    {/* GHOST ACTIONS */}
                    {isGhost && (
                        <div className="mt-8 p-4 bg-purple-900/10 border border-purple-500/30 rounded-xl">
                            <h4 className="text-purple-300 font-bold mb-2 flex items-center gap-2">
                                <Sparkles size={16} />
                                Entity Detected
                            </h4>
                            <p className="text-titanium-400 text-sm mb-4">
                                This character was found in the text but does not have a sheet in the database.
                            </p>
                            <button
                                onClick={handleMaterialize}
                                disabled={isSaving}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/20"
                            >
                                {isSaving ? <Sparkles className="animate-spin" /> : <Save size={18} />}
                                {isSaving ? "Forging..." : "Materialize (Create Sheet)"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CharacterInspector;
