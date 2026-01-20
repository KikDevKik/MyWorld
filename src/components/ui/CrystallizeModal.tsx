import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Folder, FileText, Tag, Loader2 } from 'lucide-react';
import { useProjectConfig } from "../../contexts/ProjectConfigContext";

interface CrystallizeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: { fileName: string; folderId: string; frontmatter: any }) => void;
    node: {
        title: string;
        content: string;
        metadata?: {
            suggested_filename?: string;
            suggested_folder_category?: string;
            node_type?: string;
            related_node_ids?: string[];
        };
    } | null;
    isProcessing: boolean;
}

const CrystallizeModal: React.FC<CrystallizeModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    node,
    isProcessing
}) => {
    const { config } = useProjectConfig();
    const [fileName, setFileName] = useState('');
    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [tags, setTags] = useState<string>('');
    const [previewContent, setPreviewContent] = useState('');

    // RESET STATE ON OPEN
    useEffect(() => {
        if (isOpen && node) {
            // 1. Filename Logic
            let safeName = node.metadata?.suggested_filename || node.title.replace(/[^a-zA-Z0-9]/g, '_') + '.md';
            if (!safeName.endsWith('.md')) safeName += '.md';
            setFileName(safeName);

            // 2. Folder Logic (Smart Match)
            let targetId = config?.folderId || ''; // Default to root

            if (config?.canonPaths && node.metadata?.suggested_folder_category) {
                const category = node.metadata.suggested_folder_category.toLowerCase();
                // Try to find a partial match in canon paths
                const match = config.canonPaths.find(p => p.name.toLowerCase().includes(category));
                if (match) {
                    targetId = match.id;
                }
            }
            setSelectedFolderId(targetId);

            // 3. Tags & Metadata
            const initialTags = [node.metadata?.node_type || 'concept', 'crystallized'].join(', ');
            setTags(initialTags);

            setPreviewContent(node.content);
        }
    }, [isOpen, node, config]);

    const handleConfirm = () => {
        if (!selectedFolderId || !fileName) return;

        const frontmatter = {
            title: node?.title,
            type: node?.metadata?.node_type || 'concept',
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            status: 'crystallized',
            created_at: new Date().toISOString(),
            related: node?.metadata?.related_node_ids || []
        };

        onConfirm({
            fileName,
            folderId: selectedFolderId,
            frontmatter
        });
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-[500px] bg-slate-900 border border-titanium-500/30 rounded-xl shadow-2xl overflow-hidden"
            >
                {/* HEADER */}
                <div className="h-12 bg-slate-800 flex items-center justify-between px-4 border-b border-titanium-500/30">
                    <div className="flex items-center gap-2 text-titanium-100 font-bold tracking-widest text-sm">
                        <span className="text-xl">💎</span>
                        CRYSTALLIZATION PROTOCOL
                    </div>
                    <button onClick={onClose} className="text-titanium-400 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* BODY */}
                <div className="p-6 space-y-4">

                    {/* FILENAME INPUT */}
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-titanium-500 flex items-center gap-1">
                            <FileText size={10} /> Target Filename
                        </label>
                        <input
                            type="text"
                            value={fileName}
                            onChange={(e) => setFileName(e.target.value)}
                            className="w-full bg-black/50 border border-titanium-700 rounded px-3 py-2 text-sm text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none"
                        />
                    </div>

                    {/* FOLDER SELECT */}
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-titanium-500 flex items-center gap-1">
                            <Folder size={10} /> Destination Sector
                        </label>
                        <select
                            value={selectedFolderId}
                            onChange={(e) => setSelectedFolderId(e.target.value)}
                            className="w-full bg-black/50 border border-titanium-700 rounded px-3 py-2 text-sm text-white font-mono focus:border-cyan-500 focus:outline-none appearance-none"
                        >
                            <option value={config?.folderId || ''} className="bg-slate-900 text-gray-400">
                                📂 Root Canon ({config?.folderId ? 'Found' : 'Missing'})
                            </option>
                            {config?.canonPaths.map(p => (
                                <option key={p.id} value={p.id} className="bg-slate-900">
                                    📂 {p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* TAGS INPUT */}
                    <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-titanium-500 flex items-center gap-1">
                            <Tag size={10} /> Metadata Tags
                        </label>
                        <input
                            type="text"
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            className="w-full bg-black/50 border border-titanium-700 rounded px-3 py-2 text-sm text-purple-300 font-mono focus:border-purple-500 focus:outline-none"
                        />
                    </div>

                </div>

                {/* FOOTER */}
                <div className="p-4 bg-slate-800/50 flex justify-end gap-3 border-t border-titanium-500/30">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded text-xs font-bold text-titanium-400 hover:text-white transition-colors"
                    >
                        CANCEL
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isProcessing}
                        className={`
                            px-6 py-2 rounded text-xs font-bold text-white flex items-center gap-2
                            transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)]
                            ${isProcessing ? 'bg-slate-600 cursor-not-allowed' : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:scale-105'}
                        `}
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                MATERIALIZING...
                            </>
                        ) : (
                            <>
                                <Check size={14} />
                                ENGAGE
                            </>
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default CrystallizeModal;
