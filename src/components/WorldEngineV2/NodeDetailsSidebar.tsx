import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Edit2, MapPin, User, Box, Zap, Swords, BrainCircuit, Diamond, Hexagon } from 'lucide-react';
import { VisualNode } from './types';
import { EntityType } from '../../types/graph';

// Reuse Logic for Icons
const getTypeIcon = (type: EntityType) => {
    switch (type) {
        case 'character': return <User size={18} className="text-yellow-400" />;
        case 'location': return <MapPin size={18} className="text-cyan-400" />;
        case 'object': return <Box size={18} className="text-purple-400" />;
        case 'event': return <Zap size={18} className="text-orange-400" />;
        case 'faction': return <Swords size={18} className="text-red-400" />;
        case 'idea': return <BrainCircuit size={18} className="text-emerald-400" />;
        case 'creature': return <Hexagon size={18} className="text-lime-400" />;
        case 'race': return <User size={18} className="text-pink-400" />;
        default: return <Diamond size={18} className="text-slate-400" />;
    }
};

interface NodeDetailsSidebarProps {
    node: VisualNode | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: () => void;
}

export const NodeDetailsSidebar: React.FC<NodeDetailsSidebarProps> = ({ node, isOpen, onClose, onEdit }) => {
    return (
        <AnimatePresence>
            {isOpen && node && (
                <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    className="fixed top-0 right-0 h-full w-[400px] bg-[#0c0c0c] border-l border-slate-800 shadow-2xl z-[150] flex flex-col font-sans"
                >
                    {/* HEADER */}
                    <div className="p-6 border-b border-slate-800 bg-slate-900/50">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-slate-800 rounded-lg border border-slate-700 shadow-lg">
                                    {getTypeIcon(node.type)}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400 mb-0.5">
                                        {node.type}
                                    </span>
                                    {node.subtype && (
                                        <span className="text-[10px] uppercase font-mono tracking-widest text-cyan-500 font-bold">
                                            {node.subtype}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-800 rounded-full text-slate-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <h2 className="text-2xl font-bold text-white tracking-tight leading-none">{node.name}</h2>
                    </div>

                    {/* SCROLLABLE CONTENT */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                        {/* DESCRIPTION */}
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1 h-1 bg-slate-500 rounded-full" />
                                Descripción
                            </h3>
                            <p className="text-slate-300 text-sm leading-relaxed font-mono whitespace-pre-wrap">
                                {node.description || node.meta?.brief || "Sin descripción disponible."}
                            </p>
                        </div>

                        {/* METADATA */}
                        {(node.foundInFiles && node.foundInFiles.length > 0) && (
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1 h-1 bg-slate-500 rounded-full" />
                                    Fuentes ({node.foundInFiles.length})
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {node.foundInFiles.slice(0, 5).map((f, i) => (
                                        <div key={i} className="px-2.5 py-1.5 bg-slate-900 rounded border border-slate-800 flex items-center gap-2 max-w-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-900 border border-cyan-500/50" />
                                            <span className="text-[10px] text-slate-400 truncate max-w-[180px] font-mono">
                                                {f.fileName}
                                            </span>
                                        </div>
                                    ))}
                                    {node.foundInFiles.length > 5 && (
                                        <span className="px-2 py-1.5 bg-slate-900 rounded text-[10px] text-slate-500 border border-slate-800 font-mono">
                                            +{node.foundInFiles.length - 5} más
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* RELATIONS */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                <div className="w-1 h-1 bg-slate-500 rounded-full" />
                                Conexiones ({node.relations?.length || 0})
                            </h3>
                            <div className="space-y-2">
                                {node.relations?.map((rel, idx) => (
                                    <div key={idx} className="group flex items-center justify-between p-3 bg-slate-900/30 rounded border border-slate-800/50 hover:border-cyan-500/30 hover:bg-slate-900 transition-all duration-300">
                                        <div className="flex items-center gap-3">
                                            <div className="opacity-70 group-hover:opacity-100 transition-opacity">
                                                {getTypeIcon(rel.targetType)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-bold text-slate-300 group-hover:text-cyan-300 transition-colors">{rel.targetName}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">{rel.relation}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {(!node.relations || node.relations.length === 0) && (
                                    <div className="p-4 rounded border border-slate-800 border-dashed text-center">
                                        <span className="text-xs text-slate-600 italic">No hay conexiones registradas.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* FOOTER ACTIONS */}
                    <div className="p-6 border-t border-slate-800 bg-[#0c0c0c] flex gap-3">
                        <button
                            onClick={onEdit}
                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-cyan-950/20 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-900/40 hover:border-cyan-400 hover:text-cyan-200 transition-all duration-300 text-xs font-bold tracking-widest uppercase shadow-[0_0_20px_rgba(6,182,212,0.05)] hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]"
                        >
                            <Edit2 size={14} />
                            Editar Datos
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
