import React, { useEffect, useState } from 'react';
import { FileText, ArrowUpCircle, Loader2, PawPrint, Flower, Zap } from 'lucide-react';
import { toast } from 'sonner';
import Editor from '../editor/Editor';
import { callFunction } from '../../services/api';
import { Character, EntityCategory } from '../../types';

interface ForgeSoulProps {
    activeChar: Character;
    accessToken: string | null;
}

const ForgeSoul: React.FC<ForgeSoulProps> = ({ activeChar, accessToken }) => {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // FETCH CONTENT
    useEffect(() => {
        const fetchContent = async () => {
            if (activeChar.tier === 'MAIN' && activeChar.masterFileId) {
                setIsLoading(true);

                try {
                    const result = await callFunction<{ content: string }>('getDriveFileContent', {
                        fileId: activeChar.masterFileId,
                        accessToken
                    });
                    setContent(result.content || '');
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

    // AUTO-SAVE
    const handleContentChange = async (newContent: string) => {
        setContent(newContent);
    };

    const handlePromote = () => {
        toast.info("Promotion logic would go here (Create File -> Update Firestore -> Refresh).");
    };

    const handleInjectTemplate = () => {
        const template = `## ${activeChar.name}

**Tipo:** ${activeChar.category === 'FLORA' ? 'Flora' : 'Fauna'}
**Tamaño:**
**Apariencia:**
**Dieta:**
**Habilidad Clave:**
**Comportamiento:**
`;
        setContent(template);
        // Trigger save if needed, but Editor handles it on change usually.
        // We manually trigger the change handler to sync up.
        handleContentChange(template);
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-titanium-950 text-titanium-500">
                <Loader2 className="animate-spin" size={32} />
            </div>
        );
    }

    const isBestiary = activeChar.category === 'CREATURE' || activeChar.category === 'FLORA';
    const headerColor = activeChar.category === 'FLORA' ? 'text-pink-400' : (activeChar.category === 'CREATURE' ? 'text-purple-400' : 'text-cyan-400');

    return (
        <div className="h-full flex flex-col bg-titanium-950 relative">

            {/* HEADER / BESTIARY INDICATOR */}
            <div className={`bg-titanium-900 border-b border-titanium-800 p-4 flex items-center justify-between shrink-0`}>
                <div className={`flex items-center gap-2 ${headerColor} font-bold tracking-wider text-xs uppercase`}>
                    {activeChar.category === 'CREATURE' && <PawPrint size={16} />}
                    {activeChar.category === 'FLORA' && <Flower size={16} />}
                    {!isBestiary && <FileText size={16} />}

                    <span>
                        {activeChar.tier === 'SUPPORTING' ? "FRAGMENTO LOCAL (Read Only)" :
                         (isBestiary ? "REGISTRO DE BESTIARIO" : "ARCHIVO MAESTRO")}
                    </span>
                </div>

                {activeChar.tier === 'SUPPORTING' ? (
                    <button
                        onClick={handlePromote}
                        className="flex items-center gap-2 px-3 py-1.5 bg-accent-DEFAULT/10 hover:bg-accent-DEFAULT/20 text-accent-DEFAULT text-xs font-bold rounded-lg border border-accent-DEFAULT/30 transition-all"
                    >
                        <ArrowUpCircle size={14} />
                        <span>Promote to Master</span>
                    </button>
                ) : (
                    // Template Injector for Empty Files
                    (content.trim().length === 0 && isBestiary) && (
                        <button
                            onClick={handleInjectTemplate}
                            className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold rounded-lg border border-purple-500/30 transition-all"
                        >
                            <Zap size={14} />
                            <span>Usar Plantilla Bestiario</span>
                        </button>
                    )
                )}
            </div>

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
