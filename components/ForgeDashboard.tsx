import React, { useState, useEffect } from 'react';
import { getFirestore, collection, onSnapshot, query } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import ForgeSkeleton from './ForgeSkeleton';
import ForgeSoul from './ForgeSoul';
import ForgeChat from './ForgeChat';

interface Character {
    id: string;
    name: string;
    tier: 'MAIN' | 'SUPPORTING';
    sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
    masterFileId?: string;
    snippets?: { text: string; sourceBookId: string }[];
    // Extended fields
    age?: string;
    role?: string;
    faction?: string;
    content?: string; // Derived content
}

interface ForgeDashboardProps {
    folderId: string;
    accessToken: string | null;
    characterVaultId: string;
}

const ForgeDashboard: React.FC<ForgeDashboardProps> = ({ folderId, accessToken, characterVaultId }) => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [activeChar, setActiveChar] = useState<Character | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // FETCH CHARACTERS (Real-time)
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
            // Sort: MAIN first, then alphabetically
            chars.sort((a, b) => {
                if (a.tier === b.tier) return a.name.localeCompare(b.name);
                return a.tier === 'MAIN' ? -1 : 1;
            });
            setCharacters(chars);
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
                            {characters.map(char => (
                                <button
                                    key={char.id}
                                    onClick={() => setActiveChar(char)}
                                    className={`p-4 rounded-xl border text-left transition-all hover:-translate-y-1 hover:shadow-lg ${
                                        char.tier === 'MAIN'
                                        ? 'bg-titanium-900 border-titanium-700 hover:border-accent-DEFAULT/50'
                                        : 'bg-titanium-900/50 border-titanium-800 hover:border-titanium-600'
                                    }`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                            char.tier === 'MAIN' ? 'bg-accent-DEFAULT/10 text-accent-DEFAULT' : 'bg-titanium-800 text-titanium-500'
                                        }`}>
                                            {char.tier === 'MAIN' ? 'MASTER' : 'LOCAL'}
                                        </span>
                                    </div>
                                    <h3 className="font-bold text-lg text-titanium-100 truncate">{char.name}</h3>
                                    <p className="text-xs text-titanium-500 mt-1 truncate">
                                        {char.role || "No archetype defined"}
                                    </p>
                                </button>
                            ))}
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
                                folderId={folderId}
                                accessToken={accessToken}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ForgeDashboard;
