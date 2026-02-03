import React, { useRef, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { history, historyKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { lintKeymap } from '@codemirror/lint';

import { driftExtension, setDriftMarkers, DriftMarker } from './extensions/driftPlugin';
import { livePreview } from './extensions/livePreviewPlugin';
import { narratorHighlighter, setActiveSegment, ActiveSegmentState } from './extensions/narratorHighlighter';
import '../styles/narrator.css';
import { Lock } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { CreativeAuditService } from '../services/CreativeAuditService';
import BubbleMenu from '../components/ui/BubbleMenu'; // 🟢 IMPORT BUBBLE MENU

// 🟢 EXPOSE HANDLE FOR IMPERATIVE ACTIONS
export interface HybridEditorHandle {
    insertAtCursor: (text: string) => void;
    getCursorContext: (before?: number, after?: number) => { preceding: string; following: string };
}

interface HybridEditorProps {
    content: string;
    onContentChange?: (content: string) => void;
    driftMarkers?: DriftMarker[];
    activeSegment?: ActiveSegmentState | null;
    className?: string;
    readOnly?: boolean;
    onReadSelection?: (text: string) => void; // 🟢 NEW PROP
}

// 🟢 HOST COMPONENT TO PREVENT RE-RENDERS
const CodeMirrorHost = React.memo(forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => (
    <div ref={ref} {...props} />
)));

// 🟢 TITANIUM THEME OVERRIDES
const titaniumTheme = EditorView.theme({
    "&": {
        color: "var(--color-text-primary)",
        backgroundColor: "transparent",
        fontFamily: "var(--editor-font-family, var(--font-serif))", // Dynamic Font with Fallback
        fontSize: "1.1rem",
        lineHeight: "1.8", // increased line height
        height: "100%", // Explicit height
    },
    ".cm-content": {
        caretColor: "var(--color-text-primary)",
        paddingBottom: "50vh", // Scroll past end
        paddingTop: "2rem",
        maxWidth: "var(--editor-max-width, 800px)", // Dynamic Zen width
        margin: "0 auto",
    },
    ".cm-cursor": {
        borderLeftColor: "var(--color-text-primary)"
    },
    ".cm-selectionBackground, ::selection": {
        backgroundColor: "var(--color-titanium-500) !important", // Titanium 700ish
        opacity: "0.3"
    },
    "&.cm-focused .cm-cursor": {
        borderLeftColor: "var(--color-text-primary)"
    },
    "&.cm-focused .cm-selectionBackground, ::selection": {
        backgroundColor: "var(--color-titanium-500) !important",
        opacity: "0.3"
    },
    ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--color-titanium-500)",
        border: "none"
    }
}, { dark: true });

