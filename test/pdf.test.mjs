import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractPdf } from '../src/pdf.mjs';
import { boundContent } from '../src/content.mjs';

const fixture = await readFile(new URL('./fixtures/three-pages.pdf', import.meta.url));

test('local PDF preserves page order, metadata and an empty page', async () => {
    const result = await extractPdf(fixture);
    assert.equal(result.title, 'Local PDF fixture');
    assert.equal(result.pages.length, 3);
    assert.match(result.pages[0], /First page: useful document text/);
    assert.match(result.pages[1], /Second page: another paragraph/);
    assert.equal(result.pages[2], '');
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /OCR is not included/);
});

test('PDF extraction connects to the document-wide character budget', async () => {
    const extracted = await extractPdf(fixture);
    const result = boundContent(extracted, 5);
    assert.equal(result.pageCount, 3);
    assert.equal(result.outputCharacters, 5);
    assert.equal(result.pages[0].content, 'First');
    assert.equal(result.pages[1].content, '');
    assert.equal(result.pages[1].textTruncated, true);
    assert.equal(result.pages[2].textTruncated, false);
    assert.equal(result.textTruncated, true);
});

test('malformed PDF bytes reject instead of returning a successful empty document', async () => {
    await assert.rejects(extractPdf(Buffer.from('This is not a PDF')));
    await assert.rejects(extractPdf(new Uint8Array()), TypeError);
});
