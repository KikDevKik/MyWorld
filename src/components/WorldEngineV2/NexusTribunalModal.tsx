import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Check,
    AlertTriangle,
    Sparkles,
    Scroll,
    Archive,
    ArrowRight,
    ShieldAlert,
    Database,
    Pencil,
    Save,
    Trash2,
    Undo2,
    Loader2,
    Users,
    GitMerge
} from 'lucide-react';
import { AnalysisCandidate, AnalysisAmbiguityType } from './types';

interface NexusTribunalModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidates: AnalysisCandidate[];
    onAction: (action: 'APPROVE' | 'REJECT_SOFT' | 'REJECT_HARD', candidate: AnalysisCandidate) => Promise<void>;
    onEditApprove: (originalCandidate: AnalysisCandidate, newValues: { name: string, type: string, subtype: string }) => Promise<void>;
    onBatchMerge: (winner: AnalysisCandidate, losers: AnalysisCandidate[]) => Promise<void>;
    ignoredTerms?: string[];
    onRestoreIgnored?: (term: string) => void;
}

// 🟢 UTILS: COLOR MAPPING
const getTypeColor = (type: AnalysisAmbiguityType) => {
    switch (type) {
        case 'CONFLICT': return 'text-orange-400 border-orange-500/50 bg-orange-950/20';
        case 'DUPLICATE': return 'text-yellow-400 border-yellow-500/50 bg-yellow-950/20';
        case 'NEW': return 'text-cyan-400 border-cyan-500/50 bg-cyan-950/20';
        case 'ITEM_LORE': return 'text-purple-400 border-purple-500/50 bg-purple-950/20';
        default: return 'text-slate-400 border-slate-500/50 bg-slate-950/20';
    }
};

const getTypeIcon = (type: AnalysisAmbiguityType) => {
    switch (type) {
        case 'CONFLICT': return <AlertTriangle size={16} />;
        case 'DUPLICATE': return <AlertTriangle size={16} />;
        case 'NEW': return <Sparkles size={16} />;
        case 'ITEM_LORE': return <Archive size={16} />; // Or Scroll
        default: return <Sparkles size={16} />;
    }
};

