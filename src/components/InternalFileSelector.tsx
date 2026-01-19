import React, { useState, useEffect } from 'react';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { ChevronRight, ChevronDown, FileText, Folder, Check, X, File, AlertTriangle, ListChecks } from 'lucide-react';
import { DriveFile } from '../types';

interface InternalFileSelectorProps {
    onFileSelected: (files: { id: string; name: string; path?: string } | { id: string; name: string; path?: string }[]) => void;
    onCancel: () => void;
    currentFileId?: string | null;
    multiSelect?: boolean; // 👈 New Prop
}

// 🟢 HELPER: Filter Tree
const filterTree = (nodes: DriveFile[]): DriveFile[] => {
    return nodes
        .map(node => {
            // If folder, recurse
            if (node.mimeType === 'application/vnd.google-apps.folder') {
                const filteredChildren = node.children ? filterTree(node.children) : [];
                // Return folder if it has children (after filter) or if we want to show empty folders?
                // Let's show folders so user can navigate, even if empty of valid files?
                // Better: Only show folders that *contain* valid files or other folders with valid files.
                // For now, simple recursion:
                if (filteredChildren.length > 0) {
                    return { ...node, children: filteredChildren };
                }
                // If folder is empty after filter, prune it?
                // Let's keep it simple first: return folder if it has children.
                return filteredChildren.length > 0 ? { ...node, children: filteredChildren } : null;
            }

            // If file, check extension
            const validExtensions = ['.md', '.doc', '.docx', '.txt'];
            const lowerName = node.name.toLowerCase();
            const isValid = validExtensions.some(ext => lowerName.endsWith(ext));

            return isValid ? node : null;
        })
        .filter(Boolean) as DriveFile[];
};

// 🟢 COMPONENT: Tree Node
const SelectorNode: React.FC<{
    node: DriveFile;
    depth: number;
    onSelect: (node: DriveFile) => void;
    currentId?: string | null;
    multiSelect?: boolean;
    selectedIds?: Set<string>;
}> = ({ node, depth, onSelect, currentId, multiSelect, selectedIds }) => {
    const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
    const [isOpen, setIsOpen] = useState(false);

    // Determine selection state
    const isSelected = multiSelect
        ? selectedIds?.has(node.id)
        : currentId === node.id;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            onSelect(node);
        }
    };

    return (
        <div className="select-none">
            <div
                onClick={handleClick}
                className={`
                    flex items-center gap-2 py-2 px-3 rounded-lg cursor-pointer transition-all
                    ${isSelected
                        ? 'bg-accent-DEFAULT/20 text-accent-DEFAULT border border-accent-DEFAULT/30'
                        : 'hover:bg-titanium-800 text-titanium-300 hover:text-white'
                    }
                `}
                style={{ paddingLeft: `${depth * 16 + 12}px` }}
            >
                {/* Checkbox for MultiSelect */}
                {multiSelect && !isFolder && (
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-accent-DEFAULT border-accent-DEFAULT' : 'border-titanium-600'}`}>
                        {isSelected && <Check size={12} className="text-titanium-950" strokeWidth={3} />}
                    </div>
                )}

                <div className={`shrink-0 ${isSelected ? 'text-accent-DEFAULT' : 'text-titanium-500'}`}>
                    {isFolder ? (
                        isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                    ) : (
                        !multiSelect && <FileText size={16} />
                    )}
                </div>

                <span className="text-sm truncate font-medium flex-1">{node.name}</span>

                {!multiSelect && isSelected && <Check size={14} className="text-accent-DEFAULT" />}
            </div>

            {isOpen && isFolder && node.children && (
                <div className="animate-fade-in border-l border-titanium-800 ml-[19px]">
                    {node.children.map(child => (
                        <SelectorNode
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            currentId={currentId}
                            multiSelect={multiSelect}
                            selectedIds={selectedIds}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// 🟢 MAIN COMPONENT
const InternalFileSelector: React.FC<InternalFileSelectorProps> = ({ onFileSelected, onCancel, currentFileId, multiSelect = false }) => {
    const [tree, setTree] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isEmpty, setIsEmpty] = useState(false);

    // Multi-Select State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [selectedFiles, setSelectedFiles] = useState<DriveFile[]>([]);

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
                    // Filter tree immediately
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

    // Handle Node Selection
    const handleNodeSelect = (node: DriveFile) => {
        if (multiSelect) {
            const newSet = new Set(selectedIds);
            const newFiles = [...selectedFiles];

            if (newSet.has(node.id)) {
                newSet.delete(node.id);
                const idx = newFiles.findIndex(f => f.id === node.id);
                if (idx > -1) newFiles.splice(idx, 1);
            } else {
                newSet.add(node.id);
                newFiles.push(node);
            }

            setSelectedIds(newSet);
            setSelectedFiles(newFiles);
        } else {
            // Single Mode: Immediate Return
            onFileSelected({ id: node.id, name: node.name, path: (node as any).path });
        }
    };

    // Handle Confirm (Multi Only)
    const handleConfirm = () => {
        const result = selectedFiles.map(f => ({ id: f.id, name: f.name, path: (f as any).path }));
        onFileSelected(result);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-2xl bg-titanium-900 border border-titanium-700 rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">

                {/* HEADER */}
                <div className="h-16 flex items-center justify-between px-6 border-b border-titanium-800 bg-titanium-950 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-titanium-900 rounded-lg border border-titanium-800 text-accent-DEFAULT">
                            <Folder size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg text-titanium-100">
                                {multiSelect ? 'Selección Múltiple' : 'Seleccionar Fuente de Verdad'}
                            </h2>
                            <p className="text-[10px] text-titanium-500 font-mono">TDB_INDEX :: READY</p>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-titanium-800 rounded-full text-titanium-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-titanium-700">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-titanium-500 gap-3">
                            <div className="w-8 h-8 border-2 border-accent-DEFAULT border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm">Accediendo a la Memoria...</p>
                        </div>
                    ) : isEmpty ? (
                        <div className="flex flex-col items-center justify-center h-full text-titanium-500 gap-4 p-8 text-center">
                            <div className="p-4 bg-titanium-800 rounded-full text-yellow-500">
                                <AlertTriangle size={32} />
                            </div>
                            <div>
                                <h3 className="text-titanium-200 font-bold mb-1">Sin Archivos Compatibles</h3>
                                <p className="text-xs max-w-xs mx-auto">
                                    No se encontraron archivos .md, .doc o .docx en el índice.
                                    Asegúrate de haber ejecutado una indexación reciente.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {tree.map(node => (
                                <SelectorNode
                                    key={node.id}
                                    node={node}
                                    depth={0}
                                    onSelect={handleNodeSelect}
                                    currentId={currentFileId}
                                    multiSelect={multiSelect}
                                    selectedIds={selectedIds}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* FOOTER */}
                <div className="p-4 bg-titanium-950 border-t border-titanium-800 flex justify-between items-center text-xs text-titanium-500">
                    {multiSelect ? (
                        <div className="flex items-center justify-between w-full">
                            <span className="text-titanium-400">
                                {selectedIds.size} archivo(s) seleccionado(s)
                            </span>
                            <button
                                onClick={handleConfirm}
                                disabled={selectedIds.size === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-accent-DEFAULT hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-titanium-950 font-bold rounded-lg transition-colors"
                            >
                                <ListChecks size={16} />
                                Confirmar Selección
                            </button>
                        </div>
                    ) : (
                        <>
                            <span>Formatos: .md, .doc, .docx, .txt</span>
                            <span className="font-mono text-accent-DEFAULT">V2.INTERNAL_SELECTOR</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InternalFileSelector;
