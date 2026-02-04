import React, { useState, useMemo } from 'react';
import { X, Folder, FileText, Check, ChevronRight, ChevronDown, Search, Loader2 } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { useLanguageStore } from '../stores/useLanguageStore';
import { TRANSLATIONS } from '../i18n/translations';
import { DriveFile } from '../types';

interface ContextSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (files: DriveFile[]) => void;
    initialSelection?: string[]; // IDs
}

interface FileNode {
    id: string;
    name: string;
    mimeType: string;
    children?: FileNode[];
}

const ContextSelectorModal: React.FC<ContextSelectorModalProps> = ({ isOpen, onClose, onConfirm, initialSelection = [] }) => {
    const { fileTree, isFileTreeLoading } = useProjectConfig();
    const { currentLanguage } = useLanguageStore();
    const t = TRANSLATIONS[currentLanguage];
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialSelection));
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');

    // Toggle Selection
    const toggleSelection = (node: FileNode) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(node.id)) {
            newSet.delete(node.id);
        } else {
            newSet.add(node.id);
        }
        setSelectedIds(newSet);
    };

    // Toggle Folder Expansion
    const toggleFolder = (nodeId: string) => {
        const newSet = new Set(expandedFolders);
        if (newSet.has(nodeId)) {
            newSet.delete(nodeId);
        } else {
            newSet.add(nodeId);
        }
        setExpandedFolders(newSet);
    };

    // Flatten for Search
    const flattenedFiles = useMemo(() => {
        if (!fileTree) return [];
        const result: FileNode[] = [];
        const stack = [...fileTree];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node) continue;
            if (node.mimeType === 'application/vnd.google-apps.folder') {
                if (node.children) stack.push(...node.children);
            } else {
                result.push(node);
            }
        }
        return result;
    }, [fileTree]);

    // Recursive Tree Renderer
    const renderTree = (nodes: FileNode[], depth = 0) => {
        return nodes.map(node => {
            const isFolder = node.mimeType === 'application/vnd.google-apps.folder';
            const isExpanded = expandedFolders.has(node.id);
            const isSelected = selectedIds.has(node.id);
            const isMatch = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());

            // If searching, only show matching files (hide folders unless they match? No, flatten view usually better for search)
            if (searchQuery && !isMatch && !isFolder) return null;
            // If searching and folder, hide unless children match? (Complex).
            // Better: If search is active, switch to "List View".

            return (
                <div key={node.id}>
                    <div
                        className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-titanium-800 transition-colors ${isSelected ? 'bg-emerald-900/20' : ''}`}
                        style={{ paddingLeft: `${depth * 12 + 8}px` }}
                        onClick={() => isFolder ? toggleFolder(node.id) : toggleSelection(node)}
                    >
                        {/* Folder Arrow */}
                        {isFolder && (
                            <div className="text-titanium-500 hover:text-white">
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </div>
                        )}
                        {!isFolder && <div className="w-[14px]" />} {/* Spacer */}

                        {/* Checkbox (Files only) */}
                        {!isFolder && (
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-titanium-600 hover:border-titanium-400'}`}>
                                {isSelected && <Check size={10} className="text-black font-bold" />}
                            </div>
                        )}

                        {/* Icon */}
                        {isFolder ? <Folder size={14} className="text-titanium-400" /> : <FileText size={14} className="text-blue-400" />}

                        {/* Name */}
                        <span className={`text-xs truncate ${isSelected ? 'text-emerald-300' : 'text-titanium-300'}`}>
                            {node.name}
                        </span>
                    </div>

                    {/* Children */}
                    {isFolder && isExpanded && node.children && (
                        <div>
                            {renderTree(node.children, depth + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    // Render Flattened Search Results
    const renderSearchResults = () => {
        const matches = flattenedFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (matches.length === 0) return <div className="p-4 text-center text-xs text-titanium-500">No se encontraron archivos.</div>;

        return matches.map(node => (
            <div
                key={node.id}
                className={`flex items-center gap-2 py-2 px-3 rounded cursor-pointer hover:bg-titanium-800 transition-colors ${selectedIds.has(node.id) ? 'bg-emerald-900/20' : ''}`}
                onClick={() => toggleSelection(node)}
            >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedIds.has(node.id) ? 'bg-emerald-500 border-emerald-500' : 'border-titanium-600 hover:border-titanium-400'}`}>
                    {selectedIds.has(node.id) && <Check size={10} className="text-black font-bold" />}
                </div>
                <FileText size={14} className="text-blue-400" />
                <div className="flex flex-col min-w-0">
                     <span className={`text-xs truncate ${selectedIds.has(node.id) ? 'text-emerald-300' : 'text-titanium-300'}`}>
                        {node.name}
                    </span>
                    <span className="text-[10px] text-titanium-600 truncate">
                        ID: {node.id.slice(0,8)}...
                    </span>
                </div>
            </div>
        ));
    };

    const handleConfirm = () => {
        // Map IDs back to DriveFile objects (search in flattened)
        const selectedNodes = flattenedFiles.filter(n => selectedIds.has(n.id));
        // Convert FileNode to DriveFile (approximate, missing some fields but ID/Name/Mime are key)
        const driveFiles: DriveFile[] = selectedNodes.map(n => ({
            id: n.id,
            name: n.name,
            mimeType: n.mimeType,
            type: n.mimeType === 'application/vnd.google-apps.folder' ? 'folder' : 'file',
            // Defaults
            parents: [],
            createdTime: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
            kind: 'drive#file',
            starred: false,
            trashed: false
        }));
        onConfirm(driveFiles);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-[500px] h-[600px] bg-titanium-950 border border-titanium-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-titanium-800 flex items-center justify-between bg-titanium-900/50">
                    <div>
                        <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                            <Folder size={16} className="text-emerald-500" />
                            PORTAL DE CONTEXTO
                        </h3>
                        <p className="text-[10px] text-titanium-500 mt-0.5">Selecciona archivos del Canon para inyectar en la Forja.</p>
                    </div>
                    <button onClick={onClose} className="text-titanium-500 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Search */}
                <div className="p-3 border-b border-titanium-800 bg-titanium-950">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-titanium-500" />
                        <input
                            type="text"
                            placeholder="Buscar en el Canon..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-titanium-900 border border-titanium-800 rounded-lg py-2 pl-9 pr-3 text-xs text-titanium-200 focus:outline-none focus:border-emerald-500 transition-colors"
                        />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-titanium-800">
                    {isFileTreeLoading ? (
                        <div className="flex items-center justify-center h-full text-titanium-500 gap-2">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-xs">{t.common.loadingIndex}</span>
                        </div>
                    ) : (
                        searchQuery ? renderSearchResults() : (
                             fileTree && fileTree.length > 0 ? renderTree(fileTree) : (
                                <div className="flex flex-col items-center justify-center h-full text-titanium-600 gap-2">
                                    <Folder size={32} className="opacity-20" />
                                    <span className="text-xs">No hay estructura indexada.</span>
                                </div>
                             )
                        )
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-titanium-800 bg-titanium-900/50 flex items-center justify-between">
                    <span className="text-xs text-titanium-500">
                        {selectedIds.size} archivo(s) seleccionado(s)
                    </span>
                    <button
                        onClick={handleConfirm}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                    >
                        <Check size={14} />
                        {t.common.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContextSelectorModal;
