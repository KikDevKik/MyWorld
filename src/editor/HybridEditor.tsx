import React, { useRef, useEffect } from 'react';
import { EditorState } from '@codemirror/state';
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

interface HybridEditorProps {
    content: string;
    onContentChange?: (content: string) => void;
    driftMarkers?: DriftMarker[];
    className?: string;
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
    className = ""
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // 1. INITIALIZE EDITOR
    useEffect(() => {
        if (!editorRef.current) return;

        const startState = EditorState.create({
            doc: content,
            extensions: [
                // Base
                lineNumbers(), // Keep for now as per "optional" but user said "desactiva o hazlos opcionales". Let's disable them for Zen feel.
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
                oneDark, // Base theme (modified by titaniumTheme)
                titaniumTheme,
                EditorView.lineWrapping,

                // Custom Extensions
                driftExtension,

                // Update Listener
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && onContentChange) {
                        onContentChange(update.state.doc.toString());
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

    // 2. HANDLE CONTENT UPDATES (External -> Internal)
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
        <div
            ref={editorRef}
            className={`h-full w-full overflow-hidden ${className}`}
            style={{ fontSize: '16px' }}
        />
    );
};

export default HybridEditor;
