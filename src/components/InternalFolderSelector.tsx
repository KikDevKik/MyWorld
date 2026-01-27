import React, { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { ChevronRight, ChevronDown, Folder, Check, X, AlertTriangle, Inbox } from 'lucide-react';
import { DriveFile } from '../types';

interface InternalFolderSelectorProps {
    onFolderSelected: (folder: { id: string; name: string; path?: string }) => void;
    onCancel: () => void;
    currentFolderId?: string | null;
}

// 🟢 HELPER: Filter Tree (Folders Only)
const filterTree = (nodes: DriveFile[]): DriveFile[] => {
    return nodes
        .map(node => {
            if (node.mimeType === 'application/vnd.google-apps.folder') {
                const filteredChildren = node.children ? filterTree(node.children) : [];
                // Return folder regardless of children content, as we want to select empty folders too
                return { ...node, children: filteredChildren };
            }
            return null;
        })
        .filter(Boolean) as DriveFile[];
};

// 🟢 COMPONENT: Tree Node
const SelectorNode: React.FC<{
    node: DriveFile;
    depth: number;
    onSelect: (node: DriveFile) => void;
    currentId?: string | null;
}> = ({ node, depth, onSelect, currentId }) => {
    const [isOpen, setIsOpen] = useState(false);
    const isSelected = currentId === node.id;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSelect(node);
        // Auto-expand on selection if closed? Optional.
    };

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen(!isOpen);
    };

    return (
        <div className="select-none">
            <div
                className={`
                    flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all
                    ${isSelected
                        ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-500/30'
                        : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
                    }
                `}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
                onClick={handleClick}
            >
                <div
                    className="shrink-0 p-1 hover:bg-white/10 rounded cursor-pointer"
                    onClick={handleToggle}
                >
                    {node.children && node.children.length > 0 ? (
                        isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                    ) : (
                        <div className="w-[14px]" />
                    )}
                </div>

                <div className={`shrink-0 ${isSelected ? 'text-cyan-400' : 'text-zinc-500'}`}>
                    <Folder size={16} fill={isSelected ? "currentColor" : "none"} />
                </div>

                <span className="text-sm truncate font-medium flex-1">{node.name}</span>

                {isSelected && <Check size={14} className="text-cyan-400" />}
            </div>

            {isOpen && node.children && (
                <div className="animate-fade-in border-l border-zinc-800 ml-[19px]">
                    {node.children.map(child => (
                        <SelectorNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            currentId={currentId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// 🟢 MAIN COMPONENT
const InternalFolderSelector: React.FC<InternalFolderSelectorProps> = ({ onFolderSelected, onCancel, currentFolderId }) => {
    const [tree, setTree] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmpty, setIsEmpty] = useState(false);

    // Subscribe to TDB_Index
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const db = getFirestore();
        const docRef = doc(db, "TDB_Index", user.uid, "structure", "tree");

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data.tree && Array.isArray(data.tree)) {
                    const filtered = filterTree(data.tree);
                    setTree(filtered);
                    setIsEmpty(filtered.length === 0);
                } else {
                    setTree([]);
                    setIsEmpty(true);
                }
            } else {
                setTree([]);
                setIsEmpty(true);
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleNodeSelect = (node: DriveFile) => {
        onFolderSelected({ id: node.id, name: node.name, path: (node as any).path });
    };

    const handleDefaultInbox = () => {
        // Return a special ID or just let parent handle it.
        // Parent will interpret this as "Use Default"
        onFolderSelected({ id: 'DEFAULT_INBOX', name: 'Inbox (Auto)' });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden relative">

                {/* HEADER */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-white/10 bg-black/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-cyan-950/30 rounded-lg border border-cyan-900/50 text-cyan-400">
                            <Folder size={18} />
                        </div>
                        <div>
                            <h2 className="font-bold text-base text-zinc-100">Select Destination</h2>
                            <p className="text-[10px] text-zinc-500 font-mono tracking-wider">PROJECT STRUCTURE</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-white/10 rounded-lg text-zinc-500 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-3">
                            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-xs font-mono">SCANNING DRIVE...</p>
                        </div>
                    ) : isEmpty ? (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-4 p-8 text-center">
                            <div className="p-4 bg-zinc-900 rounded-full text-yellow-600/50">
                                <AlertTriangle size={24} />
                            </div>
                            <div>
                                <h3 className="text-zinc-300 font-bold mb-1 text-sm">No Folders Found</h3>
                                <p className="text-xs max-w-[200px] mx-auto text-zinc-600">
                                    Your project index seems empty. Please run a scan first.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {/* Manual Inbox Option at Top */}
                            <div
                                onClick={handleDefaultInbox}
                                className="flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer hover:bg-zinc-800 text-zinc-400 hover:text-white border border-transparent hover:border-white/5 mb-2 group"
                            >
                                <div className="shrink-0 text-emerald-500 group-hover:text-emerald-400">
                                    <Inbox size={16} />
                                </div>
                                <span className="text-sm truncate font-medium flex-1">Use Default / Create "Inbox"</span>
                            </div>

                            <div className="h-px bg-white/5 my-2" />

                            {tree.map(node => (
                                <SelectorNode
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    onSelect={handleNodeSelect}
                                    currentId={currentFolderId}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-3 bg-black/80 border-t border-white/10 flex justify-end text-xs text-zinc-500">
                    <span className="font-mono opacity-50">FOLDER_MODE</span>
                </div>
            </div>
        </div>
    );
};

export default InternalFolderSelector;