const NexusTribunalModal: React.FC<NexusTribunalModalProps> = ({ isOpen, onClose, candidates, onAction, onEditApprove, onBatchMerge, ignoredTerms = [], onRestoreIgnored }) => {
    // STATE: FILTER
    const [filterMode, setFilterMode] = useState<'ALL' | 'CONFLICT' | 'NEW' | 'TRASH'>('ALL');

    // STATE: EDIT MODE
    const [isEditing, setIsEditing] = useState(false);
    const [editValues, setEditValues] = useState({ name: '', type: 'concept', subtype: '' });

    // STATE: SELECTION
    const [selectedId, setSelectedId] = useState<string | null>(candidates.length > 0 ? candidates[0].id : null);
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

    // STATE: REJECT POPOVER
    const [showRejectPopover, setShowRejectPopover] = useState(false);

    // STATE: BATCH MERGE MODAL
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchMasterId, setBatchMasterId] = useState<string | null>(null);

    // STATE: PROCESSING
    const [isProcessing, setIsProcessing] = useState(false);

    // DERIVED: FILTERED LIST
    const filteredCandidates = React.useMemo(() => {
        if (filterMode === 'TRASH') return []; // Trash handled separately in UI
        return candidates.filter(c => {
            if (filterMode === 'ALL') return true;
            if (filterMode === 'CONFLICT') return c.ambiguityType === 'CONFLICT' || c.ambiguityType === 'DUPLICATE';
            if (filterMode === 'NEW') return c.ambiguityType === 'NEW' || c.ambiguityType === 'ITEM_LORE';
            return true;
        });
    }, [candidates, filterMode]);

    // Derived state
    const selectedCandidate = candidates.find(c => c.id === selectedId);

    // Sync selection when candidates list changes
    React.useEffect(() => {
        if (filterMode === 'TRASH') return;

        // Cleanup checked IDs that no longer exist
        const currentIds = new Set(candidates.map(c => c.id));
        setCheckedIds(prev => {
            const next = new Set(prev);
            next.forEach(id => {
                if (!currentIds.has(id)) next.delete(id);
            });
            return next;
        });

        if (filteredCandidates.length === 0) {
            setSelectedId(null);
            return;
        }

        const isSelectedVisible = selectedId && filteredCandidates.find(c => c.id === selectedId);
        if (!isSelectedVisible) {
            setSelectedId(filteredCandidates[0].id);
        }
    }, [filteredCandidates, selectedId, filterMode]);

    // Reset Edit Mode when changing selection
    React.useEffect(() => {
        setIsEditing(false);
        setShowRejectPopover(false);
        if (selectedCandidate) {
            setEditValues({
                name: selectedCandidate.name,
                type: (selectedCandidate as any).type || 'concept',
                subtype: (selectedCandidate as any).subtype || ''
            });
        }
    }, [selectedCandidate]);

    const toggleCheck = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleAction = async (action: 'APPROVE' | 'REJECT_SOFT' | 'REJECT_HARD') => {
        if (!selectedCandidate) return;
        setIsProcessing(true);
        setShowRejectPopover(false);

        // 🟢 Clean Data
        const cleanCandidate = { ...selectedCandidate };
        const dirtyProps = ['fx', 'fy', 'vx', 'vy', 'index', 'x', 'y'];
        dirtyProps.forEach(prop => delete (cleanCandidate as any)[prop]);

        try {
            await onAction(action, cleanCandidate);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSaveEdit = async () => {
        if (!selectedCandidate) return;
        setIsProcessing(true);
        try {
            await onEditApprove(selectedCandidate, editValues);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBatchMergeInit = () => {
        if (checkedIds.size < 2) return;
        // Default master: First selected
        const first = Array.from(checkedIds)[0];
        setBatchMasterId(first);
        setIsBatchModalOpen(true);
    };

    const confirmBatchMerge = async () => {
        if (!batchMasterId || checkedIds.size < 2) return;

        const winner = candidates.find(c => c.id === batchMasterId);
        const losers = candidates.filter(c => checkedIds.has(c.id) && c.id !== batchMasterId);

        if (!winner) return;

        setIsProcessing(true);
        try {
            await onBatchMerge(winner, losers);
            setIsBatchModalOpen(false);
            setCheckedIds(new Set());
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-[90%] max-w-6xl h-[80vh] bg-[#0a0a0b] border border-slate-800 rounded-2xl shadow-2xl flex overflow-hidden ring-1 ring-white/10"
            >
                {/* 🟢 LEFT PANEL: LIST (30%) */}
                <div className="w-[30%] border-r border-slate-800 bg-[#0f0f10] flex flex-col relative">
                    {/* Header */}
                    <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3 bg-gradient-to-r from-slate-900 to-transparent">
                        <ShieldAlert className="text-cyan-500" size={20} />
                        <div>
                            <h2 className="text-sm font-bold text-slate-200 tracking-wider">NEXUS TRIBUNAL</h2>
                            <div className="text-[10px] text-cyan-500/80 font-mono">ANALYSIS PROTOCOL ACTIVE</div>
                        </div>
                    </div>

                    {/* Filters/Tabs */}
                    <div className="flex border-b border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <button
                            onClick={() => setFilterMode('ALL')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'ALL' ? 'border-b-2 border-cyan-500 text-cyan-100 bg-cyan-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setFilterMode('CONFLICT')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'CONFLICT' ? 'border-b-2 border-orange-500 text-orange-100 bg-orange-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            Conf.
                        </button>
                        <button
                            onClick={() => setFilterMode('NEW')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'NEW' ? 'border-b-2 border-purple-500 text-purple-100 bg-purple-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            New
                        </button>
                        <button
                            onClick={() => setFilterMode('TRASH')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'TRASH' ? 'border-b-2 border-red-500 text-red-100 bg-red-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            <Trash2 size={12} className="mx-auto" />
                        </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 mb-14">
                        {filterMode === 'TRASH' ? (
                            // TRASH LIST
                            ignoredTerms.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                                    <Trash2 size={24} className="text-slate-800" />
                                    <span className="text-xs font-mono">PAPER BIN EMPTY</span>
                                </div>
                            ) : (
                                ignoredTerms.map((term, idx) => (
                                    <div key={idx} className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/30">
                                        <span className="text-sm text-slate-400 font-mono truncate max-w-[150px]">{term}</span>
                                        <button
                                            onClick={() => onRestoreIgnored && onRestoreIgnored(term)}
                                            className="p-1.5 rounded bg-slate-800 hover:bg-green-900 hover:text-green-300 text-slate-500 transition-colors"
                                            title="Restaurar"
                                        >
                                            <Undo2 size={14} />
                                        </button>
                                    </div>
                                ))
                            )
                        ) : (
                            // CANDIDATE LIST
                            filteredCandidates.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                                    <Check size={32} className="text-green-900" />
                                    <span className="text-xs font-mono">
                                        {candidates.length === 0 ? "NO ISSUES FOUND" : "NO MATCHES"}
                                    </span>
                                </div>
                            ) : (
                                filteredCandidates.map(candidate => {
                                    const isSelected = selectedId === candidate.id;
                                    const isChecked = checkedIds.has(candidate.id);

                                    return (
                                        <button
                                            key={candidate.id}
                                            onClick={() => setSelectedId(candidate.id)}
                                            className={`w-full text-left p-4 rounded-lg border transition-all duration-200 group relative overflow-hidden ${
                                                isSelected
                                                    ? 'bg-slate-800/80 border-slate-600 shadow-lg'
                                                    : 'bg-transparent border-transparent hover:bg-slate-900/50 hover:border-slate-800'
                                            }`}
                                        >
                                            {/* Selection Indicator */}
                                            {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-500" />}

                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                {/* Checkbox for Batch */}
                                                <div
                                                    onClick={(e) => toggleCheck(e, candidate.id)}
                                                    className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                                        isChecked
                                                            ? 'bg-cyan-500 border-cyan-500 text-black'
                                                            : 'border-slate-600 hover:border-slate-400'
                                                    }`}
                                                >
                                                    {isChecked && <Check size={10} strokeWidth={4} />}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-start">
                                                        <span className={`text-sm font-bold truncate pr-2 ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                            {candidate.name}
                                                        </span>
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${getTypeColor(candidate.ambiguityType)}`}>
                                                            {candidate.category}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-1">
                                                        {getTypeIcon(candidate.ambiguityType)}
                                                        <span>{candidate.suggestedAction}</span>
                                                        <span className="ml-auto text-slate-600">{candidate.confidence}% CF</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )
                        )}
                    </div>

                    {/* 🟢 FLOAT: BATCH ACTION */}
                    <AnimatePresence>
                        {checkedIds.size > 1 && (
                            <motion.div
                                initial={{ y: 50, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 50, opacity: 0 }}
                                className="absolute bottom-4 left-4 right-4 z-20"
                            >
                                <button
                                    onClick={handleBatchMergeInit}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-xl shadow-indigo-900/30 font-bold text-sm flex items-center justify-center gap-2"
                                >
                                    <GitMerge size={16} />
                                    FUSIONAR SELECCIONADOS ({checkedIds.size})
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* 🟢 RIGHT PANEL: DETAILS (70%) */}
                <div className="flex-1 bg-[#0a0a0b] flex flex-col relative">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors z-10"
                    >
                        <X size={20} />
                    </button>

                    {filterMode === 'TRASH' ? (
                        // TRASH EMPTY STATE FOR RIGHT PANEL
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                             <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
                                <Trash2 size={24} className="text-red-900" />
                             </div>
                             <p className="text-sm font-mono">IGNORED ENTITIES ARCHIVE</p>
                             <p className="text-xs text-slate-500 mt-2">Restoring an item allows Nexus to detect it again in the next scan.</p>
                        </div>
                    ) : selectedCandidate ? (
                        <>
                            {/* Header Detail */}
                            <div className="h-24 border-b border-slate-800/50 flex flex-col justify-center px-8 bg-gradient-to-b from-slate-900/20 to-transparent">

                                {isEditing ? (
                                    <div className="flex gap-4 items-center">
                                        <div className="flex-1 space-y-1">
                                             <label className="text-[10px] text-cyan-500 font-bold tracking-wider">NOMBRE</label>
                                             <input
                                                 className="w-full bg-slate-900/50 border border-slate-700 rounded p-2 text-xl font-bold text-white outline-none focus:border-cyan-500"
                                                 value={editValues.name}
                                                 onChange={e => setEditValues({...editValues, name: e.target.value})}
                                             />
                                        </div>
                                        <div className="w-40 space-y-1">
                                             <label className="text-[10px] text-cyan-500 font-bold tracking-wider">TIPO</label>
                                             <select
                                                 className="w-full bg-slate-900/50 border border-slate-700 rounded p-2 text-sm text-white outline-none focus:border-cyan-500 appearance-none"
                                                 value={editValues.type}
                                                 onChange={e => setEditValues({...editValues, type: e.target.value})}
                                             >
                                                 <option value="character">CHARACTER</option>
                                                 <option value="location">LOCATION</option>
                                                 <option value="object">OBJECT</option>
                                                 <option value="event">EVENT</option>
                                                 <option value="faction">FACTION</option>
                                                 <option value="concept">CONCEPT</option>
                                                 <option value="creature">CREATURE</option>
                                                 <option value="race">RACE</option>
                                             </select>
                                        </div>
                                        <div className="w-40 space-y-1">
                                             <label className="text-[10px] text-slate-500 font-bold tracking-wider">SUBTIPO</label>
                                             <input
                                                 className="w-full bg-slate-900/50 border border-slate-700 rounded p-2 text-sm text-white outline-none focus:border-cyan-500"
                                                 value={editValues.subtype}
                                                 onChange={e => setEditValues({...editValues, subtype: e.target.value})}
                                                 placeholder="Ej. Ruinas"
                                             />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className={`p-2 rounded-lg border ${getTypeColor(selectedCandidate.ambiguityType)}`}>
                                            {getTypeIcon(selectedCandidate.ambiguityType)}
                                        </div>
                                        <h1 className="text-2xl font-bold text-white tracking-tight">{selectedCandidate.name}</h1>

                                        {/* EDIT BUTTON */}
                                        <button
                                            onClick={() => setIsEditing(true)}
                                            className="ml-2 p-2 rounded-full hover:bg-slate-800 text-slate-500 hover:text-cyan-400 transition-colors"
                                            title="Editar Manualmente"
                                        >
                                            <Pencil size={16} />
                                        </button>
                                    </div>
                                )}

                                {!isEditing && (
                                    <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                                        <span className="flex items-center gap-1 text-cyan-500">
                                            <Database size={12} /> ID: {selectedCandidate.id}
                                        </span>
                                        <span>•</span>
                                        <span className="text-slate-400">DETECTED IN SCAN</span>
                                        { (selectedCandidate as any).subtype && (
                                             <>
                                                <span>•</span>
                                                <span className="text-purple-400">SUBTYPE: {(selectedCandidate as any).subtype}</span>
                                             </>
                                        )}
                                        { (selectedCandidate as any).type && (
                                             <>
                                                <span>•</span>
                                                <span className="text-yellow-400">TYPE: {(selectedCandidate as any).type}</span>
                                             </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Content Body */}
                            <div className="flex-1 p-8 overflow-y-auto">
                                <div className="grid grid-cols-2 gap-8">
                                    {/* Left Column: Analysis */}
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Analysis Reasoning</h3>
                                            <div className="p-4 bg-slate-900/30 rounded-xl border border-slate-800 text-slate-300 text-sm leading-relaxed">
                                                {selectedCandidate.reasoning}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Source Context</h3>
                                            <div className="space-y-3">
                                                {selectedCandidate.foundInFiles?.map((evidence, idx) => (
                                                    <div key={idx} className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-sm leading-relaxed relative">
                                                        <div className="flex items-center gap-2 mb-2 text-xs font-mono text-cyan-700">
                                                            <Database size={10} />
                                                            <span>{evidence.fileName}</span>
                                                        </div>
                                                        <div className="font-serif italic pl-2 border-l-2 border-slate-800">
                                                            "{evidence.contextSnippet}"
                                                        </div>
                                                    </div>
                                                ))}
                                                {(!selectedCandidate.foundInFiles || selectedCandidate.foundInFiles.length === 0) && (
                                                    <div className="text-xs text-slate-600 italic">No direct context provided.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Proposal */}
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Proposed Action</h3>
                                            <div className="p-1 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700">
                                                <div className="bg-[#0a0a0b] rounded-lg p-5">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <span className="text-sm font-bold text-white">{selectedCandidate.suggestedAction}</span>
                                                        <span className={`text-xs px-2 py-1 rounded border ${getTypeColor(selectedCandidate.ambiguityType)}`}>
                                                            {selectedCandidate.confidence}% Confidence
                                                        </span>
                                                    </div>

                                                    {selectedCandidate.suggestedAction === 'MERGE' && (
                                                        <div className="flex items-center gap-3 p-3 bg-slate-900 rounded border border-slate-800">
                                                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-500">
                                                                OLD
                                                            </div>
                                                            <ArrowRight size={14} className="text-slate-600" />
                                                            <div className="flex-1">
                                                                <div className="text-xs text-slate-500">Merge into Target:</div>
                                                                <div className="text-sm font-bold text-orange-400">
                                                                    {selectedCandidate.mergeWithId || 'Unknown'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {selectedCandidate.suggestedAction === 'CONVERT_TYPE' && (
                                                        <div className="flex items-center gap-3 p-3 bg-slate-900 rounded border border-slate-800">
                                                             <div className="text-xs text-slate-500">Change Type:</div>
                                                             <div className="text-sm font-bold text-purple-400">
                                                                 ENTITY → {selectedCandidate.category}
                                                             </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="h-20 border-t border-slate-800/50 flex items-center justify-end px-8 gap-4 bg-[#0f0f10] relative">
                                {isEditing ? (
                                    <>
                                        <button
                                            onClick={() => setIsEditing(false)}
                                            disabled={isProcessing}
                                            className={`px-6 py-2.5 rounded-lg border border-slate-700 text-slate-300 transition-all text-sm font-bold ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800 hover:text-white'}`}
                                        >
                                            CANCELAR
                                        </button>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isProcessing}
                                            className={`px-8 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20 transition-all text-sm font-bold flex items-center gap-2 group ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        >
                                            {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                            {isProcessing ? 'PROCESANDO...' : 'GUARDAR Y APROBAR'}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        {/* REJECT WITH POPOVER */}
                                        <div className="relative">
                                            <AnimatePresence>
                                                {showRejectPopover && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 10 }}
                                                        className="absolute bottom-full right-0 mb-3 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 flex flex-col gap-1 overflow-hidden z-50"
                                                    >
                                                        <button
                                                            onClick={() => handleAction('REJECT_SOFT')}
                                                            className="text-left px-3 py-2 rounded hover:bg-slate-800 text-slate-300 text-sm font-bold"
                                                        >
                                                            Descartar Instancia
                                                            <div className="text-[10px] font-normal text-slate-500">Solo quitar de la lista (Skip)</div>
                                                        </button>
                                                        <div className="h-[1px] bg-slate-800 my-1" />
                                                        <button
                                                            onClick={() => handleAction('REJECT_HARD')}
                                                            className="text-left px-3 py-2 rounded hover:bg-red-950/30 text-red-400 hover:text-red-300 text-sm font-bold flex items-center gap-2"
                                                        >
                                                            <ShieldAlert size={14} />
                                                            Banear Término
                                                            <div className="text-[10px] font-normal text-red-500/50 absolute bottom-2 right-2">BLACKLIST</div>
                                                        </button>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                            <button
                                                onClick={() => setShowRejectPopover(!showRejectPopover)}
                                                disabled={isProcessing}
                                                className={`px-6 py-2.5 rounded-lg border border-slate-700 text-slate-300 transition-all text-sm font-bold ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-800 hover:text-white'} ${showRejectPopover ? 'bg-slate-800 text-white' : ''}`}
                                            >
                                                REJECT...
                                            </button>
                                        </div>

                                        {(() => {
                                            const isMerge = selectedCandidate.suggestedAction === 'MERGE';
                                            const baseColor = isMerge ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/20';
                                            const label = isProcessing ? 'PROCESSING...' : (isMerge ? 'MERGE' : 'APPROVE');

                                            return (
                                                <button
                                                    onClick={() => handleAction('APPROVE')}
                                                    disabled={isProcessing}
                                                    className={`px-8 py-2.5 rounded-lg text-white shadow-lg transition-all text-sm font-bold flex items-center gap-2 group ${baseColor} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} className="group-hover:scale-110 transition-transform" />}
                                                    {label}
                                                </button>
                                            );
                                        })()}
                                    </>
                                )}
                            </div>
                        </>
                    ) : (
                        // Empty State (All Processed or No Selection)
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                             <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center mb-4">
                                <Sparkles size={24} className="text-slate-700" />
                             </div>
                             <p className="text-sm font-mono">NO ACTIVE CANDIDATE SELECTED</p>
                        </div>
                    )}
                </div>

                {/* 🟢 BATCH MERGE MODAL (INTERNAL) */}
                <AnimatePresence>
                    {isBatchModalOpen && (
                        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="w-[500px] bg-[#0f0f10] border border-slate-700 rounded-xl p-6 shadow-2xl"
                            >
                                <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                                    <div className="p-2 bg-indigo-900/30 rounded-lg text-indigo-400">
                                        <GitMerge size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-white">The Unifier Protocol</h2>
                                        <p className="text-xs text-slate-400">Selecciona la versión maestra para la fusión.</p>
                                    </div>
                                </div>

                                <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto">
                                    {candidates
                                        .filter(c => checkedIds.has(c.id))
                                        .map(candidate => (
                                            <div
                                                key={candidate.id}
                                                onClick={() => setBatchMasterId(candidate.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                                    batchMasterId === candidate.id
                                                        ? 'bg-indigo-600/20 border-indigo-500'
                                                        : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                                                }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                                                    batchMasterId === candidate.id ? 'border-indigo-400 bg-indigo-400' : 'border-slate-600'
                                                }`}>
                                                    {batchMasterId === candidate.id && <Check size={12} className="text-black" />}
                                                </div>
                                                <span className={`font-bold ${batchMasterId === candidate.id ? 'text-white' : 'text-slate-400'}`}>
                                                    {candidate.name}
                                                </span>
                                            </div>
                                        ))
                                    }
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                                    <button
                                        onClick={() => setIsBatchModalOpen(false)}
                                        className="px-4 py-2 rounded-lg text-slate-400 hover:text-white font-bold text-sm"
                                    >
                                        CANCELAR
                                    </button>
                                    <button
                                        onClick={confirmBatchMerge}
                                        disabled={!batchMasterId || isProcessing}
                                        className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-lg flex items-center gap-2"
                                    >
                                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <GitMerge size={16} />}
                                        CONFIRMAR FUSIÓN
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

            </motion.div>
        </div>
    );
};

export default NexusTribunalModal;
