import { Extension } from '@codemirror/state';
import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';

// 🟢 THE SIGNAL: State Effect to trigger updates
export interface ActiveSegmentState {
    from: number;
    to: number;
    color: string;
}

export const setActiveSegment = StateEffect.define<ActiveSegmentState | null>();

// 🟢 THE STATE FIELD: Holds the current active segment data
export const activeSegmentField = StateField.define<ActiveSegmentState | null>({
    create() {
        return null;
    },
    update(value, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(setActiveSegment)) {
                return effect.value;
            }
        }
        return value;
    }
});

// 🟢 THE VISUALS: Decoration Logic
// We use a ViewPlugin to read the StateField and create decorations.
// This allows us to access the `view` to calculate lines properly.

const narratorPlugin = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = this.computeDecorations(view);
        }

        update(update: ViewUpdate) {
            // Re-compute if doc changed or if our custom state field changed
            if (update.docChanged || update.state.field(activeSegmentField) !== update.startState.field(activeSegmentField)) {
                this.decorations = this.computeDecorations(update.view);
            }
        }

        computeDecorations(view: EditorView): DecorationSet {
            const activeSegment = view.state.field(activeSegmentField);

            if (!activeSegment) return Decoration.none;

            const { from, to, color } = activeSegment;

            // Validation: Ensure offsets are within bounds
            if (from < 0 || to > view.state.doc.length || from >= to) {
                 return Decoration.none;
            }

            // 🟢 LOGIC MAPPING: Offsets -> Line(s)
            // We want to highlight the ENTIRE line(s) that contain the segment.
            // "Neon Pulse" effect usually looks best on the full line.

            const startLine = view.state.doc.lineAt(from);
            const endLine = view.state.doc.lineAt(to);

            const widgets = [];

            // Iterate over all lines covered by the segment (usually just one, but maybe more)
            for (let i = startLine.number; i <= endLine.number; i++) {
                const line = view.state.doc.line(i);

                // Create the decoration
                const deco = Decoration.line({
                    class: "narrator-active-pulse",
                    attributes: {
                        style: `--speaker-neon-color: ${color};`
                    }
                });

                widgets.push(deco.range(line.from));
            }

            return Decoration.set(widgets);
        }
    },
    {
        decorations: v => v.decorations
    }
);

// 🟢 INTEGRATION: Auto-scroll Logic
const scrollListener = EditorView.updateListener.of((update) => {
    // Check if the active segment changed
    const current = update.state.field(activeSegmentField);
    const prev = update.startState.field(activeSegmentField);

    if (current && current !== prev) {
         // Scroll the *start* of the segment into view
         // utilize 'nearest' to avoid jumping if already visible
         update.view.dispatch({
             effects: EditorView.scrollIntoView(current.from, { y: 'center' })
         });
    }
});

export const narratorHighlighter: Extension = [
    activeSegmentField,
    narratorPlugin,
    scrollListener
];
