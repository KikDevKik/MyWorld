import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TriangleAlert, Send, X, Terminal, Loader2 } from 'lucide-react';

interface HistoryItem {
    questions: string[];
    answer: string;
}

interface InterrogationModalProps {
    isOpen: boolean;
    questions: string[];
    history: HistoryItem[];
    depth: number;
    isThinking?: boolean;
    onSubmit: (answer: string) => void;
    onCancel: () => void;
}

const InterrogationModal: React.FC<InterrogationModalProps> = ({
    isOpen,
    questions,
    history,
    depth,
    isThinking = false,
    onSubmit,
    onCancel
}) => {
    const [answer, setAnswer] = useState('');

    const handleSubmit = () => {
        if (!answer.trim() || isThinking) return;
        onSubmit(answer);
        setAnswer('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey && !isThinking) {
            handleSubmit();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
            {/* BACKDROP */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                onClick={!isThinking ? onCancel : undefined}
            />

            {/* MODAL WINDOW */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-[600px] max-h-[85vh] bg-slate-900/90 border border-amber-500/30 shadow-[0_0_50px_rgba(245,158,11,0.15)] rounded-xl flex flex-col overflow-hidden"
            >
                {/* HEADER */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-amber-500/20 bg-amber-950/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <TriangleAlert className="text-amber-500" size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-amber-100 tracking-wider">⚠️ TACTICAL CLARIFICATION REQUIRED</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-amber-500/80 uppercase">Clarification Required</span>
                                <span className="w-1 h-1 rounded-full bg-amber-500" />
                                <span className="text-[10px] font-mono text-amber-400 font-bold">DEPTH: {depth}/3</span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isThinking}
                        className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* HISTORY SECTION */}
                    {history.length > 0 && (
                        <div className="space-y-4 mb-8 border-b border-slate-800 pb-6">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Terminal size={12} />
                                Previous Log
                            </div>
                            {history.map((item, idx) => (
                                <div key={idx} className="space-y-2 opacity-60 hover:opacity-100 transition-opacity">
                                    <div className="bg-amber-950/10 border-l-2 border-amber-500/20 pl-3 py-1">
                                        <div className="text-xs text-amber-500/70 font-mono mb-1">AI INQUIRY:</div>
                                        {item.questions.map((q, i) => (
                                            <p key={i} className="text-sm text-slate-300 italic">"{q}"</p>
                                        ))}
                                    </div>
                                    <div className="bg-slate-800/30 border-l-2 border-slate-600/30 pl-3 py-2 rounded-r">
                                        <div className="text-xs text-slate-500 font-mono mb-1">USER RESPONSE:</div>
                                        <p className="text-sm text-slate-300">{item.answer}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* CURRENT QUESTIONS */}
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-5">
                        <h3 className="text-sm font-bold text-amber-400 mb-3 uppercase tracking-wider">Tactical Clarifications Needed:</h3>
                        <ul className="space-y-3">
                            {questions.map((q, i) => (
                                <li key={i} className="flex items-start gap-3">
                                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 text-xs font-bold mt-0.5">
                                        {i + 1}
                                    </span>
                                    <span className="text-amber-100 font-medium leading-relaxed">{q}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                {/* FOOTER / INPUT */}
                <div className="p-6 bg-slate-900 border-t border-slate-800">
                    <div className="relative">
                        <textarea
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Provide strategic parameters..."
                            disabled={isThinking}
                            className="w-full h-32 bg-slate-950 border border-slate-700 rounded-lg p-4 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all font-sans resize-none text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            autoFocus
                        />
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">CTRL + ENTER to Send</span>
                            <button
                                onClick={handleSubmit}
                                disabled={!answer.trim() || isThinking}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white text-xs font-bold rounded-md shadow-lg shadow-amber-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform active:scale-95"
                            >
                                {isThinking ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                                {isThinking ? 'PROCESSING...' : 'TRANSMIT'}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default InterrogationModal;
