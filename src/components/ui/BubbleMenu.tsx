import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Maximize2, CheckCircle, Bold, Italic, Heading1, Heading2, Mic, Square } from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { EditorSelection, Text } from '@codemirror/state';

interface BubbleMenuProps {
    visible: boolean;
    position: { x: number; y: number } | null;
    view: EditorView | null;
    onReadSelection: (text: string) => void;
    narratorState?: {
        isPlaying: boolean;
        isLoading: boolean;
        stop: () => void;
    };
}

const BubbleMenu: React.FC<BubbleMenuProps> = ({ visible, position, view, onReadSelection, narratorState }) => {
    // console.log("Rendering BubbleMenu", { visible, position, view: !!view });
    if (!visible || !position || !view) return null;

    // --- MARKDOWN HELPERS ---

    const toggleWrapper = (marker: string) => {
        if (!view) return;
        const state = view.state;
        const selection = state.selection.main;
        const text = state.sliceDoc(selection.from, selection.to);
        const markerLen = marker.length;

        // Check if already wrapped (naive check: just checks selected text boundaries)
        const isWrapped = text.startsWith(marker) && text.endsWith(marker) && text.length >= markerLen * 2;

        if (isWrapped) {
            // Unwrap
            view.dispatch({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: text.slice(markerLen, -markerLen)
                },
                selection: EditorSelection.range(selection.from, selection.to - markerLen * 2)
            });
        } else {
            // Wrap
            view.dispatch({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: `${marker}${text}${marker}`
                },
                selection: EditorSelection.range(selection.from, selection.to + markerLen * 2)
            });
        }
        view.focus();
    };

    const toggleHeading = (level: 1 | 2) => {
        if (!view) return;
        const state = view.state;
        const line = state.doc.lineAt(state.selection.main.head);
        const lineText = line.text;
        const marker = '#'.repeat(level) + ' ';

        // Regex to detect existing headers
        const match = lineText.match(/^(#{1,6})\s/);

        let newText = lineText;
        if (match) {
            // If it already has THIS level, remove it.
            if (match[1].length === level) {
                newText = lineText.replace(/^(#{1,6})\s/, '');
            } else {
                // If it has diff level, replace it.
                newText = lineText.replace(/^(#{1,6})\s/, marker);
            }
        } else {
            // Add header
            newText = marker + lineText;
        }

        view.dispatch({
            changes: {
                from: line.from,
                to: line.to,
                insert: newText
            }
        });
        view.focus();
    };

    const handleRead = () => {
        if (!view) return;
        const text = view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
        if (text) {
            onReadSelection(text);
        }
    };

    return createPortal(
        <div
            className="fixed flex items-center gap-1 p-1 rounded-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-titanium-700"
            style={{
                left: position.x,
                top: position.y - 10,
                transform: 'translate(-50%, -100%)',
                zIndex: 99999,
                backgroundColor: '#09090b',
                pointerEvents: 'auto',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.8), 0 8px 10px -6px rgba(0, 0, 0, 0.8)'
            }}
            onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            {/* BOLD */}
            <button
                onClick={() => toggleWrapper('**')}
                className="p-2 text-titanium-300 hover:text-white hover:bg-titanium-800 rounded-md transition-colors"
                title="Negrita"
            >
                <Bold size={16} />
            </button>

            {/* ITALIC */}
            <button
                onClick={() => toggleWrapper('*')}
                className="p-2 text-titanium-300 hover:text-white hover:bg-titanium-800 rounded-md transition-colors"
                title="Cursiva"
            >
                <Italic size={16} />
            </button>

            {/* H1 */}
            <button
                onClick={() => toggleHeading(1)}
                className="p-2 text-titanium-300 hover:text-white hover:bg-titanium-800 rounded-md transition-colors"
                title="Título 1"
            >
                <Heading1 size={16} />
            </button>

            {/* H2 */}
            <button
                onClick={() => toggleHeading(2)}
                className="p-2 text-titanium-300 hover:text-white hover:bg-titanium-800 rounded-md transition-colors"
                title="Título 2"
            >
                <Heading2 size={16} />
            </button>

            <div className="w-px h-4 bg-titanium-700 mx-0.5" />

            {/* TTS READ */}
            <button
                onClick={handleRead}
                className={`p-2 rounded-md transition-colors flex items-center gap-2 ${
                    narratorState?.isPlaying
                    ? 'text-cyan-400 bg-cyan-900/20 hover:text-cyan-200'
                    : 'text-cyan-400 hover:text-cyan-200 hover:bg-cyan-900/30'
                }`}
                title="Leer selección"
            >
                <Mic size={16} />
            </button>

            {/* TTS STOP (CONDITIONAL) */}
            {narratorState?.isPlaying && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        narratorState.stop();
                    }}
                    className="p-2 text-red-400 hover:text-red-200 hover:bg-red-900/30 rounded-md transition-colors flex items-center gap-2"
                    title="Detener Narración"
                >
                    <Square size={16} fill="currentColor" />
                </button>
            )}

            {/* DECORATION */}
            <div
                className="absolute left-1/2 bottom-[-5px] w-2.5 h-2.5 bg-[#09090b] border-r border-b border-titanium-700 transform -translate-x-1/2 rotate-45"
                style={{ zIndex: -1 }}
            />
        </div>,
        document.body
    );
};

export default BubbleMenu;
