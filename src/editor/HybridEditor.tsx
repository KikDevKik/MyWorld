import React, { useRef, useEffect, useMemo } from 'react';
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
import { Lock } from 'lucide-react';
import { useProjectConfig } from '../contexts/ProjectConfigContext';
import { CreativeAuditService } from '../services/CreativeAuditService';

interface HybridEditorProps {
    content: string;
    onContentChange?: (content: string) => void;
    driftMarkers?: DriftMarker[];
    className?: string;
    readOnly?: boolean;
}

// 🟢 TITANIUM THEME OVERRIDES
const titaniumTheme = EditorView.theme({
    "&": {
        color: "var(--color-text-primary)",
        backgroundColor: "transparent",
        fontFamily: "var(--font-serif)", // Merriweather
        fontSize: "1.1rem",
        lineHeight: "1.8", // increased line height
        height: "100%", // Explicit height
    },
    ".cm-content": {
        caretColor: "var(--color-text-primary)",
        paddingBottom: "50vh", // Scroll past end
        paddingTop: "2rem",
        maxWidth: "800px", // Zen width
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

const HybridEditor: React.FC<HybridEditorProps> = ({
    content,
    onContentChange,
    driftMarkers = [],
    className = "",
    readOnly = false
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const editableCompartment = useMemo(() => new Compartment(), []);

    // 🟢 THE SPY: AUDIT LOGIC
    const { config, user } = useProjectConfig();
    const folderId = config?.folderId; // Use config folderId as projectId
    const bufferRef = useRef({ human: 0, ai: 0 }); // Local buffer
    const lastTypeTime = useRef(Date.now());

    // FLUSH TIMER (The Spy's Report)
    useEffect(() => {
        const interval = setInterval(() => {
            if (folderId && user && (bufferRef.current.human > 0 || bufferRef.current.ai > 0)) {
                if (import.meta.env.DEV) console.log("🕵️ [THE SPY] Flushing Report:", bufferRef.current);

                CreativeAuditService.updateAuditStats(folderId, user.uid, bufferRef.current.human, bufferRef.current.ai);
                bufferRef.current = { human: 0, ai: 0 }; // Reset
            }
        }, 5000); // 5s flush
        return () => clearInterval(interval);
    }, [folderId, user]);

    // 1. INITIALIZE EDITOR
    useEffect(() => {
        if (!editorRef.current) return;

        const startState = EditorState.create({
            doc: content,
            extensions: [
                // 🟢 READ ONLY STATE (Compartment)
                editableCompartment.of(EditorView.editable.of(!readOnly)),

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
                 // Calculate diff or just replace?
                 // For now, replacing full content if significantly different to avoid loop.
                 // Ideally we avoid this if the change originated from the editor.
                 // But since we have `onContentChange`, parent updates `content`.
                 // We need to be careful not to reset cursor.
                 // A simple check: if the difference is just typing, we might already have it?
                 // React strict mode might cause double render.
                 // If the content passed in is exactly what we just typed, do nothing.
                 // If it's different (e.g. file switch), replace.
                 viewRef.current.dispatch({
                     changes: { from: 0, to: currentDoc.length, insert: content }
                 });
            }
        }
    }, [content]);

    // 3. HANDLE DRIFT MARKERS
    useEffect(() => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                effects: setDriftMarkers.of(driftMarkers)
            });
        }
    }, [driftMarkers]);

    return (
        <div className="relative h-full w-full">
            <div
                ref={editorRef}
                className={`h-full w-full overflow-hidden ${className} ${readOnly ? 'opacity-80' : ''}`}
                style={{ fontSize: '16px' }}
            />
            {readOnly && (
                <div className="absolute top-4 right-8 bg-red-950/90 border border-red-500/50 text-red-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-xl z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-300">
                    <Lock size={14} />
                    <span className="text-xs font-bold tracking-wider">SOLO LECTURA (BLOQUEADO)</span>
                </div>
            )}
        </div>
    );
};

export default HybridEditor;
