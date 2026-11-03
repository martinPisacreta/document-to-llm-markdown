import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentProcessor } from '../src/process.mjs';

const url = 'https://example.com/document';
const options = { format: 'markdown', maxChars: 3 };

test('HTML processing preserves provenance and merges extraction and truncation warnings', async () => {
    const process = createDocumentProcessor({
        fetchDocument: async () => ({ bytes: Buffer.from('<p>Hello</p>'), contentType: 'text/html', finalUrl: url + '/final' }),
        extractHtml: (html, settings) => {
            assert.equal(html, '<p>Hello</p>');
            assert.deepEqual(settings, { url: url + '/final', format: 'markdown' });
            return { title: 'Example', content: 'Hello', warnings: ['Extraction warning'] };
        },
        extractPdf: async () => { throw new Error('Unexpected PDF extraction'); },
    });
    const result = await process(url, options);
    assert.equal(result.url, url);
    assert.equal(result.finalUrl, url + '/final');
    assert.equal(result.documentType, 'html');
    assert.equal(result.status, 'success');
    assert.equal(result.content, 'Hel');
    assert.equal(result.fullTextCharacters, 5);
    assert.equal(result.warnings.length, 2);
});

test('PDF signature supports a generic MIME type and retains all pages', async () => {
    const process = createDocumentProcessor({
        fetchDocument: async () => ({ bytes: Buffer.from('%PDF-fixture'), contentType: 'application/octet-stream', finalUrl: url }),
        extractPdf: async () => ({ title: 'PDF', pages: ['First', '', 'Last'], warnings: ['No OCR'] }),
        extractHtml: () => { throw new Error('Unexpected HTML extraction'); },
    });
    const result = await process(url, options);
    assert.equal(result.documentType, 'pdf');
    assert.equal(result.pageCount, 3);
    assert.deepEqual(result.pages.map(page => page.content), ['Fir', '', '']);
    assert.equal(result.fullTextCharacters, 9);
    assert.equal(result.warnings.length, 2);
});

test('unsupported content types fail without invoking an extractor', async () => {
    const unexpected = () => { throw new Error('Extractor must not run'); };
    const process = createDocumentProcessor({
        fetchDocument: async () => ({ bytes: Buffer.from('image'), contentType: 'image/png', finalUrl: url }),
        extractHtml: unexpected, extractPdf: unexpected,
    });
    await assert.rejects(process(url, options), /Unsupported source content type/);
});
