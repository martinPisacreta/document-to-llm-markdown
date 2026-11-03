import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extractHtml } from '../src/html.mjs';

const fixture = await readFile(new URL('./fixtures/article.html', import.meta.url), 'utf8');
const url = 'https://example.com/articles/sample';

test('Markdown retains article structure and resolves relative links', () => {
    const result = extractHtml(fixture, { url, format: 'markdown' });
    assert.match(result.title, /Document extraction guide/);
    assert.match(result.content, /## Practical steps/);
    assert.match(result.content, /- Read the source document\./);
    assert.match(result.content, /\[complete guide\]\(https:\/\/example\.com\/guide\)/);
    assert.match(result.content, /const answer = 42;/);
    assert.doesNotMatch(result.content, /MENU_SENTINEL|FOOTER_SENTINEL|EXECUTION_SENTINEL|javascript:/);
});

test('plain text preserves paragraph boundaries without Markdown syntax', () => {
    const result = extractHtml(fixture, { url, format: 'text' });
    assert.match(result.content, /Practical steps/);
    assert.match(result.content, /\n\n/);
    assert.doesNotMatch(result.content, /MENU_SENTINEL|FOOTER_SENTINEL|EXECUTION_SENTINEL|<script|\[complete guide\]/);
});

test('short pages still return their static content', () => {
    const result = extractHtml('<title>Short page</title><main><p>Hello reader.</p></main>', { url, format: 'text' });
    assert.equal(result.title, 'Short page');
    assert.match(result.content, /Hello reader\./);
});

test('invalid extraction options are rejected', () => {
    assert.throws(() => extractHtml(fixture, { url: 'http://example.com' }), TypeError);
    assert.throws(() => extractHtml(fixture, { url, format: 'html' }), TypeError);
});

test('ordered and nested lists use compact markers', () => {
    const html = '<title>Lists</title><main><ol start="3"><li>Third step</li><li>Fourth step<ul><li>Nested note</li></ul></li></ol></main>';
    const result = extractHtml(html, { url, format: 'markdown' });
    assert.match(result.content, /^3\. Third step$/m);
    assert.match(result.content, /^4\. Fourth step$/m);
    assert.match(result.content, /^ {3}- Nested note$/m);
});
