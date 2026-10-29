// Oct 2026: la Imprenta de MyWorld. Compone el libro (capítulos, portada, índice) con el diseño que
// elige el autor y lo exporta a PDF (impresión del navegador con @page), EPUB y Word (.docx).
import { marked } from 'marked';
import { zipStore } from './zip';

export type PageSize = 'a5' | '6x9' | '5.5x8.5' | 'carta' | 'a4';
export interface Design {
    template: string;
    page: PageSize;
    bodyFont: string;
    headFont: string;
    size: number;            // pt
    leading: number;         // interlineado
    margin: 'estrecho' | 'normal' | 'amplio';
    justify: boolean;
    indent: boolean;         // sangría de primera línea (si no, párrafos separados)
    dropCap: boolean;
    chapterStyle: 'numero-titulo' | 'titulo' | 'numero';
    chapterWord: string;     // «Capítulo»
    sceneBreak: string;      // símbolo entre escenas
    pageNumbers: boolean;
    runningHead: boolean;
    cover: boolean;
    toc: boolean;
    useFileName: boolean;    // si el archivo no trae título (#), usar su nombre
}
export interface BookMeta { title: string; subtitle?: string; author: string; dedication?: string }
export interface Chapter { title: string; html: string }

export const FONTS: { name: string; css: string; kind: 'serif' | 'sans' | 'mono' | 'display' }[] = [
    { name: 'EB Garamond', css: 'EB+Garamond:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Cormorant Garamond', css: 'Cormorant+Garamond:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Crimson Pro', css: 'Crimson+Pro:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Libre Baskerville', css: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400', kind: 'serif' },
    { name: 'Lora', css: 'Lora:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Literata', css: 'Literata:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Source Serif 4', css: 'Source+Serif+4:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Spectral', css: 'Spectral:ital,wght@0,400;0,600;1,400', kind: 'serif' },
    { name: 'Alegreya', css: 'Alegreya:ital,wght@0,400;0,700;1,400', kind: 'serif' },
    { name: 'Merriweather', css: 'Merriweather:ital,wght@0,400;0,700;1,400', kind: 'serif' },
    { name: 'Cinzel', css: 'Cinzel:wght@400;600', kind: 'display' },
    { name: 'Playfair Display', css: 'Playfair+Display:ital,wght@0,400;0,700;1,400', kind: 'display' },
    { name: 'Josefin Sans', css: 'Josefin+Sans:wght@300;400;600', kind: 'sans' },
    { name: 'Montserrat', css: 'Montserrat:wght@400;600', kind: 'sans' },
    { name: 'Courier Prime', css: 'Courier+Prime:ital,wght@0,400;0,700;1,400', kind: 'mono' },
];

export const PAGES: Record<PageSize, { label: string; w: string; h: string; twW: number; twH: number }> = {
    'a5': { label: 'A5 (148 × 210 mm)', w: '148mm', h: '210mm', twW: 8391, twH: 11906 },
    '6x9': { label: '6 × 9 in (novela, KDP)', w: '6in', h: '9in', twW: 8640, twH: 12960 },
    '5.5x8.5': { label: '5,5 × 8,5 in (bolsillo)', w: '5.5in', h: '8.5in', twW: 7920, twH: 12240 },
    'carta': { label: 'Carta (8,5 × 11 in)', w: '8.5in', h: '11in', twW: 12240, twH: 15840 },
    'a4': { label: 'A4 (210 × 297 mm)', w: '210mm', h: '297mm', twW: 11906, twH: 16838 },
};
const MARGINS: Record<Design['margin'], { top: number; outer: number; bottom: number; inner: number }> = { // en mm
    estrecho: { top: 14, outer: 13, bottom: 16, inner: 16 },
    normal: { top: 18, outer: 16, bottom: 20, inner: 20 },
    amplio: { top: 25, outer: 22, bottom: 25, inner: 25 },
};

export const TEMPLATES: Record<string, { label: string; hint: string; design: Partial<Design> }> = {
    clasico: { label: 'Clásico', hint: 'Novela tradicional: Garamond, sangría, capitular', design: { bodyFont: 'EB Garamond', headFont: 'EB Garamond', size: 11.5, leading: 1.4, justify: true, indent: true, dropCap: true, chapterStyle: 'numero-titulo', sceneBreak: '⁂', page: 'a5', margin: 'normal', pageNumbers: true, runningHead: true } },
    moderno: { label: 'Moderno', hint: 'Limpio y aireado: Literata con títulos sans', design: { bodyFont: 'Literata', headFont: 'Josefin Sans', size: 10.5, leading: 1.55, justify: false, indent: true, dropCap: false, chapterStyle: 'numero-titulo', sceneBreak: '✦', page: '6x9', margin: 'amplio', pageNumbers: true, runningHead: false } },
    fantasia: { label: 'Fantasía', hint: 'Épico: Cinzel en títulos, Crimson Pro, adornos', design: { bodyFont: 'Crimson Pro', headFont: 'Cinzel', size: 11.5, leading: 1.45, justify: true, indent: true, dropCap: true, chapterStyle: 'numero-titulo', sceneBreak: '❦', page: '6x9', margin: 'normal', pageNumbers: true, runningHead: true } },
    ligera: { label: 'Novela ligera', hint: 'Ágil y legible: Lora, párrafos separados', design: { bodyFont: 'Lora', headFont: 'Montserrat', size: 10.5, leading: 1.5, justify: false, indent: false, dropCap: false, chapterStyle: 'numero-titulo', sceneBreak: '◆', page: '5.5x8.5', margin: 'normal', pageNumbers: true, runningHead: false } },
    manuscrito: { label: 'Manuscrito para editoriales', hint: 'Formato estándar: Courier 12, doble espacio, carta', design: { bodyFont: 'Courier Prime', headFont: 'Courier Prime', size: 12, leading: 2, justify: false, indent: true, dropCap: false, chapterStyle: 'numero-titulo', sceneBreak: '#', page: 'carta', margin: 'amplio', pageNumbers: true, runningHead: true } },
};

export const DEFAULT_DESIGN: Design = {
    template: 'clasico', page: 'a5', bodyFont: 'EB Garamond', headFont: 'EB Garamond', size: 11.5, leading: 1.4, margin: 'normal',
    justify: true, indent: true, dropCap: true, chapterStyle: 'numero-titulo', chapterWord: 'Capítulo', sceneBreak: '⁂',
    pageNumbers: true, runningHead: true, cover: true, toc: true, useFileName: true,
};

const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Limpia la sintaxis de Obsidian y el frontmatter. */
export function cleanMarkdown(raw: string): string {
    let s = String(raw || '').replace(/\r\n/g, '\n');
    s = s.replace(/^---\n[\s\S]*?\n---\n?/, '');
    s = s.replace(/%%[\s\S]*?%%/g, '');                       // comentarios
    s = s.replace(/!\[\[[^\]]*\]\]/g, '');                     // incrustados
    s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, '$1');
    s = s.replace(/==([^=\n]+)==/g, '$1');                       // resaltado
    s = s.replace(/^\s*>\s*\[!\w+\][^\n]*\n?/gm, '');          // encabezados de callouts
    return s.trim();
}

