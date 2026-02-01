import { ViewUpdate, ViewPlugin, DecorationSet, Decoration, WidgetType, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";

// 🟢 BULLET WIDGET
// Replaces list markers (-, *, +) with a clean bullet point
class BulletWidget extends WidgetType {
    toDOM() {
        const span = document.createElement("span");
        span.textContent = "•";
        // Inline styles to ensure stability without external CSS dependence
        span.style.fontWeight = "bold";
        span.style.color = "var(--color-text-primary)"; // Match theme
        span.style.marginRight = "0.5ch"; // Slight spacing
        return span;
    }
}

// 🟢 SYNTAX HIDING LOGIC
const hideSyntax = (view: EditorView) => {
    const builder = new RangeSetBuilder<Decoration>();
    const { state } = view;

    // Iterate over the visible ranges to avoid processing the whole doc
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(state).iterate({
            from,
            to,
            enter: (node) => {
                // 1. Target Nodes
                const type = node.type.name;
                const isHeader = type === "HeaderMark";
                const isEmphasis = type === "EmphasisMark"; // * or _
                const isLinkMark = type === "LinkMark"; // [ ] ( )
                const isUrl = type === "URL"; // The actual url text
                const isListMark = type === "ListMark"; // - * +

                if (!isHeader && !isEmphasis && !isLinkMark && !isUrl && !isListMark) {
                    return;
                }

                // 2. Collision Detection
                // Check if any cursor is overlapping with this node
                // We support multiple cursors, so check all ranges in selection
                let isOverlapping = false;
                for (const range of state.selection.ranges) {
                    // Logic: selection.from <= node.to && selection.to >= node.from
                    // This covers touching the edges too.
                    if (range.from <= node.to && range.to >= node.from) {
                        isOverlapping = true;
                        break;
                    }
                }

                // 3. Render Decision
                if (isOverlapping) {
                    // Reveal: Do nothing (let CM render text)
                    return;
                }

                // Hide: Apply Decoration
                if (isListMark) {
                    // Replace with Bullet Widget
                    builder.add(node.from, node.to, Decoration.replace({
                        widget: new BulletWidget()
                    }));
                } else {
                    // Collapse completely (Header #, Emphasis *, Link [], URL)
                    builder.add(node.from, node.to, Decoration.replace({}));
                }
            }
        });
    }

    return builder.finish();
};

// 🟢 VIEW PLUGIN
export const livePreview = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
            this.decorations = hideSyntax(view);
        }

        update(update: ViewUpdate) {
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
                this.decorations = hideSyntax(update.view);
            }
        }
    },
    {
        decorations: (v) => v.decorations
    }
);
