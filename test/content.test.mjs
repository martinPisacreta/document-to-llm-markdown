import test from 'node:test';
import assert from 'node:assert/strict';
import { boundContent, normalizeText } from '../src/content.mjs';

 test('Unicode truncation keeps complete characters and reports original length', () => {
    const result = boundContent({ title: ' Example ', content: 'A😀BC' }, 2);
    assert.equal(result.title, 'Example');
    assert.equal(result.content, 'A😀');
    assert.equal(result.fullTextCharacters, 4);
    assert.equal(result.outputCharacters, 2);
    assert.equal(result.textTruncated, true);
    assert.equal(result.warnings.length, 1);
});

test('the character budget is shared across all PDF pages', () => {
    const result = boundContent({ pages: ['abcd', '', 'efgh', 'ij'] }, 6);
    assert.deepEqual(result.pages.map(page => page.content), ['abcd', '', 'ef', '']);
    assert.deepEqual(result.pages.map(page => page.pageNumber), [1, 2, 3, 4]);
    assert.deepEqual(result.pages.map(page => page.textTruncated), [false, false, true, true]);
    assert.equal(result.pageCount, 4);
    assert.equal(result.fullTextCharacters, 10);
    assert.equal(result.outputCharacters, 6);
    assert.equal(result.textTruncated, true);
});

test('exact limits and empty pages are not reported as truncated', () => {
    const exact = boundContent({ content: 'abc' }, 3);
    assert.equal(exact.textTruncated, false);
    assert.deepEqual(exact.warnings, []);
    const empty = boundContent({ pages: ['', ''] }, 3);
    assert.equal(empty.pageCount, 2);
    assert.equal(empty.outputCharacters, 0);
    assert.equal(empty.textTruncated, false);
});

test('invalid limits and malformed extraction results are rejected', () => {
    for (const limit of [0, -1, 1.5, 200001, NaN, '20', null]) {
        assert.throws(() => boundContent({ content: 'abc' }, limit), TypeError);
    }
    assert.throws(() => boundContent({ pages: ['ok', null] }), TypeError);
    assert.throws(() => boundContent({}), TypeError);
});

test('text normalization preserves paragraph boundaries', () => {
    assert.equal(normalizeText('  First\tline\r\n\r\n\r\n Second\u00a0line  '), 'First line\n\nSecond line');
});
