import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Sparkles, Database, Loader2, BrainCircuit } from 'lucide-react';
import { Character } from '../types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { toast } from 'sonner';
import MarkdownRenderer from './MarkdownRenderer';
import { motion, AnimatePresence } from 'framer-motion';

// Define a unified interface for display (Now Compatible with Character type)
interface InspectorData extends Partial<Character> {
    id?: string; // Only existing chars have ID
    name: string;
    role: string; // Mandatory in UI
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
    const [isAnalyzing, setIsAnalyzing] = useState(false); // 🔮 Deep Analysis State
    const [realData, setRealData] = useState<any | null>(null);
    const [isLoadingReal, setIsLoadingReal] = useState(false);
    const [isRoleExpanded, setIsRoleExpanded] = useState(false);

    // 🟢 GAMMA FIX: Fetch Real Data (EXISTING or DETECTED)
    useEffect(() => {
        if (data) {
            const fetchRealData = async () => {
                setIsLoadingReal(true);
                try {
                    const auth = getAuth();
                    if (!auth.currentUser) return;

                    const db = getFirestore();
                    let docRef = null;

                    if (data.status === 'EXISTING' && data.id) {
                         docRef = doc(db, "users", auth.currentUser.uid, "characters", data.id);
                    } else if (data.status === 'DETECTED') {
                         // Ghosts: Derive ID from name if missing
                         const targetId = data.id || data.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '-');
                         docRef = doc(db, "users", auth.currentUser.uid, "forge_detected_entities", targetId);
                    }

                    if (docRef) {
                        const snapshot = await getDoc(docRef);
                        if (snapshot.exists()) {
                            setRealData(snapshot.data());
                        } else {
                            setRealData(null);
                        }
                    }
                } catch (e) {
                    console.error("Failed to fetch real data:", e);
                } finally {
                    setIsLoadingReal(false);
                }
            };
            fetchRealData();
        }
    }, [data]);

    if (!data) return null;

    const isGhost = data.status === 'DETECTED';

    // 🔮 PHASE 2: DEEP ANALYSIS TRIGGER
    const handleDeepAnalysis = async () => {
        // if (!data.id) return; // Allow ghosts without ID (backend handles it)
        setIsAnalyzing(true);
        const functions = getFunctions();
        const enrichContext = httpsCallable(functions, 'enrichCharacterContext');

        try {
            const result: any = await enrichContext({
                characterId: data.id,
                name: data.name,
                saga: realData?.sourceContext || 'Global',
                currentBio: realData?.content || '',
                status: data.status // 🟢 Pass status for correct routing
            });

            if (result.data.success) {
                toast.success("Context Analysis Complete!");
                // Update local state to show result immediately
                setRealData((prev: any) => ({
                    ...prev,
                    contextualAnalysis: result.data.analysis,
                    sources: result.data.sources, // 📚 Store Sources
                    lastAnalyzed: result.data.timestamp
                }));
            } else {
                toast.error(result.data.message || "Analysis returned no results.");
            }
        } catch (error: any) {
            console.error("Analysis failed:", error);
            toast.error(`Deep Analysis Failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

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

    // 🟢 RENDER LOGIC: PRIORITY TO REAL DATA (WITH QUALITY CHECK)
    // If realData.role is too long (> 60 chars), it's likely a description leak from legacy imports.
    // In that case, we fallback to the AI-detected role (data.role) from the current session.
    // If realData.role is short, we respect it (it might be the fixed Global Role).
    let displayRole = data.role; // Default to AI detected

    if (realData?.role) {
        if (realData.role.length < 60) {
            displayRole = realData.role; // It's a proper role
        } else {
             // It's a description leak. Do we have an AI role?
             if (!data.role || data.role.length > 60) {
                 // Even AI role is bad or missing? Truncate the DB one.
                 // FORCE TRUNCATION HERE if both are bad
                 displayRole = realData.role;
             }
             // Else keep AI role
        }
    }

    // Capture the full role text BEFORE truncation for the popover
    const fullRoleText = displayRole;

    // 🛡️ SAFETY CLIPPING: Enforce strict role length for UI Badge
    // Just in case the logic above leaked a long string
    if (displayRole && displayRole.length > 50) {
        displayRole = displayRole.substring(0, 50) + "...";
    }

    // Construct Display Bio
    let displayBio = "";
    if (realData) {
        // Option A: Use FULL CONTENT (Markdown) if available - Highest Priority for "Existing"
        if (realData.content) {
            displayBio = realData.content;
        } else if (realData.bio) {
             // Option B: Legacy 'bio' field
            displayBio = realData.bio;
        } else if (realData.snippets && realData.snippets.length > 0) {
             // Option C: Fallback to snippets (RAG Chunks)
            displayBio = realData.snippets[0].text;
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
                                 <button
                                    onClick={() => setIsRoleExpanded(true)}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-titanium-800/50 border-titanium-600/30 text-titanium-300 hover:border-titanium-400 hover:text-titanium-100 transition-colors cursor-pointer text-left max-w-[200px] truncate"
                                 >
                                     {displayRole}
                                 </button>
                             )}

                             {/* Role Expansion Popover (Centered Mini Modal - Portal) */}
                             <AnimatePresence>
                                {isRoleExpanded && fullRoleText && createPortal(
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setIsRoleExpanded(false);
                                        }}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                            animate={{ scale: 1, opacity: 1, y: 0 }}
                                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                            transition={{ type: "spring", damping: 20, stiffness: 300 }}
                                            className="w-full max-w-xl bg-titanium-950 border border-titanium-600 p-8 rounded-2xl shadow-2xl relative m-4 max-h-[80vh] overflow-y-auto"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="prose prose-invert prose-lg max-w-none text-titanium-100">
                                               <MarkdownRenderer content={fullRoleText} mode="full" />
                                            </div>
                                        </motion.div>
                                    </motion.div>,
                                    document.body
                                )}
                             </AnimatePresence>
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

                    {/* 🔮 PHASE 2: CONTEXTUAL ANALYSIS SECTION */}
                    {realData && realData.contextualAnalysis && (
                        <div className="mt-12 pt-8 border-t border-titanium-800/50 bg-gradient-to-r from-purple-900/10 to-transparent -mx-10 px-10 pb-8 animate-fade-in">
                             <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
                                    <BrainCircuit size={16} />
                                    📂 ARCHIVOS DE INTELIGENCIA
                                </h4>
                                {realData.lastAnalyzed && (
                                    <span className="text-[10px] font-mono text-purple-400/50">
                                        UPDATED: {new Date(realData.lastAnalyzed).toLocaleString()}
                                    </span>
                                )}
                             </div>

                             <div className="prose prose-invert prose-sm max-w-none text-purple-200/80">
                                <MarkdownRenderer content={realData.contextualAnalysis} mode="compact" />
                             </div>

                             {/* 📚 SOURCES FOOTNOTE */}
                             {realData.sources && realData.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-purple-500/20 text-[10px] text-purple-400/50 font-mono">
                                    <span className="font-bold">📚 SOURCES:</span> {realData.sources.join(", ")}
                                </div>
                             )}
                        </div>
                    )}

                    {/* Scan Notes (Secondary / Append) */}
                    {data.description && (
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

                         {/* 🔮 DEEP ANALYSIS / RE-SCAN BUTTON */}
                         <button
                            onClick={handleDeepAnalysis}
                            disabled={isAnalyzing}
                            className={`px-6 py-2.5 font-bold rounded-lg flex items-center gap-2 transition-all border ${
                                realData?.contextualAnalysis
                                ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-purple-500/30'
                                : 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border-purple-500/30'
                            }`}
                         >
                            {isAnalyzing ? <Loader2 className="animate-spin" size={18} /> : <BrainCircuit size={18} />}
                            <span>
                                {isAnalyzing
                                    ? 'Analyzing...'
                                    : (realData?.contextualAnalysis ? '🔄 Re-Scan Context' : '🔮 Deep Analysis')
                                }
                            </span>
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
