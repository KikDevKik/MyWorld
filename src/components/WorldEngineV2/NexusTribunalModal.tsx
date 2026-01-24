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
    Database
} from 'lucide-react';
import { AnalysisCandidate, AnalysisAmbiguityType } from './types';

interface NexusTribunalModalProps {
    isOpen: boolean;
    onClose: () => void;
    candidates: AnalysisCandidate[];
    onAction: (action: 'APPROVE' | 'REJECT', candidate: AnalysisCandidate) => void;
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

const NexusTribunalModal: React.FC<NexusTribunalModalProps> = ({ isOpen, onClose, candidates, onAction }) => {
    // STATE: FILTER
    const [filterMode, setFilterMode] = useState<'ALL' | 'CONFLICT' | 'NEW'>('ALL');

    // DERIVED: FILTERED LIST
    const filteredCandidates = React.useMemo(() => {
        return candidates.filter(c => {
            if (filterMode === 'ALL') return true;
            if (filterMode === 'CONFLICT') return c.ambiguityType === 'CONFLICT' || c.ambiguityType === 'DUPLICATE';
            if (filterMode === 'NEW') return c.ambiguityType === 'NEW' || c.ambiguityType === 'ITEM_LORE';
            return true;
        });
    }, [candidates, filterMode]);

    // Auto-select first candidate on mount if not empty
    const [selectedId, setSelectedId] = useState<string | null>(candidates.length > 0 ? candidates[0].id : null);

    // Derived state
    const selectedCandidate = candidates.find(c => c.id === selectedId);

    // Sync selection when candidates list changes (e.g., item removed)
    React.useEffect(() => {
        // If list is empty, clear selection
        if (filteredCandidates.length === 0) {
            setSelectedId(null);
            return;
        }

        // If current selection is gone (or filtered out), select the first one of the current view
        const isSelectedVisible = selectedId && filteredCandidates.find(c => c.id === selectedId);

        if (!isSelectedVisible) {
            setSelectedId(filteredCandidates[0].id);
        }
    }, [filteredCandidates, selectedId]);

    const handleAction = (action: 'APPROVE' | 'REJECT') => {
        if (!selectedCandidate) return;
        onAction(action, selectedCandidate);
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
                <div className="w-[30%] border-r border-slate-800 bg-[#0f0f10] flex flex-col">
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
                            All Pending
                        </button>
                        <button
                            onClick={() => setFilterMode('CONFLICT')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'CONFLICT' ? 'border-b-2 border-orange-500 text-orange-100 bg-orange-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            Conflicts
                        </button>
                        <button
                            onClick={() => setFilterMode('NEW')}
                            className={`flex-1 py-3 text-center transition-colors ${filterMode === 'NEW' ? 'border-b-2 border-purple-500 text-purple-100 bg-purple-950/10' : 'hover:bg-slate-900/50 hover:text-slate-300'}`}
                        >
                            New
                        </button>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredCandidates.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                                <Check size={32} className="text-green-900" />
                                <span className="text-xs font-mono">
                                    {candidates.length === 0 ? "NO ISSUES FOUND" : "NO MATCHES"}
                                </span>
                            </div>
                        ) : (
                            filteredCandidates.map(candidate => {
                                const isSelected = selectedId === candidate.id;

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

                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`text-sm font-bold truncate pr-2 ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                {candidate.name}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(candidate.ambiguityType)}`}>
                                                {candidate.category}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                                            {getTypeIcon(candidate.ambiguityType)}
                                            <span>{candidate.suggestedAction}</span>
                                            <span className="ml-auto text-slate-600">{candidate.confidence}% CF</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}

                    </div>
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

                    {selectedCandidate ? (
                        <>
                            {/* Header Detail */}
                            <div className="h-24 border-b border-slate-800/50 flex flex-col justify-center px-8 bg-gradient-to-b from-slate-900/20 to-transparent">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className={`p-2 rounded-lg border ${getTypeColor(selectedCandidate.ambiguityType)}`}>
                                        {getTypeIcon(selectedCandidate.ambiguityType)}
                                    </div>
                                    <h1 className="text-2xl font-bold text-white tracking-tight">{selectedCandidate.name}</h1>
                                </div>
                                <div className="flex items-center gap-4 text-xs font-mono text-slate-500">
                                    <span className="flex items-center gap-1 text-cyan-500">
                                        <Database size={12} /> ID: {selectedCandidate.id}
                                    </span>
                                    <span>•</span>
                                    <span className="text-slate-400">DETECTED IN SCAN</span>
                                </div>
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
                            <div className="h-20 border-t border-slate-800/50 flex items-center justify-end px-8 gap-4 bg-[#0f0f10]">
                                <button
                                    onClick={() => handleAction('REJECT')}
                                    className="px-6 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-all text-sm font-bold"
                                >
                                    REJECT
                                </button>
                                <button
                                    onClick={() => handleAction('APPROVE')}
                                    className="px-8 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/20 transition-all text-sm font-bold flex items-center gap-2 group"
                                >
                                    <Check size={16} className="group-hover:scale-110 transition-transform" />
                                    APPROVE ACTION
                                </button>
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
            </motion.div>
        </div>
    );
};

export default NexusTribunalModal;
