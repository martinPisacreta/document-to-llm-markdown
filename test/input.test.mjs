import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInput } from '../src/input.mjs';

test('single URL receives defaults and loses its fragment', () => {
    assert.deepEqual(parseInput({ url: 'https://example.com/doc#part' }), {
        urls: ['https://example.com/doc'], format: 'markdown', maxChars: 20000,
    });
});

test('batch preserves order while deduplicating normalized URLs', () => {
    assert.deepEqual(parseInput({
        urls: ['https://example.com/a', 'https://example.com/a#section', 'https://example.com/b'],
        format: 'text', maxChars: 7,
    }), {
        urls: ['https://example.com/a', 'https://example.com/b'],
        format: 'text', maxChars: 7,
    });
});

test('invalid API inputs fail before document processing', () => {
    for (const input of [
        null, [], {},
        { url: 'https://example.com', urls: ['https://example.com'] },
        { urls: [] }, { urls: 'https://example.com' },
        { urls: Array(51).fill('https://example.com') },
        { url: null }, { url: 'http://example.com' },
        { url: 'https://user:secret@example.com' },
        { url: 'https://example.com', format: 'html' },
        { url: 'https://example.com', maxChars: null },
        { url: 'https://example.com', maxChars: 200001 },
    ]) assert.throws(() => parseInput(input), undefined, JSON.stringify(input));
});
