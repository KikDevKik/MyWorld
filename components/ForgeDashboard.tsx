import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import ForgeSkeleton from './ForgeSkeleton';
import ForgeSoul from './ForgeSoul';
import ForgeChat from './ForgeChat';
import { Character } from '../types';

interface ForgeDashboardProps {
    folderId: string;
    accessToken: string | null;
    characterVaultId: string;
    activeContextFolderId: string | null;
}

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, characterVaultId, activeContextFolderId }) => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [activeChar, setActiveChar] = useState<Character | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // FETCH CHARACTERS (Real-time)
    useEffect(() => {
        const auth = getAuth();
        if (!auth.currentUser) return;

        // Reset selection if context changes and active char is hidden
        if (activeChar) {
             const isVisible = (!activeContextFolderId && activeChar.sourceContext === 'GLOBAL') ||
                               (activeContextFolderId && (activeChar.sourceContext === 'GLOBAL' || activeChar.sourceContext === activeContextFolderId));
             if (!isVisible) setActiveChar(null);
        }

        const db = getFirestore();
        const q = query(collection(db, "users", auth.currentUser.uid, "characters"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chars: Character[] = [];
            snapshot.forEach(doc => {
                chars.push({ id: doc.id, ...doc.data() } as Character);
            });

            // 🟢 HIDING LOGIC (Filter)
            const filteredChars = chars.filter(char => {
                if (!activeContextFolderId) {
                    // GLOBAL MODE: Show Global (Tier 1/2) only
                    return char.sourceContext === 'GLOBAL';
                } else {
                    // LOCAL MODE: Show Global + Local matches
                    return char.sourceContext === 'GLOBAL' || char.sourceContext === activeContextFolderId;
                }
            });

            // Sort: MAIN first, then SUPPORTING, then BACKGROUND, then alphabetically
            const tierOrder = { 'MAIN': 0, 'SUPPORTING': 1, 'BACKGROUND': 2 };

            filteredChars.sort((a, b) => {
                const tierA = tierOrder[a.tier] ?? 99;
                const tierB = tierOrder[b.tier] ?? 99;
                if (tierA === tierB) return a.name.localeCompare(b.name);
                return tierA - tierB;
            });

            setCharacters(filteredChars);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching characters:", error);
            toast.error("Error syncing soul manifest.");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleUpdateChar = (updates: Partial<Character>) => {
        if (!activeChar) return;
        // Optimistic update
        setActiveChar({ ...activeChar, ...updates });
        // TODO: Persist to Firestore
    };

    return (
        <div className="w-full h-full flex bg-titanium-950 text-titanium-100 overflow-hidden">

            {/* SELECTOR SIDEBAR (Mini) or TOP BAR?
                The plan asked for "SELECTOR" in Header Actions.
                Let's put a slim sidebar or a list if no char is selected.
            */}

            {/* LAYOUT STATE: If no char selected, show list. If selected, show Triptych. */}
            {!activeChar ? (
                <div className="w-full h-full p-8 overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3 text-accent-DEFAULT">
                        <Users />
                        <span>Soul Manifest</span>
                    </h2>

                    {isLoading ? (
                        <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {characters.map(char => {
                                // TIER 3: Compact Style
                                const isBackground = char.tier === 'BACKGROUND';
                                return (
                                    <button
                                        key={char.id}
                                        onClick={() => setActiveChar(char)}
                                        className={`rounded-xl border text-left transition-all hover:-translate-y-1 hover:shadow-lg ${
                                            isBackground
                                                ? 'p-3 bg-titanium-950/50 border-titanium-800 hover:border-titanium-600 opacity-80'
                                                : char.tier === 'MAIN'
                                                    ? 'p-4 bg-titanium-900 border-titanium-700 hover:border-accent-DEFAULT/50'
                                                    : 'p-4 bg-titanium-900/50 border-titanium-800 hover:border-titanium-600'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                char.tier === 'MAIN' ? 'bg-accent-DEFAULT/10 text-accent-DEFAULT' :
                                                char.tier === 'BACKGROUND' ? 'bg-titanium-900 text-titanium-600' : 'bg-titanium-800 text-titanium-500'
                                            }`}>
                                                {char.tier === 'MAIN' ? 'MASTER' : char.tier === 'BACKGROUND' ? 'LIGHT' : 'LOCAL'}
                                            </span>
                                            {char.sourceContext !== 'GLOBAL' && (
                                                <span className="text-[9px] font-mono text-titanium-600 uppercase ml-2">LOCAL</span>
                                            )}
                                        </div>
                                        <h3 className={`font-bold text-titanium-100 truncate ${isBackground ? 'text-sm' : 'text-lg'}`}>
                                            {char.name}
                                        </h3>
                                        {!isBackground && (
                                            <p className="text-xs text-titanium-500 mt-1 truncate">
                                                {char.role || "No archetype defined"}
                                            </p>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className="w-full h-full flex flex-col">
                    {/* HEADER */}
                    <div className="h-14 border-b border-titanium-800 bg-titanium-900 flex items-center justify-between px-4 shrink-0">
                        <button
                            onClick={() => setActiveChar(null)}
                            className="text-xs font-bold text-titanium-400 hover:text-white flex items-center gap-2"
                        >
                            ← BACK TO MANIFEST
                        </button>
                        <h2 className="font-bold text-titanium-200">{activeChar.name}</h2>
                        <div className="w-20" /> {/* Spacer */}
                    </div>

                    {/* TRIPTYCH GRID */}
                    <div className="flex-1 grid grid-cols-12 overflow-hidden">

                        {/* PANEL A: SKELETON (20%) */}
                        <div className="col-span-3 border-r border-titanium-800 h-full overflow-hidden">
                            <ForgeSkeleton activeChar={activeChar} onUpdate={handleUpdateChar} />
                        </div>

                        {/* PANEL B: SOUL (50%) */}
                        <div className="col-span-6 border-r border-titanium-800 h-full overflow-hidden">
                            <ForgeSoul activeChar={activeChar} accessToken={accessToken} />
                        </div>

                        {/* PANEL C: ADVISOR (30%) */}
                        <div className="col-span-3 h-full overflow-hidden bg-titanium-900">
                            <ForgeChat
                                sessionId={`char_${activeChar.id}`}
                                sessionName={`Advisor: ${activeChar.name}`}
                                onBack={() => {}} // No back button needed in split view
                                folderId={activeContextFolderId || characterVaultId || folderId}
                                accessToken={accessToken}
                                characterContext={activeChar.content || activeChar.description || activeChar.bio || activeChar.body || ""}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForgeDashboard;
