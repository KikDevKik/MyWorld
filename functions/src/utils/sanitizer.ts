import { JSDOM } from 'jsdom';

/**
 * Sanitizes HTML string by removing dangerous tags and attributes.
 * This is crucial before passing HTML to libraries like html-to-pdfmake
 * that might process tags in unexpected ways.
 *
 * @param html The raw HTML string
 * @returns The sanitized HTML string
 */
export function sanitizeHtml(html: string): string {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // 1. Remove dangerous tags
  const prohibitedTags = ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'form', 'input', 'button', 'svg', 'canvas'];
  prohibitedTags.forEach(tag => {
    const elements = doc.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  // 2. Strip dangerous attributes
  const allElements = doc.querySelectorAll('*');
  allElements.forEach(el => {
    // Attributes
    const attrs = el.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const name = attrs[i].name.toLowerCase();
      // Remove event handlers (on*)
      if (name.startsWith('on')) {
         el.removeAttribute(name);
      }
    }

    // Sanitize Hrefs and Srcs
    if (el.tagName === 'A') {
        const href = el.getAttribute('href');
        if (href && href.trim().toLowerCase().startsWith('javascript:')) {
            el.setAttribute('href', '#');
        }
    }

    // Note: We leave IMG tags, but html-to-pdfmake requires explicit handling to fetch them.
    // By default, pdfmake in Node won't fetch http images unless configured.
  });

  return doc.body.innerHTML;
}
