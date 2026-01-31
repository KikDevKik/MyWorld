import React, { useState, useEffect, useMemo } from 'react';
import { X, FlaskConical, Search, FileText, Image as ImageIcon, Music, Book, MoreHorizontal, Tag, Filter, Loader2, Sparkles } from 'lucide-react';
import { DriveFile, Gem } from '../types';
import { toast } from 'sonner';
import ChatPanel from './ChatPanel';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { getFirestore, collection, onSnapshot, query, where } from 'firebase/firestore';
import { callFunction } from '../services/api';

interface LaboratoryPanelProps {
    onClose: () => void;
    folderId: string;
    accessToken: string | null;
}

const SMART_TAGS = ['LORE', 'CIENCIA', 'INSPIRACIÓN', 'VISUAL', 'AUDIO', 'OTROS'];

const LaboratoryPanel: React.FC<LaboratoryPanelProps> = ({ onClose, folderId, accessToken }) => {
    const { fileTree, isFileTreeLoading, user } = useProjectConfig();
    const [fileTags, setFileTags] = useState<Record<string, string[]>>({});
    const [activeTag, setActiveTag] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isClassifying, setIsClassifying] = useState(false);

    // 🟢 1. FETCH TAGS (Realtime)
    useEffect(() => {
        if (!user) return;
        const db = getFirestore();
        // Listen to all files that have smartTags
        const q = query(collection(db, "TDB_Index", user.uid, "files"), where("smartTags", "!=", null));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const tagsMap: Record<string, string[]> = {};
            snapshot.docs.forEach(doc => {
                tagsMap[doc.id] = doc.data().smartTags || [];
            });
            setFileTags(tagsMap);
        });

        return () => unsubscribe();
    }, [user]);

    // 🟢 2. FLATTEN & FILTER RESOURCES
    const resourceFiles = useMemo(() => {
        if (!fileTree) return [];

        const flatten = (nodes: any[]): DriveFile[] => {
            let result: DriveFile[] = [];
            for (const node of nodes) {
                if (node.type === 'file') {
                    result.push(node as DriveFile);
                }
                if (node.children) {
                    result.push(...flatten(node.children));
                }
            }
            return result;
        };

        const allFiles = flatten(fileTree as any[]);

        // Filter strictly for Resources (Category 'reference' or path check)
        return allFiles.filter(f => {
            const isResource = f.category === 'reference' || (f.path && f.path.includes('_RESOURCES')) || (f.path && f.path.includes('_RECURSOS'));
            return isResource;
        });
    }, [fileTree]);

    // 🟢 3. MERGE & FILTER VIEW
    const visibleFiles = useMemo(() => {
        let filtered = resourceFiles;

        // Search Filter
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            filtered = filtered.filter(f => f.name.toLowerCase().includes(lower));
        }

        // Tag Filter
        if (activeTag) {
            filtered = filtered.filter(f => {
                const tags = fileTags[f.id] || [];
                return tags.includes(activeTag);
            });
        }

        return filtered;
    }, [resourceFiles, fileTags, activeTag, searchQuery]);

    // 🟢 4. AUTO-CLASSIFY TRIGGER (Lazy)
    useEffect(() => {
        const classifyUntagged = async () => {
            if (!user || isClassifying || resourceFiles.length === 0) return;

            // Find first 3 untagged files to process (Batching to be nice to quotas)
            const untagged = resourceFiles.filter(f => !fileTags[f.id]).slice(0, 3);

            if (untagged.length > 0) {
                setIsClassifying(true);

                // Process sequentially
                for (const file of untagged) {
                    try {
                        console.log(`🏷️ Auto-Classifying: ${file.name}`);
                        await callFunction('classifyResource', {
                            fileId: file.id,
                            fileName: file.name,
                            mimeType: file.mimeType
                        });
                        // Wait a bit between calls
                        await new Promise(r => setTimeout(r, 500));
                    } catch (e) {
                        console.error(`Failed to classify ${file.name}`, e);
                    }
                }
                setIsClassifying(false);
            }
        };

        const timer = setTimeout(classifyUntagged, 2000); // 2s Debounce after load
        return () => clearTimeout(timer);
    }, [resourceFiles, fileTags, user, isClassifying]);


    // 🟢 DRAG HANDLER
    const handleDragStart = (e: React.DragEvent, file: DriveFile) => {
        e.dataTransfer.setData("application/json", JSON.stringify(file));
        e.dataTransfer.effectAllowed = "copy";
    };

    const getIcon = (mime: string) => {
        if (mime.includes('image')) return <ImageIcon size={16} className="text-purple-400" />;
        if (mime.includes('audio')) return <Music size={16} className="text-pink-400" />;
        if (mime.includes('pdf')) return <Book size={16} className="text-red-400" />;
        return <FileText size={16} className="text-blue-400" />;
    };

    // 🟢 VIRTUAL GEM: THE LIBRARIAN
    const librarianGem: Gem = {
        id: 'laboratorio',
        name: 'El Bibliotecario',
        model: 'gemini-2.5-flash',
        color: 'emerald',
        backgroundImage: '',
        systemInstruction: `Eres el Bibliotecario. Tu misión es analizar referencias y conectar puntos.`
    };

    return (
        <div className="w-full h-full flex bg-titanium-950 animate-fade-in overflow-hidden">

            {/* 🔴 LEFT SHELF (SIDEBAR) */}
            <div className="w-80 flex-shrink-0 border-r border-titanium-800 bg-titanium-950 flex flex-col">

                {/* HEADER */}
                <div className="p-4 border-b border-titanium-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-emerald-500">
                            <FlaskConical size={20} />
                            <h2 className="font-bold tracking-wider text-sm">RECURSOS</h2>
                        </div>
                        <div className="flex gap-1">
                             <button onClick={onClose} aria-label="Cerrar Laboratorio" className="p-1 hover:bg-titanium-800 rounded text-titanium-400 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* SEARCH */}
                    <div className="relative mb-4">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-titanium-500" />
                        <input
                            type="text"
                            placeholder="Filtrar..."
                            aria-label="Filtrar recursos"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-titanium-900 border border-titanium-800 rounded-lg py-2 pl-9 pr-3 text-xs text-titanium-200 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>

                    {/* TAGS (CHIPS) */}
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            onClick={() => setActiveTag(null)}
                            aria-pressed={!activeTag}
                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${!activeTag ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-titanium-900 border-titanium-800 text-titanium-500 hover:text-titanium-300'}`}
                        >
                            TODO
                        </button>
                        {SMART_TAGS.map(tag => (
                            <button
                                key={tag}
                                onClick={() => setActiveTag(tag === activeTag ? null : tag)}
                                aria-pressed={activeTag === tag}
                                className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${activeTag === tag ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-titanium-900 border-titanium-800 text-titanium-500 hover:text-titanium-300'}`}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                {/* FILE LIST */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-titanium-800">
                    {isFileTreeLoading ? (
                        <div className="flex items-center justify-center h-20 text-titanium-500">
                            <Loader2 size={20} className="animate-spin" />
                        </div>
                    ) : visibleFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-titanium-600 text-center px-4">
                            <Filter size={24} className="mb-2 opacity-50" />
                            <p className="text-xs">No se encontraron recursos.</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {visibleFiles.map(file => {
                                const tags = fileTags[file.id] || [];
                                return (
                                    <div
                                        key={file.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, file)}
                                        className="group flex items-center gap-3 p-2 rounded-lg hover:bg-titanium-900 cursor-grab active:cursor-grabbing border border-transparent hover:border-titanium-800 transition-all"
                                    >
                                        <div className="w-8 h-8 rounded bg-titanium-950 flex items-center justify-center border border-titanium-800 group-hover:border-emerald-500/30 transition-colors">
                                            {getIcon(file.mimeType)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-medium text-titanium-300 truncate group-hover:text-emerald-400 transition-colors">
                                                    {file.name}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 mt-1">
                                                {tags.length > 0 ? tags.map(t => (
                                                    <span key={t} className="text-[9px] px-1 rounded bg-titanium-800 text-titanium-500">{t}</span>
                                                )) : (
                                                    <span className="text-[9px] text-titanium-700 flex items-center gap-1">
                                                        {isClassifying ? <Loader2 size={8} className="animate-spin" /> : <Sparkles size={8} />}
                                                        Analizando...
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="opacity-0 group-hover:opacity-100 text-titanium-600">
                                            <MoreHorizontal size={14} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* STATUS BAR */}
                <div className="h-8 border-t border-titanium-800 bg-titanium-950 flex items-center justify-between px-3 text-[10px] text-titanium-500">
                    <span>{visibleFiles.length} Archivos</span>
                    {isClassifying && <span className="flex items-center gap-1 text-emerald-500"><Loader2 size={10} className="animate-spin"/> Etiquetando...</span>}
                </div>
            </div>

            {/* 🔴 RIGHT MAIN (CHAT) */}
            <div className="flex-1 h-full relative">
                <ChatPanel
                    isOpen={true}
                    onClose={() => {}}
                    activeGemId={null}
                    customGem={librarianGem}
                    isFullWidth={true}
                    categoryFilter="reference"
                    folderId={folderId}
                    accessToken={accessToken}
                />
            </div>
        </div>
    );
};

export default LaboratoryPanel;
