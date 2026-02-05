import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { VisualNode } from './types';
import { EntityType } from '../../types/graph';

interface NodeEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    node: VisualNode | null;
    onSave: (nodeId: string, updates: { name: string, type: string, subtype: string, description: string }) => Promise<void>;
    onDelete?: (nodeId: string) => Promise<void>;
}

const ENTITY_TYPES: EntityType[] = ['character', 'location', 'object', 'event', 'faction', 'concept', 'creature', 'race'];

export const NodeEditModal: React.FC<NodeEditModalProps> = ({ isOpen, onClose, node, onSave, onDelete }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState<EntityType>('character');
    const [subtype, setSubtype] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        if (node) {
            setName(node.name);
            setType(node.type);
            setSubtype(node.subtype || '');
            setDescription(node.description || node.meta?.brief || '');
        }
    }, [node]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!node) return;

        setIsSaving(true);
        try {
            await onSave(node.id, {
                name,
                type,
                subtype,
                description
            });
            onClose();
        } catch (error) {
            console.error("Save failed:", error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!node || !onDelete) return;
        if (!confirm("¿Estás seguro de que quieres eliminar este nodo permanentemente?")) return;

        setIsDeleting(true);
        try {
            await onDelete(node.id);
            onClose();
        } catch (error) {
            console.error("Delete failed:", error);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && node && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="node-edit-title"
                >
                     <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-lg bg-[#141413] border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
                     >
                         {/* HEADER */}
                         <div className="flex justify-between items-center p-6 border-b border-slate-800 bg-slate-900/50">
                             <h2 id="node-edit-title" className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                 <Edit2Icon className="text-cyan-400" size={20} />
                                 Editar Nodo
                             </h2>
                             <button
                                 onClick={onClose}
                                 className="text-slate-500 hover:text-white transition-colors"
                                 aria-label="Cerrar editor"
                             >
                                 <X size={20} />
                             </button>
                         </div>

                         {/* FORM */}
                         <form onSubmit={handleSubmit} className="p-6 space-y-5">

                             {/* NAME */}
                             <div className="space-y-1.5">
                                 <label htmlFor="node-name" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nombre</label>
                                 <input
                                     id="node-name"
                                     value={name}
                                     onChange={(e) => setName(e.target.value)}
                                     className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white focus:border-cyan-500 outline-none transition-colors font-bold"
                                     placeholder="Nombre de la entidad..."
                                     required
                                 />
                             </div>

                             <div className="grid grid-cols-2 gap-4">
                                 {/* TYPE */}
                                 <div className="space-y-1.5">
                                     <label htmlFor="node-type" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tipo</label>
                                     <select
                                         id="node-type"
                                         value={type}
                                         onChange={(e) => setType(e.target.value as EntityType)}
                                         className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 outline-none transition-colors appearance-none uppercase font-mono"
                                     >
                                         {ENTITY_TYPES.map(t => (
                                             <option key={t} value={t}>{t}</option>
                                         ))}
                                     </select>
                                 </div>

                                 {/* SUBTYPE */}
                                 <div className="space-y-1.5">
                                     <label htmlFor="node-subtype" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Subtipo</label>
                                     <input
                                         id="node-subtype"
                                         value={subtype}
                                         onChange={(e) => setSubtype(e.target.value)}
                                         className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-cyan-300 focus:border-cyan-500 outline-none transition-colors uppercase font-mono tracking-wide"
                                         placeholder="EJ: CIUDAD, ESPADA..."
                                     />
                                 </div>
                             </div>

                             {/* DESCRIPTION */}
                             <div className="space-y-1.5">
                                 <label htmlFor="node-description" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Descripción</label>
                                 <textarea
                                     id="node-description"
                                     value={description}
                                     onChange={(e) => setDescription(e.target.value)}
                                     className="w-full h-32 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-300 focus:border-cyan-500 outline-none transition-colors resize-none font-mono leading-relaxed custom-scrollbar"
                                     placeholder="Descripción o contexto..."
                                 />
                             </div>

                             {/* ACTIONS */}
                             <div className="pt-4 flex justify-between items-center">
                                 <div>
                                     {onDelete && (
                                         <button
                                             type="button"
                                             onClick={handleDelete}
                                             disabled={isDeleting || isSaving}
                                             className="flex items-center gap-2 px-4 py-2 rounded text-red-500 hover:text-red-400 hover:bg-red-950/20 text-xs font-bold transition-colors disabled:opacity-50"
                                         >
                                             {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                             {isDeleting ? 'ELIMINANDO...' : 'ELIMINAR'}
                                         </button>
                                     )}
                                 </div>

                                 <div className="flex gap-3">
                                     <button
                                         type="button"
                                         onClick={onClose}
                                         className="px-4 py-2 rounded text-slate-400 hover:text-white text-xs font-bold transition-colors"
                                     >
                                         CANCELAR
                                     </button>
                                     <button
                                         type="submit"
                                         disabled={isSaving || isDeleting}
                                         className="flex items-center gap-2 px-6 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                     >
                                         {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                         {isSaving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                                     </button>
                                 </div>
                             </div>
                         </form>
                     </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

// Simple Icon component for the header
const Edit2Icon: React.FC<any> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
);
