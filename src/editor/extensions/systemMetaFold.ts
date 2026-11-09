// Nov 2026: los metadatos del sistema no son parte del texto del autor.
// Archivos creados con la ficha antigua abrían con 15 líneas de YAML (`_sys`, `nexus_id`, `tier: ANCHOR`…)
// y líneas «> **Role**: Tool Generated» / «> **Traits**: [TEMPORAL]». Se siguen guardando tal cual en Drive
// (otras herramientas los leen), pero en el editor quedan plegados detrás de una etiqueta discreta.
import { EditorState, StateField, RangeSetBuilder } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';

class MetaWidget extends WidgetType {
    constructor(readonly label: string) { super(); }
    eq(other: MetaWidget) { return other.label === this.label; }
    toDOM() {
        const el = document.createElement('div');
        el.className = 'cm-system-meta';
        el.textContent = this.label;
        el.setAttribute('aria-hidden', 'true');
        el.title = 'Datos que MyWorld usa para ordenar tu proyecto. No son parte de tu texto y no salen en el libro.';
        return el;
    }
    ignoreEvent() { return true; }
}

const JUNK_LINE = /^>\s*\*\*(Role|Traits)\*\*:\s*(Tool Generated|\[[A-Z_ \]\[]+\]).*$/;

function build(state: EditorState): DecorationSet {
    const b = new RangeSetBuilder<Decoration>();
    const doc = state.doc;
    let pos = 0;
    // 1) Frontmatter YAML al inicio del archivo.
    if (doc.lines > 1 && doc.line(1).text.trim() === '---') {
        for (let n = 2; n <= Math.min(doc.lines, 80); n++) {
            if (doc.line(n).text.trim() === '---') {
                const end = doc.line(n).to;
                b.add(0, end, Decoration.replace({ widget: new MetaWidget('Datos del proyecto (ocultos)'), block: true }));
                pos = end;
                break;
            }
        }
    }
    // 2) Líneas generadas por la ficha antigua, en las primeras 20 líneas después del frontmatter.
    const startLine = doc.lineAt(Math.min(pos + 1, doc.length)).number;
    for (let n = startLine; n <= Math.min(doc.lines, startLine + 20); n++) {
        const line = doc.line(n);
        if (line.from < pos) continue;
        if (JUNK_LINE.test(line.text.trim())) b.add(line.from, line.to, Decoration.replace({}));
    }
    return b.finish();
}

const systemMetaFoldField = StateField.define<DecorationSet>({
    create: (s) => build(s),
    update: (deco, tr) => (tr.docChanged ? build(tr.state) : deco),
    provide: (f) => EditorView.decorations.from(f),
});

// atomicRanges: el cursor salta el bloque oculto en vez de entrar en él.
export const systemMetaFold = [
    systemMetaFoldField,
    EditorView.atomicRanges.of((view) => view.state.field(systemMetaFoldField, false) ?? Decoration.none),
];

export const systemMetaTheme = EditorView.baseTheme({
    '.cm-system-meta': {
        fontFamily: 'inherit',
        fontSize: '12px',
        opacity: '0.55',
        padding: '2px 0 10px',
        userSelect: 'none',
    },
});