const prettyName = (name: string) => name.replace(/\.md$/i, '').replace(/^\s*\d+\s*[-._)]\s*/, '').trim();

export function toChapters(files: { name: string; content: string }[], d: Design): Chapter[] {
    return files.map(f => {
        let md = cleanMarkdown(f.content);
        let title = '';
        const m = md.match(/^#\s+(.+)\n?/);
        if (m) { title = m[1].trim(); md = md.slice(m[0].length); }
        else if (d.useFileName) title = prettyName(f.name);
        // Separadores de escena: ***, * * *, ---, ___ o # solos en su línea
        md = md.replace(/^\s*(\*\s*\*\s*\*|-{3,}|_{3,}|#{1,3})\s*$/gm, '\n<p class="scene-break">§§SCENE§§</p>\n');
        const html = String(marked.parse(md, { gfm: true, breaks: false, async: false }))
            .replace(/<hr\s*\/?>/g, '<p class="scene-break">§§SCENE§§</p>');
        return { title, html };
    });
}

function chapterHeading(c: Chapter, i: number, d: Design): string {
    const num = `${esc(d.chapterWord)} ${i + 1}`;
    if (d.chapterStyle === 'numero') return `<p class="ch-num">${num}</p>`;
    if (d.chapterStyle === 'titulo') return c.title ? `<h1 class="ch-title">${esc(c.title)}</h1>` : `<p class="ch-num">${num}</p>`;
    return `<p class="ch-num">${num}</p>${c.title ? `<h1 class="ch-title">${esc(c.title)}</h1>` : ''}`;
}

export function bookCss(d: Design, meta: BookMeta): string {
    const p = PAGES[d.page], m = MARGINS[d.margin];
    const head = `'${d.headFont}', '${d.bodyFont}', serif`;
    const body = `'${d.bodyFont}', ${d.bodyFont === 'Courier Prime' ? 'monospace' : 'serif'}`;
    const runTitle = esc(meta.title).replace(/"/g, '\\"');
    return `
@page { size: ${p.w} ${p.h}; margin: ${m.top}mm ${m.outer}mm ${m.bottom}mm ${m.inner}mm;
  ${d.pageNumbers ? `@bottom-center { content: counter(page); font-family: ${body}; font-size: ${d.size - 2}pt; color: #444; }` : ''}
  ${d.runningHead ? `@top-center { content: "${runTitle}"; font-family: ${head}; font-size: ${d.size - 3}pt; letter-spacing: .12em; text-transform: uppercase; color: #666; }` : ''} }
@page :left { margin-left: ${m.outer}mm; margin-right: ${m.inner}mm; }
@page :right { margin-left: ${m.inner}mm; margin-right: ${m.outer}mm; }
@page front { @bottom-center { content: none; } @top-center { content: none; } }
@page chapterstart { @top-center { content: none; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${body}; font-size: ${d.size}pt; line-height: ${d.leading}; color: #111; hyphens: auto; -webkit-hyphens: auto; }
.front { page: front; break-after: page; }
.cover { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; min-height: 70vh; }
.cover h1 { font-family: ${head}; font-weight: 600; font-size: ${(d.size * 2.6).toFixed(1)}pt; line-height: 1.1; margin: 0 0 .4em; }
.cover .sub { font-style: italic; font-size: ${(d.size * 1.3).toFixed(1)}pt; margin: 0 0 3em; color: #333; }
.cover .author { font-family: ${head}; letter-spacing: .14em; text-transform: uppercase; font-size: ${(d.size * 1.05).toFixed(1)}pt; }
.dedication { text-align: center; font-style: italic; padding-top: 30%; }
.toc h2 { font-family: ${head}; text-align: center; font-weight: 600; letter-spacing: .1em; margin: 2em 0 1.5em; }
.toc ol { list-style: none; padding: 0; margin: 0; }
.toc li { margin: .35em 0; display: flex; gap: .6em; }
.toc .n { color: #666; min-width: 2.5em; }
.toc a { color: inherit; text-decoration: none; }
.chapter { break-before: page; page: chapterstart; }
.ch-head { text-align: center; padding-top: ${d.page === 'carta' || d.page === 'a4' ? 18 : 22}%; margin-bottom: 2.4em; }
.ch-num { font-family: ${head}; font-size: ${(d.size * 0.95).toFixed(1)}pt; letter-spacing: .22em; text-transform: uppercase; color: #555; margin: 0 0 .6em; text-indent: 0 !important; }
.ch-title { font-family: ${head}; font-weight: 600; font-size: ${(d.size * 1.9).toFixed(1)}pt; line-height: 1.15; margin: 0; }
.chapter p { margin: 0 0 ${d.indent ? 0 : 0.8}em; text-align: ${d.justify ? 'justify' : 'left'}; orphans: 2; widows: 2; }
${d.indent ? `.chapter p + p { text-indent: 1.4em; }` : ''}
.chapter .body > p:first-child { text-indent: 0; }
${d.dropCap ? `.chapter .body > p:first-child::first-letter { float: left; font-family: ${head}; font-size: ${(d.leading * 3.1).toFixed(2)}em; line-height: .82; padding: .06em .08em 0 0; }` : ''}
.chapter h1, .chapter h2, .chapter h3 { font-family: ${head}; font-weight: 600; text-align: center; margin: 1.6em 0 .8em; break-after: avoid; }
.chapter h1 { font-size: 1.4em; } .chapter h2 { font-size: 1.2em; } .chapter h3 { font-size: 1.05em; }
.chapter blockquote { margin: 1em 1.6em; font-style: italic; }
.chapter ul, .chapter ol { margin: .6em 0 .6em 1.4em; }
p.scene-break { text-align: center !important; text-indent: 0 !important; margin: 1em 0 !important; letter-spacing: .5em; color: #444; }
p.scene-break + p { text-indent: 0 !important; }
img { max-width: 100%; }
@media screen {
  html { background: #2a2a2e; }
  body { padding: 28px 0 60px; }
  .sheet { width: ${p.w}; max-width: calc(100% - 32px); margin: 0 auto 22px; background: #fffdf8; box-shadow: 0 4px 24px rgba(0,0,0,.35); padding: ${m.top}mm ${m.outer}mm ${m.bottom}mm ${m.inner}mm; min-height: ${p.h}; }
  .front.sheet { display: flex; flex-direction: column; justify-content: center; }
}
@media print { .sheet { padding: 0; } }`;
}

export function bookHtml(chapters: Chapter[], d: Design, meta: BookMeta): string {
    const fonts = Array.from(new Set([d.bodyFont, d.headFont])).map(n => FONTS.find(f => f.name === n)?.css).filter(Boolean).map(c => `family=${c}`).join('&');
    const scene = esc(d.sceneBreak || '⁂');
    const parts: string[] = [];
    if (d.cover) parts.push(`<section class="front sheet"><div class="cover"><h1>${esc(meta.title)}</h1>${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}<p class="author">${esc(meta.author)}</p></div></section>`);
    if (meta.dedication?.trim()) parts.push(`<section class="front sheet"><p class="dedication">${esc(meta.dedication).replace(/\n/g, '<br>')}</p></section>`);
    if (d.toc && chapters.length > 1) {
        parts.push(`<section class="front sheet toc"><h2>Índice</h2><ol>${chapters.map((c, i) => `<li><span class="n">${i + 1}</span><a href="#cap-${i + 1}">${esc(c.title || `${d.chapterWord} ${i + 1}`)}</a></li>`).join('')}</ol></section>`);
    }
    chapters.forEach((c, i) => {
        parts.push(`<section class="chapter sheet" id="cap-${i + 1}"><header class="ch-head">${chapterHeading(c, i, d)}</header><div class="body">${c.html.replace(/§§SCENE§§/g, scene)}</div></section>`);
    });
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(meta.title)}</title>
${fonts ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">` : ''}
<style>${bookCss(d, meta)}</style></head><body>${parts.join('\n')}</body></html>`;
}

// ── EPUB 3 ──────────────────────────────────────────────────────────────
function toXhtml(html: string): string {
    const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
    const ser = new XMLSerializer();
    return Array.from(doc.body.childNodes).map(n => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
}
const xhtmlPage = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es" xml:lang="es">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="estilo.css"/></head>
<body>${body}</body></html>`;

export function buildEpub(chapters: Chapter[], d: Design, meta: BookMeta): Blob {
    const id = `urn:uuid:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`;
    const scene = esc(d.sceneBreak || '⁂');
    const css = `body{font-family:'${d.bodyFont}',serif;line-height:${Math.min(d.leading, 1.6)};margin:0 4%;}
h1,h2,h3,.ch-num{font-family:'${d.headFont}','${d.bodyFont}',serif;text-align:center;}
.ch-head{margin:3em 0 2em;} .ch-num{letter-spacing:.2em;text-transform:uppercase;font-size:.9em;color:#555;margin:0 0 .5em;}
.ch-title{font-size:1.6em;margin:0;}
p{margin:0 0 ${d.indent ? 0 : .8}em;text-align:${d.justify ? 'justify' : 'left'};}
${d.indent ? 'p+p{text-indent:1.4em;}' : ''} .body>p:first-child{text-indent:0;}
p.scene-break{text-align:center;text-indent:0;margin:1em 0;letter-spacing:.5em;}
.cover{text-align:center;margin-top:30%;} .cover h1{font-size:2.2em;margin:0 0 .4em;} .cover .sub{font-style:italic;} .cover .author{letter-spacing:.14em;text-transform:uppercase;margin-top:2em;}
.dedication{text-align:center;font-style:italic;margin-top:30%;}`;
    const files: { name: string; data: string }[] = [{ name: 'mimetype', data: 'application/epub+zip' }];
    files.push({ name: 'META-INF/container.xml', data: `<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` });
    files.push({ name: 'OEBPS/estilo.css', data: css });
    const items: { id: string; href: string; title: string }[] = [];
    items.push({ id: 'portada', href: 'portada.xhtml', title: 'Portada' });
    files.push({ name: 'OEBPS/portada.xhtml', data: xhtmlPage(meta.title, `<div class="cover"><h1>${esc(meta.title)}</h1>${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}<p class="author">${esc(meta.author)}</p></div>`) });
    if (meta.dedication?.trim()) {
        items.push({ id: 'dedicatoria', href: 'dedicatoria.xhtml', title: 'Dedicatoria' });
        files.push({ name: 'OEBPS/dedicatoria.xhtml', data: xhtmlPage('Dedicatoria', `<p class="dedication">${esc(meta.dedication).replace(/\n/g, '<br/>')}</p>`) });
    }
    chapters.forEach((c, i) => {
        const t = c.title || `${d.chapterWord} ${i + 1}`;
        const href = `cap${String(i + 1).padStart(3, '0')}.xhtml`;
        items.push({ id: `cap${i + 1}`, href, title: t });
        files.push({ name: `OEBPS/${href}`, data: xhtmlPage(t, `<section epub:type="chapter"><header class="ch-head">${toXhtml(chapterHeading(c, i, d))}</header><div class="body">${toXhtml(c.html.replace(/§§SCENE§§/g, scene))}</div></section>`) });
    });
    const navList = items.filter(it => it.id.startsWith('cap')).map(it => `<li><a href="${it.href}">${esc(it.title)}</a></li>`).join('');
    files.push({ name: 'OEBPS/nav.xhtml', data: xhtmlPage('Índice', `<nav epub:type="toc" id="toc"><h1>Índice</h1><ol>${navList}</ol></nav>`) });
    files.push({ name: 'OEBPS/toc.ncx', data: `<?xml version="1.0" encoding="UTF-8"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head><docTitle><text>${esc(meta.title)}</text></docTitle><navMap>${items.map((it, k) => `<navPoint id="np${k}" playOrder="${k + 1}"><navLabel><text>${esc(it.title)}</text></navLabel><content src="${it.href}"/></navPoint>`).join('')}</navMap></ncx>` });
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push({ name: 'OEBPS/content.opf', data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="es">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.author)}</dc:creator><dc:language>es</dc:language><meta property="dcterms:modified">${modified}</meta></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="estilo.css" media-type="text/css"/>${items.map(it => `<item id="${it.id}" href="${it.href}" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine toc="ncx">${items.map(it => `<itemref idref="${it.id}"/>`).join('')}</spine></package>` });
    return new Blob([zipStore(files)], { type: 'application/epub+zip' });
}

// ── Word (.docx) ────────────────────────────────────────────────────────
const xe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function runsOf(node: Node, fmt: { b?: boolean; i?: boolean } = {}): string {
    let out = '';
    node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) {
            const t = (ch.textContent || '').replace(/\s+/g, ' ');
            if (t) out += `<w:r>${fmt.b || fmt.i ? `<w:rPr>${fmt.b ? '<w:b/>' : ''}${fmt.i ? '<w:i/>' : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;
        } else if (ch.nodeType === 1) {
            const tag = (ch as Element).tagName.toLowerCase();
            if (tag === 'br') out += '<w:r><w:br/></w:r>';
            else out += runsOf(ch, { b: fmt.b || tag === 'strong' || tag === 'b', i: fmt.i || tag === 'em' || tag === 'i' });
        }
    });
    return out;
}
const para = (style: string, runs: string, extra = '') => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${extra}</w:pPr>${runs}</w:p>`;
const textRun = (t: string) => `<w:r><w:t xml:space="preserve">${xe(t)}</w:t></w:r>`;

function blocksToDocx(html: string, scene: string): string {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    const out: string[] = [];
    let first = true;
    const walk = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'p') {
            if (el.classList.contains('scene-break')) { out.push(para('Escena', textRun(scene))); first = true; return; }
            out.push(para(first ? 'PrimerParrafo' : 'Normal', runsOf(el))); first = false;
        } else if (/^h[1-3]$/.test(tag)) { out.push(para('Seccion', runsOf(el))); first = true; }
        else if (tag === 'blockquote') { el.querySelectorAll('p').forEach(p => out.push(para('Cita', runsOf(p)))); }
        else if (tag === 'ul' || tag === 'ol') { Array.from(el.children).forEach((li, k) => out.push(para('Normal', textRun(tag === 'ol' ? `${k + 1}. ` : '• ') + runsOf(li)))); }
        else if (tag === 'hr') { out.push(para('Escena', textRun(scene))); first = true; }
        else Array.from(el.children).forEach(walk);
    };
    Array.from(doc.body.children).forEach(walk);
    return out.join('');
}

export function buildDocx(chapters: Chapter[], d: Design, meta: BookMeta): Blob {
    const p = PAGES[d.page], m = MARGINS[d.margin];
    const mm = (v: number) => Math.round(v * 56.7);
    const scene = d.sceneBreak || '⁂';
    const body: string[] = [];
    if (d.cover) {
        body.push(para('Portada', textRun(meta.title), '<w:spacing w:before="3600"/>'));
        if (meta.subtitle) body.push(para('Subtitulo', textRun(meta.subtitle)));
        body.push(para('Autor', textRun(meta.author)));
    }
    if (meta.dedication?.trim()) body.push(para('Dedicatoria', textRun(meta.dedication), '<w:pageBreakBefore/>'));
    chapters.forEach((c, i) => {
        const num = `${d.chapterWord} ${i + 1}`;
        const heads: string[] = [];
        const first = i > 0 || d.cover || !!meta.dedication?.trim();
        if (d.chapterStyle !== 'titulo' || !c.title) heads.push(para('NumeroCapitulo', textRun(num), first ? '<w:pageBreakBefore/>' : ''));
        if (d.chapterStyle !== 'numero' && c.title) heads.push(para('Heading1', textRun(c.title), heads.length || !first ? '' : '<w:pageBreakBefore/>'));
        body.push(...heads, blocksToDocx(c.html.replace(/§§SCENE§§/g, scene), scene));
    });
    const half = Math.round(d.size * 2);
    const line = Math.round(240 * d.leading);
    const jc = d.justify ? 'both' : 'left';
    const font = (n: string) => `<w:rFonts w:ascii="${n}" w:hAnsi="${n}" w:cs="${n}" w:eastAsia="${n}"/>`;
    const style = (id: string, name: string, ppr: string, rpr: string) =>
        `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${font(d.bodyFont)}<w:sz w:val="${half}"/><w:szCs w:val="${half}"/><w:lang w:val="es-ES"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="${d.indent ? 0 : 160}" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:jc w:val="${jc}"/>${d.indent ? '<w:ind w:firstLine="397"/>' : ''}<w:widowControl/></w:pPr></w:style>
${style('PrimerParrafo', 'Primer párrafo', `<w:jc w:val="${jc}"/><w:ind w:firstLine="0"/>`, '')}
${style('Heading1', 'heading 1', '<w:jc w:val="center"/><w:spacing w:before="0" w:after="720"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="0"/><w:keepNext/>', `${font(d.headFont)}<w:b/><w:sz w:val="${Math.round(half * 1.8)}"/>`)}
${style('NumeroCapitulo', 'Número de capítulo', '<w:jc w:val="center"/><w:spacing w:before="2400" w:after="240"/><w:ind w:firstLine="0"/><w:keepNext/>', `${font(d.headFont)}<w:caps/><w:spacing w:val="40"/><w:color w:val="555555"/>`)}
${style('Seccion', 'Sección', '<w:jc w:val="center"/><w:spacing w:before="360" w:after="240"/><w:ind w:firstLine="0"/><w:keepNext/>', `${font(d.headFont)}<w:b/>`)}
${style('Escena', 'Separador de escena', '<w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/><w:ind w:firstLine="0"/>', '')}
${style('Cita', 'Cita', '<w:ind w:left="567" w:right="567" w:firstLine="0"/>', '<w:i/>')}
${style('Portada', 'Título del libro', '<w:jc w:val="center"/><w:spacing w:after="240"/><w:ind w:firstLine="0"/>', `${font(d.headFont)}<w:b/><w:sz w:val="${Math.round(half * 2.6)}"/>`)}
${style('Subtitulo', 'Subtítulo', '<w:jc w:val="center"/><w:spacing w:after="1200"/><w:ind w:firstLine="0"/>', '<w:i/>')}
${style('Autor', 'Autor', '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', `${font(d.headFont)}<w:caps/><w:spacing w:val="30"/>`)}
${style('Dedicatoria', 'Dedicatoria', '<w:jc w:val="center"/><w:spacing w:before="3600"/><w:ind w:firstLine="0"/>', '<w:i/>')}
${style('PiePagina', 'Pie de página', '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', `<w:sz w:val="${Math.max(16, half - 4)}"/>`)}
</w:styles>`;
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="PiePagina"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const sect = `<w:sectPr>${d.pageNumbers ? '<w:footerReference w:type="default" r:id="rIdFooter"/>' : ''}<w:pgSz w:w="${p.twW}" w:h="${p.twH}"/><w:pgMar w:top="${mm(m.top)}" w:right="${mm(m.outer)}" w:bottom="${mm(m.bottom)}" w:left="${mm(m.inner)}" w:header="567" w:footer="567" w:gutter="0"/>${d.cover ? '<w:titlePg/>' : ''}</w:sectPr>`;
    const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}${sect}</w:body></w:document>`;
    const files = [
        { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
        { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
        { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xe(meta.title)}</dc:title><dc:creator>${xe(meta.author)}</dc:creator></cp:coreProperties>` },
        { name: 'word/_rels/document.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>` },
        { name: 'word/document.xml', data: document },
        { name: 'word/styles.xml', data: styles },
        { name: 'word/footer1.xml', data: footer },
    ];
    return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
