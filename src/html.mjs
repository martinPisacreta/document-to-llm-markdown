import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { normalizeText } from './content.mjs';

/** Parse static HTML. Scripts and remote resources are never enabled. */
export function extractHtml(html, { url, format = 'markdown' } = {}) {
    if (typeof html !== 'string') throw new TypeError('html must be a string');
    if (!['markdown', 'text'].includes(format)) throw new TypeError('Unsupported format');
    const sourceUrl = new URL(url);
    if (sourceUrl.protocol !== 'https:') throw new TypeError('An HTTPS source URL is required');

    const dom = new JSDOM(html, { url: sourceUrl.href });
    try {
        const document = dom.window.document;
        const fallbackTitle = normalizeText(document.title);
        document.querySelectorAll('script, style, noscript, template, nav, header, footer, aside, form, button, iframe, object, embed, svg, canvas, [hidden], [aria-hidden="true"], [role="navigation"], [role="menu"]').forEach(node => node.remove());

        // Resolve links against the document URL, without retaining executable schemes.
        for (const anchor of document.querySelectorAll('a[href]')) {
            try {
                const target = new URL(anchor.getAttribute('href'), sourceUrl);
                if (!['https:', 'http:'].includes(target.protocol)) throw new Error();
                anchor.setAttribute('href', target.href);
            } catch {
                anchor.removeAttribute('href');
            }
        }
        for (const image of document.querySelectorAll('img')) {
            image.replaceWith(document.createTextNode(image.getAttribute('alt') || ''));
        }

        const article = new Readability(document.cloneNode(true)).parse();
        const warnings = [];
        const selected = article?.content;
        if (!selected) warnings.push('Main article detection failed; cleaned page content was used.');
        const fragment = document.createElement('div');
        fragment.innerHTML = selected || document.querySelector('main, article')?.innerHTML || document.body.innerHTML;

        // Add structural separators before extracting text; textContent alone joins paragraphs.
        let content;
        if (format === 'text') {
            fragment.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
            fragment.querySelectorAll('p, div, section, article, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr').forEach(node => node.append(document.createTextNode('\n\n')));
            content = normalizeText(fragment.textContent);
        } else {
            const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
            // Compact list markers ("- item", "1. item") use fewer tokens than Turndown's padded default.
            converter.addRule('compactListItem', {
                filter: 'li',
                replacement(itemContent, node) {
                    const parent = node.parentNode;
                    let prefix = '- ';
                    if (parent && parent.nodeName === 'OL') {
                        const start = Number(parent.getAttribute('start')) || 1;
                        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
                    }
                    const body = itemContent.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + ' '.repeat(prefix.length));
                    return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '');
                }
            });
            // Preserve Markdown indentation and code whitespace.
            content = converter.turndown(fragment.innerHTML).replace(/\r\n?/g, '\n').trim();
        }
        if (!content) warnings.push('No extractable static HTML text was found.');
        return { title: normalizeText(article?.title || fallbackTitle), content, warnings };
    } finally {
        dom.window.close();
    }
}
