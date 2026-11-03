import { validateMaxChars } from './content.mjs';
import { publicHttpsUrl } from './network.mjs';

export const MAX_DOCUMENTS = 50;

/** Runtime validation also applies to API inputs that bypass the Console UI. */
export function parseInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new TypeError('Input must be an object containing url or urls');
    }
    const hasUrl = Object.hasOwn(input, 'url');
    const hasUrls = Object.hasOwn(input, 'urls');
    if (hasUrl === hasUrls) {
        throw new TypeError('Provide exactly one of url or urls');
    }
    const values = hasUrl ? [input.url] : input.urls;
    if (!Array.isArray(values) || values.length < 1 || values.length > MAX_DOCUMENTS) {
        throw new TypeError(`Provide between 1 and ${MAX_DOCUMENTS} document URLs`);
    }
    const urls = [...new Set(values.map(value => publicHttpsUrl(value).href))];
    const format = input.format === undefined ? 'markdown' : input.format;
    if (!['markdown', 'text'].includes(format)) {
        throw new TypeError('format must be markdown or text');
    }
    const maxChars = validateMaxChars(input.maxChars);
    return { urls, format, maxChars };
}
