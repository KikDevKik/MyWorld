import React, { useState, useEffect, useRef } from 'react';
import { getFirestore, doc, onSnapshot } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { ChevronDown, Folder, Globe, FolderOpen, Check, Loader2 } from 'lucide-react';
import { DriveFile } from '../types';

interface ScopeTreeSelectorProps {
    onScopeSelected: (scope: { id: string | null; name: string; recursiveIds: string[]; path?: string }) => void;
    activeScopeId: string | null;
}

// 🟢 HELPER: Recursive ID Collector
export const getRecursiveFolderIds = (tree: DriveFile[], targetId: string): string[] => {
    const ids: string[] = [targetId];

    const findNode = (nodes: DriveFile[]): DriveFile | null => {
        for (const node of nodes) {
            if (node.id === targetId) return node;
            if (node.children) {
                const found = findNode(node.children);
                if (found) return found;
            }
        }
        return null;
    };

    const targetNode = findNode(tree);
    if (!targetNode) return ids;

    const collect = (node: DriveFile) => {
        if (node.children) {
            for (const child of node.children) {
                if (child.type === 'folder') {
                    ids.push(child.id);
                    collect(child);
                }
            }
        }
    };
    collect(targetNode);
    return ids;
};

// 🟢 HELPER: Find Path (Optional Optimization)
export const getFolderPath = (tree: DriveFile[], targetId: string): string | undefined => {
    // DFS to find path
    // Assuming 'path' property exists on DriveFile based on ingestion logic,
    // but types.ts definition might not have it explicitly yet?
    // The backend DriveFile has it. The frontend type might need update if we rely on it.
    // For now, let's assume the tree data from Firestore HAS it (it's a raw dump).

    const findNodePath = (nodes: DriveFile[]): string | undefined => {
        for (const node of nodes) {
            if (node.id === targetId) return (node as any).path;
            if (node.children) {
                const found = findNodePath(node.children);
                if (found) return found;
            }
        }
        return undefined;
    };
    return findNodePath(tree);
};


const ScopeTreeSelector: React.FC<ScopeTreeSelectorProps> = ({ onScopeSelected, activeScopeId }) => {
    const [tree, setTree] = useState<DriveFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 🟢 SUBSCRIBE TO INDEX
    useEffect(() => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) return;

        const db = getFirestore();
        const docRef = doc(db, "TDB_Index", user.uid, "structure", "tree");

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data.tree) {
                    setTree(data.tree);
                }
            }
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, []);

    // 🟢 CLICK OUTSIDE
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 🟢 SELECTION HANDLER
    const handleSelect = (node: DriveFile | null) => {
        if (!node) {
            // Global
            onScopeSelected({
                id: null,
                name: "Global (Todo el Proyecto)",
                recursiveIds: []
            });
        } else {
            const ids = getRecursiveFolderIds(tree, node.id);
            const path = (node as any).path; // Backend logic provides this
            onScopeSelected({
                id: node.id,
                name: node.name,
                recursiveIds: ids,
                path: path
            });
        }
        setIsOpen(false);
    };

    // 🟢 FLATTEN FOR DROPDOWN (ONLY FOLDERS)
    const renderOptions = (nodes: DriveFile[], depth = 0) => {
        return nodes
            .filter(n => n.type === 'folder')
            .map(node => (
                <React.Fragment key={node.id}>
                    <button
                        onClick={() => handleSelect(node)}
                        className={`w-full text-left px-4 py-2 hover:bg-titanium-800 flex items-center gap-2 transition-colors ${
                            activeScopeId === node.id ? 'text-accent-DEFAULT bg-titanium-800/50' : 'text-titanium-300'
                        }`}
                        style={{ paddingLeft: `${depth * 12 + 16}px` }}
                    >
                        {activeScopeId === node.id ? <FolderOpen size={16} /> : <Folder size={16} />}
                        <span className="truncate">{node.name}</span>
                        {activeScopeId === node.id && <Check size={14} className="ml-auto" />}
                    </button>
                    {node.children && renderOptions(node.children, depth + 1)}
                </React.Fragment>
            ));
    };

    const activeName = activeScopeId
        ? getRecursiveFolderIds(tree, activeScopeId)[0] === activeScopeId // Dummy check, actually finding name is harder without map
            ? (function findName(nodes: DriveFile[]): string {
                for(const n of nodes) {
                    if(n.id === activeScopeId) return n.name;
                    if(n.children) {
                        const found = findName(n.children);
                        if(found) return found;
                    }
                }
                return "Carpeta Desconocida";
              })(tree)
            : "Seleccionando..."
        : "Global (Todo el Proyecto)";

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                disabled={isLoading}
                className="flex items-center gap-2 bg-titanium-950 border border-titanium-700 hover:border-accent-DEFAULT rounded-lg px-3 py-1.5 transition-all text-sm min-w-[200px] justify-between group"
            >
                <div className="flex items-center gap-2 truncate text-titanium-200 group-hover:text-white">
                    {activeScopeId ? <Folder size={16} className="text-accent-DEFAULT" /> : <Globe size={16} className="text-cyan-500" />}
                    <span className="truncate max-w-[150px]">{activeName}</span>
                </div>
                {isLoading ? (
                    <Loader2 size={14} className="animate-spin text-titanium-500" />
                ) : (
                    <ChevronDown size={14} className={`text-titanium-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-[300px] max-h-[400px] overflow-y-auto bg-titanium-900 border border-titanium-700 rounded-xl shadow-2xl z-50 animate-fade-in-down scrollbar-thin scrollbar-thumb-titanium-700">
                    <div className="p-2 sticky top-0 bg-titanium-900 border-b border-titanium-800 z-10">
                        <span className="text-[10px] uppercase font-bold text-titanium-500 px-2">Seleccionar Alcance (Scope)</span>
                    </div>

                    <button
                        onClick={() => handleSelect(null)}
                        className={`w-full text-left px-4 py-3 hover:bg-titanium-800 flex items-center gap-2 transition-colors border-b border-titanium-800 ${
                            !activeScopeId ? 'text-cyan-400 bg-cyan-900/10' : 'text-titanium-100'
                        }`}
                    >
                        <Globe size={18} />
                        <span className="font-bold">Global (Todo el Proyecto)</span>
                        {!activeScopeId && <Check size={14} className="ml-auto" />}
                    </button>

                    <div className="py-1">
                        {tree.length === 0 ? (
                            <div className="p-4 text-center text-xs text-titanium-500">
                                No se encontró estructura de carpetas.<br/>Ejecuta "Indexar" en la barra lateral.
                            </div>
                        ) : (
                            renderOptions(tree)
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ScopeTreeSelector;
