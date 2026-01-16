import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { FileText, ArrowUpCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Editor from '../editor/Editor';

interface Character {
    id: string;
    name: string;
    tier: 'MAIN' | 'SUPPORTING';
    sourceType: 'MASTER' | 'LOCAL' | 'HYBRID';
    masterFileId?: string;
    snippets?: { text: string; sourceBookId: string }[];
}

interface ForgeSoulProps {
    activeChar: Character;
    accessToken: string | null;
}

const ForgeSoul: React.FC<ForgeSoulProps> = ({ activeChar, accessToken }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // FETCH CONTENT
    useEffect(() => {
        const fetchContent = async () => {
            if (activeChar.tier === 'MAIN' && activeChar.masterFileId) {
                setIsLoading(true);
                const functions = getFunctions();
                const getDriveFileContent = httpsCallable(functions, 'getDriveFileContent');

                try {
                    const result: any = await getDriveFileContent({
                        fileId: activeChar.masterFileId,
                        accessToken
                    });
                    setContent(result.data.content || '');
                } catch (error) {
                    console.error("Error fetching soul content:", error);
                    toast.error("Failed to load Master File.");
                } finally {
                    setIsLoading(false);
                }
            } else if (activeChar.tier === 'SUPPORTING') {
                // Combine snippets
                const snippetText = activeChar.snippets?.map(s => s.text).join('\n\n---\n\n') || "No snippets available.";
                setContent(snippetText);
            }
        };

        fetchContent();
    }, [activeChar, accessToken]);

    // AUTO-SAVE (Debounced in Editor, but here we handle the actual save call if needed or rely on Editor's prop)
    const handleContentChange = async (newContent: string) => {
        setContent(newContent);
        // Note: Real-time saving to Drive should ideally be debounced.
        // For this implementation, we assume the user might want a manual save or the Editor handles it via a prop.
        // But since the `Editor` component usually has an `onSave` or debounced `onChange`, we'll leverage that.
        // For now, we'll keep it simple: We just update local state.

        // TODO: Implement `saveDriveFile` call if Editor doesn't handle it internally with the fileId.
    };

    const handlePromote = () => {
        toast.info("Promotion logic would go here (Create File -> Update Firestore -> Refresh).");
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-titanium-950 text-titanium-500">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-titanium-950 relative">
            {/* TIER 3 OVERLAY / HEADER */}
            {activeChar.tier === 'SUPPORTING' && (
                <div className="bg-titanium-900 border-b border-titanium-800 p-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-titanium-400">
                        <FileText size={16} />
                        <span className="text-xs uppercase font-bold tracking-wider">Local Snippet (Read Only)</span>
                    </div>
                    <button
                        onClick={handlePromote}
                        className="flex items-center gap-2 px-3 py-1.5 bg-accent-DEFAULT/10 hover:bg-accent-DEFAULT/20 text-accent-DEFAULT text-xs font-bold rounded-lg border border-accent-DEFAULT/30 transition-all"
                    >
                        <ArrowUpCircle size={14} />
                        <span>Promote to Master</span>
                    </button>
                </div>
            )}

            {/* EDITOR AREA */}
            <div className="flex-1 overflow-hidden relative">
                {activeChar.tier === 'MAIN' ? (
                    <Editor
                        content={content}
                        fileId={activeChar.masterFileId || ''}
                        onChange={handleContentChange}
                        readOnly={false}
                    />
                ) : (
                    <div className="h-full w-full p-8 overflow-y-auto text-titanium-300 font-serif leading-relaxed whitespace-pre-wrap">
                        {content}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ForgeSoul;