const HybridEditor = forwardRef<HybridEditorHandle, HybridEditorProps>(({
    content,
    onContentChange,
    driftMarkers = [],
    activeSegment = null,
    className = "",
    readOnly = false,
    onReadSelection
}, ref) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartment = useMemo(() => new Compartment(), []);
    const [bubbleMenu, setBubbleMenu] = React.useState<{ visible: boolean; x: number; y: number } | null>(null); // 🟢 STATE

    // 🟢 EXPOSE IMPERATIVE HANDLE
    useImperativeHandle(ref, () => ({
        insertAtCursor: (text: string) => {
            if (viewRef.current) {
                const view = viewRef.current;
                // Use CodeMirror's native replaceSelection to handle cursor or range
                const transaction = view.state.replaceSelection(text);
                view.dispatch(transaction);
                view.focus(); // Refocus editor
            }
        },
        getCursorContext: (before = 2000, after = 500) => {
            if (viewRef.current) {
                const view = viewRef.current;
                const state = view.state;
                const head = state.selection.main.head;

                const from = Math.max(0, head - before);
                const to = Math.min(state.doc.length, head + after);

                return {
                    preceding: state.sliceDoc(from, head),
                    following: state.sliceDoc(head, to)
                };
            }
            return { preceding: "", following: "" };
        }
    }));

    // 🟢 THE SPY: AUDIT LOGIC
    const { config, user } = useProjectConfig();
    const folderId = config?.folderId; // Use config folderId as projectId
    const bufferRef = useRef({ human: 0, ai: 0 }); // Local buffer

    // FLUSH TIMER (The Spy's Report)
    useEffect(() => {
        const flush = () => {
            if (folderId && user && (bufferRef.current.human > 0 || bufferRef.current.ai > 0)) {
                if (import.meta.env.DEV) console.log("🕵️ [THE SPY] Flushing Report:", bufferRef.current);

                CreativeAuditService.updateAuditStats(folderId, user.uid, bufferRef.current.human, bufferRef.current.ai);
                bufferRef.current = { human: 0, ai: 0 }; // Reset
            }
        };

        const interval = setInterval(flush, 5000); // 5s flush

        return () => {
            clearInterval(interval);
            flush(); // Flush on unmount
        };
    }, [folderId, user]);

    // 1. INITIALIZE EDITOR
    useEffect(() => {
        if (!editorRef.current) return;

        const startState = EditorState.create({
            doc: content,
            extensions: [
                // 🟢 READ ONLY STATE (Compartment)
                editableCompartment.of(EditorView.editable.of(!readOnly)),

                // 🟢 ENABLE SPELLCHECK
                EditorView.contentAttributes.of({ spellcheck: "true" }),

                // Base
                lineNumbers(),
                highlightActiveLineGutter(),
                highlightSpecialChars(),
                history(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                rectangularSelection(),
                crosshairCursor(),
                highlightActiveLine(),
                bracketMatching(),
                closeBrackets(),
                highlightSelectionMatches(),

                // Keymaps
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...lintKeymap
                ]),

                // Language
                markdown(),

                // Theme & Appearance
                oneDark,
                titaniumTheme,
                EditorView.lineWrapping,

                // Custom Extensions
                driftExtension,
                livePreview,
                narratorHighlighter, // 🟢 NEW

                // Update Listener (The Spy's Eyes)
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        // 🟢 CHECK SOURCE: Only count USER events (keyboard/input)
                        // This prevents counting programmatic updates (like AI Insertion) as human typing.
                        const isUserEvent = update.transactions.some(tr =>
                            tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('undo') || tr.isUserEvent('redo')
                        );

                        if (isUserEvent) {
                            // 1. Calculate Change Metrics
                            let charsAdded = 0;
                            update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                                charsAdded += (toB - fromB);
                            });

                            // 2. Heuristic Analysis
                            if (charsAdded > 0) {
                                // If > 50 chars added in one event, assume PASTE (Suspicious)
                                if (charsAdded > 50) {
                                    if (import.meta.env.DEV) console.log(`🕵️ [THE SPY] Paste Detected (+${charsAdded} chars) -> IGNORED`);
                                } else {
                                    // 🟢 VALID: HUMAN TYPING
                                    bufferRef.current.human += charsAdded;
                                }
                            }
                        }

                        if (onContentChange) {
                            onContentChange(update.state.doc.toString());
                        }
                    }

                    // 🟢 BUBBLE MENU LOGIC
                    if (update.selectionSet || update.docChanged || update.viewportChanged || update.focusChanged) {
                        const selection = update.state.selection.main;
                        if (selection.empty) {
                            setBubbleMenu(null);
                        } else {
                            const view = update.view;
                            // Calculate position at the head (cursor) or ranges?
                            // Let's use the 'head' (where the cursor is) to keep it near interaction
                            // OR 'from' (start) to be stable.
                            try {
                                const range = view.coordsAtPos(selection.from);
                                if (range) {
                                    setBubbleMenu({
                                        visible: true,
                                        x: range.left,
                                        y: range.top
                                    });
                                }
                            } catch (error) {
                                // Fallback or silent fail if layout isn't ready
                                if (import.meta.env.DEV) console.warn("⚠️ [HybridEditor] BubbleMenu pos failed:", error);
                                setBubbleMenu(null);
                            }
                        }
                    }
                })
            ]
        });

        const view = new EditorView({
            state: startState,
            parent: editorRef.current
        });

        viewRef.current = view;

        return () => {
            view.destroy();
        };
    }, []); // Run once on mount

    // 2. HANDLE READ ONLY UPDATE
    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                effects: editableCompartment.reconfigure(EditorView.editable.of(!readOnly))
            });
        }
    }, [readOnly, editableCompartment]);

    // 3. HANDLE CONTENT UPDATES (External -> Internal)
    useEffect(() => {
        if (viewRef.current) {
            const currentDoc = viewRef.current.state.doc.toString();
            if (content !== currentDoc) {
                 viewRef.current.dispatch({
                     changes: { from: 0, to: currentDoc.length, insert: content }
                 });
            }
        }
    }, [content]);

    // 4. HANDLE DRIFT MARKERS
    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                effects: setDriftMarkers.of(driftMarkers)
            });
        }
    }, [driftMarkers]);

    // 5. 🟢 HANDLE NARRATOR UPDATES
    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                effects: setActiveSegment.of(activeSegment)
            });
        }
    }, [activeSegment]);

    return (
        <div className="relative h-full w-full">
            <CodeMirrorHost
                ref={editorRef}
                className={`h-full w-full overflow-hidden ${className} ${readOnly ? 'opacity-80' : ''}`}
                style={{ fontSize: '16px' }}
            />

            {/* 🟢 BUBBLE MENU PORTAL */}
            {bubbleMenu && onReadSelection && (
                <BubbleMenu
                    visible={bubbleMenu.visible}
                    position={bubbleMenu}
                    view={viewRef.current}
                    onReadSelection={onReadSelection}
                />
            )}

            {readOnly && (
                <div className="absolute top-4 right-8 bg-red-950/90 border border-red-500/50 text-red-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
                    <Lock size={14} />
                    <span className="text-xs font-bold tracking-wider">SOLO LECTURA (BLOQUEADO)</span>
                </div>
            )}
        </div>
    );
});

export default HybridEditor;
