import { StateField, StateEffect } from '@codemirror/state';
import { EditorView, Decoration, DecorationSet } from '@codemirror/view';

// 🟢 EFFECTS: Signal to add/clear decorations
// Payload: Array of regions to paint { from, to, level }
export type DriftMarker = {
    from: number;
    to: number;
    level: 'high' | 'low'; // high = red, low = green
};

export const setDriftMarkers = StateEffect.define<DriftMarker[]>();

// 🟢 DECORATIONS: The visual representation
const driftHighDecoration = Decoration.line({
    attributes: { class: 'cm-drift-high' }
});

const driftLowDecoration = Decoration.line({
    attributes: { class: 'cm-drift-low' }
});

// 🟢 STATE FIELD: Manages the decorations
export const driftField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, transaction) {
        decorations = decorations.map(transaction.changes);

        for (let effect of transaction.effects) {
            if (effect.is(setDriftMarkers)) {
                const markers = effect.value;
                if (markers.length === 0) {
                    return Decoration.none;
                }

                const builder = [];
                for (let marker of markers) {
                    const deco = marker.level === 'high' ? driftHighDecoration : driftLowDecoration;
                    // We just decorate the line at the start position
                    // CodeMirror's Decoration.line() applies to the whole line containing the position
                    builder.push(deco.range(marker.from));
                }
                // Sort ranges (required by CodeMirror)
                builder.sort((a, b) => a.from - b.from);
                decorations = Decoration.set(builder);
            }
        }
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

export const driftExtension = [
    driftField
];
